# Changelog de recuperación

Fecha: 2026-09-28

## Seguridad y acceso

- Añadido `middlewares/access.js` con roles canónicos, aliases heredados, guard de SuperAdmin y protección same-origin para mutaciones.
- `/superadmin` requiere Basic Auth configurada por variables de entorno; sin credenciales queda deshabilitado.
- Eliminado PIN administrador por defecto y logging de PIN.
- Login regenera el ID de sesión después de autenticarse.
- Logout principal se realiza por POST.
- Sesiones persistentes con `SupabaseSessionStore` + `app_sessions`.
- Producción exige `SUPABASE_SERVICE_ROLE`.
- CSP de Helmet reactivada; se mantiene `unsafe-inline` temporalmente por scripts/estilos EJS heredados.
- Eliminados scripts Supabase innecesarios del navegador.
- Endpoints legacy de Cocina/Bar retirados con HTTP 410; `/cocina` y `/bar` redirigen al KDS oficial.
- Aislamiento `restaurante_id` reforzado en operaciones auditadas.

## KDS Cocina/Bar

- Restaurado montaje de `/kds`.
- Roles normalizados: `cocina` y `bar`; compatibilidad de lectura para aliases antiguos durante migración.
- KDS único parametrizado por estación.
- Cola oficial: `enviado`, `preparando`, `listo`.
- Validación de transiciones de estado y estación.
- SSE autenticado desde Express para actualización en vivo.
- Fallback de refresco periódico si EventSource no está disponible.
- Escape de datos dinámicos para reducir DOM XSS.
- `Enviar comanda` ahora persiste `pendiente → enviado` y `enviado_at`.

## Croquis y áreas

- Restaurado montaje de `/areas`.
- Corregido orden de carga: `croquis-designer.js` se carga antes de usar `STATE`.
- Corregida hidratación de coordenadas `pos_x`, `pos_y`, `ancho`, `alto` con fallback legado.
- Mesa persistente identificada por `id_externo`, no por PK interna.
- Eliminadas funciones JS duplicadas que se sobrescribían.
- Añadidos `/areas/guardar-posiciones` y `DELETE /areas/eliminar/:id`.
- Validaciones de límites, IDs, área propietaria y payload.
- Nunca se eliminan mesas ocupadas durante guardado del croquis.
- Todas las mesas diseñadas pueden aparecer en el POS; eliminado límite heredado de Mesa 1–10.

## Base de datos

- Nueva migración `config/20260928_recovery_hardening.sql`.
- Reconcilia roles, SaaS/caja, desperdicios, áreas/croquis y columnas de mesas.
- Añade `facturas.pedido_id` e índice único para idempotencia.
- Añade índices del KDS.
- Añade `app_sessions` con RLS y sin acceso de `anon/authenticated`.
- RPC críticas `SECURITY INVOKER`; ejecución revocada a `PUBLIC`, `anon` y `authenticated`, concedida a `service_role`.
- Corregida inconsistencia sintáctica/roles en la migración base.

## Pedidos, inventario y facturación

- Apertura de pedido + ocupación de mesa transaccional (`pos_open_order`).
- Movimiento de pedido entre mesas transaccional (`pos_move_order`).
- Alta de item + decremento de stock + total transaccional (`pos_add_order_item`).
- Precio oficial tomado en PostgreSQL.
- Facturación + detalle + cierre + liberación transaccional (`pos_invoice_order`).
- Facturación idempotente por `pedido_id`.
- Cancelación + devolución de stock transaccional (`pos_cancel_order`).
- Anulación de factura + devolución de stock transaccional (`pos_void_invoice`).
- Endpoint legacy de creación directa de factura deshabilitado (410).
- Flujo temporal legacy de ventas deshabilitado (410).

## Caja

- Cierre consulta la caja exacta del restaurante.
- Ventas en efectivo se calculan desde la hora real de apertura hasta cierre, no desde medianoche.
- Índice para impedir más de una caja abierta por restaurante.

## UX/UI

- Reparado include roto de Clientes.
- Navbar normalizado a roles actuales y rutas KDS actuales.
- Añadido acceso coherente a Áreas/Croquis.
- Estado activo de navegación restaurado mediante `currentPath/page`.
- Ventas reparado para usar `/facturas/detalle/:id` y `/facturas/:id/imprimir`.
- Detalles de Ventas construidos con nodos/textContent en vez de HTML de datos no confiables.
- Registro de Pedidos escapa contenido dinámico en el modal.
- KDS mantiene interfaz visual existente, pero usa backend unificado y estados en vivo.

## Dependencias/uploads

- `multer` requerido como `2.4.0`/rama segura actual del recovery.
- Límites explícitos de tamaño/cantidad/campos en uploads auditados.
- Validaciones de extensión/MIME para Excel e imágenes.
- `node_modules` viejo no se distribuye en el ZIP recuperado.
