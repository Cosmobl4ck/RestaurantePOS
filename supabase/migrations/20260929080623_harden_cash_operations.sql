-- Phase 06A: atomic cash lifecycle, tenant business timezone and DB validation.
begin;

alter table public.restaurantes
  add column timezone text not null default 'America/El_Salvador';

alter table public.cortes_caja
  add constraint cortes_caja_monto_apertura_nonnegative
    check (monto_apertura >= 0 and monto_apertura::text not in ('NaN','Infinity','-Infinity')),
  add constraint cortes_caja_monto_cierre_nonnegative
    check (monto_cierre is null or (monto_cierre >= 0 and monto_cierre::text not in ('NaN','Infinity','-Infinity'))),
  add constraint cortes_caja_ventas_efectivo_nonnegative
    check (ventas_efectivo is null or (ventas_efectivo >= 0 and ventas_efectivo::text not in ('NaN','Infinity','-Infinity'))),
  add constraint cortes_caja_turno_check
    check (turno in ('1','2'));

create unique index uq_cortes_caja_restaurante_abierta
  on public.cortes_caja(restaurante_id)
  where estado = 'abierta';

create or replace function public.pos_open_cash(
  p_restaurante_id bigint,
  p_usuario_id bigint,
  p_turno text,
  p_monto_apertura numeric,
  p_detalles text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_timezone text;
  v_cash public.cortes_caja%rowtype;
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
  if p_turno is null or p_turno not in ('1','2') then
    raise exception using errcode = '22023', message = 'CASH_INVALID_SHIFT';
  end if;
  if p_monto_apertura is null or p_monto_apertura < 0
     or p_monto_apertura::text in ('NaN','Infinity','-Infinity') then
    raise exception using errcode = '22023', message = 'CASH_INVALID_AMOUNT';
  end if;
  if length(coalesce(p_detalles,'')) > 10000 then
    raise exception using errcode = '22023', message = 'CASH_DETAILS_TOO_LARGE';
  end if;

  insert into public.cortes_caja(
    restaurante_id, fecha, monto_apertura, estado, usuario_id, turno,
    ventas_efectivo, diferencia, detalles_dinero
  ) values (
    p_restaurante_id,
    (pg_catalog.now() at time zone v_timezone)::date,
    p_monto_apertura,
    'abierta',
    p_usuario_id,
    p_turno,
    0,
    0,
    nullif(p_detalles,'')
  ) returning * into v_cash;

  return jsonb_build_object(
    'id', v_cash.id,
    'fecha', v_cash.fecha,
    'estado', v_cash.estado,
    'turno', v_cash.turno,
    'monto_apertura', v_cash.monto_apertura
  );
exception
  when unique_violation then
    raise exception using errcode = '23505', message = 'CASH_ALREADY_OPEN';
end;
$$;

create or replace function public.pos_close_cash(
  p_restaurante_id bigint,
  p_caja_id bigint,
  p_usuario_id bigint,
  p_monto_cierre numeric,
  p_detalles text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_timezone text;
  v_cash public.cortes_caja%rowtype;
  v_cutoff_utc timestamp without time zone := pg_catalog.timezone('UTC', pg_catalog.clock_timestamp());
  v_closed_at timestamp with time zone := pg_catalog.clock_timestamp();
  v_sales numeric := 0;
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

  select coalesce(sum(f.total),0) into v_sales
  from public.facturas f
  where f.restaurante_id = p_restaurante_id
    and f.forma_pago = 'efectivo'
    and f.estado = 'activa'
    and f.fecha >= v_cash.created_at
    and f.fecha <= v_cutoff_utc;

  v_expected := v_cash.monto_apertura + v_sales;
  v_difference := p_monto_cierre - v_expected;

  update public.cortes_caja
  set monto_cierre = p_monto_cierre,
      ventas_efectivo = v_sales,
      diferencia = v_difference,
      detalles_dinero = nullif(p_detalles,''),
      estado = 'cerrada',
      cerrado_at = v_closed_at
  where id = v_cash.id and restaurante_id = p_restaurante_id;

  return jsonb_build_object(
    'id', v_cash.id,
    'estado', 'cerrada',
    'monto_apertura', v_cash.monto_apertura,
    'ventas_efectivo', v_sales,
    'monto_esperado', v_expected,
    'monto_cierre', p_monto_cierre,
    'diferencia', v_difference,
    'cerrado_at', v_closed_at
  );
end;
$$;

revoke execute on function public.pos_open_cash(bigint,bigint,text,numeric,text)
  from public, anon, authenticated;
revoke execute on function public.pos_close_cash(bigint,bigint,bigint,numeric,text)
  from public, anon, authenticated;
grant execute on function public.pos_open_cash(bigint,bigint,text,numeric,text) to service_role;
grant execute on function public.pos_close_cash(bigint,bigint,bigint,numeric,text) to service_role;

commit;
