-- Hardening 2026-11-06: identidad de usuario única por tenant.
--
-- El login busca por (restaurante_id, nombre) y usaba maybeSingle(); si existían
-- duplicados la consulta fallaba. Este índice lo impide a nivel de base de datos.
--
-- Si la migración falla por duplicados existentes, resuélvelos primero:
--   select restaurante_id, lower(nombre), count(*)
--   from public.usuarios group by 1,2 having count(*) > 1;

begin;

do $$
begin
  if exists (
    select 1
    from public.usuarios
    group by restaurante_id, lower(nombre)
    having count(*) > 1
  ) then
    raise exception 'Hay usuarios duplicados por restaurante; resuélvelos antes de aplicar esta migración.';
  end if;
end $$;

create unique index if not exists uq_usuarios_restaurante_nombre
  on public.usuarios (restaurante_id, lower(nombre));

create index if not exists idx_desperdicios_tenant_created
  on public.desperdicios (restaurante_id, created_at desc);

commit;
