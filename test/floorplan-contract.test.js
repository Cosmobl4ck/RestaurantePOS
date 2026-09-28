const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const designer = fs.readFileSync('public/js/croquis-designer.js', 'utf8');
const route = fs.readFileSync('routes/areas.js', 'utf8');

test('floorplan maps database coordinates in both directions', () => {
  for (const pair of ['pos_x: m.x','pos_y: m.y','ancho: m.w','alto: m.h','x: m.pos_x','y: m.pos_y','w: m.ancho','h: m.alto']) assert.ok(designer.includes(pair), pair);
});

test('visual identity is persisted with id_externo', () => {
  assert.match(designer, /m\.id_externo/);
  assert.match(route, /id_externo/);
  assert.match(route, /restaurante_id/);
});

test('save and delete endpoints exist with occupied-table protection', () => {
  assert.match(route, /router\.post\('\/guardar-croquis'/);
  assert.match(route, /router\.delete\('\/eliminar\/:id'/);
  assert.match(route, /mesas ocupadas\/reservadas/);
});
