const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const themePath = path.join(root, 'public/css/petronas.css');
const theme = fs.readFileSync(themePath, 'utf8');

function walkViews(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkViews(abs));
    else if (entry.name.endsWith('.ejs')) out.push(abs);
  }
  return out;
}

test('todas las vistas con <head> cargan el tema Petronas una sola vez', () => {
  const views = walkViews(path.join(root, 'views'));
  assert.ok(views.length > 20, 'deben existir las vistas del POS');

  for (const file of views) {
    const html = fs.readFileSync(file, 'utf8');
    const links = (html.match(/\/css\/petronas\.css\?v=petronas1/g) || []).length;
    const rel = path.relative(root, file);

    if (html.includes('</head>')) {
      assert.equal(links, 1, `${rel} debe cargar /css/petronas.css?v=petronas1 exactamente una vez`);
    } else {
      assert.equal(links, 0, `${rel} no tiene <head> y no debe cargar el tema`);
    }
  }
});

test('el tema centraliza la paleta Petronas y los overrides clave', () => {
  for (const token of [
    '--pt-bg: #08090A',
    '--pt-surface: #0D0E10',
    '--pt-teal: #00A19C',
    '--pt-teal-bright: #00D2BE',
    '--pt-text: #E8EAED',
    '--pt-muted: #9AA6AD',
    '--pt-danger: #EF4444',
    '--pt-warning: #F59E0B'
  ]) {
    assert.ok(theme.includes(token), `falta el token ${token}`);
  }

  for (const selector of [
    '.navbar,',
    '.card {',
    '.table {',
    '.form-control,',
    '.modal-content {',
    '.offcanvas {',
    '.select2-container--bootstrap-5 .select2-selection {',
    '.swal2-popup {',
    'body.factura-print .ticket {',
    '@media print {'
  ]) {
    assert.ok(theme.includes(selector), `falta el override ${selector}`);
  }
});

test('el KDS de cocina y bar usa la paleta Petronas sin colores legados', () => {
  const legacy = /#e2711d|#185FA5|#378ADD|#0a0f1e|#05101f|#1a1a2e|#16213e|#0c1f3f|#0c2d5a/i;

  for (const [file, station] of [
    ['views/kds_cocina.ejs', 'cocina'],
    ['views/kds_bar.ejs', 'bar']
  ]) {
    const view = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(view, /#08090A/);
    assert.match(view, /#00A19C/);
    assert.match(view, /#00D2BE/);
    assert.match(view, new RegExp(`\\.comanda-card\\.${station}`));
    assert.doesNotMatch(view, legacy, `${file} conserva colores del tema anterior`);
  }
});

test('la factura conserva papel blanco al imprimir aunque el POS sea oscuro', () => {
  const factura = fs.readFileSync(path.join(root, 'views/factura.ejs'), 'utf8');
  assert.match(factura, /<body class="factura-print">/);
  assert.match(factura, /\/css\/petronas\.css\?v=petronas1/);

  const printBlock = theme.slice(theme.indexOf('@media print'));
  assert.match(printBlock, /body\.factura-print[\s\S]*background:\s*#FFFFFF\s*!important/i);
  assert.match(printBlock, /body\.factura-print \.ticket[\s\S]*background:\s*#FFFFFF\s*!important/i);
  assert.match(printBlock, /body\.factura-print \.acciones[\s\S]*display:\s*none\s*!important/i);
});
