# RestaurantePOS

POS/ERP multi-tenant para restaurantes construido con Node.js, Express, EJS y Supabase/PostgreSQL. Incluye mesas y pedidos, KDS separado para Cocina y Bar, croquis, inventario, facturación, caja, clientes, desperdicios y administración.

## Requisitos

- Node.js 24 LTS o una versión compatible con las dependencias declaradas.
- pnpm 11.17.0.
- Un proyecto Supabase/PostgreSQL con el esquema y las migraciones de `supabase/migrations/` aplicados.

Este proyecto usa exclusivamente pnpm. El lockfile válido es `pnpm-lock.yaml`.

## Instalación

```bash
git clone https://github.com/Cosmobl4ck/RestaurantePOS.git
cd RestaurantePOS
pnpm install --frozen-lockfile
cp .env.example .env
pnpm check
pnpm test
pnpm dev
```

En Windows, copia el entorno con:

```powershell
Copy-Item .env.example .env
```

## Configuración

Completa `.env` sin versionarlo:

- `SUPABASE_URL`: URL del proyecto.
- `SUPABASE_SECRET_KEY` (recomendada) o `SUPABASE_SERVICE_ROLE`: secreto exclusivo del backend.
- `SESSION_SECRET`: secreto de al menos 32 caracteres aleatorios.
- `SUPERADMIN_USER` y `SUPERADMIN_PASSWORD`: opcionales; `/superadmin` permanece deshabilitado si faltan.
- `TRUST_PROXY`: solo si hay un proxy real delante (`1` para uno, `true` para confiar en todos).
- `ENFORCE_HTTPS`: `true` obliga a HTTPS (actívalo solo con TLS real).
- `RATE_LIMIT_MAX`: peticiones API por IP cada 15 minutos (por defecto 3000).
- `LICENSE_CACHE_TTL_MS`: caché de revalidación de licencia/estado de usuario (por defecto 60000).

Nunca expongas `SUPABASE_SERVICE_ROLE` en `public/`, vistas ni código enviado al navegador.

## Comandos

```bash
pnpm start
pnpm dev
pnpm check
pnpm test
pnpm audit:deps
```

Para probar sin datos reales, `pnpm seed:demo` crea el negocio `DEMO01` con usuario `Admin` y PIN `123456` (productos, mesas y configuración incluidos). Se elimina con `node scripts/seed-demo.js --clean`.

Healthcheck: `GET /healthz` (sin sesión) devuelve `{ "status": "ok" }` para monitores de proceso.

En producción ejecuta el proceso bajo un gestor (PM2, NSSM o un servicio de Windows) para que se reinicie tras un fallo, y sirve la app detrás de HTTPS.

## Base de datos

Revisa y respalda la instancia antes de aplicar una migración. Las migraciones normalizan los roles a `admin`, `gerente`, `cajero`, `mesero`, `cocina` y `bar`; protegen sesiones; y encapsulan operaciones críticas en RPC transaccionales restringidas a `service_role`.

La aplicación usa un cliente privilegiado en el backend. RLS no sustituye los filtros por `restaurante_id`, el RBAC ni las validaciones de pertenencia del servidor.

## Seguridad

El detalle del hardening aplicado en la rama `fix/security-hardening` está en
[`SECURITY_HARDENING_2026-11-06.md`](SECURITY_HARDENING_2026-11-06.md).
Incluye XSS, IDOR cross-tenant, rate limiting, validación global de
sesión/licencia, CSP, dependencias y la migración pendiente de aplicar.


## Flujo operativo esperado

`Login → Dashboard → Croquis/Mesas → Pedido → Enviar comanda → Cocina/Bar → Preparando → Listo → Servido → Facturar → Liberar mesa → Caja`

El arranque local por sí solo no certifica producción. Antes de desplegar deben validarse la migración contra el esquema vivo, aislamiento entre tenants, concurrencia de stock, idempotencia de facturación y los flujos E2E con datos de prueba.
