create table if not exists public.tariff_snapshots (
  id                      bigint generated always as identity primary key,
  supplier                text        not null,
  contract_type           text        not null check (contract_type in ('variable','fixed_1y','fixed_3y')),
  kwh_price               numeric(8,5),
  gas_price               numeric(8,5),
  fixed_fee_elec_month    numeric(7,2),
  fixed_fee_gas_month     numeric(7,2),
  contract_length_months  int,
  promo                   text,
  price_basis_detected    text,
  source_url              text        not null,
  method                  text,
  scraped_at              timestamptz not null default now(),
  status                  text        not null check (status in ('ok','needs_review','invalid')),
  issues                  text,
  raw_excerpt             text
);
create index if not exists tariff_snapshots_lookup
  on public.tariff_snapshots (supplier, contract_type, scraped_at desc);

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

grant select on public.tariff_snapshots to authenticated;
grant select on public.scrape_runs      to authenticated;
grant all    on public.tariff_snapshots to service_role;
grant all    on public.scrape_runs      to service_role;
alter table public.tariff_snapshots enable row level security;
alter table public.scrape_runs      enable row level security;

drop policy if exists "read tariffs" on public.tariff_snapshots;
create policy "read tariffs" on public.tariff_snapshots
  for select to authenticated using (true);

drop policy if exists "read runs" on public.scrape_runs;
create policy "read runs" on public.scrape_runs
  for select to authenticated using (true);

grant select on public.current_tariffs to authenticated, service_role;

ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS fixed_fee_month numeric;