"""Getting HTML: plain HTTP for static pages, Playwright for JS and postcode forms."""
from __future__ import annotations

import html
import os
import re
import urllib.robotparser
from urllib.parse import urljoin, urlparse

import requests

from . import config


class FetchError(RuntimeError):
    pass


def robots_allowed(url: str, user_agent: str = config.USER_AGENT) -> bool:
    """Respect robots.txt. If robots.txt can't be read, assume allowed (RFC 9309)."""
    parts = urlparse(url)
    rp = urllib.robotparser.RobotFileParser()
    try:
        resp = requests.get(
            f"{parts.scheme}://{parts.netloc}/robots.txt",
            headers={"User-Agent": user_agent},
            timeout=15,
        )
        if resp.status_code >= 400:
            return True
        rp.parse(resp.text.splitlines())
    except requests.RequestException:
        return True
    return rp.can_fetch(user_agent, url)


def fetch_static(url: str) -> str:
    resp = requests.get(
        url,
        headers={"User-Agent": config.USER_AGENT, "Accept-Language": "nl-NL,nl;q=0.9"},
        timeout=30,
    )
    if resp.status_code != 200:
        raise FetchError(f"HTTP {resp.status_code} for {url}")
    return resp.text


def _accept_cookies(page) -> None:
    for pattern in [r"accepteer|cookies accepteren|akkoord|alle cookies|accept all|toestaan"]:
        try:
            btn = page.get_by_role("button", name=re.compile(pattern, re.I)).first
            # banners often appear a few seconds after load; is_visible() doesn't wait
            btn.wait_for(state="visible", timeout=6000)
            if btn.is_visible():
                btn.click()
                page.wait_for_timeout(500)
                return
        except Exception:
            pass


def _fill_by_hint(page, hint: str, value: str) -> bool:
    rx = re.compile(hint, re.I)
    for locator in (page.get_by_label(rx), page.get_by_placeholder(rx)):
        try:
            loc = locator.first
            if loc.is_visible(timeout=3000):
                loc.fill(value)
                return True
        except Exception:
            continue
    # last resort: input whose name/id contains the hint
    try:
        loc = page.locator(f"input[name*='{hint.split('|')[0]}' i], input[id*='{hint.split('|')[0]}' i]").first
        if loc.is_visible(timeout=2000):
            loc.fill(value)
            return True
    except Exception:
        pass
    return False


ADDRESS_REJECTED_RE = re.compile(
    r"niet (worden )?(gevonden|herkend)|onbekend adres|huisnummer is ongeldig", re.I
)
# Contract-type headings the parser recognises (see parse.CONTRACT_PATTERNS)
VARIANT_HEADINGS = {"variable": "Variabel", "fixed_1y": "1 jaar vast", "fixed_3y": "3 jaar vast"}


def _wait_for_price(page) -> None:
    page.wait_for_function(
        "() => /€\\s*\\d[.,]\\d{2}/.test(document.body.innerText)", timeout=30000
    )
    page.wait_for_timeout(1500)


def _submit(page, source: config.SupplierSource) -> None:
    page.get_by_role("button", name=re.compile(source.submit_button, re.I)).first.click(timeout=10000)
    # wait until either prices or an "address not found" message shows up
    try:
        page.wait_for_function(
            "() => /€\\s*\\d[.,]\\d{2}|niet (worden )?(gevonden|herkend)|ongeldig/i.test(document.body.innerText)",
            timeout=30000,
        )
    except Exception:
        pass
    page.wait_for_timeout(1500)
    if ADDRESS_REJECTED_RE.search(page.inner_text("body")):
        raise FetchError(
            "supplier rejected the reference address: set REFERENCE_POSTCODE and "
            "REFERENCE_HOUSE_NUMBER to a real household address (see .env.example)"
        )


def _collect_variants(page, source: config.SupplierSource) -> str:
    """Submit the form once per contract type and keep only the text that appeared.

    Each result is put under a heading the parser maps to that contract type, so
    no CSS selectors are needed for the result block.
    """
    baseline = set(page.inner_text("body").splitlines())
    parts = []
    for ctype, choices in source.postcode_variants.items():
        for choice in choices:
            page.locator("label", has_text=re.compile(choice, re.I)).first.click(timeout=10000)
        _submit(page, source)
        _wait_for_price(page)
        new = [l.strip() for l in page.inner_text("body").splitlines()
               if l.strip() and l not in baseline]
        parts.append(f"<h2>{VARIANT_HEADINGS[ctype]}</h2>"
                     + "".join(f"<p>{html.escape(l)}</p>" for l in new))
    return "<html><body>" + "".join(parts) + "</body></html>"


def _redact(text: str, address: tuple[str, ...]) -> str:
    """Blank out the reference address so it never ends up in the debug-pages artifact."""
    for part in address:
        if part and len(part) >= 4:  # postcode; house numbers alone are too short to match safely
            text = re.sub(r"\s?".join(map(re.escape, part.replace(" ", ""))), "[address]", text, flags=re.I)
    return text


def _save_failure(page, source: config.SupplierSource, address: tuple[str, ...] = ()) -> None:
    """When a page breaks, keep what it looked like (uploaded as the debug-pages artifact).

    Pages that went through the address form get no screenshot: it would show the
    reference address, which must stay private.
    """
    if not os.getenv("SAVE_DEBUG_HTML"):
        return
    try:
        os.makedirs("debug", exist_ok=True)
        name = source.supplier.replace(" ", "_")
        if not address:
            page.screenshot(path=f"debug/{name}_FAILED.png", full_page=True)
        with open(f"debug/{name}_FAILED.html", "w") as f:
            f.write(_redact(page.content(), address))
    except Exception:
        pass


def fetch_rendered(source: config.SupplierSource, postcode_flow: bool = False) -> str:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as e:  # pragma: no cover
        raise FetchError("Playwright not installed") from e

    postcode = os.getenv("REFERENCE_POSTCODE") or config.REFERENCE_POSTCODE
    house_no = os.getenv("REFERENCE_HOUSE_NUMBER") or config.REFERENCE_HOUSE_NUMBER
    addition = os.getenv("REFERENCE_HOUSE_NUMBER_ADDITION", "")
    # also accept "12B" / "12-B" in REFERENCE_HOUSE_NUMBER
    m = re.fullmatch(r"\s*(\d+)\s*-?\s*([A-Za-z0-9]*)\s*", house_no)
    if m and m.group(2):
        house_no, addition = m.group(1), addition or m.group(2)
    address = (postcode, house_no, addition) if postcode_flow else ()
    launch_kwargs = {"headless": True}
    if os.getenv("CHROMIUM_PATH"):
        launch_kwargs["executable_path"] = os.environ["CHROMIUM_PATH"]

    with sync_playwright() as p:
        browser = p.chromium.launch(**launch_kwargs)
        page = browser.new_page(user_agent=config.USER_AGENT, locale="nl-NL")
        try:
            page.goto(source.url, wait_until="domcontentloaded", timeout=45000)
            _accept_cookies(page)
            if postcode_flow:
                if not _fill_by_hint(page, source.postcode_field, postcode):
                    raise FetchError("postcode field not found")
                _fill_by_hint(page, source.house_number_field, house_no)
                if addition and not _fill_by_hint(page, source.addition_field, addition):
                    raise FetchError("house number addition field not found")
                page.wait_for_timeout(800)  # some forms validate the address first
            if postcode_flow and source.postcode_variants:
                html = _collect_variants(page, source)
            else:
                if postcode_flow:
                    _submit(page, source)
                _wait_for_price(page)
                html = page.content()
            if os.getenv("SAVE_DEBUG_HTML"):
                os.makedirs("debug", exist_ok=True)
                with open(f"debug/{source.supplier.replace(' ', '_')}.html", "w") as f:
                    f.write(_redact(html, address))
                if not postcode_flow:  # a screenshot would show the reference address
                    page.screenshot(path=f"debug/{source.supplier.replace(' ', '_')}.png", full_page=True)
            return html
        except Exception as e:
            _save_failure(page, source, address)
            if isinstance(e, FetchError):
                raise
            raise FetchError(f"{type(e).__name__}: {str(e)[:200]}") from e
        finally:
            browser.close()


def pdf_to_html(data: bytes) -> str:
    """PDF text, one <p> per line, so the normal HTML parser can read it."""
    from io import BytesIO

    from pypdf import PdfReader

    lines = []
    for page in PdfReader(BytesIO(data)).pages:
        lines += (page.extract_text() or "").splitlines()
    return "<html><body>" + "".join(f"<p>{html.escape(l)}</p>" for l in lines) + "</body></html>"


def fetch_pdf(source: config.SupplierSource) -> str:
    """Find the tariff PDF linked from the page (its filename changes with each price update)."""
    page = fetch_static(source.url)
    rx = re.compile(source.pdf_link or r"\.pdf", re.I)
    hrefs = [m for m in re.findall(r'href="([^"]+)"', page) if rx.search(m)]
    if not hrefs:
        page = fetch_rendered(source)
        hrefs = [m for m in re.findall(r'href="([^"]+)"', page) if rx.search(m)]
    if not hrefs:
        raise FetchError(f"no PDF link matching {rx.pattern} on {source.url}")
    pdf_url = urljoin(source.url, html.unescape(hrefs[0]))
    if not robots_allowed(pdf_url):
        raise FetchError(f"robots.txt disallows {pdf_url}")
    resp = requests.get(pdf_url, headers={"User-Agent": config.USER_AGENT}, timeout=30)
    if resp.status_code != 200:
        raise FetchError(f"HTTP {resp.status_code} for {pdf_url}")
    out = pdf_to_html(resp.content)
    if os.getenv("SAVE_DEBUG_HTML"):
        os.makedirs("debug", exist_ok=True)
        with open(f"debug/{source.supplier.replace(' ', '_')}.html", "w") as f:
            f.write(out)
    return out


def fetch_html(source: config.SupplierSource) -> str:
    if not robots_allowed(source.url):
        raise FetchError(f"robots.txt disallows {source.url}")
    if source.method == "static":
        return fetch_static(source.url)
    if source.method == "rendered":
        return fetch_rendered(source)
    if source.method == "postcode":
        return fetch_rendered(source, postcode_flow=True)
    if source.method == "pdf":
        return fetch_pdf(source)
    raise FetchError(f"unknown method {source.method}")
