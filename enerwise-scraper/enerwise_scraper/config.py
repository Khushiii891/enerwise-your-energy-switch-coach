"""Supplier sources, tax constants and validation bounds.

All published prices are normalised to ONE basis before storage:
    all-in = supply price + energy tax (energiebelasting), including 21% VAT,
    EXCLUDING network costs (netbeheerkosten) and the yearly energy-tax reduction.
Network costs and the tax reduction are the same whichever supplier you pick,
so they cancel out when Enerwise compares suppliers.
"""
from __future__ import annotations

from dataclasses import dataclass, field

# --- Energy tax 2026, including 21% VAT (first bracket, households) ----------
# Source: Belastingdienst tariffs 2026, as also printed on supplier modelcontract
# pages. UPDATE EVERY 1 JANUARY.
ENERGY_TAX_YEAR = 2026
ENERGY_TAX_KWH_INCL_VAT = 0.11085
ENERGY_TAX_M3_INCL_VAT = 0.72680

# --- Sanity bounds for all-in prices (reject anything outside) ----------------
BOUNDS = {
    # Lower bounds sit just above the energy tax alone, so a price where the tax
    # was accidentally left out is rejected instead of published.
    "kwh_price": (0.18, 0.60),          # EUR / kWh all-in
    "gas_price": (1.00, 2.50),          # EUR / m3 all-in
    "fixed_fee_elec_month": (0.0, 20.0),
    "fixed_fee_gas_month": (0.0, 20.0),
}
# A week-on-week move bigger than this is held for human review, not published.
MAX_RELATIVE_CHANGE = 0.25

# Reference address for suppliers that only show prices after a postcode.
# Supply prices are national; the postcode only changes network costs, which we
# exclude anyway. Default: a central Utrecht postcode (override via env).
REFERENCE_POSTCODE = "3511AA"
REFERENCE_HOUSE_NUMBER = "1"

USER_AGENT = (
    "EnerwiseResearchBot/0.3 (student prototype; weekly tariff check; "
    "contact via GitHub repo)"
)

CONTRACT_TYPES = ("variable", "fixed_1y", "fixed_3y")


@dataclass
class SupplierSource:
    supplier: str
    url: str
    # "static"   -> plain HTTP GET, parse HTML (fast, preferred)
    # "rendered" -> Playwright renders JS, then parse
    # "postcode" -> Playwright fills postcode + house number, then parse
    # "pdf"      -> find the tariff PDF linked from the page (pdf_link regex), parse its text
    method: str
    # "auto" = detect from page text; "incl_tax" / "supply_only" = force
    price_basis: str = "auto"
    # Which contract columns to keep if the page shows several
    contract_types: tuple[str, ...] = ("variable", "fixed_1y")
    # Which price to take from a single-contract row: "first" (supply or all-in
    # first) or "last" (rows like "supply | tax | VAT | total")
    price_column: str = "first"
    # method="pdf": regex matched against link hrefs on the page
    pdf_link: str | None = None
    # method="postcode": submit once per contract type after ticking these
    # options (regexes matched against form labels), e.g. {"variable": ["^Variabel$"]}
    postcode_variants: dict[str, list[str]] = field(default_factory=dict)
    # False = kept for reference but skipped by the weekly run
    enabled: bool = True
    # Optional CSS selector to narrow parsing to the tariff block
    scope_selector: str | None = None
    # Postcode-flow hints (regexes matched against labels/placeholders/buttons)
    postcode_field: str = r"postcode"
    house_number_field: str = r"huisnummer"
    addition_field: str = r"toev"   # house number addition ("141M" -> "M")
    submit_button: str = r"bekijk|bereken|toon|tarieven|aanbod|volgende"
    notes: str = ""
    extra: dict = field(default_factory=dict)


# Starting points found September 2026. Selectors/URLs WILL drift over time:
# the run log (scrape_runs table) shows which supplier broke and why.
SUPPLIERS: list[SupplierSource] = [
    SupplierSource(
        supplier="Eneco",
        url="https://www.eneco.nl/duurzame-energie/modelcontract/",
        method="rendered",
        price_basis="incl_tax",
        notes="Modelcontract table is loaded by JS (Oct 2026), prices incl. energy tax.",
    ),
    SupplierSource(
        supplier="Budget Energie",
        url="https://www.budgetthuis.nl/energie/modelcontract",
        method="static",
        price_basis="supply_only",
        notes="Now 'Budget Thuis'. Supply price and energy tax in separate rows.",
    ),
    SupplierSource(
        supplier="Greenchoice",
        url="https://www.greenchoice.nl/stroom-en-gas/modelcontract/",
        method="pdf",
        price_basis="incl_tax",
        price_column="last",
        pdf_link=r"tarieven-modelcontract[^/]*\.pdf",
        notes="Tariffs are in a dated PDF linked from the page (Oct 2026); "
              "rows are supply | tax | VAT | total. Variable contract only.",
    ),
    SupplierSource(
        supplier="Oxxio",
        url="https://www.oxxio.nl/stroom-en-gas/modelcontract/",
        method="rendered",
        price_basis="incl_tax",
        notes="Same modelcontract table as Eneco (loaded by JS), prices incl. energy tax.",
    ),
    SupplierSource(
        supplier="Vattenfall",
        url="https://www.vattenfall.nl/energie/modelcontract-energie/",
        method="postcode",
        house_number_field=r"huisn",
        submit_button=r"aanvragen",
        enabled=False,
        notes="Oct 2026: the form accepts a real address but leads into the sign-up "
              "flow; tariffs only appear at the personal-details step (4 of 4), so "
              "we don't scrape it. Oxxio replaces it.",
    ),
    SupplierSource(
        supplier="Essent",
        url="https://www.essent.nl/energie/modelcontract",
        method="postcode",
        price_basis="incl_tax",   # result says "incl. 21% btw"; totals include energy tax
        house_number_field=r"huisn",
        submit_button=r"bekijk tarieven",
        postcode_variants={
            "variable": [r"^\s*Enkeltarief\s*$", r"^\s*Variabel\s*$"],
            "fixed_1y": [r"^\s*Enkeltarief\s*$", r"^\s*Vast\s*$"],
        },
        notes="Modelcontract tariff calculator; needs a real household address "
              "(REFERENCE_POSTCODE / REFERENCE_HOUSE_NUMBER). Result layout not "
              "verified yet (Oct 2026).",
    ),
]


def get_supplier(name: str) -> SupplierSource:
    for s in SUPPLIERS:
        if s.supplier.lower().replace(" ", "") == name.lower().replace(" ", ""):
            return s
    raise KeyError(f"Unknown supplier: {name}")
