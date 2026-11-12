-- Catálogo comercial de planes, entitlements y bitácora de cambios.
-- Aplicar en Supabase SQL Editor. Es idempotente.

begin;

-- 1) Normalizar planes existentes.
update public.restaurantes
   set plan = case
       when lower(btrim(coalesce(plan, ''))) in ('pro_plus', 'pro-plus', 'proplus') then 'gold'
       when lower(btrim(coalesce(plan, ''))) in ('trial', 'basic', 'premium', 'gold') then lower(btrim(plan))
       else 'trial'
   end
 where plan is null
    or lower(btrim(plan)) not in ('trial', 'basic', 'premium', 'gold');

alter table public.restaurantes drop constraint if exists restaurantes_plan_check;
alter table public.restaurantes
  add constraint restaurantes_plan_check
  check (plan in ('trial', 'basic', 'premium', 'gold'));

-- 2) Catálogo de planes.
create table if not exists public.planes (
    codigo varchar(30) primary key check (codigo in ('trial', 'basic', 'premium', 'gold')),
    nombre varchar(60) not null,
    descripcion text,
    precio_mensual numeric(10,2) not null default 0,
    duracion_dias integer not null default 30 check (duracion_dias between 1 and 366),
    activo boolean not null default true,
    orden integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

insert into public.planes (codigo, nombre, descripcion, precio_mensual, duracion_dias, activo, orden)
values
    ('trial',   'Trial',   'Prueba de 7 días con las funciones de Premium.', 0,  7, true, 0),
    ('basic',   'Básico',  'POS esencial para restaurantes pequeños de una sola estación.', 19, 30, true, 1),
    ('premium', 'Premium', 'Operación completa con barra, salón, inventario y reportes.', 39, 30, true, 2),
    ('gold',    'Gold',    'Límites ampliados, soporte prioritario y roadmap avanzado, incluido DTE.', 79, 30, true, 3)
on conflict (codigo) do update set
    nombre = excluded.nombre,
    descripcion = excluded.descripcion,
    precio_mensual = excluded.precio_mensual,
    duracion_dias = excluded.duracion_dias,
    activo = excluded.activo,
    orden = excluded.orden,
    updated_at = now();

-- 3) Funciones incluidas por plan.
create table if not exists public.plan_features (
    plan_codigo varchar(30) not null references public.planes(codigo) on delete cascade,
    feature_key varchar(80) not null,
    habilitado boolean not null default true,
    primary key (plan_codigo, feature_key)
);

with
basic_features as (
    select array[
        'pos.mesas',
        'pos.pedidos',
        'pos.facturar',
        'pos.cancelar',
        'menu.productos',
        'menu.ficha',
        'menu.alergenos',
        'kds.cocina',
        'kds.alergenos',
        'caja.basica',
        'facturas.internas',
        'facturas.anular',
        'ventas.historial',
        'clientes',
        'reportes.basicos',
        'usuarios',
        'configuracion.basica'
    ]::text[] as features
),
premium_features as (
    select array[
        'pos.mesas',
        'pos.pedidos',
        'pos.facturar',
        'pos.cancelar',
        'pos.mover_pedido',
        'menu.productos',
        'menu.ficha',
        'menu.alergenos',
        'menu.tiempo_preparacion',
        'kds.cocina',
        'kds.bar',
        'kds.tiempos',
        'kds.alergenos',
        'inventario.stock',
        'inventario.alertas',
        'inventario.importar',
        'inventario.desperdicios',
        'caja.basica',
        'caja.exportar',
        'facturas.internas',
        'facturas.anular',
        'facturas.marca',
        'ventas.historial',
        'ventas.exportar',
        'clientes',
        'reportes.basicos',
        'reportes.avanzados',
        'reportes.exportar',
        'areas.croquis',
        'areas.reservas',
        'usuarios',
        'configuracion.basica',
        'configuracion.marca'
    ]::text[] as features
),
gold_features as (
    select (select features from premium_features) || array[
        'multi_caja',
        'multi_sucursal',
        'dte',
        'api',
        'auditoria',
        'reportes.bi',
        'soporte.prioritario',
        'onboarding'
    ]::text[] as features
),
feature_sets as (
    select 'trial'::varchar(30) as plan_codigo, features from premium_features
    union all
    select 'basic'::varchar(30) as plan_codigo, features from basic_features
    union all
    select 'premium'::varchar(30) as plan_codigo, features from premium_features
    union all
    select 'gold'::varchar(30) as plan_codigo, features from gold_features
)
insert into public.plan_features (plan_codigo, feature_key, habilitado)
select plan_codigo, unnest(features), true
from feature_sets
on conflict (plan_codigo, feature_key) do update set habilitado = excluded.habilitado;

-- 4) Límites por plan. NULL = sin límite.
create table if not exists public.plan_limits (
    plan_codigo varchar(30) not null references public.planes(codigo) on delete cascade,
    limit_key varchar(40) not null,
    limit_value integer,
    primary key (plan_codigo, limit_key)
);

with limit_values(plan_codigo, limit_key, limit_value) as (
    values
        ('trial',   'usuarios',       15),
        ('trial',   'mesas_fisicas',  50),
        ('trial',   'areas',           5),
        ('trial',   'productos',     500),
        ('trial',   'estaciones_kds',  2),
        ('trial',   'cajas',           1),
        ('trial',   'sucursales',      1),
        ('basic',   'usuarios',        5),
        ('basic',   'mesas_fisicas',  15),
        ('basic',   'areas',           1),
        ('basic',   'productos',     100),
        ('basic',   'estaciones_kds',  1),
        ('basic',   'cajas',           1),
        ('basic',   'sucursales',      1),
        ('premium', 'usuarios',       15),
        ('premium', 'mesas_fisicas',  50),
        ('premium', 'areas',           5),
        ('premium', 'productos',     500),
        ('premium', 'estaciones_kds',  2),
        ('premium', 'cajas',           1),
        ('premium', 'sucursales',      1),
        ('gold',    'usuarios',       null::integer),
        ('gold',    'mesas_fisicas',  null::integer),
        ('gold',    'areas',          null::integer),
        ('gold',    'productos',      null::integer),
        ('gold',    'estaciones_kds', null::integer),
        ('gold',    'cajas',          null::integer),
        ('gold',    'sucursales',     null::integer)
)
insert into public.plan_limits (plan_codigo, limit_key, limit_value)
select plan_codigo, limit_key, limit_value
from limit_values
on conflict (plan_codigo, limit_key) do update set limit_value = excluded.limit_value;

-- 5) Bitácora de cambios de plan.
create table if not exists public.plan_change_log (
    id bigserial primary key,
    restaurante_id bigint not null references public.restaurantes(id) on delete cascade,
    plan_anterior varchar(30),
    plan_nuevo varchar(30) not null,
    cambiado_por varchar(120) not null default 'superadmin',
    motivo varchar(120),
    metadata jsonb not null default '{}'::jsonb,
    creado_en timestamptz not null default now()
);

create index if not exists idx_plan_change_log_restaurante
    on public.plan_change_log(restaurante_id, creado_en desc);

-- 6) Seguridad: el catálogo solo lo usa el backend con service_role.
alter table public.planes enable row level security;
alter table public.plan_features enable row level security;
alter table public.plan_limits enable row level security;
alter table public.plan_change_log enable row level security;

revoke all on table public.planes from public, anon, authenticated;
revoke all on table public.plan_features from public, anon, authenticated;
revoke all on table public.plan_limits from public, anon, authenticated;
revoke all on table public.plan_change_log from public, anon, authenticated;

grant select, insert, update, delete on table public.planes to service_role;
grant select, insert, update, delete on table public.plan_features to service_role;
grant select, insert, update, delete on table public.plan_limits to service_role;
grant select, insert, update, delete on table public.plan_change_log to service_role;
grant usage, select on sequence public.plan_change_log_id_seq to service_role;

notify pgrst, 'reload schema';

commit;
