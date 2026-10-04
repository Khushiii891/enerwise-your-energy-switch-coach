"""Selector-independent tariff parser.

Supplier sites change their CSS often, so instead of hard-coding selectors we:
  1. flatten the page into text lines (one line per table row, cells joined by " | "),
  2. find header rows that name contract types (variabel / 1 jaar vast / 3 jaar vast),
  3. classify each priced line (electricity vs gas, supply vs energy tax vs fixed fee),
  4. map multiple prices on one line to the contract-type columns,
  5. normalise to all-in prices (add energy tax if the page lists it separately).
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from bs4 import BeautifulSoup

from . import config
from .models import TariffRecord

PRICE_RE = re.compile(r"€\s*(\d{1,2}[.,]\d{2,6})")
NBSP = " "

CONTRACT_PATTERNS = [
    ("fixed_3y", re.compile(r"3[\s-]*ja(a)?r(ig)?\s*(vast)?|vast\s*3\s*jaar", re.I)),
    ("fixed_1y", re.compile(r"1[\s-]*ja(a)?r(ig)?\s*(vast)?|vast\s*1\s*jaar|vaste\s+tarieven", re.I)),
    ("variable", re.compile(r"variabel|onbepaalde\s+tijd", re.I)),
]
CONTRACT_MONTHS = {"variable": None, "fixed_1y": 12, "fixed_3y": 36}

EXCLUDE_RE = re.compile(r"teruglever|terugl\.|salderen|netbeheer|transport|vermindering|korting", re.I)
TAX_RE = re.compile(r"energiebelasting|\bEB\b|belasting", re.I)
FIXED_FEE_RE = re.compile(r"vaste\s+leveringskosten|vastrecht|per\s+maand|/\s*maand|p/m", re.I)
KWH_RE = re.compile(r"kwh|stroom|elektriciteit", re.I)
GAS_RE = re.compile(r"\bm3\b|m³|\bgas\b", re.I)
ELEC_DAYNIGHT_RE = re.compile(r"\bnormaal\b|\bdal\b|\bpiek\b", re.I)
INCL_TAX_PAGE_RE = re.compile(r"incl(\.|usief)?\s+(de\s+)?energiebelasting", re.I)


def to_float(s: str) -> float:
    return float(s.replace(",", "."))


def html_to_lines(html: str, scope_selector: str | None = None) -> list[str]:
    soup = BeautifulSoup(html, "html.parser")
    for t in soup(["script", "style", "noscript", "svg"]):
        t.decompose()
    root = soup.select_one(scope_selector) if scope_selector else soup
    if root is None:
        root = soup
    # Tables -> one line per row
    for tr in root.find_all("tr"):
        cells = [c.get_text(" ", strip=True) for c in tr.find_all(["th", "td"])]
        tr.replace_with(soup.new_string("\n" + " | ".join(cells) + "\n"))
    # Definition-list / card layouts: put block elements on their own line
    text = root.get_text("\n")
    lines = []
    for raw in text.split("\n"):
        line = re.sub(r"\s+", " ", raw.replace(NBSP, " ")).strip()
        if line:
            lines.append(line)
    return _join_label_value_pairs(lines)


def _join_label_value_pairs(lines: list[str]) -> list[str]:
    """Card layouts often put the label and the '€ 0,31' on separate lines."""
    out: list[str] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        if not PRICE_RE.search(line) and i + 1 < len(lines):
            nxt = lines[i + 1]
            if nxt.startswith("€") and not re.search(r"[a-zA-Z]{4,}", PRICE_RE.sub("", nxt)):
                out.append(f"{line} | {nxt}")
                i += 2
                continue
        out.append(line)
        i += 1
    return out


def detect_contract_header(line: str) -> list[str] | None:
    """Return ordered contract types if this line is a column header."""
    if PRICE_RE.search(line):
        return None
    found: list[tuple[int, str]] = []
    for ctype, pat in CONTRACT_PATTERNS:
        for m in pat.finditer(line):
            if not any(abs(m.start() - p) < 3 for p, _ in found):
                found.append((m.start(), ctype))
    if not found:
        return None
    found.sort()
    ordered = []
    for _, c in found:
        if c not in ordered:
            ordered.append(c)
    return ordered


@dataclass
class PricedLine:
    energy: str        # elec | gas
    component: str     # supply | tax | fixed_fee
    prices: list[float]
    columns: list[str] | None
    text: str


def classify(line: str) -> tuple[str, str] | None:
    if EXCLUDE_RE.search(line):
        return None
    label = PRICE_RE.split(line)[0]  # text before first price
    energy = None
    if GAS_RE.search(label):
        energy = "gas"
    elif KWH_RE.search(label):
        energy = "elec"
    if energy is None:
        return None
    if energy == "elec" and ELEC_DAYNIGHT_RE.search(label) and not re.search(r"enkel", label, re.I):
        return None  # prefer single-rate ('enkel') tariff
    if TAX_RE.search(label):
        return energy, "tax"
    if FIXED_FEE_RE.search(label):
        return energy, "fixed_fee"
    return energy, "supply"


def extract_priced_lines(lines: list[str]) -> list[PricedLine]:
    out: list[PricedLine] = []
    columns: list[str] | None = None
    section: str | None = None
    for line in lines:
        header = detect_contract_header(line)
        if header:
            columns = header
            section = None
            continue
        # section headings like "Stroom" / "Gas" give context to fee rows
        if not PRICE_RE.search(line):
            if re.fullmatch(r"(stroom|elektriciteit)\b.*", line, re.I) and len(line) < 40:
                section = "elec"
            elif re.fullmatch(r"gas\b.*", line, re.I) and len(line) < 40:
                section = "gas"
            continue
        cls = classify(line)
        if cls is None and section and FIXED_FEE_RE.search(line) and not EXCLUDE_RE.search(line):
            cls = (section, "fixed_fee")
        if cls is None:
            continue
        prices = [to_float(p) for p in PRICE_RE.findall(line)]
        out.append(PricedLine(cls[0], cls[1], prices, columns, line))
    return out


def detect_basis(lines: list[str], priced: list[PricedLine], forced: str) -> str:
    if forced != "auto":
        return forced
    has_tax_rows = any(p.component == "tax" for p in priced)
    says_incl = any(INCL_TAX_PAGE_RE.search(l) for l in lines)
    if has_tax_rows and not says_incl:
        return "supply_only"
    if says_incl and not has_tax_rows:
        return "incl_tax"
    return "unknown"   # contradictory or no signal -> held for review


def parse_tariffs(html: str, source: config.SupplierSource) -> list[TariffRecord]:
    lines = html_to_lines(html, source.scope_selector)
    priced = extract_priced_lines(lines)
    basis = detect_basis(lines, priced, source.price_basis)

    # value[(ctype, energy, component)] = price ; first match wins
    values: dict[tuple[str, str, str], float] = {}
    evidence: dict[str, list[str]] = {}
    for p in priced:
        cols = p.columns or ["variable"]
        if len(p.prices) == 1 and len(cols) > 1:
            targets = cols           # one value that applies to all columns (e.g. tax)
            vals = p.prices * len(cols)
        else:
            targets = cols[: len(p.prices)]
            vals = p.prices[: len(targets)]
        for ctype, v in zip(targets, vals):
            key = (ctype, p.energy, p.component)
            if key not in values:
                values[key] = v
                evidence.setdefault(ctype, []).append(p.text)

    records: list[TariffRecord] = []
    for ctype in source.contract_types:
        kwh = values.get((ctype, "elec", "supply"))
        gas = values.get((ctype, "gas", "supply"))
        if kwh is None and gas is None:
            continue
        issues: list[str] = []
        if basis == "supply_only":
            kwh_tax = values.get((ctype, "elec", "tax"), config.ENERGY_TAX_KWH_INCL_VAT)
            gas_tax = values.get((ctype, "gas", "tax"), config.ENERGY_TAX_M3_INCL_VAT)
            kwh = round(kwh + kwh_tax, 5) if kwh is not None else None
            gas = round(gas + gas_tax, 5) if gas is not None else None
        elif basis == "unknown":
            issues.append("could not tell if prices include energy tax")
        records.append(
            TariffRecord(
                supplier=source.supplier,
                contract_type=ctype,
                kwh_price=kwh,
                gas_price=gas,
                fixed_fee_elec_month=values.get((ctype, "elec", "fixed_fee")),
                fixed_fee_gas_month=values.get((ctype, "gas", "fixed_fee")),
                contract_length_months=CONTRACT_MONTHS.get(ctype),
                price_basis_detected=basis,
                source_url=source.url,
                method=source.method,
                issues=issues,
                raw_excerpt=" || ".join(evidence.get(ctype, []))[:1000],
            )
        )
    return records
