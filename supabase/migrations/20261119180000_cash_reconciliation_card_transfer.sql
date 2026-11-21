-- Cuadre de caja con efectivo, tarjeta y transferencia.

begin;

alter table public.cortes_caja
  add column if not exists ventas_tarjeta numeric not null default 0,
  add column if not exists ventas_transferencia numeric not null default 0;

create or replace function public.pos_close_cash(
  p_restaurante_id bigint,
  p_caja_id bigint,
  p_usuario_id bigint,
  p_monto_cierre numeric,
  p_detalles text
) returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  v_timezone text;
  v_cash public.cortes_caja%rowtype;
  v_cutoff_utc timestamp without time zone := pg_catalog.timezone('UTC', pg_catalog.clock_timestamp());
  v_closed_at timestamp with time zone := pg_catalog.clock_timestamp();
  v_sales numeric := 0;
  v_sales_card numeric := 0;
  v_sales_transfer numeric := 0;
  v_expected numeric := 0;
  v_difference numeric := 0;
begin
  select r.timezone into v_timezone
  from public.restaurantes r
  where r.id = p_restaurante_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'CASH_RESTAURANT_NOT_FOUND';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = v_timezone) then
    raise exception using errcode = '22023', message = 'CASH_INVALID_TIMEZONE';
  end if;
  if not exists (
    select 1 from public.usuarios u
    where u.id = p_usuario_id and u.restaurante_id = p_restaurante_id and u.estado = 1
  ) then
    raise exception using errcode = '42501', message = 'CASH_USER_NOT_AUTHORIZED';
  end if;
  if p_caja_id is null or p_caja_id <= 0 then
    raise exception using errcode = '22023', message = 'CASH_INVALID_ID';
  end if;
  if p_monto_cierre is null or p_monto_cierre < 0
     or p_monto_cierre::text in ('NaN','Infinity','-Infinity') then
    raise exception using errcode = '22023', message = 'CASH_INVALID_AMOUNT';
  end if;
  if length(coalesce(p_detalles,'')) > 10000 then
    raise exception using errcode = '22023', message = 'CASH_DETAILS_TOO_LARGE';
  end if;

  select * into v_cash
  from public.cortes_caja c
  where c.id = p_caja_id and c.restaurante_id = p_restaurante_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'CASH_NOT_FOUND';
  end if;
  if v_cash.estado <> 'abierta' then
    raise exception using errcode = '23505', message = 'CASH_ALREADY_CLOSED';
  end if;

  select
    coalesce(sum(f.total) filter (where f.forma_pago = 'efectivo'), 0),
    coalesce(sum(f.total) filter (where f.forma_pago = 'tarjeta'), 0),
    coalesce(sum(f.total) filter (where f.forma_pago = 'transferencia'), 0)
  into v_sales, v_sales_card, v_sales_transfer
  from public.facturas f
  where f.restaurante_id = p_restaurante_id
    and f.estado = 'activa'
    and f.fecha >= v_cash.created_at
    and f.fecha <= v_cutoff_utc;

  v_expected := v_cash.monto_apertura + v_sales;
  v_difference := p_monto_cierre - v_expected;

  update public.cortes_caja
  set monto_cierre = p_monto_cierre,
      ventas_efectivo = v_sales,
      ventas_tarjeta = v_sales_card,
      ventas_transferencia = v_sales_transfer,
      diferencia = v_difference,
      detalles_dinero = nullif(p_detalles, ''),
      estado = 'cerrada',
      cerrado_at = v_closed_at
  where id = v_cash.id and restaurante_id = p_restaurante_id;

  return jsonb_build_object(
    'id', v_cash.id,
    'estado', 'cerrada',
    'monto_apertura', v_cash.monto_apertura,
    'ventas_efectivo', v_sales,
    'ventas_tarjeta', v_sales_card,
    'ventas_transferencia', v_sales_transfer,
    'ventas_total', v_sales + v_sales_card + v_sales_transfer,
    'monto_esperado', v_expected,
    'monto_cierre', p_monto_cierre,
    'diferencia', v_difference,
    'cerrado_at', v_closed_at
  );
end;
$function$;

revoke execute on function public.pos_close_cash(bigint, bigint, bigint, numeric, text) from public, anon, authenticated;
grant execute on function public.pos_close_cash(bigint, bigint, bigint, numeric, text) to service_role;

notify pgrst, 'reload schema';

commit;
