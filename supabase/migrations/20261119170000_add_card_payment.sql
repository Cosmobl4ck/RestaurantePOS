-- Al facturar, cierra los items que sigan pendientes (evita fantasmas en KDS).
-- No cambia montos: el detalle ya se inserto antes y suma estado<>'cancelado'.
begin;

alter table public.facturas drop constraint if exists facturas_forma_pago_check;
alter table public.facturas add constraint facturas_forma_pago_check check (forma_pago in ('efectivo','tarjeta','transferencia'));


CREATE OR REPLACE FUNCTION public.pos_invoice_order(p_restaurante_id bigint, p_pedido_id bigint, p_forma_pago text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  p public.pedidos%rowtype;
  f public.facturas%rowtype;
  m public.mesas%rowtype;
  cid bigint;
  amount numeric(12,2);
  v_cliente_nombre text;
begin
  if $3 not in ('efectivo','tarjeta','transferencia') then
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

  -- 3) Fallback histÃ³rico para cuentas sin nombre.
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


  -- Cierra items pendientes para que no queden fantasmas en el KDS.
  update public.pedido_items
     set estado='servido', updated_at=now()
   where restaurante_id=$1 and pedido_id=$2
     and estado in ('enviado','preparando','listo');

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
end $function$;

commit;
