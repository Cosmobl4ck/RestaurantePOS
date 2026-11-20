-- Asistencia por login/logout y restriccion por IP del restaurante.

begin;

alter table public.restaurantes
  add column if not exists ip_permitida text;

create index if not exists idx_asistencia_tenant_fecha
  on public.asistencia_empleados (restaurante_id, fecha_hora desc);

create index if not exists idx_asistencia_empleado_fecha
  on public.asistencia_empleados (empleado_id, fecha_hora desc);

-- Registra una entrada (solo la primera del dia) o una salida.
create or replace function public.registrar_asistencia(
  p_restaurante_id bigint,
  p_empleado_id bigint,
  p_tipo text,
  p_metodo text,
  p_ip text
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tz text;
  v_hoy date;
  v_existe boolean;
  v_id bigint;
begin
  if p_tipo not in ('entrada', 'salida') then
    raise exception 'Tipo de asistencia invalido';
  end if;

  select timezone into v_tz from restaurantes where id = p_restaurante_id;
  if v_tz is null then
    v_tz := 'America/El_Salvador';
  end if;

  v_hoy := (now() at time zone v_tz)::date;

  if p_tipo = 'entrada' then
    select exists(
      select 1
        from asistencia_empleados
       where restaurante_id = p_restaurante_id
         and empleado_id = p_empleado_id
         and tipo = 'entrada'
         and ((fecha_hora at time zone 'UTC') at time zone v_tz)::date = v_hoy
    ) into v_existe;

    if v_existe then
      return jsonb_build_object('inserted', false, 'tipo', p_tipo);
    end if;
  end if;

  insert into asistencia_empleados (restaurante_id, empleado_id, tipo, metodo_validacion, ip_registro)
  values (p_restaurante_id, p_empleado_id, p_tipo, p_metodo, left(coalesce(p_ip, ''), 80))
  returning id into v_id;

  return jsonb_build_object('inserted', true, 'id', v_id, 'tipo', p_tipo);
end;
$$;

revoke execute on function public.registrar_asistencia(bigint, bigint, text, text, text) from public, anon, authenticated;
grant execute on function public.registrar_asistencia(bigint, bigint, text, text, text) to service_role;

-- Resumen por empleado y dia: primera entrada, ultima salida e IPs.
create or replace function public.asistencia_resumen(
  p_restaurante_id bigint,
  p_desde date,
  p_hasta date
) returns table (
  empleado_id bigint,
  empleado text,
  rol text,
  dia date,
  entrada text,
  salida text,
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
  )
  select a.empleado_id,
         u.nombre as empleado,
         u.rol,
         ((a.fecha_hora at time zone 'UTC') at time zone tz.zona)::date as dia,
         to_char((min(a.fecha_hora) filter (where a.tipo = 'entrada') at time zone 'UTC') at time zone tz.zona, 'HH24:MI') as entrada,
         to_char((max(a.fecha_hora) filter (where a.tipo = 'salida') at time zone 'UTC') at time zone tz.zona, 'HH24:MI') as salida,
         (array_agg(a.ip_registro order by a.fecha_hora) filter (where a.tipo = 'entrada'))[1] as ip_entrada,
         (array_agg(a.ip_registro order by a.fecha_hora desc) filter (where a.tipo = 'salida'))[1] as ip_salida
    from asistencia_empleados a
    join usuarios u on u.id = a.empleado_id and u.restaurante_id = a.restaurante_id
    cross join tz
   where a.restaurante_id = p_restaurante_id
     and ((a.fecha_hora at time zone 'UTC') at time zone tz.zona)::date between p_desde and p_hasta
   group by a.empleado_id, u.nombre, u.rol, tz.zona, ((a.fecha_hora at time zone 'UTC') at time zone tz.zona)::date
   order by dia desc, u.nombre;
$$;

revoke execute on function public.asistencia_resumen(bigint, date, date) from public, anon, authenticated;
grant execute on function public.asistencia_resumen(bigint, date, date) to service_role;

notify pgrst, 'reload schema';

commit;
