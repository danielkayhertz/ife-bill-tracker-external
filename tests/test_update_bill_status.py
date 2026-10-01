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


# --- legislative steps (fixtures are real ILGA XML, fetched 2026-10-01) ---

FIXTURES = Path(__file__).parent / "fixtures" / "ilga"


def _steps(bill):
    root = ET.fromstring((FIXTURES / f"{bill}.xml").read_bytes())
    return ubs.get_steps(root)


def test_steps_bill_that_never_left_committee():
    assert _steps("HB5287") == {"houseCommittee": None, "house": None, "senateCommittee": None, "senate": None}
    assert _steps("SB3084") == {"houseCommittee": None, "house": None, "senateCommittee": None, "senate": None}


def test_steps_passed_committee_only():
    assert _steps("HB5256") == {"houseCommittee": "3/26/2026", "house": None, "senateCommittee": None, "senate": None}


def test_steps_passed_origin_chamber_then_stuck_in_second_committee():
    assert _steps("HB5198") == {"houseCommittee": "3/25/2026", "house": "4/15/2026", "senateCommittee": None, "senate": None}


def test_steps_passed_both_chambers_awaiting_concurrence():
    # The Senate skipped committee (Assignments approved it straight for consideration);
    # reaching 2nd reading still counts as out of committee.
    assert _steps("HB4377") == {"houseCommittee": "3/25/2026", "house": "4/14/2026",
                                "senateCommittee": "5/30/2026", "senate": "5/31/2026"}


def test_steps_senate_bill_that_became_law():
    assert _steps("SB3777") == {"houseCommittee": "5/27/2026", "house": "6/1/2026",
                                "senateCommittee": "5/6/2026", "senate": "5/20/2026"}


def test_steps_house_bill_that_became_law():
    assert _steps("HB5234") == {"houseCommittee": "3/25/2026", "house": "4/9/2026",
                                "senateCommittee": "4/30/2026", "senate": "5/30/2026"}


def _root(actions):
    xml = "<xml><actions>" + "".join(
        f"<statusdate>{d}</statusdate><chamber>{c}</chamber><action>{a}</action>" for d, c, a in actions
    ) + "</actions></xml>"
    return ET.fromstring(xml)


def test_steps_arrival_in_second_chamber_implies_origin_floor_passed():
    s = ubs.get_steps(_root([("3/1/2026", "House", "Do Pass / Short Debate Housing Committee;  010-000-000"),
                             ("4/2/2026", "Senate", "Arrive in Senate")]))
    assert s["house"] == "4/2/2026" and s["houseCommittee"] == "3/1/2026" and s["senate"] is None


def test_steps_amendment_recommendation_and_failed_vote_do_not_count():
    s = ubs.get_steps(_root([("3/1/2026", "House", "House Floor Amendment No. 1 Recommends Be Adopted Housing Committee;  008-004-000"),
                             ("3/2/2026", "House", "Third Reading - Short Debate - Lost 040-070-000")]))
    assert s == {"houseCommittee": None, "house": None, "senateCommittee": None, "senate": None}


def test_steps_floor_pass_implies_committee_passed():
    s = ubs.get_steps(_root([("3/2/2026", "Senate", "Third Reading - Passed; 050-000-000")]))
    assert s["senateCommittee"] == "3/2/2026" and s["senate"] == "3/2/2026"


def test_steps_included_in_ilga_fields():
    xml = (FIXTURES / "HB5198.xml").read_bytes()
    fields = ubs._ilga_fields_from_xml(xml, "HB5198", None, None, "2026-10-01T00:00:00Z")
    assert fields["steps"]["house"] == "4/15/2026"
