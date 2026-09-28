-- RestaurantePOS: incremental reconciliation against Marroco'sPOS (PostgreSQL 17.6.1).
-- PRECONDITION: take a backup and rerun the queries in docs/PHASE_03_SCHEMA_DRIFT.md.
-- This migration is intentionally NOT applied by the recovery process.
begin;

-- Transitional constraint is required because the legacy check rejects canonical values.
alter table public.usuarios drop constraint if exists usuarios_rol_check;
alter table public.usuarios add constraint usuarios_rol_transition_check
  check (rol in ('admin','gerente','cajero','mesero','cocinero','bartender','cocina','bar'));
update public.usuarios set rol='cocina' where rol='cocinero';
update public.usuarios set rol='bar' where rol='bartender';
alter table public.usuarios drop constraint usuarios_rol_transition_check;
alter table public.usuarios add constraint usuarios_rol_check
  check (rol in ('admin','gerente','cajero','mesero','cocina','bar'));

create table public.app_sessions (
  sid text primary key,
  sess jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_app_sessions_expires_at on public.app_sessions(expires_at);
alter table public.app_sessions enable row level security;
revoke all on table public.app_sessions from public, anon, authenticated;
grant select,insert,update,delete on table public.app_sessions to service_role;

alter table public.facturas add column pedido_id bigint null;
alter table public.facturas add constraint facturas_pedido_id_fkey
  foreign key (pedido_id) references public.pedidos(id) on delete restrict;
create unique index uq_facturas_restaurante_pedido
  on public.facturas(restaurante_id,pedido_id) where pedido_id is not null;

-- Replace only a single-column UNIQUE constraint on id_externo; preserve any composite constraint.
do $$
declare v_name text;
begin
  if exists(select 1 from public.mesas where id_externo is not null) then
    raise exception 'Preflight failed: mesas.id_externo acquired live values; re-audit before applying';
  end if;
  select c.conname into v_name
  from pg_catalog.pg_constraint c
  join pg_catalog.pg_class t on t.oid=c.conrelid
  join pg_catalog.pg_namespace n on n.oid=t.relnamespace
  where n.nspname='public' and t.relname='mesas' and c.contype='u'
    and cardinality(c.conkey)=1
    and (select a.attname from pg_catalog.pg_attribute a
         where a.attrelid=t.oid and a.attnum=c.conkey[1])='id_externo';
  if v_name is not null then
    execute format('alter table public.mesas drop constraint %I',v_name);
  end if;
end $$;
create unique index if not exists uq_mesas_restaurante_id_externo
  on public.mesas(restaurante_id,id_externo) where id_externo is not null;

create index if not exists idx_pedidos_tenant_mesa_estado on public.pedidos(restaurante_id,mesa_id,estado);
create index if not exists idx_pedido_items_tenant_pedido on public.pedido_items(restaurante_id,pedido_id);
create index if not exists idx_pedido_items_tenant_producto on public.pedido_items(restaurante_id,producto_id);
create index if not exists idx_pedido_items_kds on public.pedido_items(restaurante_id,estado,enviado_at);
create index if not exists idx_facturas_tenant_cliente on public.facturas(restaurante_id,cliente_id);
create index if not exists idx_detalle_factura_factura on public.detalle_factura(factura_id);
create index if not exists idx_detalle_factura_producto on public.detalle_factura(producto_id);
create index if not exists idx_mesas_tenant_area on public.mesas(restaurante_id,area_id);

create or replace function public.pos_open_order(p_restaurante_id bigint,p_mesa_id bigint,p_cliente_nombre text,p_notas text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r public.pedidos%rowtype; m public.mesas%rowtype;
begin
  select * into m from public.mesas where id=$2 and restaurante_id=$1 for update;
  if not found then raise exception 'Mesa no encontrada'; end if;
  if m.estado<>'libre' or coalesce(m.bloqueada,false) then raise exception 'Mesa no disponible'; end if;
  select * into r from public.pedidos where restaurante_id=$1 and mesa_id=$2 and estado not in ('cerrado','cancelado') limit 1;
  if found then return to_jsonb(r)||jsonb_build_object('existing',true); end if;
  insert into public.pedidos(restaurante_id,mesa_id,estado,total,notas)
    values($1,$2,'abierto',0,nullif(trim(coalesce($4,'')),'')) returning * into r;
  update public.mesas set estado='ocupada',descripcion=left(coalesce(nullif(trim($3),''),'Cliente General'),100),updated_at=now()
    where id=$2 and restaurante_id=$1;
  return to_jsonb(r)||jsonb_build_object('existing',false);
end $$;

create or replace function public.pos_move_order(p_restaurante_id bigint,p_pedido_id bigint,p_mesa_origen_id bigint,p_mesa_destino_id bigint) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare p public.pedidos%rowtype; d public.mesas%rowtype;
begin
  if $3=$4 then raise exception 'Mesa destino invalida'; end if;
  select * into p from public.pedidos where id=$2 and restaurante_id=$1 for update;
  if not found or p.estado in ('cerrado','cancelado') or p.mesa_id<>$3 then raise exception 'Pedido no movible'; end if;
  perform id from public.mesas where restaurante_id=$1 and id in ($3,$4) order by id for update;
  select * into d from public.mesas where id=$4 and restaurante_id=$1;
  if not found or d.estado<>'libre' or coalesce(d.bloqueada,false) then raise exception 'Mesa destino no disponible'; end if;
  update public.pedidos set mesa_id=$4,updated_at=now() where id=$2 and restaurante_id=$1;
  update public.mesas set estado='ocupada',updated_at=now() where id=$4 and restaurante_id=$1;
  update public.mesas set estado='libre',descripcion=null,updated_at=now() where id=$3 and restaurante_id=$1;
  return jsonb_build_object('pedido_id',$2,'mesa_destino_id',$4,'mesa_destino',d.numero);
end $$;

create or replace function public.pos_add_order_item(p_restaurante_id bigint,p_pedido_id bigint,p_producto_id bigint,p_cantidad numeric,p_nota text,p_unidad text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare p public.pedidos%rowtype; pr public.productos%rowtype; i public.pedido_items%rowtype;
begin
  if $4 is null or $4<=0 then raise exception 'Cantidad invalida'; end if;
  select * into p from public.pedidos where id=$2 and restaurante_id=$1 for update;
  if not found or p.estado in ('cerrado','cancelado') then raise exception 'Pedido no disponible'; end if;
  select * into pr from public.productos where id=$3 and restaurante_id=$1 for update;
  if not found then raise exception 'Producto no encontrado'; end if;
  if pr.maneja_stock and coalesce(pr.stock,0)<$4 then raise exception 'Stock insuficiente'; end if;
  if pr.maneja_stock then update public.productos set stock=stock-$4,updated_at=now() where id=$3 and restaurante_id=$1; end if;
  insert into public.pedido_items(restaurante_id,pedido_id,producto_id,cantidad,unidad_medida,precio_unitario,subtotal,estado,nota)
    values($1,$2,$3,$4,coalesce(nullif($6,''),'UND'),coalesce(pr.precio_unidad,0),$4*coalesce(pr.precio_unidad,0),'pendiente',nullif(trim(coalesce($5,'')),'')) returning * into i;
  update public.pedidos set total=(select coalesce(sum(subtotal),0) from public.pedido_items where pedido_id=$2 and restaurante_id=$1 and estado<>'cancelado'),updated_at=now() where id=$2 and restaurante_id=$1;
  return to_jsonb(i);
end $$;

create or replace function public.pos_invoice_order(p_restaurante_id bigint,p_pedido_id bigint,p_forma_pago text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare p public.pedidos%rowtype; f public.facturas%rowtype; cid bigint; amount numeric(12,2);
begin
  if $3 not in ('efectivo','transferencia') then raise exception 'Forma de pago invalida'; end if;
  select * into p from public.pedidos where id=$2 and restaurante_id=$1 for update;
  if not found or p.estado='cancelado' then raise exception 'Pedido no disponible'; end if;
  select * into f from public.facturas where restaurante_id=$1 and pedido_id=$2 limit 1;
  if found then return jsonb_build_object('factura_id',f.id,'total',f.total,'already_invoiced',true); end if;
  select coalesce(sum(subtotal),0) into amount from public.pedido_items where restaurante_id=$1 and pedido_id=$2 and estado<>'cancelado';
  if amount<=0 then raise exception 'No hay productos para cobrar'; end if;
  select id into cid from public.clientes where restaurante_id=$1 and nombre='Consumidor Final' order by id limit 1;
  if cid is null then insert into public.clientes(restaurante_id,nombre) values($1,'Consumidor Final') returning id into cid; end if;
  insert into public.facturas(restaurante_id,pedido_id,cliente_id,total,forma_pago,estado) values($1,$2,cid,amount,$3,'activa') returning * into f;
  insert into public.detalle_factura(restaurante_id,factura_id,producto_id,cantidad,precio_unitario,unidad_medida,subtotal)
    select $1,f.id,producto_id,cantidad,precio_unitario,unidad_medida,subtotal from public.pedido_items where restaurante_id=$1 and pedido_id=$2 and estado<>'cancelado';
  update public.pedidos set estado='cerrado',total=amount,updated_at=now() where id=$2 and restaurante_id=$1;
  update public.mesas set estado='libre',descripcion=null where id=p.mesa_id and restaurante_id=$1;
  return jsonb_build_object('factura_id',f.id,'cliente_id',cid,'total',amount,'already_invoiced',false);
exception when unique_violation then
  select * into f from public.facturas where restaurante_id=$1 and pedido_id=$2;
  return jsonb_build_object('factura_id',f.id,'total',f.total,'already_invoiced',true);
end $$;

create or replace function public.pos_cancel_order(p_restaurante_id bigint,p_pedido_id bigint) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare p public.pedidos%rowtype; r record;
begin
  select * into p from public.pedidos where id=$2 and restaurante_id=$1 for update;
  if not found then raise exception 'Pedido no encontrado'; end if;
  if p.estado='cerrado' then raise exception 'Pedido facturado'; end if;
  if p.estado='cancelado' then return jsonb_build_object('already_cancelled',true,'pedido_id',p.id); end if;
  for r in select producto_id,cantidad from public.pedido_items where pedido_id=$2 and restaurante_id=$1 and estado<>'cancelado' for update loop
    update public.productos set stock=stock+r.cantidad,updated_at=now() where id=r.producto_id and restaurante_id=$1 and maneja_stock=true;
  end loop;
  update public.pedido_items set estado='cancelado',updated_at=now() where pedido_id=$2 and restaurante_id=$1 and estado<>'cancelado';
  update public.pedidos set estado='cancelado',total=0,updated_at=now() where id=$2 and restaurante_id=$1;
  return jsonb_build_object('already_cancelled',false,'pedido_id',p.id,'mesa_id',p.mesa_id);
end $$;

create or replace function public.pos_void_invoice(p_restaurante_id bigint,p_factura_id bigint,p_usuario_id bigint,p_motivo text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare f public.facturas%rowtype; r record;
begin
  select * into f from public.facturas where id=$2 and restaurante_id=$1 for update;
  if not found then raise exception 'Factura no encontrada'; end if;
  if f.estado='anulada' then return jsonb_build_object('already_voided',true,'factura_id',f.id); end if;
  for r in select producto_id,cantidad from public.detalle_factura where factura_id=$2 and restaurante_id=$1 loop
    update public.productos set stock=stock+r.cantidad,updated_at=now() where id=r.producto_id and restaurante_id=$1 and maneja_stock=true;
  end loop;
  update public.facturas set estado='anulada',motivo_anulacion=left(coalesce(nullif(trim($4),''),'Anulacion administrativa'),500),anulado_por=$3,fecha_anulacion=now() where id=$2 and restaurante_id=$1;
  return jsonb_build_object('already_voided',false,'factura_id',f.id);
end $$;

create or replace function public.pos_send_order(p_restaurante_id bigint,p_pedido_id bigint) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare s text; n integer;
begin
  select estado into s from public.pedidos where id=$2 and restaurante_id=$1 for update;
  if not found then raise exception 'Pedido no encontrado'; end if;
  if s in ('cerrado','cancelado') then raise exception 'Pedido no disponible'; end if;
  update public.pedido_items set estado='enviado',enviado_at=now()
    where pedido_id=$2 and restaurante_id=$1 and estado='pendiente';
  get diagnostics n=row_count;
  if n>0 then update public.pedidos set estado='en_cocina',updated_at=now() where id=$2 and restaurante_id=$1; end if;
  return jsonb_build_object('enviados',n);
end $$;

create or replace function public.pos_transition_kds(p_restaurante_id bigint,p_item_id bigint,p_station text,p_next_state text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare old_state text; category text;
begin
  if $3 not in ('cocina','bar') then raise exception 'Estacion invalida'; end if;
  select i.estado,lower(p.categoria) into old_state,category
    from public.pedido_items i join public.productos p on p.id=i.producto_id and p.restaurante_id=i.restaurante_id
    where i.id=$2 and i.restaurante_id=$1 for update of i;
  if not found or category<>$3 then raise exception 'Item KDS no encontrado'; end if;
  if not ((old_state='enviado' and $4='preparando') or (old_state='preparando' and $4='listo') or (old_state='listo' and $4='servido')) then
    raise exception 'Transicion KDS invalida: % -> %',old_state,$4;
  end if;
  update public.pedido_items set estado=$4,
    preparado_at=case when $4='preparando' then now() else preparado_at end,
    listo_at=case when $4='listo' then now() else listo_at end,
    servido_at=case when $4='servido' then now() else servido_at end
    where id=$2 and restaurante_id=$1;
  return jsonb_build_object('id',$2,'estado',$4);
end $$;

-- Operational tables have no direct browser consumers in public/ or views/.
revoke select,insert,update,delete,truncate,references,trigger on table
  public.restaurantes,public.usuarios,public.productos,public.clientes,public.mesas,
  public.pedidos,public.pedido_items,public.facturas,public.detalle_factura,
  public.cortes_caja,public.areas_restaurante,public.croquis_areas,
  public.pedido_items_temporales,public.configuracion_impresion
from anon,authenticated;

alter view public.v_desperdicios_por_producto set (security_invoker=true);
alter view public.v_desperdicios_por_motivo set (security_invoker=true);

revoke execute on function public.pos_open_order(bigint,bigint,text,text) from public,anon,authenticated;
revoke execute on function public.pos_move_order(bigint,bigint,bigint,bigint) from public,anon,authenticated;
revoke execute on function public.pos_add_order_item(bigint,bigint,bigint,numeric,text,text) from public,anon,authenticated;
revoke execute on function public.pos_invoice_order(bigint,bigint,text) from public,anon,authenticated;
revoke execute on function public.pos_cancel_order(bigint,bigint) from public,anon,authenticated;
revoke execute on function public.pos_void_invoice(bigint,bigint,bigint,text) from public,anon,authenticated;
revoke execute on function public.pos_send_order(bigint,bigint) from public,anon,authenticated;
revoke execute on function public.pos_transition_kds(bigint,bigint,text,text) from public,anon,authenticated;
grant execute on function public.pos_open_order(bigint,bigint,text,text) to service_role;
grant execute on function public.pos_move_order(bigint,bigint,bigint,bigint) to service_role;
grant execute on function public.pos_add_order_item(bigint,bigint,bigint,numeric,text,text) to service_role;
grant execute on function public.pos_invoice_order(bigint,bigint,text) to service_role;
grant execute on function public.pos_cancel_order(bigint,bigint) to service_role;
grant execute on function public.pos_void_invoice(bigint,bigint,bigint,text) to service_role;
grant execute on function public.pos_send_order(bigint,bigint) to service_role;
grant execute on function public.pos_transition_kds(bigint,bigint,text,text) to service_role;

commit;
