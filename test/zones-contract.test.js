const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

test('POS filtra mesas por zona y conserva especiales', () => {
  const route = read('routes', 'mesas.js');
  const view = read('views', 'mesas.ejs');

  assert.match(route, /from\('areas_restaurante'\)/);
  assert.match(route, /zonaSolicitada/);
  assert.match(route, /especialesCount/);
  assert.match(route, /areasConConteo/);
  assert.match(route, /zonaSolicitada === 'zonas'/);
  assert.match(view, /\?zona=/);
  assert.match(view, /zonaActiva === 'zonas'/);
  assert.match(view, /Personas/);
  assert.match(view, /Disponibles/);
  assert.match(view, /Todas/);
  assert.match(view, /Especiales/);
  assert.match(view, /capacidad/);
});
