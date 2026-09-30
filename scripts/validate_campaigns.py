#!/usr/bin/env python3
"""Warn about gaps between data/campaigns.json and the bill lists.

Never fails the build: the page shows uncovered Endorsed/Sponsored bills as
single-bill campaigns under their ILGA titles, so a gap is cosmetic.
Run from the repo root: python scripts/validate_campaigns.py
"""

import json
import re
from pathlib import Path


def norm(n):
    m = re.match(r"^([A-Z]+)0*(\d+)$", re.sub(r"\s+", "", str(n or "")).upper())
    return m.group(1) + m.group(2) if m else None


def check(bills, campaigns):
    warnings, owner = [], {}
    known = {norm(b.get("billNumber")): b for b in bills}
    for c in campaigns:
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
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def main():
    data = Path(__file__).parent.parent / "data"
    bills = _load(data / "bills.json", []) + _load(data / "user-bills.json", [])
    warnings = check(bills, _load(data / "campaigns.json", []))
    for w in warnings:
        print(f"::warning::{w}")
    print(f"Campaign check: {len(warnings)} warning(s).")


if __name__ == "__main__":
    main()
