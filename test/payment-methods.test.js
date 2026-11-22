const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

test('el POS acepta efectivo, tarjeta y transferencia', () => {
  const route = read('routes', 'mesas.js');
  const client = read('public', 'js', 'mesas.js');
  const migration = read('supabase', 'migrations', '20261119170000_add_card_payment.sql');
  const ventas = read('views', 'ventas.ejs');

  // Backend y base de datos.
  assert.match(route, /'efectivo', 'tarjeta', 'transferencia'/);
  assert.match(migration, /'efectivo','tarjeta','transferencia'/);
  assert.match(migration, /facturas_forma_pago_check/);

  // UI de pago: opcion tarjeta, input editable y teclado numerico.
  assert.match(client, /tarjeta:/);
  assert.match(client, /inputmode: 'decimal'/);
  assert.match(client, /_focustrap/);
  assert.match(client, /const cambio = recibido - totalCobrar/);

  // Totales de ventas.
  assert.match(ventas, /totalTarjeta/);
});

test('el corte de caja separa efectivo, tarjeta y transferencia', () => {
  const route = read('routes', 'caja.js');
  const view = read('views', 'caja.ejs');
  const migration = read('supabase', 'migrations', '20261119180000_cash_reconciliation_card_transfer.sql');

  assert.match(migration, /ventas_tarjeta/);
  assert.match(migration, /ventas_transferencia/);
  assert.match(migration, /sum\(f\.total\) filter \(where f\.forma_pago = 'tarjeta'\)/);
  assert.match(migration, /sum\(f\.total\) filter \(where f\.forma_pago = 'transferencia'\)/);

  assert.match(route, /ventas_tarjeta/);
  assert.match(route, /ventas_transferencia/);
  assert.match(view, /Tarjeta/);
  assert.match(view, /Transferencia/);
  assert.match(view, /ventasTurno/);
});
