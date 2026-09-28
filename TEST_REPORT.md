# Test Report — Recovery 2026-09-28

## Ejecutado y aprobado

### Sintaxis JavaScript

`pnpm check` ejecuta `node --check` sobre rutas, middlewares, config y JS público.

Resultado: **PASS**.

### Compilación EJS

Se compilaron recursivamente las vistas EJS del proyecto.

Resultado: **25/25 PASS**.

### Smoke start

Se arrancó `node server.js` usando la configuración local disponible.

Resultado: **PASS** — Express inició en puerto 3010 y no produjo error de bootstrap.

### Verificaciones estructurales realizadas

- `/kds`, `/areas`, `/registro-pedidos`, `/desperdicios` montados.
- KDS nuevo no recibe service-role/secret en el navegador.
- rutas `/cocina` y `/bar` delegan al KDS oficial; APIs heredadas responden 410.
- `croquis-designer.js` se carga antes de hidratar `STATE`.
- `id_externo` se usa como identidad persistente de mesa visual.
- endpoints faltantes de áreas creados.
- Facturación legacy directa deshabilitada.
- flujo de Ventas apunta a endpoints existentes.
- include inexistente de Clientes corregido.

## No ejecutado todavía

### Migración contra BD viva

No se aplicó la migración a la instancia productiva/conectada. El proyecto Supabase asociado fue observado inactivo durante la auditoría y una consulta de esquema terminó por timeout. No se reactivó infraestructura ni se modificó producción.

### E2E con datos reales

Pendiente después de montar staging y aplicar la migración:

1. Admin inicia sesión.
2. Crea/edita área y mesas en croquis; guarda y recarga.
3. Mesero abre una mesa diseñada.
4. Agrega item Cocina y Bar.
5. Enviar comanda.
6. KDS Cocina y Bar reciben en vivo y separados.
7. `enviado → preparando → listo → servido`.
8. Mover pedido a otra mesa libre.
9. Facturar una vez; retry devuelve la misma factura.
10. Cancelar pedido no facturado y verificar devolución de stock.
11. Anular factura y verificar devolución de stock una sola vez.
12. Abrir/cerrar caja y validar intervalo temporal.
13. Intentos cross-tenant con IDs ajenos deben fallar.
14. Roles `admin`, `gerente`, `cajero`, `mesero`, `cocina`, `bar` deben respetar matriz.
15. Uploads fuera de límite/tipo deben rechazarse.

## Dependencias

El entorno de recuperación no logró completar `pnpm install --package-lock-only` antes del timeout de red. Por esa razón, el ZIP final excluye el `node_modules` antiguo y no usa el lockfile parcialmente regenerado. Ejecutar `pnpm install` con conectividad antes de las pruebas E2E y revisar el lock resultante.
