-- Sprint 1: propina configurable, incidentes de empleados y faltas.

begin;

alter table public.restaurantes
  add column if not exists propina_porcentaje numeric(5,2) not null default 0;

alter table public.facturas
  add column if not exists propina numeric(12,2) not null default 0,
  add column if not exists propina_porcentaje numeric(5,2) not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'restaurantes_propina_porcentaje_check'
  ) then
    alter table public.restaurantes
      add constraint restaurantes_propina_porcentaje_check
      check (propina_porcentaje >= 0 and propina_porcentaje <= 100);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'facturas_propina_nonnegative'
  ) then
    alter table public.facturas
      add constraint facturas_propina_nonnegative
      check (propina >= 0);
  end if;
end $$;

create table if not exists public.incidentes_empleados (
  id bigserial primary key,
  restaurante_id bigint not null references public.restaurantes(id) on delete cascade,
  empleado_id bigint references public.usuarios(id) on delete set null,
  empleado_nombre text not null,
  tipo text not null check (tipo in ('falta', 'falta_injustificada', 'tardanza', 'salida_temprana', 'baja', 'otro')),
  fecha date not null default current_date,
  descripcion text not null,
  accion_tomada text,
  estado text not null default 'abierto' check (estado in ('abierto', 'en_revision', 'resuelto')),
  registrado_por bigint references public.usuarios(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  resuelto_at timestamp with time zone
);

create index if not exists idx_incidentes_empleados_tenant_fecha
  on public.incidentes_empleados (restaurante_id, fecha desc, id desc);

create index if not exists idx_incidentes_empleados_empleado
  on public.incidentes_empleados (restaurante_id, empleado_id, fecha desc);

notify pgrst, 'reload schema';

commit;
