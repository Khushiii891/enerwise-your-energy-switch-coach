-- Feed-in rates scraped from supplier pages (EUR/kWh, positive numbers):
-- terugleverkosten = cost of feeding in, terugleververgoeding = compensation.
-- Rates from 1 Jan 2027 (end of net metering) are preferred when published.
alter table public.tariff_snapshots
  add column if not exists feed_in_cost_per_kwh         numeric(8,5),
  add column if not exists feed_in_compensation_per_kwh numeric(8,5);

-- New columns go at the end so "create or replace view" can extend the view.
create or replace view public.current_tariffs
with (security_invoker = true) as
select distinct on (supplier, contract_type)
  supplier, contract_type, kwh_price, gas_price,
  fixed_fee_elec_month, fixed_fee_gas_month, contract_length_months, promo,
  source_url, scraped_at,
  (scraped_at < now() - interval '14 days') as is_stale,
  feed_in_cost_per_kwh, feed_in_compensation_per_kwh
from public.tariff_snapshots
where status = 'ok'
order by supplier, contract_type, scraped_at desc;

grant select on public.current_tariffs to authenticated, service_role;
