const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

test('el POS muestra ficha de producto sin agregarlo al pedido', () => {
  const view = read('views', 'mesas.ejs');
  const client = read('public', 'js', 'mesas.js');

  assert.match(view, /id="modalInfoProducto"/);
  assert.match(view, /id="infoProductoIngredientes"/);
  assert.match(view, /id="infoProductoAlergenos"/);
  assert.match(view, /id="infoProductoTiempo"/);
  assert.match(view, /id="infoProductoAlergiaCheck"/);
  assert.match(client, /window\.abrirInfoProducto/);
  assert.match(client, /producto-info-btn/);
  assert.match(client, /stopPropagation\(\)/);
  assert.match(client, /alergia_aviso/);
});

test('el producto guarda descripción, ingredientes, alérgenos y tiempo', () => {
  const route = read('routes', 'productos.js');
  const view = read('views', 'productos.ejs');

  assert.match(route, /descripcion_corta/);
  assert.match(route, /ingredientes/);
  assert.match(route, /tiempo_preparacion_minutos/);
  assert.match(route, /pos_sync_product_allergens/);
  assert.match(route, /producto_alergenos\(alergenos/);
  assert.match(view, /id="descripcion_corta"/);
  assert.match(view, /id="ingredientes"/);
  assert.match(view, /id="tiempo_preparacion_minutos"/);
  assert.match(view, /name="alergenos"/);
});

test('la comanda lleva snapshot de alérgenos y aviso de alergia', () => {
  const route = read('routes', 'mesas.js');
  const kdsRoute = read('routes', 'kds.js');
  const kdsClient = read('public', 'js', 'kds.js');

  assert.match(route, /p_alergia_aviso/);
  assert.match(kdsRoute, /\*,/);
  assert.match(kdsClient, /tiempo_preparacion_minutos/);
  assert.match(kdsClient, /alergia_aviso/);
});
