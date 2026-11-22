const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

test('Sprint 1: propina configurable y separada en factura', () => {
  const migration = read('supabase', 'migrations', '20261121190000_sprint1_propina_incidentes.sql');
  const discountMigration = read('supabase', 'migrations', '20261121200000_cobro_descuentos.sql');
  const maxTip = read('supabase', 'migrations', '20261121201000_propina_max_10.sql');
  const config = read('routes', 'configuracion.js');
  const mesas = read('routes', 'mesas.js');
  const factura = read('views', 'factura.ejs');

  assert.match(migration, /propina_porcentaje/);
  assert.match(migration, /add column if not exists propina/);
  assert.match(discountMigration, /descuento_porcentaje/);
  assert.match(discountMigration, /facturas_subtotal_nonnegative/);
  assert.match(maxTip, /propina_porcentaje <= 10/);
  assert.match(config, /router\.post\('\/propina'/);
  assert.match(config, /\['admin', 'gerente'\]/);
  assert.match(mesas, /async function aplicarAjustes/);
  assert.match(mesas, /propina_porcentaje/);
  assert.match(mesas, /descuento_porcentaje/);
  assert.match(factura, /Propina \(/);
  assert.match(factura, /Descuento \(/);
});

test('Sprint 1: caja puede ajustar propina 10/5/0 y descuento', () => {
  const client = read('public', 'js', 'mesas.js');
  assert.match(client, /Descuento y propina/);
  assert.match(client, /swalDescPct/);
  assert.match(client, /swalTipPct/);
  assert.match(client, /swalFormaPago/);
  assert.match(client, /propinaPedido/);
  assert.match(client, /quitar 5%/);
  assert.match(client, /quitar \$\{propinaConfigurada\}%/);
  assert.match(client, /Otro %/);
  assert.match(client, /descuento_motivo/);
});

test('Sprint 1: aviso de licencia y atajo Alt+H', () => {
  const middleware = read('middlewares', 'authMiddleware.js');
  const navbar = read('views', 'partials', 'navbar.ejs');
  const cerrada = read('views', 'caja-cerrada.ejs');

  assert.match(middleware, /function avisoLicencia/);
  assert.match(middleware, /dias > 5/);
  assert.match(navbar, /licenseNotice/);
  assert.match(navbar, /Renovar plan/);
  assert.match(cerrada, /Alt<\/kbd> \+ <kbd>H/);
  assert.match(cerrada, /event\.altKey/);
  assert.match(cerrada, /toLowerCase\(\) === 'h'/);
});

test('Sprint 1: baja de empleado como incidente y modulo de faltas', () => {
  const migration = read('supabase', 'migrations', '20261121190000_sprint1_propina_incidentes.sql');
  const auth = read('routes', 'auth.js');
  const register = read('views', 'register.ejs');
  const faltas = read('views', 'faltas.ejs');

  assert.match(migration, /incidentes_empleados/);
  assert.match(migration, /tipo text not null check/);
  assert.match(auth, /router\.get\('\/register\/faltas'/);
  assert.match(auth, /router\.post\('\/register\/faltas'/);
  assert.match(auth, /router\.post\('\/register\/:id\/baja'/);
  assert.match(auth, /tipo: 'baja'/);
  assert.match(register, /btn-baja-empleado/);
  assert.match(faltas, /Faltas de empleados/);
});
