const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { formatTimeInTimeZone } = require('../utils/business-time');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

test('el detalle del pedido incluye autor, comanda y hora exacta', () => {
  const route = read('routes', 'registro_pedidos.js');
  const view = read('views', 'registro_pedidos.ejs');

  assert.match(route, /usuario_id/);
  assert.match(route, /usuarios:usuario_id\(nombre\)/);
  assert.match(route, /comanda_numero/);
  assert.match(route, /formatTimeInTimeZone/);
  assert.match(route, /hora_local/);
  assert.match(route, /enviado_local/);
  assert.match(view, /Ingresado por/);
  assert.match(view, /Hora de ingreso/);
  assert.match(view, /usuario_nombre/);
  assert.match(view, /hora_local/);
  assert.match(view, /Comanda #/);
  assert.match(view, /Enviado:/);
  assert.doesNotMatch(view, /new Date\(p\.created_at\)/);
});

test('las horas de la BD sin zona se interpretan como UTC', () => {
  const formatted = formatTimeInTimeZone(
    'America/El_Salvador',
    '2026-11-08T14:47:13.756683',
    { seconds: true }
  );
  assert.match(formatted, /0?8:47:13/);
});
