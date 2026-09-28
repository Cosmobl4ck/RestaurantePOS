const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sql = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20260928214312_reconcile_restaurant_pos_live.sql'), 'utf8').toLowerCase();

test('migration has no destructive data/table operations', () => {
  const statements = sql.replace(/--.*$/gm, '');
  assert.doesNotMatch(statements, /\bdrop\s+table\b|\btruncate\s+(?:table\s+)?public\.|\bdelete\s+from\b/);
  for (const update of statements.match(/update\s+public\.[^;]+;/gs) || []) assert.match(update, /\bwhere\b/);
});

test('roles migrate before the canonical constraint is installed', () => {
  const updateKitchen = sql.indexOf("set rol='cocina'");
  const finalConstraint = sql.lastIndexOf("check (rol in ('admin','gerente','cajero','mesero','cocina','bar'))");
  assert.ok(updateKitchen > 0 && finalConstraint > updateKitchen);
});

test('RPC contracts are tenant-scoped, invoker and private', () => {
  for (const name of ['pos_open_order','pos_move_order','pos_add_order_item','pos_invoice_order','pos_cancel_order','pos_void_invoice','pos_send_order','pos_transition_kds']) {
    assert.match(sql, new RegExp(`create or replace function public\\.${name}\\(`));
    assert.match(sql, new RegExp(`revoke execute on function public\\.${name}\\([^;]+from public,anon,authenticated`));
    assert.match(sql, new RegExp(`grant execute on function public\\.${name}\\([^;]+to service_role`));
  }
  assert.equal((sql.match(/security invoker set search_path=''/g) || []).length, 8);
});

test('invoice idempotency remains compatible with historical nulls', () => {
  assert.match(sql, /add column pedido_id bigint null/);
  assert.match(sql, /where pedido_id is not null/);
  assert.match(sql, /exception when unique_violation/);
  assert.match(sql, /if p\.estado='cerrado' then raise exception 'pedido cerrado sin factura vinculada/);
});

test('order invariants are enforced inside the transaction', () => {
  assert.match(sql, /coalesce\(m\.reservada,false\)/);
  assert.match(sql, /d\.estado<>'libre' or coalesce\(d\.bloqueada,false\) or coalesce\(d\.reservada,false\)/);
  assert.match(sql, /unidad no soportada en comandas/);
  assert.match(sql, /if not exists\(select 1 from public\.pedidos[^;]+estado not in \('cerrado','cancelado'\)\)/s);
  assert.match(sql, /case when coalesce\(reservada,false\) then 'reservada' else 'libre' end/);
  assert.match(sql, /perform 1 from public\.usuarios where id=\$3 and restaurante_id=\$1 and estado=1/);
});

test('legacy functions and waste data are hardened', () => {
  assert.match(sql, /public\.desperdicios/);
  assert.match(sql, /alter function public\.fn_set_updated_at\(\) set search_path=''/);
  assert.match(sql, /alter function public\.fn_sync_stock_temporales\(\) set search_path=public/);
  assert.match(sql, /alter function public\.descontar_stock_desde_temp\(integer\) set search_path=public/);
});
