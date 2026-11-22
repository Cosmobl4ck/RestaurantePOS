/**
 * RestaurantePOS — servidor Express (SSR + API JSON + SSE para KDS).
 *
 * Flujo de datos: navegador -> Express -> Supabase (service_role, solo servidor).
 * El navegador nunca recibe la clave de servicio ni habla directo con Supabase.
 */

require('dotenv').config();
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const { supabase } = require('./config/supabase');
const SupabaseSessionStore = require('./config/SupabaseSessionStore');
const authRole = require('./middlewares/authRole');
const { requirePermission, requireSuperadmin, sameOriginForMutations } = require('./middlewares/access');
const { verificarSesion } = require('./middlewares/authMiddleware');
const { requireFeature } = require('./middlewares/planAccess');
const { serializeForHtmlScript } = require('./utils/safe-json');

// ==========================================
// 1. VALIDAR CONFIGURACIÓN
// ==========================================
if (!process.env.SUPABASE_URL || !(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE) || !process.env.SESSION_SECRET) {
    console.error('❌ FALTA CONFIGURACIÓN');
    console.error('   Crear archivo .env con:');
    console.error('   - SUPABASE_URL');
    console.error('   - SUPABASE_SECRET_KEY (recomendada) o SUPABASE_SERVICE_ROLE (legada)');
    console.error('   - SESSION_SECRET');
    process.exit(1);
}
if (String(process.env.SESSION_SECRET).length < 16) {
    console.error('❌ SESSION_SECRET demasiado corto: usa al menos 32 caracteres aleatorios.');
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
        path.join(__dirname, 'public', 'img'),
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
app.disable('x-powered-by');
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.locals.serializeForHtmlScript = serializeForHtmlScript;

// Proxy: configurar explícitamente. Sin proxy real, dejarlo desactivado evita
// que un cliente falsifique X-Forwarded-For y evada el rate limiting.
// Con Cloudflare Tunnel usar TRUST_PROXY=loopback.
if (process.env.TRUST_PROXY) {
    const raw = String(process.env.TRUST_PROXY).trim();
    if (raw === 'true') app.set('trust proxy', true);
    else if (/^\d+$/.test(raw)) app.set('trust proxy', Number(raw));
    else app.set('trust proxy', raw);
}

// ==========================================
// 4. MIDDLEWARES DE SEGURIDAD
// ==========================================

// Nonce por respuesta: permite los bloques <script>/<style> inline sin
// 'unsafe-inline'. Se genera antes de helmet para que la directiva lo use.
app.use((req, res, next) => {
    res.locals.cspNonce = crypto.randomBytes(16).toString('base64');
    next();
});

// Helmet: headers de seguridad HTTP.
// CSP sin 'unsafe-inline': cada bloque inline lleva nonce="<%= cspNonce %>" y
// los atributos onclick/onchange se sustituyeron por addEventListener.
// Las librerias (jQuery, SweetAlert2, Select2, html2canvas, jspdf, animate.css)
// se sirven desde /vendor (mismo origen), por eso script-src/style-src ya no
// listan dominios CDN. Solo las fuentes de Google siguen siendo externas.
// Los atributos style="..." siguen permitidos via style-src-attr (deuda menor).
app.use(helmet({
    contentSecurityPolicy: {
        useDefaults: true,
        directives: {
            "script-src": ["'self'", (req, res) => `'nonce-${res.locals.cspNonce}'`],
            "script-src-attr": ["'none'"],
            "style-src": ["'self'", (req, res) => `'nonce-${res.locals.cspNonce}'`, 'https://fonts.googleapis.com'],
            // Los style="..." heredados se mantienen permitidos; migrarlos a
            // clases es deuda pendiente y no habilita ejecución de scripts.
            "style-src-attr": ["'unsafe-inline'"],
            // Bootstrap Icons sirve su .woff2 desde /vendor (mismo origen);
            // fonts.gstatic.com cubre los .woff2 de las fuentes de Google.
            "font-src": ["'self'", 'https://fonts.gstatic.com', 'data:'],
            "img-src": ["'self'", 'data:', 'blob:'],
            "connect-src": ["'self'"],
            "object-src": ["'none'"],
            "base-uri": ["'self'"],
            "form-action": ["'self'"],
            "frame-ancestors": ["'self'"],
            // El POS opera en LAN por HTTP; forzar HTTPS rompería los assets.
            // Actívalo descomentando esta línea solo si sirves todo por HTTPS.
            "upgrade-insecure-requests": null
        }
    },
    crossOriginEmbedderPolicy: false
}));

// HTTPS obligatorio (opt-in). Actívalo en producción con ENFORCE_HTTPS=true
// cuando haya un proxy TLS delante.
if (String(process.env.ENFORCE_HTTPS).toLowerCase() === 'true') {
    app.use((req, res, next) => {
        if (req.secure || req.get('x-forwarded-proto') === 'https') return next();
        return res.status(403).send('HTTPS requerido.');
    });
}

// ==========================================
// 5. MIDDLEWARES BASE
// ==========================================
app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: true, limit: '128kb' }));

// Los estáticos van antes del rate limit: no deben consumir cuota de API.
app.use('/vendor/bootstrap', express.static(path.join(__dirname, 'node_modules', 'bootstrap', 'dist'), {
    maxAge: '7d'
}));
app.use('/vendor/bootstrap-icons', express.static(path.join(__dirname, 'node_modules', 'bootstrap-icons'), {
    maxAge: '7d'
}));
app.use('/vendor/chart.js', express.static(path.join(__dirname, 'node_modules', 'chart.js', 'dist'), {
    maxAge: '7d'
}));
app.use(express.static(path.join(__dirname, 'public'), {
    dotfiles: 'deny',
    maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0
}));

app.use(sameOriginForMutations);

// Rate limit general de API. Es deliberadamente alto: un POS en LAN hace
// muchas peticiones por terminal. Los límites estrictos viven en login y
// superadmin. Las conexiones SSE no se limitan (son una sola petición larga).
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: Number(process.env.RATE_LIMIT_MAX) || 3000,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path === '/healthz' || (req.path.startsWith('/kds/') && req.path.endsWith('/events')),
    message: { error: 'Demasiadas solicitudes, intenta más tarde.' }
});
app.use(apiLimiter);

// ==========================================
// 6. CONFIGURACIÓN DE SESIONES
// ==========================================
const sessionStore = new SupabaseSessionStore({ supabase });

// COOKIE_SECURE vacío = automático (true en producción). Permite operar por
// HTTP en LAN sin TLS poniendo COOKIE_SECURE=false explícitamente.
const cookieSecureEnv = process.env.COOKIE_SECURE;
const cookieSecure = (cookieSecureEnv === undefined || cookieSecureEnv === '')
    ? process.env.NODE_ENV === 'production'
    : String(cookieSecureEnv).toLowerCase() === 'true';

app.use(session({
    name: 'marrocos.sid',
    store: sessionStore,
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: cookieSecure,
        httpOnly: true,
        sameSite: 'strict',
        maxAge: 1000 * 60 * 60 * 24 // 24 horas
    }
}));

// ==========================================
// 7. HEADERS DE SEGURIDAD PERSONALIZADOS
// ==========================================
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
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
// 9. HEALTHCHECK (sin sesión ni licencia)
// ==========================================
app.get('/healthz', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ status: 'ok', uptime: process.uptime() });
});

// ==========================================
// 10. DEFINICIÓN DE ROLES
// ==========================================
const ROLES_CAJA = ['admin', 'gerente', 'cajero'];
const ROLES_OPERACION = ['admin', 'gerente', 'cajero', 'host', 'mesero'];

// ==========================================
// 11. GUARDIA GLOBAL DE SESIÓN + LICENCIA
// ==========================================
// Se aplica a todo salvo login/logout (públicos) y healthz. Así ninguna ruta
// queda sin validar licencia ni estado del usuario.
const PUBLIC_PATHS = new Set(['/login', '/logout', '/healthz']);
app.use((req, res, next) => {
    // /superadmin usa Basic Auth propia, no la sesión del POS.
    if (PUBLIC_PATHS.has(req.path) || req.path.startsWith('/superadmin')) return next();
    return verificarSesion(req, res, next);
});

// Sin caja abierta no se opera el POS (mesas, KDS, facturas, comandas).
const { cashGate } = require('./middlewares/cashGate');
app.use(cashGate);

// ==========================================
// 12. REDIRECCIÓN DE INICIO
// ==========================================
app.get('/', (req, res) => {
    const rol = req.session.usuario?.rol;
    if (!rol) return res.redirect('/login');
    if (rol === 'cocina') return res.redirect('/kds/cocina');
    if (rol === 'bar') return res.redirect('/kds/bar');
    return res.redirect('/dashboard');
});

// ==========================================
// 13. RUTAS DE AUTENTICACIÓN
// ==========================================
const authRoutes = require('./routes/auth');
app.use('/', authRoutes);

// ==========================================
// 14. RUTAS DE SUPERADMIN
// ==========================================
const superadminLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Demasiados intentos de acceso al panel de administración.'
});
const superadminRoutes = require('./routes/superadmin');
app.use('/superadmin', superadminLimiter, requireSuperadmin, superadminRoutes);

// ==========================================
// 15. RUTAS PROTEGIDAS DEL RESTAURANTE
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
const miPlanRoutes = require('./routes/mi_plan');
const auditoriaRoutes = require('./routes/auditoria');

// Usar rutas
app.use('/mesas', requirePermission('orders.view'), requireFeature('pos.mesas'), mesasRoutes);
app.use('/productos', authRole(ROLES_CAJA), requireFeature('menu.productos'), productosRoutes);
app.use('/caja', requirePermission('cash.view'), requireFeature('caja.basica'), cajaRoutes);
app.use('/reportes', requirePermission('reports.view'), requireFeature('reportes.basicos'), reportesRoutes);
app.use('/facturas', requirePermission('sales.view'), requireFeature('facturas.internas'), facturasRoutes);
app.use('/clientes', authRole(ROLES_OPERACION), requireFeature('clientes'), clientesRoutes);
app.use('/cocina', authRole(['admin', 'gerente', 'cajero', 'cocina']), requireFeature('kds.cocina'), cocinaRoutes);
app.use('/bar', authRole(['admin', 'gerente', 'cajero', 'bar']), requireFeature('kds.bar'), barRoutes);
app.use('/ventas', requirePermission('sales.view'), requireFeature('ventas.historial'), ventasRoutes);
app.use('/configuracion', requirePermission('restaurant.manage'), requireFeature('configuracion.basica'), configuracionRoutes);
app.use('/kds', requirePermission('kds.view'), kdsRoutes);
app.use('/areas', requirePermission('floorplan.view'), requireFeature('areas.croquis'), areasRoutes);
app.use('/registro-pedidos', authRole(ROLES_CAJA), requireFeature('pos.pedidos'), registroPedidosRoutes);
app.use('/desperdicios', requirePermission('waste.view'), requireFeature('inventario.desperdicios'), desperdiciosRoutes);
app.use('/mi-plan', requirePermission('restaurant.manage'), miPlanRoutes);
app.use('/auditoria', requirePermission('audit.view'), requireFeature('auditoria'), auditoriaRoutes);

// ==========================================
// 16. MANEJO DE ERRORES
// ==========================================

// 404: Página no encontrada
app.use((req, res) => {
    if (req.accepts(['html', 'json']) === 'json') {
        return res.status(404).json({ error: 'Recurso no encontrado.' });
    }
    res.status(404).render('404', { mensaje: 'Página no encontrada' });
});

// Error general: nunca exponer detalles internos en producción.
app.use((err, req, res, next) => {
    const requestId = require('crypto').randomUUID();
    console.error(`❌ ERROR [${requestId}] ${req.method} ${req.originalUrl}:`, err.message);
    console.error('   Stack:', err.stack);

    const esProduccion = process.env.NODE_ENV === 'production';
    if (req.accepts(['html', 'json']) === 'json') {
        return res.status(500).json({ error: 'Error interno del servidor.', requestId });
    }
    res.status(500).render('error', {
        error: {
            message: esProduccion ? 'Error en el servidor' : err.message,
            requestId,
            stack: esProduccion ? null : err.stack
        }
    });
});

// ==========================================
// 17. INICIALIZACIÓN Y APAGADO ORDENADO
// ==========================================
const PORT = process.env.PORT || 3005;
let server = null;

if (require.main === module) {
    server = app.listen(PORT, () => {
        console.log('========================================');
        console.log(`🚀 SERVIDOR INICIADO EN PUERTO: ${PORT}`);
        console.log(`📍 http://localhost:${PORT}`);
        console.log(`🗄️  Base de datos: ${process.env.SUPABASE_URL}`);
        console.log(`🔐 Entorno: ${process.env.NODE_ENV || 'development'}`);
        console.log('========================================');
    });
}

function shutdown(reason, exitCode = 0) {
    console.log(`⏻ Cerrando servidor (${reason})...`);
    if (!server) return process.exit(exitCode);
    server.close(() => {
        console.log('✅ Servidor cerrado.');
        process.exit(exitCode);
    });
    setTimeout(() => process.exit(exitCode), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Uncaught exception: registrar y reiniciar limpio (usar un process manager
// en producción para que el servicio vuelva a levantarse).
process.on('uncaughtException', (err) => {
    console.error('❌ EXCEPCIÓN NO CAPTURADA:', err);
    shutdown('uncaughtException', 1);
});

process.on('unhandledRejection', (reason) => {
    console.error('❌ PROMESA RECHAZADA:', reason);
});

module.exports = app;
