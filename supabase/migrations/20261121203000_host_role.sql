-- Rol Host para recepción y ubicación de clientes.

begin;

alter table public.usuarios drop constraint if exists usuarios_rol_check;
alter table public.usuarios
  add constraint usuarios_rol_check
  check (rol in ('admin', 'gerente', 'cajero', 'host', 'mesero', 'cocina', 'bar'));

notify pgrst, 'reload schema';

commit;
