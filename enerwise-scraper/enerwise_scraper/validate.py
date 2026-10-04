"""Quality gate: nothing reaches the app unless it passes these checks."""
from __future__ import annotations

from datetime import date
from statistics import median

from . import config
from .models import TariffRecord


def last_variable_change_date(on: date) -> date:
    """Most recent quarterly change date (1 Jan/Apr/Jul/Oct) on or before `on`."""
    candidates = [date(on.year, m, d) for d, m in config.VARIABLE_CHANGE_DATES]
    past = [c for c in candidates if c <= on]
    return max(past) if past else date(on.year - 1, 10, 1)


def validate(record: TariffRecord, previous: dict | None = None) -> TariffRecord:
    """Set record.status to ok / needs_review / invalid and explain why in issues.

    previous: last published row for the same supplier + contract type (or None).
    """
    hard: list[str] = []
    soft: list[str] = list(record.issues)

    if record.kwh_price is None and record.gas_price is None:
        hard.append("no electricity or gas price found")
    if record.kwh_price is None:
        soft.append("electricity price missing")
    if record.gas_price is None:
        soft.append("gas price missing")

    for field, (lo, hi) in config.BOUNDS.items():
        v = getattr(record, field)
        if v is not None and not (lo <= v <= hi):
            hard.append(f"{field}={v} outside plausible range {lo}-{hi}")

    if record.price_basis_detected == "unknown":
        soft.append("price basis unknown")

    if record.valid_from and record.contract_type == "variable":
        scraped = date.fromisoformat(record.scraped_at[:10])
        cutoff = last_variable_change_date(scraped)
        if date.fromisoformat(record.valid_from) < cutoff:
            soft.append(f"tariff sheet dated {record.valid_from} predates the {cutoff.isoformat()} "
                        "variable-price change date; supplier may have updated prices")

    if previous:
        for field in ("kwh_price", "gas_price"):
            old, new = previous.get(field), getattr(record, field)
            if old and new:
                change = abs(new - old) / old
                if change > config.MAX_RELATIVE_CHANGE:
                    soft.append(f"{field} moved {change:.0%} since last run ({old} -> {new})")

    # de-duplicate, keep order
    seen = set()
    record.issues = [i for i in hard + soft if not (i in seen or seen.add(i))]
    if hard:
        record.status = "invalid"
    elif soft:
        record.status = "needs_review"
    else:
        record.status = "ok"
    return record


def _set_status(record: TariffRecord) -> None:
    if record.status == "ok" and record.issues:
        record.status = "needs_review"


def cross_check(records: list[TariffRecord]) -> list[TariffRecord]:
    """Compare each price with the median of the OTHER suppliers in this run.

    Run after validate() on the whole batch. Records already marked invalid are
    ignored as reference; a deviation over MAX_DEVIATION_FROM_MARKET is held for
    review with the numbers in `issues`.
    """
    usable = [r for r in records if r.status != "invalid"]
    for rec in usable:
        for field in ("kwh_price", "gas_price"):
            value = getattr(rec, field)
            others = [getattr(o, field) for o in usable
                      if o.supplier != rec.supplier and getattr(o, field) is not None]
            n_suppliers = len({o.supplier for o in usable
                               if o.supplier != rec.supplier and getattr(o, field) is not None})
            if value is None or n_suppliers < config.MIN_SUPPLIERS_FOR_MARKET_CHECK:
                continue
            ref = median(others)
            dev = (value - ref) / ref
            if abs(dev) > config.MAX_DEVIATION_FROM_MARKET:
                rec.issues.append(f"{field}={value} is {dev:+.0%} vs median {ref:.5f} of "
                                  f"{n_suppliers} other suppliers")
                _set_status(rec)
    return records
