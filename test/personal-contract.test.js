const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

test('Personal lista empleados y permite editar correo, direccion y PIN', () => {
  const auth = read('routes', 'auth.js');
  const view = read('views', 'register.ejs');
  const migration = read('supabase', 'migrations', '20261119130000_add_employee_contact_fields.sql');

  // Backend: lista los empleados del tenant con sus datos de contacto.
  assert.match(auth, /\.select\('id, nombre, rol, estado, email, direccion, created_at'\)/);
  assert.match(auth, /router\.post\('\/register\/:id\/editar'/);
  assert.match(auth, /bcrypt\.hash\(pin, 10\)/);
  assert.match(auth, /accion: 'usuario\.editar'/);
  assert.match(auth, /\.eq\('restaurante_id', solicitante\.restaurante_id\)/);

  // Vista: tabla de empleados y modal de edicion / reset de PIN.
  assert.match(view, /listaEmpleados\.forEach/);
  assert.match(view, /data-email=/);
  assert.match(view, /data-direccion=/);
  assert.match(view, /name="pin"/);
  assert.match(view, /modalEmpleado/);

  // Esquema: columnas nuevas.
  assert.match(migration, /add column if not exists email/i);
  assert.match(migration, /add column if not exists direccion/i);
});

test('login registra asistencia y respeta la IP del restaurante', () => {
  const auth = read('routes', 'auth.js');
  const middleware = read('middlewares', 'authMiddleware.js');
  const migration = read('supabase', 'migrations', '20261119140000_add_attendance_and_ip_guard.sql');
  const asistencia = read('views', 'asistencia.ejs');
  const personal = read('views', 'register.ejs');

  // Asistencia en login/logout.
  assert.match(auth, /registrarAsistencia/);
  assert.match(auth, /tipo: 'entrada'/);
  assert.match(auth, /tipo: 'salida'/);

  // Bloqueo por IP y excepcion admin/gerente.
  assert.match(auth, /ipAllowed\(getClientIp\(req\)/);
  assert.match(middleware, /ipBloqueada/);
  assert.match(middleware, /ip_permitida/);
  assert.match(middleware, /\['admin', 'gerente'\]/);

  // Rutas de configuracion e historial.
  assert.match(auth, /router\.post\('\/register\/ip'/);
  assert.match(auth, /router\.get\('\/register\/asistencia'/);
  assert.match(personal, /Historial/);
  assert.match(personal, /name="ip_permitida"/);

  // Esquema y vista.
  assert.match(migration, /add column if not exists ip_permitida/i);
  assert.match(migration, /registrar_asistencia/i);
  assert.match(migration, /asistencia_resumen/i);
  assert.match(asistencia, /name="desde"/);
  assert.match(asistencia, /name="hasta"/);
});

test('finalizar turno y reporte de asistencia con Excel', () => {
  const auth = read('routes', 'auth.js');
  const personal = read('views', 'register.ejs');
  const navbar = read('views', 'partials', 'navbar.ejs');
  const audit = read('routes', 'auditoria.js');
  const auditView = read('views', 'auditoria.ejs');
  const migration = read('supabase', 'migrations', '20261119160000_attendance_report_and_finish_shift.sql');

  // Boton propio y por empleado.
  assert.match(navbar, /Finalizar turno/);
  assert.match(personal, /Finalizar turno/);
  assert.match(auth, /router\.post\('\/register\/:id\/finalizar-turno'/);
  assert.match(auth, /rpc\('finalizar_turno'/);

  // Reporte en auditoria y exportacion.
  assert.match(audit, /asistencia_reporte/);
  assert.match(audit, /asistencia\/exportar/);
  assert.match(audit, /new excel\.Workbook/);
  assert.match(audit, /asist_empleados/);
  assert.match(auditView, /Reporte de asistencia/);
  assert.match(auditView, /Descargar Excel/);
  assert.match(auditView, /Eventos registrados/);
  assert.match(auditView, /Asistencia de Personal/);
  assert.match(auditView, /name="asist_empleados"/);
  assert.match(auditView, /audit-detail-list/);

  // Esquema.
  assert.match(migration, /create or replace function public\.asistencia_reporte/i);
  assert.match(migration, /create or replace function public\.finalizar_turno/i);
});
