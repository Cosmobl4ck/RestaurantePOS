const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { supabase } = require('../config/supabase');
const { normalizeRole } = require('../middlewares/access');

// Cada rol aterriza en la pantalla que realmente puede ver.
// (Antes todo el mundo iba a /dashboard, que solo admite admin/cajero/mesero,
// así que un usuario con rol 'cocina' o 'bar' quedaba bloqueado justo tras loguearse).
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

router.post('/login', async (req, res) => {
    const codigoNegocio = String(req.body.codigo_negocio || '').trim();
    const nombreUsuario = String(req.body.nombre || '').trim();
    const pinRecibido = String(req.body.pin || '').trim();

    console.log(`📥 INTENTO DE LOGIN: Negocio[${codigoNegocio}] Usuario[${nombreUsuario}]`);

    if (!codigoNegocio || !nombreUsuario || !pinRecibido) {
        return res.status(400).render('login', { error: 'Por favor completa todos los campos.' });
    }

    try {
        const { data: restaurante, error: restauranteError } = await supabase
            .from('restaurantes')
            .select('id, codigo_negocio, nombre_comercial, estado, fecha_vencimiento')
            .eq('codigo_negocio', codigoNegocio)
            .maybeSingle();

        if (restauranteError) throw restauranteError;

        if (!restaurante) {
            return res.status(401).render('login', { error: 'Credenciales incorrectas o negocio no existe.' });
        }

        if (restaurante.estado !== 'activo') {
            return res.status(403).render('login', { error: 'Este negocio no esta activo.' });
        }

        const ahora = new Date();
        const vencimiento = restaurante.fecha_vencimiento ? new Date(restaurante.fecha_vencimiento) : null;

        // Permitir uso hasta +48h después del vencimiento.
        if (vencimiento && ahora > vencimiento) {
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
            .maybeSingle();

        if (userError) throw userError;

        if (!user) {
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

        // Evita session fixation: después de autenticar se crea un ID de sesión nuevo.
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
router.post('/logout', cerrarSesion);
// Compatibilidad temporal con enlaces antiguos; migrar la UI a POST.
router.get('/logout', cerrarSesion);

router.get('/register', (req, res) => {
    if (!req.session.usuario) return res.redirect('/login');

    if (req.session.usuario.rol !== 'admin' && req.session.usuario.rol !== 'gerente') {
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

    // SEGURIDAD: solo admin/gerente pueden crear usuarios (antes solo se validaba en el GET,
    // así que cualquier usuario logueado podía crear un admin mandando el POST directo).
    if (req.session.usuario.rol !== 'admin' && req.session.usuario.rol !== 'gerente') {
        return res.status(403).render('register', {
            usuario: req.session.usuario,
            error: 'No tienes permisos para crear usuarios.',
            success: null
        });
    }

    const { nombre, rol, pin } = req.body;
    const restauranteId = req.session.usuario.restaurante_id;
    const limiteUsuarios = 10;

    // SEGURIDAD: whitelist de roles válidos, no confiar en cualquier string del formulario.
    const ROLES_VALIDOS = ['admin', 'gerente', 'cajero', 'mesero', 'cocina', 'bar'];

    try {
        if (!nombre || !rol || !pin) {
            return res.render('register', {
                usuario: req.session.usuario,
                error: 'Todos los campos son obligatorios.',
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

        const pinHash = await bcrypt.hash(String(pin), 10);

        const { error: insertError } = await supabase
            .from('usuarios')
            .insert({
                restaurante_id: restauranteId,
                nombre,
                rol,
                pin_hash: pinHash,
                estado: 1
            });

        if (insertError) throw insertError;

        res.render('register', {
            usuario: req.session.usuario,
            error: null,
            success: `El empleado ${nombre} fue creado exitosamente con el rol de ${rol}.`
        });
    } catch (error) {
        console.error('❌ ERROR AL CREAR USUARIO:', error);
        res.render('register', {
            usuario: req.session.usuario,
            error: 'Error al guardar el usuario.',
            success: null
        });
    }
});

module.exports = router;
