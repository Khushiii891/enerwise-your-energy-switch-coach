"""Storage: Supabase (via PostgREST) or local JSON for dry runs."""
from __future__ import annotations

import json
import os
from pathlib import Path

import requests

from .models import RunResult, TariffRecord


class Store:
    def latest(self, supplier: str, contract_type: str) -> dict | None: ...
    def save_records(self, records: list[TariffRecord]) -> None: ...
    def save_run(self, run_id: str, result: RunResult) -> None: ...


class SupabaseStore(Store):
    """Writes with the service-role key (server side only, never in the frontend)."""

    def __init__(self, url: str | None = None, key: str | None = None):
        self.url = (url or os.environ["SUPABASE_URL"]).rstrip("/") + "/rest/v1"
        key = key or os.environ["SUPABASE_SERVICE_ROLE_KEY"]
        self.headers = {
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        }

    def latest(self, supplier: str, contract_type: str) -> dict | None:
        r = requests.get(
            f"{self.url}/current_tariffs",
            headers=self.headers,
            params={
                "supplier": f"eq.{supplier}",
                "contract_type": f"eq.{contract_type}",
                "select": "kwh_price,gas_price,scraped_at",
                "limit": 1,
            },
            timeout=20,
        )
        r.raise_for_status()
        rows = r.json()
        return rows[0] if rows else None

    def save_records(self, records: list[TariffRecord]) -> None:
        if not records:
            return
        r = requests.post(
            f"{self.url}/tariff_snapshots",
            headers=self.headers,
            data=json.dumps([rec.to_row() for rec in records]),
            timeout=30,
        )
        r.raise_for_status()

    def save_run(self, run_id: str, result: RunResult) -> None:
        row = {
            "run_id": run_id,
            "supplier": result.supplier,
            "ok": result.ok,
            "records_found": len(result.records),
            "records_published": sum(r.status == "ok" for r in result.records),
            "error": result.error,
            "duration_s": round(result.duration_s, 2),
        }
        r = requests.post(
            f"{self.url}/scrape_runs", headers=self.headers, data=json.dumps(row), timeout=20
        )
        r.raise_for_status()


class IngestStore(Store):
    """Sends results to the app's /api/ingest-tariffs endpoint.

    For Lovable Cloud, which doesn't expose the service-role key: the app's
    server writes to Supabase on our behalf. Needs ENERWISE_INGEST_URL
    (e.g. https://your-app.lovable.app/api/ingest-tariffs) and
    SCRAPER_INGEST_SECRET (same value as the app's secret).
    """

    def __init__(self, url: str | None = None, secret: str | None = None):
        self.url = url or os.environ["ENERWISE_INGEST_URL"]
        secret = secret or os.environ["SCRAPER_INGEST_SECRET"]
        self.headers = {"Authorization": f"Bearer {secret}", "Content-Type": "application/json"}
        self._current: list[dict] | None = None

    def latest(self, supplier: str, contract_type: str) -> dict | None:
        if self._current is None:  # one GET per run
            r = requests.get(self.url, headers=self.headers, timeout=30)
            r.raise_for_status()
            self._current = r.json()
        for row in self._current:
            if row["supplier"] == supplier and row["contract_type"] == contract_type:
                return row
        return None

    def _post(self, body: dict) -> None:
        r = requests.post(self.url, headers=self.headers, data=json.dumps(body), timeout=30)
        if r.status_code >= 400:
            raise RuntimeError(f"ingest endpoint returned {r.status_code}: {r.text[:300]}")

    def save_records(self, records: list[TariffRecord]) -> None:
        if records:
            self._post({"snapshots": [rec.to_row() for rec in records]})

    def save_run(self, run_id: str, result: RunResult) -> None:
        self._post({"runs": [{
            "run_id": run_id,
            "supplier": result.supplier,
            "ok": result.ok,
            "records_found": len(result.records),
            "records_published": sum(r.status == "ok" for r in result.records),
            "error": result.error,
            "duration_s": round(result.duration_s, 2),
        }]})


class LocalStore(Store):
    """Dry-run store: writes JSON into ./out so you can inspect results."""

    def __init__(self, out_dir: str = "out"):
        self.dir = Path(out_dir)
        self.dir.mkdir(parents=True, exist_ok=True)
        self.snap = self.dir / "tariff_snapshots.jsonl"
        self.runs = self.dir / "scrape_runs.jsonl"

    def latest(self, supplier: str, contract_type: str) -> dict | None:
        if not self.snap.exists():
            return None
        last = None
        for line in self.snap.read_text().splitlines():
            row = json.loads(line)
            if (row["supplier"], row["contract_type"], row["status"]) == (supplier, contract_type, "ok"):
                last = row
        return last

    def save_records(self, records: list[TariffRecord]) -> None:
        with self.snap.open("a") as f:
            for rec in records:
                f.write(json.dumps(rec.to_row(), ensure_ascii=False) + "\n")

    def save_run(self, run_id: str, result: RunResult) -> None:
        with self.runs.open("a") as f:
            f.write(json.dumps({
                "run_id": run_id, "supplier": result.supplier, "ok": result.ok,
                "records_found": len(result.records), "error": result.error,
                "duration_s": round(result.duration_s, 2),
            }) + "\n")
