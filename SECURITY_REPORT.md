# Security Report — Recovery 2026-09-28

## Hallazgos críticos corregidos

### SuperAdmin expuesto

**Antes:** el router permitía operaciones administrativas de alto impacto sin una frontera de autenticación propia.

**Ahora:** `/superadmin` está protegido por credenciales server-side con comparación temporal segura y queda deshabilitado si no se configuran.

### Autorización/RBAC fragmentado

Se normalizaron `cocina`/`bar`, se añade `gerente` donde corresponde y se centraliza la comprobación de roles. Los endpoints legacy KDS que podían saltar transiciones fueron retirados.

### Cross-tenant/IDOR

Se añadieron comprobaciones `restaurante_id` en los flujos auditados y las RPC críticas reciben explícitamente `p_restaurante_id`. Abrir/mover pedidos valida la pertenencia de la mesa dentro de la misma transacción.

### Manipulación de precios

El navegador ya no decide el precio de una venta. `pos_add_order_item` obtiene el precio de `productos` bajo lock.

### Condiciones de carrera/corrupción parcial

Apertura/movimiento de pedido, stock, facturación, cancelación y anulación usan transacciones PostgreSQL mediante RPC.

### Sesiones

Se reemplaza el almacenamiento en memoria por `app_sessions` en PostgreSQL/Supabase. La tabla tiene RLS y se revoca acceso a `anon`/`authenticated`.

### RPC privilegiadas

Las funciones transaccionales son `SECURITY INVOKER` y su ejecución se revoca a `PUBLIC`, `anon` y `authenticated`; se concede exclusivamente a `service_role`.

### XSS

Se corrigieron puntos de interpolación HTML en KDS, Desperdicios, Ventas, Registro de Pedidos y partes del croquis. Helmet CSP vuelve a estar habilitado.

## Secretos

El ZIP original contenía `.env` con valores que parecían operativos. El ZIP recuperado **no distribuye `.env`**. Se entrega solo `.env.example`.

Si el ZIP original fue compartido fuera de un entorno de confianza, rotar:

- clave secreta/service role de Supabase;
- `SESSION_SECRET`;
- cualquier otra credencial reutilizada.

## Riesgos residuales / siguiente hardening

1. CSP conserva `'unsafe-inline'` por la cantidad de scripts y estilos inline heredados. Para eliminarlo completamente hace falta extraer scripts/estilos y usar nonces/hashes.
2. El backend sigue siendo una aplicación privilegiada con `service_role`; por diseño, el aislamiento principal está en middleware, filtros tenant y RPC. Una evolución futura puede mover más autorización al nivel DB/JWT.
3. Falta ejecutar escáner de dependencias sobre un lockfile recién generado (`npm audit` u otra herramienta) cuando exista conectividad al registro.
4. Falta prueba dinámica autenticada contra una BD staging restaurada.
5. Debe existir HTTPS real en producción y proxy configurado correctamente antes de habilitar cookies `secure`.

## Reglas operativas

- Nunca introducir `SUPABASE_SERVICE_ROLE` en HTML/JS público.
- Nunca publicar `.env`.
- No reactivar endpoints legacy de facturación/KDS.
- No aceptar precios/totales desde formularios como fuente de verdad.
- Toda mutación por ID debe incluir tenant o pasar por una RPC que lo valide.
