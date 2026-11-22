# Zonas y mesas

## Distribución DEMO01

| Zona | Mesas | Capacidad |
|---|---:|---|
| Bar | 4 | 1 persona por mesa |
| Terraza | 10 | 4 de 6 personas y 6 de 4 personas |
| Salón principal | 20 | 6 personas por mesa |
| Especiales | 2 | Para llevar y a domicilio |

Total operable: 34 mesas.

## Navegación

En `/mesas` hay tabs:

- Todas
- Bar
- Terraza
- Salón principal
- Especiales

Cada tab muestra `ocupadas/total`.

El filtro se hace en servidor con:

```text
GET /mesas?zona=<area_id>
GET /mesas?zona=especiales
GET /mesas?zona=todas
```

## Operación

- Las mesas se ordenan por capacidad y número.
- Cada tarjeta muestra estado y capacidad.
- El pedido abierto de `T-1` se conservó.
- `PARA LLEVAR` y `A DOMICILIO` quedan fuera de las 3 zonas, en Especiales.
- El croquis sigue disponible para Admin/Gerente en Gold, pero la operación diaria usa cuadrícula.

## Pendiente para multitenant

La carga de las 34 mesas se hizo para DEMO01. Para otros restaurantes falta el generador masivo:

- elegir zona;
- prefijo;
- cantidad;
- capacidad;
- forma;
- crear en lote.

El modelo ya lo soporta: `areas_restaurante` + `mesas.area_id` + `mesas.capacidad`.
