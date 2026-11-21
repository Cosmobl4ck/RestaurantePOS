# 🚀 GUÍA COMPLETA: MIGRACIÓN A SUPABASE

## 📋 TABLA DE CONTENIDOS
1. [Crear Proyecto Supabase](#crear-proyecto-supabase)
2. [Migrar Base de Datos](#migrar-base-de-datos)
3. [Actualizar Dependencias](#actualizar-dependencias)
4. [Crear Archivo .env](#crear-archivo-env)
5. [Migrar Rutas a Supabase](#migrar-rutas-a-supabase)
6. [Pruebas y Validación](#pruebas-y-validación)
7. [Deployment](#deployment)

---

## 1. CREAR PROYECTO SUPABASE

### Paso 1.1: Crear Cuenta
1. Ir a https://supabase.com
2. Hacer login con GitHub / Google
3. Crear un nuevo proyecto:
   - **Name**: `sistema-restaurante` (o tu nombre)
   - **Database Password**: Generar contraseña fuerte
   - **Region**: Elegir cercana (US, EU, APAC)
   - **Pricing**: Free tier está bien para empezar

**Tiempo**: 2-3 minutos (base de datos se provisiona automáticamente)

### Paso 1.2: Obtener Credenciales
1. Ir a **Settings → API** en el dashboard de Supabase
2. Copiar:
   - `Project URL` → SUPABASE_URL
   - `anon public` key → SUPABASE_KEY
   - `service_role` secret (opcional pero recomendado para server)

**Guardar en archivo seguro**

---

## 2. MIGRAR BASE DE DATOS

### Paso 2.1: Acceder al SQL Editor
1. En dashboard Supabase → **SQL Editor**
2. Click en **New Query**

### Paso 2.2: Ejecutar Script de Migración
1. Copiar TODO el contenido de `config/supabase-migration.sql`
2. Pegar en el editor SQL
3. Click **Run** (triángulo ▶ arriba a la derecha)
4. Esperar a que termine (debe mostrar ✅ éxito)

**Si hay errores**:
- Check que no hay queries duplicadas
- Verificar que PostgreSQL syntax es correcto
- Nota: Los BLOB de MySQL se convierten a BYTEA en PostgreSQL

### Paso 2.3: Verificar Tablas Creadas
Ejecutar en SQL Editor:
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
```

Deberías ver ~11 tablas:
- restaurantes
- usuarios
- productos
- mesas
- pedidos
- pedido_items
- facturas
- detalle_factura
- cortes_caja
- configuracion_impresion

### Paso 2.4: Exportar Datos de MySQL (OPCIONAL)
Si tienes datos reales que migrar:

```bash
# 1. Exportar desde MySQL
mysqldump -h localhost -u cosmo -p12345678 restaurante_caja > backup.sql

# 2. Convertir MySQL → PostgreSQL
# (Puede requerir ediciones manuales)
# Cambios principales:
#   - AUTO_INCREMENT → SERIAL
#   - ENUM → VARCHAR + CHECK
#   - TIMESTAMP ON UPDATE → TRIGGER
#   - backticks → comillas

# 3. Importar a Supabase
# Pegar contenido convertido en SQL Editor
```

**Alternativa más fácil**: Usar herramientas como [DBeaver](https://dbeaver.io) con:
- Source: MySQL local
- Target: Supabase PostgreSQL
- (Hace la conversión automáticamente)

---

## 3. ACTUALIZAR DEPENDENCIAS

### Paso 3.1: Instalar Supabase
```bash
cd SistemaBase
pnpm remove mysql2                    # Eliminar MySQL driver
pnpm install @supabase/supabase-js       # Supabase client
pnpm install helmet express-rate-limit   # Seguridad
pnpm install joi                         # Validación
```

### Paso 3.2: Verificar package.json
Tu `package.json` debe tener:
```json
{
  "dependencies": {
    "bcryptjs": "^3.0.3",
    "body-parser": "^1.20.2",
    "dotenv": "^16.6.1",
    "ejs": "^3.1.9",
    "exceljs": "^4.4.0",
    "express": "^4.21.2",
    "express-session": "^1.18.2",
    "@supabase/supabase-js": "^2.26.0",     // NUEVO
    "helmet": "^7.0.0",                     // NUEVO
    "express-rate-limit": "^6.7.0",         // NUEVO
    "joi": "^17.9.2",                       // NUEVO
    "multer": "^1.4.5-lts.1",
    "jsonwebtoken": "^9.0.3"
  }
}
```

---

## 4. CREAR ARCHIVO .ENV

### Paso 4.1: Crear .env
```bash
cp .env.example .env
```

### Paso 4.2: Editar .env con tus credenciales
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-public-key-here
SESSION_SECRET=your-generated-secret-here
NODE_ENV=development
PORT=3005
```

**Para generar SESSION_SECRET seguro**:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Paso 4.3: Agregar .env a .gitignore
Asegurar que NO se comitea:
```bash
# En .gitignore, agregar:
.env
.env.local
.env.*.local
```

---

## 5. MIGRAR RUTAS A SUPABASE

### Paso 5.1: Actualizar server.js

**Cambios**:
1. Reemplazar:
```javascript
const db = require('./config/database');
```
Con:
```javascript
const { supabase } = require('./config/supabase');
```

2. Agregar seguridad (después de middlewares base):
```javascript
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

app.use(helmet());

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,  // 15 minutos
    max: 100                   // 100 requests por ventana
});
app.use(limiter);
```

3. Actualizar sesión:
```javascript
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        sameSite: 'strict'
    }
}));
```

**Ver archivo completo**: [server-supabase.js](./server-supabase.js)

### Paso 5.2: Actualizar routes/auth.js

**Cambios principales**:

**ANTES (MySQL)**:
```javascript
const [users] = await pool.query(
    'SELECT u.* FROM usuarios u INNER JOIN restaurantes r ...',
    [codigo_negocio, nombreUsuario]
);
```

**DESPUÉS (Supabase)**:
```javascript
const { loginUsuario } = require('../config/supabase');

const user = await loginUsuario(codigo_negocio, nombreUsuario);
```

**Validación completa del login**:
```javascript
router.post('/login', async (req, res) => {
    const { codigo_negocio, nombre, pin } = req.body;

    try {
        const user = await loginUsuario(codigo_negocio, nombre);
        
        if (!user) {
            return res.render('login', { error: 'Credenciales incorrectas' });
        }

        const esValido = await bcrypt.compare(pin, user.pin_hash);
        
        if (esValido) {
            req.session.usuario = {
                id: user.id,
                restaurante_id: user.restaurante_id,
                nombre: user.nombre,
                rol: user.rol
            };
            return res.redirect('/dashboard');
        } else {
            return res.render('login', { error: 'PIN incorrecto' });
        }
    } catch (error) {
        console.error('Error login:', error);
        res.render('login', { error: 'Error de servidor' });
    }
});
```

### Paso 5.3: Patrón de Migración para Otras Rutas

**Ejemplo: routes/productos.js**

**MYSQL original**:
```javascript
router.get('/', authRole(['admin', 'cajero']), async (req, res) => {
    const [productos] = await pool.query(
        'SELECT * FROM productos WHERE restaurante_id = ?',
        [req.session.usuario.restaurante_id]
    );
    res.render('productos', { productos });
});
```

**Supabase nuevo**:
```javascript
const { getProductos } = require('../config/supabase');

router.get('/', authRole(['admin', 'cajero']), async (req, res) => {
    try {
        const restaurante_id = req.session.usuario.restaurante_id;
        
        // Validar restaurante activo
        const { validarRestaurante } = require('../config/supabase');
        await validarRestaurante(restaurante_id);
        
        const productos = await getProductos(restaurante_id);
        res.render('productos', { productos });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).render('error', { error: error.message });
    }
});
```

**Ejemplo: Crear Producto**:
```javascript
router.post('/', authRole(['admin']), async (req, res) => {
    try {
        const { codigo, nombre, precio_unidad, categoria } = req.body;
        const restaurante_id = req.session.usuario.restaurante_id;

        const { query } = require('../config/supabase');
        
        const resultado = await query('productos', 'insert', {}, {
            restaurante_id,
            codigo,
            nombre,
            precio_unidad: parseFloat(precio_unidad),
            categoria,
            maneja_stock: categoria === 'Bar' ? true : false
        });

        res.json({ success: true, data: resultado });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});
```

**Ejemplo: Obtener Pedidos Abiertos (con JOIN)**:
```javascript
router.get('/abiertos', authRole(['mesero', 'cajero']), async (req, res) => {
    try {
        const { getPedidosAbiertos } = require('../config/supabase');
        const restaurante_id = req.session.usuario.restaurante_id;
        
        const pedidos = await getPedidosAbiertos(restaurante_id);
        res.json(pedidos);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});
```

### Paso 5.4: Migración Completa de Rutas

**PRIORIDAD ALTA** (migrar primero):
1. ✅ `routes/auth.js` - Crítica para login
2. ✅ `routes/productos.js` - Inventario
3. ✅ `routes/mesas.js` - Operacional
4. ✅ `routes/facturas.js` - Crítica para pagos
5. ✅ `routes/caja.js` - Control de efectivo

**PRIORIDAD MEDIA**:
6. `routes/pedidos.js` (si existe)
7. `routes/reportes.js`
8. `routes/cocina.js`
9. `routes/bar.js`

**PRIORIDAD BAJA**:
10. `routes/clientes.js`
11. `routes/configuracion.js`
12. `routes/superadmin.js` (más complejo)

---

## 6. PRUEBAS Y VALIDACIÓN

### Paso 6.1: Test Local
```bash
cd SistemaBase
pnpm dev

# Debería ver:
# ✅ Supabase conectado correctamente
# 📍 URL: https://your-project.supabase.co
# Server running on port 3005
```

### Paso 6.2: Test de Login
1. Abrir http://localhost:3005/login
2. Ingresar:
   - **Código de Negocio**: `MARROCOS01`
   - **Usuario**: `Admin`
   - **PIN**: `1234`
3. Debería redirigir a dashboard

### Paso 6.3: Test de CRUD
- [ ] Crear producto (POST /productos)
- [ ] Listar productos (GET /productos)
- [ ] Actualizar producto (PUT /productos/:id)
- [ ] Eliminar producto (DELETE /productos/:id)

### Paso 6.4: Test de Multi-Tenant
1. Crear segundo restaurante en Supabase:
```sql
INSERT INTO restaurantes (codigo_negocio, nombre_comercial, estado, fecha_vencimiento)
VALUES ('DEMO456', 'Otro Restaurante', 'activo', NOW() + INTERVAL '30 days');

INSERT INTO usuarios (restaurante_id, nombre, rol, pin_hash, estado)
VALUES (2, 'Admin2', 'admin', '$2b$10$vI8A7S/Yw.wWf7yYVpS7fO6f7z8f9g0h1i2j3k4l5m6n7o8p9q0r', 1);
```

2. Abrir sesión con usuario de segundo restaurante
3. Verificar que SOLO ve sus datos (no los del primero)

### Paso 6.5: Test de Validaciones
- [ ] Licencia expirada: No permite login
- [ ] Usuario inactivo: No permite login
- [ ] PIN incorrecto: Error claro
- [ ] Restaurante suspendido: Error claro

---

## 7. DEPLOYMENT

### Opción 1: VERCEL (Recomendado)
```bash
# 1. Instalar vercel cli
pnpm add --global vercel

# 2. Deploy
vercel

# 3. Agregar variables de entorno en Vercel Dashboard:
# SUPABASE_URL, SUPABASE_KEY, SESSION_SECRET
```

### Opción 2: RAILWAY
```bash
# 1. Connect GitHub repo
# 2. Create new service
# 3. Add environment variables
# 4. Auto-deploys on git push
```

### Opción 3: HEROKU (Gratis pero lento)
```bash
heroku login
heroku create your-app-name
heroku config:set SUPABASE_URL=...
git push heroku main
```

### Opción 4: VPS (Digital Ocean, AWS, etc.)
```bash
# Manual deployment:
ssh user@your-server.com
git clone your-repo.git
cd your-repo/SistemaBase
pnpm install
pnpm start

# Con PM2 (process manager):
pnpm add --global pm2
pm2 start server.js --name "pos-sistema"
pm2 startup
pm2 save
```

---

## 📊 CHECKLIST DE MIGRACIÓN

- [ ] Crear cuenta Supabase
- [ ] Obtener SUPABASE_URL y SUPABASE_KEY
- [ ] Ejecutar script de migración en SQL Editor
- [ ] Verificar ~11 tablas creadas
- [ ] Instalar dependencias (@supabase/supabase-js, etc.)
- [ ] Crear archivo .env con credenciales
- [ ] Actualizar server.js (helmet, rate-limit, session)
- [ ] Actualizar routes/auth.js
- [ ] Migrar rutas principales (productos, mesas, facturas)
- [ ] Test de login con MARROCOS01 / Admin / 1234
- [ ] Test de multi-tenant con segundo restaurante
- [ ] Test de validaciones (licencia, usuario)
- [ ] Migrar datos reales si existen
- [ ] Migrar rutas restantes
- [ ] Deploy a Vercel / Railway / VPS
- [ ] Configurar HTTPS y SSL
- [ ] Configurar backups automáticos
- [ ] Monitores de performance
- [ ] Plan de rollback (mantener MySQL como backup)

---

## 🆘 TROUBLESHOOTING

### Error: "Falta SUPABASE_URL"
```
→ Crear archivo .env con las credenciales
→ Reiniciar servidor (pnpm dev)
```

### Error: "P0001: permission denied for schema public"
```
→ Ir a Supabase: SQL Editor → New Query
→ Ejecutar: GRANT ALL ON SCHEMA public TO authenticated;
→ Luego grant a tu usuario específico
```

### Error: "23505: duplicate key value"
```
→ Tabla tiene UNIQUE constraint
→ Cambiar código de producto a único valor
→ O usar ON CONFLICT DO UPDATE (PostgreSQL)
```

### Session no persiste después de refresh
```
→ Cookie secure: false está bien en development
→ En production NECESITA HTTPS
→ Verificar que SESSION_SECRET no es vacío
```

### Imágenes/BLOBs no se suben
```
→ Usar Supabase Storage (tipo S3)
→ No guardar archivos grandes en BD directamente
→ Versión de migración usa BYTEA pero es mejor usar Storage
```

---

## 📚 RECURSOS ADICIONALES

- [Docs Supabase](https://supabase.com/docs)
- [Supabase JS Client](https://supabase.com/docs/reference/javascript/introduction)
- [PostgreSQL vs MySQL](https://www.postgresql.org/docs/current/sql-syntax.html)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
- [Storage Buckets](https://supabase.com/docs/guides/storage)

---

**¡Listo! Tu sistema ahora está en la nube con Supabase 🎉**

**Preguntas frecuentes**:
- ¿Puedo volver a MySQL?: Sí, los datos están en Supabase (PostgreSQL) y puedes exportar
- ¿Cuánto cuesta?: Free tier: 500MB BD, 1GB storage, suficiente para inicio
- ¿Es seguro?: Sí, Supabase usa certificados SSL/TLS, RLS, y encriptación
- ¿Backup automático?: Sí, Supabase hace backup automático cada día
