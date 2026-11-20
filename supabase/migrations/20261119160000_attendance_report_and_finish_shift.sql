-- Reporte de asistencia por rango de fechas + finalizar turno.

begin;

-- Primera entrada y ultima salida por empleado/dia, con horas de turno.
create or replace function public.asistencia_reporte(
  p_restaurante_id bigint,
  p_desde date,
  p_hasta date
) returns table (
  empleado_id bigint,
  empleado text,
  rol text,
  dia date,
  entrada timestamptz,
  salida timestamptz,
  horas numeric,
  ip_entrada text,
  ip_salida text
)
language sql
security invoker
set search_path = public
as $$
  with tz as (
    select coalesce(
      (select timezone from restaurantes where id = p_restaurante_id),
      'America/El_Salvador'
    ) as zona
  ),
  agg as (
    select a.empleado_id,
           u.nombre as empleado,
           u.rol,
           ((a.fecha_hora at time zone 'UTC') at time zone tz.zona)::date as dia,
           min(a.fecha_hora) filter (where a.tipo = 'entrada') as entrada_utc,
           max(a.fecha_hora) filter (where a.tipo = 'salida') as salida_utc,
           (array_agg(a.ip_registro order by a.fecha_hora) filter (where a.tipo = 'entrada'))[1] as ip_entrada,
           (array_agg(a.ip_registro order by a.fecha_hora desc) filter (where a.tipo = 'salida'))[1] as ip_salida
      from asistencia_empleados a
      join usuarios u on u.id = a.empleado_id and u.restaurante_id = a.restaurante_id
      cross join tz
     where a.restaurante_id = p_restaurante_id
       and ((a.fecha_hora at time zone 'UTC') at time zone tz.zona)::date between p_desde and p_hasta
     group by a.empleado_id, u.nombre, u.rol, tz.zona,
              ((a.fecha_hora at time zone 'UTC') at time zone tz.zona)::date
  )
  select empleado_id,
         empleado,
         rol,
         dia,
         entrada_utc at time zone 'UTC' as entrada,
         salida_utc at time zone 'UTC' as salida,
         case
           when entrada_utc is not null and salida_utc is not null and salida_utc >= entrada_utc
             then round(extract(epoch from (salida_utc - entrada_utc)) / 3600.0, 2)
           else null
         end as horas,
         ip_entrada,
         ip_salida
    from agg
   order by dia desc, empleado;
$$;

revoke execute on function public.asistencia_reporte(bigint, date, date) from public, anon, authenticated;
grant execute on function public.asistencia_reporte(bigint, date, date) to service_role;

-- Cierra el turno de un empleado (registra salida) y lo desloguea.
create or replace function public.finalizar_turno(
  p_restaurante_id bigint,
  p_empleado_id bigint,
  p_ip text
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tz text;
  v_hoy date;
  v_entrada timestamp without time zone;
  v_salida timestamp without time zone;
  v_id bigint;
begin
  if not exists (
    select 1 from usuarios
     where id = p_empleado_id and restaurante_id = p_restaurante_id and estado = 1
  ) then
    return jsonb_build_object('ok', false, 'motivo', 'empleado');
  end if;

  select timezone into v_tz from restaurantes where id = p_restaurante_id;
  v_tz := coalesce(v_tz, 'America/El_Salvador');
  v_hoy := (now() at time zone v_tz)::date;

  select max(fecha_hora) filter (where tipo = 'entrada'),
         max(fecha_hora) filter (where tipo = 'salida')
    into v_entrada, v_salida
    from asistencia_empleados
   where restaurante_id = p_restaurante_id
     and empleado_id = p_empleado_id
     and ((fecha_hora at time zone 'UTC') at time zone v_tz)::date = v_hoy;

  if v_entrada is null then
    return jsonb_build_object('ok', false, 'motivo', 'sin_entrada');
  end if;

  if v_salida is null or v_salida < v_entrada then
    insert into asistencia_empleados (restaurante_id, empleado_id, tipo, metodo_validacion, ip_registro)
    values (p_restaurante_id, p_empleado_id, 'salida', 'pin_manual', left(coalesce(p_ip, ''), 80))
    returning id into v_id;
  end if;

  -- Fuerza el cierre de sus sesiones activas.
  delete from app_sessions
   where (sess #>> '{usuario,id}')::bigint = p_empleado_id
     and (sess #>> '{usuario,restaurante_id}')::bigint = p_restaurante_id;

  return jsonb_build_object('ok', true, 'salida_id', v_id, 'already_closed', v_id is null);
end;
$$;

revoke execute on function public.finalizar_turno(bigint, bigint, text) from public, anon, authenticated;
grant execute on function public.finalizar_turno(bigint, bigint, text) to service_role;

notify pgrst, 'reload schema';

commit;
