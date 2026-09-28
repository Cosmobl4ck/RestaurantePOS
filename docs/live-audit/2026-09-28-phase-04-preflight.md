# Phase 04 live preflight — stopped at backup gate

Timestamp: `2026-09-28T22:24:51Z`

Project: `Marroco'sPOS`  
Project ref: `dnqkeqvyqtfnhhxxvamw`  
Region: `us-west-2`  
Status: `ACTIVE_HEALTHY`  
PostgreSQL: `17.6.1.121`

No live migration was applied. The process stopped because a restorable backup could not be verified through the available Supabase connector, and no browser surface was available to inspect managed backups/PITR.

## Git and local verification

- Start SHA: `d4fbe9a4a2ed736cfd0a9f823e19f160b72677c2`
- Branch: `recovery/restaurante-pos-pnpm-hardening`
- Initial worktree: clean
- `pnpm install --frozen-lockfile`: pass
- `pnpm check`: pass
- `pnpm test`: 16/16 pass
- `node --check server.js`: pass

The required reserved-destination guard for `pos_move_order` was added and committed as `0acc018` before any live apply.

## Read-only live preflight

| Check | Result |
|---|---|
| Roles | `admin=4`, `bartender=1`, `cocinero=1` |
| Row counts | restaurantes=4, usuarios=6, productos=13, clientes=1, mesas=48, pedidos=16, pedido_items=45, facturas=11 |
| Pedido states | abierto=3, cancelado=2, cerrado=11 |
| Item states | pendiente=37, cancelado=8 |
| `mesas.id_externo IS NOT NULL` | 0 |
| `public.app_sessions` | absent |
| `facturas.pedido_id` | absent |
| `public.pos_*` functions | 0 |
| Active order/table integrity anomalies | 0 |
| Migration history | empty |

## Advisor baseline

Security:

- 18 `rls_enabled_no_policy` informational findings.
- 2 `security_definer_view` errors for the waste views.
- 3 mutable function `search_path` warnings.

Performance:

- 22 unindexed foreign-key findings.
- 9 `auth_rls_initplan` warnings.
- 21 unused-index informational findings.

The candidate reconciliation migration is expected to resolve the two view errors and the three mutable-function warnings. No after-state exists because it was not applied.

## Backup gate

- Method: unavailable/unverified
- Backup timestamp: unavailable
- Verified: no
- Restore capability: not demonstrated
- Decision: stop before migration

To resume, provide verifiable evidence of a managed backup/PITR restore point or an authenticated PostgreSQL dump that covers schema, data, functions, views, triggers, constraints, indexes, grants, and policies.
