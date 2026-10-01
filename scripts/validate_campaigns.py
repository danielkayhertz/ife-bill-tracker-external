#!/usr/bin/env python3
"""Warn about gaps between data/campaigns.json and the bill lists.

Never fails the build: the page shows uncovered Endorsed/Sponsored bills as
single-bill campaigns under their ILGA titles, so a gap is cosmetic.
Run from the repo root: python scripts/validate_campaigns.py
"""

import json
import re
import sys
from pathlib import Path


def norm(n):
    m = re.match(r"^([A-Z]+)0*(\d+)$", re.sub(r"\s+", "", str(n or "")).upper())
    return m.group(1) + m.group(2) if m else None


def check(bills, campaigns):
    warnings, owner = [], {}
    known = {}
    for b in bills:
        if not isinstance(b, dict):
            warnings.append(f"bill entry is not an object: {b!r}")
            continue
        known[norm(b.get("billNumber"))] = b
    for c in campaigns:
        if not isinstance(c, dict):
            warnings.append(f"campaign entry is not an object: {c!r}")
            continue
        for n in c.get("bills", []):
            k = norm(n)
            if k not in known:
                warnings.append(f"campaign {c.get('id')}: bill {n} is not in bills.json or user-bills.json")
            elif k in owner:
                warnings.append(f"bill {n} is in two campaigns: {owner[k]} and {c.get('id')}")
            else:
                owner[k] = c.get("id")
    for k, b in known.items():
        if b.get("type") in ("Endorsed", "Sponsored") and k not in owner:
            warnings.append(f"{b['type']} bill {b['billNumber']} has no campaign; "
                            "the page will show it under its ILGA title")
    return warnings


def _load(path, default):
    """Read JSON at `path`, or return `default` if the file is missing or unparseable.

    A malformed data/*.json (bad JSON, or shaped wrong — e.g. not a list) must never crash this
    script: that would fail the "Check campaigns" Action step and skip "Commit if changed",
    freezing bills.json even though the ILGA fetch succeeded.
    """
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError, OSError) as e:
        print(f"::warning::{path.name} is unreadable or not valid JSON ({e}); treating as {default!r}")
        return default


def main(data_dir=None):
    """Never raises and never returns non-zero: a validation problem is a warning, not a build
    failure (see module docstring). `data_dir` is overridable for tests; defaults to ../data."""
    try:
        data = Path(data_dir) if data_dir else (Path(__file__).parent.parent / "data")
        bills_raw = _load(data / "bills.json", [])
        user_bills_raw = _load(data / "user-bills.json", [])
        bills = (bills_raw if isinstance(bills_raw, list) else []) \
            + (user_bills_raw if isinstance(user_bills_raw, list) else [])
        campaigns_raw = _load(data / "campaigns.json", [])
        campaigns = campaigns_raw if isinstance(campaigns_raw, list) else []
        warnings = check(bills, campaigns)
        for w in warnings:
            print(f"::warning::{w}")
        print(f"Campaign check: {len(warnings)} warning(s).")
    except Exception as e:  # belt-and-braces: this script must never fail the build
        print(f"::warning::validate_campaigns.py failed unexpectedly: {e}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
