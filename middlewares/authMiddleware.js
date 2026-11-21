const { supabase } = require('../config/supabase');
const { normalizeRole } = require('./access');
const { isAllowed: ipAllowed, getClientIp } = require('../utils/ip-access');
const planService = require('../services/planService');

// La licencia y el estado del usuario se revalidan contra la base de datos,
// pero con una caché corta en sesión para no hacer 2 consultas por request.
const CACHE_TTL_MS = Number(process.env.LICENSE_CACHE_TTL_MS) || 60 * 1000;
const GRACIA_VENCIMIENTO_MS = 48 * 60 * 60 * 1000;

function esperaJson(req) {
    return req.accepts(['html', 'json']) === 'json' || req.xhr || req.path.startsWith('/api/');
}

function denegar(req, res, status, message) {
    if (req.path.endsWith('/events')) return res.status(status).end();
    if (esperaJson(req)) return res.status(status).json({ error: message });
    return res.status(status).render('error', { error: { message, status } });
}

function sesionInvalida(req, res, message) {
    if (req.path.endsWith('/events')) return res.status(401).end();
    if (esperaJson(req)) return res.status(401).json({ error: message });
    return res.redirect('/login');
}

function ipBloqueada(req, permitida) {
    if (!permitida) return false;
    const rol = normalizeRole(req.session?.usuario?.rol);
    if (['admin', 'gerente'].includes(rol)) return false;
    return !ipAllowed(getClientIp(req), permitida);
}

function bloquearIp(req, res) {
    const message = 'Acceso solo desde la red del restaurante.';
    req.session.destroy(() => {
        if (esperaJson(req)) return res.status(403).json({ error: message });
        return res.status(403).render('error', { error: { message, status: 403 } });
    });
}

async function attachPlanContext(req, res) {
    await planService.loadCatalog();
    const plan = planService.getPlanSync(req.session?.usuario?.plan || 'trial');
    if (req.session?.usuario && req.session.usuario.plan !== plan.codigo) {
        req.session.usuario.plan = plan.codigo;
    }
    res.locals.plan = plan;
    res.locals.planLabel = plan.nombre;
    res.locals.planLimits = plan.limits;
    res.locals.planPuede = (featureKey) => planService.hasFeatureSync(plan.codigo, featureKey);
}

/**
 * Verifica, en este orden:
 *  1. que exista sesión;
 *  2. que el usuario siga existiendo y activo (rol incluido);
 *  3. que el restaurante siga activo y con licencia vigente (+48h de gracia).
 */
const verificarSesion = async (req, res, next) => {
    if (!req.session || !req.session.usuario) {
        return sesionInvalida(req, res, 'Sesión requerida.');
    }

    const usuarioSesion = req.session.usuario;

    // Caché: evita consultar la BD en cada request.
    const cache = req.session.licenseCheck;
    if (cache && Number.isFinite(cache.at) && Date.now() - cache.at < CACHE_TTL_MS) {
        if (!cache.ok) {
            if (cache.code === 'SESSION') {
                return req.session.destroy(() => sesionInvalida(req, res, cache.message));
            }
            return denegar(req, res, cache.status || 403, cache.message);
        }
        if (ipBloqueada(req, cache.ipPermitida)) return bloquearIp(req, res);
        await attachPlanContext(req, res);
        return next();
    }

    try {
        const restauranteId = usuarioSesion.restaurante_id;

        const [negocioResult, usuarioResult] = await Promise.all([
            supabase
                .from('restaurantes')
                .select('estado, fecha_vencimiento, nombre_comercial, plan, ip_permitida')
                .eq('id', restauranteId)
                .maybeSingle(),
            supabase
                .from('usuarios')
                .select('estado, rol')
                .eq('id', usuarioSesion.id)
                .eq('restaurante_id', restauranteId)
                .maybeSingle()
        ]);

        if (negocioResult.error) throw negocioResult.error;
        if (usuarioResult.error) throw usuarioResult.error;

        const negocio = negocioResult.data;
        const usuario = usuarioResult.data;

        if (!negocio || !usuario || Number(usuario.estado) !== 1) {
            const message = !negocio
                ? 'El restaurante de esta sesión ya no existe.'
                : 'Tu usuario fue desactivado. Vuelve a iniciar sesión.';
            req.session.licenseCheck = { at: Date.now(), ok: false, code: 'SESSION', message };
            return req.session.destroy(() => sesionInvalida(req, res, message));
        }

        // Mantiene el rol de la sesión alineado con la base de datos.
        const rolActual = normalizeRole(usuario.rol);
        if (rolActual !== usuarioSesion.rol) {
            req.session.usuario.rol = rolActual;
        }

        if (negocio.estado !== 'activo') {
            const message = 'El acceso a este restaurante está suspendido.';
            req.session.licenseCheck = { at: Date.now(), ok: false, status: 403, message };
            return denegar(req, res, 403, message);
        }

        if (negocio.fecha_vencimiento) {
            const vencimiento = new Date(negocio.fecha_vencimiento);
            if (!Number.isNaN(vencimiento.getTime())) {
                const limiteBloqueo = new Date(vencimiento.getTime() + GRACIA_VENCIMIENTO_MS);
                if (Date.now() > limiteBloqueo.getTime()) {
                    const message = 'La licencia de este restaurante está vencida.';
                    req.session.licenseCheck = { at: Date.now(), ok: false, status: 403, message };
                    return denegar(req, res, 403, message);
                }
            }
        }

        const planActual = planService.getPlanSync(negocio.plan || 'trial').codigo;
        if (usuarioSesion.plan !== planActual) {
            req.session.usuario.plan = planActual;
        }

        if (ipBloqueada(req, negocio.ip_permitida)) {
            req.session.licenseCheck = { at: Date.now(), ok: true, ipPermitida: negocio.ip_permitida };
            return bloquearIp(req, res);
        }

        req.session.licenseCheck = { at: Date.now(), ok: true, ipPermitida: negocio.ip_permitida || null };
        await attachPlanContext(req, res);
        return next();
    } catch (error) {
        // Error transitorio de base de datos: no cerramos la sesión del usuario.
        console.error('Error crítico validando sesión/licencia:', error.message);
        return denegar(req, res, 503, 'No se pudo validar la licencia. Intenta de nuevo.');
    }
};

module.exports = { verificarSesion };
