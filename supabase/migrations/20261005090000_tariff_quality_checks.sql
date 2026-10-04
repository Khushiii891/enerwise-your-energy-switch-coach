-- Tariff quality checks (append-only: existing snapshots are not modified).
--   price_note     how the source states tax/VAT and what the scraper did
--   valid_from     "Tarieven geldig per" date on a dated tariff sheet
--   feed_in_period '2027' = rates stated as valid from 1 Jan 2027 (after net metering)
--                  '2026' = net-metering-era or undated rates; NULL = no rates scraped
alter table public.tariff_snapshots
  add column if not exists price_note     text,
  add column if not exists valid_from     date,
  add column if not exists feed_in_period text check (feed_in_period in ('2026', '2027'));

-- What the app reads. Two changes from the previous view:
-- 1. Per supplier + contract type it takes the LATEST row of any status and keeps it
--    only if that row is 'ok'. A newer row flagged needs_review / invalid therefore
--    hides the offer instead of letting an older 'ok' row show through. (A failed
--    fetch writes no row, so last week's price still covers a temporary outage.)
-- 2. Feed-in rates are returned only when stated as valid from 2027 (the app models
--    the post-net-metering rules); otherwise NULL = unknown, never 0.
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
