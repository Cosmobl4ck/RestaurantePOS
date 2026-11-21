# Hardening de seguridad — 2026-11-06

Rama: `fix/security-hardening`

Este documento resume los cambios aplicados sobre `main` (HEAD `b87ce54`) y lo que
queda pendiente. No sustituye una auditoría externa ni pruebas E2E contra el
esquema vivo.

## P0 — Corregido

| Hallazgo | Archivo | Cambio |
|---|---|---|
| XSS almacenado en el botón de WhatsApp | `views/facturas.ejs` | Se eliminaron los `onclick` con datos de la BD. Ahora se usan `data-*` + delegación de eventos y `escapeHtml()` al construir HTML. |
| XSS almacenado en el panel superadmin | `views/superadmin/admin_global.ejs` | `onclick` reemplazados por `data-action` + delegación. |
| IDOR cross-tenant en el croquis | `routes/areas.js` | Antes del `upsert` se consultan los `id` y se rechaza con `409` cualquier fila que pertenezca a otro tenant. Las referencias `area_fig_id` también se validan contra el tenant. |
| Dependencias vulnerables | `package.json`, `pnpm-workspace.yaml` | `multer` 2.5.0, `joi` 18.3.2; se eliminaron `body-parser` y `jsonwebtoken` (no se usaban). Overrides de pnpm para `body-parser >=1.20.9`, `qs >=6.16.1`, `ip-address >=10.7.4`. |

`pnpm audit --prod --audit-level high` sale en 0. Queda 1 aviso **moderado** de
`uuid` (transitivo de `exceljs`, sólo afecta a v3/v5/v6 con `buf`; no es
alcanzable desde este código). Se acepta como riesgo residual.

## P1 — Corregido

- **Rate limiting**: los estáticos se sirven antes del limitador; el límite
  general es configurable (`RATE_LIMIT_MAX`, por defecto 3000/15 min) y excluye
  `/healthz` y las conexiones SSE. El login tiene su propio límite
  (10 fallos / 15 min por IP + usuario, `skipSuccessfulRequests`).
- **Validación global de sesión/licencia**: `verificarSesion` se aplica a todas
  las rutas (excepto `/login`, `/logout`, `/healthz` y `/superadmin`, que usa
  Basic Auth). Revalida usuario activo, rol y licencia, con caché de 60 s
  (`LICENSE_CACHE_TTL_MS`) para no consultar la BD en cada request.
- **Session fixation**: se regenera la sesión al autenticar.
- **Apagado ordenado**: `SIGINT`/`SIGTERM` cierran el servidor; `uncaughtException`
  registra y cierra con código 1. Añadido `GET /healthz`.
- **CSP**: `connect-src` ya no incluye la URL de Supabase; se añadieron
  `object-src 'none'`, `base-uri 'self'`, `form-action 'self'` y
  `frame-ancestors 'self'`. Se mantiene `script-src-attr 'unsafe-inline'` porque
  la UI heredada usa `onclick` inline (sin esto, helmet rompe los botones).
  Se desactivó `upgrade-insecure-requests` porque el POS opera en LAN por HTTP.
- **CSRF**: `sameOriginForMutations` bloquea `Sec-Fetch-Site: cross-site` y
  exige que `Origin` coincida con el host.
- **Panel superadmin**: rate limit de 10 req/min, `Cache-Control: no-store`,
  IDs numéricos validados, código de negocio de 8 caracteres con reintento,
  rollback del tenant si falla la creación y PIN de 6–12 dígitos.
- **Cuerpos de request**: `json` 256 kb, `urlencoded` 128 kb.

## P2 — Corregido

- Un gerente ya no puede crear administradores ni otros gerentes.
- Búsquedas `q` en productos y clientes usan allowlist (evita inyección de
  operadores PostgREST).
- IDs numéricos validados en clientes, facturas, caja, KDS y desperdicios.
- Mensajes de error genéricos al cliente; el detalle queda en el log.
- Límite de 2000 filas al importar Excel y 999 unidades por línea de pedido.
- `routes/reportes.js` usa la zona horaria del restaurante y acota las consultas
  a los últimos 7 días.
- `views/factura.ejs` creada (antes el botón de imprimir devolvía 500) y ahora
  carga `configuracion_impresion` del tenant, incluido el logo.
- Logos de marca movidos a `public/img/*.svg` (antes apuntaban a
  `public/uploads/*.png`, ignorado por git y roto en un clon limpio).
- Migración `20261106000000_harden_users_and_audit.sql`: índice único
  `(restaurante_id, lower(nombre))` e índice de desperdicios por tenant/fecha.
- CI en `.github/workflows/ci.yml` (install, check, test, audit high).
- Eliminados scripts SQL heredados con credenciales/PIN en texto plano
  (`init.sql.sql`, `init.2.sql`), JS muerto y archivos vacíos.

## Acción requerida antes de desplegar

1. Aplicar la migración nueva en Supabase. Si falla, hay usuarios duplicados:
   ```sql
   select restaurante_id, lower(nombre), count(*)
   from public.usuarios group by 1,2 having count(*) > 1;
   ```
   Resolver los duplicados y volver a aplicar.
2. Configurar en el `.env` de producción: `SESSION_SECRET` (32+ caracteres),
   `TRUST_PROXY` si hay proxy, `ENFORCE_HTTPS=true` si hay TLS, y credenciales
   de superadmin robustas.
3. Ejecutar `pnpm install --frozen-lockfile && pnpm test && pnpm audit --prod`.
4. Probar E2E contra staging: login, pedido, comanda, facturación, anulación,
   caja y reportes.

## Riesgos residuales aceptados

- `script-src 'unsafe-inline'` y `script-src-attr 'unsafe-inline'`: la UI heredada
  depende de scripts y handlers inline. Migrar a archivos externos + delegación
  es el siguiente paso recomendado.
- Aislamiento multi-tenant basado en filtros `restaurante_id` (el backend usa
  `service_role` y RLS no aplica). Se añadieron validaciones de pertenencia en
  los puntos críticos, pero conviene migrar a RLS + JWT por usuario.
- `uuid` moderado vía `exceljs` (no alcanzable).
- El PIN sigue siendo de 4 dígitos para roles operativos; se recomienda 6+ para
  todos y bloqueo por intentos a nivel de cuenta.
