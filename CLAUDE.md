# IFE External Bill Tracker — Project Context

## Overview
Single-file SPA for tracking Illinois housing + CLS legislation externally (public-facing). 145 bills (138 Housing, 7 CLS), plus the comms layer: session summary, Coming up, IFE's agenda, campaign windows, and `#104-HB5234`-style links. No authentication required — reads from a public GitHub repo.

## Architecture
- **`index.html`** — entire frontend (HTML + CSS + JS). No build step.
- **`data/bills.json`** — 145-bill master list; source of truth; written by update scripts
- **`data/user-bills.json`** — bills added outside the CSV pipeline (e.g. HB624); hand-edited (there is no "Add Bill" UI anymore — that write path was removed); still read and merged into the bill list by `index.html` at init; cleared by `update_bills_from_csv.py` on each CSV migration
- **`data/notes.json`** — shared IFE notes, keyed by bill number
- **`update_bills_from_csv.py`** — CSV migration script; rebuilds bills.json + user-bills.json + FALLBACK_DATA from the two authoritative CSVs
- **`js/comms.js`** — pure logic for the comms layer (links, dates, bill outcomes, campaigns, session status, coming up, blurbs). No DOM access, so it's tested directly: `node --test tests/comms.test.js`
- **`data/campaigns.json`** and **`data/session.json`** — hand-edited; never written by a script
- **`scripts/validate_campaigns.py`** — checks `campaigns.json` against `bills.json` (bad bill numbers, duplicates, etc.); also run by the update Action
- **`embed/wordpress-embed.html`** — the WordPress Custom HTML block that embeds the tracker on IFE's site; `embed/test-parent.html` is the local harness standing in for that page (serve the repo on :8000 for the tracker and :8001 for the harness)

## Read Flow
```
Browser → raw.githubusercontent.com/<repo>/master/data/*.json (public, no auth)
       → on localhost, reads data/*.json from the working copy instead
       → falls back to FALLBACK_DATA in index.html if offline
```

The external tracker no longer uses the Cloudflare Worker. The Worker (shared with the internal tracker) still exposes an unauthenticated GitHub write endpoint. Securing it is a separate, open task.

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
- 145 pre-loaded bills in `FALLBACK_DATA` (auto-updated by `update_bills_from_csv.py`)

## Deployed URL
GitHub Pages: `https://danielkayhertz.github.io/ife-bill-tracker-external/`

## ILGA Data
ILGA stage/lastAction data is fetched via the update script (adapted from internal tracker's `scripts/update_bill_status.py`). XML source:
`https://www.ilga.gov/ftp/legislation/104/BillStatus/XML/10400{DOCTYPE}{PADDED_NUM}.xml`
Session ID 114 = 104th General Assembly (2025–2026).

## ILGA SSL
ILGA's server sends only its leaf certificate, not the intermediate that signed it, so fetches fail with `CERTIFICATE_VERIFY_FAILED` outside a browser (browsers fetch the missing intermediate themselves; OpenSSL on the Actions runner does not). `scripts/update_bill_status.py` pins the intermediate as a committed file, `scripts/certs/sectigo-public-server-authentication-ca-ov-r40.pem` (loaded by `INTERMEDIATE_PEM` / `build_ssl_context()`), instead of fetching a trust anchor over the network at runtime. The leaf certificate expires 2026-12-23. If fetches start failing again with `CERTIFICATE_VERIFY_FAILED` after that, get the new intermediate from the new leaf's Authority Information Access "CA Issuers" URL, verify it, and replace the pinned file:
```
openssl s_client -connect www.ilga.gov:443 -servername www.ilga.gov </dev/null | openssl x509 -noout -text | grep -A2 "Authority Information"
```

## Upkeep (rare)
- Each new GA: update `session.json` (`ga`, `gaStart`, `gaEnd`, `phases`, `sources`) and `CURRENT_GA` in `index.html`, and archive or clear `campaigns.json`.
- End of session: optionally set `session.json` → `updates.Housing` / `updates.CLS` to `{text, date}`.
- When a bill becomes law: optionally add `winNote` to its campaign.
- New endorsed bill: add a campaign. If you don't, it shows under its ILGA title, and the Action logs a warning.

## CSV Source Files (DO NOT COMMIT)
- `IL Bill Tracker 2026(Housing Bill Tracker).csv`
- `IL Bill Tracker 2026(CLS State Bill Tracker).csv`
- `IL Bill Tracker 2026.xlsx`

These contain ILGA credentials in row 3. They are (or should be) gitignored.

## Relationship to Internal Tracker
The internal tracker (`ife-bill-tracker-internal`) tracks Housing bills only (114 bills) and uses a Cloudflare Worker for authenticated GitHub writes. The external tracker is fully independent — different bill list, public repo, no Worker.

## HB4782 Collision
HB4782 appears in both CSVs. CLS CSV takes priority: it is filed under CLS / Traffic Stops and does not appear on the Housing tab.

HB624 lives in `user-bills.json`, and `update_bills_from_csv.py` clears that file. Re-add HB624 (Endorsed, Home for Good) after any CSV migration.

Last updated: 2026-09-30 — comms layer (campaigns, session summary, links)
