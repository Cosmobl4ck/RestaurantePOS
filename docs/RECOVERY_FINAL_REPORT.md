# Informe final de recuperación

Fecha: 2026-09-28 (America/El_Salvador)

## 1. Baseline

- Rama inicial remota: `main`
- SHA inicial: `0e430b47c314acfacf2aad0fbb82305d8590dde0`
- Estado local inicial: sin directorio `.git`; 66 archivos funcionales recuperados fuera del único commit remoto.
- Rama de trabajo: `recovery/restaurante-pos-pnpm-hardening`
- SHA final: ver `git rev-parse HEAD` en la rama de trabajo y el informe de entrega.

## 2. Alcance recuperado

Se incorporan los directorios locales `config/`, `middlewares/`, `public/`, `routes/`, `scripts/`, `views/`, `supabase/` y `test/`, además de cambios de PNPM, documentación, entorno y servidor. El listado exacto se obtiene con `git show --stat --name-only HEAD` tras el commit.

## 3. Bugs reparados

### P0

- SuperAdmin deshabilitado sin credenciales y protegido en servidor.
- Sesión persistente con `app_sessions`; regeneración en login.
- Filtros tenant en rutas recuperadas y RPC críticas restringidas a `service_role`.
- Precio/stock/facturación delegados a transacciones PostgreSQL recuperadas.

### P1

- Roles normalizados a `admin`, `gerente`, `cajero`, `mesero`, `cocina`, `bar`.
- Mapa central de permisos y pruebas unitarias de acceso.
- Enviar comanda y transiciones KDS convertidos a RPC atómicas.
- KDS Cocina/Bar separado por categoría, tenant y sesión Express; SSE con polling autenticado.
- Croquis recuperado con `id_externo`, mapper de coordenadas y endpoints tenant-aware.
- Lockfile PNPM real y reproducible; locks de otros gestores excluidos.

### P2

- Servidor importable sin abrir un puerto, para pruebas y smoke tests.
- Documentación activa migrada a comandos PNPM.
- Verificador ampliado para estructura, lockfile, roles, secretos públicos y RPC KDS.

## 4. Base de datos

- Schema vivo: `NOT VERIFIED` (no había credenciales/enlace Supabase en el workspace).
- Migración creada: `supabase/migrations/20260928211534_restaurant_pos_recovery.sql`.
- Migraciones aplicadas: ninguna.
- RLS/RPC/índices/constraints vivos: `NOT VERIFIED`.
- La migración normaliza roles, protege `app_sessions`, agrega unicidad de factura por pedido, índices KDS y RPC atómicas con `search_path=''` y `EXECUTE` solo para `service_role`.

## 5. KDS

Flujo implementado en código/migración: `pendiente → enviado → preparando → listo → servido` para Cocina y Bar. Prueba E2E contra Supabase: `NOT VERIFIED`.

## 6. Croquis

Crear, editar, mover, guardar, recargar, eliminar y evitar duplicados están implementados en el árbol recuperado. Persistencia E2E contra Supabase: `NOT VERIFIED`.

## 7. PNPM

- `pnpm install --frozen-lockfile`: PASS.
- `pnpm check`: PASS.
- `pnpm test`: PASS (3 pruebas RBAC).
- `pnpm audit`: FAIL, 1 vulnerabilidad moderada transitiva (`exceljs > uuid <11.1.1`, GHSA-w5hq-g745-h8pq).
- `package-lock.json`: AUSENTE; solo se conserva `package-lock.pre-recovery.json` como evidencia.
- Comandos npm/npx/Yarn en documentación activa: AUSENTES.

## 8. Seguridad

- RBAC: mapa central creado; aún existen comprobaciones legacy puntuales que deben migrarse gradualmente.
- Tenant isolation: filtros presentes en rutas auditadas; E2E A/B `NOT VERIFIED`.
- SuperAdmin: cerrado por defecto; borrado real sigue requiriendo validación operativa/auditoría adicional.
- Sessions: store Supabase y cookies endurecidas; tabla viva `NOT VERIFIED`.
- RLS/advisors: `NOT VERIFIED` sin acceso al proyecto.
- Service role: no aparece en contenido público; requerida solo en backend productivo.
- RPC permissions: endurecidas en migración pendiente.
- XSS: quedan usos heredados de `innerHTML` que requieren revisión contextual adicional.
- Uploads: límites de tamaño/campos/MIME presentes; validación completa de magic bytes pendiente.
- CSP: activa, conserva `unsafe-inline` como deuda documentada.

## 9. Pendientes

### BLOCKER

- Inspeccionar/respaldar Supabase vivo, contrastar schema y aplicar/validar la migración primero en staging.
- Ejecutar E2E de login, tenant isolation, croquis, KDS, stock concurrente, facturación idempotente y dos turnos de caja.

### HIGH

- Resolver el advisory transitivo de `uuid` mediante una versión compatible de `exceljs` o reemplazo probado.
- Completar permisos por operación en todas las rutas legacy y auditoría de acciones destructivas SuperAdmin.
- Revisar todas las funciones/policies del schema vivo con Database Advisors.

### MEDIUM

- Sustituir renderizados `innerHTML` con datos variables por nodos seguros/sanitización.
- Validar magic bytes de XLSX/JPEG/PNG.
- Hacer atómico el guardado completo del croquis mediante RPC.

### LOW

- Extraer scripts/estilos inline y eliminar gradualmente `unsafe-inline` con nonce/hash.
- Homogeneizar el lenguaje visual de vistas heredadas.

## Dictamen

Estado: **NOT PRODUCTION READY**. El baseline local es reproducible y sus checks pasan, pero la base viva y los flujos E2E obligatorios no están verificados.
