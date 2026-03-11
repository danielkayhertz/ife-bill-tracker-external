# IFE External Bill Tracker — Project Context

## Overview
Single-file SPA for tracking Illinois housing + CLS legislation externally (public-facing). 144 bills (137 Housing, 7 CLS). No authentication required — reads from a public GitHub repo.

## Architecture
- **`index.html`** — entire frontend (HTML + CSS + JS). No build step.
- **`data/bills.json`** — 144-bill master list; source of truth; written by update scripts
- **`data/user-bills.json`** — bills added via the UI (Add Bill modal); cleared on each CSV migration
- **`data/notes.json`** — shared IFE notes, keyed by bill number
- **`update_bills_from_csv.py`** — CSV migration script; rebuilds bills.json + user-bills.json + FALLBACK_DATA from the two authoritative CSVs

## Read Flow
```
Browser → GitHub raw API (public, no auth) → data/bills.json
       → falls back to FALLBACK_DATA in index.html if offline
```

No Cloudflare Worker. No token injection. Public repo only.

## Data Model (bill object)
```js
{
  id, billNumber, title, description,
  year: [2026],
  status,            // "Passed into law" | "Not passed into law"
  type,              // "Endorsed" | "Sponsored" | "Watching" | "Opposed"
  category,          // "Housing", "Zoning", "Traffic Stops", etc.
  programArea,       // "Housing" | "CLS"
  url,               // ILGA.gov bill page
  stage,             // "In House Committee", "Signed into Law", etc.
  primarySponsor,
  lastAction, lastActionDate,
  nextActionDate, nextActionType,
  ilgaFetchedAt, stageChangedAt,
  lastAmendmentName, lastAmendmentDate,
  isShellBill,
  userAdded: true    // only on user-bills.json entries
}
```

## Key Hardcoded Values
- `GITHUB_REPO` = `'danielkayhertz/ife-bill-tracker-external'`
- 144 pre-loaded bills in `FALLBACK_DATA` (auto-updated by `update_bills_from_csv.py`)

## Deployed URL
GitHub Pages: `https://danielkayhertz.github.io/ife-bill-tracker-external/`

## ILGA Data
ILGA stage/lastAction data is fetched via the update script (adapted from internal tracker's `scripts/update_bill_status.py`). XML source:
`https://www.ilga.gov/ftp/legislation/104/BillStatus/XML/10400{DOCTYPE}{PADDED_NUM}.xml`
Session ID 114 = 104th General Assembly (2025–2026).

## CSV Source Files (DO NOT COMMIT)
- `IL Bill Tracker 2026(Housing Bill Tracker).csv`
- `IL Bill Tracker 2026(CLS State Bill Tracker).csv`
- `IL Bill Tracker 2026.xlsx`

These contain ILGA credentials in row 3. They are (or should be) gitignored.

## Relationship to Internal Tracker
The internal tracker (`ife-bill-tracker-internal`) tracks Housing bills only (114 bills) and uses a Cloudflare Worker for authenticated GitHub writes. The external tracker is fully independent — different bill list, public repo, no Worker.

## HB4782 Collision
HB4782 appears in both CSVs. CLS CSV takes priority: it is filed under CLS / Traffic Stops and does not appear on the Housing tab.
