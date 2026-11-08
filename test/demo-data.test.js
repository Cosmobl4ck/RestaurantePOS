const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

test('el navbar no contiene mojibake y conserva las etiquetas correctas', () => {
  const navbar = read('views', 'partials', 'navbar.ejs');
  assert.doesNotMatch(navbar, /Ã|Â|â€|ðŸ|�/);
  assert.match(navbar, /Menú/);
  assert.match(navbar, /Gestión de Personal/);
  assert.match(navbar, /Cerrar Sesión/);
});

test('el navbar incluye accesos a pedidos, facturas y ventas', () => {
  const navbar = read('views', 'partials', 'navbar.ejs');
  assert.match(navbar, /href="\/registro-pedidos"/);
  assert.match(navbar, /href="\/facturas"/);
  assert.match(navbar, /href="\/ventas"/);
  assert.match(navbar, /bi-list-check/);
  assert.match(navbar, /bi-receipt-cutoff/);
  assert.match(navbar, /bi-cash-coin/);
  assert.match(navbar, /title="Reportes"/);
});

test('reportes construye una serie de 7 días locales con hoy en cero', () => {
  const reportes = read('routes', 'reportes.js');
  assert.match(reportes, /for \(let i = 6; i >= 0; i -= 1\)/);
  assert.match(reportes, /ventasSemanaMap\.get\(dia\) \|\| 0/);
});

test('las etiquetas del gráfico de ventas se formatean como fecha local', () => {
  const view = read('views', 'reportes.ejs');
  assert.match(view, /formatearDia/);
  assert.doesNotMatch(view, /new Date\(d\.dia\)\.toLocaleDateString\(\)/);
});

test('el seed de ventas demo cubre 10 clientes, 30 productos y 6 días', () => {
  const seed = read('scripts', 'seed-sales-demo.js');
  assert.match(seed, /SALES_PER_DAY = 20/);
  assert.match(seed, /DAYS = 6/);
  assert.match(seed, /DEMO-D01/);
  assert.match(seed, /DEMO-B01/);
  assert.match(seed, /DEMO-A01/);
  assert.match(seed, /todayCount !== 0/);
  assert.match(seed, /--reset/);
  assert.match(seed, /--clean/);
});
