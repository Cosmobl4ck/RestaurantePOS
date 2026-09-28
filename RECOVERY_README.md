# BaseRestaurante2407 — Recovery 2026-09-28

Esta carpeta es una recuperación controlada del ZIP `BaseRestaurante2407.zip`. El archivo original no fue modificado.

## Objetivo

Restaurar un baseline coherente y seguro del POS de restaurante, con prioridad en:

- flujo Pedido → Comanda → KDS Cocina/Bar;
- diseñador/croquis de áreas y mesas;
- aislamiento multi-restaurante;
- operaciones críticas de inventario/facturación/caja;
- RBAC, sesiones y SuperAdmin;
- regresiones visibles de UX/UI y navegación.

## Antes de ejecutar

1. Copia `.env.example` a `.env` y completa valores reales. Nunca publiques `.env`.
2. Usa una `SESSION_SECRET` larga y aleatoria.
3. Configura `SUPABASE_SERVICE_ROLE` exclusivamente en el servidor. En producción es obligatoria.
4. Configura `SUPERADMIN_USER` y `SUPERADMIN_PASSWORD`. Si faltan, `/superadmin` queda deshabilitado.
5. Instala dependencias frescas con `npm install`. El paquete entregado no incluye `node_modules` ni un lockfile activo porque el entorno de recuperación no pudo resolver el registro npm para regenerarlo de forma verificable. Se conserva `package-lock.pre-recovery.json` solo como evidencia del baseline anterior.
6. Antes de usar la aplicación contra una BD existente, sigue `DATABASE_MIGRATION_PLAN.md` y aplica `config/20260928_recovery_hardening.sql` en staging/backup primero.

## Ejecución

```bash
cd SistemaBase
npm install
npm run check
npm start
```

No uses `npm ci` hasta que `npm install` haya generado un `package-lock.json` nuevo y revisado.

## Cambios arquitectónicos importantes

### KDS

El navegador ya no se conecta directamente a Supabase Realtime. Cocina y Bar reciben una cola en vivo por Server-Sent Events (SSE) desde Express, usando la misma sesión autenticada y el `restaurante_id` del usuario.

Estados oficiales:

`pendiente → enviado → preparando → listo → servido`

La acción **Enviar comanda** cambia realmente los items `pendiente` a `enviado`.

### Pedidos/stock/facturas

Operaciones sensibles se movieron a funciones transaccionales PostgreSQL:

- `pos_open_order`
- `pos_move_order`
- `pos_add_order_item`
- `pos_invoice_order`
- `pos_cancel_order`
- `pos_void_invoice`

El precio se toma de la BD, no del navegador. El stock y la factura se modifican de forma atómica y la facturación por pedido es idempotente.

### Croquis

Se normalizó el uso de `id_externo` para mesas, el orden de carga de `croquis-designer.js`, los nombres `pos_x/pos_y/ancho/alto`, endpoints faltantes y validaciones de coordenadas/IDs.

### Sesiones

`express-session` usa `SupabaseSessionStore` y la tabla `app_sessions`; ya no depende de `MemoryStore` para el baseline recuperado.

## Limitación de validación

Durante esta recuperación el proyecto Supabase asociado aparecía inactivo y la consulta de esquema vivo terminó por timeout. Por seguridad no se restauró ni se migró infraestructura productiva. Por eso las pruebas realizadas son de código, compilación EJS y arranque del servidor; los E2E contra la BD real deben ejecutarse tras restaurar una copia/staging y aplicar la migración.

Consulta también:

- `AUDITORIA_FINAL.md`
- `CHANGELOG_RECOVERY.md`
- `SECURITY_REPORT.md`
- `TEST_REPORT.md`
- `DATABASE_MIGRATION_PLAN.md`
