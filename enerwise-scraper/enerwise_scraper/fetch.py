"""Getting HTML: plain HTTP for static pages, Playwright for JS and postcode forms."""
from __future__ import annotations

import os
import re
import urllib.robotparser
from urllib.parse import urlparse

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
    for pattern in [r"accepteer|akkoord|alle cookies|accept all|toestaan"]:
        try:
            btn = page.get_by_role("button", name=re.compile(pattern, re.I)).first
            if btn.is_visible(timeout=2000):
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


def fetch_rendered(source: config.SupplierSource, postcode_flow: bool = False) -> str:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as e:  # pragma: no cover
        raise FetchError("Playwright not installed") from e

    postcode = os.getenv("REFERENCE_POSTCODE", config.REFERENCE_POSTCODE)
    house_no = os.getenv("REFERENCE_HOUSE_NUMBER", config.REFERENCE_HOUSE_NUMBER)
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
                page.wait_for_timeout(800)  # some forms validate the address first
                btn = page.get_by_role("button", name=re.compile(source.submit_button, re.I)).first
                btn.click(timeout=10000)
            # wait until a euro price is on the page
            page.wait_for_function(
                "() => /€\\s*\\d[.,]\\d{2}/.test(document.body.innerText)", timeout=30000
            )
            page.wait_for_timeout(1500)
            html = page.content()
            if os.getenv("SAVE_DEBUG_HTML"):
                os.makedirs("debug", exist_ok=True)
                with open(f"debug/{source.supplier.replace(' ', '_')}.html", "w") as f:
                    f.write(html)
                page.screenshot(path=f"debug/{source.supplier.replace(' ', '_')}.png", full_page=True)
            return html
        except FetchError:
            raise
        except Exception as e:
            raise FetchError(f"{type(e).__name__}: {str(e)[:200]}") from e
        finally:
            browser.close()


def fetch_html(source: config.SupplierSource) -> str:
    if not robots_allowed(source.url):
        raise FetchError(f"robots.txt disallows {source.url}")
    if source.method == "static":
        return fetch_static(source.url)
    if source.method == "rendered":
        return fetch_rendered(source)
    if source.method == "postcode":
        return fetch_rendered(source, postcode_flow=True)
    raise FetchError(f"unknown method {source.method}")
