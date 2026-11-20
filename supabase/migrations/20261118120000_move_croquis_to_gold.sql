-- El plano del salón (croquis y reservas) pasa a ser exclusivo del plan Gold.
-- El gating ya está en server.js: /areas -> requireFeature('areas.croquis').
-- Básico y Premium siguen usando la rejilla simple de mesas (/mesas).

begin;

delete from public.plan_features
 where feature_key in ('areas.croquis', 'areas.reservas')
   and plan_codigo in ('trial', 'basic', 'premium');

insert into public.plan_features (plan_codigo, feature_key, habilitado)
values
  ('gold', 'areas.croquis', true),
  ('gold', 'areas.reservas', true)
on conflict (plan_codigo, feature_key) do update set habilitado = excluded.habilitado;

update public.planes
   set descripcion = 'Operación completa con barra, inventario y reportes.'
 where codigo = 'premium';

update public.planes
   set descripcion = 'Plano del salón, límites ampliados, DTE y soporte prioritario.'
 where codigo = 'gold';

notify pgrst, 'reload schema';

commit;
