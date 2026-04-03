#!/usr/bin/env python3
"""Update bill status from ILGA.gov FTP XML files.

External version: reads bills from data/bills.json instead of a hardcoded
BILLS constant. Updates only ILGA-derived fields; preserves all other fields.

Run from ife-bill-tracker-external/ directory:
    python scripts/update_bill_status.py
"""

import json
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

ILGA_FTP_BASE = "https://www.ilga.gov/ftp/legislation/104/BillStatus/XML/10400"

# Fields that come from ILGA XML — all others are preserved unchanged
ILGA_FIELDS = {
    "stage", "primarySponsor", "lastAction", "lastActionDate",
    "nextActionDate", "nextActionType", "stageChangedAt", "ilgaFetchedAt",
    "lastAmendmentName", "lastAmendmentDate", "isShellBill",
}


def parse_bill_number(bill_number):
    """Parse 'HB3466' → ('HB', '3466')."""
    m = re.match(r'^([A-Z]+)(\d+)$', bill_number)
    if not m:
        raise ValueError(f"Cannot parse bill number: {bill_number}")
    return m.group(1), m.group(2)


def get_xml_url(bill_number):
    """Build ILGA FTP XML URL. DocNum is zero-padded to 4 digits."""
    doc_type, doc_num = parse_bill_number(bill_number)
    padded = doc_num.zfill(4)
    return f"{ILGA_FTP_BASE}{doc_type}{padded}.xml"


def fetch_xml(url):
    """Fetch URL; return bytes or None on error."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "IFE-BillTracker/1.0"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.read()
    except Exception as e:
        print(f"    WARNING: fetch failed for {url}: {e}", file=sys.stderr)
        return None


def get_last_action_fields(root):
    """Extract lastAction text, date, and chamber from <lastaction> element."""
    la_el = root.find("lastaction")
    if la_el is None:
        return "", "", ""
    action_el  = la_el.find("action")
    date_el    = la_el.find("statusdate")
    chamber_el = la_el.find("chamber")
    last_action         = (action_el.text  or "").strip() if action_el  is not None else ""
    last_action_date    = (date_el.text    or "").strip() if date_el    is not None else ""
    last_action_chamber = (chamber_el.text or "").strip() if chamber_el is not None else ""
    return last_action, last_action_date, last_action_chamber


def _parse_action_date(date_str):
    """Parse M/D/YYYY date string to (year, month, day) tuple for comparison."""
    if not date_str:
        return None
    parts = date_str.split("/")
    if len(parts) != 3:
        return None
    try:
        m, d, y = int(parts[0]), int(parts[1]), int(parts[2])
        return (y, m, d)
    except ValueError:
        return None


def get_latest_action_from_history(root):
    """Walk <actions> siblings and return the most recent substantive action."""
    actions_el = root.find("actions")
    if actions_el is None:
        return "", "", ""

    SKIP_PREFIXES = (
        "added as ", "removed as ", "alternate",
        "added co-sponsor", "removed co-sponsor",
        "added chief co-sponsor", "removed chief co-sponsor",
        "added alternate", "removed alternate",
        "rule 19(a)",
        "fiscal note", "home rule note", "state mandates note",
        "pension note", "balanced budget note", "judicial note",
    )

    current_date    = ""
    current_chamber = ""
    latest_action   = ""
    latest_date     = ""
    latest_chamber  = ""
    latest_parsed   = None

    for child in actions_el:
        tag = child.tag.lower()
        if tag == "statusdate":
            current_date = (child.text or "").strip()
        elif tag == "chamber":
            current_chamber = (child.text or "").strip()
        elif tag == "action":
            text = (child.text or "").strip()
            if not text:
                continue
            if any(text.lower().startswith(p) for p in SKIP_PREFIXES):
                continue
            parsed = _parse_action_date(current_date)
            if parsed is not None and (latest_parsed is None or parsed >= latest_parsed):
                latest_action  = text
                latest_date    = current_date
                latest_chamber = current_chamber
                latest_parsed  = parsed

    return latest_action, latest_date, latest_chamber


def get_primary_sponsor(root):
    """Extract the chief sponsor name from <sponsor><sponsors> text."""
    sponsor_el = root.find("sponsor")
    if sponsor_el is None:
        return ""
    sponsors_el = sponsor_el.find("sponsors")
    if sponsors_el is None or not sponsors_el.text:
        return ""
    first = re.split(r'-|,|\s+and\s+', sponsors_el.text.strip())[0].strip()
    return first


def get_action_texts(root):
    """Collect all (action_text, chamber) tuples from the flat children of <actions>."""
    entries = []
    actions_el = root.find("actions")
    if actions_el is not None:
        current_chamber = ""
        for child in actions_el:
            tag = child.tag.lower()
            if tag == "chamber":
                current_chamber = (child.text or "").strip().lower()
            elif tag == "action" and child.text:
                entries.append((child.text.strip().lower(), current_chamber))
    return entries


MONTH_MAP = {'Jan':'1','Feb':'2','Mar':'3','Apr':'4','May':'5','Jun':'6',
             'Jul':'7','Aug':'8','Sep':'9','Oct':'10','Nov':'11','Dec':'12'}

def get_next_action(root):
    """Parse next scheduled action from <nextaction> or <committeehearing>."""
    na = root.find("nextaction")
    if na is not None:
        date_el   = na.find("statusdate")
        action_el = na.find("action")
        if date_el is not None and date_el.text:
            date_str   = date_el.text.strip()
            action_str = (action_el.text or "").strip() if action_el is not None else ""
            return date_str, action_str
    ch = root.find("committeehearing")
    if ch is not None and ch.text:
        raw = ch.text.strip()
        m = re.search(r'\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\s+(\d{4})\b', raw)
        if m:
            date_str   = f"{MONTH_MAP[m.group(1)]}/{m.group(2)}/{m.group(3)}"
            action_str = raw[:m.start()].strip() or ""
            return date_str, action_str
    return "", ""


def get_amendments(root):
    """Return (last_amendment_name, last_amendment_date, is_shell_bill)."""
    synopsis_el = root.find("synopsis")
    last_name = None
    is_shell  = False

    if synopsis_el is not None:
        current_title = None
        for child in synopsis_el:
            if child.tag == "synopsistitle":
                t = (child.text or "").strip()
                if t:
                    current_title = t
            elif child.tag == "SynopsisText" and current_title:
                text = (child.text or "").strip()
                last_name = current_title
                if text.startswith("Replaces everything after the enacting clause"):
                    is_shell = True
                current_title = None

    last_date = _find_amendment_date(root, last_name) if last_name else None
    return last_name or None, last_date or None, is_shell


def _find_amendment_date(root, amendment_name):
    """Return date of the first action entry mentioning amendment_name."""
    actions_el = root.find("actions")
    if actions_el is None:
        return None
    current_date = None
    for child in actions_el:
        if child.tag == "statusdate":
            current_date = (child.text or "").strip()
        elif child.tag == "action" and amendment_name:
            if amendment_name.strip() in (child.text or ""):
                return current_date
    return None


def classify_action(action_text, chamber="", doc_type=""):
    """Return stage string if action_text is stage-relevant, else None."""
    la = action_text.lower()
    chamber = chamber.lower()

    if "approved by governor" in la or "public act" in la:
        return "Signed into Law"
    if "sent to the governor" in la or "to the governor" in la:
        return "Awaiting Governor Signature"
    if "passed both" in la or "enrolled" in la:
        return "Enrolled"
    if "passed senate" in la:
        return "Passed Senate"
    if "passed house" in la:
        return "Passed House"
    if any(k in la for k in ["vetoed", "failed", "did not pass", "tabled", "withdrawn"]):
        return "Failed"

    if re.search(r'\bpassed\s+\d{3}-\d{3}-\d{3}\b', la):
        if chamber == "house":
            return "Passed House"
        elif chamber == "senate":
            return "Passed Senate"

    FLOOR_SIGNALS = (
        "placed on calendar order of 2nd reading",
        "placed on calendar order of 3rd reading",
        "placed on calendar 2nd reading",
        "placed on calendar 3rd reading",
        "second reading",
        "third reading",
        "do pass",
        "approved for consideration",
        "recalled from committee",
    )
    if any(s in la for s in FLOOR_SIGNALS):
        if chamber == "house":
            return "Passed House Committee"
        elif chamber == "senate":
            return "Passed Senate Committee"

    if chamber == "senate" and doc_type == "HB":
        return "In Senate Committee"
    if chamber == "house" and doc_type == "SB":
        return "In House Committee"

    if "arrive in senate" in la:
        return "In Senate Committee"
    if "arrive in house" in la:
        return "In House Committee"

    return None


def map_stage(last_action, action_history, doc_type, last_action_chamber=""):
    """Map last action + action history to a stage label.

    action_history is a list of (text, chamber) tuples from get_action_texts().
    """
    # Try lastAction first
    stage = classify_action(last_action, last_action_chamber, doc_type)
    if stage is not None:
        return stage

    # Walk action history in reverse to find most recent stage-relevant action
    for action_text, action_chamber in reversed(action_history):
        stage = classify_action(action_text, action_chamber, doc_type)
        if stage is not None:
            return stage

    # Ultimate fallback
    return "In House Committee" if doc_type == "HB" else "In Senate Committee"


def _ilga_fields_from_xml(xml_bytes, bill_number, prev_stage, prev_stage_changed_at, fetched_at):
    """Parse XML bytes and return computed ILGA fields dict, or None on error."""
    doc_type, _ = parse_bill_number(bill_number)
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError as e:
        print(f"    WARNING: XML parse error for {bill_number}: {e}", file=sys.stderr)
        return None

    last_action, last_action_date, last_action_chamber = get_last_action_fields(root)

    hist_action, hist_date, hist_chamber = get_latest_action_from_history(root)
    if hist_date and last_action_date:
        if _parse_action_date(hist_date) > _parse_action_date(last_action_date):
            # Only substitute if the history action maps to a real stage
            if classify_action(hist_action, hist_chamber, doc_type) is not None:
                last_action         = hist_action
                last_action_date    = hist_date
                last_action_chamber = hist_chamber

    action_history  = get_action_texts(root)
    primary_sponsor = get_primary_sponsor(root)
    new_stage       = map_stage(last_action, action_history, doc_type, last_action_chamber)
    next_action_date, next_action_type = get_next_action(root)
    last_amendment_name, last_amendment_date, is_shell_bill = get_amendments(root)

    if new_stage != prev_stage:
        stage_changed_at = fetched_at
    else:
        stage_changed_at = prev_stage_changed_at or fetched_at

    print(f"    stage={new_stage}  sponsor={primary_sponsor}  lastAction={last_action[:60]}")

    return {
        "stage":             new_stage,
        "primarySponsor":    primary_sponsor,
        "lastAction":        last_action,
        "lastActionDate":    last_action_date,
        "ilgaFetchedAt":     fetched_at,
        "stageChangedAt":    stage_changed_at,
        "nextActionDate":    next_action_date or None,
        "nextActionType":    next_action_type or None,
        "lastAmendmentName": last_amendment_name,
        "lastAmendmentDate": last_amendment_date,
        "isShellBill":       is_shell_bill,
    }


def update_bill(bill, fetched_at):
    """Fetch ILGA XML and return updated bill dict (ILGA fields only overwritten).

    Preserves all non-ILGA fields. Returns None if fetch/parse fails.
    """
    bill_number = bill["billNumber"]
    url = get_xml_url(bill_number)
    print(f"  {bill_number} -> {url}")

    prev_stage = bill.get("stage")
    prev_sca   = bill.get("stageChangedAt")

    xml_bytes = fetch_xml(url)
    if xml_bytes is None:
        return None

    fields = _ilga_fields_from_xml(xml_bytes, bill_number, prev_stage, prev_sca, fetched_at)
    if fields is None:
        return None

    return {**bill, **fields}


def main():
    repo_root       = Path(__file__).parent.parent
    bills_path      = repo_root / "data" / "bills.json"
    user_bills_path = repo_root / "data" / "user-bills.json"

    if not bills_path.exists():
        print(f"ERROR: {bills_path} not found", file=sys.stderr)
        sys.exit(1)

    with open(bills_path, encoding="utf-8") as f:
        bills = json.load(f)

    print(f"Updating {len(bills)} bills from {bills_path}\n")
    fetched_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    results = []
    succeeded = 0
    changed = 0

    for bill in bills:
        updated = update_bill(bill, fetched_at)
        if updated is None:
            print(f"    WARNING: {bill['billNumber']} failed — keeping previous values", file=sys.stderr)
            results.append(bill)
        else:
            results.append(updated)
            succeeded += 1
            if updated.get("stage") != bill.get("stage") or updated.get("lastAction") != bill.get("lastAction"):
                changed += 1

    print(f"\nDone. {succeeded}/{len(bills)} succeeded. {changed} bill(s) changed.")

    if succeeded == 0:
        print("ERROR: All bill fetches failed — not writing output.", file=sys.stderr)
        sys.exit(1)

    with open(bills_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    print(f"Written to {bills_path}")

    # ── Refresh user-added bills ──────────────────────────────────────────────
    if not user_bills_path.exists():
        return
    with open(user_bills_path, encoding="utf-8") as f:
        try:
            user_bills = json.load(f)
        except Exception:
            user_bills = []

    if not user_bills:
        print("\nNo user-added bills to refresh.")
        return

    print(f"\nRefreshing {len(user_bills)} user-added bill(s) -> {user_bills_path}")
    updated_user = []
    for bill in user_bills:
        updated = update_bill(bill, fetched_at)
        updated_user.append(updated if updated is not None else bill)

    with open(user_bills_path, "w", encoding="utf-8") as f:
        json.dump(updated_user, f, indent=2, ensure_ascii=False)
    print(f"Done. Refreshed {len(updated_user)} user-added bill(s).")


if __name__ == "__main__":
    main()
