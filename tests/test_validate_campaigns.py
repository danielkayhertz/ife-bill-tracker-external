import json
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


def test_non_dict_campaign_entry_warns_instead_of_crashing():
    camps = [{"id": "a", "bills": ["HB5234"]}, "not-a-dict", 123, None, ["also", "not", "a", "dict"]]
    w = vc.check(BILLS, camps)
    assert any("not an object" in x for x in w)
    # the well-formed entry is still processed
    assert not any("HB5234" in x and "no campaign" in x for x in w)


def test_non_dict_bill_entry_warns_instead_of_crashing():
    bills = BILLS + ["not-a-dict", None]
    w = vc.check(bills, [{"id": "a", "bills": ["HB5234"]}])
    assert any("not an object" in x for x in w)


def test_main_survives_malformed_campaigns_json(tmp_path, capsys):
    (tmp_path / "bills.json").write_text(json.dumps(BILLS), encoding="utf-8")
    (tmp_path / "user-bills.json").write_text("[]", encoding="utf-8")
    (tmp_path / "campaigns.json").write_text("{not valid json!!", encoding="utf-8")
    rc = vc.main(str(tmp_path))
    assert rc == 0
    out = capsys.readouterr().out
    assert "::warning::" in out


def test_main_survives_non_dict_campaign_entries(tmp_path, capsys):
    (tmp_path / "bills.json").write_text(json.dumps(BILLS), encoding="utf-8")
    (tmp_path / "user-bills.json").write_text("[]", encoding="utf-8")
    (tmp_path / "campaigns.json").write_text(
        json.dumps(["oops", {"id": "a", "bills": ["HB5234"]}]), encoding="utf-8")
    rc = vc.main(str(tmp_path))
    assert rc == 0
    out = capsys.readouterr().out
    assert "Campaign check:" in out
