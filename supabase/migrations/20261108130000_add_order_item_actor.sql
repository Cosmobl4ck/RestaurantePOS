-- Registra qué usuario ingresó cada ítem de la comanda.
-- La columna es nullable para no romper ítems históricos; los ítems nuevos
-- siempre se crean con el usuario autenticado que los agregó.
begin;

alter table public.pedido_items
  add column if not exists usuario_id bigint references public.usuarios(id) on delete set null;

comment on column public.pedido_items.usuario_id is
  'Usuario que ingresó el ítem a la comanda';

create index if not exists idx_pedido_items_usuario
  on public.pedido_items(restaurante_id, usuario_id);

-- Nueva sobrecarga del RPC: además del ítem, recibe al usuario de la sesión.
-- Se conserva la versión de 6 argumentos para compatibilidad, pero la app usa
-- esta versión de 7 argumentos.
create or replace function public.pos_add_order_item(
  p_restaurante_id bigint,
  p_pedido_id bigint,
  p_producto_id bigint,
  p_cantidad numeric,
  p_nota text,
  p_unidad text,
  p_usuario_id bigint
) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  p public.pedidos%rowtype;
  pr public.productos%rowtype;
  i public.pedido_items%rowtype;
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

  insert into public.pedido_items(
    restaurante_id, pedido_id, producto_id, cantidad, unidad_medida,
    precio_unitario, subtotal, estado, nota, usuario_id
  )
  values(
    $1, $2, $3, $4, 'UND',
    coalesce(pr.precio_unidad, 0), $4 * coalesce(pr.precio_unidad, 0),
    'pendiente', nullif(trim(coalesce($5, '')), ''), $7
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

revoke execute on function public.pos_add_order_item(bigint,bigint,bigint,numeric,text,text,bigint)
  from public, anon, authenticated;
grant execute on function public.pos_add_order_item(bigint,bigint,bigint,numeric,text,text,bigint)
  to service_role;

-- Refresca la caché de PostgREST para que exponga la columna y la nueva firma.
notify pgrst, 'reload schema';

commit;
