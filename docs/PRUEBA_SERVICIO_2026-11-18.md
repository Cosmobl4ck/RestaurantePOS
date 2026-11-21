# Prueba de servicio real — RestaurantePOS

Fecha: 2026-11-18
Proyecto Supabase: `dnqkeqvyqtfnhhxxvamw`
Negocio: `DEMO01` (id 32), plan `trial`, zona `America/El_Salvador`
Servidor: Express en `localhost:3010`, probado por HTTP real (login, mesas, KDS, caja, facturas).
Datos preparados por SQL (usuarios, tiempos, alérgenos, stock). La operación se hizo por las rutas de la app.

---

## 1. Resultado en una línea

35 pedidos creados, 30 facturados y cobrados, 5 dejados abiertos para mostrar el KDS en rojo.
Caja abierta con $100 y cerrada con $389.25, diferencia $0.00.
10 platos con alérgenos. Stock insuficiente devuelve error controlado. Sin errores inesperados.

---

## 2. Personal creado

Todos con PIN `123456`, estado activo, restaurante 32.

| Usuario | Rol |
|---|---|
| Mesero1 | mesero |
| Mesero2 | mesero |
| Mesero3 | mesero |
| Mesero4 | mesero |
| Mesero5 | mesero |
| Mesero6 | mesero |
| Cajero1 | cajero |
| Cajero2 | cajero |
| Bartender1 | bar |
| Cocinero1 | cocina |
| Supervisor1 | gerente |

`supervisor` no existe como rol en el sistema. Se mapeó a `gerente`, que es el rol de supervisión real del código.
Total de usuarios del negocio: 15 (4 previos + 11 nuevos). El límite del plan trial es 15.

---

## 3. Datos que hubo que preparar antes

El menú existía, pero **no tenía tiempos de preparación ni alérgenos vinculados**:

- `productos.tiempo_preparacion_minutos` estaba en `NULL` para los 35 productos.
- `producto_alergenos` tenía **0 filas**. La tabla `alergenos` sí tenía los 10 alérgenos.

Se aplicó:

| Dato | Acción |
|---|---|
| Tiempos cocina | 8 a 30 min según plato |
| Tiempos bar | 2 a 6 min según bebida |
| Alérgenos | 10 platos enlazados (Gluten, Lactosa, Huevo, Sulfitos, Pescado, Mariscos) |
| Stock de bar | Subido a 500 por producto para no agotar por accidente |
| Producto de prueba de stock | `Agua Mineral` (id 66) dejado en stock 2 temporalmente |

Platos con alérgenos configurados:
Hamburguesa, Pizza Pepperoni, Papas Fritas Grandes, Carne Asada, Pollo Guisado, Pupusas de Queso, Enchiladas, Pasta Alfredo, Salmón, Arroz con Camarones.

---

## 4. Apertura de caja

- Cajero: `Cajero1`, turno `1`.
- Caja id 10, fecha 2026-11-18.
- Monto de apertura: **$100.00**.
- Estado: `abierta` → luego `cerrada`.

Evidencia: `cortes_caja` id 10.

---

## 5. Servicio: 35 pedidos

Se hicieron 3 tandas para reutilizar las 12 mesas:

| Tanda | Pedidos | Mesas | Resultado |
|---|---|---|---|
| 1 | 12 | 59–70 | Servidos y facturados |
| 2 | 12 | 59–70 | Servidos y facturados |
| 3 | 11 | 59–70 | 6 servidos/facturados + 5 abiertos a propósito |

Cada pedido: apertura de mesa, 2–4 ítems (cocina y bar), envío de comanda, avance en KDS y facturación.
Meseros rotando entre `Mesero1`…`Mesero6`.
Se generaron **91 líneas de pedido** (`pedido_items`).

### Stock insuficiente (prueba solicitada)

En el primer pedido se intentó agregar `Agua Mineral` con stock 2 y cantidad 5:

- Petición: `POST /mesas/pedidos/<id>/items` con `producto_id=66`, `cantidad=5`.
- Respuesta: **HTTP 400** `{"error":"Stock insuficiente"}`.
- El ítem **no** se agregó; el pedido siguió normal.
- Se restauró el stock a 500.

Conclusión: el control de stock funciona en el servidor (RPC `pos_add_order_item`), no depende del navegador.

---

## 6. KDS en rojo (los 5 platos tardíos)

Los 5 pedidos abiertos quedaron con un plato de cocina atrasado. Se dejaron **sin servir** para que se vean en rojo al abrir el KDS.

| Pedido | Mesa | Mesero | Plato | Prep | Retraso | Alérgenos |
|---|---|---|---|---|---|---|
| 180 | 65 | Mesero1 | Pizza Pepperoni | 25 min | 7 min tarde | Gluten, Lactosa |
| 181 | 66 | Mesero2 | Salmón a la Plancha | 22 min | 7 min tarde | Pescado |
| 182 | 67 | Mesero3 | Arroz con Camarones | 28 min | 7 min tarde | Mariscos |
| 183 | 68 | Mesero4 | Pasta Alfredo | 20 min | 7 min tarde | Gluten, Lactosa |
| 184 | 69 | Mesero5 | Costillas BBQ | 30 min | 7 min tarde | — |

Verificación con la misma lógica del cliente KDS (`parseDbDate` interpreta las fechas como UTC):

- Cola cocina: 7 ítems, **5 en rojo**.
- Cola bar: 6 ítems, 5 en rojo por tiempo (las bebidas tienen prep de 2–6 min y quedaron sin servir).

**Cómo se simuló el tiempo:** no se esperaron minutos reales. Para los 5 platos se retrasó `pedido_items.enviado_at` a `ahora − (preparación + 5 min)`. Así el KDS calcula el retraso real contra ese timestamp. El resto del servicio se completó en tiempo real.

---

## 7. Alérgenos

- Se pidieron **10 platos con alérgenos** (verificado: 10 `pedido_items` con `alergenos` no vacío).
- 6 quedaron en pedidos facturados; 4 siguen visibles en los pedidos abiertos (Pizza, Salmón, Arroz con Camarones, Pasta Alfredo).
- El KDS muestra la etiqueta "Contiene: …" y el resumen de alérgenos por comanda.

---

## 8. Facturación

- Facturas nuevas: **30**, ids **149 a 178**.
- Total facturado: **$349.50**.
- Formas de pago: 25 efectivo, 5 transferencia.
- Líneas de detalle: **78**.
- Pedidos cerrados: **30**. Pedidos abiertos al final: **5** (los del KDS en rojo).

Ejemplo real, factura 149 (`GET /facturas/detalle/149`):

| Producto | Cant. | Precio | Subtotal |
|---|---|---|---|
| Hamburguesa Clasica | 1 | 8.50 | 8.50 |
| Alitas BBQ (6 uds) | 1 | 7.50 | 7.50 |
| Refresco Natural 16oz | 1 | 1.50 | 1.50 |
| Café Americano | 2 | 2.25 | 4.50 |

Total factura 149: **$22.00**, pago `transferencia`.

### Revisar cada factura

- Listado: `/facturas` (ids 149–178).
- Detalle JSON: `/facturas/detalle/<id>`.
- Impresión: `/facturas/<id>/imprimir`.

---

## 9. Cierre de caja

- Caja id 10.
- Ventas en efectivo consideradas: **$289.25**.
- Monto esperado: $100.00 + $289.25 = **$389.25**.
- Monto de cierre declarado: **$389.25**.
- **Diferencia: $0.00**.

Nota real del sistema: `ventas_efectivo` solo suma facturas `forma_pago='efectivo'`. Las 5 transferencias ($60.25) no entran en el efectivo, por eso el total facturado ($349.50) no coincide con el arrastre de caja.

---

## 10. Qué pasó, qué se resolvió y qué no

| Situación | Resultado | Cómo se resolvió |
|---|---|---|
| Menú sin tiempos de preparación | KDS no podía medir retraso | Se asignaron tiempos por producto |
| Sin alérgenos vinculados | No se podían pedir platos con alérgenos | Se llenó `producto_alergenos` con 10 platos |
| Stock insuficiente | HTTP 400 `Stock insuficiente` | Esperado; se restauró el stock |
| 5 platos tardíos | KDS en rojo (−7 min) | Se dejaron abiertos a propósito |
| Cierre de caja | Diferencia $0.00 | Cierre normal con ventas de efectivo |
| Páginas rotas | Ninguna | `/mesas`, `/kds/cocina`, `/kds/bar`, `/caja`, `/facturas`, `/reportes` responden 200 |

### Incidencias reales

1. **5 pedidos quedan abiertos después del cierre de caja.** Es intencional: si se facturaban, desaparecían del KDS y no se podría ver el rojo. En un cierre real no se cerraría caja con cuentas abiertas.
2. **El primer cálculo de "rojo" del script salió mal** por interpretar las fechas de la BD como hora local en vez de UTC. El cliente KDS real usa `parseDbDate` (agrega `Z`) y por eso calcula bien. No es un bug de la app; fue un error del script de prueba. Se corrigió el cálculo y se confirmó contra `/kds/cocina/cola`.
3. **Las bebidas del bar también quedaron en rojo** porque su tiempo de preparación es corto y no se sirvieron. Es comportamiento correcto del temporizador, no un fallo.
4. **El log del servidor solo mostró el error esperado** `Error al agregar item: Stock insuficiente`. No hubo excepciones no controladas.

---

## 11. Verificación técnica

| Ruta | Resultado |
|---|---|
| `POST /login` (11 usuarios) | 302 |
| `POST /caja/abrir` | 201 |
| `POST /mesas/abrir` | 200/201 |
| `POST /mesas/pedidos/:id/items` | 201 |
| `POST /mesas/pedidos/:id/enviar-comanda` | 200 |
| `PUT /kds/:id/estado` y `/finalizar` | 200 |
| `POST /mesas/pedidos/:id/facturar` | 200 |
| `POST /caja/cerrar` | 200 |
| `GET /mesas` | 200 |
| `GET /kds/cocina` | 200 |
| `GET /kds/bar` | 200 |
| `GET /caja` | 200 |
| `GET /facturas` | 200 |
| `GET /facturas/detalle/149` | 200 JSON |
| `GET /reportes` | 200 |

Archivos de la prueba:
- Script: `C:\Users\cosmo\AppData\Local\Temp\opencode\pos-sim.js`
- Resultado completo: `C:\Users\cosmo\AppData\Local\Temp\opencode\pos-sim-result.json`
- Bitácora: `C:\Users\cosmo\AppData\Local\Temp\opencode\pos-sim-result-log.json`

---

## 12. Acceso para revisar

- Túnel: https://synthetic-strengths-awards-joke.trycloudflare.com
- Negocio: `DEMO01`
- Admin: `Admin` / tu PIN
- Personal: `Mesero1`…`Mesero6`, `Cajero1`, `Cajero2`, `Bartender1`, `Cocinero1`, `Supervisor1` / PIN `123456`
