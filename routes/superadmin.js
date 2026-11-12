const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { supabase } = require('../config/supabase');
const planService = require('../services/planService');
const {
    PLAN_CODES,
    FEATURE_CATALOG,
    LIMIT_CATALOG
} = require('../config/plans');

const crearCodigoNegocio = () => crypto.randomBytes(4).toString('hex').toUpperCase();
const ID_RE = /^\d{1,19}$/;
const parseId = (value) => (ID_RE.test(String(value)) ? Number(value) : null);

router.get('/panel', async (req, res) => {
    try {
        const { data: restaurantes, error: restaurantesError } = await supabase
            .from('restaurantes')
            .select('*')
            .order('created_at', { ascending: false });

        if (restaurantesError) throw restaurantesError;

        const { data: usuarios, error: usuariosError } = await supabase
            .from('usuarios')
            .select('id, restaurante_id');

        if (usuariosError) throw usuariosError;

        const conteoUsuarios = new Map();
        (usuarios || []).forEach((usuario) => {
            conteoUsuarios.set(usuario.restaurante_id, (conteoUsuarios.get(usuario.restaurante_id) || 0) + 1);
        });

        await planService.loadCatalog();
        const ahora = new Date();
        const negocios = await Promise.all((restaurantes || []).map(async (restaurante) => {
            const plan = planService.getPlanSync(restaurante.plan);
            let uso = [];
            try {
                uso = await planService.getUsageSummary(restaurante.id, plan.codigo);
            } catch (usageError) {
                console.error(`No se pudo calcular el uso de ${restaurante.codigo_negocio}:`, usageError.message);
            }
            return {
                ...restaurante,
                plan: plan.codigo,
                plan_nombre: plan.nombre,
                plan_precio: plan.precio_mensual,
                plan_orden: plan.orden,
                total_usuarios: conteoUsuarios.get(restaurante.id) || 0,
                uso
            };
        }));

        const stats = {
            total: negocios.length,
            // Un negocio es activo SOLO si el estado es 'activo' Y la fecha no ha pasado
            activos: negocios.filter((n) => n.estado === 'activo' && (new Date(n.fecha_vencimiento) > ahora)).length,

            // Un negocio va al cuadro ROJO si el estado NO es 'activo' O si la fecha ya pasó
            vencidos: negocios.filter((n) => n.estado !== 'activo' || (new Date(n.fecha_vencimiento) <= ahora)).length,

            trials: negocios.filter((n) => n.plan === 'trial').length,
            planes: PLAN_CODES.reduce((acc, code) => {
                acc[code] = negocios.filter((n) => n.plan === code).length;
                return acc;
            }, {})
        };

        const planes = PLAN_CODES.map((code) => planService.getPlanSync(code));

        res.render('superadmin/admin_global', {
            stats,
            negocios,
            planes,
            featureCatalog: FEATURE_CATALOG,
            limitCatalog: LIMIT_CATALOG,
            planError: req.query.plan_error ? String(req.query.plan_error) : null,
            planChanged: req.query.plan_changed === 'true'
        });
    } catch (error) {
        console.error('❌ Error al cargar Panel Pro:', error.message);
        res.status(500).send('Error en el servidor');
    }
});

router.post('/registrar-negocio', async (req, res) => {
    const nombreComercial = String(req.body.nombre_comercial || '').trim();
    const pinFinal = String(req.body.pin_admin || '').trim();

    if (nombreComercial.length < 2 || nombreComercial.length > 100) {
        return res.status(400).send('El nombre comercial debe tener entre 2 y 100 caracteres.');
    }
    // No crear administradores con PIN conocido/default.
    if (!/^\d{6,12}$/.test(pinFinal)) {
        return res.status(400).send('El PIN administrador debe tener entre 6 y 12 dígitos.');
    }

    let restaurante = null;
    try {
        // === Licensing: default TRIAL ===
        const fechaInicio = new Date();
        const fechaVencimiento = new Date(fechaInicio);
        fechaVencimiento.setDate(fechaVencimiento.getDate() + getPlanDuracionDias('trial'));

        // Reintenta si el código aleatorio choca con el índice único.
        for (let intento = 0; intento < 5 && !restaurante; intento += 1) {
            const { data, error } = await supabase
                .from('restaurantes')
                .insert({
                    nombre_comercial: nombreComercial,
                    codigo_negocio: crearCodigoNegocio(),
                    plan: 'trial',
                    fecha_inicio: fechaInicio.toISOString(),
                    fecha_vencimiento: fechaVencimiento.toISOString(),
                    estado: 'activo'
                })
                .select('id, codigo_negocio, plan, fecha_vencimiento')
                .single();

            if (!error) {
                restaurante = data;
                break;
            }
            if (String(error.code) !== '23505') throw error;
        }

        if (!restaurante) throw new Error('No se pudo generar un código de negocio único.');

        const pinHasheado = await bcrypt.hash(pinFinal, 10);

        const { error: usuarioError } = await supabase
            .from('usuarios')
            .insert({
                restaurante_id: restaurante.id,
                nombre: 'Admin',
                rol: 'admin',
                pin_hash: pinHasheado,
                estado: 1
            });

        if (usuarioError) throw usuarioError;

        const mesasDefault = [];
        for (let i = 1; i <= 10; i += 1) {
            mesasDefault.push({
                restaurante_id: restaurante.id,
                numero: `Mesa ${i}`,
                descripcion: 'Area de comedor',
                estado: 'libre'
            });
        }

        mesasDefault.push({
            restaurante_id: restaurante.id,
            numero: 'PARA LLEVAR',
            descripcion: 'Pedidos en caja',
            estado: 'libre'
        });
        mesasDefault.push({
            restaurante_id: restaurante.id,
            numero: 'A DOMICILIO',
            descripcion: 'Pedidos delivery',
            estado: 'libre'
        });

        const { error: mesasError } = await supabase
            .from('mesas')
            .insert(mesasDefault);

        if (mesasError) throw mesasError;

        console.log(`🚀 Negocio creado: ${restaurante.codigo_negocio}`);
        res.redirect('/superadmin/panel?success=true');
    } catch (error) {
        // Rollback: no dejar tenants a medio crear.
        if (restaurante?.id) {
            try {
                await supabase.from('restaurantes').delete().eq('id', restaurante.id);
            } catch (rollbackError) {
                console.error('❌ No se pudo revertir el tenant parcial:', rollbackError.message);
            }
        }
        console.error('❌ Error en registro Pro:', error.message);
        res.status(500).send('Error al crear el negocio Pro');
    }
});

router.post('/editar-negocio', async (req, res) => {
    const idNegocio = parseId(req.body.id_negocio);
    const nuevoNombre = String(req.body.nuevo_nombre || '').trim();

    if (!idNegocio) return res.status(400).send('Negocio inválido.');
    if (nuevoNombre.length < 2 || nuevoNombre.length > 100) {
        return res.status(400).send('El nombre debe tener entre 2 y 100 caracteres.');
    }

    try {
        const { data, error } = await supabase
            .from('restaurantes')
            .update({ nombre_comercial: nuevoNombre })
            .eq('id', idNegocio)
            .select('id')
            .maybeSingle();

        if (error) throw error;
        if (!data) return res.status(404).send('Negocio no encontrado.');

        res.redirect('/superadmin/panel?edited=true');
    } catch (error) {
        console.error('❌ Error al editar:', error.message);
        res.status(500).send('Error al editar negocio');
    }
});

const getPlanDuracionDias = (plan) => {
    return Number(planService.getPlanSync(plan).duracion_dias) || 30;
};

const calcularNuevaFechaVencimiento = (fechaVencimientoActual, plan = 'basic') => {
    const base = fechaVencimientoActual && new Date(fechaVencimientoActual) > new Date()
        ? new Date(fechaVencimientoActual)
        : new Date();

    base.setDate(base.getDate() + getPlanDuracionDias(plan));
    return base;
};

async function registrarCambioPlan({ restauranteId, planAnterior, planNuevo, cambiadoPor, motivo, metadata }) {
    try {
        const { error } = await supabase
            .from('plan_change_log')
            .insert({
                restaurante_id: restauranteId,
                plan_anterior: planAnterior,
                plan_nuevo: planNuevo,
                cambiado_por: cambiadoPor || 'superadmin',
                motivo: motivo || 'panel_superadmin',
                metadata: metadata || {}
            });
        if (error && !/relation|schema cache/i.test(error.message || '')) {
            console.error('No se pudo registrar el cambio de plan:', error.message);
        }
    } catch (error) {
        if (!/relation|schema cache/i.test(error.message || '')) {
            console.error('No se pudo registrar el cambio de plan:', error.message);
        }
    }
}






router.post('/extender/:id', async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).send('Negocio inválido.');
    try {
        const { data: restaurante, error: getError } = await supabase
            .from('restaurantes')
            .select('fecha_vencimiento, plan')
            .eq('id', id)
            .single();


        if (getError) throw getError;

        const base = calcularNuevaFechaVencimiento(restaurante.fecha_vencimiento, restaurante.plan);

        const { error } = await supabase
            .from('restaurantes')
            .update({
                fecha_vencimiento: base.toISOString(),
                estado: 'activo'
            })

            .eq('id', id);

        if (error) throw error;

        res.redirect('/superadmin/panel?extended=true');
    } catch (error) {
        console.error('❌ Error al extender:', error.message);
        res.status(500).send('Error al extender suscripcion');
    }
});

router.post('/activar-plan/:id', async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).send('Negocio inválido.');

    const planSolicitado = String(req.body.plan || '').trim().toLowerCase();
    const planFinal = planSolicitado === 'pro_plus' ? 'gold' : planSolicitado;
    if (!PLAN_CODES.includes(planFinal)) {
        return res.status(400).send('Plan inválido');
    }

    try {
        const { data: actual, error: actualError } = await supabase
            .from('restaurantes')
            .select('id, nombre_comercial, plan')
            .eq('id', id)
            .maybeSingle();

        if (actualError) throw actualError;
        if (!actual) return res.status(404).send('Negocio no encontrado.');

        const planAnterior = planService.getPlanSync(actual.plan);
        const planNuevo = planService.getPlanSync(planFinal);

        // Siempre validamos los límites del plan destino. Esto cubre también
        // trial -> basic, donde el orden del plan sube pero los límites bajan.
        const violations = await planService.getDowngradeViolations(id, planNuevo.codigo);
        if (violations.length > 0) {
            const detalle = violations
                .map((item) => `${item.usage}/${item.limit} ${item.label}`)
                .join(', ');
            const message = `No se puede cambiar a ${planNuevo.nombre}: ${detalle}. Libera espacio o elimina registros primero.`;
            return res.redirect(`/superadmin/panel?plan_error=${encodeURIComponent(message)}`);
        }

        const fechaInicio = new Date();
        const fechaVencimiento = new Date(fechaInicio);
        fechaVencimiento.setDate(fechaVencimiento.getDate() + getPlanDuracionDias(planNuevo.codigo));

        const { error } = await supabase
            .from('restaurantes')
            .update({
                plan: planNuevo.codigo,
                fecha_inicio: fechaInicio.toISOString(),
                fecha_vencimiento: fechaVencimiento.toISOString(),
                estado: 'activo'
            })
            .eq('id', id);

        if (error) throw error;

        await registrarCambioPlan({
            restauranteId: id,
            planAnterior: planAnterior.codigo,
            planNuevo: planNuevo.codigo,
            cambiadoPor: req.superadminUser || 'superadmin',
            motivo: 'panel_superadmin',
            metadata: {
                negocio: actual.nombre_comercial,
                precio_mensual: planNuevo.precio_mensual
            }
        });

        res.redirect('/superadmin/panel?plan_changed=true');
    } catch (error) {
        console.error('Error al activar plan:', error.message);
        res.status(500).send('Error al activar plan');
    }
});

router.post('/toggle-estado/:id', async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).send('Negocio inválido.');
    const { estado_actual } = req.body;
    const nuevoEstado = estado_actual === 'activo' ? 'suspendido' : 'activo';


    try {
        const { error } = await supabase
            .from('restaurantes')
            .update({ estado: nuevoEstado })
            .eq('id', id);

        if (error) throw error;

        res.redirect('/superadmin/panel?status_changed=true');
    } catch (error) {
        console.error('❌ Error al cambiar estado:', error.message);
        res.status(500).send('Error al cambiar estado');
    }
});

router.post('/eliminar-negocio/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).send('Negocio inválido.');
    try {
        // Las FK del esquema recovery usan ON DELETE CASCADE. Una sola sentencia evita
        // dejar el tenant parcialmente borrado si una tabla intermedia falla.
        const { data, error } = await supabase
            .from('restaurantes')
            .delete()
            .eq('id', id)
            .select('id')
            .maybeSingle();
        if (error) throw error;
        if (!data) return res.status(404).send('Negocio no encontrado.');
        res.redirect('/superadmin/panel?message=deleted');
    } catch (error) {
        console.error('❌ Error al eliminar:', error.message);
        res.redirect('/superadmin/panel?error=db');
    }
});

module.exports = router;
