-- La propina maxima permitida es 10%.

begin;

alter table public.restaurantes
  drop constraint if exists restaurantes_propina_porcentaje_check;

alter table public.restaurantes
  add constraint restaurantes_propina_porcentaje_check
  check (propina_porcentaje >= 0 and propina_porcentaje <= 10);

notify pgrst, 'reload schema';

commit;
