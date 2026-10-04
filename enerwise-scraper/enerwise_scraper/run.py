"""Entry point.

    python -m enerwise_scraper.run                 # all suppliers -> Supabase
    python -m enerwise_scraper.run --dry-run       # all suppliers -> ./out/*.jsonl
    python -m enerwise_scraper.run --supplier eneco --dry-run
    python -m enerwise_scraper.run --from-file eneco=page.html --dry-run   # parse a saved page
"""
from __future__ import annotations

import argparse
import os
import sys
import time
import uuid
from typing import Callable

from . import config
from .fetch import fetch_html
from .models import RunResult
from .parse import parse_tariffs
from .store import IngestStore, LocalStore, Store, SupabaseStore
from .validate import validate


def scrape_supplier(
    source: config.SupplierSource,
    store: Store,
    fetcher: Callable[[config.SupplierSource], str] = fetch_html,
) -> RunResult:
    t0 = time.time()
    try:
        html = fetcher(source)
        records = parse_tariffs(html, source)
        if not records:
            raise ValueError("page fetched but no tariffs recognised (layout changed?)")
        for rec in records:
            validate(rec, store.latest(rec.supplier, rec.contract_type))
        store.save_records(records)
        return RunResult(source.supplier, ok=True, records=records, duration_s=time.time() - t0)
    except Exception as e:
        return RunResult(source.supplier, ok=False, error=f"{type(e).__name__}: {e}"[:500],
                         duration_s=time.time() - t0)


def load_dotenv(path: str = ".env") -> None:
    """Read KEY=value lines from .env (never committed) without overriding real env vars."""
    if not os.path.exists(path):
        return
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip())


def main(argv: list[str] | None = None) -> int:
    load_dotenv()
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="write to ./out instead of Supabase")
    ap.add_argument("--supplier", action="append", help="only this supplier (repeatable)")
    ap.add_argument("--from-file", action="append", default=[],
                    help="supplier=path.html : parse a saved page instead of fetching")
    ap.add_argument("--min-success", type=int, default=3,
                    help="exit non-zero if fewer suppliers succeed (alerts via GitHub Actions)")
    args = ap.parse_args(argv)

    if args.dry_run:
        store: Store = LocalStore()
    elif os.getenv("ENERWISE_INGEST_URL"):
        store = IngestStore()          # Lovable Cloud: app endpoint writes for us
    else:
        store = SupabaseStore()        # direct, needs SUPABASE_SERVICE_ROLE_KEY
    sources = [config.get_supplier(s) for s in args.supplier] if args.supplier else [s for s in config.SUPPLIERS if s.enabled]

    files = dict(item.split("=", 1) for item in args.from_file)
    files = {config.get_supplier(k).supplier: v for k, v in files.items()}
    if files and not args.supplier:
        sources = [config.get_supplier(k) for k in files]

    def fetcher(src: config.SupplierSource) -> str:
        if src.supplier in files:
            with open(files[src.supplier], encoding="utf-8") as f:
                return f.read()
        return fetch_html(src)

    run_id = str(uuid.uuid4())
    results = []
    for src in sources:
        res = scrape_supplier(src, store, fetcher)
        results.append(res)
        try:
            store.save_run(run_id, res)
        except Exception as e:  # logging must never kill the run
            print(f"  (could not log run: {e})", file=sys.stderr)
        if res.ok:
            for r in res.records:
                print(f"[{r.status:12}] {r.supplier:15} {r.contract_type:9} "
                      f"kWh={r.kwh_price} m3={r.gas_price}  {'; '.join(r.issues)}")
        else:
            print(f"[FAILED      ] {src.supplier:15} {res.error}")
        time.sleep(2)  # be polite between suppliers

    n_ok = sum(1 for r in results if r.ok and any(x.status == "ok" for x in r.records))
    print(f"\n{n_ok}/{len(results)} suppliers published fresh prices. run_id={run_id}")
    threshold = min(args.min_success, len(results))
    return 0 if n_ok >= threshold else 1


if __name__ == "__main__":
    sys.exit(main())
