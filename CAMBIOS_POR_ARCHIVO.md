/**
 * CHECKLIST DE MIGRACIÓN: CAMBIOS POR ARCHIVO
 * 
 * Este documento especifica exactamente qué cambiar en cada archivo
 * para migrar de MySQL a Supabase
 */

// ========================================
// 1. CAMBIOS EN server.js
// ========================================

/*
✅ VER: server-supabase.js (archivo de referencia completo)

CAMBIOS ESPECÍFICOS:

1. Línea ~7: Cambiar import
   ❌ const db = require('./config/database');
   ✅ const { supabase } = require('./config/supabase');

2. Línea ~10: Agregar headers de seguridad (NUEVO)
   ✅ const helmet = require('helmet');
   ✅ app.use(helmet());

3. Línea ~20: Agregar rate limiting (NUEVO)
   ✅ const rateLimit = require('express-rate-limit');
   ✅ app.use(rateLimit({ windowMs: 15*60*1000, max: 100 }));

4. Línea ~41: Mejorar configuración de sesión
   ❌ cookie: { secure: false }
   ✅ cookie: { 
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        sameSite: 'strict',
        maxAge: 1000 * 60 * 60 * 24
      }

5. Resto: Los routers pueden quedarse igual (el cambio está en las rutas)
*/

// ========================================
// 2. CAMBIOS EN routes/auth.js
// ========================================

/*
CAMBIOS:

1. Línea 1: Cambiar import
   ❌ const pool = require('../config/database');
   ✅ const { loginUsuario } = require('../config/supabase');

2. Línea 26-40: POST /login - Reemplazar query completa
   
   ❌ VIEJO:
   const [users] = await pool.query(
       'SELECT u.* FROM usuarios u INNER JOIN restaurantes r...',
       [codigoNegocio, nombreUsuario]
   );
   
   ✅ NUEVO:
   const user = await loginUsuario(codigoNegocio, nombreUsuario);
   if (!user) {
       return res.render('login', { error: 'Credenciales incorrectas' });
   }
   
   (Ver MIGRATION_EXAMPLES.js para ejemplo completo)
*/

// ========================================
// 3. CAMBIOS EN routes/productos.js
// ========================================

/*
CAMBIOS CLAVE:

1. Línea 1: Cambiar import
   ❌ const pool = require('../config/database');
   ✅ const { getProductos, query } = require('../config/supabase');

2. GET / endpoint:
   ✅ Ver ejemplo en MIGRATION_EXAMPLES.js - EJEMPLO 1

3. POST / endpoint (crear):
   ✅ Ver ejemplo en MIGRATION_EXAMPLES.js - EJEMPLO 2

4. PUT /:id endpoint (actualizar):
   ✅ Ver ejemplo en MIGRATION_EXAMPLES.js - EJEMPLO 3

5. DELETE /:id endpoint:
   ✅ Ver ejemplo en MIGRATION_EXAMPLES.js - EJEMPLO 4

6. Cambios en queries:
   - pool.query() → supabase.from().select()
   - result.insertId → data[0].id
   - result.affectedRows → data.length
*/

// ========================================
// 4. CAMBIOS EN routes/mesas.js
// ========================================

/*
CAMBIOS CLAVE:

1. Import changes (igual que otros)

2. GET / (listar mesas con pedidos):
   ✅ Usar JOIN de Supabase:
   await supabase
     .from('mesas')
     .select('*, pedidos(count)')
     .eq('restaurante_id', restaurante_id)

3. POST /abrir (crear pedido):
   ✅ Insert en tabla pedidos
   ✅ Update mesa estado a 'ocupada'

4. POST /pedidos/:id/items (agregar item):
   ✅ Insert en pedido_items
   ✅ Update pedidos.total

5. POST /pedidos/:id/facturar (cerrar pedido):
   ✅ Ver MIGRATION_EXAMPLES.js - EJEMPLO 6 (Transacciones)
   ✅ Crear factura
   ✅ Copiar items a detalle_factura
   ✅ Update pedido estado='cerrado'
   ✅ Update mesa estado='libre'
*/

// ========================================
// 5. CAMBIOS EN routes/facturas.js
// ========================================

/*
CAMBIOS CLAVE:

1. Import changes

2. GET / (listar facturas):
   ✅ Ver MIGRATION_EXAMPLES.js - EJEMPLO 8 (Paginación)
   ✅ order('fecha', { ascending: false })
   ✅ range(offset, limit)

3. POST /anular/:id:
   ✅ Update factura estado='anulada'
   ✅ Update stock de productos (restaurar)
   ✅ Registrar anulado_por y fecha_anulacion

4. Búsqueda/filtros:
   ✅ Ver MIGRATION_EXAMPLES.js - EJEMPLO 9

5. Exportar a Excel:
   ✅ Mismo código (exceljs funciona igual)
   ✅ Solo cambiar cómo obtiene datos (de Supabase)
*/

// ========================================
// 6. CAMBIOS EN routes/reportes.js
// ========================================

/*
CAMBIOS CLAVE:

1. Todas las aggregations (COUNT, SUM, AVG):
   ✅ Ver MIGRATION_EXAMPLES.js - EJEMPLO 7
   ✅ En lugar de SUM en BD, hacer en código:
   
   data.reduce((sum, f) => sum + f.total, 0)

2. Consultas complejas con múltiples JOINs:
   ✅ Usar select() de Supabase con nested references
   ✅ Ejemplo:
   await supabase
     .from('facturas')
     .select('*, detalle_factura(*, productos(nombre))')

3. Filtros por fecha:
   ✅ .gte('fecha', inicio)
   ✅ .lte('fecha', fin)
*/

// ========================================
// 7. CAMBIOS EN routes/caja.js
// ========================================

/*
CAMBIOS CLAVE:

1. GET / (estado actual de caja):
   ✅ Query a cortes_caja
   ✅ Calcular total de efectivo del día

2. POST /abrir (abrir caja):
   ✅ Insert en cortes_caja
   ✅ estado = 'abierta'

3. POST /cerrar (cerrar caja):
   ✅ Update cortes_caja con monto_cierre
   ✅ Calcular:
       SELECT SUM(total) FROM facturas 
       WHERE forma_pago='efectivo' AND DATE(fecha)=TODAY
   ✅ Comparar con monto_final (del formulario)

4. GET /exportar:
   ✅ Obtener datos de facturas del día
   ✅ Generar Excel (mismo código que antes)
*/

// ========================================
// 8. CAMBIOS EN routes/cocina.js
// ========================================

/*
CAMBIOS CLAVE:

1. GET / (ver cola de cocina):
   ✅ Select pedidos con estado != 'servido'
   ✅ Include pedido_items
   ✅ Include productos.nombre

2. GET /cola (actualizar en tiempo real):
   ✅ OPCIONAL: Usar real-time subscriptions de Supabase:
   
   supabase
     .from('pedido_items')
     .on('*', payload => {
       console.log('Cambio:', payload)
     })
     .subscribe()

3. PUT /item/:id/estado (cambiar estado de item):
   ✅ Update pedido_items
   ✅ Update pedido_items.preparado_at = NOW()
   ✅ Opcional: si todos los items están listos,
      update pedido.estado = 'listo'
*/

// ========================================
// 9. CAMBIOS EN routes/bar.js
// ========================================

/*
CAMBIOS CLAVE:

Similar a cocina.js

1. GET /bar (ver pedidos de bar)
2. GET /api/bar/pedidos-activos (API para actualizar)
3. POST /api/pedidos/:id/estado-bar (cambiar estado)
*/

// ========================================
// 10. CAMBIOS EN routes/clientes.js
// ========================================

/*
CAMBIOS CLAVE:

1. GET / - Listar clientes
2. POST / - Crear cliente
3. PUT /:id - Actualizar
4. DELETE /:id - Eliminar
5. GET /buscar - Búsqueda con filtros
   ✅ Ver MIGRATION_EXAMPLES.js - EJEMPLO 9

Todo sigue el patrón básico de MIGRATION_EXAMPLES.js
*/

// ========================================
// 11. CAMBIOS EN routes/configuracion.js
// ========================================

/*
CAMBIOS CLAVE:

1. GET / - Obtener config del restaurante
   ✅ Select de configuracion_impresion
   ✅ .eq('restaurante_id', id)

2. POST / - Guardar config
   ✅ Update configuracion_impresion
   ✅ Si no existe, INSERT

3. Logo y QR:
   ✅ VIEJO: Guardaba BLOB directamente
   ✅ NUEVO: Mejor usar Supabase Storage
   
   // Subir archivo
   await supabase.storage
     .from('logos')
     .upload(`${restaurante_id}/logo.png`, file)
   
   // Obtener URL
   const url = supabase.storage
     .from('logos')
     .getPublicUrl(`${restaurante_id}/logo.png`).data.publicUrl
   
   // Guardar URL en BD
   await supabase
     .from('configuracion_impresion')
     .update({ logo_url: url })
*/

// ========================================
// 12. CAMBIOS EN routes/superadmin.js
// ========================================

/*
CAMBIOS CLAVE (Más complejo):

1. GET /panel - Dashboard de todos los restaurantes
   ✅ Sin filtro de restaurante_id (es admin)
   ✅ Contar usuarios, facturas, etc. por restaurante

2. POST /registrar-negocio - Crear nuevo restaurante
   ✅ Insert en restaurantes
   ✅ Insert en usuarios (admin por defecto)
   ✅ Insert en configuracion_impresion
   ✅ Generar codigo_negocio único

3. POST /editar-negocio - Actualizar restaurante
   ✅ Update restaurantes

4. POST /extender/:id - Extender fecha de vencimiento
   ✅ Update fecha_vencimiento

5. POST /toggle-estado/:id - Activar/suspender
   ✅ Update estado

6. POST /eliminar-negocio/:id - Eliminar restaurante
   ✅ Delete restaurantes (cascade elimina todo)

Toda la lógica es similar, solo sin filtro multi-tenant
*/

// ========================================
// 13. CAMBIOS EN middlewares/authMiddleware.js
// ========================================

/*
CAMBIOS CLAVE:

Función: Verificar que restaurante está activo y no vencido

❌ VIEJO:
const [restaurantes] = await pool.query(
    'SELECT * FROM restaurantes WHERE id = ?',
    [id]
);

✅ NUEVO:
const { validarRestaurante } = require('../config/supabase');
await validarRestaurante(restaurante_id);

(Función incluida en config/supabase.js)
*/

// ========================================
// 14. CAMBIOS EN middlewares/authRole.js
// ========================================

/*
Este archivo NO CAMBIA - La lógica es la misma
Solo asegúrate que rol venga de req.session.usuario.rol
*/

// ========================================
// RESUMEN DE CAMBIOS
// ========================================

/*
ARCHIVOS QUE DEBEN CAMBIAR:

✅ server.js
   - Agregar helmet, rate-limit
   - Cambiar import db → supabase
   - Mejorar sesiones

✅ config/database.js
   - ARCHIVAR o ELIMINAR (reemplazar con config/supabase.js)

✅ routes/auth.js
   - Usar loginUsuario() de supabase.js
   - Cambiar pool.query() → supabase queries

✅ routes/productos.js
   - Cambiar pool.query() → supabase queries
   - Cambiar INSERT/UPDATE/DELETE

✅ routes/mesas.js
   - Cambiar pool.query() → supabase queries
   - Manejar transacciones de forma diferente

✅ routes/facturas.js
   - Cambiar pool.query() → supabase queries
   - Borrar lógica de transacciones (más simple)

✅ routes/caja.js
   - Cambiar pool.query() → supabase queries
   - Cálculos de efectivo

✅ routes/reportes.js
   - Cambiar aggregations (COUNT, SUM en código)
   - Cambiar JOINs complejos

✅ routes/cocina.js
   - Cambiar pool.query() → supabase queries
   - OPCIONAL: Real-time subscriptions

✅ routes/bar.js
   - Cambiar pool.query() → supabase queries

✅ routes/clientes.js
   - Cambiar pool.query() → supabase queries

✅ routes/configuracion.js
   - Cambiar pool.query() → supabase queries
   - Usar Storage en lugar de BLOB

✅ routes/superadmin.js
   - Cambiar pool.query() → supabase queries
   - Sin filtro de restaurante_id

✅ middlewares/authMiddleware.js
   - Usar validarRestaurante() de supabase.js

❌ middlewares/authRole.js
   - NO CAMBIA

❌ views/*.ejs
   - NO CAMBIAN

❌ public/js/*.js
   - NO CAMBIAN (o mínimos cambios)

❌ public/css/*.css
   - NO CAMBIAN
*/

// ========================================
// PASOS RECOMENDADOS DE MIGRACIÓN
// ========================================

/*
ORDEN RECOMENDADO (por dependencias):

1️⃣  PRIMERO:
    - Crear config/supabase.js
    - Crear .env
    - Crear supabase-migration.sql y ejecutar

2️⃣  SEGUNDO:
    - Cambiar server.js (agregar helmet, rate-limit)
    - Cambiar middlewares/authMiddleware.js

3️⃣  TERCERO (Core):
    - routes/auth.js
    - routes/productos.js
    - routes/mesas.js

4️⃣  CUARTO (Financiero):
    - routes/facturas.js
    - routes/caja.js

5️⃣  QUINTO (Operacional):
    - routes/reportes.js
    - routes/cocina.js
    - routes/bar.js

6️⃣  SEXTO (Menos crítico):
    - routes/clientes.js
    - routes/configuracion.js
    - routes/ventas.js

7️⃣  ÚLTIMO:
    - routes/superadmin.js (más complejo)

TESTING después de cada cambio:
- npm run dev
- Probar funcionalidad
- Verificar logs
*/

// ========================================
// HERRAMIENTAS QUE TE AYUDARÁN
// ========================================

/*
1. Postman o Insomnia
   - Para testear endpoints
   - Guardar requests
   - Validar responses

2. DBeaver
   - Conectar a Supabase PostgreSQL
   - Ejecutar queries para debug
   - Ver estructura de datos

3. VS Code Extensions:
   - Thunder Client (similar a Postman)
   - SQL Tools (para queries Supabase)
   - REST Client

4. Supabase Dashboard
   - SQL Editor: Ver datos en tiempo real
   - Logs: Ver errores
   - API: Ver documentación auto-generada
*/

// ========================================
// FINALMENTE
// ========================================

/*
✅ Has entendido:
   - Qué cambiar (archivo por archivo)
   - Por qué cambiar (seguridad, escalabilidad)
   - Cómo cambiar (ver MIGRATION_EXAMPLES.js)

✅ Tienes:
   - SQL migration script
   - Supabase client configurado
   - Ejemplos de código
   - Guía paso a paso

⏭️  Próximo paso:
   1. Crear cuenta Supabase
   2. Ejecutar migration script
   3. Comenzar migración por orden recomendado
   4. Testear cada cambio

¿Preguntas? Revisa:
   - MIGRATION_EXAMPLES.js (código real)
   - MIGRATION_GUIDE.md (pasos)
   - config/supabase.js (funciones helper)
*/
