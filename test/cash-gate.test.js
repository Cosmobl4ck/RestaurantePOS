const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

test('el POS exige caja abierta y redirige a /caja', () => {
  const server = read('server.js');
  const gate = read('middlewares', 'cashGate.js');
  const caja = read('routes', 'caja.js');
  const view = read('views', 'caja.ejs');

  assert.match(server, /require\('\.\/middlewares\/cashGate'\)/);
  assert.match(server, /app\.use\(cashGate\)/);

  for (const route of ['/mesas', '/kds', '/facturas', '/registro-pedidos']) {
    assert.match(gate, new RegExp(`'${route.replace('/', '\\/')}'`));
  }
  assert.match(gate, /from\('cortes_caja'\)/);
  assert.match(gate, /estado', 'abierta'/);
  assert.match(gate, /CAJA_CERRADA/);
  assert.match(gate, /render\('caja-cerrada'/);
  assert.match(gate, /puedeAbrir/);
  assert.match(gate, /\['admin', 'gerente'\]\.includes\(rol\)/);

  assert.match(caja, /req\.session\.cajaAbierta = \{ at: Date\.now\(\), abierta: true \}/);
  assert.match(caja, /req\.session\.cajaAbierta = \{ at: Date\.now\(\), abierta: false \}/);
  assert.match(view, /No hay caja abierta/);
});
