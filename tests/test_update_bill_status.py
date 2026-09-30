import ssl
import sys
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))
import update_bill_status as ubs  # noqa: E402

ILGA_URL = "https://www.ilga.gov/ftp/legislation/104/BillStatus/XML/10400HB5234.xml"


def _get(ctx):
    req = urllib.request.Request(ILGA_URL, headers={"User-Agent": ubs.USER_AGENT})
    with urllib.request.urlopen(req, timeout=20, context=ctx) as r:
        return r.status, r.read()


def test_build_ssl_context_verifies_ilga_without_os_help():
    """certifi-only trust store = what the Linux runner has (no AIA fetching)."""
    certifi = pytest.importorskip("certifi")
    ctx = ubs.build_ssl_context(cafile=certifi.where())
    try:
        status, body = _get(ctx)
    except urllib.error.URLError as e:
        if isinstance(e.reason, ssl.SSLError):
            raise
        pytest.skip(f"network unavailable: {e}")
    assert status == 200
    assert ET.fromstring(body).find("lastaction") is not None


BILL = {"billNumber": "HB1", "stage": "In House Committee", "lastAction": "x",
        "ilgaFetchedAt": "2026-09-30T00:00:00Z"}
NOW = datetime(2026, 9, 30, 12, 0, tzinfo=timezone.utc)


def test_should_write_false_when_only_fetch_time_changed_recently():
    new = [{**BILL, "ilgaFetchedAt": "2026-09-30T12:00:00Z"}]
    assert ubs.should_write([BILL], new, NOW) is False


def test_should_write_true_when_ilga_data_changed():
    new = [{**BILL, "lastAction": "y", "ilgaFetchedAt": "2026-09-30T12:00:00Z"}]
    assert ubs.should_write([BILL], new, NOW) is True


def test_should_write_true_for_daily_heartbeat():
    old = [{**BILL, "ilgaFetchedAt": "2026-09-29T10:00:00Z"}]  # 26h old
    new = [{**BILL, "ilgaFetchedAt": "2026-09-30T12:00:00Z"}]
    assert ubs.should_write(old, new, NOW) is True


def test_should_write_true_when_no_previous_fetch_time():
    old = [{k: v for k, v in BILL.items() if k != "ilgaFetchedAt"}]
    assert ubs.should_write(old, [BILL], NOW) is True
