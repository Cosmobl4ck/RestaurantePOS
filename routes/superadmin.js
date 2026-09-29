const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { supabase } = require('../config/supabase');

const crearCodigoNegocio = () => crypto.randomBytes(3).toString('hex').toUpperCase();

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

        const ahora = new Date();
        const negocios = (restaurantes || []).map((restaurante) => ({
            ...restaurante,
            total_usuarios: conteoUsuarios.get(restaurante.id) || 0
        }));

        const stats = {
            total: negocios.length,
            // Un negocio es activo SOLO si el estado es 'activo' Y la fecha no ha pasado
            activos: negocios.filter((n) => n.estado === 'activo' && (new Date(n.fecha_vencimiento) > ahora)).length,
            
            // Un negocio va al cuadro ROJO si el estado NO es 'activo' O si la fecha ya pasó
            vencidos: negocios.filter((n) => n.estado !== 'activo' || (new Date(n.fecha_vencimiento) <= ahora)).length,
            
            trials: negocios.filter((n) => n.plan === 'trial').length
        };

        res.render('superadmin/admin_global', { stats, negocios });
    } catch (error) {
        console.error('❌ Error al cargar Panel Pro:', error.message);
        res.status(500).send('Error en el servidor');
    }
});

router.post('/registrar-negocio', async (req, res) => {
    const { nombre_comercial, pin_admin } = req.body;

    try {
        const codigoNegocio = crearCodigoNegocio();

        // === Licensing: default TRIAL (7 días) ===
        const fechaInicio = new Date();
        const fechaVencimiento = new Date(fechaInicio);
        fechaVencimiento.setDate(fechaVencimiento.getDate() + 7);

        const { data: restaurante, error: restauranteError } = await supabase
            .from('restaurantes')
            .insert({
                nombre_comercial,
                codigo_negocio: codigoNegocio,
                plan: 'trial',
                fecha_inicio: fechaInicio.toISOString(),
                fecha_vencimiento: fechaVencimiento.toISOString(),
                estado: 'activo'
            })
            .select('id, codigo_negocio, plan, fecha_vencimiento')
            .single();


        if (restauranteError) throw restauranteError;

        const pinFinal = String(pin_admin || '').trim();
        if (!/^\d{4,12}$/.test(pinFinal)) {
            // No crear administradores con PIN conocido/default.
            await supabase.from('restaurantes').delete().eq('id', restaurante.id);
            return res.status(400).send('El PIN administrador debe tener entre 4 y 12 dígitos.');
        }
        const pinHasheado = await bcrypt.hash(String(pinFinal), 10);

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
        console.error('❌ Error en registro Pro:', error.message);
        res.status(500).send('Error al crear el negocio Pro');
    }
});

router.post('/editar-negocio', async (req, res) => {
    const { id_negocio, nuevo_nombre } = req.body;

    try {
        const { error } = await supabase
            .from('restaurantes')
            .update({ nombre_comercial: nuevo_nombre })
            .eq('id', id_negocio);

        if (error) throw error;

        res.redirect('/superadmin/panel?edited=true');
    } catch (error) {
        console.error('❌ Error al editar:', error.message);
        res.status(500).send('Error al editar negocio');
    }
});

const getPlanDuracionDias = (plan) => {
    // por ahora: todos los planes duran 30 días
    // (si luego cambias, centralizamos aquí)
    return plan === 'trial' ? 7 : 30;
};

const calcularNuevaFechaVencimiento = (fechaVencimientoActual, plan = 'basic') => {
    const base = fechaVencimientoActual && new Date(fechaVencimientoActual) > new Date()
        ? new Date(fechaVencimientoActual)
        : new Date();

    base.setDate(base.getDate() + getPlanDuracionDias(plan));
    return base;
};






router.post('/extender/:id', async (req, res) => {
    try {
        const { data: restaurante, error: getError } = await supabase
            .from('restaurantes')
            .select('fecha_vencimiento')
            .eq('id', req.params.id)
            .single();


        if (getError) throw getError;

        const base = calcularNuevaFechaVencimiento(restaurante.fecha_vencimiento);

        const { error } = await supabase
            .from('restaurantes')
            .update({
                fecha_vencimiento: base.toISOString(),
                estado: 'activo'
            })

            .eq('id', req.params.id);

        if (error) throw error;

        res.redirect('/superadmin/panel?extended=true');
    } catch (error) {
        console.error('❌ Error al extender:', error.message);
        res.status(500).send('Error al extender suscripcion');
    }
});

router.post('/activar-plan/:id', async (req, res) => {
    const { plan } = req.body;

    const planesValidos = new Set(['trial', 'basic', 'premium', 'pro_plus']);
    if (!planesValidos.has(plan)) {
        return res.status(400).send('Plan inválido');
    }

    try {
        const fechaInicio = new Date();
        const fechaVencimiento = new Date(fechaInicio);
        fechaVencimiento.setDate(fechaVencimiento.getDate() + getPlanDuracionDias(plan));

        const { error } = await supabase
            .from('restaurantes')
            .update({
                plan,
                fecha_inicio: fechaInicio.toISOString(),
                fecha_vencimiento: fechaVencimiento.toISOString(),
                estado: 'activo'
            })
            .eq('id', req.params.id);

        if (error) throw error;

        res.redirect('/superadmin/panel?plan_changed=true');
    } catch (error) {
        console.error('Error al activar plan:', error.message);
        res.status(500).send('Error al activar plan');
    }
});

router.post('/toggle-estado/:id', async (req, res) => {
    const { estado_actual } = req.body;
    const nuevoEstado = estado_actual === 'activo' ? 'suspendido' : 'activo';


    try {
        const { error } = await supabase
            .from('restaurantes')
            .update({ estado: nuevoEstado })
            .eq('id', req.params.id);

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
