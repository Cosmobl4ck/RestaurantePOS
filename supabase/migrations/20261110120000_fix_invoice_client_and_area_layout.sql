-- ============================================================
-- Fix de facturación + persistencia del plano de áreas
-- ============================================================
-- 1) /areas guarda posición y tamaño de las tarjetas del plano.
-- 2) pos_invoice_order usa el cliente real del pedido o el nombre
--    capturado al abrir la mesa, limpia todos los campos operativos
--    de la mesa y conserva el orden de los ítems en la factura.
-- ============================================================

begin;

-- Layout de tarjetas del plano /areas. Se dejan nullable para que la
-- vista pueda calcular la cuadrícula inicial cuando aún no hay layout.
alter table public.areas_restaurante
  add column if not exists pos_x integer,
  add column if not exists pos_y integer,
  add column if not exists ancho_tarjeta integer,
  add column if not exists alto_tarjeta integer;

comment on column public.areas_restaurante.pos_x is 'Posición X de la tarjeta en /areas';
comment on column public.areas_restaurante.pos_y is 'Posición Y de la tarjeta en /areas';
comment on column public.areas_restaurante.ancho_tarjeta is 'Ancho de la tarjeta en /areas';
comment on column public.areas_restaurante.alto_tarjeta is 'Alto de la tarjeta en /areas';

-- Facturación: cliente real, limpieza completa de mesa y detalle ordenado.
create or replace function public.pos_invoice_order(
  p_restaurante_id bigint,
  p_pedido_id bigint,
  p_forma_pago text
) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  p public.pedidos%rowtype;
  f public.facturas%rowtype;
  m public.mesas%rowtype;
  cid bigint;
  amount numeric(12,2);
  v_cliente_nombre text;
begin
  if $3 not in ('efectivo','transferencia') then
    raise exception 'Forma de pago invalida';
  end if;

  select * into p
    from public.pedidos
   where id=$2 and restaurante_id=$1
   for update;
  if not found or p.estado='cancelado' then
    raise exception 'Pedido no disponible';
  end if;

  select * into f
    from public.facturas
   where restaurante_id=$1 and pedido_id=$2
   limit 1;
  if found then
    return jsonb_build_object(
      'factura_id', f.id,
      'cliente_id', f.cliente_id,
      'total', f.total,
      'already_invoiced', true
    );
  end if;

  if p.estado='cerrado' then
    raise exception 'Pedido cerrado sin factura vinculada; requiere conciliacion manual';
  end if;

  select coalesce(sum(subtotal),0) into amount
    from public.pedido_items
   where restaurante_id=$1 and pedido_id=$2 and estado<>'cancelado';
  if amount<=0 then
    raise exception 'No hay productos para cobrar';
  end if;

  select * into m
    from public.mesas
   where id=p.mesa_id and restaurante_id=$1;

  -- 1) Cliente real del pedido, si existe y pertenece al tenant.
  if p.cliente_id is not null then
    select id into cid
      from public.clientes
     where id=p.cliente_id and restaurante_id=$1;
  end if;

  -- 2) Fallback: nombre capturado al abrir la mesa (ej. Taylor).
  if cid is null and m.id is not null then
    v_cliente_nombre := nullif(trim(coalesce(m.descripcion,'')), '');
    if v_cliente_nombre is not null
       and lower(v_cliente_nombre) not in ('cliente general','consumidor final') then
      select id into cid
        from public.clientes
       where restaurante_id=$1
         and lower(trim(nombre))=lower(v_cliente_nombre)
       order by id
       limit 1;
      if cid is null then
        begin
          insert into public.clientes(restaurante_id,nombre)
          values($1,left(v_cliente_nombre,100))
          returning id into cid;
        exception when unique_violation then
          select id into cid
            from public.clientes
           where restaurante_id=$1
             and lower(trim(nombre))=lower(v_cliente_nombre)
           order by id
           limit 1;
        end;
      end if;
    end if;
  end if;

  -- 3) Fallback histórico para cuentas sin nombre.
  if cid is null then
    select id into cid
      from public.clientes
     where restaurante_id=$1 and nombre='Consumidor Final'
     order by id
     limit 1;
    if cid is null then
      begin
        insert into public.clientes(restaurante_id,nombre)
        values($1,'Consumidor Final')
        returning id into cid;
      exception when unique_violation then
        select id into cid
          from public.clientes
         where restaurante_id=$1 and nombre='Consumidor Final'
         order by id
         limit 1;
      end;
    end if;
  end if;

  insert into public.facturas(restaurante_id,pedido_id,cliente_id,total,forma_pago,estado)
  values($1,$2,cid,amount,$3,'activa')
  returning * into f;

  insert into public.detalle_factura(
    restaurante_id,factura_id,producto_id,cantidad,precio_unitario,unidad_medida,subtotal
  )
  select $1,f.id,producto_id,cantidad,precio_unitario,unidad_medida,subtotal
    from public.pedido_items
   where restaurante_id=$1 and pedido_id=$2 and estado<>'cancelado'
   order by id;

  update public.pedidos
     set estado='cerrado', total=amount, updated_at=now()
   where id=$2 and restaurante_id=$1;

  update public.mesas
     set estado='libre',
         descripcion=null,
         mesero_id=null,
         personas_actuales=0,
         hora_apertura=null,
         reservada=false,
         bloqueada=false,
         reserva_id=null,
         nombre_reserva=null,
         hora_reserva=null,
         updated_at=now()
   where id=p.mesa_id and restaurante_id=$1;

  return jsonb_build_object(
    'factura_id', f.id,
    'cliente_id', cid,
    'total', amount,
    'already_invoiced', false
  );
exception when unique_violation then
  select * into f
    from public.facturas
   where restaurante_id=$1 and pedido_id=$2;
  return jsonb_build_object(
    'factura_id', f.id,
    'cliente_id', f.cliente_id,
    'total', f.total,
    'already_invoiced', true
  );
end $$;

revoke execute on function public.pos_invoice_order(bigint,bigint,text) from public,anon,authenticated;
grant execute on function public.pos_invoice_order(bigint,bigint,text) to service_role;

notify pgrst, 'reload schema';

commit;
