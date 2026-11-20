-- Datos de contacto del personal: correo y direccion.
-- El modulo Personal (/register) los muestra y permite editarlos junto al PIN.

begin;

alter table public.usuarios
  add column if not exists email varchar(120),
  add column if not exists direccion varchar(200);

notify pgrst, 'reload schema';

commit;
