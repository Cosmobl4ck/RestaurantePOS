# Recovery Patch Manifest

Comparación byte-a-byte entre el ZIP recibido y el paquete recuperado. Se excluyen `.git`, `node_modules` y `.env`.

## Archivos modificados (39)

- `SistemaBase/.env.example`
- `SistemaBase/config/supabase-migration.sql`
- `SistemaBase/middlewares/authMiddleware.js`
- `SistemaBase/middlewares/authRole.js`
- `SistemaBase/package.json`
- `SistemaBase/public/js/croquis-designer.js`
- `SistemaBase/public/js/desperdicios.js`
- `SistemaBase/public/js/kds.js`
- `SistemaBase/public/js/mesas.js`
- `SistemaBase/routes/areas.js`
- `SistemaBase/routes/auth.js`
- `SistemaBase/routes/bar.js`
- `SistemaBase/routes/caja.js`
- `SistemaBase/routes/cocina.js`
- `SistemaBase/routes/configuracion.js`
- `SistemaBase/routes/desperdicios.js`
- `SistemaBase/routes/facturas.js`
- `SistemaBase/routes/kds.js`
- `SistemaBase/routes/mesas.js`
- `SistemaBase/routes/productos.js`
- `SistemaBase/routes/registro_pedidos.js`
- `SistemaBase/routes/superadmin.js`
- `SistemaBase/routes/ventas.js`
- `SistemaBase/server.js`
- `SistemaBase/views/caja.ejs`
- `SistemaBase/views/clientes.ejs`
- `SistemaBase/views/cocina.ejs`
- `SistemaBase/views/croquis.ejs`
- `SistemaBase/views/facturas.ejs`
- `SistemaBase/views/kds_bar.ejs`
- `SistemaBase/views/kds_cocina.ejs`
- `SistemaBase/views/layout.ejs`
- `SistemaBase/views/partials/navbar.ejs`
- `SistemaBase/views/productos.ejs`
- `SistemaBase/views/register.ejs`
- `SistemaBase/views/registro_pedidos.ejs`
- `SistemaBase/views/reportes.ejs`
- `SistemaBase/views/superadmin/admin_global.ejs`
- `SistemaBase/views/ventas.ejs`

## Archivos agregados (12)

- `SistemaBase/AUDITORIA_FINAL.md`
- `SistemaBase/CHANGELOG_RECOVERY.md`
- `SistemaBase/DATABASE_MIGRATION_PLAN.md`
- `SistemaBase/RECOVERY_PATCH_MANIFEST.md`
- `SistemaBase/RECOVERY_README.md`
- `SistemaBase/SECURITY_REPORT.md`
- `SistemaBase/TEST_REPORT.md`
- `SistemaBase/config/20260928_recovery_hardening.sql`
- `SistemaBase/config/SupabaseSessionStore.js`
- `SistemaBase/middlewares/access.js`
- `SistemaBase/package-lock.pre-recovery.json`
- `SistemaBase/scripts/verify-recovery.js`

## Archivos eliminados del paquete de recuperación (2)

- `SistemaBase/package-lock.json`
- `package-lock.json`

> Nota: `.git`, `node_modules` y `.env` se omiten intencionalmente del paquete y no se enumeran aquí. `package-lock.pre-recovery.json` se conserva exclusivamente como evidencia histórica y no debe usarse para instalaciones; `pnpm-lock.yaml` es el único lockfile activo.
