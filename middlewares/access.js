const crypto = require('crypto');

const ROLE_ALIASES = Object.freeze({
  cocinero: 'cocina',
  bartender: 'bar'
});

const ROLES = Object.freeze({
  ADMIN: 'admin',
  GERENTE: 'gerente',
  CAJERO: 'cajero',
  MESERO: 'mesero',
  COCINA: 'cocina',
  BAR: 'bar'
});

const ROLE_PERMISSIONS = Object.freeze({
  admin: ['*'],
  gerente: [
    'dashboard.view', 'orders.view', 'orders.create', 'orders.edit', 'orders.send',
    'orders.cancel', 'orders.move', 'kds.view', 'kds.prepare', 'kds.complete',
    'kds.serve', 'floorplan.view', 'floorplan.edit', 'products.view', 'products.edit',
    'customers.view', 'customers.edit', 'sales.view', 'sales.invoice', 'sales.void',
    'cash.view', 'cash.open', 'cash.close', 'waste.view', 'waste.create',
    'waste.delete', 'reports.view', 'users.manage', 'restaurant.manage'
  ],
  cajero: [
    'dashboard.view', 'orders.view', 'orders.create', 'orders.edit', 'orders.send',
    'orders.cancel', 'orders.move', 'kds.view', 'kds.prepare', 'kds.complete',
    'kds.serve', 'floorplan.view', 'products.view', 'products.edit', 'customers.view',
    'customers.edit', 'sales.view', 'sales.invoice', 'cash.view', 'cash.open',
    'cash.close', 'waste.view', 'waste.create', 'reports.view'
  ],
  mesero: [
    'dashboard.view', 'orders.view', 'orders.create', 'orders.edit', 'orders.send',
    'orders.move', 'kds.view', 'kds.serve', 'floorplan.view', 'products.view',
    'customers.view', 'customers.edit'
  ],
  cocina: ['kds.view', 'kds.prepare', 'kds.complete'],
  bar: ['kds.view', 'kds.prepare', 'kds.complete']
});

function normalizeRole(role) {
  const raw = String(role || '').trim().toLowerCase();
  return ROLE_ALIASES[raw] || raw;
}

function requireRoles(...roles) {
  const allowed = new Set(roles.flat().map(normalizeRole));
  return (req, res, next) => {
    const usuario = req.session?.usuario;
    if (!usuario) return res.redirect('/login');
    const role = normalizeRole(usuario.rol);
    if (!allowed.has(role)) {
      return res.status(403).render('error', {
        error: { message: 'No tienes permisos suficientes para acceder a esta sección.', status: 403 }
      });
    }
    usuario.rol = role;
    next();
  };
}

function hasPermission(role, permission) {
  const permissions = ROLE_PERMISSIONS[normalizeRole(role)] || [];
  return permissions.includes('*') || permissions.includes(permission);
}

function requirePermission(permission) {
  return (req, res, next) => {
    const usuario = req.session?.usuario;
    if (!usuario) return res.redirect('/login');
    usuario.rol = normalizeRole(usuario.rol);
    if (!hasPermission(usuario.rol, permission)) {
      const payload = { error: { message: 'No tienes permiso para realizar esta operación.', status: 403 } };
      if (req.accepts('html', 'json') === 'json') return res.status(403).json(payload.error);
      return res.status(403).render('error', payload);
    }
    next();
  };
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function requireSuperadmin(req, res, next) {
  const expectedUser = process.env.SUPERADMIN_USER;
  const expectedPassword = process.env.SUPERADMIN_PASSWORD;

  if (!expectedUser || !expectedPassword) {
    return res.status(503).send('SuperAdmin deshabilitado: configura SUPERADMIN_USER y SUPERADMIN_PASSWORD en el servidor.');
  }

  const header = String(req.headers.authorization || '');
  if (!header.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="MarrocosPOS SuperAdmin", charset="UTF-8"');
    return res.status(401).send('Autenticación requerida.');
  }

  let decoded = '';
  try { decoded = Buffer.from(header.slice(6), 'base64').toString('utf8'); } catch (_) {}
  const sep = decoded.indexOf(':');
  const user = sep >= 0 ? decoded.slice(0, sep) : '';
  const password = sep >= 0 ? decoded.slice(sep + 1) : '';

  if (!safeEqual(user, expectedUser) || !safeEqual(password, expectedPassword)) {
    res.setHeader('WWW-Authenticate', 'Basic realm="MarrocosPOS SuperAdmin", charset="UTF-8"');
    return res.status(401).send('Credenciales inválidas.');
  }
  next();
}

function sameOriginForMutations(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  const origin = req.get('origin');
  const host = req.get('host');
  if (!origin) return next(); // formularios tradicionales / clientes que no envían Origin
  try {
    const parsed = new URL(origin);
    if (parsed.host !== host) return res.status(403).json({ error: 'Origen no permitido.' });
  } catch (_) {
    return res.status(403).json({ error: 'Origen inválido.' });
  }
  next();
}

module.exports = {
  ROLES,
  ROLE_PERMISSIONS,
  normalizeRole,
  hasPermission,
  requireRoles,
  requirePermission,
  requireSuperadmin,
  sameOriginForMutations
};
