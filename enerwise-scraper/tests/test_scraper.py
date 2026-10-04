from pathlib import Path

import pytest

from enerwise_scraper import config
from enerwise_scraper.models import TariffRecord
from enerwise_scraper.parse import parse_tariffs
from enerwise_scraper.run import scrape_supplier
from enerwise_scraper.store import LocalStore
from enerwise_scraper.validate import cross_check, last_variable_change_date, validate

FIX = Path(__file__).parent / "fixtures"
SCRAPED_AT = "2026-10-04T12:00:00+00:00"   # when the live_* fixtures were saved


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
        recs[ctype].scraped_at = SCRAPED_AT
        r = validate(recs[ctype])
        assert (r.kwh_price, r.gas_price) == pytest.approx((kwh, gas))
        assert (r.fixed_fee_elec_month, r.fixed_fee_gas_month) == pytest.approx((fee_e, fee_g))
        if name == "greenchoice":
            # PDF says "Tarieven geldig per 18-05-2026": older than the 1 Oct change date
            assert r.valid_from == "2026-05-18"
            assert r.status == "needs_review" and "2026-10-01" in "; ".join(r.issues)
        else:
            assert r.status == "ok", r.issues


@pytest.mark.parametrize("name, fixture, expected", [
    # {contract_type: (feed-in cost, feed-in compensation)} in EUR/kWh, positive numbers
    ("eneco", "live_eneco_2026_10.html", {"variable": (0.04216, 0.10355), "fixed_1y": (0.04216, 0.0835)}),
    ("oxxio", "live_oxxio_2026_10.html", {"variable": (0.04216, 0.10179), "fixed_1y": (0.04216, 0.0824)}),
    ("budgetenergie", "live_budget_2026_10.html", {"variable": (0.0875, 0.09), "fixed_1y": (0.08058, 0.1)}),
    ("greenchoice", "live_greenchoice_2026_10.html", {"variable": (0.13099, 0.141)}),
    ("essent", "live_essent_2026_10.html", {"variable": (0.13, 0.15), "fixed_1y": (0.13, 0.15)}),
])
def test_live_feed_in_rates(name, fixture, expected):
    """Rates 'vanaf 1 januari 2027' win over rates that only apply until then."""
    recs = by_type(parse_tariffs((FIX / fixture).read_text(), config.get_supplier(name)))
    for ctype, (cost, comp) in expected.items():
        r = recs[ctype]
        assert (r.feed_in_cost_per_kwh, r.feed_in_compensation_per_kwh) == pytest.approx((cost, comp))



# ---------- feed-in period, sheet dates, cross-supplier check -----------------

LIVE = [("eneco", "live_eneco"), ("budgetenergie", "live_budget"), ("greenchoice", "live_greenchoice"),
        ("oxxio", "live_oxxio"), ("essent", "live_essent")]


def live_run():
    """All saved live pages parsed + validated + cross-checked, like one weekly run."""
    records = []
    for name, f in LIVE:
        for r in parse_tariffs((FIX / f"{f}_2026_10.html").read_text(), config.get_supplier(name)):
            r.scraped_at = SCRAPED_AT
            records.append(validate(r))
    return cross_check(records)


@pytest.mark.parametrize("name, fixture, period", [
    ("eneco", "live_eneco", "2027"),        # rows "vanaf 1 januari 2027"
    ("oxxio", "live_oxxio", "2027"),
    ("budgetenergie", "live_budget", "2026"),   # surplus-only compensation, no 2027 rates
    ("greenchoice", "live_greenchoice", "2026"),
    ("essent", "live_essent", "2026"),          # "t/m 31-12-2026", "Tot 1 januari 2027 salderen"
])
def test_feed_in_period(name, fixture, period):
    recs = parse_tariffs((FIX / f"{fixture}_2026_10.html").read_text(), config.get_supplier(name))
    assert {r.feed_in_period for r in recs} == {period}


def test_last_variable_change_date():
    from datetime import date
    assert last_variable_change_date(date(2026, 10, 4)) == date(2026, 10, 1)
    assert last_variable_change_date(date(2026, 9, 30)) == date(2026, 7, 1)
    assert last_variable_change_date(date(2027, 1, 1)) == date(2027, 1, 1)


def test_every_published_price_is_within_20pct_of_the_market_or_explained():
    """Fails if any kWh/gas price that would reach the app sits more than 20% from the
    median of the other suppliers without being held for review with a reason."""
    records = live_run()
    ok = [r for r in records if r.status == "ok"]
    for rec in records:
        for field in ("kwh_price", "gas_price"):
            others = [getattr(o, field) for o in ok if o.supplier != rec.supplier]
            from statistics import median
            dev = abs(getattr(rec, field) - median(others)) / median(others)
            if dev > config.MAX_DEVIATION_FROM_MARKET:
                assert rec.status != "ok", f"{rec.supplier} {rec.contract_type} {field} off by {dev:.0%}"
                assert any("median" in i or "tariff sheet" in i for i in rec.issues), rec.issues


def test_cross_check_flags_greenchoice_kwh():
    gc = [r for r in live_run() if r.supplier == "Greenchoice"][0]
    assert gc.status == "needs_review"
    assert any(i.startswith("kwh_price=0.26627 is -2") for i in gc.issues), gc.issues


def test_cross_check_needs_three_other_suppliers():
    recs = [TariffRecord(supplier=s, contract_type="variable", kwh_price=p, gas_price=1.8,
                         price_basis_detected="incl_tax") for s, p in (("A", 0.30), ("B", 0.50))]
    cross_check([validate(r) for r in recs])
    assert all(r.status == "ok" for r in recs)
