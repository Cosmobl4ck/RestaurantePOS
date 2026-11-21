const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { supabase } = require('../config/supabase');
const { normalizeRole } = require('../middlewares/access');
const { getPlanSync, getLimitSync, getUsage } = require('../services/planService');
const { enforcementEnabled } = require('../middlewares/planAccess');
const { registrarAuditoria } = require('../services/auditService');
const { registrarAsistencia } = require('../services/attendanceService');
const { isAllowed: ipAllowed, isValidToken, getClientIp } = require('../utils/ip-access');
const { dateInTimeZone } = require('../utils/business-time');

// Hash de referencia para igualar el tiempo de respuesta cuando el usuario no
// existe (evita enumeraciÃ³n de usuarios por timing).
const DUMMY_HASH = bcrypt.hashSync('restaurante-pos-dummy-pin', 10);

// LÃ­mite por IP + usuario: un empleado que falla no bloquea a todo el turno.
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => {
        const usuario = String(req.body?.nombre || '').trim().toLowerCase().slice(0, 50);
        return `${ipKeyGenerator(getClientIp(req))}:${usuario}`;
    },
    message: 'Demasiados intentos de inicio de sesiÃ³n. Espera 15 minutos.'
});

const ROLES_VALIDOS = ['admin', 'gerente', 'cajero', 'mesero', 'cocina', 'bar'];
const ROLES_SOLO_ADMIN = ['admin', 'gerente'];
const NOMBRE_RE = /^[\p{L}\p{N} ._-]{2,50}$/u;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Cada rol aterriza en la pantalla que realmente puede ver.
const rutaInicioPorRol = (rol) => {
    rol = normalizeRole(rol);
    if (rol === 'cocina') return '/kds/cocina';
    if (rol === 'bar') return '/kds/bar';
    return '/dashboard';
};

router.get('/login', (req, res) => {
    if (req.session.usuario) {
        return res.redirect(rutaInicioPorRol(req.session.usuario.rol));
    }
    res.render('login', { error: null });
});

router.post('/login', loginLimiter, async (req, res) => {
    const codigoNegocio = String(req.body.codigo_negocio || '').trim().toUpperCase();
    const nombreUsuario = String(req.body.nombre || '').trim();
    const pinRecibido = String(req.body.pin || '').trim();

    // No registrar el nombre de usuario (PII). Basta el cÃ³digo de negocio.
    console.log(`ðŸ“¥ Intento de login: negocio ${codigoNegocio}`);

    if (!codigoNegocio || !nombreUsuario || !pinRecibido) {
        return res.status(400).render('login', { error: 'Por favor completa todos los campos.' });
    }
    if (!/^[A-Z0-9-]{3,32}$/.test(codigoNegocio)) {
        return res.status(400).render('login', { error: 'CÃ³digo de negocio invÃ¡lido.' });
    }

    try {
        const { data: restaurante, error: restauranteError } = await supabase
            .from('restaurantes')
            .select('id, codigo_negocio, nombre_comercial, estado, fecha_vencimiento, plan, ip_permitida, timezone')
            .eq('codigo_negocio', codigoNegocio)
            .maybeSingle();

        if (restauranteError) throw restauranteError;

        if (!restaurante) {
            // Consume tiempo similar al caso real para no filtrar existencia.
            await bcrypt.compare(pinRecibido, DUMMY_HASH);
            return res.status(401).render('login', { error: 'Credenciales incorrectas o negocio no existe.' });
        }

        if (restaurante.estado !== 'activo') {
            return res.status(403).render('login', { error: 'Este negocio no esta activo.' });
        }

        const ahora = new Date();
        const vencimiento = restaurante.fecha_vencimiento ? new Date(restaurante.fecha_vencimiento) : null;

        // Permitir uso hasta +48h despuÃ©s del vencimiento.
        if (vencimiento && !Number.isNaN(vencimiento.getTime()) && ahora > vencimiento) {
            const limiteBloqueo = new Date(vencimiento.getTime() + 48 * 60 * 60 * 1000);
            if (ahora > limiteBloqueo) {
                return res.status(403).render('login', { error: 'La licencia de este negocio esta vencida (bloqueado).' });
            }
        }

        const { data: user, error: userError } = await supabase
            .from('usuarios')
            .select('id, restaurante_id, nombre, rol, pin_hash, estado')
            .eq('restaurante_id', restaurante.id)
            .eq('nombre', nombreUsuario)
            .eq('estado', 1)
            .limit(1)
            .maybeSingle();

        if (userError) throw userError;

        if (!user) {
            await bcrypt.compare(pinRecibido, DUMMY_HASH);
            return res.status(401).render('login', { error: 'Credenciales incorrectas o usuario inactivo.' });
        }

        const esValido = await bcrypt.compare(pinRecibido, String(user.pin_hash || '').trim());

        if (!esValido) {
            return res.status(401).render('login', { error: 'PIN incorrecto.' });
        }

        const rolNormalizado = normalizeRole(user.rol);
        if (restaurante.ip_permitida
            && !['admin', 'gerente'].includes(rolNormalizado)
            && !ipAllowed(getClientIp(req), restaurante.ip_permitida)) {
            return res.status(403).render('login', {
                error: 'Solo puedes iniciar sesiÃ³n desde la red del restaurante.'
            });
        }

        const sessionUser = {
            id: user.id,
            restaurante_id: user.restaurante_id,
            codigo_negocio: restaurante.codigo_negocio,
            nombre_negocio: restaurante.nombre_comercial,
            nombre: user.nombre,
            rol: normalizeRole(user.rol),
            plan: restaurante.plan || 'trial'
        };

        // Evita session fixation: despuÃ©s de autenticar se crea un ID nuevo.
        return req.session.regenerate((sessionErr) => {
            if (sessionErr) {
                console.error('Error regenerando sesiÃ³n:', sessionErr);
                return res.render('login', { error: 'No se pudo iniciar una sesiÃ³n segura.' });
            }
            req.session.usuario = sessionUser;
            registrarAsistencia({
                restauranteId: user.restaurante_id,
                empleadoId: user.id,
                tipo: 'entrada',
                metodo: 'pin_manual',
                ip: getClientIp(req)
            }).catch((error) => console.error('No se pudo registrar asistencia:', error.message));
            registrarAuditoria(req, {
                accion: 'sesion.iniciar',
                entidad: 'usuario',
                entidadId: user.id,
                detalle: { rol: sessionUser.rol }
            }).catch(() => {});
            req.session.save(() => res.redirect(rutaInicioPorRol(sessionUser.rol)));
        });
    } catch (error) {
        console.error('âŒ ERROR EN LOGIN:', error.message);
        return res.render('login', { error: 'Error de base de datos.' });
    }
});

function cerrarSesion(req, res) {
    const usuario = req.session?.usuario;
    if (usuario) {
        registrarAuditoria(req, {
            accion: 'sesion.cerrar',
            entidad: 'usuario',
            entidadId: usuario.id,
            detalle: { rol: usuario.rol }
        }).catch(() => {});
        registrarAsistencia({
            restauranteId: usuario.restaurante_id,
            empleadoId: usuario.id,
            tipo: 'salida',
            metodo: 'pin_manual',
            ip: getClientIp(req)
        }).catch((error) => console.error('No se pudo registrar salida:', error.message));
    }
    req.session.destroy(() => {
        res.clearCookie('marrocos.sid');
        res.redirect('/login');
    });
}
// Solo POST: cerrar sesiÃ³n por GET permitÃ­a CSRF de logout.
router.post('/logout', cerrarSesion);

async function renderRegister(req, res, extra = {}) {
    const plan = res.locals.plan || getPlanSync(req.session.usuario.plan);
    const restauranteId = req.session.usuario.restaurante_id;
    let usoUsuarios = null;
    let empleados = [];

    try {
        usoUsuarios = await getUsage(restauranteId, 'usuarios');
    } catch (error) {
        console.error('No se pudo contar usuarios:', error.message);
    }

    try {
        const { data, error } = await supabase
            .from('usuarios')
            .select('id, nombre, rol, estado, email, direccion, created_at')
            .eq('restaurante_id', restauranteId)
            .order('rol', { ascending: true })
            .order('nombre', { ascending: true });
        if (error) throw error;
        empleados = data || [];
    } catch (error) {
        console.error('No se pudo listar empleados:', error.message);
    }

    let ipPermitida = '';
    try {
        const { data: negocio } = await supabase
            .from('restaurantes')
            .select('ip_permitida')
            .eq('id', restauranteId)
            .maybeSingle();
        ipPermitida = negocio?.ip_permitida || '';
    } catch (error) {
        console.error('No se pudo leer la IP permitida:', error.message);
    }

    return res.render('register', {
        usuario: req.session.usuario,
        plan,
        usoUsuarios,
        limiteUsuarios: getLimitSync(plan.codigo, 'usuarios'),
        empleados,
        ipPermitida,
        ipActual: getClientIp(req),
        error: null,
        success: null,
        ...extra
    });
}

router.get('/register', async (req, res) => {
    if (!req.session.usuario) return res.redirect('/login');

    if (!ROLES_SOLO_ADMIN.includes(req.session.usuario.rol)) {
        return res.redirect('/dashboard');
    }

    return renderRegister(req, res, {
        success: req.query.success ? String(req.query.success) : null,
        error: req.query.error ? String(req.query.error) : null
    });
});

router.post('/register', async (req, res) => {
    if (!req.session.usuario) return res.redirect('/login');

    const rolSolicitante = req.session.usuario.rol;
    if (!ROLES_SOLO_ADMIN.includes(rolSolicitante)) {
        return res.status(403).send('No tienes permisos para crear usuarios.');
    }

    const nombre = String(req.body.nombre || '').trim();
    const rol = String(req.body.rol || '').trim().toLowerCase();
    const pin = String(req.body.pin || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase().slice(0, 120);
    const direccion = String(req.body.direccion || '').trim().slice(0, 200);
    const restauranteId = req.session.usuario.restaurante_id;

    try {
        if (!nombre || !rol || !pin) {
            return renderRegister(req, res, { error: 'Todos los campos son obligatorios.' });
        }

        if (!NOMBRE_RE.test(nombre)) {
            return renderRegister(req, res, { error: 'El nombre debe tener entre 2 y 50 caracteres (letras, nÃºmeros, espacios, . _ -).' });
        }

        if (!ROLES_VALIDOS.includes(rol)) {
            return renderRegister(req, res, { error: 'Rol invÃ¡lido.' });
        }

        // Un gerente no puede crear administradores ni otros gerentes.
        if (rolSolicitante === 'gerente' && ROLES_SOLO_ADMIN.includes(rol)) {
            return res.status(403).send('Solo un administrador puede crear administradores o gerentes.');
        }

        // PIN numÃ©rico; los roles con acceso administrativo exigen 6+ dÃ­gitos.
        if (!/^\d{4,12}$/.test(pin)) {
            return renderRegister(req, res, { error: 'El PIN debe tener entre 4 y 12 dÃ­gitos.' });
        }
        if (ROLES_SOLO_ADMIN.includes(rol) && pin.length < 6) {
            return renderRegister(req, res, { error: 'Para roles administrativos el PIN debe tener al menos 6 dÃ­gitos.' });
        }

        if (email && !EMAIL_RE.test(email)) {
            return renderRegister(req, res, { error: 'El correo no es vÃ¡lido.' });
        }

        const plan = res.locals.plan || getPlanSync(req.session.usuario.plan);
        const limiteUsuarios = getLimitSync(plan.codigo, 'usuarios');

        const { count, error: countError } = await supabase
            .from('usuarios')
            .select('id', { count: 'exact', head: true })
            .eq('restaurante_id', restauranteId);

        if (countError) throw countError;

        if (enforcementEnabled() && limiteUsuarios != null && (count || 0) >= limiteUsuarios) {
            return renderRegister(req, res, {
                error: `Has alcanzado el lÃ­mite de ${limiteUsuarios} usuarios del plan ${plan.nombre}.`
            });
        }

        const pinHash = await bcrypt.hash(pin, 10);

        const { data: usuarioCreado, error: insertError } = await supabase
            .from('usuarios')
            .insert({
                restaurante_id: restauranteId,
                nombre,
                rol,
                pin_hash: pinHash,
                estado: 1,
                email: email || null,
                direccion: direccion || null
            })
            .select('id')
            .maybeSingle();

        if (insertError) {
            if (String(insertError.code) === '23505') {
                return renderRegister(req, res, { error: `Ya existe un usuario con el nombre "${nombre}".` });
            }
            throw insertError;
        }

        await registrarAuditoria(req, {
            accion: 'usuario.crear',
            entidad: 'usuario',
            entidadId: usuarioCreado?.id,
            detalle: { nombre, rol, tiene_email: Boolean(email) }
        });

        return renderRegister(req, res, {
            success: `El empleado ${nombre} fue creado exitosamente con el rol de ${rol}.`
        });
    } catch (error) {
        console.error('âŒ ERROR AL CREAR USUARIO:', error.message);
        return renderRegister(req, res, { error: 'Error al guardar el usuario.' });
    }
});

// Edita correo/direcciÃ³n y, si se envÃ­a, resetea el PIN del empleado.
router.post('/register/:id/editar', async (req, res) => {
    if (!req.session.usuario) return res.redirect('/login');

    const solicitante = req.session.usuario;
    if (!ROLES_SOLO_ADMIN.includes(solicitante.rol)) {
        return res.status(403).send('No autorizado.');
    }

    const id = Number(req.params.id);
    const volver = (tipo, mensaje) => res.redirect(`/register?${tipo}=${encodeURIComponent(mensaje)}`);
    if (!Number.isInteger(id) || id <= 0) return volver('error', 'Empleado invÃ¡lido.');

    const email = String(req.body.email || '').trim().toLowerCase().slice(0, 120);
    const direccion = String(req.body.direccion || '').trim().slice(0, 200);
    const pin = String(req.body.pin || '').trim();

    try {
        const { data: objetivo, error } = await supabase
            .from('usuarios')
            .select('id, nombre, rol')
            .eq('id', id)
            .eq('restaurante_id', solicitante.restaurante_id)
            .maybeSingle();
        if (error) throw error;
        if (!objetivo) return volver('error', 'Empleado no encontrado.');

        if (solicitante.rol === 'gerente' && ROLES_SOLO_ADMIN.includes(objetivo.rol)) {
            return volver('error', 'Solo un administrador puede editar administradores o gerentes.');
        }

        if (email && !EMAIL_RE.test(email)) return volver('error', 'El correo no es vÃ¡lido.');

        if (pin) {
            if (!/^\d{4,12}$/.test(pin)) return volver('error', 'El PIN debe tener entre 4 y 12 dÃ­gitos.');
            if (ROLES_SOLO_ADMIN.includes(objetivo.rol) && pin.length < 6) {
                return volver('error', 'Para roles administrativos el PIN debe tener al menos 6 dÃ­gitos.');
            }
        }

        const cambios = { email: email || null, direccion: direccion || null };
        if (pin) cambios.pin_hash = await bcrypt.hash(pin, 10);

        const { error: updateError } = await supabase
            .from('usuarios')
            .update(cambios)
            .eq('id', id)
            .eq('restaurante_id', solicitante.restaurante_id);
        if (updateError) throw updateError;

        await registrarAuditoria(req, {
            accion: 'usuario.editar',
            entidad: 'usuario',
            entidadId: id,
            detalle: { email: Boolean(email), direccion: Boolean(direccion), pin_reset: Boolean(pin) }
        });

        return volver('success', `Empleado ${objetivo.nombre} actualizado${pin ? ' y PIN reseteado' : ''}.`);
    } catch (error) {
        console.error('âŒ ERROR AL EDITAR USUARIO:', error.message);
        return volver('error', 'No se pudo actualizar el empleado.');
    }
});

// Configura la IP (o lista de IPs/CIDR) desde la que puede entrar el personal.
router.post('/register/ip', async (req, res) => {
    if (!req.session.usuario) return res.redirect('/login');
    if (!ROLES_SOLO_ADMIN.includes(req.session.usuario.rol)) {
        return res.status(403).send('No autorizado.');
    }

    const volver = (tipo, mensaje) => res.redirect(`/register?${tipo}=${encodeURIComponent(mensaje)}`);
    const tokens = String(req.body.ip_permitida || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);

    if (tokens.length > 20) return volver('error', 'MÃ¡ximo 20 IPs permitidas.');
    const invalido = tokens.find((token) => !isValidToken(token));
    if (invalido) return volver('error', `IP o CIDR invÃ¡lido: ${invalido}`);

    const valor = tokens.length ? tokens.join(',') : null;

    try {
        const { error } = await supabase
            .from('restaurantes')
            .update({ ip_permitida: valor })
            .eq('id', req.session.usuario.restaurante_id);
        if (error) throw error;

        await registrarAuditoria(req, {
            accion: 'seguridad.ip',
            entidad: 'restaurante',
            entidadId: req.session.usuario.restaurante_id,
            detalle: { configurada: Boolean(valor), cantidad: tokens.length }
        });

        return volver('success', valor ? 'IP del restaurante actualizada.' : 'RestricciÃ³n por IP desactivada.');
    } catch (error) {
        console.error('No se pudo guardar la IP permitida:', error.message);
        return volver('error', 'No se pudo guardar la IP.');
    }
});

// Historial de asistencia con rango de fechas (solo admin/gerente).
router.get('/register/asistencia', async (req, res) => {
    if (!req.session.usuario) return res.redirect('/login');
    if (!ROLES_SOLO_ADMIN.includes(req.session.usuario.rol)) {
        return res.redirect('/dashboard');
    }

    const restauranteId = req.session.usuario.restaurante_id;
    let timezone = 'America/El_Salvador';
    let ipPermitida = '';

    try {
        const { data } = await supabase
            .from('restaurantes')
            .select('timezone, ip_permitida')
            .eq('id', restauranteId)
            .maybeSingle();
        timezone = data?.timezone || timezone;
        ipPermitida = data?.ip_permitida || '';
    } catch (error) {
        console.error('No se pudo leer configuraciÃ³n del restaurante:', error.message);
    }

    const fechaValida = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
    let hasta = fechaValida(req.query.hasta) ? String(req.query.hasta) : dateInTimeZone(timezone);
    let desde = fechaValida(req.query.desde) ? String(req.query.desde) : null;

    if (!desde) {
        const inicio = new Date(`${hasta}T00:00:00Z`);
        inicio.setUTCDate(inicio.getUTCDate() - 6);
        desde = inicio.toISOString().slice(0, 10);
    }
    if (desde > hasta) {
        const temporal = desde;
        desde = hasta;
        hasta = temporal;
    }

    let filas = [];
    try {
        const { data, error } = await supabase.rpc('asistencia_resumen', {
            p_restaurante_id: Number(restauranteId),
            p_desde: desde,
            p_hasta: hasta
        });
        if (error) throw error;
        filas = data || [];
    } catch (error) {
        console.error('No se pudo cargar la asistencia:', error.message);
    }

    return res.render('asistencia', {
        usuario: req.session.usuario,
        filas,
        desde,
        hasta,
        timezone,
        ipPermitida,
        ipActual: getClientIp(req)
    });
});

// Finaliza el turno de un empleado: registra salida y cierra sus sesiones.
router.post('/register/:id/finalizar-turno', async (req, res) => {
    if (!req.session.usuario) return res.redirect('/login');
    if (!ROLES_SOLO_ADMIN.includes(req.session.usuario.rol)) {
        return res.status(403).send('No autorizado.');
    }

    const id = Number(req.params.id);
    const volver = (tipo, mensaje) => res.redirect(`/register?${tipo}=${encodeURIComponent(mensaje)}`);
    if (!Number.isInteger(id) || id <= 0) return volver('error', 'Empleado inválido.');

    try {
        const { data: objetivo, error } = await supabase
            .from('usuarios')
            .select('id, nombre, rol')
            .eq('id', id)
            .eq('restaurante_id', req.session.usuario.restaurante_id)
            .maybeSingle();
        if (error) throw error;
        if (!objetivo) return volver('error', 'Empleado no encontrado.');

        if (req.session.usuario.rol === 'gerente' && ROLES_SOLO_ADMIN.includes(objetivo.rol)) {
            return volver('error', 'Solo un administrador puede finalizar el turno de administradores o gerentes.');
        }

        const { data, error: rpcError } = await supabase.rpc('finalizar_turno', {
            p_restaurante_id: Number(req.session.usuario.restaurante_id),
            p_empleado_id: id,
            p_ip: String(getClientIp(req) || '').slice(0, 80)
        });
        if (rpcError) throw rpcError;

        if (!data?.ok) {
            const mensaje = data?.motivo === 'sin_entrada'
                ? 'El empleado no tiene entrada registrada hoy.'
                : 'No se pudo finalizar el turno.';
            return volver('error', mensaje);
        }

        await registrarAuditoria(req, {
            accion: 'usuario.finalizar_turno',
            entidad: 'usuario',
            entidadId: id,
            detalle: { nombre: objetivo.nombre, already_closed: Boolean(data.already_closed) }
        });

        return volver('success', `Turno de ${objetivo.nombre} finalizado.`);
    } catch (error) {
        console.error('No se pudo finalizar el turno:', error.message);
        return volver('error', 'No se pudo finalizar el turno.');
    }
});

module.exports = router;

