-- Reabrir una mesa ocupada debe recuperar la cuenta existente, no fallar.
-- La definición anterior validaba m.estado <> 'libre' antes de buscar el pedido,
-- por lo que pos_open_order devolvía "Mesa no disponible" al reabrir Mesa 1.
create or replace function public.pos_open_order(
  p_restaurante_id bigint,
  p_mesa_id bigint,
  p_cliente_nombre text,
  p_notas text
) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  r public.pedidos%rowtype;
  m public.mesas%rowtype;
begin
  select * into m
    from public.mesas
   where id = $2 and restaurante_id = $1
   for update;

  if not found then
    raise exception 'Mesa no encontrada';
  end if;

  -- Idempotencia: si ya hay una cuenta abierta, devolverla antes de validar
  -- disponibilidad. El lock de la mesa serializa aperturas concurrentes.
  select * into r
    from public.pedidos
   where restaurante_id = $1
     and mesa_id = $2
     and estado not in ('cerrado', 'cancelado')
   order by id desc
   limit 1;

  if found then
    return to_jsonb(r) || jsonb_build_object('existing', true);
  end if;

  if m.estado <> 'libre'
     or coalesce(m.bloqueada, false)
     or coalesce(m.reservada, false) then
    raise exception 'Mesa no disponible';
  end if;

  insert into public.pedidos(restaurante_id, mesa_id, estado, total, notas)
  values ($1, $2, 'abierto', 0, nullif(trim(coalesce($4, '')), ''))
  returning * into r;

  update public.mesas
     set estado = 'ocupada',
         descripcion = left(coalesce(nullif(trim($3), ''), 'Cliente General'), 100),
         updated_at = now()
   where id = $2 and restaurante_id = $1;

  return to_jsonb(r) || jsonb_build_object('existing', false);
end $$;

revoke execute on function public.pos_open_order(bigint, bigint, text, text) from public, anon, authenticated;
grant execute on function public.pos_open_order(bigint, bigint, text, text) to service_role;
