"""Quality gate: nothing reaches the app unless it passes these checks."""
from __future__ import annotations

from . import config
from .models import TariffRecord


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
