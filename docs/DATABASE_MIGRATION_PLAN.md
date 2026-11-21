# Database Migration Plan

## Principio

No aplicar la recuperación directamente a producción sin backup/staging. El código entregado depende de `config/20260928_recovery_hardening.sql`.

## BD existente

1. Restaurar/reactivar el proyecto únicamente cuando corresponda operativamente.
2. Crear backup o rama/staging.
3. Inventariar tablas/columnas/constraints actuales.
4. Ejecutar `config/20260928_recovery_hardening.sql` sobre staging.
5. Verificar que no existan errores de datos legacy, especialmente roles y relaciones de mesas.
6. Ejecutar pruebas E2E indicadas en `TEST_REPORT.md`.
7. Solo entonces promover la migración a producción.

## BD nueva

1. Ejecutar `config/supabase-migration.sql` corregida.
2. Ejecutar `config/20260928_recovery_hardening.sql`.
3. Crear/configurar el primer restaurante y usuario administrador de forma segura.
4. Ejecutar pruebas E2E.

## Objetos principales agregados/reconciliados

- `app_sessions`
- `desperdicios`
- `areas_restaurante`
- `croquis_areas`
- columnas de croquis/operación en `mesas`
- campos adicionales en `cortes_caja`
- `facturas.pedido_id`
- índices KDS/tenant/idempotencia
- RPC `pos_open_order`
- RPC `pos_move_order`
- RPC `pos_add_order_item`
- RPC `pos_invoice_order`
- RPC `pos_cancel_order`
- RPC `pos_void_invoice`

## Validaciones después de migrar

Comprobar al menos:

```sql
select rol, count(*) from usuarios group by rol order by rol;
select count(*) from app_sessions;
select id, nombre, pos_x, pos_y, ancho, alto from areas_restaurante limit 10;
select id, id_externo, area_id, pos_x, pos_y, ancho, alto from mesas limit 20;
select proname from pg_proc where proname like 'pos_%' order by proname;
```

También confirmar que `anon`/`authenticated` no puedan ejecutar las RPC críticas ni leer `app_sessions`.

## Rollback

La migración está envuelta en `BEGIN/COMMIT`; si falla durante la ejecución, PostgreSQL revierte esa ejecución. Esto no sustituye un backup: las pruebas funcionales posteriores pueden descubrir incompatibilidades de datos que requieran restauración del snapshot previo.
