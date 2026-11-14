const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const exists = (...parts) => fs.existsSync(path.join(root, ...parts));

test('las vistas no interpolan datos de la BD en atributos onclick', () => {
  const facturas = read('views', 'facturas.ejs');
  const admin = read('views', 'superadmin', 'admin_global.ejs');

  assert.doesNotMatch(facturas, /onclick="[^"]*<%=/);
  assert.doesNotMatch(admin, /onclick="[^"]*<%=/);
  assert.match(facturas, /data-action="whatsapp"/);
  assert.match(admin, /data-action="editar"/);
});

test('facturas escapa cliente y producto antes de construir HTML', () => {
  const facturas = read('views', 'facturas.ejs');
  assert.match(facturas, /escapeHtml\(info\.cliente_nombre\)/);
  assert.match(facturas, /escapeHtml\(item\.producto_nombre\)/);
});

test('el croquis rechaza ids que pertenecen a otro tenant antes del upsert', () => {
  const areas = read('routes', 'areas.js');
  assert.match(areas, /\.in\('id', ids\)/);
  assert.match(areas, /restaurante_id\) !== restaurante_id/);
  assert.match(areas, /status\(409\)/);
});

test('la sesión y la licencia se validan globalmente y con caché', () => {
  const server = read('server.js');
  const middleware = read('middlewares', 'authMiddleware.js');

  assert.ok(server.includes('PUBLIC_PATHS.has(req.path)'));
  assert.ok(server.includes('return verificarSesion(req, res, next);'));
  assert.ok(middleware.includes('licenseCheck'));
  assert.ok(middleware.includes("from('usuarios')"));
  assert.ok(middleware.includes('Number(usuario.estado) !== 1'));
});

test('los estáticos se sirven antes del rate limit y el login tiene límite propio', () => {
  const server = read('server.js');
  const auth = read('routes', 'auth.js');

  assert.ok(server.indexOf("express.static") < server.indexOf('const apiLimiter'));
  assert.match(server, /app\.get\('\/healthz'/);
  assert.match(auth, /keyGenerator/);
  assert.match(auth, /ipKeyGenerator\(req\.ip\)/);
  assert.match(auth, /max: 10/);
});

test('un gerente no puede crear administradores', () => {
  const auth = read('routes', 'auth.js');
  assert.match(auth, /ROLES_SOLO_ADMIN/);
  assert.match(auth, /rolSolicitante === 'gerente'/);
});

test('el buscador de productos neutraliza operadores PostgREST', () => {
  const productos = read('routes', 'productos.js');
  assert.ok(productos.includes('[^\\p{L}\\p{N}\\s_-]'));
});

test('la vista de factura existe y solo usa salida escapada', () => {
  assert.equal(exists('views', 'factura.ejs'), true);
  const factura = read('views', 'factura.ejs');
  assert.doesNotMatch(factura, /<%-/);
});

test('reportes usa la zona horaria del restaurante', () => {
  const reportes = read('routes', 'reportes.js');
  assert.match(reportes, /dateInTimeZone/);
  assert.match(reportes, /select\('timezone'\)/);
});

test('existe migración de unicidad de usuario por tenant', () => {
  const migration = read('supabase', 'migrations', '20261106000000_harden_users_and_audit.sql');
  assert.match(migration, /uq_usuarios_restaurante_nombre/);
  assert.match(migration, /lower\(nombre\)/);
});

test('la CSP permite la fuente de Bootstrap Icons y los estilos de cdnjs', () => {
  const server = read('server.js');
  assert.match(server, /"font-src": \[[^\]]*https:\/\/cdn\.jsdelivr\.net/);
  assert.match(server, /"style-src": \[[^\]]*https:\/\/cdnjs\.cloudflare\.com/);
});

test('todas las vistas con navbar cargan Bootstrap e iconos y son documentos completos', () => {
  const viewsDir = path.join(root, 'views');
  const views = fs.readdirSync(viewsDir).filter((file) => file.endsWith('.ejs'));

  for (const file of views) {
    const html = read('views', file);
    if (!html.includes("include('partials/navbar')")) continue;

    assert.match(
      html,
      /\/vendor\/bootstrap\/css\/bootstrap\.min\.css/,
      `${file} incluye el navbar pero no carga Bootstrap CSS`
    );
    assert.match(
      html,
      /\/vendor\/bootstrap-icons\/font\/bootstrap-icons\.css/,
      `${file} incluye el navbar pero no carga Bootstrap Icons`
    );
    assert.match(html, /<!DOCTYPE html>/i, `${file} no es un documento HTML completo`);
    assert.match(html, /<\/body>/i, `${file} no cierra body`);
    assert.match(html, /<\/html>/i, `${file} no cierra html`);
  }
});

test('login carga los iconos que usa', () => {
  const login = read('views', 'login.ejs');
  const server = read('server.js');
  assert.match(login, /\/vendor\/bootstrap-icons\/font\/bootstrap-icons\.css/);
  assert.match(server, /app\.use\('\/vendor\/bootstrap'/);
  assert.match(server, /app\.use\('\/vendor\/bootstrap-icons'/);
});
