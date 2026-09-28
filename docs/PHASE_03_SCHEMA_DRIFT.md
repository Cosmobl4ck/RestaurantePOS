# Phase 03: live schema drift and migration gate

Source facts were supplied from an authenticated read-only inspection of project `dnqkeqvyqtfnhhxxvamw` (`Marroco'sPOS`, PostgreSQL 17.6.1, `us-west-2`). Codex did not perform additional live queries and did not apply SQL.

## Confirmed live baseline

| Table | Rows |
|---|---:|
| restaurantes | 4 |
| usuarios | 6 |
| productos | 13 |
| clientes | 1 |
| mesas | 48 |
| pedidos | 16 |
| pedido_items | 45 |
| facturas | 11 |

Roles are `admin: 4`, `cocinero: 1`, `bartender: 1`. `app_sessions` and `facturas.pedido_id` are absent. No `pos_*` RPC is installed. `areas_restaurante`, `croquis_areas`, `pedido_items_temporales`, and the KDS state columns already exist and must not be recreated.

## Pre-migration check

Run in the SQL editor and retain the result with the backup record:

```sql
select rol,count(*) from public.usuarios group by rol order by rol;
select count(*) as id_externo_nonnull from public.mesas where id_externo is not null;
select count(*) from public.facturas;
select to_regclass('public.app_sessions') as app_sessions;
select routine_name from information_schema.routines where routine_schema='public' and routine_name like 'pos_%' order by 1;
```

Expected immediately before apply: roles `admin=4,cocinero=1,bartender=1`; `id_externo_nonnull=0`; `facturas=11`; `app_sessions=null`; no `pos_*` rows. Any difference closes the gate and requires a new review.

## Change and risk inventory

- Rows affected: exactly two role rows are expected; historical invoices are not backfilled.
- DDL: one role check, one private session table, nullable `facturas.pedido_id`, one FK, tenant-aware uniqueness for `mesas.id_externo`, eight RPCs, and query-driven indexes.
- Grants: operational tables are revoked from `anon`/`authenticated`; `storage.*` is untouched. RPC execution is limited to `service_role`.
- Views: two waste-report views are changed to `security_invoker=true`.
- Risk: MEDIUM/HIGH because the legacy schema has no migration history and exact column compatibility must be confirmed in staging.

## Rollback notes

Rollback is possible only after stopping application writes. Restore the backup for the safest rollback. A manual rollback must revoke/drop the eight new RPCs, drop the new indexes/FK/column/session table, restore the original single-column `id_externo` constraint, restore legacy roles and their check, restore prior table grants, and reset both views. Do not run a generic rollback on production without first capturing the pre-apply grants and constraint names.

## Deferred security items

The exact signatures and definitions of `descontar_stock_desde_temp`, `fn_sync_stock_temporales`, and `fn_set_updated_at` were not supplied, so their mutable `search_path` is not changed by this migration. The 18 policy-less RLS tables and nine auth-initplan warnings are documented, not replaced with fictitious `auth.uid()` policies because restaurant identity comes from Express sessions.

## Gate

Migration file: `supabase/migrations/20260928214312_reconcile_restaurant_pos_live.sql`.

Status: ready for staging syntax/schema validation, but **not ready for live apply** until a backup exists and the preflight queries match.
