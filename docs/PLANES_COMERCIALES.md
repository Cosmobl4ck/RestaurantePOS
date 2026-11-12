# Planes comerciales MarrocosPOS

Documento de referencia del catálogo comercial **Básico**, **Premium** y **Gold**, de sus límites y de la aplicación técnica del gating por plan.

> Estado: **aprobado e implementado en código**. La migración `20261111120000_add_plan_catalog_and_entitlements.sql` debe aplicarse en Supabase para que el catálogo viva también en base de datos. Mientras no se aplique, la app usa el catálogo estático de `config/plans.js` como respaldo.

---

## 1. Resumen comercial

| Plan | Para quién | Precio | Idea central |
|---|---|---:|---|
| **Básico** | Restaurante pequeño, food truck o negocio con una sola estación | $19/mes | Operar el POS, cocina y cobro |
| **Premium** | Restaurante con salón, barra, inventario y varios empleados | $39/mes | Operación completa del restaurante |
| **Gold** | Grupos o restaurantes que necesitan límites ampliados y roadmap avanzado | $79/mes | Sin límites técnicos y acceso prioritario |

Precios en USD, ajustables. Se puede ofrecer pago anual con descuento.

**Trial:** 7 días con las funciones y límites de **Premium**. Al vencer se mantienen las 48 h de gracia actuales y luego se bloquea el acceso.

**Códigos internos:** `trial`, `basic`, `premium`, `gold`. El valor histórico `pro_plus` se normaliza a `gold`.

---

## 2. Límites

| Límite | Básico | Premium | Gold |
|---|---:|---:|---:|
| Usuarios | 5 | 15 | Sin límite |
| Mesas físicas | 15 | 50 | Sin límite |
| Áreas / salones | 1 | 5 | Sin límite |
| Productos | 100 | 500 | Sin límite |
| Estaciones KDS | 1 (Cocina) | 2 (Cocina + Bar) | Sin límite |
| Cajas | 1 | 1 | Multi-caja (fase 2) |
| Sucursales | 1 | 1 | Multi-sucursal (fase 2) |

Notas:

- Las mesas especiales `PARA LLEVAR` y `A DOMICILIO` no cuentan para el límite de mesas físicas.
- Los usuarios inactivos también cuentan, para evitar crear cuentas de más y desactivarlas.
- “Sin límite” en Gold significa sin límite técnico, con uso razonable.
- Si se baja de plan, no se borran datos: se bloquean módulos y se impide crear registros por encima del límite.
- El branding de factura existente no se elimina al bajar de plan; solo se oculta y se ignora hasta volver a Premium.

---

## 3. Matriz funcional

| Funcionalidad | Básico | Premium | Gold |
|---|:---:|:---:|:---:|
| Login multiusuario y roles | Sí | Sí | Sí |
| POS de mesas y mostrador | Sí | Sí | Sí |
| Abrir/cerrar pedido, ítems y notas | Sí | Sí | Sí |
| Enviar comanda | Sí | Sí | Sí |
| Facturar pedido | Sí | Sí | Sí |
| Anular factura con devolución de stock | Sí | Sí | Sí |
| Cancelar pedido | Sí | Sí | Sí |
| Mover pedido entre mesas | No | Sí | Sí |
| Clientes: CRUD y búsqueda | Sí | Sí | Sí |
| Menú: productos, precios y categorías | Sí | Sí | Sí |
| Ficha de producto: descripción, ingredientes y alérgenos | Sí | Sí | Sí |
| Aviso de alergia en POS y KDS | Sí | Sí | Sí |
| Tiempo de preparación y alerta de 2 minutos | No | Sí | Sí |
| KDS Cocina en tiempo real | Sí | Sí | Sí |
| KDS Bar en tiempo real | No | Sí | Sí |
| Croquis / áreas visuales | No | Sí | Sí |
| Reservas y bloqueo de mesas | No | Sí | Sí |
| Stock de bar y stock mínimo | No | Sí | Sí |
| Alertas de stock crítico | No | Sí | Sí |
| Importación de productos por Excel | No | Sí | Sí |
| Desperdicios | No | Sí | Sí |
| Caja: abrir/cerrar y arqueo | Sí | Sí | Sí |
| Exportar corte de caja a Excel | No | Sí | Sí |
| Factura interna imprimible | Sí | Sí | Sí |
| Personalización de factura: logo, QR, pie y papel | No | Sí | Sí |
| Historial de ventas | Sí | Sí | Sí |
| Exportar ventas a Excel | No | Sí | Sí |
| Registro de pedidos | Sí | Sí | Sí |
| Reporte de pedidos del período | No | Sí | Sí |
| Reportes del día | Sí | Sí | Sí |
| Reportes de 7 días, top productos y anulaciones | No | Sí | Sí |
| Lista de compras de bar | No | Sí | Sí |
| Configuración básica del negocio | Sí | Sí | Sí |
| Crear usuarios y roles | Sí | Sí | Sí |
| Límites ampliados | No | No | Sí |
| Soporte prioritario | No | No | Sí |
| Capacitación / onboarding | No | No | Sí |
| Multi-caja | No | No | Roadmap fase 2 |
| Multi-sucursal | No | No | Roadmap fase 2 |
| DTE / facturación electrónica | No | No | Roadmap fase 2 |
| API / webhooks | No | No | Roadmap fase 2 |
| Auditoría de acciones | No | No | Implementada (requiere migración) |
| Permisos avanzados | No | No | Roadmap fase 2 |
| Reportes personalizados / BI | No | No | Roadmap fase 2 |
| Backups automáticos | No | No | Roadmap fase 2 |

> Importante: las funciones de “roadmap fase 2” están marcadas en el catálogo como incluidas en Gold, pero **no deben venderse como disponibles** hasta que se implementen. La auditoría ya está implementada en código y solo requiere aplicar su migración. DTE queda reservado para el repositorio privado posterior.

---

## 4. Reglas de negocio

1. **Trial = Premium por 7 días.** Es la mejor forma de mostrar valor sin regalar Gold.
2. **Plan pagado = 30 días** desde la activación. Se puede extender sin cambiar de plan.
3. **Vencimiento:** se mantienen las 48 h de gracia actuales. Después se bloquea el acceso.
4. **Cambio de plan:** actualiza plan, fecha de inicio, fecha de vencimiento y estado activo.
5. **Downgrade:** solo se permite si el uso actual cabe en el plan destino. El panel muestra qué límite se excede y bloquea la operación.
6. **No se borran datos al bajar de plan.** Se bloquean módulos y se impide crear más registros de los permitidos.
7. **El plan no altera la contabilidad histórica.** Facturas, caja y pedidos anteriores se conservan.
8. **SuperAdmin sigue con Basic Auth.** No se mezcla con la sesión del POS.
9. **El tenant no puede autoasignarse un plan.** Solo SuperAdmin cambia planes; el tenant puede ver su plan y pedir upgrade por WhatsApp.
10. **`PLAN_ENFORCEMENT=false`** desactiva el bloqueo sin borrar el catálogo ni la UI. Es solo una válvula de escape operativa.

---

## 5. Implementación técnica

### 5.1 Archivos principales

| Archivo | Responsabilidad |
|---|---|
| `config/plans.js` | Fuente de verdad estática: códigos, nombres, precios, features y límites |
| `services/planService.js` | Carga el catálogo desde Supabase, usa fallback estático, calcula uso real y valida downgrades |
| `middlewares/planAccess.js` | `requireFeature`, `enforceLimit`, `denyFeature`, `denyLimit`, `currentPlan` |
| `middlewares/authMiddleware.js` | Adjunta `res.locals.plan`, `planLabel`, `planLimits` y `planPuede` a cada request autenticado |
| `routes/mi_plan.js` + `views/mi_plan.ejs` | Página `/mi-plan` con plan actual, uso vs límite, funciones y CTA de upgrade |
| `views/plan-required.ejs` | Página 403 amigable cuando falta una función o se alcanza un límite |
| `routes/superadmin.js` + `views/superadmin/admin_global.ejs` | Asignación de plan, uso vs límite, validación de downgrade, bitácora |
| `config/audit.js` | Catálogo de acciones auditables, etiquetas y agrupación para filtros |
| `services/auditService.js` | Registro tolerante a fallos, consulta paginada y resumen de auditoría |
| `routes/auditoria.js` + `views/auditoria.ejs` | Vista Gold `/auditoria` con filtros por acción, usuario y fechas |
| `supabase/migrations/20261111120000_add_plan_catalog_and_entitlements.sql` | Tablas `planes`, `plan_features`, `plan_limits`, `plan_change_log`, seeds y normalización |
| `supabase/migrations/20261112120000_add_audit_log.sql` | Tabla `auditoria_eventos`, índices por tenant, RLS y permisos de servicio |

### 5.2 Tablas

- `planes`: catálogo comercial.
- `plan_features`: features habilitadas por plan.
- `plan_limits`: límites por plan; `NULL` significa sin límite.
- `plan_change_log`: auditoría de cambios de plan hechos desde SuperAdmin.
- `auditoria_eventos`: bitácora por restaurante de acciones sensibles del POS.

La migración es idempotente, normaliza `pro_plus → gold`, crea un check en `restaurantes.plan`, siembra los cuatro planes y deja RLS activa con acceso solo para `service_role`.

### 5.3 Guards y límites aplicados

- **Rutas completas:** `/mesas`, `/productos`, `/caja`, `/reportes`, `/facturas`, `/clientes`, `/ventas`, `/configuracion`, `/registro-pedidos`.
- **Premium:** `/bar`, `/areas`, `/desperdicios`, importación Excel, exportaciones de caja/ventas, reporte de pedidos, reportes avanzados, personalización de factura, mover pedidos, tiempos KDS.
- **Límites:** usuarios, productos y áreas usan `enforceLimit`. Mesas físicas se validan al guardar el croquis; las mesas especiales no cuentan.
- **KDS:** el gating de bar y tiempos se valida tanto en la página/API como en la UI. En Básico, el monitor de cocina sigue funcionando sin temporizador.
- **Downgrade:** el servidor calcula el uso real antes de cambiar de plan y rechaza el cambio si se excede un límite.

### 5.4 Variables de entorno

```env
PLAN_ENFORCEMENT=true
PLAN_CACHE_TTL_MS=60000
```

- `PLAN_ENFORCEMENT=true` aplica el gating. `false` lo desactiva temporalmente.
- `PLAN_CACHE_TTL_MS` controla el caché en memoria del catálogo leído desde Supabase.

### 5.5 Auditoría de acciones (Gold)

La feature `auditoria` está implementada en código y se expone en `/auditoria` para `admin` y `gerente`.

**Eventos registrados actualmente:**

- Inicio y cierre de sesión.
- Creación de usuarios.
- Crear, actualizar, eliminar e importar productos.
- Abrir y cerrar caja.
- Facturar, cancelar y mover pedidos.
- Anular facturas.
- Guardar configuración del negocio.

**Reglas de privacidad:**

- Nunca se guardan PINs, contraseñas, tokens ni imágenes.
- El detalle se limita en tamaño y se muestra escapado en la vista.
- Cada consulta filtra por `restaurante_id` de la sesión.
- La tabla no tiene acceso directo para `anon` ni `authenticated`; solo `service_role`.
- La vista es de solo lectura y no permite borrar ni editar eventos.

**Requisito:** aplicar `supabase/migrations/20261112120000_add_audit_log.sql`. Si falta, la app sigue operando y `/auditoria` muestra un aviso; simplemente no se registran eventos nuevos.

---

## 6. Operación con SuperAdmin

1. Aplicar las migraciones de planes y auditoría en Supabase SQL Editor.
2. Entrar a `/superadmin/panel` con Basic Auth.
3. Crear o localizar el negocio.
4. Revisar la columna **Uso vs límite**.
5. Usar **Plan → Cambiar plan** para asignar Básico, Premium o Gold.
6. Si es un downgrade, el servidor valida los límites y muestra el detalle del bloqueo.
7. Cada cambio queda en `plan_change_log` con plan anterior, plan nuevo, usuario y metadata.

---

## 7. Pendientes deliberados

- Aplicar las migraciones de planes y auditoría en el proyecto real de Supabase.
- Implementar DTE en el repositorio privado y activar su feature solo cuando exista.
- Multi-caja, multi-sucursal, API, BI, permisos avanzados y backups siguen como roadmap; no venderlos como disponibles.
- Evaluar retención histórica de auditoría por plan cuando exista una política de depuración.
