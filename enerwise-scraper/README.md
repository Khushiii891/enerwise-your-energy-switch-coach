# Enerwise scraper (Phase 3)

Weekly job that collects real tariffs from five Dutch suppliers (Eneco, Budget
Energie / Budget Thuis, Greenchoice, Vattenfall, Essent), checks them, and writes
them to Supabase. The Lovable app only **reads** the `current_tariffs` view.

```
GitHub Actions (every Monday)
  -> fetch page (plain HTTP | Playwright render | Playwright postcode form)
  -> parse prices from page text (no fragile CSS selectors)
  -> normalise to all-in price (supply + energy tax, incl. VAT, excl. network costs)
  -> quality gate (plausible range, week-on-week jump, tax basis known?)
  -> Supabase: tariff_snapshots (history) + scrape_runs (log)
  -> view current_tariffs = latest price that passed the gate
```

## One-time setup (about 20 minutes)

1. **Database.** Supabase → SQL Editor → paste `sql/001_phase3_tariffs.sql` → Run.
2. **GitHub repo.** Create a new (private) repo and push this folder to it.
3. **Secrets.** Repo → Settings → Secrets and variables → Actions → add
   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (Supabase → Project Settings → API).
   The service-role key can write everything: never paste it into Lovable.
4. **First run.** Repo → Actions → "Weekly tariff scrape" → Run workflow.
   Check the log: each supplier prints `[ok]`, `[needs_review]` or `[FAILED]`.
5. **Point the app at real data.** Paste this into Lovable:

   > Replace the mock `tariffs` table as the source of supplier offers with the
   > Supabase view `current_tariffs` (columns: supplier, contract_type, kwh_price,
   > gas_price, fixed_fee_elec_month, fixed_fee_gas_month, contract_length_months,
   > promo, source_url, scraped_at, is_stale). Treat each row as one candidate
   > offer, named "{supplier} – {contract_type}". Include the fixed monthly fees
   > ×12 in the annual cost when present, for both the candidate and (if the user
   > entered one) the current contract. Keep the net_savings formula and the €50
   > threshold unchanged. On each offer card show "Prices checked {scraped_at as
   > date}" and a link to source_url; if is_stale is true show "Price may be out
   > of date". Add a note on the My Contract form: "Enter prices including energy
   > tax and VAT, as shown on your contract or annual bill." Pass scraped_at for
   > the top candidates into generate-rationale so the explanation can mention
   > how recent the prices are.

## Running locally

```bash
pip install -r requirements.txt
python -m playwright install chromium
pytest -q                                           # 12 tests, no internet needed
python -m enerwise_scraper.run --dry-run            # live sites -> ./out/*.jsonl
SAVE_DEBUG_HTML=1 python -m enerwise_scraper.run --dry-run --supplier vattenfall
python -m enerwise_scraper.run --dry-run --from-file eneco=saved_page.html
```

## When a supplier breaks

Sites get redesigned. A break never reaches users: the failed supplier is logged
in `scrape_runs` and the app keeps showing last week's price (flagged stale after
14 days). The workflow turns red if fewer than 3 suppliers succeed, and GitHub
emails you.

To fix: download the `debug-pages` artifact from the failed run, open the HTML or
screenshot, then adjust that supplier in `enerwise_scraper/config.py` (URL,
`method`, `price_basis`, postcode-field hints, or `scope_selector`). Save the page
into `tests/fixtures/` and add a test so it stays fixed.

Rows with status `needs_review` (e.g. price moved >25% in a week) are stored but
not shown. Check them with the query at the bottom of the SQL file, and if the
price is real, run
`update tariff_snapshots set status='ok' where id = …;`.

## Verification status (27 Sep 2026)

- Parser, normalisation, quality gate and failure handling are covered by tests
  on synthetic pages modelled on each layout type.
- The Playwright postcode flow was tested on a local form page.
- **Not yet verified against the live supplier sites** (the build environment
  couldn't reach them). The first GitHub Actions run is the real test: expect to
  tweak one or two supplier configs, especially Essent and Vattenfall, whose
  prices sit behind a postcode form.

## Responsible scraping

- Checks `robots.txt` before every request and skips disallowed pages.
- One visit per supplier per week, 2-second gap between suppliers, identifiable
  user agent.
- Collects only publicly listed tariffs; no personal data.
- Modelcontract pages are the preferred source: every Dutch supplier must publish
  this ACM-regulated contract, so prices are comparable across suppliers.
