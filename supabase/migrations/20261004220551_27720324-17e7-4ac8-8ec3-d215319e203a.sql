alter table public.tariff_snapshots
  add column if not exists price_note     text,
  add column if not exists valid_from     date,
  add column if not exists feed_in_period text check (feed_in_period in ('2026', '2027'));

drop view if exists public.current_tariffs;
create view public.current_tariffs
with (security_invoker = true) as
select
  supplier, contract_type, kwh_price, gas_price,
  fixed_fee_elec_month, fixed_fee_gas_month, contract_length_months, promo,
  source_url, scraped_at,
  (scraped_at < now() - interval '14 days') as is_stale,
  case when feed_in_period = '2027' then feed_in_cost_per_kwh end         as feed_in_cost_per_kwh,
  case when feed_in_period = '2027' then feed_in_compensation_per_kwh end as feed_in_compensation_per_kwh,
  feed_in_period, price_note, valid_from
from (
  select distinct on (supplier, contract_type) *
  from public.tariff_snapshots
  order by supplier, contract_type, scraped_at desc, id desc
) latest
where status = 'ok';

grant select on public.current_tariffs to authenticated, service_role;