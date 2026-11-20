const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const exists = (...parts) => fs.existsSync(path.join(root, ...parts));

const plans = require('../config/plans');

test('el catálogo tiene los cuatro planes y precios aprobados', () => {
  assert.deepEqual([...plans.PLAN_CODES], ['trial', 'basic', 'premium', 'gold']);
  assert.equal(plans.PLAN_DEFINITIONS.basic.precio_mensual, 19);
  assert.equal(plans.PLAN_DEFINITIONS.premium.precio_mensual, 39);
  assert.equal(plans.PLAN_DEFINITIONS.gold.precio_mensual, 79);
  assert.equal(plans.PLAN_DEFINITIONS.trial.duracion_dias, 7);
});

test('trial usa las funciones de Gold y los límites de Premium', () => {
  assert.deepEqual(
    [...plans.PLAN_DEFINITIONS.trial.features].sort(),
    [...plans.PLAN_DEFINITIONS.gold.features].sort()
  );
  assert.deepEqual(plans.PLAN_DEFINITIONS.trial.limits, plans.PLAN_DEFINITIONS.premium.limits);
});

test('Básico no incluye funciones Premium y Gold incluye DTE', () => {
  assert.equal(plans.PLAN_DEFINITIONS.basic.features.includes('kds.bar'), false);
  assert.equal(plans.PLAN_DEFINITIONS.basic.features.includes('inventario.stock'), false);
  assert.equal(plans.PLAN_DEFINITIONS.premium.features.includes('kds.bar'), true);
  assert.equal(plans.PLAN_DEFINITIONS.premium.features.includes('areas.croquis'), false);
  assert.equal(plans.PLAN_DEFINITIONS.gold.features.includes('areas.croquis'), true);
  assert.equal(plans.PLAN_DEFINITIONS.gold.features.includes('dte'), true);
  assert.equal(plans.PLAN_DEFINITIONS.gold.limits.usuarios, null);
});

test('los códigos históricos se normalizan a Gold', () => {
  assert.equal(plans.normalizePlanCode('pro_plus'), 'gold');
  assert.equal(plans.normalizePlanCode('PRO-PLUS'), 'gold');
  assert.equal(plans.normalizePlanCode('desconocido'), 'trial');
});

test('la migración crea catálogo, límites y bitácora', () => {
  const migration = read('supabase', 'migrations', '20261111120000_add_plan_catalog_and_entitlements.sql');
  for (const table of ['planes', 'plan_features', 'plan_limits', 'plan_change_log']) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}\\b`, 'i'));
  }
  assert.match(migration, /pro_plus/i);
  assert.match(migration, /notify pgrst, 'reload schema'/i);
  assert.match(migration, /enable row level security/i);
});

test('el servidor aplica guards y expone /mi-plan', () => {
  const server = read('server.js');
  assert.match(server, /requireFeature\('pos\.mesas'\)/);
  assert.match(server, /requireFeature\('kds\.bar'\)/);
  assert.match(server, /requireFeature\('inventario\.desperdicios'\)/);
  assert.match(server, /requireFeature\('areas\.croquis'\)/);
  assert.match(server, /app\.use\('\/mi-plan'/);
});

test('el gating se puede desactivar con PLAN_ENFORCEMENT', () => {
  const middleware = read('middlewares', 'planAccess.js');
  assert.match(middleware, /PLAN_ENFORCEMENT/);
  assert.match(middleware, /function requireFeature/);
  assert.match(middleware, /function enforceLimit/);
});

test('SuperAdmin valida downgrade y registra el cambio', () => {
  const superadmin = read('routes', 'superadmin.js');
  assert.match(superadmin, /getDowngradeViolations/);
  assert.match(superadmin, /plan_change_log/);
  assert.match(superadmin, /plan_anterior/);
  assert.match(superadmin, /plan_nuevo/);
});

test('las vistas de plan existen y usan la navbar', () => {
  assert.equal(exists('views', 'mi_plan.ejs'), true);
  assert.equal(exists('views', 'plan-required.ejs'), true);
  assert.match(read('views', 'mi_plan.ejs'), /include\('partials\/navbar'\)/);
  assert.match(read('views', 'plan-required.ejs'), /include\('partials\/navbar'\)/);
});
