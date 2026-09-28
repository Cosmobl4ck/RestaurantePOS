/**
 * EXAMPLE: server.js actualizado para Supabase
 * Este archivo muestra cómo debe quedar server.js después de la migración
 * 
 * CAMBIOS PRINCIPALES:
 * 1. Usar Supabase en lugar de MySQL2
 * 2. Agregar helmet para seguridad
 * 3. Agregar rate-limiting
 * 4. Mejorar configuración de sesiones
 */

require('dotenv').config();
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

const app = express();
const { supabase } = require('./config/supabase');
const SupabaseSessionStore = require('./config/SupabaseSessionStore');
const authRole = require('./middlewares/authRole');
const { requirePermission, requireSuperadmin, sameOriginForMutations } = require('./middlewares/access');

// ==========================================
// 1. VALIDAR CONFIGURACIÓN
// ==========================================
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY || !process.env.SESSION_SECRET) {
    console.error('❌ FALTA CONFIGURACIÓN');
    console.error('   Crear archivo .env con:');
    console.error('   - SUPABASE_URL');
    console.error('   - SUPABASE_KEY');
    console.error('   - SESSION_SECRET');
    process.exit(1);
}
if (process.env.NODE_ENV === 'production' && !process.env.SUPABASE_SERVICE_ROLE) {
    console.error('❌ SUPABASE_SERVICE_ROLE es obligatoria en producción para el backend/RPC y las sesiones.');
    process.exit(1);
}

// ==========================================
// 2. CREAR DIRECTORIOS NECESARIOS
// ==========================================
const createRequiredDirectories = () => {
    const directories = [
        path.join(__dirname, 'public'),
        path.join(__dirname, 'public', 'css'),
        path.join(__dirname, 'public', 'js'),
        path.join(__dirname, 'public', 'uploads')
    ];
    directories.forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    });
};
createRequiredDirectories();

// ==========================================
// 3. CONFIGURACIÓN DE VISTAS
// ==========================================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ==========================================
// 4. MIDDLEWARES DE SEGURIDAD
// ==========================================

// Helmet: Headers de seguridad HTTP

// Configuración de Helmet para permitir CDNs y scripts inline
app.use(helmet({
    contentSecurityPolicy: {
        useDefaults: true,
        directives: {
            "script-src": ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net', 'https://code.jquery.com'],
            "style-src": ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net', 'https://fonts.googleapis.com'],
            "font-src": ["'self'", 'https://fonts.gstatic.com', 'data:'],
            "img-src": ["'self'", 'data:', 'blob:'],
            "connect-src": ["'self'", process.env.SUPABASE_URL].filter(Boolean)
        }
    },
    crossOriginEmbedderPolicy: false
}));

// Rate Limiting: Proteger contra ataques de fuerza bruta
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,  // 15 minutos
    max: 100,                  // 100 requests por IP
    message: 'Demasiadas solicitudes, intenta más tarde'
});
app.use(limiter);

// Rate limiting más estricto para login
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,  // Solo 5 intentos por 15 minutos
    skip: (req) => req.method !== 'POST' || !req.path.includes('login')
});
app.use(loginLimiter);

// ==========================================
// 5. MIDDLEWARES BASE
// ==========================================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public'), {
    dotfiles: 'deny',
    maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0
}));
app.use(sameOriginForMutations);

// ==========================================
// 6. CONFIGURACIÓN DE SESIONES
// ==========================================
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);

const sessionStore = new SupabaseSessionStore({ supabase });

app.use(session({
    name: 'marrocos.sid',
    store: sessionStore,
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',  // HTTPS solo en prod
        httpOnly: true,  // No accesible desde JavaScript
        sameSite: 'strict',  // Protección contra CSRF
        maxAge: 1000 * 60 * 60 * 24  // 24 horas
    }
}));

// ==========================================
// 7. HEADERS DE SEGURIDAD PERSONALIZADOS
// ==========================================
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
});

// ==========================================
// 8. MIDDLEWARE GLOBAL DE USUARIO
// ==========================================
app.use((req, res, next) => {
    res.locals.usuario = req.session.usuario || null;
    res.locals.currentPath = req.path;
    const first = req.path.split('/').filter(Boolean)[0] || 'dashboard';
    res.locals.page = first;
    next();
});

// ==========================================
// 9. DEFINICIÓN DE ROLES
// ==========================================
const ROLES_ADMIN = ['admin'];
const ROLES_GESTION = ['admin', 'gerente'];
const ROLES_CAJA = ['admin', 'gerente', 'cajero'];
const ROLES_OPERACION = ['admin', 'gerente', 'cajero', 'mesero'];

// ==========================================
// 10. REDIRECCIÓN DE INICIO
// ==========================================
app.get('/', (req, res) => {
    const rol = req.session.usuario?.rol;
    if (!rol) return res.redirect('/login');
    if (rol === 'cocina') return res.redirect('/kds/cocina');
    if (rol === 'bar') return res.redirect('/kds/bar');
    return res.redirect('/dashboard');
});

// ==========================================
// 11. RUTAS DE AUTENTICACIÓN
// ==========================================
const authRoutes = require('./routes/auth');
app.use('/', authRoutes);

// ==========================================
// 12. RUTAS DE SUPERADMIN
// ==========================================
const superadminRoutes = require('./routes/superadmin');
app.use('/superadmin', requireSuperadmin, superadminRoutes);

// ==========================================
// 13. RUTAS PROTEGIDAS DEL RESTAURANTE
// ==========================================

// Dashboard
app.get('/dashboard', requirePermission('dashboard.view'), (req, res) => {
    res.render('dashboard');
});

// Importar rutas de módulos
const mesasRoutes = require('./routes/mesas');
const productosRoutes = require('./routes/productos');
const cajaRoutes = require('./routes/caja');
const reportesRoutes = require('./routes/reportes');
const facturasRoutes = require('./routes/facturas');
const clientesRoutes = require('./routes/clientes');
const cocinaRoutes = require('./routes/cocina');
const barRoutes = require('./routes/bar');
const ventasRoutes = require('./routes/ventas');
const configuracionRoutes = require('./routes/configuracion');
const kdsRoutes = require('./routes/kds');
const areasRoutes = require('./routes/areas');
const registroPedidosRoutes = require('./routes/registro_pedidos');
const desperdiciosRoutes = require('./routes/desperdicios');

// Usar rutas
app.use('/mesas', authRole(ROLES_OPERACION), mesasRoutes);
app.use('/productos', authRole(ROLES_CAJA), productosRoutes);
app.use('/caja', authRole(ROLES_CAJA), cajaRoutes);
app.use('/reportes', authRole(ROLES_OPERACION), reportesRoutes);
app.use('/facturas', authRole(ROLES_CAJA), facturasRoutes);
app.use('/clientes', authRole(ROLES_OPERACION), clientesRoutes);
app.use('/cocina', authRole(['admin', 'gerente', 'cajero', 'cocina']), cocinaRoutes);
app.use('/bar', authRole(['admin', 'gerente', 'cajero', 'bar']), barRoutes);
app.use('/ventas', authRole(ROLES_CAJA), ventasRoutes);
app.use('/configuracion', authRole(ROLES_GESTION), configuracionRoutes);
app.use('/kds', authRole(['admin', 'gerente', 'cajero', 'cocina', 'bar']), kdsRoutes);
app.use('/areas', authRole(ROLES_GESTION), areasRoutes);
app.use('/registro-pedidos', authRole(ROLES_OPERACION), registroPedidosRoutes);
app.use('/desperdicios', authRole(ROLES_CAJA), desperdiciosRoutes);

// ==========================================
// 14. MANEJO DE ERRORES
// ==========================================

// 404: Página no encontrada
app.use((req, res) => {
    res.status(404).render('404', { 
        mensaje: 'Página no encontrada' 
    });
});

// Error general
app.use((err, req, res, next) => {
    console.error('❌ ERROR:', err.message);
    console.error('   Stack:', err.stack);

    // En desarrollo, mostrar detalles
    const mensaje = process.env.NODE_ENV === 'production'
        ? 'Error en el servidor'
        : err.message;

    res.status(500).render('error', {
        error: {
            message: mensaje,
            stack: process.env.NODE_ENV === 'production' ? null : err.stack
        }
    });
});

// ==========================================
// 15. INICIALIZACIÓN DEL SERVIDOR
// ==========================================

const PORT = process.env.PORT || 3005;

if (require.main === module) app.listen(PORT, () => {
    console.log('========================================');
    console.log(`🚀 SERVIDOR INICIADO EN PUERTO: ${PORT}`);
    console.log(`📍 http://localhost:${PORT}`);
    console.log(`🗄️  Base de datos: ${process.env.SUPABASE_URL}`);
    console.log(`🔐 Entorno: ${process.env.NODE_ENV || 'development'}`);
    console.log('========================================');
});

// Manejo de excepciones no capturadas
process.on('uncaughtException', (err) => {
    console.error('❌ EXCEPCIÓN NO CAPTURADA:', err);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ PROMESA RECHAZADA:', reason);
    process.exit(1);
});

module.exports = app;
