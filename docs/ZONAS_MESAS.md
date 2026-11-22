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

`/mesas` inicia con **un cuadro por zona**:

- Bar
- Terraza
- Salón principal
- Especiales

Cada cuadro muestra ocupadas/total, personas/capacidad, disponibles y mesas libres. Al hacer clic se abren las mesas de esa zona.

Dentro de una zona también hay tabs:

- Zonas
- Todas
- Bar
- Terraza
- Salón principal
- Especiales

Cada tab muestra `ocupadas/total`.

El filtro se hace en servidor con:

```text
GET /mesas?zona=zonas
GET /mesas?zona=<area_id>
GET /mesas?zona=especiales
GET /mesas?zona=todas
```

## Operación

- Las mesas se ordenan por capacidad y número.
- Cada tarjeta muestra estado, capacidad y **número de clientes** en mesas ocupadas.
- Al abrir una mesa se solicita nombre y cantidad de clientes; la cantidad se guarda en `mesas.personas_actuales`.
- Al facturar o cancelar, la mesa vuelve a 0 clientes.
- El pedido abierto de `T-1` se conservó.
- `PARA LLEVAR` y `A DOMICILIO` quedan fuera de las 3 zonas, en Especiales.
- El croquis sigue disponible para Admin/Gerente en Gold, pero la operación diaria usa cuadrícula.

## Visibilidad por rol

| Rol | Mesas | Plano/croquis | Clientes por mesa | Editar croquis |
|---|---|---|---|---|
| Admin | Sí | Sí | Sí | Sí |
| Gerente | Sí | Sí | Sí | Sí |
| Host | Sí | Sí | Sí | No |
| Cajero | Sí | Sí | Sí | No |
| Mesero | Sí | No | Sí | No |

Host no puede abrir caja, facturar ni editar el plano; solo consulta y ubicación.

## Croquis: métricas

El plano muestra:

- Total de mesas.
- Mesas ocupadas.
- Personas actuales.
- Capacidad total.
- Espacios disponibles (`capacidad - personas`).
- Mesas libres.


## Pendiente para multitenant

La carga de las 34 mesas se hizo para DEMO01. Para otros restaurantes falta el generador masivo:

- elegir zona;
- prefijo;
- cantidad;
- capacidad;
- forma;
- crear en lote.

El modelo ya lo soporta: `areas_restaurante` + `mesas.area_id` + `mesas.capacidad`.
