from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone


def now_utc() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@dataclass
class TariffRecord:
    """One supplier x contract type, normalised to all-in prices (see config)."""

    supplier: str
    contract_type: str                 # variable | fixed_1y | fixed_3y
    kwh_price: float | None            # EUR/kWh incl. energy tax + VAT
    gas_price: float | None            # EUR/m3  incl. energy tax + VAT
    fixed_fee_elec_month: float | None = None
    fixed_fee_gas_month: float | None = None
    feed_in_cost_per_kwh: float | None = None          # terugleverkosten, EUR/kWh
    feed_in_compensation_per_kwh: float | None = None  # terugleververgoeding, EUR/kWh
    # "2027" = page states the rate applies from 1 Jan 2027 (after net metering);
    # "2026" = rate only valid under net metering, or no period stated. None = no rates.
    feed_in_period: str | None = None
    contract_length_months: int | None = None
    promo: str | None = None
    price_basis_detected: str = "unknown"   # incl_tax | supply_only
    price_note: str | None = None      # how the page states tax/VAT and what we did
    valid_from: str | None = None      # "Tarieven geldig per" date on the source (YYYY-MM-DD)
    source_url: str = ""
    method: str = ""
    scraped_at: str = field(default_factory=now_utc)
    status: str = "ok"                 # ok | needs_review | invalid
    issues: list[str] = field(default_factory=list)
    raw_excerpt: str = ""              # evidence: text the numbers came from

    def to_row(self) -> dict:
        row = asdict(self)
        row["issues"] = "; ".join(self.issues) or None
        return row


@dataclass
class RunResult:
    supplier: str
    ok: bool
    records: list[TariffRecord] = field(default_factory=list)
    error: str | None = None
    duration_s: float = 0.0
