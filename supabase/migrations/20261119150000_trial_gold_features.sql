-- Trial pasa a mostrar las funciones de Gold con los límites de Premium.
-- Los límites de trial ya son los de Premium (15 usuarios, 50 mesas, 5 áreas,
-- 500 productos, 2 estaciones, 1 caja, 1 sucursal).

begin;

delete from public.plan_features where plan_codigo = 'trial';

insert into public.plan_features (plan_codigo, feature_key, habilitado)
select 'trial', feature_key, habilitado
  from public.plan_features
 where plan_codigo = 'gold'
on conflict (plan_codigo, feature_key) do update set habilitado = excluded.habilitado;

update public.planes
   set descripcion = 'Prueba de 7 días con las funciones de Gold y límites de Premium.'
 where codigo = 'trial';

notify pgrst, 'reload schema';

commit;
