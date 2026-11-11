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

test('area cards persist position and size and receive their tables', () => {
  assert.match(route, /pos_x/);
  assert.match(route, /pos_y/);
  assert.match(route, /ancho_tarjeta/);
  assert.match(route, /alto_tarjeta/);
  assert.match(route, /mesasPorArea/);
  assert.match(fs.readFileSync('views/lista-areas.ejs', 'utf8'), /ancho_tarjeta/);
});

test('PostgREST retention filters keep current croquis identifiers', () => {
  assert.match(route, /`\(\$\{idsActuales\.join\(','\)\}\)`/);
  assert.match(route, /`\(\$\{idsExternos\.join\(','\)\}\)`/);
  assert.doesNotMatch(route, /map\(i => `?'\$\{i\}'`?\)/);
});
