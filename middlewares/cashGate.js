const { supabase } = require('../config/supabase');
const { normalizeRole } = require('./access');

// Evita consultar la BD en cada request. 15 s es suficiente para que abrir o
// cerrar caja se refleje casi de inmediato sin castigar el rendimiento.
const CACHE_TTL_MS = 15 * 1000;

// Rutas operativas que exigen caja abierta.
const RUTAS_BLOQUEADAS = [
  '/mesas',
  '/kds',
  '/cocina',
  '/bar',
  '/facturas',
  '/registro-pedidos'
];

function esRutaBloqueada(path) {
  return RUTAS_BLOQUEADAS.some((base) => path === base || path.startsWith(base + '/'));
}

async function cajaAbierta(req) {
  const cache = req.session.cajaAbierta;
  if (cache && Number.isFinite(cache.at) && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.abierta;
  }

  const { data, error } = await supabase
    .from('cortes_caja')
    .select('id')
    .eq('restaurante_id', req.session.usuario.restaurante_id)
    .eq('estado', 'abierta')
    .maybeSingle();

  if (error) {
    // No bloquear todo el POS por un fallo transitorio de BD.
    console.error('No se pudo verificar la caja abierta:', error.message);
    return true;
  }

  const abierta = Boolean(data);
  req.session.cajaAbierta = { at: Date.now(), abierta };
  return abierta;
}

async function cashGate(req, res, next) {
  if (!req.session?.usuario) return next();

  // Admin, gerente y host pueden ver el plano/mesas sin caja abierta.
  const rol = normalizeRole(req.session.usuario.rol);
  if (['admin', 'gerente', 'host'].includes(rol)) return next();

  // El cajero puede consultar mesas aunque no haya caja; no puede operar.
  if (req.method === 'GET' && req.path === '/mesas' && rol === 'cajero') return next();

  if (!esRutaBloqueada(req.path)) return next();

  try {
    if (await cajaAbierta(req)) return next();
  } catch (error) {
    console.error('Error en cashGate:', error.message);
    return next();
  }

  const mensaje = 'No hay caja abierta. Abre la caja para operar.';
  const esperaJson = req.method !== 'GET' || req.xhr || req.path.startsWith('/api/');
  if (esperaJson) {
    return res.status(403).json({ error: mensaje, code: 'CAJA_CERRADA' });
  }

  return res.status(403).render('caja-cerrada', {
    usuario: req.session.usuario,
    puedeAbrir: ['admin', 'gerente', 'cajero'].includes(rol)
  });
}

module.exports = { cashGate, esRutaBloqueada, RUTAS_BLOQUEADAS };
