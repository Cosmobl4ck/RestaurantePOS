require('dotenv').config({ quiet: true });

const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const cookieSignature = require('cookie-signature');
const ExcelJS = require('exceljs');
const { createClient } = require('@supabase/supabase-js');

if (process.env.RUN_LIVE_E2E !== '1') {
  console.error('Live E2E disabled. Set RUN_LIVE_E2E=1 explicitly.');
  process.exit(2);
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE;
if (!url || !key || !process.env.SESSION_SECRET) throw new Error('Missing live E2E environment.');
if (url !== 'https://dnqkeqvyqtfnhhxxvamw.supabase.co') throw new Error('Unexpected Supabase project.');

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const base = `http://127.0.0.1:${process.env.PORT || 3010}`;
const marker = `E2E_RUNTIME_${Date.now()}`;
const pin = `9${String(Date.now()).slice(-7)}`;
const results = [];
const tenantIds = [];
const sessionIds = new Set();

function pass(name) { results.push(name); console.log(`PASS ${name}`); }
function expectStatus(response, expected, name) {
  const values = Array.isArray(expected) ? expected : [expected];
  assert.ok(values.includes(response.status), `${name}: expected ${values.join('/')} got ${response.status}`);
  pass(name);
}
async function dbResult(promise, label) {
  const { data, error } = await promise;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}
function sidFromSetCookie(value) {
  const match = String(value || '').match(/marrocos\.sid=([^;]+)/);
  return match ? decodeURIComponent(match[1]).replace(/^s%3A/, '').replace(/^s:/, '').split('.')[0] : null;
}
class Browser {
  constructor(name) { this.name = name; this.cookie = ''; }
  async request(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (this.cookie) headers.set('cookie', this.cookie);
    const response = await fetch(`${base}${path}`, { ...options, headers, redirect: options.redirect || 'manual' });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      const pair = setCookie.split(';')[0];
      if (/marrocos\.sid=;/.test(pair)) this.cookie = '';
      else if (/^marrocos\.sid=/.test(pair)) {
        this.cookie = pair;
        const sid = sidFromSetCookie(setCookie);
        if (sid) sessionIds.add(sid);
      }
    }
    return response;
  }
  async login(code, name) {
    const before = this.cookie;
    const body = new URLSearchParams({ codigo_negocio: code, nombre: name, pin });
    const response = await this.request('/login', {
      method: 'POST', body, headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base }
    });
    assert.equal(response.status, 302, `login ${name}`);
    assert.notEqual(this.cookie, before, `session fixation ${name}`);
    const setCookie = response.headers.get('set-cookie') || '';
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Strict/i);
    return response.headers.get('location');
  }
  json(path, method = 'GET', body, origin = base) {
    const options = { method, headers: { accept: 'application/json' } };
    if (origin !== null) options.headers.origin = origin;
    if (body !== undefined) {
      options.headers['content-type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    return this.request(path, options);
  }
}

async function insert(table, payload, select = '*') {
  const rows = await dbResult(db.from(table).insert(payload).select(select), `insert ${table}`);
  return Array.isArray(rows) && rows.length === 1 ? rows[0] : rows;
}

async function cleanup() {
  for (const sid of sessionIds) await db.from('app_sessions').delete().eq('sid', sid);
  if (tenantIds.length) await db.from('restaurantes').delete().in('id', tenantIds);
  const { data: leftovers } = await db.from('restaurantes').select('id').like('codigo_negocio', 'E2E_RUNTIME_%');
  if (leftovers?.length) await db.from('restaurantes').delete().in('id', leftovers.map((r) => r.id));
}

async function readSse(browser, path, mutate) {
  const controller = new AbortController();
  const response = await fetch(`${base}${path}`, { headers: { cookie: browser.cookie }, signal: controller.signal });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /text\/event-stream/);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let queues = 0;
  const deadline = Date.now() + 9000;
  try {
    while (Date.now() < deadline) {
      const chunk = await Promise.race([
        reader.read(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('SSE timeout')), 9500))
      ]);
      if (chunk.done) break;
      text += decoder.decode(chunk.value, { stream: true });
      queues = (text.match(/event: queue/g) || []).length;
      if (queues === 1 && mutate) { const fn = mutate; mutate = null; await fn(); }
      if (queues >= 2 && /heartbeat/.test(text)) break;
    }
  } finally {
    controller.abort();
    await reader.cancel().catch(() => {});
  }
  assert.ok(queues >= 2, 'SSE did not emit changed queue');
  assert.match(text, /heartbeat/);
}

async function main() {
  await cleanup();
  const hash = await bcrypt.hash(pin, 8);
  const future = new Date(Date.now() + 30 * 86400000).toISOString();
  const tenantA = await insert('restaurantes', {
    nombre_comercial: `${marker}_A`, codigo_negocio: `${marker}_A`, estado: 'activo',
    fecha_vencimiento: future, plan: 'trial', timezone: 'America/El_Salvador'
  });
  const tenantB = await insert('restaurantes', {
    nombre_comercial: `${marker}_B`, codigo_negocio: `${marker}_B`, estado: 'activo',
    fecha_vencimiento: future, plan: 'trial', timezone: 'Pacific/Kiritimati'
  });
  tenantIds.push(tenantA.id, tenantB.id);

  const roles = ['admin', 'gerente', 'cajero', 'mesero', 'cocina', 'bar'];
  const users = {};
  for (const role of roles) users[role] = await insert('usuarios', {
    restaurante_id: tenantA.id, nombre: `${marker}_${role}`, rol: role, pin_hash: hash, estado: 1
  });
  users.tenantB = await insert('usuarios', {
    restaurante_id: tenantB.id, nombre: `${marker}_admin_B`, rol: 'admin', pin_hash: hash, estado: 1
  });

  const areaA = await insert('areas_restaurante', { restaurante_id: tenantA.id, nombre: `${marker}_AREA` });
  const areaB = await insert('areas_restaurante', { restaurante_id: tenantB.id, nombre: `${marker}_AREA_B` });
  const mesaA = await insert('mesas', { restaurante_id: tenantA.id, area_id: areaA.id, id_externo: `${marker}_M1`, numero: `${marker}_M1`, estado: 'libre' });
  const mesaCroquis = await insert('mesas', { restaurante_id: tenantA.id, area_id: areaA.id, id_externo: `${marker}_MC`, numero: `${marker}_MC`, estado: 'libre' });
  const mesaB = await insert('mesas', { restaurante_id: tenantB.id, area_id: areaB.id, id_externo: `${marker}_B1`, numero: `${marker}_B1`, estado: 'libre' });
  const productRace = await insert('productos', { restaurante_id: tenantA.id, codigo: `${marker}_R`, nombre: `${marker}_RACE`, categoria: 'Cocina', maneja_stock: true, precio_unidad: 3, precio_kg: 0, precio_libra: 0, stock: 1, stock_minimo: 0 });
  const productKitchen = await insert('productos', { restaurante_id: tenantA.id, codigo: `${marker}_C`, nombre: `${marker}_COCINA`, categoria: 'Cocina', maneja_stock: true, precio_unidad: 5, precio_kg: 0, precio_libra: 0, stock: 10, stock_minimo: 0 });
  const productBar = await insert('productos', { restaurante_id: tenantA.id, codigo: `${marker}_B`, nombre: `${marker}_BAR`, categoria: 'Bar', maneja_stock: true, precio_unidad: 4, precio_kg: 0, precio_libra: 0, stock: 10, stock_minimo: 0 });

  const browsers = {};
  for (const role of roles) {
    browsers[role] = new Browser(role);
    const location = await browsers[role].login(tenantA.codigo_negocio, users[role].nombre);
    assert.equal(location, role === 'cocina' ? '/kds/cocina' : role === 'bar' ? '/kds/bar' : '/dashboard');
  }
  browsers.tenantB = new Browser('tenantB');
  await browsers.tenantB.login(tenantB.codigo_negocio, users.tenantB.nombre);
  pass('login, role landing, cookie flags and regenerated sessions');

  const sessions = await dbResult(db.from('app_sessions').select('sid,sess,updated_at'), 'read sessions');
  assert.ok(sessions.filter((row) => String(row.sess?.usuario?.nombre || '').startsWith(marker)).length >= 7);
  const beforeTouch = sessions.find((row) => row.sess?.usuario?.nombre === users.admin.nombre);
  await new Promise((resolve) => setTimeout(resolve, 30));
  await browsers.admin.request('/dashboard');
  const afterTouch = await dbResult(db.from('app_sessions').select('updated_at').eq('sid', beforeTouch.sid).single(), 'session touch');
  assert.ok(new Date(afterTouch.updated_at) >= new Date(beforeTouch.updated_at));
  pass('persistent session create/get/touch');

  const expiredSid = `${marker}_expired`;
  sessionIds.add(expiredSid);
  await insert('app_sessions', {
    sid: expiredSid,
    sess: { cookie: { expires: new Date(Date.now() - 60000).toISOString() }, usuario: { nombre: `${marker}_expired` } },
    expires_at: new Date(Date.now() - 60000).toISOString()
  });
  const expiredBrowser = new Browser('expired');
  expiredBrowser.cookie = `marrocos.sid=${encodeURIComponent(`s:${cookieSignature.sign(expiredSid, process.env.SESSION_SECRET)}`)}`;
  expectStatus(await expiredBrowser.request('/dashboard'), 302, 'expired session rejected');
  assert.equal(await dbResult(db.from('app_sessions').select('sid').eq('sid', expiredSid).maybeSingle(), 'expired session pruned'), null);
  pass('expired server-side session destroyed');

  expectStatus(await browsers.admin.request('/areas'), 200, 'admin floorplan access');
  expectStatus(await browsers.cajero.request('/areas'), 403, 'cajero floorplan denied');
  expectStatus(await browsers.mesero.request('/caja'), 403, 'mesero cash denied');
  expectStatus(await browsers.cocina.request('/kds/cocina'), 200, 'cocina station access');
  expectStatus(await browsers.cocina.request('/kds/bar'), 403, 'cocina cross-station denied');
  expectStatus(await browsers.bar.request('/kds/bar'), 200, 'bar station access');
  expectStatus(await browsers.bar.request('/kds/cocina'), 403, 'bar cross-station denied');

  expectStatus(await browsers.admin.json('/caja/abrir', 'POST', { turno: '9', monto_inicial: -1 }, 'https://evil.invalid'), 403, 'hostile Origin rejected');
  expectStatus(await browsers.admin.json('/caja/abrir', 'POST', { turno: '9', monto_inicial: -1 }, null), 400, 'missing Origin compatibility');
  expectStatus(await browsers.admin.json('/caja/abrir', 'POST', { turno: '9', monto_inicial: -1 }), 400, 'same Origin accepted before validation');

  const croquisBody = {
    area_id: areaA.id,
    areas: [{ id: `${marker}_FIG`, nombre: '</script><script>globalThis.pwned=1</script>', tipo: 'rect-h', x: 10, y: 20, w: 200, h: 140 }],
    mesas: [{ id: mesaCroquis.id_externo, numero: mesaCroquis.numero, forma: 'rect-h', capacidad: 4, pos_x: 30, pos_y: 40, ancho: 100, alto: 80, area_fig_id: `${marker}_FIG` }]
  };
  expectStatus(await browsers.admin.json('/areas/guardar-croquis', 'POST', { ...croquisBody, mesas: [] }), 200, 'croquis area save');
  assert.ok(await dbResult(db.from('croquis_areas').select('id').eq('id', `${marker}_FIG`).maybeSingle(), 'croquis area visible'));
  expectStatus(await browsers.admin.json('/areas/guardar-croquis', 'POST', croquisBody), 200, 'croquis table save');
  const editor = await browsers.admin.request(`/areas/editar-croquis/${areaA.id}`);
  const editorText = await editor.text();
  assert.ok(!editorText.includes('</script><script>globalThis.pwned=1</script>'));
  const moved = await dbResult(db.from('mesas').select('id,pos_x,pos_y').eq('restaurante_id', tenantA.id).eq('id_externo', mesaCroquis.id_externo).single(), 'croquis persisted');
  assert.equal(Number(moved.pos_x), 30); assert.equal(Number(moved.pos_y), 40);
  const reserveResponse = await browsers.admin.json('/areas/mesa/reservar', 'POST', { mesa_id: moved.id, reserva_id: null, nombre_cliente: marker, hora_reserva: new Date().toISOString() });
  expectStatus(reserveResponse, 200, 'reserve table');
  expectStatus(await browsers.admin.json('/areas/guardar-croquis', 'POST', { area_id: areaA.id, areas: [], mesas: [] }), 200, 'croquis empty save');
  assert.ok(await dbResult(db.from('mesas').select('id').eq('id', moved.id).maybeSingle(), 'occupied table retained'));
  expectStatus(await browsers.admin.json(`/areas/eliminar/${areaA.id}`, 'DELETE'), 409, 'occupied area deletion rejected');
  expectStatus(await browsers.admin.json('/areas/mesa/desbloquear', 'POST', { mesa_id: moved.id }), 200, 'reserved table unlock');
  pass('croquis persistence and safe JSON bootstrap');

  const openedResponse = await browsers.admin.json('/mesas/abrir', 'POST', { mesa_id: moved.id, cliente_nombre: marker });
  expectStatus(openedResponse, 201, 'open order HTTP');
  const opened = await openedResponse.json();
  const orderId = opened.pedido.id;
  expectStatus(await browsers.tenantB.request(`/mesas/pedidos/${orderId}`, { headers: { accept: 'application/json' } }), 404, 'cross-tenant order IDOR rejected');

  const racePayload = { producto_id: productRace.id, cantidad: 1, unidad: 'UND' };
  const raceResponses = await Promise.all([
    browsers.admin.json(`/mesas/pedidos/${orderId}/items`, 'POST', racePayload),
    browsers.mesero.json(`/mesas/pedidos/${orderId}/items`, 'POST', racePayload)
  ]);
  assert.deepEqual(raceResponses.map((r) => r.status).sort((a, b) => a - b), [201, 400]);
  const racedStock = await dbResult(db.from('productos').select('stock').eq('id', productRace.id).single(), 'stock after race');
  assert.equal(Number(racedStock.stock), 0);
  pass('real simultaneous stock contention');

  const kitchenAdd = await browsers.admin.json(`/mesas/pedidos/${orderId}/items`, 'POST', { producto_id: productKitchen.id, cantidad: 1, unidad: 'UND' });
  const barAdd = await browsers.admin.json(`/mesas/pedidos/${orderId}/items`, 'POST', { producto_id: productBar.id, cantidad: 1, unidad: 'UND' });
  expectStatus(kitchenAdd, 201, 'add kitchen item'); expectStatus(barAdd, 201, 'add bar item');
  const kitchenId = (await kitchenAdd.json()).item.id;
  const barId = (await barAdd.json()).item.id;
  expectStatus(await browsers.admin.json(`/mesas/pedidos/${orderId}/enviar-comanda`, 'POST', {}), 200, 'send command');
  const kitchenQueue = await browsers.cocina.request('/kds/cocina/cola', { headers: { accept: 'application/json' } });
  assert.ok((await kitchenQueue.json()).every((item) => item.productos.categoria === 'Cocina'));
  const barQueue = await browsers.bar.request('/kds/bar/cola', { headers: { accept: 'application/json' } });
  assert.ok((await barQueue.json()).every((item) => item.productos.categoria === 'Bar'));
  expectStatus(await browsers.bar.json(`/kds/${kitchenId}/estado`, 'PUT', { estado: 'preparando' }), 403, 'KDS cross-station transition denied');
  await readSse(browsers.cocina, '/kds/cocina/events', async () => {
    expectStatus(await browsers.cocina.json(`/kds/${kitchenId}/estado`, 'PUT', { estado: 'preparando' }), 200, 'KDS cocina preparing');
  });
  expectStatus(await browsers.cocina.json(`/kds/${kitchenId}/estado`, 'PUT', { estado: 'listo' }), 200, 'KDS cocina ready');
  expectStatus(await browsers.cocina.json(`/kds/${kitchenId}/finalizar`, 'PUT', {}), 200, 'KDS cocina served');
  expectStatus(await browsers.bar.json(`/kds/${barId}/estado`, 'PUT', { estado: 'preparando' }), 200, 'KDS bar preparing');
  expectStatus(await browsers.bar.json(`/kds/${barId}/estado`, 'PUT', { estado: 'listo' }), 200, 'KDS bar ready');
  expectStatus(await browsers.bar.json(`/kds/${barId}/finalizar`, 'PUT', {}), 200, 'KDS bar served');
  pass('KDS queues, state machines and SSE lifecycle');

  const cashRace = await Promise.all([
    browsers.admin.json('/caja/abrir', 'POST', { turno: '1', monto_inicial: 100, detalles: { 20: 5 } }),
    browsers.cajero.json('/caja/abrir', 'POST', { turno: '1', monto_inicial: 100, detalles: { 20: 5 } })
  ]);
  assert.deepEqual(cashRace.map((r) => r.status).sort((a, b) => a - b), [201, 409]);
  const openedCashResponse = cashRace.find((r) => r.status === 201);
  const cashId = (await openedCashResponse.json()).caja.id;
  pass('real simultaneous cash-open contention');
  expectStatus(await browsers.admin.json('/caja/abrir', 'POST', { turno: '3', monto_inicial: -1 }), 400, 'cash validation');
  const invoiceResponse = await browsers.admin.json(`/mesas/pedidos/${orderId}/facturar`, 'POST', { forma_pago: 'efectivo' });
  expectStatus(invoiceResponse, 200, 'invoice order HTTP');
  const closeResponse = await browsers.admin.json('/caja/cerrar', 'POST', { caja_id: cashId, monto_final: 112, detalles: { 20: 5 } });
  expectStatus(closeResponse, 200, 'close cash HTTP');
  expectStatus(await browsers.admin.json('/caja/cerrar', 'POST', { caja_id: cashId, monto_final: 112 }), 409, 'double cash close rejected');
  expectStatus(await browsers.tenantB.json('/caja/cerrar', 'POST', { caja_id: cashId, monto_final: 112 }), 404, 'cross-tenant cash close rejected');
  const excel = await browsers.admin.request(`/caja/exportar/${cashId}`);
  assert.equal(excel.status, 200); assert.match(excel.headers.get('content-type') || '', /spreadsheetml/); assert.ok((await excel.arrayBuffer()).byteLength > 1000);
  pass('cash HTTP lifecycle, tenant isolation and Excel export');

  const template = await browsers.admin.request('/productos/plantilla');
  assert.equal(template.status, 200); assert.ok((await template.arrayBuffer()).byteLength > 1000);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Productos');
  sheet.addRow(['codigo', 'nombre', 'precio_unidad', 'categoria', 'stock', 'stock_minimo']);
  sheet.addRow([`${marker}_XLSX`, `${marker}_IMPORT`, 2.5, 'Bar', 3, 1]);
  const xlsx = await workbook.xlsx.writeBuffer();
  const form = new FormData();
  form.append('archivo', new Blob([xlsx], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'productos.xlsx');
  const imported = await browsers.admin.request('/productos/importar', { method: 'POST', body: form, headers: { origin: base } });
  expectStatus(imported, 200, 'XLSX upload/import');
  assert.ok(await dbResult(db.from('productos').select('id').eq('restaurante_id', tenantA.id).eq('codigo', `${marker}_XLSX`).maybeSingle(), 'imported product'));
  pass('product template and bounded XLSX upload');

  const superadmin = await fetch(`${base}/superadmin/panel`, { redirect: 'manual' });
  assert.equal(superadmin.status, process.env.SUPERADMIN_USER && process.env.SUPERADMIN_PASSWORD ? 401 : 503);
  pass('SuperAdmin fail-closed behavior');

  const logoutBrowser = browsers.gerente;
  const logoutSid = sidFromSetCookie(`marrocos.sid=${logoutBrowser.cookie.split('=')[1]}`);
  expectStatus(await logoutBrowser.request('/logout', { method: 'POST', headers: { origin: base } }), 302, 'POST logout');
  if (logoutSid) {
    const removed = await dbResult(db.from('app_sessions').select('sid').eq('sid', logoutSid).maybeSingle(), 'logout session removed');
    assert.equal(removed, null);
  }
  pass('server-side session destroy');

  const getLogoutBrowser = new Browser('get-logout');
  await getLogoutBrowser.login(tenantA.codigo_negocio, users.admin.nombre);
  expectStatus(await getLogoutBrowser.request('/logout'), 302, 'legacy GET logout compatibility');

  const attacker = new Browser('rate-limit');
  const statuses = [];
  for (let i = 0; i < 6; i++) {
    const response = await attacker.request('/login', {
      method: 'POST', body: new URLSearchParams({ codigo_negocio: marker, nombre: marker, pin: 'wrong' }),
      headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base }
    });
    statuses.push(response.status);
  }
  assert.equal(statuses.at(-1), 429);
  pass('login rate limit after five failed attempts');
}

(async () => {
  let failure;
  try { await main(); }
  catch (error) { failure = error; console.error(`FAIL ${error.message}`); }
  finally {
    try {
      await cleanup();
      const { count: remainingTenants } = await db.from('restaurantes').select('*', { count: 'exact', head: true }).like('codigo_negocio', 'E2E_RUNTIME_%');
      const { count: remainingUsers } = await db.from('usuarios').select('*', { count: 'exact', head: true }).like('nombre', 'E2E_RUNTIME_%');
      assert.equal(remainingTenants, 0); assert.equal(remainingUsers, 0);
      pass('selective fixture and session cleanup');
    } catch (cleanupError) {
      console.error(`CLEANUP_FAIL ${cleanupError.message}`);
      failure ||= cleanupError;
    }
  }
  console.log(`LIVE_E2E_ASSERTIONS=${results.length}`);
  if (failure) process.exit(1);
})().catch((error) => { console.error(`FATAL ${error.message}`); process.exit(1); });
