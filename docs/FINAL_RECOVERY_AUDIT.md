# Final recovery audit

Date: 2026-09-28  
Project: `Marroco'sPOS` (`dnqkeqvyqtfnhhxxvamw`)  
Branch: `recovery/restaurante-pos-pnpm-hardening`  
Audit start SHA: `72952d67b53d5ddb4572d9912c6be05c280a5dd1`

## Executive decision

The recovered database and transactional/RPC baseline are ready. The static code baseline has no open P0 or P1 finding and is ready for the missing runtime-validation phase. It is not ready to merge into `main`: authenticated HTTP/session, KDS SSE, Croquis HTTP, Cash HTTP, and real concurrent-stock tests remain environment-blocked because the runtime has no Supabase or session secrets.

Evidence labels used below are `LIVE VERIFIED`, `VERIFIED`, `STATIC EVIDENCE`, `NOT TESTED`, and `ENVIRONMENT BLOCKED`.

## A. Git baseline

- Branch: `recovery/restaurante-pos-pnpm-hardening` (`VERIFIED`).
- Start SHA: `72952d67b53d5ddb4572d9912c6be05c280a5dd1` (`VERIFIED`).
- Historical recovery documents were preserved; this report supersedes their old readiness conclusions without rewriting them.
- `packageManager` is `pnpm@11.17.0`; `pnpm-lock.yaml` is tracked. No active `package-lock.json` or `yarn.lock` is tracked. `package-lock.pre-recovery.json` is an intentionally retained historical artifact.
- `.env`, dumps, backups, compressed SQL backups, `backups/`, `node_modules/`, `dist/`, and `public/uploads/` are ignored. `.env.example` is intentionally tracked.
- No tracked file exceeded 5 MiB. No generated distribution or database backup was found tracked.
- Final SHA and final worktree are recorded in the closing audit commit.

## B. Database

- Migration history: exactly `20260928224838 reconcile_restaurant_pos_live` and `20260928225532 restrict_app_sessions_service_role` (`LIVE VERIFIED`).
- Business row count: zero in `restaurantes`, `usuarios`, `productos`, `clientes`, `mesas`, `pedidos`, `pedido_items`, `facturas`, `detalle_factura`, `areas_restaurante`, `croquis_areas`, and `app_sessions` (`LIVE VERIFIED`).
- RPCs: all eight `pos_*` functions exist, are `SECURITY INVOKER`, have an empty `search_path`, deny execute to PUBLIC/anon/authenticated, and grant execute to `service_role` (`LIVE VERIFIED`).
- `app_sessions`: schema matches `sid`, `sess`, `expires_at`, `created_at`, and `updated_at`; RLS is enabled; `service_role` has exactly SELECT/INSERT/UPDATE/DELETE; anon/authenticated have no table access (`LIVE VERIFIED`).
- Waste views `v_desperdicios_por_producto` and `v_desperdicios_por_motivo` use `security_invoker=true` (`LIVE VERIFIED`).
- Advisor state: 19 RLS-without-policy INFO findings, 22 unindexed-FK INFO findings, 9 auth-initplan WARN findings, and 10 unused-index INFO findings. No security-definer-view or mutable-search-path finding remains (`LIVE VERIFIED`).
- The 19 policy-less tables are not equivalent. Backend-used tables (`app_sessions`, `areas_restaurante`, `clientes`, `configuracion_impresion`, `cortes_caja`, `detalle_factura`, `facturas`, `mesas`, `pedido_items`, `pedidos`, `productos`) are deliberately reached with the server-only service role; legacy/unused tables (`asistencia_empleados`, `auditoria_forense`, `config_notificaciones`, `pedido_items_temporales`, `permisos`, `reservaciones`, `restaurante_usuarios`, `usuario_restaurante`) have no current route consumer. RLS still blocks anon/authenticated despite legacy grants on some unused tables. This classification must be revisited before any browser Supabase client is introduced.
- The 9 initplan warnings belong to old Supabase-Auth policies on `restaurantes`, `usuarios`, `desperdicios`, and `croquis_areas`. Current identity is Express session plus service-role backend, so these policies are not the active tenant boundary; retain and reassess in a future schema cleanup.
- The 22 foreign keys are deferred until realistic traffic exists. Highest-priority candidates after profiling are the operational relationships for clients, orders, invoices, invoice details, order items, tables/areas, and cash users. Cold legacy/admin keys should not receive speculative indexes.
- Unused-index statistics on an empty database are non-actionable; no index removal is recommended.

## C. Authentication and session

- Static: login filters user by the restaurant selected through `codigo_negocio`, requires active restaurant/user, compares the PIN with bcrypt, normalizes the role, regenerates the session ID, and saves before redirect (`STATIC EVIDENCE`). User-facing failures do not enumerate whether the restaurant or user exists, except that valid credentials can reveal inactive/expired account state.
- Session cookie is `httpOnly`, `sameSite=strict`, and `secure` in production. `resave=false`, `saveUninitialized=false`; production enables one trusted proxy hop (`STATIC EVIDENCE`).
- `SupabaseSessionStore` implements get/set/touch/destroy/prune with callback error propagation and expiry enforcement. Its timer is unref'd. Runtime behavior is not tested.
- Both POST and compatibility GET logout destroy the server-side session. GET logout is state-changing legacy debt.
- Runtime: `ENVIRONMENT BLOCKED`; no server/session lifecycle was executed.

## D. Authorization and tenant isolation

- Route coverage: all business routers are mounted behind a role guard; authentication is therefore applied at the mount even where a router omits a local guard. `/superadmin` is mounted behind `requireSuperadmin`. `/login`, `/logout`, and guarded registration are the intended root exceptions (`STATIC EVIDENCE`).
- RBAC: admin has all permissions; gerente spans operations/management; cajero handles operational/cash/product functions; mesero handles orders/floor/customers; cocina and bar are station-scoped. Some module-level mounts are broader than individual action permissions, so the effective policy is the explicit role arrays rather than every entry in `ROLE_PERMISSIONS`.
- Tenant source: ordinary routes derive `restaurante_id` from `req.session.usuario`; audited object lookups include the tenant or call a tenant-aware RPC. Superadmin is the documented cross-tenant exception (`STATIC EVIDENCE`).
- IDOR/BOLA: order, item, invoice, table, product, client, waste, configuration, area, and KDS access is tenant-filtered in direct queries or validated in RPCs. The prior 31-assertion database run also rejected cross-tenant move/void and found no cross-tenant references (`LIVE VERIFIED`).

### Express route inventory

`tenant` means `req.session.usuario.restaurante_id`; `admin target` means a SuperAdmin-selected restaurant ID.

| Module | Methods and paths | Auth / role | Tenant | State / data |
|---|---|---|---|---|
| root/auth | GET `/`, GET/POST `/login`, GET/POST `/logout`, GET/POST `/register` | public login; session for register/logout; admin/gerente register | login lookup / tenant | session, restaurantes, usuarios |
| dashboard | GET `/dashboard` | `dashboard.view` | tenant | read summary tables |
| superadmin | GET `/superadmin/panel`; POST `registrar-negocio`, `editar-negocio`, `extender/:id`, `activar-plan/:id`, `toggle-estado/:id`, `eliminar-negocio/:id` | server Basic credentials | admin target | restaurant/user administration |
| mesas | GET `/mesas`, `/pedidos/:pedidoId`, `/listar`; POST `/abrir`, `/pedidos/:pedidoId/items`, `/pedidos/:pedidoId/enviar-comanda`, `/pedidos/:pedidoId/facturar`, `/mover-pedido`; DELETE `/pedidos/:pedidoId` | admin/gerente/cajero/mesero; invoicing adds admin/gerente/cajero | tenant | mesas/pedidos/items and `pos_*` RPCs |
| productos | GET `/productos`, `/plantilla`, `/buscar`; POST `/`, `/importar`; PUT/DELETE `/:id` | admin/gerente/cajero | tenant | productos; inventory administration |
| caja | GET `/caja`, `/exportar/:id?`; POST `/abrir`, `/cerrar` | admin/gerente/cajero | tenant | cortes_caja, facturas |
| reportes | GET `/reportes`, `/lista-compras` | operational roles | tenant | invoices/items/products |
| facturas | GET `/facturas`, `/detalle/:id`, `/:id/imprimir`; POST `/anular/:id`, `/` | admin/gerente/cajero | tenant | facturas/details; void RPC; legacy create returns 410 |
| clientes | GET `/clientes`, `/buscar`, `/:id`; POST `/`; PUT/DELETE `/:id` | operational roles | tenant | clientes |
| KDS | GET `/kds/cocina`, `/bar`, `/:station/events`, `/:station/cola`; PUT `/:itemId/estado`, `/:itemId/finalizar` | KDS roles plus station check | tenant | pedido_items, `pos_transition_kds` |
| cocina/bar aliases | GET `/cocina`, `/bar`; all other subpaths | station-compatible mount; session | tenant | redirects; legacy API returns 410 |
| ventas | GET `/ventas`, `/export` | admin/gerente/cajero | tenant | invoice reporting |
| configuracion | GET/POST `/configuracion` | admin/gerente | tenant | printing config and in-memory images |
| areas/croquis | GET `/areas`, `/editar-croquis/:area_id`; POST `/crear`, `/guardar-croquis`, `/mesa/estado`, `/mesa/reservar`, `/mesa/desbloquear`, `/guardar-posiciones`; DELETE `/eliminar/:id` | admin/gerente | tenant | areas, croquis_areas, mesas |
| registro-pedidos | GET `/registro-pedidos`, `/api/lista`, `/detalle/:id`, `/reporte` | operational mount plus admin/cajero local policy | tenant | order history/reporting |
| desperdicios | GET `/desperdicios`, `/reporte`, `/api/lista`; POST `/`; DELETE `/:id` | admin/gerente/cajero | tenant | waste/products/users |

## E. KDS

- DB/RPC: station transitions and tenant checks passed in the prior live 31-assertion suite (`LIVE VERIFIED`).
- Static HTTP: every queue/item lookup uses session tenant; cocina/bar authorization is server-side; transitions permit only enviado -> preparando -> listo -> servido; product category determines station (`STATIC EVIDENCE`).
- SSE: uses authenticated Express session, never exposes service-role credentials, polls tenant-filtered data, sends heartbeats, and clears its interval on request close. Browser EventSource closes on unload and provides timed polling fallback (`STATIC EVIDENCE`).
- Runtime: HTTP/SSE not run (`ENVIRONMENT BLOCKED`).

## F. Croquis

- DB persistence: coordinates, dimensions, tenant, area, and `id_externo` passed prior live assertions (`LIVE VERIFIED`).
- Static routes: area ownership is checked; writes inject session tenant; identity is tenant-aware; deletion only targets free tables, while state/reservation endpoints validate tenant (`STATIC EVIDENCE`).
- XSS: database names/numbers entering template-literal DOM sinks are escaped in the active Croquis code. JSON bootstrap data is the remaining context-sensitive area to replace later with a safer serialization helper; no demonstrated executable payload was established in this audit.
- Runtime: save/delete/occupied-table behavior was not tested over HTTP (`ENVIRONMENT BLOCKED`).

## G. Sales, stock, and invoicing

- DB/RPC: pricing, stock, order, cancellation, invoice, and void invariants passed prior live assertions (`LIVE VERIFIED`).
- Direct DB bypasses: sales routes use `pos_add_order_item`, `pos_cancel_order`, `pos_invoice_order`, and `pos_void_invoice`. The old direct invoice-create endpoint is 410. Product administration can directly set stock by design and is restricted to admin/gerente/cajero; `desperdicios` records waste but currently does not decrement stock.
- Route integrity: tenant comes from session; price/subtotal/total are not accepted as sale authority; payment method is allowlisted; invoice retry is DB-idempotent (`STATIC EVIDENCE`).
- Runtime: transaction HTTP and true simultaneous-session stock contention remain untested (`ENVIRONMENT BLOCKED`).

## H. Cash

- Static: reads and writes include restaurant tenant; close calculates cash invoices within the selected opening timestamp and close timestamp; already-closed records are rejected before update (`STATIC EVIDENCE`).
- Findings: day grouping uses UTC `toISOString()` instead of a restaurant timezone; numeric inputs/enums are weakly validated; open/close is a multi-request read/compute/update sequence and the final update lacks an `estado='abierta'` compare-and-set predicate. These are P2 integrity risks requiring runtime/concurrency coverage, not demonstrated corruption.
- Runtime plan must cover duplicate opening, two simultaneous closes, invalid/negative monetary inputs, cutoff around local midnight, inclusion/exclusion by payment/state, tenant isolation, and Excel export (`NOT TESTED`).

## I. Security risk register

### P0 — critical

None open. Secret scan found variable names, placeholders, and historical examples, not a tracked operational secret (`VERIFIED`).

### P1 — high

None open. No demonstrated auth bypass, tenant escape, client-controlled sale pricing, data-corrupting path, RCE, or exploitable high-impact XSS was established.

### P2 — medium

#### F05-P2-01 — Cash close is not atomic — RESOLVED / LIVE VERIFIED IN PHASE 06A

- File/function: `routes/caja.js`, POST `/cerrar`.
- Evidence: `STATIC EVIDENCE`; row state is read, sales are separately read, then the row is updated without an open-state predicate or transactional RPC.
- Impact: concurrent close requests can both report success or calculate against slightly different windows.
- Recommended action: move open/close invariants and calculation to a tenant-aware transactional RPC, or use a compare-and-set update plus explicit conflict response; add two-session E2E.
- Merge blocker: NO for runtime-validation gate; YES for an unconditional production-ready claim.
- Resolution: migration `20260929141231 harden_cash_operations` added `pos_close_cash` with tenant/user validation, a row lock, DB-side cutoff/calculation/update, and stable conflict semantics. Controlled live E2E passed.

#### F05-P2-02 — Cash validation and timezone contract are incomplete — RESOLVED / STATIC + LIVE VERIFIED IN PHASE 06A

- File/function: `routes/caja.js`, `hoyISO`, `/abrir`, `/cerrar`.
- Evidence: `STATIC EVIDENCE`; UTC date is used for a local business day and body monetary/turn fields lack strict finite/nonnegative/enum validation.
- Impact: wrong-day grouping near midnight and malformed values reaching the database.
- Recommended action: define restaurant timezone, validate with a schema, and enforce matching DB constraints.
- Merge blocker: NO; runtime validation required.
- Resolution: restaurants now have a required IANA timezone; business date is tenant-local; Joi, RPC validation, DB constraints, and the `monto_apertura` render fix are in place. HTTP runtime remains environment-blocked.

#### F05-P2-03 — Dynamic HTML hardening remains incomplete — RESOLVED FOR IDENTIFIED SINKS IN PHASE 06A

- File/function: `public/js/alerts.js`; context-sensitive JSON/script bootstraps in EJS; historical/compatibility views.
- Evidence: `STATIC EVIDENCE`; `public/js/alerts.js` interpolates `mensaje` into `innerHTML`, although no active include was found. Active high-value KDS/Croquis/Registro/Ventas flows mostly escape or use text nodes.
- Impact: reusing the dormant helper with attacker-controlled content would introduce DOM XSS; script-context JSON requires continued care.
- Recommended action: delete or convert the helper to `textContent`/DOM construction and adopt one safe JSON-to-script bootstrap pattern.
- Merge blocker: NO because no reachable exploit was demonstrated.
- Resolution: the alert helper now constructs DOM nodes and uses text; active Croquis, area-list, and report bootstraps use the tested central script-context serializer. CSP P3 remains deferred.

### P3 — low

#### F05-P3-01 — Same-origin check permits missing Origin

- File/function: `middlewares/access.js`, `sameOriginForMutations`.
- Evidence: `STATIC EVIDENCE`; missing Origin is explicitly allowed. Active browser forms/fetch calls need this compatibility; no webhook/external integration was found. Strict SameSite cookies materially reduce ordinary cross-site browser requests.
- Impact: incomplete defense in depth for nonstandard clients or future cookie-policy changes.
- Recommended action: inventory runtime request headers, then require same-origin Origin/Referer for browser mutations or add CSRF tokens.
- Merge blocker: NO.

#### F05-P3-02 — GET logout changes session state

- File/function: `routes/auth.js`, GET `/logout`.
- Evidence: `STATIC EVIDENCE`; POST and temporary GET coexist.
- Impact: third-party navigation can force logout; no privilege gain or data mutation beyond session termination.
- Recommended action: migrate remaining navbar links to POST and remove GET in a compatibility cleanup.
- Merge blocker: NO.

#### F05-P3-03 — CSP retains unsafe inline execution

- File/function: `server.js`, Helmet CSP; 21 inline script blocks plus inline event handlers/styles in views.
- Evidence: `STATIC EVIDENCE`.
- Impact: CSP offers less XSS containment than nonce/hash-based policy.
- Recommended action: extract inline handlers/scripts, use delegated listeners, introduce nonces, and remove `unsafe-inline` in a dedicated UI hardening phase.
- Merge blocker: NO.

#### F05-P3-04 — Sensitive error details and login identifiers reach logs/clients

- File/function: `routes/auth.js`, `routes/caja.js`, `routes/mesas.js`, `routes/facturas.js`, `routes/desperdicios.js`, general error handler.
- Evidence: `STATIC EVIDENCE`; some JSON responses return `error.message`, and login logs restaurant/user identifiers. PIN, cookie, Authorization, session ID, and service-role values are not logged.
- Impact: authenticated clients may receive database wording; logs collect account identifiers.
- Recommended action: stable public error codes/messages and structured/redacted production logging.
- Merge blocker: NO.

#### F05-P3-05 — SuperAdmin and proxy rate-limit operations need deployment verification

- File/function: `server.js` limiters, `middlewares/access.js` `requireSuperadmin`.
- Evidence: `STATIC EVIDENCE`; SuperAdmin is fail-closed with no defaults and timing-safe comparison, but only the global limiter applies. Production assumes exactly one trusted proxy hop.
- Impact: brute-force protection and client-IP accuracy depend on deployment topology.
- Recommended action: dedicated SuperAdmin limiter and verify proxy chain before production.
- Merge blocker: NO.

### INFO

#### F05-I-01 — Uploads are memory-only and bounded

- File/function: `routes/productos.js`, `routes/configuracion.js`.
- Evidence: `STATIC EVIDENCE`; XLSX is limited to 5 MiB/one file; JPG/PNG to 3 MiB/two files; extension and MIME are checked; no user filename is written to disk. Image magic bytes and spreadsheet complexity are not independently validated.
- Impact: reduced traversal/overwrite exposure; decompression/format abuse remains a library concern.
- Recommended action: add magic-byte validation and parser resource tests before accepting untrusted public uploads.
- Merge blocker: NO.

#### F05-I-02 — Static exposure is scoped

- File/function: `server.js`, `express.static`.
- Evidence: `STATIC EVIDENCE`; only `public/` is served and dotfiles are denied. `public/uploads` contains packaged branding assets and is ignored for new local files.
- Impact: no repository/environment file exposure found.
- Recommended action: keep sensitive/user uploads outside the public tree.
- Merge blocker: NO.

### DEFERRED

#### F05-D-01 — Dependency advisory

- File/function: `pnpm-lock.yaml`, `exceljs -> uuid@8.3.2`.
- Evidence: `VERIFIED`; `pnpm audit --json` reports one moderate runtime transitive advisory, GHSA-w5hq-g745-h8pq, and zero high/critical findings. The vulnerable uuid buffer API is not called directly by this application.
- Impact: low demonstrated exploitability here, but the runtime dependency remains in the graph.
- Recommended action: upgrade/override only after Excel import/export regression tests confirm compatibility.
- Merge blocker: NO.

#### F05-D-02 — Database advisor performance debt

- File/function: live schema.
- Evidence: `LIVE VERIFIED`; 22 unindexed foreign keys, 9 auth-initplan warnings, and 10 unused indexes on an empty database.
- Impact: potential future query cost, not current correctness failure.
- Recommended action: profile populated staging, prioritize hot paths, and issue new migrations only.
- Merge blocker: NO.

### ENVIRONMENT BLOCKED

#### F05-E-01 — Critical HTTP/runtime validation unavailable

- File/function: complete Express runtime.
- Evidence: `ENVIRONMENT BLOCKED`; `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE`, and `SESSION_SECRET` are unavailable in the Codex runtime.
- Impact: session persistence, cookie behavior, route behavior, SSE lifetime, uploads, and cash cannot be dynamically certified.
- Recommended action: execute the runtime plan below in the owner's secured environment.
- Merge blocker: YES.

## J. Legacy debt

- `descontar_stock_desde_temp(integer)` references nonexistent `detalle_temp`; no repository consumer or trigger was found. It is a safe-removal candidate for a future new migration, not this audit.
- `pedido_items_temporales` and `fn_sync_stock_temporales` remain linked by `trg_stock_temporales`; no current Express route uses the table. Treat the whole path as legacy and remove only after confirming no external consumer.
- `/cocina/*` and `/bar/*` legacy APIs are intentionally retired with 410 responses; root aliases redirect to `/kds`.
- POST `/facturas` is an intentional 410 compatibility endpoint. GET logout remains temporary compatibility debt.
- `AUDITORIA_FINAL.md` is historically accurate for the pre-live gate but its statement that migration/E2E remained pending is obsolete. `SECURITY_REPORT.md` correctly describes repaired issues; its dependency and dynamic-test gaps are now partly updated by this report. Neither historical file was rewritten.

## K. Tests

- Current 16 tests: 6 migration-contract/static SQL tests, 4 KDS contract tests, 3 Croquis/floorplan contract tests, and 3 access/RBAC unit tests.
- Coverage gaps: auth request behavior, session store integration, cookie lifecycle, complete route/RBAC matrix, tenant-route IDOR integration, Cash, invoice/cancel HTTP, SuperAdmin, CSRF, upload parsing, error redaction, and real concurrency.
- Final commands and results are recorded after this report is generated: frozen pnpm install, static recovery check, all tests, and Node syntax check.

## L. Deployment and runtime-validation plan

- Environment: inject `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE`, `SESSION_SECRET`, and optional SuperAdmin credentials through a secret manager; never commit `.env`.
- HTTPS: terminate TLS at the intended reverse proxy and verify the single-hop `trust proxy` assumption plus Secure cookie delivery.
- Process: run `pnpm start` under a supervised process/container with graceful restart and health monitoring. The build script targets a Node 18 executable and should be validated separately against the current dependency/runtime support matrix.
- Monitoring: structured redacted logs, uptime/error/SSE metrics, alerting, and retention policy are still required.
- Backup: establish and test a production backup/restore policy despite the one-time recovery backup waiver.
- Runtime E2E sequence: start server; login with each role; verify session row create/get/touch/expiry/destroy and POST logout; confirm GET logout migration consumer; exercise RBAC/tenant IDOR; KDS queue/transitions and SSE connect/reconnect/cleanup; Croquis save/reload and occupied/reserved deletion rejection; sale/add/send/cancel/invoice/void HTTP; Cash open/close/double-close/local-midnight/exports; upload valid/invalid/oversized files; finally run true two-session stock contention and clean only named test fixtures.

## Phase 05 final gates (historical snapshot)

DATABASE/RPC RECOVERY: PASS
DATABASE TENANT ISOLATION: PASS
DATABASE CLEAN STATE: PASS
POST-MIGRATION SECURITY: PASS
STATIC CODE AUDIT: PASS
SECRET SCAN: PASS
AUTH/RBAC STATIC AUDIT: PASS
KDS STATIC AUDIT: PASS
CROQUIS STATIC AUDIT: PASS
SALES/TRANSACTION STATIC AUDIT: PASS
CASH STATIC AUDIT: PASS
DEPENDENCY AUDIT: PASS
RUNTIME ENVIRONMENT: BLOCKED
SERVER/SESSION E2E: NOT RUN
KDS HTTP/SSE E2E: NOT RUN
CROQUIS HTTP E2E: NOT RUN
CASH HTTP E2E: NOT RUN
REAL CONCURRENCY E2E: NOT RUN
P0 OPEN: 0
P1 OPEN: 0
ROLLBACK REQUIRED: NO
READY FOR RUNTIME VALIDATION: YES
READY TO MERGE RECOVERY INTO MAIN: NO

## Phase 06A stabilization — 2026-09-29

### Git

- Start/local baseline: `67cdeaddb92e37309473342d7668d2dbf214ebaf`.
- Remote baseline was `72952d67b53d5ddb4572d9912c6be05c280a5dd1`; the audit commit was published normally, without force, before implementation.
- No merge to `main` was performed.

### Cash schema and RPCs

- Repository migration: `20260929080623_harden_cash_operations.sql`; live history version: `20260929141231`, name `harden_cash_operations`.
- `restaurantes.timezone` is `text NOT NULL DEFAULT 'America/El_Salvador'`.
- Checks reject negative/non-finite opening, closing, and cash-sales amounts; shift is limited to `1` or `2`. Difference remains allowed to be negative.
- Partial unique index `uq_cortes_caja_restaurante_abierta` enforces one open cash session per restaurant.
- `pos_open_cash(bigint,bigint,text,numeric,text)` validates restaurant, IANA timezone through `pg_timezone_names`, active tenant user, shift, amount, and details length; it derives the business date with `now() AT TIME ZONE restaurante.timezone`.
- `pos_close_cash(bigint,bigint,bigint,numeric,text)` locks the tenant cash row `FOR UPDATE`, captures a single UTC cutoff compatible with the legacy timestamp-without-time-zone columns, counts only active cash invoices in the opening/cutoff window, calculates expected amount/difference, and closes in the same transaction.
- Both functions are `SECURITY INVOKER`, use an empty search path, deny PUBLIC/anon/authenticated, and grant only `service_role` (`LIVE VERIFIED`).

### Cash application

- POST open/close now use the RPCs; Express no longer reads invoices or writes the close directly.
- Joi rejects unknown shifts, malformed IDs, negative/non-numeric amounts, unexpected payload properties, excessive denomination entries, and invalid denomination counts.
- Denomination details are validated and explicitly serialized to bounded JSON text.
- GET Caja and daily Excel export use the reusable tenant-timezone helper; the UTC `hoyISO` contract is gone.
- `views/caja.ejs` renders live `monto_apertura`, while the documented request field remains `monto_inicial`.
- Expected RPC failures map to stable 400/403/404/409 responses; unexpected database messages are logged server-side but not returned raw.

### HTML safety

- `public/js/alerts.js` no longer interpolates messages through `innerHTML` and no longer uses inline alert-button `onclick`.
- `utils/safe-json.js` neutralizes `<`, `>`, `&`, U+2028, and U+2029 while preserving JSON roundtrip.
- Active JSON/script bootstraps in Croquis, area list, and reports use the central serializer.
- CSP still allows inline scripts/styles; F05-P3-03 remains deferred as intended.

### Cash DB/RPC E2E

Controlled `E2E_TEST_CASH_*` fixtures ran in one transaction and passed:

- Open with amount 100/shift 1, correct tenant and tenant-local business date.
- Duplicate open rejected; a second tenant opened independently.
- Both `America/El_Salvador` and `Pacific/Kiritimati` dates matched PostgreSQL business-date calculation; invalid timezone rejected.
- Closing counted only the active cash invoice (25), excluding active transfer (40) and annulled cash (60).
- Expected amount was 125 and closing amount 123 produced difference -2.
- Double close rejected without changing the recorded close; cross-tenant close rejected.
- Negative opening and numeric NaN closing were rejected.
- True simultaneous-session cash concurrency was not run; the partial unique index and row lock are structurally verified only.
- Selective cleanup removed all named fixtures. Final counts for restaurants, users, clients, invoices, and cash cuts are zero.

### Advisors and tests

- Security advisor unchanged: 19 expected/deferred `rls_enabled_no_policy` INFO findings; no new security finding.
- Performance advisor unchanged: 22 unindexed foreign keys, 9 auth-initplan warnings, and 10 empty-database unused-index notices; no new finding from this migration.
- Frozen pnpm install, recovery check, 23/23 tests, Node syntax check, and diff check pass.
- Runtime environment remains blocked: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE`, and `SESSION_SECRET` are absent. Cash HTTP and other critical HTTP E2E were not run.

### Phase 06A gates

GIT BASELINE RECONCILED: PASS
F05-P2-01 CASH ATOMICITY: PASS
F05-P2-02 CASH VALIDATION/TIMEZONE: PASS
F05-P2-03 HTML HARDENING: PASS
CASH DB/RPC E2E: PASS
CASH TENANT ISOLATION: PASS
CASH E2E CLEANUP: PASS
POST-FIX SECURITY AUDIT: PASS
STATIC TEST SUITE: PASS
RUNTIME ENVIRONMENT: BLOCKED
SERVER/SESSION E2E: NOT RUN
KDS HTTP/SSE E2E: NOT RUN
CROQUIS HTTP E2E: NOT RUN
CASH HTTP E2E: NOT RUN
REAL STOCK CONCURRENCY E2E: NOT RUN
REAL CASH CONCURRENCY E2E: NOT RUN
P0 OPEN: 0
P1 OPEN: 0
P2 OPEN: 0
ROLLBACK REQUIRED: NO
READY FOR RUNTIME VALIDATION: YES
READY TO MERGE RECOVERY INTO MAIN: NO

## Phase 06B runtime validation — 2026-09-29

The environment gate was unblocked with the project's modern server-only `SUPABASE_SECRET_KEY`. The backend now prefers that officially recommended key form while retaining legacy `SUPABASE_SERVICE_ROLE` compatibility; `.env` remained ignored and untracked.

The opt-in `pnpm test:e2e:live` runner completed 50/50 assertions against the real Express process and live Supabase project. It verified all six roles, session create/read/touch/expiry/destroy, POST and compatibility GET logout, cookie flags, RBAC, Origin handling, tenant IDOR rejection, KDS queues/transitions/SSE updates and heartbeat, Croquis persistence/reservation/deletion/XSS safety, order/invoice HTTP flows, Cash open/close/conflicts/export, XLSX import, SuperAdmin fail-closed behavior, login throttling, true simultaneous stock contention, and true simultaneous cash-open contention.

Runtime validation found and repaired two application defects: valid Croquis entities were removed by malformed PostgREST `in` filters, and invalid login responses used HTTP 200 so the failure-only rate limiter could not count them. Both fixes have static regressions and live coverage.

Selective cleanup completed. Live SQL confirmed zero rows in all audited business tables and `app_sessions`. Migration history and advisor counts remained unchanged. Final local checks pass with 26/26 static tests. The single moderate transitive `exceljs -> uuid` advisory remains deferred; no high or critical advisory exists.

Detailed evidence: `docs/live-audit/2026-09-29-runtime-e2e.md`.

### Phase 06B gates

RUNTIME ENVIRONMENT: PASS
SERVER/SESSION E2E: PASS
AUTH/RBAC E2E: PASS
TENANT IDOR E2E: PASS
KDS HTTP/SSE E2E: PASS
CROQUIS HTTP E2E: PASS
CASH HTTP E2E: PASS
REAL STOCK CONCURRENCY E2E: PASS
REAL CASH CONCURRENCY E2E: PASS
XLSX UPLOAD/EXPORT E2E: PASS
HTTPS SECURE COOKIE E2E: NOT RUN
IMAGE/OVERSIZED UPLOAD E2E: NOT RUN
DATABASE CLEAN STATE: PASS
P0 OPEN: 0
P1 OPEN: 0
P2 OPEN: 0
ROLLBACK REQUIRED: NO
READY TO MERGE RECOVERY INTO MAIN: YES, subject to owner review of the explicitly unrun deployment/upload cases.

## Phase 06C pre-merge acceptance — 2026-09-29

The residual upload gate is closed. A focused one-tenant `E2E_UPLOAD_*` suite passed 13/13 checks for invalid MIME, invalid extension, malformed and corrupt XLSX, XLSX/image size limits, valid PNG, image MIME spoof rejection, tenant-only persistence, no partial writes, and selective cleanup.

Phase 06C added content-signature checks for XLSX/PNG/JPEG and stable 400/413 upload errors. Final local verification passes with 28/28 tests. Live migrations and advisor counts are unchanged; no database migration was required. Live SQL confirmed zero upload fixtures and zero `app_sessions`.

HTTPS staging is unavailable, so production Secure-cookie E2E remains `NOT RUN` and is an explicit deployment prerequisite. Static production cookie and one-hop trust-proxy contracts remain unchanged.

Detailed evidence: `docs/live-audit/2026-09-29-phase-06c-pre-merge.md`.

RUNTIME 06B BASELINE: PASS
UPLOAD E2E: PASS
UPLOAD CLEANUP: PASS
HTTPS STAGING: UNAVAILABLE
PRODUCTION COOKIE E2E: NOT RUN
SECRET SCAN: PASS
DEPENDENCY HIGH: 0
DEPENDENCY CRITICAL: 0
P0 OPEN: 0
P1 OPEN: 0
P2 OPEN: 0
DATABASE CLEAN STATE: PASS
STATIC TEST SUITE: PASS
ROLLBACK REQUIRED: NO
MERGE AUTHORIZED: YES

No merge to `main` was performed.
