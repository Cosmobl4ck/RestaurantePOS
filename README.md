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
- `SUPABASE_KEY`: clave publicable/anon para compatibilidad del cliente servidor.
- `SUPABASE_SERVICE_ROLE`: secreto exclusivo del backend; obligatorio en producción.
- `SESSION_SECRET`: secreto largo y aleatorio para cookies de sesión.
- `SUPERADMIN_USER` y `SUPERADMIN_PASSWORD`: opcionales; `/superadmin` permanece deshabilitado si faltan.

Nunca expongas `SUPABASE_SERVICE_ROLE` en `public/`, vistas ni código enviado al navegador.

## Comandos

```bash
pnpm start
pnpm dev
pnpm check
pnpm test
pnpm audit:deps
```

## Base de datos

Revisa y respalda la instancia antes de aplicar una migración. Las migraciones normalizan los roles a `admin`, `gerente`, `cajero`, `mesero`, `cocina` y `bar`; protegen sesiones; y encapsulan operaciones críticas en RPC transaccionales restringidas a `service_role`.

La aplicación usa un cliente privilegiado en el backend. RLS no sustituye los filtros por `restaurante_id`, el RBAC ni las validaciones de pertenencia del servidor.

## Flujo operativo esperado

`Login → Dashboard → Croquis/Mesas → Pedido → Enviar comanda → Cocina/Bar → Preparando → Listo → Servido → Facturar → Liberar mesa → Caja`

El arranque local por sí solo no certifica producción. Antes de desplegar deben validarse la migración contra el esquema vivo, aislamiento entre tenants, concurrencia de stock, idempotencia de facturación y los flujos E2E con datos de prueba.
