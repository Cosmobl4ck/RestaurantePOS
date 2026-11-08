const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

test('abrir una mesa ocupada recupera el pedido existente antes del RPC', () => {
  const route = read('routes', 'mesas.js');
  const openRoute = route.slice(
    route.indexOf("router.post('/abrir'"),
    route.indexOf("router.get('/pedidos/:pedidoId'")
  );

  assert.match(openRoute, /from\('pedidos'\)/);
  assert.match(openRoute, /pedidoExistente/);
  assert.match(openRoute, /existing: true/);
  assert.ok(openRoute.indexOf("from('pedidos')") < openRoute.indexOf("rpc('pos_open_order'"));
});

test('el POS maneja la respuesta de recuperación y muestra el error', () => {
  const client = read('public/js/mesas.js');

  assert.match(client, /if \(!resp\.ok\) throw new Error\(data\.error/);
  assert.match(client, /if \(!data\.pedido\?\.id\)/);
  assert.match(client, /Swal\.fire\(\{ icon: 'error', title: 'No se pudo abrir la mesa'/);
});
