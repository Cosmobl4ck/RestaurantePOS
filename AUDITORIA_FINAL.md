# Auditoría forense y recuperación — Estado final de código

Fecha: 2026-09-28

## Dictamen

El proyecto no requería una reescritura total; requería reconciliar un refactor incompleto. Los dos síntomas principales recordados —KDS sin comandas y croquis fallando— provenían de múltiples roturas simultáneas, no de un único bug.

El recovery corrige el baseline de código y deja preparada la migración de BD. **No debe considerarse validado para producción hasta ejecutar la migración y los E2E en una BD staging/restaurada.**

## Causa raíz KDS

- Items nuevos quedaban `pendiente`.
- KDS mostraba `enviado/preparando/listo`.
- El endpoint de envío había desaparecido del working tree.
- `/kds` no estaba montado.
- Roles mezclaban `cocina/bar` y `cocinero/bartender`.
- Había dos implementaciones KDS con transiciones diferentes.
- El intento Realtime de navegador no encajaba con la identidad real basada en `express-session`.

### Recovery

Una sola API KDS, estados válidos, botón de envío real y SSE autenticado por Express/restaurante.

## Causa raíz croquis

- `STATE` se utilizaba antes de cargar `croquis-designer.js`.
- La excepción era silenciada.
- Frontend esperaba `x/y/w/h` y DB usaba `pos_x/pos_y/ancho/alto`.
- Mesa visual se reconstruía con PK `id` en vez de `id_externo`.
- Faltaban endpoints de posiciones/eliminación.
- Código dependía de columnas/tablas no consolidadas en la migración.
- El POS de Mesas ocultaba mesas fuera del rango heredado 1–10.

### Recovery

Contrato normalizado, identidad persistente correcta, endpoints y migración añadidos, y todas las mesas diseñadas pueden entrar al flujo POS.

## Arquitectura y datos

Se trasladaron invariantes críticas a PostgreSQL: precio, stock, apertura/movimiento de orden, facturación idempotente, cancelación y anulación. Esto reduce condiciones de carrera y estados parciales.

## Seguridad

Corregidos los P0/P1 principales detectados: SuperAdmin, sesiones, tenant filtering auditado, RPC privilegiadas, precio cliente, endpoints legacy, uploads y varios vectores XSS.

La CSP todavía admite inline scripts/estilos como compatibilidad con las vistas EJS heredadas; se documenta como deuda de hardening.

## UX/UI

Se repararon regresiones funcionales que afectaban navegación y pantallas: navbar/roles, Clientes, Ventas, KDS, acceso a Croquis y visibilidad de mesas. No se realizó una reescritura visual total de todas las pantallas: se priorizó coherencia y funcionalidad para no mezclar una migración estética masiva con la recuperación del dominio.

## Baseline Git

El ZIP recibido ya contenía un working tree con numerosos cambios sin commit sobre `673c371`. Por ello esta recuperación tomó **el ZIP recibido** como evidencia primaria. `CHANGELOG_RECOVERY.md` describe los cambios aplicados sobre ese estado, no sobre un commit limpio histórico.

## Gate antes de producción

Estado de código: **RECOVERED / STAGING-READY**.

Estado producción: **BLOCKED** hasta:

- backup/staging de Supabase;
- aplicación de migración;
- instalación fresca de dependencias;
- suite E2E de `TEST_REPORT.md`;
- verificación de secretos rotados cuando aplique;
- HTTPS/proxy productivo;
- revisión final de CSP y dependencias.
