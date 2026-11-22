# Sprint 1 - Operación

## Aviso de licencia

- Visible solo para `admin` y `gerente`.
- Aparece cuando faltan **5 días o menos** para `restaurantes.fecha_vencimiento`.
- Se muestra en la barra superior de todas las pantallas.
- Incluye fecha y botón `Renovar plan`.
- El aviso de límite de usuarios aparece en `/register` al 80% y al 100% del plan.

## Caja cerrada y Alt+H

- En la pantalla de caja cerrada, cajero, gerente y admin ven el botón **Abrir caja**.
- Atajo global: **Alt + H** abre `/caja`.
- Meseros, cocina y bar no tienen permiso `cash.view`; no pueden entrar.
- El atajo no abre el cajón físico. Para eso se necesita la integración de impresora/cajón.

## Propina por ticket

- Configurable solo por Admin/Gerente en `/configuracion`.
- Campo: `restaurantes.propina_porcentaje` (0 a 100).
- Se calcula sobre el subtotal del ticket y se guarda en `facturas.propina`.
- `facturas.total` incluye la propina; la caja la cobra y la incluye en el cierre.
- El ticket muestra Subtotal, Propina (%) y Total.
- Cajero/Gerente/Admin pueden ver el ticket. Meseros, cocina y bar no.
- Si el porcentaje es `0`, no se agrega propina.

## Faltas y bajas

- Módulo: `/register/faltas` (solo Admin/Gerente).
- Tipos: falta, falta injustificada, tardanza, salida temprana, baja, otro.
- Cada registro guarda empleado, fecha, descripción, acción tomada, estado y quién lo registró.
- La baja de empleado se hace desde `/register` con el botón **Baja**.
- La baja desactiva al usuario y crea automáticamente un incidente tipo `baja`.
- No se puede dar de baja a sí mismo.
- Un gerente no puede dar de baja a un admin/gerente.

## Migración

`supabase/migrations/20261121190000_sprint1_propina_incidentes.sql`

Incluye:

- `restaurantes.propina_porcentaje`
- `facturas.propina`
- `facturas.propina_porcentaje`
- `incidentes_empleados`
