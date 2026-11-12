const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const ejs = require('ejs');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

test('la migración de auditoría crea la tabla, índices y aislamiento por tenant', () => {
    const migration = read('supabase', 'migrations', '20261112120000_add_audit_log.sql');

    assert.match(migration, /create table if not exists public\.auditoria_eventos/);
    assert.match(migration, /restaurante_id bigint not null references public\.restaurantes\(id\)/);
    assert.match(migration, /idx_auditoria_eventos_tenant_fecha/);
    assert.match(migration, /idx_auditoria_eventos_tenant_accion/);
    assert.match(migration, /alter table public\.auditoria_eventos enable row level security/);
    assert.match(migration, /grant select, insert on table public\.auditoria_eventos to service_role/);
});

test('la ruta de auditoría está protegida por rol y por el plan Gold', () => {
    const server = read('server.js');

    assert.match(
        server,
        /app\.use\('\/auditoria', authRole\(\['admin', 'gerente'\]\), requireFeature\('auditoria'\), auditoriaRoutes\)/
    );
    assert.match(server, /const auditoriaRoutes = require\('\.\/routes\/auditoria'\)/);
});

test('el navbar muestra auditoría solo cuando el plan la habilita', () => {
    const navbar = read('views', 'partials', 'navbar.ejs');

    assert.match(navbar, /href="\/auditoria"/);
    assert.match(navbar, /puede\('auditoria'\)/);
    assert.match(navbar, /\['admin', 'gerente'\]\.includes\(usuario\.rol\)/);
});

test('los eventos sensibles del POS quedan instrumentados', () => {
    const routes = {
        auth: read('routes', 'auth.js'),
        productos: read('routes', 'productos.js'),
        caja: read('routes', 'caja.js'),
        mesas: read('routes', 'mesas.js'),
        facturas: read('routes', 'facturas.js'),
        configuracion: read('routes', 'configuracion.js')
    };

    assert.match(routes.auth, /accion: 'sesion\.iniciar'/);
    assert.match(routes.auth, /accion: 'sesion\.cerrar'/);
    assert.match(routes.auth, /accion: 'usuario\.crear'/);
    assert.match(routes.productos, /accion: 'producto\.crear'/);
    assert.match(routes.productos, /accion: 'producto\.actualizar'/);
    assert.match(routes.productos, /accion: 'producto\.eliminar'/);
    assert.match(routes.productos, /accion: 'producto\.importar'/);
    assert.match(routes.caja, /accion: 'caja\.abrir'/);
    assert.match(routes.caja, /accion: 'caja\.cerrar'/);
    assert.match(routes.mesas, /accion: 'pedido\.facturar'/);
    assert.match(routes.mesas, /accion: 'pedido\.cancelar'/);
    assert.match(routes.mesas, /accion: 'pedido\.mover'/);
    assert.match(routes.facturas, /accion: 'factura\.anular'/);
    assert.match(routes.configuracion, /accion: 'configuracion\.actualizar'/);
});

test('la vista de auditoría renderiza el estado de migración pendiente', async () => {
    const html = await ejs.renderFile(path.join(root, 'views', 'auditoria.ejs'), {
        usuario: { id: 1, nombre: 'Admin', rol: 'admin', nombre_negocio: 'Demo', plan: 'gold' },
        page: 'auditoria',
        currentPath: '/auditoria',
        planPuede: () => true,
        acciones: [],
        filtros: { accion: '', entidad: '', usuario: '', desde: '', hasta: '', page: 1 },
        resumen: { total: 0, ultimas24h: 0 },
        eventos: [],
        total: 0,
        page: 1,
        totalPages: 1,
        prevUrl: null,
        nextUrl: null,
        migrationMissing: true
    });

    assert.match(html, /Auditoría de acciones/);
    assert.match(html, /20261112120000_add_audit_log\.sql/);
    assert.match(html, /Falta aplicar la migración/);
});

test('la vista de auditoría escapa el detalle de los eventos', async () => {
    const html = await ejs.renderFile(path.join(root, 'views', 'auditoria.ejs'), {
        usuario: { id: 1, nombre: 'Admin', rol: 'admin', nombre_negocio: 'Demo', plan: 'gold' },
        page: 'auditoria',
        currentPath: '/auditoria',
        planPuede: () => true,
        acciones: [],
        filtros: { accion: '', entidad: '', usuario: '', desde: '', hasta: '', page: 1 },
        resumen: { total: 1, ultimas24h: 1 },
        eventos: [{
            id: 1,
            creado_en_texto: '12 nov 2026, 10:00',
            accion: 'producto.crear',
            accion_label: 'Producto creado',
            accion_tone: 'success',
            usuario_nombre: 'Admin',
            ip: '127.0.0.1',
            entidad: 'producto',
            entidad_id: '1',
            detalle: { nombre: '<script>alert(1)</script>' }
        }],
        total: 1,
        page: 1,
        totalPages: 1,
        prevUrl: null,
        nextUrl: null,
        migrationMissing: false
    });

    assert.match(html, /Producto creado/);
    assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});
