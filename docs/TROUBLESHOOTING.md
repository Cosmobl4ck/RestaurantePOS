# 🚨 TROUBLESHOOTING Y COMANDOS ÚTILES

## 🔧 COMANDOS RÁPIDOS

### Setup Inicial
```bash
# Crear proyecto
cd SistemaBase

# Instalar dependencias
pnpm install
pnpm install @supabase/supabase-js helmet express-rate-limit joi

# Crear .env
cp .env.example .env
# Editar .env con tus credenciales

# Iniciar en desarrollo
pnpm dev

# Debería ver:
# ✅ Supabase conectado correctamente
# 🚀 SERVIDOR INICIADO EN PUERTO: 3005
```

### Testing
```bash
# Test de login local
curl -X POST http://localhost:3005/login \
  -H "Content-Type: application/json" \
  -d '{"codigo_negocio":"MARROCOS01","nombre":"Admin","pin":"1234"}'

# Test de producto GET
curl http://localhost:3005/productos

# Ver logs en tiempo real
pnpm dev 2>&1 | grep -i error
```

### Base de Datos
```bash
# Conectar a Supabase CLI (si lo instalas)
supabase link --project-ref your-project-id

# Exportar datos
pg_dump postgresql://user:pass@db.supabase.co/postgres > backup.sql

# Ver tamaño de BD
SELECT pg_size_pretty(pg_database_size('postgres'));
```

---

## 🐛 ERRORES COMUNES Y SOLUCIONES

### Error 1: "Falta SUPABASE_URL o SUPABASE_KEY en .env"

```
❌ ERROR:
  Error de conexión Supabase: SUPABASE_URL is required

✅ SOLUCIÓN:
  1. Copiar .env.example a .env
  2. Ir a supabase.com → Settings → API
  3. Copiar:
     - Project URL → SUPABASE_URL
     - anon public → SUPABASE_KEY
  4. Guardar en .env
  5. Reiniciar: pnpm dev
```

### Error 2: "401 Unauthorized - JWT signature invalid"

```
❌ ERROR:
  Error: 401 Unauthorized - JWT signature invalid

✅ SOLUCIÓN:
  - El SUPABASE_KEY está expirado o incorrecto
  - Ir a Supabase: Settings → API → Regenerate keys
  - Copiar nuevo key a .env
  - Reiniciar servidor
```

### Error 3: "relation does not exist"

```
❌ ERROR:
  Error: 42P01: relation "productos" does not exist

✅ SOLUCIÓN:
  - Las tablas no fueron creadas
  - Ir a Supabase: SQL Editor → New Query
  - Copiar contenido de config/supabase-migration.sql
  - Ejecutar (triangulo ▶)
  - Esperar a que termine
```

### Error 4: "duplicate key value violates unique constraint"

```
❌ ERROR:
  Error: 23505: duplicate key value violates unique constraint

✅ SOLUCIÓN:
  - El código_negocio ya existe
  - Cambiar a código diferente:
    INSERT INTO restaurantes (codigo_negocio, nombre_comercial, ...)
    VALUES ('DEMO999', 'Otro nombre', ...)
```

### Error 5: "Cookie not being stored"

```
❌ ERROR:
  - Login funciona pero la sesión se pierde
  - Página se recarga y vuelve a login

✅ SOLUCIÓN (Development):
  - En server.js: cookie.secure = false ✅
  - Reiniciar: pnpm dev

✅ SOLUCIÓN (Production):
  - Necesita HTTPS obligatoriamente
  - Si usas Vercel/Railway, HTTPS está auto-configurado
  - Si es VPS, usar Let's Encrypt (nginx, certbot)
```

### Error 6: "Session data is undefined"

```
❌ ERROR:
  - Error: Cannot read property 'restaurante_id' of null
  - req.session.usuario = null

✅ SOLUCIÓN:
  1. Verificar que session middleware está antes de rutas:
     app.use(session({ ... }))
     app.use('/', authRoutes)
  
  2. Limpiar cookies del navegador:
     F12 → Application → Cookies → Eliminar
  
  3. Reiniciar servidor: pnpm dev
```

### Error 7: "Rate limit exceeded"

```
❌ ERROR:
  - 429 Too Many Requests

✅ SOLUCIÓN:
  - Esperanciar 15 minutos
  - O cambiar IP (usar VPN)
  - O en development, ver rate-limit en server.js:
    
    // Temporalmente deshabilitar:
    // app.use(limiter);
```

### Error 8: "Cross-Origin Request Blocked"

```
❌ ERROR:
  - CORS error en consola del navegador

✅ SOLUCIÓN:
  - Supabase URL !== localhost
  - Agregar CORS en server.js (si llamas desde JS):
  
  const cors = require('cors');
  app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3005',
    credentials: true
  }));
```

### Error 9: "Stock actualizado incorrectamente"

```
❌ ERROR:
  - Stock sigue igual después de UPDATE

✅ SOLUCIÓN:
  - Verificar que maneja_stock = true
  - O verificar que producto es categoría 'Bar'
  
  SELECT id, nombre, categoria, maneja_stock, stock 
  FROM productos 
  WHERE id = X;
```

### Error 10: "Factura anulada pero stock no se restauró"

```
❌ ERROR:
  - Anular factura no vuelve a agregar stock

✅ SOLUCIÓN:
  - Verificar lógica en routes/facturas.js
  - Debe hacer:
    1. UPDATE factura SET estado = 'anulada'
    2. FOR EACH item: UPDATE producto SET stock += cantidad
    3. UPDATE factura SET anulado_por, fecha_anulacion
```

---

## 🔍 DEBUGGING

### Debug: Ver qué se está enviando al servidor

```javascript
// En server.js (agregar después de app.use(express.json())):
app.use((req, res, next) => {
    console.log('📥 REQUEST:', {
        method: req.method,
        path: req.path,
        body: req.body,
        user: req.session.usuario?.id
    });
    next();
});
```

### Debug: Ver errores de BD

```javascript
// En cualquier ruta:
const { data, error } = await supabase
    .from('productos')
    .select('*');

if (error) {
    console.error('🔴 ERROR BD:', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint
    });
}
```

### Debug: Ver sesión del usuario

```javascript
// En cualquier ruta:
console.log('👤 USUARIO ACTUAL:', req.session.usuario);
console.log('🔐 SESSION ID:', req.sessionID);
```

### Debug: Ver todas las queries

```javascript
// En config/supabase.js (agregar antes de cada query):
console.log('🔎 QUERY:', {
    table,
    operation,
    filters,
    timestamp: new Date().toISOString()
});
```

---

## 📊 MONITOREO EN PRODUCCIÓN

### Ver logs en Supabase
1. Ir a Supabase Dashboard
2. Click en "Logs" (izquierda)
3. Ver queries en tiempo real
4. Detectar N+1 queries, errores, etc.

### Ver estadísticas de uso
```sql
-- En SQL Editor de Supabase
SELECT 
    table_name,
    pg_size_pretty(pg_total_relation_size('"' || table_schema || '"."' || table_name || '"')) AS size
FROM information_schema.tables 
WHERE table_schema = 'public'
ORDER BY pg_total_relation_size('"' || table_schema || '"."' || table_name || '"') DESC;
```

### Monitorear performance
```sql
-- Queries más lentas
SELECT query, calls, total_time, mean_time 
FROM pg_stat_statements 
ORDER BY mean_time DESC 
LIMIT 10;
```

---

## 🚀 DEPLOYMENT RÁPIDO

### Opción 1: VERCEL (Recomendado)

```bash
# 1. Instalar Vercel CLI
pnpm add --global vercel

# 2. Login
vercel login

# 3. Deploy
vercel

# 4. En dashboard Vercel: 
# Settings → Environment Variables
# Agregar:
#   SUPABASE_URL=...
#   SUPABASE_KEY=...
#   SESSION_SECRET=...
#   NODE_ENV=production

# 5. Auto-deploy en cada git push (si conectas GitHub)
```

### Opción 2: RAILWAY

```bash
# 1. Crear cuenta en railway.app
# 2. Conectar GitHub
# 3. New Project → GitHub repo
# 4. Railway detecta Node.js automáticamente
# 5. Agregar variables de entorno en Railway Dashboard
# 6. Deploy automático en cada push
```

### Opción 3: HEROKU

```bash
# ⚠️ Heroku free tier descontinuado (solo pago)
# Pero si quieres probar:

pnpm add --global heroku

heroku login
heroku create your-app-name
heroku config:set SUPABASE_URL=...
heroku config:set SUPABASE_KEY=...
git push heroku main

# Ver logs
heroku logs --tail
```

---

## 📈 OPTIMIZACIONES DESPUÉS DE MIGRAR

### 1. Agregar Índices
```sql
-- En Supabase SQL Editor:
CREATE INDEX idx_pedidos_mesa ON pedidos(mesa_id);
CREATE INDEX idx_pedido_items_pedido ON pedido_items(pedido_id);
CREATE INDEX idx_facturas_fecha ON facturas(fecha DESC);
```

### 2. Usar Real-time Subscriptions (Opcional)
```javascript
// Escuchar cambios en tiempo real
supabase
    .from('pedidos')
    .on('UPDATE', payload => {
        console.log('Pedido actualizado:', payload);
        // Actualizar UI en tiempo real
    })
    .subscribe();
```

### 3. Usar Auth de Supabase (Futuro)
```javascript
// Reemplazar PIN con email/password en el futuro
const { data, error } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: pin
});
```

### 4. Caché de Sesiones (Para escala)
```bash
pnpm install redis connect-redis

# Usar Redis en lugar de sesión en memoria
```

---

## 🔐 SEGURIDAD: Checklist Post-Migración

- [ ] ¿.env está en .gitignore?
- [ ] ¿Las variables de entorno están en Vercel/Railway?
- [ ] ¿HTTPS está activo en producción?
- [ ] ¿SESSION_SECRET es aleatorio y fuerte?
- [ ] ¿Rate limiting está activo?
- [ ] ¿Helmet headers están en lugar?
- [ ] ¿RLS (Row Level Security) está activado en Supabase?
- [ ] ¿Los PINs están hasheados con bcrypt?
- [ ] ¿Hay validación de entrada con joi?
- [ ] ¿Los logs no exponen datos sensibles?

---

## 📞 SOPORTE RÁPIDO

### Si algo no funciona, revisa en este orden:

1. **¿Error en consola del navegador?**
   - F12 → Console tab → Ver error exacto

2. **¿Error en terminal (pnpm dev)?**
   - Copiar mensaje completo
   - Buscar en Google
   - Ejecutar: `grep "error" ~/.npm/debug.log`

3. **¿Datos no se guardan?**
   - Ver Supabase Dashboard → Data
   - Ejecutar query manualmente en SQL Editor
   - Verificar que restaurante_id es correcto

4. **¿No puede conectar a Supabase?**
   - Verificar SUPABASE_URL y KEY en .env
   - Ir a Supabase: Project → Settings → API
   - Copy-paste credenciales correctas

5. **¿Lentitud o timeout?**
   - Agregar índices (ver sección OPTIMIZACIONES)
   - Usar select() específico (no SELECT *)
   - Verificar límite de conexiones

---

## 📚 RECURSOS ÚTILES

```
📖 Documentación:
- Supabase Docs: https://supabase.com/docs
- PostgreSQL: https://www.postgresql.org/docs
- Express: https://expressjs.com/
- EJS: https://ejs.co/

🛠️ Herramientas:
- Postman: https://www.postman.com/
- DBeaver: https://dbeaver.io/
- Git: https://git-scm.com/

💬 Comunidades:
- Stack Overflow: tag "supabase"
- GitHub Discussions: supabase/supabase
- Reddit: r/supabase

🎓 Tutoriales:
- YouTube "Supabase + Express"
- YouTube "PostgreSQL para developers MySQL"
```

---

## ✅ CHECKLIST FINAL

Después de migrar, verifica:

- [ ] pnpm dev se ejecuta sin errores
- [ ] Login funciona con MARROCOS01 / Admin / 1234
- [ ] Puedo crear un producto
- [ ] Puedo actualizar un producto
- [ ] Puedo eliminar un producto
- [ ] Multi-tenant funciona (datos no se mezclan)
- [ ] Licencia expirada bloquea login
- [ ] Segunda y tercera ruta migradas sin errores
- [ ] Database tiene datos correctamente
- [ ] Supabase Dashboard muestra actividad
- [ ] pnpm start funciona para producción
- [ ] Deploy en Vercel/Railway es exitoso
- [ ] Acceso remoto funciona (no solo localhost)
- [ ] Backups automáticos están configurados

**¡Una vez todo está verde, ¡celebra 🎉! Tu app está lista para escala!**
