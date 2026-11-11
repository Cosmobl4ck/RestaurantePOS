-- ============================================================
-- Ficha de producto, alérgenos y tiempo de preparación
-- ============================================================
-- 1) El POS puede mostrar ingredientes, alérgenos y tiempo estimado
--    antes de agregar un platillo.
-- 2) Los alérgenos se guardan como catálogo + relación por producto.
-- 3) Cada ítem de comanda conserva una foto (snapshot) de sus alérgenos
--    y de su tiempo de preparación para que cocina no dependa de cambios
--    posteriores en el producto.
-- 4) Cocina recibe un aviso explícito de alergia del cliente y puede
--    alertar cuando faltan 2 minutos para cumplir el tiempo estimado.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1) Información pública del producto
-- ------------------------------------------------------------
alter table public.productos
  add column if not exists descripcion_corta text,
  add column if not exists ingredientes text,
  add column if not exists tiempo_preparacion_minutos integer;

alter table public.productos
  drop constraint if exists productos_tiempo_preparacion_check;

alter table public.productos
  add constraint productos_tiempo_preparacion_check
  check (
    tiempo_preparacion_minutos is null
    or (tiempo_preparacion_minutos between 1 and 240)
  );

comment on column public.productos.descripcion_corta is
  'Descripción breve que ve el mesero/cliente en el POS';
comment on column public.productos.ingredientes is
  'Ingredientes declarados del platillo o bebida';
comment on column public.productos.tiempo_preparacion_minutos is
  'Tiempo aproximado de preparación en minutos';

-- ------------------------------------------------------------
-- 2) Catálogo de alérgenos
-- ------------------------------------------------------------
create table if not exists public.alergenos (
  id smallserial primary key,
  nombre varchar(60) not null unique,
  icono varchar(60) not null default 'bi-exclamation-triangle-fill',
  activo boolean not null default true
);

insert into public.alergenos (nombre, icono) values
  ('Gluten',      'bi-basket-fill'),
  ('Lactosa',     'bi-cup-straw'),
  ('Huevo',       'bi-egg-fried'),
  ('Maní',        'bi-flower1'),
  ('Frutos secos', 'bi-tree-fill'),
  ('Mariscos',    'bi-water'),
  ('Pescado',     'bi-fish-fill'),
  ('Soya',        'bi-seedling'),
  ('Sésamo',      'bi-circle-fill'),
  ('Sulfitos',    'bi-droplet-fill')
on conflict (nombre) do nothing;

alter table public.alergenos enable row level security;
revoke all on table public.alergenos from public, anon, authenticated;
grant select on table public.alergenos to service_role;
grant usage, select on sequence public.alergenos_id_seq to service_role;

create table if not exists public.producto_alergenos (
  restaurante_id bigint not null references public.restaurantes(id) on delete cascade,
  producto_id bigint not null references public.productos(id) on delete cascade,
  alergeno_id smallint not null references public.alergenos(id) on delete restrict,
  primary key (producto_id, alergeno_id)
);

create index if not exists idx_producto_alergenos_tenant_producto
  on public.producto_alergenos(restaurante_id, producto_id);

alter table public.producto_alergenos enable row level security;
revoke all on table public.producto_alergenos from public, anon, authenticated;
grant select, insert, update, delete on table public.producto_alergenos to service_role;

-- Reemplaza los alérgenos de un producto en una sola transacción.
create or replace function public.pos_sync_product_allergens(
  p_restaurante_id bigint,
  p_producto_id bigint,
  p_alergeno_ids bigint[]
) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  v_count integer;
begin
  perform 1
    from public.productos
   where id = $2
     and restaurante_id = $1;

  if not found then
    raise exception 'Producto no encontrado';
  end if;

  delete from public.producto_alergenos
   where producto_id = $2
     and restaurante_id = $1;

  insert into public.producto_alergenos(restaurante_id, producto_id, alergeno_id)
  select $1, $2, a.id
    from public.alergenos a
   where a.id::bigint = any(coalesce($3, '{}'::bigint[]))
     and a.activo
  on conflict do nothing;

  get diagnostics v_count = row_count;

  return jsonb_build_object(
    'producto_id', $2,
    'alergenos', v_count
  );
end $$;

revoke execute on function public.pos_sync_product_allergens(bigint,bigint,bigint[])
  from public, anon, authenticated;
grant execute on function public.pos_sync_product_allergens(bigint,bigint,bigint[])
  to service_role;

-- ------------------------------------------------------------
-- 3) Snapshot de la comanda
-- ------------------------------------------------------------
alter table public.pedido_items
  add column if not exists tiempo_preparacion_minutos integer,
  add column if not exists alergenos text[] not null default '{}',
  add column if not exists alergia_aviso text;

comment on column public.pedido_items.tiempo_preparacion_minutos is
  'Tiempo estimado copiado del producto al agregar el ítem';
comment on column public.pedido_items.alergenos is
  'Alérgenos declarados del producto al agregar el ítem';
comment on column public.pedido_items.alergia_aviso is
  'Alergia específica indicada por el mesero para este ítem';

-- ------------------------------------------------------------
-- 4) Alta de ítem con snapshot de alérgenos y tiempo
-- ------------------------------------------------------------
create or replace function public.pos_add_order_item(
  p_restaurante_id bigint,
  p_pedido_id bigint,
  p_producto_id bigint,
  p_cantidad numeric,
  p_nota text,
  p_unidad text,
  p_usuario_id bigint,
  p_alergia_aviso text default null
) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  p public.pedidos%rowtype;
  pr public.productos%rowtype;
  i public.pedido_items%rowtype;
  v_alergenos text[];
begin
  if $4 is null or $4 <= 0 then
    raise exception 'Cantidad invalida';
  end if;

  if upper(coalesce(nullif(trim($6), ''), 'UND')) <> 'UND' then
    raise exception 'Unidad no soportada en comandas';
  end if;

  perform 1
    from public.usuarios
   where id = $7
     and restaurante_id = $1
     and estado = 1;

  if not found then
    raise exception 'Usuario no autorizado para agregar items';
  end if;

  select * into p
    from public.pedidos
   where id = $2 and restaurante_id = $1
   for update;

  if not found or p.estado in ('cerrado', 'cancelado') then
    raise exception 'Pedido no disponible';
  end if;

  select * into pr
    from public.productos
   where id = $3 and restaurante_id = $1
   for update;

  if not found then
    raise exception 'Producto no encontrado';
  end if;

  if pr.maneja_stock and coalesce(pr.stock, 0) < $4 then
    raise exception 'Stock insuficiente';
  end if;

  if pr.maneja_stock then
    update public.productos
       set stock = stock - $4,
           updated_at = now()
     where id = $3 and restaurante_id = $1;
  end if;

  select coalesce(array_agg(a.nombre order by a.nombre), '{}'::text[])
    into v_alergenos
    from public.producto_alergenos pa
    join public.alergenos a on a.id = pa.alergeno_id
   where pa.producto_id = pr.id
     and pa.restaurante_id = $1
     and a.activo;

  insert into public.pedido_items(
    restaurante_id, pedido_id, producto_id, cantidad, unidad_medida,
    precio_unitario, subtotal, estado, nota, usuario_id,
    tiempo_preparacion_minutos, alergenos, alergia_aviso
  )
  values(
    $1, $2, $3, $4, 'UND',
    coalesce(pr.precio_unidad, 0), $4 * coalesce(pr.precio_unidad, 0),
    'pendiente', nullif(trim(coalesce($5, '')), ''), $7,
    pr.tiempo_preparacion_minutos,
    coalesce(v_alergenos, '{}'::text[]),
    left(nullif(trim(coalesce($8, '')), ''), 200)
  )
  returning * into i;

  update public.pedidos
     set total = (
       select coalesce(sum(subtotal), 0)
         from public.pedido_items
        where pedido_id = $2
          and restaurante_id = $1
          and estado <> 'cancelado'
     ),
     updated_at = now()
   where id = $2 and restaurante_id = $1;

  return to_jsonb(i);
end $$;

revoke execute on function public.pos_add_order_item(
  bigint,bigint,bigint,numeric,text,text,bigint,text
) from public, anon, authenticated;
grant execute on function public.pos_add_order_item(
  bigint,bigint,bigint,numeric,text,text,bigint,text
) to service_role;

notify pgrst, 'reload schema';

commit;
