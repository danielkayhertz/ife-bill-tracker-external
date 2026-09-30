import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))
import validate_campaigns as vc  # noqa: E402

BILLS = [
    {"billNumber": "HB5234", "type": "Endorsed"},
    {"billNumber": "SB0062", "type": "Endorsed"},
    {"billNumber": "HB9999", "type": "Watching"},
]


def test_norm():
    assert vc.norm("SB0062") == "SB62"
    assert vc.norm(" sb 62 ") == "SB62"
    assert vc.norm("junk") is None


def test_clean_campaigns_have_no_warnings():
    camps = [{"id": "a", "bills": ["HB5234"]}, {"id": "b", "bills": ["SB62"]}]
    assert vc.check(BILLS, camps) == []


def test_warns_on_unknown_duplicate_and_uncovered():
    camps = [{"id": "a", "bills": ["HB5234", "HB1"]}, {"id": "b", "bills": ["hb5234"]}]
    w = vc.check(BILLS, camps)
    assert any("HB1" in x and "not in" in x for x in w)
    assert any("two campaigns" in x for x in w)
    assert any("SB0062" in x and "no campaign" in x for x in w)
    assert not any("HB9999" in x for x in w)
