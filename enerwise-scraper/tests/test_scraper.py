from pathlib import Path

import pytest

from enerwise_scraper import config
from enerwise_scraper.models import TariffRecord
from enerwise_scraper.parse import parse_tariffs
from enerwise_scraper.run import scrape_supplier
from enerwise_scraper.store import LocalStore
from enerwise_scraper.validate import validate

FIX = Path(__file__).parent / "fixtures"


def src(**kw):
    base = dict(supplier="TestCo", url="https://example.test", method="static")
    base.update(kw)
    return config.SupplierSource(**base)


def by_type(records):
    return {r.contract_type: r for r in records}


# ---------- parsing -----------------------------------------------------------

def test_table_with_columns_incl_tax():
    recs = by_type(parse_tariffs((FIX / "table_incl_tax.html").read_text(), src()))
    assert set(recs) == {"variable", "fixed_1y"}
    v, f = recs["variable"], recs["fixed_1y"]
    assert v.kwh_price == 0.36122           # 'enkel' row, not normaal/dal
    assert f.kwh_price == 0.31186
    assert v.gas_price == 1.84154 and f.gas_price == 1.74751
    assert v.fixed_fee_elec_month == 10.99  # fee row picked up via 'Stroom' section
    assert v.fixed_fee_gas_month == 8.99
    assert v.price_basis_detected == "incl_tax"
    assert f.contract_length_months == 12


def test_feed_in_tariff_is_ignored():
    recs = parse_tariffs((FIX / "table_incl_tax.html").read_text(), src())
    assert all(r.kwh_price != 0.05 for r in recs)


def test_supply_only_gets_energy_tax_added():
    recs = by_type(parse_tariffs((FIX / "sections_supply_only.html").read_text(), src()))
    f, v = recs["fixed_1y"], recs["variable"]
    assert f.price_basis_detected == "supply_only"
    assert f.kwh_price == pytest.approx(0.24200 + 0.11085)
    assert f.gas_price == pytest.approx(1.10110 + 0.72680)
    assert v.kwh_price == pytest.approx(0.21780 + 0.11085)
    assert f.fixed_fee_elec_month == 6.99 and f.fixed_fee_gas_month == 6.99


def test_card_layout_after_postcode():
    recs = by_type(parse_tariffs((FIX / "cards_after_postcode.html").read_text(), src(method="postcode")))
    v = recs["variable"]
    assert v.kwh_price == 0.29816 and v.gas_price == 1.30312
    assert v.fixed_fee_elec_month == 7.49     # not the 39,01 network cost
    assert v.price_basis_detected == "incl_tax"


def test_changed_layout_returns_nothing():
    assert parse_tariffs((FIX / "layout_changed.html").read_text(), src()) == []


def test_contradictory_basis_is_flagged_unknown():
    html = """<p>Prijzen inclusief energiebelasting</p><table>
      <tr><td>Stroom per kWh</td><td>€ 0,30</td></tr>
      <tr><td>Energiebelasting per kWh</td><td>€ 0,11085</td></tr>
      <tr><td>Gas per m3</td><td>€ 1,50</td></tr></table>"""
    rec = parse_tariffs(html, src())[0]
    assert rec.price_basis_detected == "unknown"
    assert validate(rec).status == "needs_review"


# ---------- validation --------------------------------------------------------

def rec(**kw):
    base = dict(supplier="X", contract_type="variable", kwh_price=0.30, gas_price=1.50,
                price_basis_detected="incl_tax")
    base.update(kw)
    return TariffRecord(**base)


def test_valid_record_is_ok():
    assert validate(rec()).status == "ok"


def test_price_without_tax_is_rejected():
    r = validate(rec(gas_price=0.85))   # looks like a supply-only price
    assert r.status == "invalid" and "gas_price" in r.issues[0]


def test_big_week_on_week_jump_needs_review():
    r = validate(rec(kwh_price=0.45), previous={"kwh_price": 0.30, "gas_price": 1.50})
    assert r.status == "needs_review"
    assert any("moved 50%" in i for i in r.issues)


def test_missing_gas_needs_review():
    assert validate(rec(gas_price=None)).status == "needs_review"


# ---------- full pipeline with failures ---------------------------------------

def test_pipeline_success_and_failure(tmp_path):
    store = LocalStore(str(tmp_path))
    good = scrape_supplier(src(), store, lambda s: (FIX / "table_incl_tax.html").read_text())
    assert good.ok and len(good.records) == 2

    broken = scrape_supplier(src(), store, lambda s: (FIX / "layout_changed.html").read_text())
    assert not broken.ok and "no tariffs recognised" in broken.error

    def boom(_):
        raise TimeoutError("page took too long")
    down = scrape_supplier(src(), store, boom)
    assert not down.ok and "TimeoutError" in down.error

    # last good value is still what the app would read
    assert store.latest("TestCo", "variable")["kwh_price"] == 0.36122


def test_all_configured_suppliers_are_valid():
    assert {s.supplier for s in config.SUPPLIERS} == {
        "Essent", "Vattenfall", "Eneco", "Budget Energie", "Greenchoice", "Oxxio"}
    for s in config.SUPPLIERS:
        assert s.method in {"static", "rendered", "postcode", "pdf"}
        assert s.method != "pdf" or s.pdf_link
        assert s.price_column in {"first", "last"}
        assert s.url.startswith("https://")


# ---------- real supplier pages saved October 2026 ------------------------------

@pytest.mark.parametrize("name, fixture, expected", [
    # supplier, saved page, {contract_type: (kwh all-in, m3 all-in, elec fee/mo, gas fee/mo)}
    ("budgetenergie", "live_budget_2026_10.html", {
        "variable": (0.32865, 1.8158, 9.99, 9.99),
        "fixed_1y": (0.35285, 1.8279, 10.99, 10.99),
    }),
    ("eneco", "live_eneco_2026_10.html", {
        "variable": (0.36122, 1.84154, 10.99, 8.99),
        "fixed_1y": (0.31186, 1.74751, 10.99, 8.99),
    }),
    ("oxxio", "live_oxxio_2026_10.html", {
        "variable": (0.35666, 1.83745, 10.49, 8.49),
        "fixed_1y": (0.30861, 1.74589, 10.49, 8.49),
    }),
    ("essent", "live_essent_2026_10.html", {   # postcode-calculator results, one per contract
        "variable": (0.38668, 1.85216, 10.99, 7.99),
        "fixed_1y": (0.35376, 1.83234, 11.33, 7.99),
    }),
    ("greenchoice", "live_greenchoice_2026_10.html", {
        "variable": (0.26627, 1.47004, 10.59, 9.58),  # PDF fees are per day
    }),
])
def test_live_supplier_pages(name, fixture, expected):
    recs = by_type(parse_tariffs((FIX / fixture).read_text(), config.get_supplier(name)))
    assert set(recs) == set(expected)
    for ctype, (kwh, gas, fee_e, fee_g) in expected.items():
        r = validate(recs[ctype])
        assert (r.kwh_price, r.gas_price) == pytest.approx((kwh, gas))
        assert (r.fixed_fee_elec_month, r.fixed_fee_gas_month) == pytest.approx((fee_e, fee_g))
        assert r.status == "ok", r.issues
