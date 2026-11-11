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

test('pos_open_order recovers an existing order before checking table availability', () => {
  const fix = fs.readFileSync(
    path.join(__dirname, '../supabase/migrations/20261108120000_fix_pos_open_order_existing.sql'),
    'utf8'
  ).toLowerCase();

  const existingOrder = fix.indexOf("estado not in ('cerrado', 'cancelado')");
  const availability = fix.indexOf("if m.estado <> 'libre'");

  assert.ok(existingOrder > 0 && availability > existingOrder);
  assert.match(fix, /order by id desc/);
  assert.match(fix, /jsonb_build_object\('existing', true\)/);
  assert.match(fix, /revoke execute on function public\.pos_open_order/);
  assert.match(fix, /grant execute on function public\.pos_open_order/);
});

test('order items record the user who entered them', () => {
  const actor = fs.readFileSync(
    path.join(__dirname, '../supabase/migrations/20261108130000_add_order_item_actor.sql'),
    'utf8'
  ).toLowerCase();

  assert.match(actor, /alter table public\.pedido_items\s+add column if not exists usuario_id bigint/);
  assert.match(actor, /create or replace function public\.pos_add_order_item\(/);
  assert.match(actor, /p_usuario_id bigint/);
  assert.match(actor, /insert into public\.pedido_items\([^)]*usuario_id/s);
  assert.match(actor, /perform 1\s+from public\.usuarios/);
  assert.match(actor, /revoke execute on function public\.pos_add_order_item\([^)]*bigint\)\s+from public, anon, authenticated/s);
  assert.match(actor, /grant execute on function public\.pos_add_order_item\([^)]*bigint\)\s+to service_role/s);
  assert.match(actor, /notify pgrst, 'reload schema'/);
});

test('product info, allergens and prep time are snapshotted for KDS', () => {
  const fix = fs.readFileSync(
    path.join(__dirname, '../supabase/migrations/20261110130000_add_product_info_allergens_and_prep_time.sql'),
    'utf8'
  ).toLowerCase();

  assert.match(fix, /add column if not exists descripcion_corta text/);
  assert.match(fix, /add column if not exists ingredientes text/);
  assert.match(fix, /add column if not exists tiempo_preparacion_minutos integer/);
  assert.match(fix, /create table if not exists public\.alergenos/);
  assert.match(fix, /create table if not exists public\.producto_alergenos/);
  assert.match(fix, /create or replace function public\.pos_sync_product_allergens/);
  assert.match(fix, /add column if not exists alergenos text\[\] not null default '\{\}'/);
  assert.match(fix, /add column if not exists alergia_aviso text/);
  assert.match(fix, /tiempo_preparacion_minutos, alergenos, alergia_aviso/);
  assert.match(fix, /revoke execute on function public\.pos_add_order_item\(/);
  assert.match(fix, /grant execute on function public\.pos_add_order_item\(/);
});

test('invoice keeps the order client, cleans the table and preserves line order', () => {
  const fix = fs.readFileSync(
    path.join(__dirname, '../supabase/migrations/20261110120000_fix_invoice_client_and_area_layout.sql'),
    'utf8'
  ).toLowerCase();

  assert.match(fix, /add column if not exists pos_x integer/);
  assert.match(fix, /add column if not exists ancho_tarjeta integer/);
  assert.match(fix, /p\.cliente_id/);
  assert.match(fix, /m\.descripcion/);
  assert.match(fix, /mesero_id=null/);
  assert.match(fix, /personas_actuales=0/);
  assert.match(fix, /hora_apertura=null/);
  assert.match(fix, /reservada=false/);
  assert.match(fix, /order by id/);
  assert.match(fix, /revoke execute on function public\.pos_invoice_order/);
  assert.match(fix, /grant execute on function public\.pos_invoice_order/);
});

