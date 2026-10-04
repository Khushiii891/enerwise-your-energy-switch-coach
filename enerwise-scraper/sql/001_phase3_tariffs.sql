-- Enerwise Phase 3: real tariff storage.
-- Run once in Supabase: Dashboard -> SQL Editor -> paste -> Run.
-- The Phase 2 "tariffs" table (mock data) is left untouched so nothing breaks;
-- the app switches to reading the "current_tariffs" view instead.

-- 1. Every scrape result is appended here (full history = evidence for evaluation)
create table if not exists public.tariff_snapshots (
  id                      bigint generated always as identity primary key,
  supplier                text        not null,
  contract_type           text        not null check (contract_type in ('variable','fixed_1y','fixed_3y')),
  kwh_price               numeric(8,5),          -- EUR/kWh incl. energy tax + VAT, excl. network costs
  gas_price               numeric(8,5),          -- EUR/m3  incl. energy tax + VAT, excl. network costs
  fixed_fee_elec_month    numeric(7,2),
  fixed_fee_gas_month     numeric(7,2),
  contract_length_months  int,
  promo                   text,
  price_basis_detected    text,                  -- incl_tax | supply_only | unknown
  source_url              text        not null,
  method                  text,                  -- static | rendered | postcode
  scraped_at              timestamptz not null default now(),
  status                  text        not null check (status in ('ok','needs_review','invalid')),
  issues                  text,
  raw_excerpt             text
);
create index if not exists tariff_snapshots_lookup
  on public.tariff_snapshots (supplier, contract_type, scraped_at desc);

-- 2. One row per supplier per weekly run: success/failure log
create table if not exists public.scrape_runs (
  id                 bigint generated always as identity primary key,
  run_id             uuid        not null,
  supplier           text        not null,
  ok                 boolean     not null,
  records_found      int         not null default 0,
  records_published  int         not null default 0,
  error              text,
  duration_s         numeric(7,2),
  created_at         timestamptz not null default now()
);

-- 3. What the app reads: latest VALID price per supplier + contract type.
--    If this week's scrape failed or was flagged, last week's good value stays.
create or replace view public.current_tariffs
with (security_invoker = true) as
select distinct on (supplier, contract_type)
  supplier, contract_type, kwh_price, gas_price,
  fixed_fee_elec_month, fixed_fee_gas_month, contract_length_months, promo,
  source_url, scraped_at,
  (scraped_at < now() - interval '14 days') as is_stale
from public.tariff_snapshots
where status = 'ok'
order by supplier, contract_type, scraped_at desc;

-- 4. Security: anyone logged in may READ prices; only the scraper (service-role key,
--    which bypasses RLS) may WRITE.
alter table public.tariff_snapshots enable row level security;
alter table public.scrape_runs      enable row level security;

drop policy if exists "read tariffs" on public.tariff_snapshots;
create policy "read tariffs" on public.tariff_snapshots
  for select to anon, authenticated using (true);

drop policy if exists "read runs" on public.scrape_runs;
create policy "read runs" on public.scrape_runs
  for select to authenticated using (true);

grant select on public.current_tariffs to anon, authenticated;

-- 5. Useful checks for the evaluation section
-- Success rate per supplier:
--   select supplier, count(*) runs, avg(ok::int)::numeric(3,2) success_rate
--   from scrape_runs group by supplier order by success_rate;
-- Rows held back for review:
--   select supplier, contract_type, kwh_price, gas_price, issues, scraped_at
--   from tariff_snapshots where status <> 'ok' order by scraped_at desc;
