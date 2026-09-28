const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeRole, hasPermission } = require('../middlewares/access');

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
  for (const role of ['cajero', 'mesero', 'cocina', 'bar']) {
    assert.equal(hasPermission(role, 'users.manage'), false, role);
    assert.equal(hasPermission(role, 'restaurant.manage'), false, role);
  }
  assert.equal(hasPermission('cocina', 'sales.invoice'), false);
  assert.equal(hasPermission('bar', 'floorplan.edit'), false);
});
