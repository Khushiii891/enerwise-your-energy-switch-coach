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

This folder lives inside the Enerwise app repo. The workflow is at
`../.github/workflows/scrape.yml` (GitHub only runs workflows from the repo root)
and the database schema is the migration
`../supabase/migrations/20261004150000_phase3_scraped_tariffs.sql`.

1. **Database.** Make sure that migration has been applied to Lovable Cloud
   (ask Lovable to run it, or paste it into the SQL editor).
2. **Secrets.** Lovable Cloud doesn't expose the service-role key, so the
   scraper sends results to the app's `/api/ingest-tariffs` endpoint
   (`src/routes/api/ingest-tariffs.ts`), which writes them to the database.
   - Lovable: add secret `SCRAPER_INGEST_SECRET` (32+ random characters).
   - GitHub → Settings → Secrets and variables → Actions: add
     `SCRAPER_INGEST_SECRET` (same value), `ENERWISE_INGEST_URL`
     (`https://<your-app>/api/ingest-tariffs`), and `REFERENCE_POSTCODE`,
     `REFERENCE_HOUSE_NUMBER`, `REFERENCE_HOUSE_NUMBER_ADDITION` (Essent only
     shows prices for a real household address; prices are national).
3. **First run.** Repo → Actions → "Weekly tariff scrape" → Run workflow.
   Check the log: each supplier prints `[ok]`, `[needs_review]` or `[FAILED]`.
4. **App.** Nothing to do: the app reads `current_tariffs` (see `loadOffers` in
   `src/lib/db-mappers.ts`) and falls back to the mock `tariffs` table until
   the view has rows.

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

## Verification status (4 Oct 2026, live run)

| Supplier | Status | Source |
|---|---|---|
| Eneco | working | modelcontract page, rendered (table loaded by JS) |
| Budget Energie | working | modelcontract page, plain HTML |
| Greenchoice | working (variable only) | dated tariff PDF linked from the modelcontract page |
| Oxxio | working | modelcontract page, rendered (same table as Eneco) |
| Essent | working (needs `REFERENCE_*` household address) | modelcontract tariff calculator, one submit per contract type |
| Vattenfall | disabled | tariffs only at the personal-details step of the sign-up flow |

Saved copies of the working pages are in `tests/fixtures/live_*_2026_10.html`
and `test_live_supplier_pages` pins their prices.

## Responsible scraping

- Checks `robots.txt` before every request and skips disallowed pages.
- One visit per supplier per week, 2-second gap between suppliers, identifiable
  user agent.
- Collects only publicly listed tariffs; no personal data.
- Modelcontract pages are the preferred source: every Dutch supplier must publish
  this ACM-regulated contract, so prices are comparable across suppliers.
