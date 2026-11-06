const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { supabase } = require('../config/supabase');
const { normalizeRole } = require('../middlewares/access');

// Hash de referencia para igualar el tiempo de respuesta cuando el usuario no
// existe (evita enumeración de usuarios por timing).
const DUMMY_HASH = bcrypt.hashSync('restaurante-pos-dummy-pin', 10);

// Límite por IP + usuario: un empleado que falla no bloquea a todo el turno.
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => {
        const usuario = String(req.body?.nombre || '').trim().toLowerCase().slice(0, 50);
        return `${ipKeyGenerator(req.ip)}:${usuario}`;
    },
    message: 'Demasiados intentos de inicio de sesión. Espera 15 minutos.'
});

const ROLES_VALIDOS = ['admin', 'gerente', 'cajero', 'mesero', 'cocina', 'bar'];
const ROLES_SOLO_ADMIN = ['admin', 'gerente'];
const NOMBRE_RE = /^[\p{L}\p{N} ._-]{2,50}$/u;

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

    console.log(`📥 INTENTO DE LOGIN: Negocio[${codigoNegocio}] Usuario[${nombreUsuario}]`);

    if (!codigoNegocio || !nombreUsuario || !pinRecibido) {
        return res.status(400).render('login', { error: 'Por favor completa todos los campos.' });
    }
    if (!/^[A-Z0-9-]{3,32}$/.test(codigoNegocio)) {
        return res.status(400).render('login', { error: 'Código de negocio inválido.' });
    }

    try {
        const { data: restaurante, error: restauranteError } = await supabase
            .from('restaurantes')
            .select('id, codigo_negocio, nombre_comercial, estado, fecha_vencimiento, plan')
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

        // Permitir uso hasta +48h después del vencimiento.
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

        const sessionUser = {
            id: user.id,
            restaurante_id: user.restaurante_id,
            codigo_negocio: restaurante.codigo_negocio,
            nombre_negocio: restaurante.nombre_comercial,
            nombre: user.nombre,
            rol: normalizeRole(user.rol),
            plan: restaurante.plan || 'trial'
        };

        // Evita session fixation: después de autenticar se crea un ID nuevo.
        return req.session.regenerate((sessionErr) => {
            if (sessionErr) {
                console.error('Error regenerando sesión:', sessionErr);
                return res.render('login', { error: 'No se pudo iniciar una sesión segura.' });
            }
            req.session.usuario = sessionUser;
            req.session.save(() => res.redirect(rutaInicioPorRol(sessionUser.rol)));
        });
    } catch (error) {
        console.error('❌ ERROR EN LOGIN:', error.message);
        return res.render('login', { error: 'Error de base de datos.' });
    }
});

function cerrarSesion(req, res) {
    req.session.destroy(() => {
        res.clearCookie('marrocos.sid');
        res.redirect('/login');
    });
}
// Solo POST: cerrar sesión por GET permitía CSRF de logout.
router.post('/logout', cerrarSesion);

router.get('/register', (req, res) => {
    if (!req.session.usuario) return res.redirect('/login');

    if (!ROLES_SOLO_ADMIN.includes(req.session.usuario.rol)) {
        return res.redirect('/dashboard');
    }

    res.render('register', {
        usuario: req.session.usuario,
        error: null,
        success: null
    });
});

router.post('/register', async (req, res) => {
    if (!req.session.usuario) return res.redirect('/login');

    const rolSolicitante = req.session.usuario.rol;
    if (!ROLES_SOLO_ADMIN.includes(rolSolicitante)) {
        return res.status(403).render('register', {
            usuario: req.session.usuario,
            error: 'No tienes permisos para crear usuarios.',
            success: null
        });
    }

    const nombre = String(req.body.nombre || '').trim();
    const rol = String(req.body.rol || '').trim().toLowerCase();
    const pin = String(req.body.pin || '').trim();
    const restauranteId = req.session.usuario.restaurante_id;
    const limiteUsuarios = 10;

    try {
        if (!nombre || !rol || !pin) {
            return res.render('register', {
                usuario: req.session.usuario,
                error: 'Todos los campos son obligatorios.',
                success: null
            });
        }

        if (!NOMBRE_RE.test(nombre)) {
            return res.render('register', {
                usuario: req.session.usuario,
                error: 'El nombre debe tener entre 2 y 50 caracteres (letras, números, espacios, . _ -).',
                success: null
            });
        }

        if (!ROLES_VALIDOS.includes(rol)) {
            return res.render('register', {
                usuario: req.session.usuario,
                error: 'Rol inválido.',
                success: null
            });
        }

        // Un gerente no puede crear administradores ni otros gerentes.
        if (rolSolicitante === 'gerente' && ROLES_SOLO_ADMIN.includes(rol)) {
            return res.status(403).render('register', {
                usuario: req.session.usuario,
                error: 'Solo un administrador puede crear administradores o gerentes.',
                success: null
            });
        }

        // PIN numérico; los roles con acceso administrativo exigen 6+ dígitos.
        if (!/^\d{4,12}$/.test(pin)) {
            return res.render('register', {
                usuario: req.session.usuario,
                error: 'El PIN debe tener entre 4 y 12 dígitos.',
                success: null
            });
        }
        if (ROLES_SOLO_ADMIN.includes(rol) && pin.length < 6) {
            return res.render('register', {
                usuario: req.session.usuario,
                error: 'Para roles administrativos el PIN debe tener al menos 6 dígitos.',
                success: null
            });
        }

        const { count, error: countError } = await supabase
            .from('usuarios')
            .select('id', { count: 'exact', head: true })
            .eq('restaurante_id', restauranteId);

        if (countError) throw countError;

        if ((count || 0) >= limiteUsuarios) {
            return res.render('register', {
                usuario: req.session.usuario,
                error: `Has alcanzado el limite maximo de ${limiteUsuarios} usuarios.`,
                success: null
            });
        }

        const pinHash = await bcrypt.hash(pin, 10);

        const { error: insertError } = await supabase
            .from('usuarios')
            .insert({
                restaurante_id: restauranteId,
                nombre,
                rol,
                pin_hash: pinHash,
                estado: 1
            });

        if (insertError) {
            if (String(insertError.code) === '23505') {
                return res.render('register', {
                    usuario: req.session.usuario,
                    error: `Ya existe un usuario con el nombre "${nombre}".`,
                    success: null
                });
            }
            throw insertError;
        }

        res.render('register', {
            usuario: req.session.usuario,
            error: null,
            success: `El empleado ${nombre} fue creado exitosamente con el rol de ${rol}.`
        });
    } catch (error) {
        console.error('❌ ERROR AL CREAR USUARIO:', error.message);
        res.render('register', {
            usuario: req.session.usuario,
            error: 'Error al guardar el usuario.',
            success: null
        });
    }
});

module.exports = router;
