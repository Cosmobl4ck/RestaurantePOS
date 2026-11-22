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

## Propina y descuentos en el cobro

- Configurable por Admin/Gerente en `/configuracion`.
- **Propina máxima: 10%**.
- El cajero puede elegir:
  - propina completa configurada (por ejemplo 10%);
  - reducir 5 puntos (por ejemplo 5%);
  - quitar toda la propina (0%).
- El descuento se aplica **antes** de la propina.
- Opciones de descuento: 0%, 5%, 10%, 15%, 20% o porcentaje personalizado.
- El motivo del descuento es opcional, pero queda auditado.
- Se guarda `subtotal`, `descuento`, `descuento_porcentaje`, `descuento_motivo`, `propina`, `propina_porcentaje` y `total`.
- El ticket muestra Subtotal, Descuento, Base, Propina y Total.
- Cajero/Gerente/Admin pueden ver el ticket. Meseros, cocina y bar no.
- El servidor recalcula y valida; no confía en el total enviado por el navegador.

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
`supabase/migrations/20261121200000_cobro_descuentos.sql`
`supabase/migrations/20261121201000_propina_max_10.sql`

Incluyen:

- `restaurantes.propina_porcentaje` (máximo 10)
- `facturas.propina`
- `facturas.propina_porcentaje`
- `facturas.subtotal`
- `facturas.descuento`
- `facturas.descuento_porcentaje`
- `facturas.descuento_motivo`
- `incidentes_empleados`
