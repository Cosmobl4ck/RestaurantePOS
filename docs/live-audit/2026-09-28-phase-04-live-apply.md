# Phase 04B live apply

Project: `Marroco'sPOS` (`dnqkeqvyqtfnhhxxvamw`)  
Start SHA: `455aba86dd70bc89bb8b00391815e97861cce510`  
Backup gate: waived explicitly by the owner because all application data was disposable test data.

## Reset

The project was `ACTIVE_HEALTHY` on PostgreSQL `17.6.1.121`. The reset used one explicit `TRUNCATE ... RESTART IDENTITY` statement in a transaction, without `CASCADE`.

Tables reset: `areas_restaurante`, `asistencia_empleados`, `auditoria_forense`, `clientes`, `config_notificaciones`, `configuracion_impresion`, `cortes_caja`, `croquis_areas`, `desperdicios`, `detalle_factura`, `facturas`, `mesas`, `pedido_items`, `pedido_items_temporales`, `pedidos`, `permisos`, `productos`, `reservaciones`, `restaurante_usuarios`, `restaurantes`, `usuario_restaurante`, `usuarios`.

Exact non-zero counts before reset included: restaurantes=4, usuarios=6, productos=13, clientes=1, mesas=48, pedidos=16, pedido_items=45, facturas=11, detalle_factura=23, desperdicios=1, areas_restaurante=4. All 22 selected tables were verified at zero afterward. No Supabase system schema was targeted.

## Migration

- Method: Supabase versioned migration apply
- Migration history version: `20260928224838`
- Name: `reconcile_restaurant_pos_live`
- Result: applied successfully
- Transaction: migration file contained a single explicit transaction

## Post-apply audit

Verified:

- `public.app_sessions` exists with RLS enabled and expiry index.
- `facturas.pedido_id` exists.
- Partial unique indexes exist for invoice/order and tenant-aware `mesas.id_externo`.
- All eight `pos_*` RPCs exist, are security invoker, use an empty search path, deny execute to PUBLIC/anon/authenticated, and grant execute to service_role.
- Both waste views use `security_invoker=true`.
- The three legacy functions have their intended fixed search paths.
- Migration history contains only the reconciliation migration.

Stop condition:

- `app_sessions` grants do not match the least-privilege contract. `service_role` has the intended CRUD privileges but also retains `TRUNCATE`, `REFERENCES`, and `TRIGGER`, apparently through existing/default grants.
- Required response: stop before fixtures and create a new forward-fix migration; never edit the applied migration.

## Advisors after apply

Resolved:

- 2 `security_definer_view` errors.
- 3 mutable function `search_path` warnings.

Remaining/new:

- 19 informational `rls_enabled_no_policy` findings (the new item is private `app_sessions`).
- 22 unindexed foreign-key findings.
- 9 `auth_rls_initplan` warnings.
- 29 unused-index informational findings after adding the reconciliation indexes.

## E2E status

Server/session, KDS, croquis, transactional, tenant-isolation, and cleanup E2E were not run because the schema post-check stop condition fired before fixtures were created. The business tables remain empty.

## Phase 04C Forward Fix and E2E

### Forward fix

The Supabase CLI was not present in the pnpm workspace, so the documented MCP/versioned-migration fallback was used. A new immutable repository migration, `20260928225500_restrict_app_sessions_service_role.sql`, was applied as live migration history version `20260928225532` with name `restrict_app_sessions_service_role`.

`app_sessions` ACL before: `service_role=ALL` (CRUD plus TRUNCATE, REFERENCES, and TRIGGER).
ACL after: `postgres=arwdDxtm/postgres,service_role=arwd/postgres`.

The final explicit grants for `service_role` are exactly DELETE, INSERT, SELECT, and UPDATE. `anon` and `authenticated` have no table privileges. RLS remains enabled.

The post-migration schema audit now passes. The `app_sessions` RLS-without-policy advisor item is accepted because this is a backend-only table with no anon/authenticated grants and service-role-only CRUD.

### Advisor rerun

- Security: 19 informational RLS-without-policy findings; zero security-definer-view errors; zero mutable-search-path warnings.
- Performance: 22 unindexed foreign keys and 9 auth-initplan warnings remain deferred; 29 unused-index findings are not actionable on an empty database.

### Runtime stop condition

Local verification passed (`pnpm install --frozen-lockfile`, `pnpm check`, 16/16 tests, and `node --check server.js`). `pnpm dev` was then attempted, but the runtime has no local `.env` and did not provide `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE`. The server exited before establishing its database/session store.

Per the Phase 04C stop condition, no E2E fixtures were created and session, KDS, croquis, transaction, and tenant-isolation E2E remain not run. Business tables remain empty; no cleanup operation was necessary.
