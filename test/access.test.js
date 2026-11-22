const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeRole, hasPermission } = require('../middlewares/access');
const fs = require('node:fs');
const path = require('node:path');

test('normaliza exclusivamente los aliases históricos de roles', () => {
  assert.equal(normalizeRole('cocinero'), 'cocina');
  assert.equal(normalizeRole('bartender'), 'bar');
  assert.equal(normalizeRole('GERENTE'), 'gerente');
});

test('cada rol canónico tiene el acceso esperado', () => {
  assert.equal(hasPermission('admin', 'users.manage'), true);
  assert.equal(hasPermission('gerente', 'restaurant.manage'), true);
  assert.equal(hasPermission('cajero', 'sales.invoice'), true);
  assert.equal(hasPermission('mesero', 'orders.send'), true);
  assert.equal(hasPermission('cocina', 'kds.prepare'), true);
  assert.equal(hasPermission('bar', 'kds.complete'), true);
});

test('los roles operativos no heredan permisos administrativos', () => {
  for (const role of ['cajero', 'host', 'mesero', 'cocina', 'bar']) {
    assert.equal(hasPermission(role, 'users.manage'), false, role);
    assert.equal(hasPermission(role, 'restaurant.manage'), false, role);
  }
  assert.equal(hasPermission('cocina', 'sales.invoice'), false);
  assert.equal(hasPermission('bar', 'floorplan.edit'), false);
  assert.equal(hasPermission('host', 'orders.view'), true);
  assert.equal(hasPermission('host', 'floorplan.view'), true);
  assert.equal(hasPermission('host', 'floorplan.edit'), false);
  assert.equal(hasPermission('host', 'sales.invoice'), false);
  assert.equal(hasPermission('host', 'cash.view'), false);
});

test('la matriz aplicada separa edición de borrado y cierra acciones sensibles', () => {
  // Productos: cajero solo consulta.
  assert.equal(hasPermission('cajero', 'products.view'), true);
  assert.equal(hasPermission('cajero', 'products.edit'), false);
  assert.equal(hasPermission('cajero', 'products.delete'), false);
  assert.equal(hasPermission('gerente', 'products.edit'), true);
  assert.equal(hasPermission('gerente', 'products.delete'), true);

  // Cancelar pedidos: mesero no.
  assert.equal(hasPermission('mesero', 'orders.cancel'), false);
  assert.equal(hasPermission('cajero', 'orders.cancel'), true);

  // Reportes: mesero no.
  assert.equal(hasPermission('mesero', 'reports.view'), false);
  assert.equal(hasPermission('cajero', 'reports.view'), true);

  // Clientes: mesero edita, no borra.
  assert.equal(hasPermission('mesero', 'customers.edit'), true);
  assert.equal(hasPermission('mesero', 'customers.delete'), false);
  assert.equal(hasPermission('cajero', 'customers.delete'), true);

  // Desperdicios: cajero registra, no borra.
  assert.equal(hasPermission('cajero', 'waste.create'), true);
  assert.equal(hasPermission('cajero', 'waste.delete'), false);
  assert.equal(hasPermission('gerente', 'waste.delete'), true);

  // KDS: mesero fuera.
  assert.equal(hasPermission('mesero', 'kds.view'), false);
  assert.equal(hasPermission('cocina', 'kds.view'), true);
});

test('las rutas sensibles exigen el permiso específico', () => {
  const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8');
  assert.match(read('routes', 'mesas.js'), /requirePermission\('orders\.cancel'\)/);
  assert.match(read('routes', 'mesas.js'), /requirePermission\('sales\.invoice'\)/);
  assert.match(read('routes', 'productos.js'), /requirePermission\('products\.delete'\)/);
  assert.match(read('routes', 'clientes.js'), /requirePermission\('customers\.delete'\)/);
  assert.match(read('routes', 'desperdicios.js'), /requirePermission\('waste\.delete'\)/);
  assert.match(read('routes', 'facturas.js'), /requirePermission\('sales\.void'\)/);
  assert.match(read('routes', 'caja.js'), /requirePermission\('cash\.open'\)/);
  assert.match(read('routes', 'caja.js'), /requirePermission\('cash\.close'\)/);
});

test('el limitador de login cuenta fallos, no autenticaciones validas', () => {
  const auth = fs.readFileSync(path.resolve(__dirname, '..', 'routes', 'auth.js'), 'utf8');
  assert.match(auth, /skipSuccessfulRequests:\s*true/);
  assert.match(auth, /status\(401\)\.render\('login'/);
  assert.match(auth, /status\(403\)\.render\('login'/);
});
