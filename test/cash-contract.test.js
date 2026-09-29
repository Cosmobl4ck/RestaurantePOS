const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { serializeForHtmlScript } = require('../utils/safe-json');
const { dateInTimeZone } = require('../utils/business-time');

const read = (relative) => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
const migration = read('supabase/migrations/20260929080623_harden_cash_operations.sql').toLowerCase();
const route = read('routes/caja.js');
const view = read('views/caja.ejs');
const alerts = read('public/js/alerts.js');

test('cash migration establishes timezone, constraints and one open cash per tenant', () => {
  assert.match(migration, /add column timezone text not null default 'america\/el_salvador'/);
  assert.match(migration, /create unique index uq_cortes_caja_restaurante_abierta[\s\S]+where estado = 'abierta'/);
  for (const constraint of ['monto_apertura_nonnegative', 'monto_cierre_nonnegative', 'ventas_efectivo_nonnegative', 'turno_check']) {
    assert.match(migration, new RegExp(`cortes_caja_${constraint}`));
  }
  assert.match(migration, /pg_catalog\.pg_timezone_names/);
  assert.match(migration, /at time zone v_timezone\)::date/);
});

test('cash RPCs are invoker-only, private and close under a row lock', () => {
  for (const name of ['pos_open_cash', 'pos_close_cash']) {
    assert.match(migration, new RegExp(`create or replace function public\\.${name}\\(`));
    assert.match(migration, new RegExp(`revoke execute on function public\\.${name}\\([\\s\\S]+?from public, anon, authenticated`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${name}\\([\\s\\S]+?to service_role`));
  }
  assert.equal((migration.match(/security invoker/g) || []).length, 2);
  assert.equal((migration.match(/set search_path = ''/g) || []).length, 2);
  assert.match(migration, /from public\.cortes_caja c[\s\S]+for update/);
  assert.match(migration, /f\.forma_pago = 'efectivo'/);
  assert.match(migration, /f\.estado = 'activa'/);
});

test('cash routes validate input and delegate financial writes to RPCs', () => {
  assert.match(route, /Joi\.object/);
  assert.match(route, /rpc\('pos_open_cash'/);
  assert.match(route, /rpc\('pos_close_cash'/);
  assert.doesNotMatch(route, /from\('facturas'\)/);
  assert.doesNotMatch(route, /from\('cortes_caja'\)[\s\S]{0,120}\.update\(/);
  assert.doesNotMatch(route, /hoyISO|toISOString\(\)\.split/);
  assert.match(route, /JSON\.stringify\(detalles \|\| \{\}\)/);
});

test('cash view renders the live monto_apertura column', () => {
  assert.match(view, /c\.monto_apertura/);
  assert.match(view, /caja\.monto_apertura/);
  assert.doesNotMatch(view, /c(?:aja)?\.monto_inicial/);
});

test('alert helper renders messages as text without inline handlers', () => {
  assert.match(alerts, /createTextNode\(String\(mensaje/);
  assert.match(alerts, /addEventListener\('click'/);
  assert.doesNotMatch(alerts, /innerHTML|onclick=/);
});

test('safe JSON neutralizes script breakouts and preserves roundtrip', () => {
  const payload = {
    close: '</script><script>alert(1)</script>',
    svg: '<svg/onload=alert(1)>',
    amp: '&',
    separators: '\u2028\u2029'
  };
  const serialized = serializeForHtmlScript(payload);
  assert.doesNotMatch(serialized, /<|>|&|\u2028|\u2029/u);
  assert.deepEqual(JSON.parse(serialized), payload);
});

test('business date is independent from the host timezone', () => {
  const instant = new Date('2026-09-29T05:30:00.000Z');
  assert.equal(dateInTimeZone('America/El_Salvador', instant), '2026-09-28');
  assert.equal(dateInTimeZone('Pacific/Kiritimati', instant), '2026-09-29');
  assert.throws(() => dateInTimeZone('Invalid/Timezone', instant), RangeError);
});
