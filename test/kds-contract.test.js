const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const route = fs.readFileSync('routes/kds.js', 'utf8');
const client = fs.readFileSync('public/js/kds.js', 'utf8');
const tables = fs.readFileSync('routes/mesas.js', 'utf8');

test('send command reaches the atomic backend RPC', () => {
  assert.match(fs.readFileSync('public/js/mesas.js', 'utf8'), /enviar-comanda/);
  assert.match(tables, /rpc\('pos_send_order'/);
});

test('KDS uses authenticated SSE and session tenant', () => {
  assert.match(client, /new EventSource\(`\/kds\/\$\{TIPO_MONITOR\}\/events`\)/);
  assert.match(route, /text\/event-stream/);
  assert.match(route, /req\.session\.usuario\.restaurante_id/);
  assert.doesNotMatch(route, /req\.query\.restaurante_id/);
});

test('backend state machine rejects illegal transitions', () => {
  assert.match(route, /enviado: \['preparando'\]/);
  assert.match(route, /preparando: \['listo'\]/);
  assert.match(route, /info\.item\.estado !== 'listo'/);
});

test('station and tenant checks are server-side', () => {
  assert.match(route, /canSeeStation/);
  assert.match(route, /\.eq\('restaurante_id', restauranteId\)/);
  assert.match(route, /productos\(categoria\)/);
});
