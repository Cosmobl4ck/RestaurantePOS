# Revisión de roles y permisos — RestaurantePOS

Fecha: 2026-11-19
Alcance: `middlewares/access.js`, `server.js` (montaje de rutas), guards internos y `views/partials/navbar.ejs`.
No se modificó código en la revisión inicial; los cambios acordados se aplicaron al final (sección 7).

---

## 1. Roles existentes

| Rol | Alias aceptado | Nota |
|---|---|---|
| `admin` | — | Permiso `*` |
| `gerente` | — | Administración del negocio |
| `cajero` | — | Caja, facturas, parte de operación |
| `mesero` | — | Mesas, pedidos, clientes |
| `cocina` | `cocinero` | Solo KDS cocina |
| `bar` | `bartender` | Solo KDS bar |

`normalizeRole()` convierte `cocinero`→`cocina` y `bartender`→`bar`. El login y `verificarSesion` normalizan el rol de la sesión.

---

## 2. Matriz efectiva (lo que las rutas permiten hoy)

| Módulo | admin | gerente | cajero | mesero | cocina | bar |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Dashboard | ✅ | ✅ | ✅ | — | — | — |
| Mesas | ✅ | ✅ | ✅ | ✅ | — | — |
| Productos | ✅ | ✅ | ✅ | — | — | — |
| Caja | ✅ | ✅ | ✅ | — | — | — |
| Reportes | ✅ | ✅ | ✅ | ✅ | — | — |
| Facturas | ✅ | ✅ | ✅ | — | — | — |
| Clientes | ✅ | ✅ | ✅ | ✅ | — | — |
| KDS cocina | ✅ | ✅ | ✅ | — | ✅ | — |
| KDS bar | ✅ | ✅ | ✅ | — | — | ✅ |
| Ventas | ✅ | ✅ | ✅ | — | — | — |
| Configuración | ✅ | ✅ | — | — | — | — |
| Áreas / croquis | ✅ | ✅ | — | — | — | — |
| Registro de pedidos | ✅ | ✅ | ✅ | ⚠️ | — | — |
| Desperdicios | ✅ | ✅ | ✅ | — | — | — |
| Mi plan | ✅ | ✅ | — | — | — | — |
| Auditoría | ✅ | ✅ | — | — | — | — |
| Personal | ✅ | ✅ | — | — | — | — |
| Superadmin | Basic Auth propio, separado de la sesión del POS |

⚠️ `Registro de pedidos`: el módulo se monta para `mesero`, pero **todas** sus rutas exigen admin/gerente/cajero. El mesero entra pero recibe 403.

---

## 3. Acciones sensibles: quién puede realmente

| Acción | Quién puede hoy | Matriz declarada |
|---|---|---|
| Facturar | admin, gerente, cajero | admin, gerente, cajero ✅ |
| Anular factura | admin, gerente, cajero | admin, gerente, cajero ✅ |
| Abrir/cerrar caja | admin, gerente, cajero | admin, gerente, cajero ✅ |
| **Cancelar pedido** | admin, gerente, cajero, **mesero** | mesero **NO** tiene `orders.cancel` ❌ |
| **Eliminar producto** | admin, gerente, **cajero** | `cajero` tiene `products.edit`, no un permiso de borrado ⚠️ |
| **Eliminar cliente** | admin, gerente, cajero, **mesero** | `mesero` tiene `customers.edit`, no borrado ⚠️ |
| **Eliminar desperdicio** | admin, gerente, **cajero** | solo gerente tiene `waste.delete` ❌ |
| **Ver reportes** | admin, gerente, cajero, **mesero** | `mesero` no tiene `reports.view` ❌ |
| Editar usuarios/PIN | admin, gerente | admin, gerente ✅ |
| Configurar IP del personal | admin, gerente | admin, gerente ✅ |
| Ver asistencia | admin, gerente | admin, gerente ✅ |

---

## 4. Hallazgos

### Alto

1. **La matriz de permisos no se aplica.** `ROLE_PERMISSIONS` es la fuente declarada, pero `requirePermission()` solo se usa en `/dashboard`. Todo lo demás usa listas `authRole(...)` o chequeos inline. Hay dos fuentes de verdad y ya divergen.
2. **Mesero puede cancelar pedidos.** `DELETE /mesas/pedidos/:id` no valida rol; el módulo `/mesas` incluye mesero. La matriz no le da `orders.cancel`.
3. **Mesero puede ver reportes.** `/reportes` está montado con `ROLES_OPERACION` (incluye mesero), pero el navbar oculta Reportes a mesero y la matriz no le da `reports.view`.
4. **Cajero puede eliminar desperdicios.** `/desperdicios` se monta con `ROLES_CAJA` y el `DELETE` no valida nada. La matriz solo da `waste.delete` a gerente.

### Medio

5. **Cajero puede crear/editar/eliminar productos.** El módulo se monta con `ROLES_CAJA`. La matriz le da `products.edit`; el borrado no está definido y queda permitido.
6. **Mesero puede eliminar clientes.** Mismo patrón: montaje `ROLES_OPERACION`, `DELETE /clientes/:id` sin chequeo.
7. **`/registro-pedidos` deja entrar a mesero para luego rechazarlo.** El montaje debe ser `ROLES_CAJA` o quitar `soloAdminCajero` si se quiere que el mesero vea sus pedidos.
8. **`/areas/mesa/desbloquear` permite cajero, pero `/areas` está montado solo para admin/gerente.** El chequeo inline del cajero es código muerto.
9. **`/dashboard` es accesible para cajero** (tiene `dashboard.view`), pero el navbar no le muestra el enlace (`verDashboard = esAdmin`). Además `/` lo redirige a `/dashboard`.
10. **Detección JSON de `requirePermission`:** usa `req.accepts('html','json')`, que para `Accept: */*` devuelve `html`. Un fetch de API puede recibir HTML en vez de JSON.

### Bajo

11. `mesero` tiene `kds.view` y `kds.serve` en la matriz, pero está excluido de `/kds`.
12. El alta de administradores está permitida por la ruta si el solicitante es admin, pero la opción está comentada en la vista de Personal.
13. `ROLE_PERMISSIONS` no separa “editar” de “eliminar” en productos, clientes y desperdicios.
14. Los chequeos inline repiten listas (`['admin','gerente','cajero']`) en varios archivos; cualquier cambio de matriz exige tocar varios sitios.

---

## 5. Recomendación

1. **Una sola fuente de verdad:** usar `requirePermission('...')` en cada ruta y dejar `authRole` solo para módulos completos donde no haga falta granularidad.
2. **Agregar permisos de borrado:** `products.delete`, `customers.delete` (ya existe `waste.delete`).
3. **Alinear el módulo de reportes** a admin/gerente/cajero.
4. **Alinear `/registro-pedidos`** a admin/gerente/cajero (o cambiar sus guards si el mesero debe ver sus pedidos).
5. **Alinear `/areas`** para que el chequeo de cajero sea alcanzable o eliminarlo.
6. **Corregir la detección JSON** de `requirePermission`.
7. **Tests de matriz:** un test por rol y módulo/acción para que la matriz no vuelva a divergir.

---

## 6. Módulo → feature (para el siguiente paso)

| Módulo | Feature key actual |
|---|---|
| Mesas / pedidos | `pos.mesas`, `pos.pedidos` |
| Productos | `menu.productos` |
| Caja | `caja.basica`, `caja.exportar` |
| Facturas | `facturas.internas`, `facturas.anular`, `facturas.marca` |
| Clientes | `clientes` |
| KDS cocina / bar | `kds.cocina`, `kds.bar` |
| Reportes | `reportes.basicos`, `reportes.avanzados`, `reportes.exportar` |
| Ventas | `ventas.historial`, `ventas.exportar` |
| Configuración | `configuracion.basica`, `configuracion.marca` |
| Áreas / croquis | `areas.croquis` (hoy solo Gold) |
| Registro de pedidos | `pos.pedidos` |
| Desperdicios | `inventario.desperdicios` |
| Auditoría | `auditoria` |
| Personal | `usuarios` |
| Mi plan | sin feature (admin/gerente) |

La matriz de roles y la de planes son independientes: un rol puede tener acceso a un módulo, pero el plan decide si el módulo existe para ese negocio.

---

## 7. Cambios aplicados (2026-11-19)

- `ROLE_PERMISSIONS` pasó a ser la fuente usada por los montajes y por las rutas sensibles.
- Permisos nuevos: `products.delete`, `customers.delete`, `audit.view`.
- `cajero`: se quitó `products.edit`; se agregaron `reports.view` y `customers.delete`.
- `gerente`: se agregaron `products.delete`, `customers.delete`, `audit.view`.
- `mesero`: se quitaron `kds.view` y `kds.serve`; no tiene `orders.cancel` ni `customers.delete`.
- Montajes:
  - `/mesas` → `orders.view`
  - `/caja` → `cash.view`
  - `/reportes` → `reports.view`
  - `/facturas` y `/ventas` → `sales.view`
  - `/configuracion` y `/mi-plan` → `restaurant.manage`
  - `/kds` → `kds.view`
  - `/areas` → `floorplan.edit`
  - `/desperdicios` → `waste.view`
  - `/auditoria` → `audit.view`
  - `/registro-pedidos` → `ROLES_CAJA`
  - `/productos` y `/clientes` conservan `authRole` de módulo.
- Rutas sensibles:
  - Cancelar pedido → `orders.cancel`
  - Facturar → `sales.invoice`
  - Anular factura → `sales.void`
  - Abrir/cerrar caja → `cash.open` / `cash.close`
  - Crear/editar/importar producto → `products.edit`; borrar → `products.delete`
  - Borrar cliente → `customers.delete`
  - Borrar desperdicio → `waste.delete`
- UI:
  - Cajero ve Productos sin botones de alta, edición, borrado ni importación.
  - Mesero no ve el botón de borrar cliente.
  - Cajero no ve el botón de borrar desperdicio.
  - El Dashboard ahora aparece en el menú del cajero.
- Se eliminó el chequeo muerto de cajero en `/areas/mesa/desbloquear`.
- `requirePermission` devuelve JSON en POST/PUT/DELETE.
- Verificación en vivo: mesero recibe 403 en reportes, KDS, productos, borrar cliente, registro de pedidos y cancelar pedido; cajero recibe 403 en editar/borrar producto, áreas, auditoría y borrar desperdicio; cajero sí puede reportes, productos (solo lectura), desperdicios (registrar) y cancelar pedidos.
- Tests: **94/94**.
