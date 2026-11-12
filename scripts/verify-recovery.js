const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const ejs = require('ejs');
const root = path.resolve(__dirname, '..');
let failures = 0;

function fail(message) { failures++; console.error(`FAIL ${message}`); }
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }

for (const dir of ['routes', 'middlewares', 'config', 'services', 'public/js']) {
  const abs = path.join(root, dir);
  for (const name of fs.readdirSync(abs)) {
    if (!name.endsWith('.js')) continue;
    const file = path.join(abs, name);
    const r = cp.spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (r.status !== 0) fail(`${path.relative(root, file)}\n${r.stderr}`);
  }
}

function walkFiles(dir, extension) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walkFiles(abs, extension));
    else if (ent.name.endsWith(extension)) out.push(abs);
  }
  return out;
}

for (const file of walkFiles(path.join(root, 'views'), '.ejs')) {
  try { ejs.compile(fs.readFileSync(file, 'utf8'), { filename: file }); }
  catch (error) { fail(`${path.relative(root, file)} EJS syntax: ${error.message}`); }

  const html = fs.readFileSync(file, 'utf8');
  const themeLinks = (html.match(/\/css\/petronas\.css\?v=petronas1/g) || []).length;
  if (html.includes('</head>') && themeLinks !== 1) {
    fail(`${path.relative(root, file)} must load /css/petronas.css?v=petronas1 exactly once`);
  }
  if (!html.includes('</head>') && themeLinks !== 0) {
    fail(`${path.relative(root, file)} has no <head> but loads the global theme`);
  }
}

if (!fs.existsSync(path.join(root, 'public/css/petronas.css'))) fail('MISSING public/css/petronas.css');
else {
  const theme = read('public/css/petronas.css');
  for (const token of ['--pt-bg: #08090A', '--pt-teal: #00A19C', '--pt-teal-bright: #00D2BE', '.swal2-popup', 'body.factura-print .ticket']) {
    if (!theme.includes(token)) fail(`petronas.css missing ${token}`);
  }
}

for (const rel of [
  'supabase/migrations/20260928214312_reconcile_restaurant_pos_live.sql',
  'supabase/migrations/20261110120000_fix_invoice_client_and_area_layout.sql',
  'supabase/migrations/20261110130000_add_product_info_allergens_and_prep_time.sql',
  'supabase/migrations/20261111120000_add_plan_catalog_and_entitlements.sql',
  'config/plans.js',
  'services/planService.js',
  'middlewares/planAccess.js',
  'views/mi_plan.ejs',
  'views/plan-required.ejs',
  'config/SupabaseSessionStore.js',
  'routes/kds.js',
  'routes/areas.js',
  'middlewares/access.js',
  'AUDITORIA_FINAL.md',
  'SECURITY_REPORT.md'
]) {
  if (!fs.existsSync(path.join(root, rel))) fail(`MISSING ${rel}`);
}

const server = read('server.js');
for (const mount of ["app.use('/kds'", "app.use('/areas'", "app.use('/registro-pedidos'", "app.use('/desperdicios'", "app.use('/mi-plan'"]) {
  if (!server.includes(mount)) fail(`server.js missing mount ${mount}`);
}
if (!server.includes('requireFeature')) fail('server.js missing plan feature guards');
if (!server.includes('SupabaseSessionStore')) fail('persistent session store not configured');
if (!server.includes('requireSuperadmin')) fail('SuperAdmin guard not mounted');

const kds = read('routes/kds.js');
if (!kds.includes('text/event-stream')) fail('KDS SSE endpoint missing');
if (kds.includes('SUPABASE_SERVICE_ROLE')) fail('KDS route must not serialize service role');

const publicTree = ['views', 'public/js'].flatMap((dir) => {
  const out = [];
  const walk = (d) => fs.readdirSync(path.join(root, d), { withFileTypes: true }).forEach((ent) => {
    const rel = path.join(d, ent.name);
    if (ent.isDirectory()) walk(rel); else out.push(rel);
  });
  walk(dir); return out;
});
for (const rel of publicTree) {
  const text = read(rel);
  if (text.includes('SUPABASE_SERVICE_ROLE')) fail(`${rel} references service role`);
  if (text.includes('@supabase/supabase-js@2')) fail(`${rel} still loads browser Supabase client`);
  if (text.includes('partials/header')) fail(`${rel} references missing partials/header`);
}

const croquis = read('views/croquis.ejs');
if (croquis.indexOf('/js/croquis-designer.js') > croquis.indexOf('STATE.figuras.push')) {
  fail('croquis uses STATE before loading croquis-designer.js');
}

const pkg = JSON.parse(read('package.json'));
if (pkg.packageManager !== 'pnpm@11.17.0') fail('packageManager must pin pnpm@11.17.0');
for (const script of ['start', 'dev', 'check', 'test', 'audit:deps']) {
  if (!pkg.scripts?.[script]) fail(`package.json missing script ${script}`);
}
if (!/^\^?2\./.test(pkg.dependencies?.multer || '')) fail('multer must use a supported 2.x release');

if (fs.existsSync(path.join(root, 'package-lock.json'))) fail('active package-lock.json is forbidden');
if (fs.existsSync(path.join(root, 'yarn.lock'))) fail('yarn.lock is forbidden');
const lockPath = path.join(root, 'pnpm-lock.yaml');
if (!fs.existsSync(lockPath)) fail('pnpm-lock.yaml is missing');
else {
  const lock = fs.readFileSync(lockPath, 'utf8');
  if (!lock.includes('dependencies:') || !lock.includes('snapshots:')) fail('pnpm-lock.yaml is incomplete');
}

const trackedEnv = cp.spawnSync('git', ['-c', `safe.directory=${root.replace(/\\/g, '/')}`, 'ls-files', '--error-unmatch', '.env'], {
  cwd: root,
  encoding: 'utf8'
});
if (trackedEnv.status === 0) fail('.env must not be tracked');

const access = read('middlewares/access.js');
for (const role of ['admin', 'gerente', 'cajero', 'mesero', 'cocina', 'bar']) {
  if (!access.includes(`${role}:`)) fail(`canonical RBAC role missing: ${role}`);
}
if (!access.includes('ROLE_PERMISSIONS') || !access.includes('requirePermission')) {
  fail('central permission map/middleware is missing');
}

if (!kds.includes("rpc('pos_transition_kds'")) fail('KDS transitions must use the atomic RPC');
const mesas = read('routes/mesas.js');
if (!mesas.includes("rpc('pos_send_order'")) fail('command dispatch must use the atomic RPC');

const activeDocs = fs.readdirSync(root).filter((name) => name.endsWith('.md'));
const forbiddenPackageCommands = /\b(?:npm\s+(?:install|i|ci|run|start|audit|update|uninstall)|npx(?:\s|$)|yarn\s+(?:add|install|run|start|audit|upgrade|remove))\b/i;
for (const rel of activeDocs) {
  if (forbiddenPackageCommands.test(read(rel))) fail(`${rel} contains non-pnpm commands`);
}

if (failures) process.exit(1);
console.log('Recovery static checks: OK');
