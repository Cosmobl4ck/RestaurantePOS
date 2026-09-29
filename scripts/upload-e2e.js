require('dotenv').config({ quiet: true });

const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');

if (process.env.RUN_UPLOAD_E2E !== '1') {
  console.error('Upload E2E disabled. Set RUN_UPLOAD_E2E=1 explicitly.');
  process.exit(2);
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE;
if (!url || !key || !process.env.SESSION_SECRET) throw new Error('Missing upload E2E environment.');
if (url !== 'https://dnqkeqvyqtfnhhxxvamw.supabase.co') throw new Error('Unexpected Supabase project.');

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const base = `http://127.0.0.1:${process.env.PORT || 3010}`;
const marker = `E2E_UPLOAD_${Date.now()}`;
const pin = `8${String(Date.now()).slice(-7)}`;
let tenantId;
let cookie = '';
const sessionIds = new Set();
let passed = 0;

function pass(name) { passed++; console.log(`PASS ${name}`); }
async function dbData(promise, label) {
  const { data, error } = await promise;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}
async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (cookie) headers.set('cookie', cookie);
  const response = await fetch(`${base}${path}`, { ...options, headers, redirect: 'manual' });
  const setCookie = response.headers.get('set-cookie');
  if (setCookie?.startsWith('marrocos.sid=')) {
    cookie = setCookie.split(';')[0];
    const raw = decodeURIComponent(cookie.split('=').slice(1).join('=')).replace(/^s:/, '');
    sessionIds.add(raw.split('.')[0]);
  }
  return response;
}
async function upload(path, field, bytes, filename, type, fields = {}) {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.append(name, String(value));
  form.append(field, new Blob([bytes], { type }), filename);
  return request(path, { method: 'POST', body: form, headers: { origin: base } });
}
function expect(response, status, name) {
  assert.equal(response.status, status, `${name}: expected ${status}, got ${response.status}`);
  pass(name);
}
async function cleanup() {
  for (const sid of sessionIds) await db.from('app_sessions').delete().eq('sid', sid);
  if (tenantId) await db.from('restaurantes').delete().eq('id', tenantId);
  const { data } = await db.from('restaurantes').select('id').like('codigo_negocio', 'E2E_UPLOAD_%');
  if (data?.length) await db.from('restaurantes').delete().in('id', data.map((row) => row.id));
}

async function main() {
  await cleanup();
  const tenant = (await dbData(db.from('restaurantes').insert({
    nombre_comercial: marker, codigo_negocio: marker, estado: 'activo', plan: 'trial',
    fecha_vencimiento: new Date(Date.now() + 86400000).toISOString(), timezone: 'America/El_Salvador'
  }).select('*').single(), 'create tenant'));
  tenantId = tenant.id;
  const hash = await bcrypt.hash(pin, 8);
  await dbData(db.from('usuarios').insert({ restaurante_id: tenant.id, nombre: `${marker}_ADMIN`, rol: 'admin', pin_hash: hash, estado: 1 }), 'create user');

  const login = await request('/login', {
    method: 'POST', body: new URLSearchParams({ codigo_negocio: marker, nombre: `${marker}_ADMIN`, pin }),
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: base }
  });
  expect(login, 302, 'minimal authenticated fixture');

  expect(await upload('/productos/importar', 'archivo', Buffer.from('plain text'), 'fake.xlsx', 'text/plain'), 400, 'XLSX invalid MIME');
  expect(await upload('/productos/importar', 'archivo', Buffer.from('plain text'), 'fake.txt', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'), 400, 'XLSX invalid extension');
  expect(await upload('/productos/importar', 'archivo', Buffer.alloc(5 * 1024 * 1024 + 1, 0x41), 'large.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'), 413, 'XLSX oversized');
  expect(await upload('/productos/importar', 'archivo', Buffer.from('not a zip'), 'broken.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'), 400, 'XLSX malformed signature');
  expect(await upload('/productos/importar', 'archivo', Buffer.from('504b030400000000', 'hex'), 'broken-zip.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'), 400, 'XLSX corrupt archive');
  const productCount = await db.from('productos').select('*', { count: 'exact', head: true }).eq('restaurante_id', tenant.id);
  if (productCount.error) throw productCount.error;
  assert.equal(productCount.count, 0);
  pass('XLSX negative cases create no rows');

  const fields = { nombre_negocio: marker, ancho_papel: 80, font_size: 1 };
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
  expect(await upload('/configuracion', 'logo', png, 'logo.png', 'image/png', fields), 302, 'valid PNG image');
  const stored = await dbData(db.from('configuracion_impresion').select('logo_tipo,logo_data').eq('restaurante_id', tenant.id).single(), 'read image');
  assert.equal(stored.logo_tipo, 'png'); assert.ok(stored.logo_data);
  pass('valid image persisted only for fixture tenant');

  expect(await upload('/configuracion', 'logo', Buffer.from('not an image'), 'spoof.jpg', 'image/jpeg', fields), 400, 'image MIME spoof');
  expect(await upload('/configuracion', 'logo', Buffer.alloc(3 * 1024 * 1024 + 1, 0x41), 'large.png', 'image/png', fields), 413, 'image oversized');
  const afterNegative = await dbData(db.from('configuracion_impresion').select('logo_data').eq('restaurante_id', tenant.id).single(), 'read unchanged image');
  assert.equal(afterNegative.logo_data, stored.logo_data);
  pass('negative image cases do not overwrite stored image');
}

(async () => {
  let failure;
  try { await main(); } catch (error) { failure = error; console.error(`FAIL ${error.message}`); }
  finally {
    try {
      await cleanup();
      const { count: tenants } = await db.from('restaurantes').select('*', { count: 'exact', head: true }).like('codigo_negocio', 'E2E_UPLOAD_%');
      const { count: sessions } = await db.from('app_sessions').select('*', { count: 'exact', head: true });
      assert.equal(tenants, 0); assert.equal(sessions, 0);
      pass('upload fixture and session cleanup');
    } catch (error) { failure ||= error; console.error(`CLEANUP_FAIL ${error.message}`); }
  }
  console.log(`UPLOAD_E2E_ASSERTIONS=${passed}`);
  if (failure) process.exit(1);
})().catch((error) => { console.error(`FATAL ${error.message}`); process.exit(1); });
