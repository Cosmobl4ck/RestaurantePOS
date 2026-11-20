# Mapeo de módulos por plan — RestaurantePOS

Fecha: 2026-11-19
Fuente: `config/plans.js`, `plan_features`/`plan_limits` y los `requireFeature` reales en `server.js` y rutas.
La matriz de roles es independiente: el plan decide si el módulo existe; el rol decide quién puede usarlo.

---

## 1. Planes y límites

| Plan | Precio/mes | Duración | Usuarios | Mesas | Áreas | Productos | Estaciones KDS | Cajas | Sucursales |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Trial | $0 | 7 días | 15 | 50 | 5 | 500 | 2 | 1 | 1 |
| Básico | $19 | 30 días | 5 | 15 | 1 | 100 | 1 | 1 | 1 |
| Premium | $39 | 30 días | 15 | 50 | 5 | 500 | 2 | 1 | 1 |
| Gold | $79 | 30 días | sin límite | sin límite | sin límite | sin límite | sin límite | sin límite | sin límite |

Trial usa las funciones de Gold con los límites de Premium.

---

## 2. Módulos por plan

| Módulo | Feature | Trial | Básico | Premium | Gold |
|---|---|:---:|:---:|:---:|:---:|
| Dashboard | — (rol) | ✅ | ✅ | ✅ | ✅ |
| Mesas / pedidos | `pos.mesas` | ✅ | ✅ | ✅ | ✅ |
| Productos | `menu.productos` | ✅ | ✅ | ✅ | ✅ |
| Caja | `caja.basica` | ✅ | ✅ | ✅ | ✅ |
| Facturas | `facturas.internas` | ✅ | ✅ | ✅ | ✅ |
| Clientes | `clientes` | ✅ | ✅ | ✅ | ✅ |
| KDS cocina | `kds.cocina` | ✅ | ✅ | ✅ | ✅ |
| Ventas (historial) | `ventas.historial` | ✅ | ✅ | ✅ | ✅ |
| Reportes básicos | `reportes.basicos` | ✅ | ✅ | ✅ | ✅ |
| Configuración básica | `configuracion.basica` | ✅ | ✅ | ✅ | ✅ |
| Registro de pedidos | `pos.pedidos` | ✅ | ✅ | ✅ | ✅ |
| Personal | `usuarios` | ✅ | ✅ | ✅ | ✅ |
| Mi plan | — (rol) | ✅ | ✅ | ✅ | ✅ |
| **KDS bar** | `kds.bar` | ✅ | — | ✅ | ✅ |
| **Desperdicios** | `inventario.desperdicios` | ✅ | — | ✅ | ✅ |
| **Inventario stock/alertas** | `inventario.stock`, `inventario.alertas` | ✅ | — | ✅ | ✅ |
| **Importar productos** | `inventario.importar` | ✅ | — | ✅ | ✅ |
| **Exportar caja** | `caja.exportar` | ✅ | — | ✅ | ✅ |
| **Exportar ventas** | `ventas.exportar` | ✅ | — | ✅ | ✅ |
| **Reportes avanzados/exportar** | `reportes.avanzados`, `reportes.exportar` | ✅ | — | ✅ | ✅ |
| **Mover pedidos** | `pos.mover_pedido` | ✅ | — | ✅ | ✅ |
| **Tiempos KDS** | `kds.tiempos` | ✅ | — | ✅ | ✅ |
| **Tiempo de preparación** | `menu.tiempo_preparacion` | ✅ | — | ✅ | ✅ |
| **Marca de factura/config** | `facturas.marca`, `configuracion.marca` | ✅ | — | ✅ | ✅ |
| **Áreas / croquis** | `areas.croquis` | ✅ | — | — | ✅ |
| **Reservas y bloqueos** | `areas.reservas` | ✅ | — | — | ✅ |
| **Auditoría** | `auditoria` | ✅ | — | — | ✅ |
| Multi-caja | `multi_caja` | ✅ (catálogo) | — | — | ✅ (roadmap) |
| Multi-sucursal | `multi_sucursal` | ✅ (catálogo) | — | — | ✅ (roadmap) |
| DTE / facturación electrónica | `dte` | ✅ (catálogo) | — | — | ✅ (roadmap) |
| API / integraciones | `api` | ✅ (catálogo) | — | — | ✅ (roadmap) |
| Reportes BI | `reportes.bi` | ✅ (catálogo) | — | — | ✅ (roadmap) |
| Soporte prioritario | `soporte.prioritario` | ✅ | — | — | ✅ |
| Onboarding | `onboarding` | ✅ | — | — | ✅ |

Funciones incluidas en **todos** los planes: `menu.ficha`, `menu.alergenos`, `kds.alergenos`, `pos.facturar`, `pos.cancelar`, `facturas.anular`.

---

## 3. Mínimo plan por módulo

| Módulo | Plan mínimo |
|---|---|
| Mesas, productos, caja, facturas, clientes, KDS cocina, ventas, reportes básicos, configuración básica, registro de pedidos, personal | **Básico** |
| KDS bar, desperdicios, inventario, importar productos, exportaciones, reportes avanzados, mover pedidos, tiempos KDS, tiempo de preparación, marca | **Premium** |
| Áreas/croquis, reservas, auditoría, multi-caja, multi-sucursal, DTE, API, BI, soporte, onboarding | **Gold** |

---

## 4. Posicionamiento comercial sugerido

- **Básico ($19):** POS de una sola estación (cocina), menú, caja, facturas, clientes y reportes del día. Sin bar, sin inventario, sin exportaciones, sin plano. Ideal para locales pequeños.
- **Premium ($39):** operación completa: bar, inventario, desperdicios, exportaciones, marca, mover pedidos y reportes avanzados. Sin plano ni auditoría.
- **Gold ($79):** todo lo anterior + plano del salón, reservas, auditoría, multi-caja/sucursal, DTE, API y BI. Sin límites.
- **Trial (7 días):** funciones de Gold con límites de Premium (15 usuarios, 50 mesas, 5 áreas, 500 productos). Sirve para probar plano, reservas y auditoría sin dar límites ilimitados.

---

## 5. Observaciones y deudas

1. **Trial = funciones Gold + límites Premium.** Incluye croquis, reservas y auditoría, pero con 15 usuarios, 50 mesas y 5 áreas.
2. **Premium tiene límite de 5 áreas pero no puede usar croquis.** El límite queda inalcanzable. Se puede quitar o dejar para cuando el plano baje de plan.
3. **`estaciones_kds` no se cuenta.** Se deduce por `kds.bar`: Básico tiene 1 estación (cocina), Premium/Gold tienen 2.
4. **`cajas` y `sucursales` no se cuentan.** Multi-caja y multi-sucursal no están implementados; los límites son declarativos.
5. **Features declaradas sin `requireFeature`:** `pos.facturar`, `pos.cancelar`, `facturas.anular`, `usuarios`, `menu.ficha`, `menu.alergenos`, `kds.alergenos`. Hoy están en todos los planes, así que no hay impacto. Si un plan futuro las excluye, hay que blindarlas.
6. **`multi_caja`, `multi_sucursal`, `dte`, `api`, `reportes.bi`, `soporte.prioritario`, `onboarding`:** solo catálogo/roadmap, sin módulos todavía.
7. **Roles vs planes:** un módulo puede estar en el plan pero no en el rol. Ejemplo: Básico incluye KDS cocina, pero solo lo usan cocina/admin/gerente/cajero.
