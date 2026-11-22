-- Ajustes de cobro: descuento y propina por ticket.

begin;

alter table public.facturas
  add column if not exists subtotal numeric(12,2) not null default 0,
  add column if not exists descuento numeric(12,2) not null default 0,
  add column if not exists descuento_porcentaje numeric(5,2) not null default 0,
  add column if not exists descuento_motivo text;

update public.facturas
set subtotal = greatest(total - coalesce(propina,0), 0)
where subtotal = 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'facturas_subtotal_nonnegative') then
    alter table public.facturas
      add constraint facturas_subtotal_nonnegative check (subtotal >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'facturas_descuento_nonnegative') then
    alter table public.facturas
      add constraint facturas_descuento_nonnegative check (descuento >= 0);
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
