-- RestaurantePOS recovery hardening. Review and back up the live project before applying.
begin;

-- Normalize historical role values before replacing the constraint.
alter table if exists public.usuarios drop constraint if exists usuarios_rol_check;
update public.usuarios set rol = 'cocina' where rol = 'cocinero';
update public.usuarios set rol = 'bar' where rol = 'bartender';
alter table public.usuarios
  add constraint usuarios_rol_check
  check (rol in ('admin', 'gerente', 'cajero', 'mesero', 'cocina', 'bar'));

create table if not exists public.app_sessions (
  sid text primary key,
  sess jsonb not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
create index if not exists idx_app_sessions_expires_at
  on public.app_sessions (expires_at);
alter table public.app_sessions enable row level security;
revoke all on table public.app_sessions from public, anon, authenticated;
grant select, insert, update, delete on table public.app_sessions to service_role;

alter table public.facturas
  add column if not exists pedido_id bigint references public.pedidos(id) on delete restrict;
create unique index if not exists uq_facturas_restaurante_pedido
  on public.facturas (restaurante_id, pedido_id)
  where pedido_id is not null;

create index if not exists idx_pedido_items_kds
  on public.pedido_items (restaurante_id, estado, enviado_at);
create index if not exists idx_pedidos_mesa_estado
  on public.pedidos (restaurante_id, mesa_id, estado);

-- Atomically dispatch only pending items from one tenant-owned order.
create or replace function public.pos_send_order(p_restaurante_id bigint, p_pedido_id bigint)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_estado text;
  v_count integer;
begin
  select p.estado into v_estado
  from public.pedidos p
  where p.id = p_pedido_id and p.restaurante_id = p_restaurante_id
  for update;

  if not found then raise exception 'Pedido no encontrado'; end if;
  if v_estado in ('cerrado', 'cancelado') then raise exception 'El pedido ya no admite comandas'; end if;

  update public.pedido_items i
  set estado = 'enviado', enviado_at = now()
  where i.pedido_id = p_pedido_id
    and i.restaurante_id = p_restaurante_id
    and i.estado = 'pendiente';
  get diagnostics v_count = row_count;

  if v_count > 0 then
    update public.pedidos p
    set estado = 'en_cocina', updated_at = now()
    where p.id = p_pedido_id and p.restaurante_id = p_restaurante_id;
  end if;

  return jsonb_build_object('enviados', v_count);
end;
$$;

-- Enforce legal KDS transitions, tenant ownership, and product station in one statement.
create or replace function public.pos_transition_kds(
  p_restaurante_id bigint,
  p_item_id bigint,
  p_station text,
  p_next_state text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item public.pedido_items%rowtype;
  v_category text;
begin
  if p_station not in ('cocina', 'bar') then raise exception 'Estacion invalida'; end if;

  select i, lower(pr.categoria) into v_item, v_category
  from public.pedido_items i
  join public.productos pr on pr.id = i.producto_id and pr.restaurante_id = i.restaurante_id
  where i.id = p_item_id and i.restaurante_id = p_restaurante_id
  for update of i;

  if not found or v_category <> p_station then raise exception 'Item KDS no encontrado'; end if;
  if not ((v_item.estado = 'enviado' and p_next_state = 'preparando')
       or (v_item.estado = 'preparando' and p_next_state = 'listo')
       or (v_item.estado = 'listo' and p_next_state = 'servido')) then
    raise exception 'Transicion KDS invalida: % -> %', v_item.estado, p_next_state;
  end if;

  update public.pedido_items i set
    estado = p_next_state,
    preparado_at = case when p_next_state = 'preparando' then now() else i.preparado_at end,
    listo_at = case when p_next_state = 'listo' then now() else i.listo_at end,
    servido_at = case when p_next_state = 'servido' then now() else i.servido_at end
  where i.id = p_item_id and i.restaurante_id = p_restaurante_id;

  return jsonb_build_object('id', p_item_id, 'estado', p_next_state);
end;
$$;

revoke execute on function public.pos_send_order(bigint, bigint) from public, anon, authenticated;
revoke execute on function public.pos_transition_kds(bigint, bigint, text, text) from public, anon, authenticated;
grant execute on function public.pos_send_order(bigint, bigint) to service_role;
grant execute on function public.pos_transition_kds(bigint, bigint, text, text) to service_role;

commit;
