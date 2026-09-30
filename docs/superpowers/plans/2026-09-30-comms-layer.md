# Comms Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the external IFE bill tracker into a comms tool for IFE-endorsed bills (session summary, Coming up, IFE's agenda, campaign windows, shareable links) without breaking the existing tracking and lookup.

**Architecture:** All new logic that doesn't touch the page goes in `js/comms.js`, a plain script. In the browser it sets `window.Comms`; in Node it's exported through `module.exports` and tested with `node --test`. `index.html` keeps doing all the rendering and calls `Comms.*`. IFE-written content lives in two hand-edited files, `data/campaigns.json` and `data/session.json`, which the update script never writes. The Python update script gets an SSL fix, a heartbeat-only write rule, and a campaign check. There's no build step, which matches the current project.

**Tech Stack:** Vanilla HTML/CSS/JS (no build), Node 22 `node:test` for JS tests, Python 3.11/3.12 with `pytest` for script tests, GitHub Actions, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-09-30-comms-layer-design.md`

## Global Constraints

- Work on branch `comms-layer`. Don't push or merge without Daniel's explicit OK. The repo is public, and GitHub Pages deploys from `master`.
- Commit as Daniel Kay Hertz <danielkayhertz@gmail.com>, and end each commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- No build step and no npm dependencies. `index.html` stays a static page that loads `js/comms.js` with a relative `<script src>`.
- Node isn't on PATH. In bash, run `export PATH="/c/Users/bpi/tools/node-v22.14.0-win-x64:$PATH"` first.
- Run everything from the repo root, `C:\Users\bpi\Documents\Claude Code\ife-bill-tracker-external`.
- Every piece of staff-written or ILGA-sourced text written into HTML goes through `Comms.esc()` (or `textContent`). No exceptions.
- "Today" is always the visitor's **local** date (`Comms.localIso(new Date())`), never `toISOString()`, which is UTC.
- Link format: `#<GA>-<billNumber>`, e.g. `#104-HB5234`. Bill numbers are normalized to no leading zeros (`SB0062` → `SB62`).
- Stalled label: **"Stalled"** until the spring session ends, then **"Didn't advance this session"**.
- Outcome rank (best first): `law > governor > vetoed > moving > stalled > died`.
- `data/campaigns.json` and `data/session.json` are never written by any script.
- Session dates come from ILGA's published schedules. **Never from memory.** Record the source URLs in `session.json`.
- Don't touch the uncommitted "Session Continuity" section already in `CLAUDE.md`. Leave it as it is.
- **No witness-slip links.** The spec allows them only if ILGA's data supports them. On 2026-09-30, the bill XML had no witness-slip field; its tags are `synopsis, title, sponsors, actions, lastaction, statusdate, …`. Revisit only if ILGA adds one.
- Don't change `update_bills_from_csv.py`, `diff_update.py`, `transform_categories.py`, `fix_encoding.py`, `FALLBACK_DATA`, or the internal tracker.

## Review Focus

1. **`campaigns.json` or `session.json` missing, 404, or malformed:** the full tracker must still render. The agenda falls back to single-bill campaigns under ILGA titles, and the summary drops the headline. → tests in Task 3 (`buildCampaigns(null)`, `sessionStatus(null)`), plus a manual check in Task 6.
2. **A link to a bill that isn't in a campaign (Watching/Opposed), a padded number, a wrong GA, or garbage:** it opens the bill window or does nothing, never an error. → `parseHash` tests in Task 2, and the `openFromHash` manual matrix in Task 6.
3. **`campaigns.json` names a bill that doesn't exist or is already in another campaign:** it's skipped with a warning, the page doesn't crash, and no bill disappears from the tracker. → a Task 3 test, and the Python check in Task 4.
4. **Chicago evening (the UTC date is already tomorrow), a hearing today, a hearing in the past:** a hearing today is shown, past ones are hidden, and the 14-day window includes day 14. → `localIso` / `comingUp` boundary tests in Task 3.
5. **Staff text containing `& < > " '`:** it shows literally and never as markup. → an `esc` test in Task 2, and a manual check in Task 6 with a test campaign name `Tenants & <Landlords>`.

---

## File map

| File | Status | Responsibility |
|---|---|---|
| `scripts/update_bill_status.py` | modify | SSL context with ILGA's missing intermediate; heartbeat-only write rule |
| `scripts/validate_campaigns.py` | create | Checks campaigns.json against the bill lists and prints warnings (never fails) |
| `.github/workflows/update-bills.yml` | modify | Run every 3 hours; run the campaign check |
| `tests/test_update_bill_status.py` | create | SSL (live, skipped when offline) + `should_write` tests |
| `tests/test_validate_campaigns.py` | create | Campaign check tests |
| `js/comms.js` | create | Pure comms logic: links, outcomes, campaigns, session status, Coming up, blurbs, escaping |
| `tests/comms.test.js` | create | Node tests for `js/comms.js` |
| `tests/static.test.js` | create | Guards on `index.html` (no write paths; comms.js loaded) |
| `data/session.json` | create | GA, phase date ranges, dated staff updates, source URLs |
| `data/campaigns.json` | create | Campaign definitions (drafted by the implementer, reviewed by staff) |
| `data/user-bills.json` | modify | HB624 `type` → `"Endorsed"` |
| `data/notes.json` | modify | Remove the HB5198 test note |
| `index.html` | modify | Remove write paths and highlights; add the comms layer, campaign window, links, print CSS |
| `embed/wordpress-embed.html` | create | Replacement WordPress Custom HTML block |
| `embed/test-parent.html` | create | Local cross-origin test harness for the embed |
| `.gitignore` | modify | Add `.superpowers/` |
| `CLAUDE.md` | modify | Document the new architecture and upkeep |

---

### Task 1: Restore the ILGA update (Phase 0)

**Files:**
- Modify: `scripts/update_bill_status.py`
- Modify: `.github/workflows/update-bills.yml`
- Create: `tests/test_update_bill_status.py`

**Interfaces:**
- Produces: `build_ssl_context(cafile=None) -> ssl.SSLContext`, `get_ssl_context() -> ssl.SSLContext` (cached), `should_write(old: list, new: list, now: datetime, heartbeat_hours: int = 20) -> bool`, `USER_AGENT: str`.

**Background:** ILGA's server sends only its leaf certificate (`CN=*.ilga.gov`, issued by `Sectigo Public Server Authentication CA OV R40`). Windows and browsers fetch the missing intermediate on their own; OpenSSL on the Ubuntu runner does not. Every run since 2026-09-08 has failed with `CERTIFICATE_VERIFY_FAILED`, 0/145 bills. The intermediate's download URL (from the leaf's AIA "CA Issuers" field) is `http://crt.sectigo.com/SectigoPublicServerAuthenticationCAOVR40.crt`. The leaf expires 2026-12-23, and the renewal may use a different intermediate. The local HTTP 403 seen earlier was curl's default User-Agent. The script's `IFE-BillTracker/1.0` gets a 200.

- [ ] **Step 1: Write the failing tests**

Create `tests/test_update_bill_status.py`:

```python
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
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `python -m pytest tests/test_update_bill_status.py -q`
Expected: FAIL with `AttributeError: module 'update_bill_status' has no attribute 'USER_AGENT'` (or `build_ssl_context` / `should_write`).

Also confirm the bug reproduces locally with a certifi-only context:
Run: `python -c "import ssl,certifi,urllib.request as u; u.urlopen(u.Request('https://www.ilga.gov/ftp/legislation/104/BillStatus/XML/10400HB5234.xml',headers={'User-Agent':'IFE-BillTracker/1.0'}),context=ssl.create_default_context(cafile=certifi.where()))"`
Expected: `ssl.SSLCertVerificationError ... unable to get local issuer certificate`.

- [ ] **Step 3: Implement**

In `scripts/update_bill_status.py`, add `import ssl` to the imports (after `import re`). Then replace `fetch_xml` with:

```python
USER_AGENT = "IFE-BillTracker/1.0"

# ILGA's server sends only its leaf certificate, not the intermediate that
# signed it. Browsers and Windows fetch the missing intermediate on their own;
# OpenSSL on the Linux Actions runner does not, so every fetch failed with
# CERTIFICATE_VERIFY_FAILED from 2026-09-08. We download the intermediate from
# the "CA Issuers" URL in ILGA's certificate and add it to the trust store.
# The chain must still end at a root the system already trusts.
# ILGA's certificate expires 2026-12-23; if fetches start failing again after a
# renewal, update this URL from the new certificate's Authority Information Access.
ILGA_INTERMEDIATE_URLS = [
    "http://crt.sectigo.com/SectigoPublicServerAuthenticationCAOVR40.crt",
]

_ssl_context = None


def build_ssl_context(cafile=None):
    """Default trust store (or `cafile`) plus ILGA's missing intermediate."""
    ctx = ssl.create_default_context(cafile=cafile)
    for url in ILGA_INTERMEDIATE_URLS:
        try:
            with urllib.request.urlopen(url, timeout=15) as resp:
                data = resp.read()
            pem = data.decode("ascii") if data.startswith(b"-----BEGIN") else ssl.DER_cert_to_PEM_cert(data)
            ctx.load_verify_locations(cadata=pem)
        except Exception as e:
            print(f"    WARNING: could not load intermediate certificate {url}: {e}", file=sys.stderr)
    return ctx


def get_ssl_context():
    global _ssl_context
    if _ssl_context is None:
        _ssl_context = build_ssl_context()
    return _ssl_context


def fetch_xml(url):
    """Fetch URL; return bytes or None on error."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=15, context=get_ssl_context()) as resp:
            return resp.read()
    except Exception as e:
        print(f"    WARNING: fetch failed for {url}: {e}", file=sys.stderr)
        return None
```

Add `should_write` just above `def main():`:

```python
def _without_fetch_time(bills):
    return [{k: v for k, v in b.items() if k != "ilgaFetchedAt"} for b in bills]


def should_write(old, new, now, heartbeat_hours=20):
    """Write when ILGA data changed, or once a day so ilgaFetchedAt shows the
    fetch is alive. Without this, the 3-hourly run would commit 8 times a day."""
    if _without_fetch_time(old) != _without_fetch_time(new):
        return True
    prev = max((b.get("ilgaFetchedAt") or "" for b in old), default="")
    if not prev:
        return True
    prev_dt = datetime.strptime(prev, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    return (now - prev_dt).total_seconds() > heartbeat_hours * 3600
```

In `main()`, change the bills write block from:

```python
    with open(bills_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    print(f"Written to {bills_path}")
```

to:

```python
    now = datetime.now(timezone.utc)
    if should_write(bills, results, now):
        with open(bills_path, "w", encoding="utf-8") as f:
            json.dump(results, f, indent=2, ensure_ascii=False)
        print(f"Written to {bills_path}")
    else:
        print("No ILGA changes and heartbeat not due — bills.json left as is.")
```

and change the user-bills write block from:

```python
    with open(user_bills_path, "w", encoding="utf-8") as f:
        json.dump(updated_user, f, indent=2, ensure_ascii=False)
    print(f"Done. Refreshed {len(updated_user)} user-added bill(s).")
```

to:

```python
    if should_write(user_bills, updated_user, now):
        with open(user_bills_path, "w", encoding="utf-8") as f:
            json.dump(updated_user, f, indent=2, ensure_ascii=False)
        print(f"Done. Refreshed {len(updated_user)} user-added bill(s).")
    else:
        print("No changes to user-added bills.")
```

In `.github/workflows/update-bills.yml`, change the cron line to:

```yaml
    - cron: '0 */3 * * *'   # every 3 hours; the script only writes on real changes + a daily heartbeat
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `python -m pytest tests/test_update_bill_status.py -q`
Expected: `5 passed`. If the live test says `skipped`, the network was down, so rerun it. It must pass, not skip, before you continue.

Then run the real script: `python scripts/update_bill_status.py`. Look at the last lines.
Expected: `Done. 145/145 succeeded.` (or close to it). Then run `git diff --stat data/`. If `bills.json` changed, those are real ILGA updates since 2026-09-07: **keep them** and commit them separately in Step 5.

- [ ] **Step 5: Commit**

```bash
git add scripts/update_bill_status.py tests/test_update_bill_status.py .github/workflows/update-bills.yml
git commit -m "Fix ILGA fetches failing SSL verification on the Actions runner

ILGA's server omits its Sectigo intermediate; add it to the trust store.
Run every 3 hours, writing only on real changes plus a daily heartbeat.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git add data/bills.json data/user-bills.json
git diff --cached --quiet || git commit -m "Update bill status $(date +%Y-%m-%d)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Checkpoint: ask Daniel before pushing the fix to master**

The Action only runs from `master`. Ask Daniel: *"The ILGA fix passes locally. May I cherry-pick it onto master and push, then trigger the workflow to confirm it on the runner?"* **Wait for a yes.** If yes:

```bash
git switch master && git pull --ff-only
git cherry-pick <sha of the "Fix ILGA fetches" commit>
git push
git switch comms-layer
gh workflow run update-bills.yml -R danielkayhertz/ife-bill-tracker-external
gh run watch -R danielkayhertz/ife-bill-tracker-external $(gh run list -R danielkayhertz/ife-bill-tracker-external -L 1 --json databaseId --jq '.[0].databaseId')
```

Expected: the run succeeds and its log shows `145/145 succeeded`. If it still fails with a certificate error, the root that R40 chains to is missing from the runner's store. In that case, add `certifi` to the workflow (`pip install certifi`) and call `build_ssl_context(cafile=certifi.where())` from `get_ssl_context()`. Don't disable verification.

---

### Task 2: `js/comms.js`, part 1 (escaping, links, dates, outcomes)

**Files:**
- Create: `js/comms.js`
- Create: `tests/comms.test.js`

**Interfaces:**
- Produces (all on `Comms`): `OUTCOME_RANK: string[]`, `esc(s) -> string`, `normBill(s) -> string|null`, `parseHash(hash, currentGa) -> {ga:number, billNumber:string}|null`, `hashFor(ga, billNumber) -> string`, `mdyToIso(s) -> string|null`, `localIso(date) -> 'YYYY-MM-DD'`, `addDaysIso(iso, n) -> iso`, `springEnd(session) -> iso|null`, `billOutcome(bill, session, todayIso) -> 'law'|'governor'|'vetoed'|'moving'|'stalled'|'died'`, `paNumber(bill) -> '104-0514'|null`, `awaitingFloorVote(bill) -> bool`, `ordinal(n) -> '104th'`, `outcomeLabel(outcome, status, pa) -> string`, `groupHeading(outcome, status) -> string`.
- `status` here is the object from `sessionStatus` (Task 3). These functions only read `status.springEnded` and `status.ga`, so tests pass plain objects.
- `session` shape: `{ ga, gaStart, gaEnd, phases: [{ name, ranges: [{start, end}] }], updates: { Housing: {text, date}|null, CLS: … } }`.

- [ ] **Step 1: Write the failing tests**

Create `tests/comms.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/comms.js');

const SESSION = {
  ga: 104, gaStart: '2025-01-08', gaEnd: '2027-01-12',
  phases: [
    { name: 'Spring session', ranges: [{ start: '2026-01-13', end: '2026-05-31' }] },
    { name: 'Veto session', ranges: [{ start: '2026-10-14', end: '2026-10-16' }, { start: '2026-10-28', end: '2026-10-30' }] },
  ],
};
// NOTE: test fixture dates only — real dates live in data/session.json.

test('esc escapes all five HTML-significant characters', () => {
  assert.equal(C.esc(`Tenants & <Landlords> "q" 'a'`), 'Tenants &amp; &lt;Landlords&gt; &quot;q&quot; &#39;a&#39;');
  assert.equal(C.esc(null), '');
});

test('normBill strips padding, spaces, case', () => {
  assert.equal(C.normBill('SB0062'), 'SB62');
  assert.equal(C.normBill(' sb 62 '), 'SB62');
  assert.equal(C.normBill('HB5234'), 'HB5234');
  assert.equal(C.normBill('HB0'), 'HB0');
  assert.equal(C.normBill('nonsense'), null);
  assert.equal(C.normBill(''), null);
});

test('parseHash accepts GA-prefixed, bare, padded, lower-case; rejects junk', () => {
  assert.deepEqual(C.parseHash('#104-HB5234', 104), { ga: 104, billNumber: 'HB5234' });
  assert.deepEqual(C.parseHash('#104-sb0062', 104), { ga: 104, billNumber: 'SB62' });
  assert.deepEqual(C.parseHash('#HB5234', 104), { ga: 104, billNumber: 'HB5234' });
  assert.deepEqual(C.parseHash('#103-HB5234', 104), { ga: 103, billNumber: 'HB5234' });
  assert.equal(C.parseHash('#all-bills', 104), null);
  assert.equal(C.parseHash('', 104), null);
  assert.equal(C.parseHash('#104-', 104), null);
});

test('hashFor normalizes', () => {
  assert.equal(C.hashFor(104, 'SB0062'), '#104-SB62');
});

test('mdyToIso / localIso / addDaysIso', () => {
  assert.equal(C.mdyToIso('6/26/2026'), '2026-06-26');
  assert.equal(C.mdyToIso(''), null);
  assert.equal(C.mdyToIso(null), null);
  // 11pm local on Sep 30 is still Sep 30 locally, whatever UTC says
  assert.equal(C.localIso(new Date(2026, 8, 30, 23, 30)), '2026-09-30');
  assert.equal(C.addDaysIso('2026-09-30', 14), '2026-10-14');
  assert.equal(C.addDaysIso('2026-12-25', 10), '2027-01-04');
});

const bill = (lastAction, lastActionDate = '5/22/2026', extra = {}) =>
  ({ billNumber: 'HB1', lastAction, lastActionDate, ...extra });

test('billOutcome: law, including PA text and pre-PA steps', () => {
  assert.equal(C.billOutcome(bill('Public Act . . . . . . . . . 104-0514', '6/26/2026'), SESSION, '2026-09-30'), 'law');
  assert.equal(C.billOutcome(bill('Governor Approved'), SESSION, '2026-09-30'), 'law');
  assert.equal(C.billOutcome(bill('Effective Date January 1, 2027'), SESSION, '2026-09-30'), 'law');
});

test('billOutcome: governor, vetoed, veto stands', () => {
  assert.equal(C.billOutcome(bill('Sent to the Governor'), SESSION, '2026-06-10'), 'governor');
  assert.equal(C.billOutcome(bill('Passed Both Houses'), SESSION, '2026-05-30'), 'governor');
  assert.equal(C.billOutcome(bill('Total Veto'), SESSION, '2026-09-30'), 'vetoed');
  assert.equal(C.billOutcome(bill('Motion to Override Total Veto - Filed'), SESSION, '2026-10-14'), 'vetoed');
  assert.equal(C.billOutcome(bill('Total Veto Stands - No Positive Action Taken'), SESSION, '2026-11-15'), 'died');
});

test('billOutcome: deadline re-referrals are stalled even mid-session', () => {
  for (const la of ['Rule 19(a) / Re-referred to Rules Committee', 'Rule 19(b) / Re-referred to Rules Committee',
                    'Rule 3-9(a) / Re-referred to Assignments', 'Pursuant to Senate Rule 3-9(b) / Referred to Assignments']) {
    assert.equal(C.billOutcome(bill(la, '3/27/2026'), SESSION, '2026-04-01'), 'stalled', la);
  }
});

test('billOutcome: plain referral is moving during spring, stalled after it ends with no activity', () => {
  const b = bill('Referred to Assignments', '2/5/2026');
  assert.equal(C.billOutcome(b, SESSION, '2026-03-01'), 'moving');
  assert.equal(C.billOutcome(b, SESSION, '2026-09-30'), 'stalled');
});

test('billOutcome: after spring, activity or a future hearing keeps it moving', () => {
  assert.equal(C.billOutcome(bill('Assigned to Executive', '10/1/2026'), SESSION, '2026-10-05'), 'moving');
  const scheduled = bill('Referred to Assignments', '2/5/2026', { nextActionDate: '10/14/2026' });
  assert.equal(C.billOutcome(scheduled, SESSION, '2026-10-05'), 'moving');
  const past = bill('Referred to Assignments', '2/5/2026', { nextActionDate: '3/1/2026' });
  assert.equal(C.billOutcome(past, SESSION, '2026-10-05'), 'stalled');
});

test('billOutcome: anything not law dies after the GA ends', () => {
  assert.equal(C.billOutcome(bill('Referred to Assignments'), SESSION, '2027-01-13'), 'died');
  assert.equal(C.billOutcome(bill('Public Act . . . 104-0514'), SESSION, '2027-01-13'), 'law');
});

test('billOutcome: no session data still works (no date-based rules)', () => {
  assert.equal(C.billOutcome(bill('Referred to Assignments'), null, '2026-09-30'), 'moving');
  assert.equal(C.billOutcome(bill('Rule 19(a) / Re-referred to Rules Committee'), null, '2026-09-30'), 'stalled');
  assert.equal(C.billOutcome({ billNumber: 'HB1' }, null, '2026-09-30'), 'moving');
});

test('paNumber and awaitingFloorVote', () => {
  assert.equal(C.paNumber(bill('Public Act . . . . . . . . . 104-0514')), '104-0514');
  assert.equal(C.paNumber(bill('Governor Approved')), null);
  assert.equal(C.awaitingFloorVote(bill('Placed on Calendar Order of 3rd Reading May 20, 2026')), true);
  assert.equal(C.awaitingFloorVote(bill('Referred to Assignments')), false);
});

test('labels switch wording when spring ends', () => {
  assert.equal(C.outcomeLabel('stalled', { springEnded: false, ga: 104 }), 'Stalled');
  assert.equal(C.outcomeLabel('stalled', { springEnded: true, ga: 104 }), "Didn't advance this session");
  assert.equal(C.outcomeLabel('law', {}, '104-0514'), 'Law · PA 104-0514');
  assert.equal(C.outcomeLabel('law', {}, null), 'Law');
  assert.equal(C.outcomeLabel('died', { ga: 104 }), 'Died with the 104th GA');
  assert.equal(C.groupHeading('stalled', { springEnded: true }), "Didn't advance this session");
  assert.equal(C.groupHeading('law', {}), 'Became law');
  assert.equal(C.ordinal(104), '104th');
  assert.equal(C.ordinal(101), '101st');
  assert.equal(C.ordinal(112), '112th');
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `export PATH="/c/Users/bpi/tools/node-v22.14.0-win-x64:$PATH" && node --test tests/comms.test.js`
Expected: FAIL with `Cannot find module '../js/comms.js'`.

- [ ] **Step 3: Implement**

Create `js/comms.js`:

```js
/* IFE comms layer — pure logic, no DOM access.
 * Loaded by index.html as window.Comms; tested in Node via `node --test tests/comms.test.js`. */
(function (root) {
  'use strict';

  const OUTCOME_RANK = ['law', 'governor', 'vetoed', 'moving', 'stalled', 'died'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const FULL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                       'August', 'September', 'October', 'November', 'December'];

  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // 'SB0062' | ' sb 62 ' -> 'SB62'; null if not a bill number
  function normBill(s) {
    const m = String(s || '').toUpperCase().replace(/\s+/g, '').match(/^([A-Z]+)0*(\d+)$/);
    return m ? m[1] + m[2] : null;
  }

  // '#104-HB5234' | '#HB5234' -> { ga, billNumber }; null if not a bill link
  function parseHash(hash, currentGa) {
    const m = String(hash || '').replace(/^#/, '').match(/^(?:(\d+)-)?([A-Za-z]+\s*\d+)$/);
    if (!m) return null;
    const billNumber = normBill(m[2]);
    if (!billNumber) return null;
    return { ga: m[1] ? parseInt(m[1], 10) : currentGa, billNumber };
  }

  function hashFor(ga, billNumber) { return '#' + ga + '-' + normBill(billNumber); }

  // ILGA 'M/D/YYYY' -> 'YYYY-MM-DD'
  function mdyToIso(s) {
    const m = String(s || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : null;
  }

  // Local calendar date, not UTC — an 11pm visitor in Chicago is still "today".
  function localIso(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function addDaysIso(iso, n) {
    const [y, m, d] = iso.split('-').map(Number);
    return localIso(new Date(y, m - 1, d + n));
  }

  function springEnd(session) {
    const p = (session?.phases || []).find(x => /spring/i.test(x.name || ''));
    const r = p?.ranges || [];
    return r.length ? r[r.length - 1].end : null;
  }

  function hasUpcoming(bill, todayIso) {
    const n = mdyToIso(bill.nextActionDate);
    return !!n && n >= todayIso;
  }

  function billOutcome(bill, session, todayIso) {
    const la = bill.lastAction || '';
    if (/Public Act|Governor Approved|Effective Date/i.test(la)) return 'law';
    if (/Veto Stands/i.test(la)) return 'died';
    if (/Total Veto|Amendatory Veto|Vetoed/i.test(la) && !/Overridden|Accepted/i.test(la)) return 'vetoed';
    if (/Sent to the Governor|Passed Both Houses/i.test(la)) return 'governor';
    if (session?.gaEnd && todayIso > session.gaEnd) return 'died';
    if (/Rule 19\([ab]\)|Rule 3-9\([ab]\)/i.test(la)) return 'stalled';
    const se = springEnd(session);
    if (se && todayIso > se) {
      const last = mdyToIso(bill.lastActionDate);
      if ((!last || last <= se) && !hasUpcoming(bill, todayIso)) return 'stalled';
    }
    return 'moving';
  }

  function paNumber(bill) {
    const m = String(bill.lastAction || '').match(/Public Act[^\d]*(\d{3})-(\d{4})/i);
    return m ? `${m[1]}-${m[2]}` : null;
  }

  function awaitingFloorVote(bill) { return /3rd Reading/i.test(bill.lastAction || ''); }

  function ordinal(n) {
    if (!n) return '';
    const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  function outcomeLabel(outcome, status, pa) {
    switch (outcome) {
      case 'law':      return pa ? `Law · PA ${pa}` : 'Law';
      case 'governor': return "On the governor's desk";
      case 'vetoed':   return 'Vetoed · override possible';
      case 'moving':   return 'Moving';
      case 'stalled':  return status?.springEnded ? "Didn't advance this session" : 'Stalled';
      case 'died':     return status?.ga ? `Died with the ${ordinal(status.ga)} GA` : 'Did not pass';
    }
    return '';
  }

  function groupHeading(outcome, status) {
    return {
      law: 'Became law', governor: "On the governor's desk", vetoed: 'Vetoed', moving: 'Moving',
      stalled: status?.springEnded ? "Didn't advance this session" : 'Stalled', died: 'Did not pass',
    }[outcome] || '';
  }

  const api = {
    OUTCOME_RANK, MONTHS, FULL_MONTHS, esc, normBill, parseHash, hashFor, mdyToIso, localIso, addDaysIso,
    springEnd, hasUpcoming, billOutcome, paNumber, awaitingFloorVote, ordinal, outcomeLabel, groupHeading,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Comms = api;
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `export PATH="/c/Users/bpi/tools/node-v22.14.0-win-x64:$PATH" && node --test tests/comms.test.js`
Expected: all tests pass, `# fail 0`.

Then check the rules against real data. Every distinct `lastAction` in the repo must map to the expected outcome:
Run: `node -e "const C=require('./js/comms.js');const b=[...require('./data/bills.json'),...require('./data/user-bills.json')];const s={ga:104,phases:[{name:'Spring session',ranges:[{start:'2026-01-13',end:'2026-05-31'}]}]};const m={};for(const x of b){m[x.lastAction]=C.billOutcome(x,s,'2026-09-30')};console.log(m)"`
Expected: `Public Act …` → `law`; every `Rule 19(…)` / `Rule 3-9(…)` → `stalled`; `Referred to Assignments` and `Referred to Rules Committee` → `stalled` (it's after spring). If a string maps unexpectedly, add a test case for it and fix the rule.

- [ ] **Step 5: Commit**

```bash
git add js/comms.js tests/comms.test.js
git commit -m "Add comms.js: links, dates, bill outcomes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `js/comms.js`, part 2 (campaigns, session status, Coming up, blurbs)

**Files:**
- Modify: `js/comms.js`
- Modify: `tests/comms.test.js`

**Interfaces:**
- Consumes: everything from Task 2.
- Produces (on `Comms`):
  - `buildCampaigns(bills, defs, session, todayIso) -> { campaigns: Campaign[], warnings: string[] }`
  - `Campaign = { id, ga, programArea, name, why, winNote, overrideNote, fallback:bool, type:'Endorsed'|'Sponsored', categories:string[], lead:Bill, best:Bill, bills:[{bill, outcome}], outcome, pa, lastActionIso }`
  - `groupCampaigns(campaigns) -> [{ outcome, items: Campaign[] }]` (in rank order, empty groups dropped)
  - `outcomeCounts(campaigns) -> { [outcome]: number }`
  - `comingUp(campaigns, todayIso, days = 14) -> [{ date, campaign, bill, action }]`
  - `floorVotes(campaigns) -> Campaign[]`
  - `sessionStatus(session, todayIso) -> { ga, headline, springEnded, gaEnded, current, next }`
  - `formatRange({start,end}) -> string`, `formatRanges(ranges) -> string`
  - `comingUpEmptyText(status) -> string`
  - `staffUpdate(session, programArea, status) -> { text, label } | null`
  - `blurb(campaign, status, url) -> string`
  - `latestFetch(bills) -> iso string | null`, `isStale(bills, now: Date, days = 3) -> bool`

- [ ] **Step 1: Write the failing tests**

Append to `tests/comms.test.js`:

```js
const B = (n, type, lastAction, lastActionDate, extra = {}) => ({
  billNumber: n, type, lastAction, lastActionDate, programArea: 'Housing', title: `Title ${n}`,
  category: ['Affordable Housing'], ...extra,
});
const BILLS = [
  B('HB5234', 'Endorsed', 'Public Act . . . . . . . . . 104-0514', '6/26/2026'),
  B('SB3763', 'Endorsed', 'Referred to Assignments', '2/5/2026', { category: ['Building Conditions'] }),
  B('SB0062', 'Endorsed', 'Rule 3-9(a) / Re-referred to Assignments', '5/22/2026'),
  B('HB5198', 'Sponsored', 'Rule 3-9(a) / Re-referred to Assignments', '5/22/2026'),
  B('HB9999', 'Watching', 'Referred to Rules Committee', '2/1/2026'),
  B('HB4782', 'Endorsed', 'Referred to Rules Committee', '2/1/2026', { programArea: 'CLS' }),
];
const DEFS = [{ id: 'junk-fees', ga: 104, programArea: 'Housing', name: 'Ban landlord junk fees',
                why: 'Caps fees.', bills: ['HB5234', 'SB3763'] }];

test('buildCampaigns: pairs take the best outcome and union categories', () => {
  const { campaigns, warnings } = C.buildCampaigns(BILLS, DEFS, SESSION, '2026-09-30');
  assert.deepEqual(warnings, []);
  const c = campaigns.find(x => x.id === 'junk-fees');
  assert.equal(c.outcome, 'law');
  assert.equal(c.pa, '104-0514');
  assert.equal(C.normBill(c.best.billNumber), 'HB5234');
  assert.deepEqual(c.categories.sort(), ['Affordable Housing', 'Building Conditions']);
  assert.equal(c.bills.length, 2);
});

test('buildCampaigns: endorsed/sponsored bills without a def get a fallback; watching bills do not', () => {
  const { campaigns } = C.buildCampaigns(BILLS, DEFS, SESSION, '2026-09-30');
  const ids = campaigns.map(c => c.id).sort();
  assert.deepEqual(ids, ['bill-HB4782', 'bill-HB5198', 'bill-SB62', 'junk-fees']);
  const fb = campaigns.find(c => c.id === 'bill-SB62');
  assert.equal(fb.name, 'Title SB0062');
  assert.equal(fb.why, null);
  assert.equal(fb.fallback, true);
  assert.equal(campaigns.find(c => c.id === 'bill-HB5198').type, 'Sponsored');
  assert.equal(campaigns.find(c => c.id === 'bill-HB4782').programArea, 'CLS');
});

test('buildCampaigns: missing file, unknown bills and duplicates warn instead of crashing', () => {
  assert.equal(C.buildCampaigns(BILLS, null, null, '2026-09-30').campaigns.length, 4);
  const defs = [...DEFS, { id: 'dup', bills: ['hb5234', 'HB0000123'] }];
  const { campaigns, warnings } = C.buildCampaigns(BILLS, defs, SESSION, '2026-09-30');
  assert.equal(warnings.length, 2);
  assert.ok(!campaigns.some(c => c.id === 'dup'));  // no bills left → no campaign
});

test('buildCampaigns: staff override wins; leadBill respected', () => {
  const defs = [{ ...DEFS[0], leadBill: 'SB3763', outcomeOverride: 'moving', overrideNote: 'x' }];
  const c = C.buildCampaigns(BILLS, defs, SESSION, '2026-09-30').campaigns.find(x => x.id === 'junk-fees');
  assert.equal(c.outcome, 'moving');
  assert.equal(c.pa, null);
  assert.equal(C.normBill(c.lead.billNumber), 'SB3763');
  const bad = [{ ...DEFS[0], outcomeOverride: 'won' }];
  assert.equal(C.buildCampaigns(BILLS, bad, SESSION, '2026-09-30').campaigns.find(x => x.id === 'junk-fees').outcome, 'law');
});

test('groupCampaigns orders groups by rank and sponsored first', () => {
  const { campaigns } = C.buildCampaigns(BILLS, DEFS, SESSION, '2026-09-30');
  const groups = C.groupCampaigns(campaigns.filter(c => c.programArea === 'Housing'));
  assert.deepEqual(groups.map(g => g.outcome), ['law', 'stalled']);
  assert.equal(groups[1].items[0].type, 'Sponsored');
  assert.deepEqual(C.outcomeCounts(campaigns), { law: 1, stalled: 3 });
});

test('comingUp: today and day 14 included, past and day 15 excluded, sorted', () => {
  const bills = [
    B('HB1', 'Endorsed', 'Assigned', '9/1/2026', { nextActionDate: '9/30/2026', nextActionType: 'Hearing Housing' }),
    B('HB2', 'Endorsed', 'Assigned', '9/1/2026', { nextActionDate: '10/14/2026' }),
    B('HB3', 'Endorsed', 'Assigned', '9/1/2026', { nextActionDate: '10/15/2026' }),
    B('HB4', 'Endorsed', 'Assigned', '9/1/2026', { nextActionDate: '9/29/2026' }),
  ];
  const { campaigns } = C.buildCampaigns(bills, [], SESSION, '2026-09-30');
  const rows = C.comingUp(campaigns, '2026-09-30');
  assert.deepEqual(rows.map(r => r.bill.billNumber), ['HB1', 'HB2']);
  assert.equal(rows[0].action, 'Hearing Housing');
  assert.equal(rows[1].action, 'Scheduled action');
});

test('floorVotes picks moving campaigns on 3rd Reading', () => {
  const bills = [B('HB1', 'Endorsed', 'Placed on Calendar Order of 3rd Reading', '3/1/2026')];
  const { campaigns } = C.buildCampaigns(bills, [], SESSION, '2026-03-02');
  assert.equal(C.floorVotes(campaigns).length, 1);
});

test('sessionStatus headlines', () => {
  assert.equal(C.sessionStatus(SESSION, '2026-09-30').headline,
    'Spring session is over. Veto session: Oct 14–16 and Oct 28–30.');
  assert.equal(C.sessionStatus(SESSION, '2026-10-15').headline, 'Veto session is underway: Oct 14–16 and Oct 28–30.');
  assert.equal(C.sessionStatus(SESSION, '2026-11-15').headline, 'Veto session is over.');
  assert.equal(C.sessionStatus(SESSION, '2025-12-01').headline, 'Spring session begins Jan 13.');
  assert.equal(C.sessionStatus(SESSION, '2027-01-20').headline, 'The 104th General Assembly has ended.');
  const st = C.sessionStatus(SESSION, '2026-09-30');
  assert.equal(st.springEnded, true);
  assert.equal(st.next.name, 'Veto session');
  assert.equal(C.sessionStatus(SESSION, '2026-04-01').springEnded, false);
});

test('sessionStatus tolerates missing or broken session data', () => {
  const st = C.sessionStatus(null, '2026-09-30');
  assert.equal(st.headline, '');
  assert.equal(st.springEnded, false);
  assert.equal(C.sessionStatus({ ga: 104, phases: 'oops' }, '2026-09-30').headline, '');
});

test('formatRange(s)', () => {
  assert.equal(C.formatRange({ start: '2026-10-14', end: '2026-10-14' }), 'Oct 14');
  assert.equal(C.formatRange({ start: '2026-10-30', end: '2026-11-01' }), 'Oct 30–Nov 1');
  assert.equal(C.formatRanges([{ start: '2026-10-14', end: '2026-10-16' }]), 'Oct 14–16');
  assert.equal(C.formatRanges([{ start: '2026-01-01', end: '2026-01-01' }, { start: '2026-01-02', end: '2026-01-02' },
                              { start: '2026-01-03', end: '2026-01-03' }]), 'Jan 1, Jan 2, and Jan 3');
});

test('comingUpEmptyText depends on phase', () => {
  assert.equal(C.comingUpEmptyText(C.sessionStatus(SESSION, '2026-09-30')),
    'No hearings scheduled. Bills can move again during veto session, Oct 14–16 and Oct 28–30.');
  assert.equal(C.comingUpEmptyText(C.sessionStatus(SESSION, '2026-10-15')),
    "No hearings scheduled for IFE's bills in the next two weeks.");
  assert.equal(C.comingUpEmptyText(C.sessionStatus(null, '2026-09-30')), 'No hearings scheduled.');
});

test('staffUpdate shows a dated label and hides after the GA', () => {
  const s = { ...SESSION, updates: { Housing: { text: 'We won.', date: '2026-06-15' }, CLS: null } };
  assert.deepEqual(C.staffUpdate(s, 'Housing', C.sessionStatus(s, '2026-09-30')),
    { text: 'We won.', label: 'IFE update, June 2026' });
  assert.equal(C.staffUpdate(s, 'CLS', C.sessionStatus(s, '2026-09-30')), null);
  assert.equal(C.staffUpdate(s, 'Housing', C.sessionStatus(s, '2027-02-01')), null);
  assert.equal(C.staffUpdate(null, 'Housing', C.sessionStatus(null, '2026-09-30')), null);
});

test('blurb per outcome', () => {
  const { campaigns } = C.buildCampaigns(BILLS, DEFS, SESSION, '2026-09-30');
  const st = C.sessionStatus(SESSION, '2026-09-30');
  assert.equal(C.blurb(campaigns.find(c => c.id === 'junk-fees'), st, 'https://x/#104-HB5234'),
    'IFE-endorsed: Ban landlord junk fees (HB5234) was signed into law as Public Act 104-0514. https://x/#104-HB5234');
  assert.equal(C.blurb(campaigns.find(c => c.id === 'bill-HB5198'), st, 'u'),
    "IFE-sponsored: Title HB5198 (HB5198) didn't advance this session. u");
});

test('isStale / latestFetch', () => {
  const bills = [{ ilgaFetchedAt: '2026-09-07T18:11:33Z' }, { ilgaFetchedAt: '2026-09-06T00:00:00Z' }, {}];
  assert.equal(C.latestFetch(bills), '2026-09-07T18:11:33Z');
  assert.equal(C.isStale(bills, new Date('2026-09-30T12:00:00Z')), true);
  assert.equal(C.isStale(bills, new Date('2026-09-08T12:00:00Z')), false);
  assert.equal(C.isStale([{}], new Date()), false);
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `export PATH="/c/Users/bpi/tools/node-v22.14.0-win-x64:$PATH" && node --test tests/comms.test.js`
Expected: the new tests FAIL with `C.buildCampaigns is not a function`. The Task 2 tests still pass.

- [ ] **Step 3: Implement**

In `js/comms.js`, insert these functions just before `const api = {`:

```js
  const rank = o => OUTCOME_RANK.indexOf(o);

  function makeCampaign(def, members, session, todayIso) {
    const bills = members.map(b => ({ bill: b, outcome: billOutcome(b, session, todayIso) }));
    const bestEntry = bills.reduce((a, c) => (rank(c.outcome) < rank(a.outcome) ? c : a));
    const lead = members.find(b => normBill(b.billNumber) === normBill(def.leadBill)) || bestEntry.bill;
    const outcome = OUTCOME_RANK.includes(def.outcomeOverride) ? def.outcomeOverride : bestEntry.outcome;
    return {
      id: def.id,
      ga: def.ga || session?.ga || null,
      programArea: def.programArea || lead.programArea || 'Housing',
      name: def.name || lead.title || normBill(lead.billNumber),
      why: def.why || null,
      winNote: def.winNote || null,
      overrideNote: def.overrideNote || null,
      fallback: !!def.fallback,
      type: members.some(b => b.type === 'Sponsored') ? 'Sponsored' : 'Endorsed',
      categories: [...new Set(members.flatMap(b => (Array.isArray(b.category) ? b.category : [])))],
      lead,
      best: bestEntry.bill,
      bills,
      outcome,
      pa: outcome === 'law' && bestEntry.outcome === 'law' ? paNumber(bestEntry.bill) : null,
      lastActionIso: members.map(b => mdyToIso(b.lastActionDate)).filter(Boolean).sort().pop() || '',
    };
  }

  function buildCampaigns(bills, defs, session, todayIso) {
    const byNum = new Map(bills.map(b => [normBill(b.billNumber), b]));
    const used = new Set();
    const campaigns = [];
    const warnings = [];
    for (const def of Array.isArray(defs) ? defs : []) {
      const members = [];
      for (const n of Array.isArray(def.bills) ? def.bills : []) {
        const k = normBill(n);
        const b = byNum.get(k);
        if (!b) { warnings.push(`${def.id}: bill ${n} not found`); continue; }
        if (used.has(k)) { warnings.push(`${def.id}: ${n} is already in another campaign`); continue; }
        used.add(k);
        members.push(b);
      }
      if (members.length) campaigns.push(makeCampaign(def, members, session, todayIso));
    }
    for (const b of bills) {
      const k = normBill(b.billNumber);
      if ((b.type === 'Endorsed' || b.type === 'Sponsored') && !used.has(k)) {
        used.add(k);
        campaigns.push(makeCampaign({ id: 'bill-' + k, fallback: true }, [b], session, todayIso));
      }
    }
    return { campaigns, warnings };
  }

  function groupCampaigns(campaigns) {
    return OUTCOME_RANK
      .map(outcome => ({
        outcome,
        items: campaigns.filter(c => c.outcome === outcome).sort((a, b) =>
          (a.type === 'Sponsored' ? 0 : 1) - (b.type === 'Sponsored' ? 0 : 1)
          || b.lastActionIso.localeCompare(a.lastActionIso)),
      }))
      .filter(g => g.items.length);
  }

  function outcomeCounts(campaigns) {
    const c = {};
    for (const x of campaigns) c[x.outcome] = (c[x.outcome] || 0) + 1;
    return c;
  }

  function comingUp(campaigns, todayIso, days = 14) {
    const end = addDaysIso(todayIso, days);
    const rows = [];
    for (const campaign of campaigns) {
      for (const { bill } of campaign.bills) {
        const date = mdyToIso(bill.nextActionDate);
        if (date && date >= todayIso && date <= end) {
          rows.push({ date, campaign, bill, action: bill.nextActionType || 'Scheduled action' });
        }
      }
    }
    return rows.sort((a, b) => a.date.localeCompare(b.date) || a.bill.billNumber.localeCompare(b.bill.billNumber));
  }

  function floorVotes(campaigns) {
    return campaigns.filter(c => c.outcome === 'moving'
      && c.bills.some(x => x.outcome === 'moving' && awaitingFloorVote(x.bill)));
  }

  function formatDate(iso) {
    const [, m, d] = iso.split('-').map(Number);
    return `${MONTHS[m - 1]} ${d}`;
  }

  function formatRange(r) {
    const [, sm, sd] = r.start.split('-').map(Number);
    const [, em, ed] = r.end.split('-').map(Number);
    if (r.start === r.end) return `${MONTHS[sm - 1]} ${sd}`;
    if (sm === em) return `${MONTHS[sm - 1]} ${sd}–${ed}`;
    return `${MONTHS[sm - 1]} ${sd}–${MONTHS[em - 1]} ${ed}`;
  }

  function formatRanges(ranges) {
    const parts = ranges.map(formatRange);
    return parts.length <= 2 ? parts.join(' and ') : parts.slice(0, -1).join(', ') + ', and ' + parts[parts.length - 1];
  }

  function sessionStatus(session, todayIso) {
    const empty = { ga: session?.ga || null, headline: '', springEnded: false, gaEnded: false, current: null, next: null };
    if (!session || !Array.isArray(session.phases)) return empty;
    const phases = session.phases
      .filter(p => Array.isArray(p.ranges) && p.ranges.length)
      .map(p => ({ ...p, start: p.ranges[0].start, end: p.ranges[p.ranges.length - 1].end }));
    const current = phases.find(p => todayIso >= p.start && todayIso <= p.end) || null;
    const next = phases.filter(p => p.start > todayIso).sort((a, b) => a.start.localeCompare(b.start))[0] || null;
    const past = phases.filter(p => p.end < todayIso).sort((a, b) => a.end.localeCompare(b.end)).pop() || null;
    const se = springEnd(session);
    const gaEnded = !!session.gaEnd && todayIso > session.gaEnd;
    let headline = '';
    if (gaEnded) headline = `The ${ordinal(session.ga)} General Assembly has ended.`;
    else if (current) headline = `${current.name} is underway: ${formatRanges(current.ranges)}.`;
    else if (past && next) headline = `${past.name} is over. ${next.name}: ${formatRanges(next.ranges)}.`;
    else if (past) headline = `${past.name} is over.`;
    else if (next) headline = `${next.name} begins ${formatDate(next.start)}.`;
    return { ga: session.ga || null, headline, springEnded: !!se && todayIso > se, gaEnded, current, next };
  }

  function comingUpEmptyText(status) {
    if (status.gaEnded) return 'No hearings scheduled.';
    if (status.current) return "No hearings scheduled for IFE's bills in the next two weeks.";
    if (status.next) {
      const name = status.next.name.charAt(0).toLowerCase() + status.next.name.slice(1);
      return `No hearings scheduled. Bills can move again during ${name}, ${formatRanges(status.next.ranges)}.`;
    }
    return 'No hearings scheduled.';
  }

  function staffUpdate(session, programArea, status) {
    const u = session?.updates?.[programArea];
    if (!u || !u.text || status.gaEnded) return null;
    const [y, m] = String(u.date || '').split('-').map(Number);
    return { text: u.text, label: y && m ? `IFE update, ${FULL_MONTHS[m - 1]} ${y}` : 'IFE update' };
  }

  function blurb(c, status, url) {
    const who = c.type === 'Sponsored' ? 'IFE-sponsored' : 'IFE-endorsed';
    const ref = `${c.name} (${normBill((c.outcome === 'law' ? c.best : c.lead).billNumber)})`;
    const body = {
      law: c.pa ? `was signed into law as Public Act ${c.pa}.` : 'was signed into law.',
      governor: "passed both chambers and is on the governor's desk.",
      vetoed: 'was vetoed. The General Assembly can still override the veto.',
      moving: 'is moving in the Illinois General Assembly.',
      stalled: status?.springEnded ? "didn't advance this session." : 'is stalled in the Illinois General Assembly.',
      died: `did not pass in the ${ordinal(c.ga)} General Assembly.`,
    }[c.outcome];
    return `${who}: ${ref} ${body} ${url}`.trim();
  }

  function latestFetch(bills) {
    return bills.map(b => b.ilgaFetchedAt).filter(Boolean).sort().pop() || null;
  }

  function isStale(bills, now, days = 3) {
    const f = latestFetch(bills);
    return !!f && (now - new Date(f)) > days * 86400000;
  }
```

Then replace the `const api = { … };` block with:

```js
  const api = {
    OUTCOME_RANK, MONTHS, FULL_MONTHS, esc, normBill, parseHash, hashFor, mdyToIso, localIso, addDaysIso,
    springEnd, hasUpcoming, billOutcome, paNumber, awaitingFloorVote, ordinal, outcomeLabel, groupHeading,
    buildCampaigns, groupCampaigns, outcomeCounts, comingUp, floorVotes, sessionStatus, formatRange,
    formatRanges, comingUpEmptyText, staffUpdate, blurb, latestFetch, isStale,
  };
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `export PATH="/c/Users/bpi/tools/node-v22.14.0-win-x64:$PATH" && node --test tests/comms.test.js`
Expected: `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add js/comms.js tests/comms.test.js
git commit -m "comms.js: campaigns, session status, coming up, blurbs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Content data files and the campaign check

**Files:**
- Create: `data/session.json`
- Create: `data/campaigns.json`
- Modify: `data/user-bills.json` (HB624 `type`)
- Modify: `data/notes.json` (remove HB5198)
- Create: `scripts/validate_campaigns.py`
- Create: `tests/test_validate_campaigns.py`
- Modify: `.github/workflows/update-bills.yml`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: the campaign def shape from Task 3 (`id, ga, programArea, name, why, bills, leadBill?, winNote?, outcomeOverride?, overrideNote?`) and the session shape from Task 2.
- Produces: `validate_campaigns.check(bills: list, campaigns: list) -> list[str]`, `validate_campaigns.norm(n) -> str|None`.

- [ ] **Step 1: Write the failing test**

Create `tests/test_validate_campaigns.py`:

```python
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
```

- [ ] **Step 2: Run it to see it fail**

Run: `python -m pytest tests/test_validate_campaigns.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'validate_campaigns'`.

- [ ] **Step 3: Implement the check and wire it into the workflow**

Create `scripts/validate_campaigns.py`:

```python
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
```

In `.github/workflows/update-bills.yml`, add this step between "Fetch bill status from ILGA" and "Commit if changed":

```yaml
      - name: Check campaigns
        run: python scripts/validate_campaigns.py
```

Append to `.gitignore`:

```
.superpowers/
```

Run: `python -m pytest tests/test_validate_campaigns.py -q`
Expected: `3 passed`.

- [ ] **Step 4: Write `data/session.json` from ILGA's published schedules**

Find the real dates. Fetch the pages with curl using the tracker's UA (`-A "IFE-BillTracker/1.0"`), save them to the scratchpad, and grep them. **Don't use WebFetch summaries for these dates.** Sources to try, in order:
1. The House and Senate session schedules linked from `https://www.ilga.gov/` (look for "Session Schedule" / "Spring Session" / "Veto Session" 2026 PDFs under `ilga.gov/Documents/…`, or the House/Senate "Schedules" pages).
2. If a PDF, save it and read it with the Read tool (`pages` parameter).

You need:
- `gaStart` and `gaEnd` for the 104th GA. The constitutional rule is that each GA convenes on the second Wednesday of January in odd years, so the 104th runs until the 105th convenes. Confirm the 105th's convening date from ILGA if it's published, and set `gaEnd` to the day before.
- The spring session range: the first and last 2026 session days. Use one range from the first to the last session day. Individual days aren't needed.
- Veto session ranges: one range per veto week.
- Lame duck session ranges, only if published.

If a phase isn't published yet, **leave it out**. The page handles missing phases. Write:

```json
{
  "ga": 104,
  "gaStart": "<from ILGA>",
  "gaEnd": "<from ILGA>",
  "phases": [
    { "name": "Spring session", "ranges": [{ "start": "<first 2026 session day>", "end": "<last 2026 session day>" }] },
    { "name": "Veto session", "ranges": [{ "start": "…", "end": "…" }, { "start": "…", "end": "…" }] }
  ],
  "updates": { "Housing": null, "CLS": null },
  "sources": ["<every URL the dates came from>"]
}
```

The angle-bracket values are filled with real dates in this step. **None may remain when you commit.** Check with: `node -e "const s=require('./data/session.json');const bad=JSON.stringify(s).match(/<|…/);if(bad)throw new Error('unfilled: '+bad);console.log(require('./js/comms.js').sessionStatus(s,require('./js/comms.js').localIso(new Date())).headline)"`
Expected: a real headline, e.g. "Spring session is over. Veto session: …", with no error.

- [ ] **Step 5: Draft `data/campaigns.json`**

The campaigns and their bills are fixed. Only `name` and `why` are drafted.

| id | programArea | bills |
|---|---|---|
| (draft) | Housing | HB5433, SB3978 |
| (draft) | Housing | HB4413, SB3738 |
| (draft) | Housing | HB4568, SB2969 |
| (draft) | Housing | HB4521, SB3260 |
| (draft) | Housing | SB3003, HB5464 |
| landlord-junk-fees | Housing | HB5234, SB3763 |
| (draft) | Housing | HB5615, SB3703 |
| (draft) | Housing | SB3777, HB5386 |
| (draft) | Housing | HB4377, SB3084 |
| home-for-good | Housing | SB4162, HB624 |
| (draft) | Housing | one campaign each: SB62, SB2871, HB1429, HB5394, SB3187, SB3457, SB3940, SB2264, HB5626, SB4062, SB4063, SB4060, SB4064, SB4061, SB1750, HB598, HB5198 |
| (draft) | CLS | one campaign each: HB5287, HB4782, HB4217, HB5261, HB5256 |

That's 32 campaigns covering 42 bills.

Drafting rules. For each campaign, read the `description` of its bills in `data/bills.json` / `data/user-bills.json`:
- `id`: kebab-case, 2–4 words (e.g. `circuit-breaker-tax-relief`).
- `name`: plain language, at most 6 words, and describes what the bill *does*. If the description gives a real act name ("Build Illinois Homes Act", "Home for Good Act"), use it.
- `why`: one sentence, at most 20 words, stating only what the description supports. Don't say anything about outcomes, votes or IFE's role.
- If a description is empty or only technical (e.g. "Government - Tech"), set `name` to the ILGA title, set `why` to `null`, and list the campaign in the staff review table (Step 7).
- Include `"ga": 104` and `programArea`. Leave out `leadBill`, `winNote`, `outcomeOverride` and `overrideNote`: they're optional, and staff add them.

Write the array to `data/campaigns.json`, sorted by `programArea`, then `id`, with 2-space indentation.

- [ ] **Step 6: Fix HB624 and the test note**

In `data/user-bills.json`, change HB624's `"type": "Watching"` to `"type": "Endorsed"`. In `data/notes.json`, delete the `"HB5198"` entry and keep `"SB2111"`.

Run: `python scripts/validate_campaigns.py`
Expected: `Campaign check: 0 warning(s).`

Run: `export PATH="/c/Users/bpi/tools/node-v22.14.0-win-x64:$PATH" && node -e "const C=require('./js/comms.js');const b=[...require('./data/bills.json'),...require('./data/user-bills.json')];const r=C.buildCampaigns(b,require('./data/campaigns.json'),require('./data/session.json'),C.localIso(new Date()));console.log(r.warnings, r.campaigns.length, C.outcomeCounts(r.campaigns.filter(c=>c.programArea==='Housing')))"`
Expected: `[] 32 { law: 3, stalled: … }`, with no warnings. The Housing laws are HB5234, SB3777 and HB598.

- [ ] **Step 7: Build the staff review table (not committed)**

Write `C:\Users\bpi\AppData\Local\Temp\claude\C--Users-bpi\2ac884b2-75be-452b-bebe-dfd87ae496a2\scratchpad\campaigns-review.md` with a Markdown table: id | bills | name | why | flag. Put "needs a name" in the flag column for any campaign whose `why` is null. This is handed to Daniel at the end.

- [ ] **Step 8: Commit**

```bash
git add data/session.json data/campaigns.json data/user-bills.json data/notes.json scripts/validate_campaigns.py tests/test_validate_campaigns.py .github/workflows/update-bills.yml .gitignore
git commit -m "Add campaigns and session data; campaign check in the update Action

HB624 (Home for Good Act) is Endorsed, paired with SB4162. Remove test note.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Remove public write paths and read data directly

**Files:**
- Modify: `index.html`
- Create: `tests/static.test.js`

**Interfaces:**
- Produces in `index.html`: `DATA_BASE: string`, `readDataFile(name, fallback) -> Promise<any>` (resolves `fallback` on 404, rejects on other errors or bad JSON), `CURRENT_GA = 104`.

- [ ] **Step 1: Write the failing test**

Create `tests/static.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const html = fs.readFileSync(require('node:path').join(__dirname, '..', 'index.html'), 'utf8');

test('no public write paths or Worker dependency remain', () => {
  for (const s of ['writeGitHubFile', 'readGitHubFile', 'WORKER_URL', 'workers.dev', 'refreshAllFromILGA',
                   'refreshBillILGA', 'deleteBill', 'addBill', 'lookupBillILGA', 'fetchBillFromILGA',
                   'refresh-overlay', 'bill-modal-delete-btn']) {
    assert.ok(!html.includes(s), `index.html still contains ${s}`);
  }
});

test('reads data from raw.githubusercontent.com (or local data/ in dev)', () => {
  assert.ok(html.includes('https://raw.githubusercontent.com/'));
  assert.ok(html.includes('function readDataFile('));
});

test('page title is not "Internal"', () => {
  assert.ok(!/<title>[^<]*Internal/i.test(html));
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `export PATH="/c/Users/bpi/tools/node-v22.14.0-win-x64:$PATH" && node --test tests/static.test.js`
Expected: FAIL on `writeGitHubFile`, `raw.githubusercontent.com` and `Internal`.

- [ ] **Step 3: Implement the deletions and the new reads**

Edit `index.html`:

1. `<title>IFE Internal Bill Tracker</title>` → `<title>IFE Illinois Bill Tracker</title>`.
2. Delete the whole `<!-- Refresh Controls -->` block: the `<div class="highlights-refresh-row">` with its button and `#header-last-refreshed`.
3. Delete the whole `<!-- Refresh All Progress Overlay -->` block (`<div class="bill-modal-overlay" id="refresh-overlay">…</div>`).
4. In the bill modal, delete the two buttons `#bill-modal-refresh-btn` and `#bill-modal-delete-btn`.
5. In the `<script>`, replace:
   ```js
       // ── GitHub API config ─────────────────────────────────────────────────────
       const WORKER_URL = 'https://ifeinternaltracker.dhertz.workers.dev'; // set after deploying Cloudflare Worker
       const GITHUB_REPO  = 'danielkayhertz/ife-bill-tracker-external';
   ```
   with:
   ```js
       // ── Data source ───────────────────────────────────────────────────────────
       // Public repo, so the page reads files directly (raw.githubusercontent caches ~5 min).
       // On localhost, read the working copy so unpushed data files can be tested.
       const GITHUB_REPO = 'danielkayhertz/ife-bill-tracker-external';
       const DATA_BASE = /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
         ? 'data/'
         : `https://raw.githubusercontent.com/${GITHUB_REPO}/master/data/`;
       const CURRENT_GA = 104;  // used only if data/session.json is unavailable
   ```
6. Replace the `// ── GitHub API helpers ──` section (`readGitHubFile` and `writeGitHubFile`) with:
   ```js
       // ── Data helpers ──────────────────────────────────────────────────────────
       async function readDataFile(name, fallback) {
         const r = await fetch(DATA_BASE + name, { cache: 'no-cache' });
         if (r.status === 404) return fallback;
         if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
         return r.json();
       }
   ```
7. Replace the body of `init()`'s `try { … } catch { … }` with:
   ```js
         try {
           const [bills, userBills, notes] = await Promise.all([
             readDataFile('bills.json', null),
             readDataFile('user-bills.json', []),
             readDataFile('notes.json', {}),
           ]);
           legislationData = [...(bills || FALLBACK_DATA), ...(userBills || [])];
           notesData = notes || {};
         } catch (e) {
           console.warn('Data files unavailable, using fallback:', e);
           legislationData = FALLBACK_DATA;
           notesData = {};
         }
   ```
   Then delete the `updateLastFetched();` call from `init()` and delete the whole `function updateLastFetched() { … }`. Its element no longer exists; Task 6 adds the staleness note.
8. Delete these functions entirely: `confirmDeleteBill`, `deleteBill`, `refreshBillILGA`, `refreshAllFromILGA`, `fetchWithProxy`, `fetchBillFromILGA`, `lookupBillILGA`, `addBill`. Also delete the `// ── ILGA fetch (browser-side, for refresh) ──` comment, and the `let addBillIlgaData = null;` state line.
9. In `openModal`, delete the two statements that set `bill-modal-refresh-btn` / `bill-modal-delete-btn` `style.display`.
10. In the `<style>` block, delete the rules whose selectors start with `.add-bill`, `.refresh-all-btn`, `.highlights-refresh-row` or `.header-last-refreshed`, and `.add-bill-btn { margin-left: 0; }` in the 768px media query.

- [ ] **Step 4: Run the tests and load the page**

Run: `export PATH="/c/Users/bpi/tools/node-v22.14.0-win-x64:$PATH" && node --test tests/static.test.js tests/comms.test.js`
Expected: `# fail 0`.

Start a local server (Bash, `run_in_background: true`): `cd "/c/Users/bpi/Documents/Claude Code/ife-bill-tracker-external" && python -m http.server 8000`
Run: `"/c/Program Files (x86)/Google/Chrome/Application/chrome.exe" --headless --disable-gpu --virtual-time-budget=5000 --dump-dom http://localhost:8000/ > "$SCRATCH/dom5.html"`, where `$SCRATCH` is the scratchpad dir. Then grep the file for `class="bill-card"`.
Expected: the match count equals the number of `programArea: "Housing"` bills in `data/bills.json` + `data/user-bills.json` (count them with `node -e "console.log([...require('./data/bills.json'),...require('./data/user-bills.json')].filter(b=>b.programArea==='Housing').length)"`). That shows cards render from local `data/`.

- [ ] **Step 5: Commit**

```bash
git add index.html tests/static.test.js
git commit -m "Remove public write buttons; read data files directly instead of via the Worker

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Stacked briefing layout (summary, Coming up, agenda, print)

**Files:**
- Modify: `index.html`
- Modify: `tests/static.test.js`

**Interfaces:**
- Consumes: `Comms.*` (Tasks 2–3), `readDataFile`, `CURRENT_GA` (Task 5).
- Produces in `index.html` (used by Task 7): the globals `campaignDefs`, `sessionData`, `campaigns`, `parentUrl`, `embedded`; the functions `todayIso()`, `currentStatus()`, `currentGa()`, `rebuildCampaigns()`, `areaCampaigns()`, `campaignForBill(bill) -> Campaign|undefined`, `outcomePill(outcome, label) -> html`, `renderComms()`, `switchProgramArea(area)`, `requestParentScroll(el)`; element IDs `#comms`, `#session-summary`, `#coming-up`, `#agenda`, `#agenda-groups`, `#all-bills`, `#all-bills-count`, `#jump-all-bills`, `#print-agenda`, `#print-date`. Task 7 defines `openCampaign(c, anchorEl, fromLink)`. This task's click handler calls it, and until Task 7 lands, a stub is included.

- [ ] **Step 1: Add the failing static tests**

Append to `tests/static.test.js`:

```js
test('comms layer is wired in', () => {
  assert.ok(html.includes('<script src="js/comms.js"></script>'));
  for (const id of ['comms', 'session-summary', 'coming-up', 'agenda-groups', 'all-bills', 'jump-all-bills', 'print-agenda']) {
    assert.ok(html.includes(`id="${id}"`), `missing #${id}`);
  }
  assert.ok(!html.includes('id="highlights-'), 'old highlights bar still present');
  assert.ok(html.includes('@media print'));
});
```

Run: `node --test tests/static.test.js`. Expected: FAIL (`missing js/comms.js`).

- [ ] **Step 2: Replace the highlights markup with the comms layer**

In `index.html`, delete the `<!-- Highlights Bar -->` block and the `<!-- Highlights Popup -->` block. Move the existing `<!-- Program Area Tabs -->` block so it's the first thing in `<body>`. Directly after it, insert:

```html
  <!-- Comms layer: session summary, Coming up, IFE's agenda -->
  <section class="comms" id="comms" aria-label="IFE's legislative agenda">
    <div class="comms-inner">
      <button type="button" class="jump-link" id="jump-all-bills">Jump to all tracked bills &darr;</button>
      <div class="session-summary" id="session-summary"></div>
      <div class="coming-up" id="coming-up"></div>
      <div class="agenda" id="agenda">
        <div class="agenda-head">
          <h2 class="agenda-title">IFE's agenda</h2>
          <button type="button" class="print-link" id="print-agenda">Print agenda</button>
        </div>
        <div id="agenda-groups"></div>
      </div>
      <p class="print-date" id="print-date"></p>
    </div>
  </section>

  <h2 class="all-bills-heading" id="all-bills">All tracked bills (<span id="all-bills-count">0</span>)</h2>
```

Leave the `<!-- Filters -->` block and everything below it where they are.

Just before the main `<script>` tag (the one starting with `function escapeHtml`), add:

```html
  <script src="js/comms.js"></script>
```

- [ ] **Step 3: CSS**

In `<style>`, delete every rule whose selector starts with `.highlights` (including the two lines in the 768px media query). Add before `/* Responsive */`:

```css
    /* Comms layer */
    .comms { background: #eceef1; padding: 20px 24px; border-bottom: 1px solid #e0e0e0; }
    .comms-inner { max-width: 1200px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }
    .jump-link { align-self: flex-end; background: none; border: none; color: #005a8c; font: 600 13px 'Montserrat', sans-serif; cursor: pointer; padding: 0; }
    .jump-link:hover { text-decoration: underline; }
    .session-summary { background: #fff; border-top: 5px solid #003F70; border-radius: 0 0 10px 10px; box-shadow: 0 4px 16px rgba(0,0,0,0.08); padding: 18px 22px; }
    .summary-headline { font-size: 18px; font-weight: 700; color: #003F70; margin-bottom: 10px; }
    .summary-facts { display: flex; flex-wrap: wrap; gap: 24px; margin-bottom: 6px; }
    .summary-fact { font-size: 13px; color: #444; }
    .summary-fact strong { display: block; font-size: 26px; color: #005a8c; line-height: 1.1; }
    .summary-update { margin: 12px 0 0; padding: 10px 14px; border-left: 3px solid #005a8c; background: #f6f8fa; font-size: 14px; line-height: 1.55; color: #333; white-space: pre-line; }
    .summary-update-label { display: block; font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: #666; margin-bottom: 4px; white-space: normal; }
    .summary-stale { margin-top: 8px; font-size: 12px; color: #8a6d3b; }
    .coming-up, .agenda { background: #fff; border-radius: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); padding: 16px 22px; }
    .comms-label { font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: #666; margin: 0 0 8px; }
    .comms-sublabel { font-size: 12px; font-weight: 700; color: #444; margin: 12px 0 6px; }
    .comms-empty { font-size: 14px; color: #666; font-style: italic; }
    .coming-row, .agenda-row { display: flex; width: 100%; align-items: center; gap: 12px; text-align: left; background: none; border: none; border-bottom: 1px solid #eee; padding: 9px 2px; font-family: inherit; cursor: pointer; color: #222; }
    .coming-row:hover, .agenda-row:hover { background: #f6f8fa; }
    .coming-date { min-width: 96px; font-weight: 700; color: #005a8c; font-size: 13px; }
    .coming-name { flex: 1; font-weight: 600; font-size: 14px; }
    .coming-name small, .agenda-bills { color: #777; font-weight: 400; font-size: 12px; margin-left: 6px; }
    .coming-action { font-size: 12px; color: #555; }
    .agenda-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 8px; }
    .agenda-title { font-size: 20px; color: #003F70; }
    .print-link { background: none; border: none; color: #005a8c; font: 600 12px 'Montserrat', sans-serif; cursor: pointer; }
    .agenda-group { margin-top: 12px; }
    .agenda-main { flex: 1; display: flex; flex-direction: column; gap: 2px; }
    .agenda-name { font-weight: 600; font-size: 14px; }
    .agenda-bills { margin-left: 0; }
    .agenda-why { font-size: 13px; color: #555; }
    .outcome-pill { font-size: 11px; font-weight: 600; padding: 3px 9px; border-radius: 12px; white-space: nowrap; border: 1px solid transparent; }
    .outcome-law      { background: #e8f5e9; color: #1b5e20; border-color: #81c784; }
    .outcome-governor { background: #e3f2fd; color: #0d47a1; border-color: #90caf9; }
    .outcome-vetoed   { background: #fff3e0; color: #e65100; border-color: #ffb74d; }
    .outcome-moving   { background: #e3f2fd; color: #1565c0; border-color: #90caf9; }
    .outcome-stalled  { background: #f1f1f1; color: #616161; border-color: #d0d0d0; }
    .outcome-died     { background: #f5f5f5; color: #9e9e9e; border-color: #e0e0e0; }
    .all-bills-heading { max-width: 1200px; margin: 28px auto 0; padding: 0 24px; font-size: 20px; color: #003F70; }
    .card-outcome { margin-left: 6px; }
    .print-date { display: none; font-size: 11px; color: #666; }

    @media print {
      body { background: #fff; }
      .program-tabs, .jump-link, .print-link, .filters, .main-content, .all-bills-heading,
      .bill-modal-overlay, .coming-up.is-empty { display: none !important; }
      .comms { background: #fff; padding: 0; border: none; }
      .session-summary, .coming-up, .agenda { box-shadow: none; border: 1px solid #ccc; }
      .agenda-row, .coming-row { break-inside: avoid; }
      .print-date { display: block; }
    }
```

In the 768px media query, add:

```css
      .coming-row, .agenda-row { flex-wrap: wrap; }
      .coming-date { min-width: 0; }
      .summary-facts { gap: 16px; }
```

- [ ] **Step 4: Rendering JS**

In the main `<script>`, add after the `// ── State ──` block:

```js
    // ── Comms layer state ─────────────────────────────────────────────────────
    let campaignDefs = [];
    let sessionData  = null;
    let campaigns    = [];
    let parentUrl    = null;   // the IFE page URL, sent by the WordPress embed
    const embedded   = window.parent !== window;
```

Add a new section before `// ── Event listeners ──`:

```js
    // ── Comms layer ───────────────────────────────────────────────────────────
    function todayIso()      { return Comms.localIso(new Date()); }
    function currentStatus() { return Comms.sessionStatus(sessionData, todayIso()); }
    function currentGa()     { return sessionData?.ga || CURRENT_GA; }

    function rebuildCampaigns() {
      const res = Comms.buildCampaigns(legislationData, campaignDefs, sessionData, todayIso());
      campaigns = res.campaigns;
      res.warnings.forEach(w => console.warn('[campaigns]', w));
    }
    function areaCampaigns() { return campaigns.filter(c => c.programArea === currentProgramArea); }
    function campaignForBill(bill) {
      const k = Comms.normBill(bill.billNumber);
      return campaigns.find(c => c.bills.some(x => Comms.normBill(x.bill.billNumber) === k));
    }
    function outcomePill(outcome, label) {
      return `<span class="outcome-pill outcome-${outcome}">${Comms.esc(label)}</span>`;
    }
    function fmtDay(iso) {
      const [y, m, d] = iso.split('-').map(Number);
      return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    }

    function renderSummary() {
      const st = currentStatus();
      const counts = Comms.outcomeCounts(areaCampaigns());
      const facts = [
        ['law', 'became law'], ['governor', "on the governor's desk"], ['vetoed', 'vetoed'],
        ['moving', 'moving'], ['stalled', st.springEnded ? "didn't advance" : 'stalled'], ['died', 'did not pass'],
      ].filter(([k]) => counts[k])
       .map(([k, t]) => `<div class="summary-fact"><strong>${counts[k]}</strong>${Comms.esc(t)}</div>`).join('');
      const upd = Comms.staffUpdate(sessionData, currentProgramArea, st);
      const fetched = Comms.latestFetch(legislationData);
      const stale = Comms.isStale(legislationData, new Date());
      const el = document.getElementById('session-summary');
      el.innerHTML =
        (st.headline ? `<p class="summary-headline">${Comms.esc(st.headline)}</p>` : '')
        + (facts ? `<div class="summary-facts" aria-label="IFE's bills this General Assembly">${facts}</div>` : '')
        + (upd ? `<blockquote class="summary-update"><span class="summary-update-label">${Comms.esc(upd.label)}</span>${Comms.esc(upd.text)}</blockquote>` : '')
        + (stale ? `<p class="summary-stale">Status data last updated ${Comms.esc(new Date(fetched).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }))}.</p>` : '');
      el.style.display = el.innerHTML ? '' : 'none';
    }

    function renderComingUp() {
      const list = areaCampaigns();
      const rows = Comms.comingUp(list, todayIso());
      const floor = Comms.floorVotes(list);
      const el = document.getElementById('coming-up');
      let html = '<h3 class="comms-label">Coming up</h3>';
      if (!rows.length && !floor.length) {
        html += `<p class="comms-empty">${Comms.esc(Comms.comingUpEmptyText(currentStatus()))}</p>`;
      }
      html += rows.map(r => `
        <button type="button" class="coming-row" data-campaign="${Comms.esc(r.campaign.id)}">
          <span class="coming-date">${Comms.esc(fmtDay(r.date))}</span>
          <span class="coming-name">${Comms.esc(r.campaign.name)}<small>${Comms.esc(Comms.normBill(r.bill.billNumber))}</small></span>
          <span class="coming-action">${Comms.esc(r.action)}</span>
        </button>`).join('');
      if (floor.length) {
        html += '<h4 class="comms-sublabel">Awaiting a floor vote</h4>' + floor.map(c => `
          <button type="button" class="coming-row" data-campaign="${Comms.esc(c.id)}">
            <span class="coming-name">${Comms.esc(c.name)}</span>
          </button>`).join('');
      }
      el.innerHTML = html;
      el.classList.toggle('is-empty', !rows.length && !floor.length);
    }

    function renderAgenda() {
      const st = currentStatus();
      const groups = Comms.groupCampaigns(areaCampaigns());
      document.getElementById('agenda').style.display = groups.length ? '' : 'none';
      document.getElementById('agenda-groups').innerHTML = groups.map(g => `
        <div class="agenda-group">
          <h3 class="comms-label">${Comms.esc(Comms.groupHeading(g.outcome, st))} (${g.items.length})</h3>
          ${g.items.map(c => `
            <button type="button" class="agenda-row" data-campaign="${Comms.esc(c.id)}">
              <span class="agenda-main">
                <span class="agenda-name">${Comms.esc(c.name)}</span>
                <small class="agenda-bills">${c.bills.map(x => Comms.esc(Comms.normBill(x.bill.billNumber))).join(' · ')}</small>
                ${c.why ? `<span class="agenda-why">${Comms.esc(c.why)}</span>` : ''}
              </span>
              ${outcomePill(c.outcome, Comms.outcomeLabel(c.outcome, st, c.pa))}
            </button>`).join('')}
        </div>`).join('');
    }

    function renderComms() { renderSummary(); renderComingUp(); renderAgenda(); }

    // The iframe has no scrollbar of its own (the parent page scrolls it),
    // so scrolling inside the embed has to be done by the parent.
    function requestParentScroll(el) {
      const top = el.getBoundingClientRect().top + window.scrollY;
      if (embedded) window.parent.postMessage({ type: 'bill-tracker-scroll', top }, '*');
      else window.scrollTo({ top: Math.max(0, top - 20), behavior: 'smooth' });
    }

    function switchProgramArea(area) {
      if (area === currentProgramArea) return;
      document.querySelectorAll('.tab-btn').forEach(b => {
        const on = b.dataset.area === area;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', String(on));
      });
      currentProgramArea = area;
      currentFilters.stage    = "All";
      currentFilters.category = new Set();
      statusFilter.value   = "All";
      categoryFilter.classList.remove('open');
      categoryDropdownBtn.setAttribute('aria-expanded', 'false');
      populateStageFilter();
      populateCategoryFilter();
      updateCategoryBtnLabel();
      renderComms();
      renderCards();
    }

    // Replaced in Task 7.
    function openCampaign(c, anchorEl) { if (c) openModal(c.lead, anchorEl); }
```

In `init()`, after the `try { … } catch { … }` from Task 5, add:

```js
      // Comms content is optional: the tracker must render without it.
      [campaignDefs, sessionData] = await Promise.all([
        readDataFile('campaigns.json', []).catch(e => { console.warn('campaigns.json:', e); return []; }),
        readDataFile('session.json', null).catch(e => { console.warn('session.json:', e); return null; }),
      ]);
      rebuildCampaigns();
```

In `init()`, replace `updateHighlights();` with `renderComms();`.

Delete `function updateHighlights()`, `function openHighlightsPopup`, and `function closeHighlightsPopup`. Keep `positionPopupNear`. Remove every call to them: in the tab handler, in the Escape key handler, and the two "Highlights popup close handlers" at the end of `setupEventListeners`.

Replace the whole tab-button `forEach(btn => btn.addEventListener('click', …))` body with:

```js
      document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchProgramArea(btn.dataset.area));
      });
```

At the end of `setupEventListeners()`, add:

```js
      document.getElementById('comms').addEventListener('click', (e) => {
        const row = e.target.closest('[data-campaign]');
        if (row) openCampaign(campaigns.find(c => c.id === row.dataset.campaign), row);
      });
      document.getElementById('jump-all-bills').addEventListener('click', () =>
        requestParentScroll(document.getElementById('all-bills')));
      document.getElementById('print-agenda').addEventListener('click', () => {
        const area = currentProgramArea === 'CLS' ? 'Criminal Legal System' : 'Housing';
        document.getElementById('print-date').textContent =
          `${area} · Printed ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} · `
          + (parentUrl || location.origin + location.pathname);
        window.print();
      });
```

In `renderCards()`, just after `const programAreaTotal = …`, add:

```js
      document.getElementById('all-bills-count').textContent = programAreaTotal;
```

In `createCard(bill)`, change the card click to route campaign bills to the campaign window, and add the outcome next to the stage badge:

```js
      const campaign = campaignForBill(bill);
      card.onclick = () => (campaign ? openCampaign(campaign, card) : openModal(bill, card));
```

(Replace the existing `card.onclick = () => openModal(bill, card);` line with these two lines.) In the `card-footer` template, after the `status-badge` span, add:

```js
            ${(() => { const o = Comms.billOutcome(bill, sessionData, todayIso()); return `<span class="card-outcome">${outcomePill(o, Comms.outcomeLabel(o, currentStatus(), Comms.paNumber(bill)))}</span>`; })()}
```

- [ ] **Step 5: Test and check in a browser**

Run: `export PATH="/c/Users/bpi/tools/node-v22.14.0-win-x64:$PATH" && node --test tests/static.test.js tests/comms.test.js`
Expected: `# fail 0`.

With the Task 5 server still running on port 8000:
Run: `"/c/Program Files (x86)/Google/Chrome/Application/chrome.exe" --headless --disable-gpu --virtual-time-budget=5000 --window-size=1280,3000 --screenshot="$SCRATCH/task6-desktop.png" http://localhost:8000/`, and the same with `--window-size=390,4000` for `task6-phone.png`. Open both PNGs with the Read tool.
Expected: tabs at the top, then the summary headline from session.json, "3 became law", the Coming up empty-state line, "IFE's agenda" with a "Became law (3)" group, and then "All tracked bills (139)" with the filters and grid. On phone width, nothing is cut off and nothing scrolls sideways.

Check the Review Focus items by hand (restore each file afterwards with `git checkout data/…`):
- Rename `data/campaigns.json` temporarily → reload. The agenda still shows fallback campaigns under ILGA titles, and nothing else breaks.
- Put `{` into `data/session.json` → reload. There's no headline, and the agenda and tracker still render (console shows a warning).
- Temporarily set one campaign's name to `Tenants & <Landlords>` → the row shows that literal text.

- [ ] **Step 6: Commit**

```bash
git add index.html tests/static.test.js
git commit -m "Stacked briefing layout: session summary, Coming up, IFE's agenda, print view

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Campaign window, links, copy buttons

**Files:**
- Modify: `index.html`
- Modify: `tests/static.test.js`

**Interfaces:**
- Consumes: everything Task 6 produced.
- Produces: `openCampaign(c, anchorEl, fromLink=false)`, `closeCampaign()`, `openFromHash(hash) -> bool`, `setLinkHash(hash)`, `shareUrl(hash) -> string`, `copyText(text, statusEl)`. The postMessage protocol, which Task 8 relies on:
  - tracker → parent `{type:'bill-tracker-resize', height}` (exists today)
  - tracker → parent `{type:'bill-tracker-hash', hash}`: `hash` is `'#104-HB5234'`, or `''` on close
  - tracker → parent `{type:'bill-tracker-scroll', top}`: `top` is in px from the iframe's top
  - parent → tracker `{type:'bill-tracker-parent', url}`: `url` is the parent page URL without its hash

- [ ] **Step 1: Add the failing static test**

Append to `tests/static.test.js`:

```js
test('campaign window and link handling exist', () => {
  for (const id of ['campaign-modal-overlay', 'campaign-copy-link', 'campaign-copy-blurb', 'bill-modal-copy-link']) {
    assert.ok(html.includes(`id="${id}"`), `missing #${id}`);
  }
  for (const s of ['function openFromHash(', "'bill-tracker-hash'", "'bill-tracker-parent'", "'hashchange'"]) {
    assert.ok(html.includes(s), `missing ${s}`);
  }
  assert.ok(!html.includes('// Replaced in Task 7.'), 'openCampaign stub still present');
});
```

Run: `node --test tests/static.test.js`. Expected: FAIL.

- [ ] **Step 2: Markup**

After the bill modal's closing `</div>` (the end of `<div class="bill-modal-overlay" id="bill-modal-overlay">`), add:

```html
  <!-- Campaign Modal -->
  <div class="bill-modal-overlay" id="campaign-modal-overlay">
    <div class="bill-modal" role="dialog" aria-modal="true" aria-labelledby="campaign-modal-name">
      <div class="bill-modal-header" id="campaign-modal-header">
        <button class="bill-modal-close-btn" id="campaign-modal-close" aria-label="Close">&#215;</button>
        <div class="bill-modal-tags" id="campaign-modal-tags"></div>
        <h2 class="bill-modal-bill-number" id="campaign-modal-name"></h2>
        <p class="bill-modal-header-sponsor" id="campaign-modal-ga"></p>
      </div>
      <div class="bill-modal-body">
        <div id="campaign-modal-outcome"></div>
        <p class="campaign-why" id="campaign-modal-why"></p>
        <p class="campaign-note" id="campaign-modal-note"></p>
        <h4 class="bill-modal-summary-label">Bills</h4>
        <div id="campaign-modal-bills"></div>
        <details class="campaign-details">
          <summary>Bill details</summary>
          <div id="campaign-modal-details"></div>
        </details>
        <div class="bill-modal-actions">
          <button class="btn-primary" id="campaign-copy-link">Copy link</button>
          <button class="btn-secondary" id="campaign-copy-blurb">Copy blurb</button>
          <button class="btn-secondary" id="campaign-modal-close-btn">Close</button>
          <span class="copy-status" id="campaign-copy-status" aria-live="polite"></span>
        </div>
      </div>
    </div>
  </div>
```

In the bill modal's `.bill-modal-actions`, add this after the "View on ILGA.gov" link:

```html
          <button class="btn-secondary" id="bill-modal-copy-link">Copy link</button>
          <span class="copy-status" id="bill-copy-status" aria-live="polite"></span>
```

CSS, added after the comms-layer rules:

```css
    .campaign-why { margin: 12px 0 6px; font-size: 15px; line-height: 1.5; }
    .campaign-note { margin: 0 0 10px; font-size: 14px; color: #1b5e20; }
    .campaign-bill { border: 1px solid #e6e6e6; border-radius: 8px; padding: 10px 12px; margin-bottom: 8px; }
    .campaign-bill-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 14px; }
    .campaign-bill-head strong { color: #005a8c; }
    .campaign-bill-action, .campaign-bill-next { font-size: 13px; color: #555; margin: 6px 0; }
    .campaign-bill a { font-size: 13px; color: #005a8c; }
    .campaign-details { margin: 12px 0; }
    .campaign-details summary { cursor: pointer; font-weight: 600; color: #005a8c; }
    .campaign-detail-bill { margin-top: 10px; }
    .copy-status { font-size: 12px; color: #1b5e20; align-self: center; }
```

- [ ] **Step 3: JS**

Replace the Task 6 stub (the `// Replaced in Task 7.` comment and the one-line `openCampaign`) with:

```js
    // ── Campaign window + links ───────────────────────────────────────────────
    const campaignOverlay = document.getElementById('campaign-modal-overlay');
    let currentCampaign = null;

    function setLinkHash(hash) {
      history.replaceState(null, '', location.pathname + location.search + hash);
      if (embedded) window.parent.postMessage({ type: 'bill-tracker-hash', hash }, '*');
    }

    function shareUrl(hash) {
      return (parentUrl || location.origin + location.pathname) + hash;
    }

    async function copyText(text, statusEl) {
      try {
        await navigator.clipboard.writeText(text);
        statusEl.textContent = 'Copied';
      } catch {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        statusEl.textContent = ok ? 'Copied' : `Copy failed. Select and copy: ${text}`;
      }
    }

    function showOverlay(overlay, anchorEl, fromLink) {
      const box = overlay.querySelector('.bill-modal');
      positionPopupNear(box, fromLink ? document.getElementById('comms') : anchorEl);
      overlay.classList.add('visible');
      document.body.style.overflow = 'hidden';
      // positionPopupNear sets `top` in a rAF; scroll after it lands.
      if (fromLink) requestAnimationFrame(() => requestAnimationFrame(() => requestParentScroll(box)));
    }

    function openCampaign(c, anchorEl, fromLink = false) {
      if (!c) return;
      closeModal();
      currentCampaign = c;
      const st = currentStatus();
      const today = todayIso();
      document.getElementById('campaign-modal-header').className = `bill-modal-header ${c.type.toLowerCase()}`;
      document.getElementById('campaign-modal-tags').innerHTML =
        `<span class="bill-modal-tag">IFE ${Comms.esc(c.type)}</span>`
        + c.categories.map(x => `<span class="bill-modal-tag">${Comms.esc(x)}</span>`).join('');
      document.getElementById('campaign-modal-name').textContent = c.name;
      document.getElementById('campaign-modal-ga').textContent = c.ga ? `${Comms.ordinal(c.ga)} General Assembly` : '';
      document.getElementById('campaign-modal-outcome').innerHTML = outcomePill(c.outcome, Comms.outcomeLabel(c.outcome, st, c.pa));
      const why = document.getElementById('campaign-modal-why');
      why.innerHTML = c.why ? `<strong>Why it matters:</strong> ${Comms.esc(c.why)}` : '';
      why.style.display = c.why ? '' : 'none';
      const note = document.getElementById('campaign-modal-note');
      note.textContent = c.winNote || c.overrideNote || '';
      note.style.display = note.textContent ? '' : 'none';
      document.getElementById('campaign-modal-bills').innerHTML = c.bills.map(({ bill, outcome }) => {
        const next = Comms.mdyToIso(bill.nextActionDate);
        return `
        <div class="campaign-bill">
          <div class="campaign-bill-head">
            <strong>${Comms.esc(Comms.normBill(bill.billNumber))}</strong>
            ${bill.primarySponsor ? `<span>${Comms.esc(bill.primarySponsor)}</span>` : ''}
            ${outcomePill(outcome, Comms.outcomeLabel(outcome, st, Comms.paNumber(bill)))}
          </div>
          ${bill.lastAction ? `<p class="campaign-bill-action">${Comms.esc(bill.lastActionDate || '')} · ${Comms.esc(bill.lastAction)}</p>` : ''}
          ${next && next >= today ? `<p class="campaign-bill-next">Next: ${Comms.esc(bill.nextActionDate)}${bill.nextActionType ? ' — ' + Comms.esc(bill.nextActionType) : ''}</p>` : ''}
          <a href="${Comms.esc(bill.url)}" target="_blank" rel="noopener noreferrer">View on ILGA.gov &rarr;</a>
        </div>`;
      }).join('');
      document.getElementById('campaign-modal-details').innerHTML = c.bills.map(({ bill }) => `
        <p class="campaign-detail-bill"><strong>${Comms.esc(Comms.normBill(bill.billNumber))}: ${Comms.esc(bill.title)}</strong></p>
        ${bill.lastAmendmentName != null ? `<p class="card-amendment-disclaimer">⚠️ This bill has been amended. The description may not reflect the latest content. <a href="${Comms.esc(bill.url)}" target="_blank" rel="noopener noreferrer">View latest</a></p>` : ''}
        <p class="bill-modal-summary">${Comms.esc(bill.description || '')}</p>`).join('');
      document.getElementById('campaign-copy-status').textContent = '';
      document.querySelector('#campaign-modal-overlay details').open = false;
      showOverlay(campaignOverlay, anchorEl, fromLink);
      setLinkHash(Comms.hashFor(c.ga || currentGa(), (c.outcome === 'law' ? c.best : c.lead).billNumber));
    }

    function closeCampaign() {
      if (!campaignOverlay.classList.contains('visible')) return;
      campaignOverlay.classList.remove('visible');
      document.body.style.overflow = '';
      currentCampaign = null;
      setLinkHash('');
    }

    function openFromHash(hash) {
      const link = Comms.parseHash(hash, currentGa());
      if (!link || link.ga !== currentGa()) return false;
      const bill = legislationData.find(b => Comms.normBill(b.billNumber) === link.billNumber);
      if (!bill) return false;
      const c = campaignForBill(bill);
      switchProgramArea(c ? c.programArea : (bill.programArea || 'Housing'));
      if (c) openCampaign(c, null, true);
      else openModal(bill, null, true);
      return true;
    }

    window.addEventListener('message', (e) => {
      if (e.source !== window.parent || !e.data || e.data.type !== 'bill-tracker-parent') return;
      if (typeof e.data.url === 'string' && /^https?:\/\//.test(e.data.url)) parentUrl = e.data.url;
    });
```

Change `openModal`'s signature to `function openModal(bill, anchorEl, fromLink = false) {`. Replace its first two lines (`currentBill = bill;` and the `positionPopupNear(…)` call) with just `currentBill = bill;`. Then replace its last two lines (`modalOverlay.classList.add('visible');` and `document.body.style.overflow = 'hidden';`) with:

```js
      document.getElementById('bill-copy-status').textContent = '';
      showOverlay(modalOverlay, anchorEl, fromLink);
      setLinkHash(Comms.hashFor(currentGa(), bill.billNumber));
```

Replace `closeModal` with:

```js
    function closeModal() {
      if (!modalOverlay.classList.contains('visible')) return;
      modalOverlay.classList.remove('visible');
      document.body.style.overflow = '';
      currentBill = null;
      setLinkHash('');
    }
```

In `setupEventListeners()`, change the Escape handler's `closeModal();` to `closeModal(); closeCampaign();`, and add:

```js
      document.getElementById('campaign-modal-close').addEventListener('click', closeCampaign);
      document.getElementById('campaign-modal-close-btn').addEventListener('click', closeCampaign);
      campaignOverlay.addEventListener('click', (e) => { if (e.target === campaignOverlay) closeCampaign(); });
      document.getElementById('campaign-copy-link').addEventListener('click', () => {
        const c = currentCampaign;
        copyText(shareUrl(Comms.hashFor(c.ga || currentGa(), (c.outcome === 'law' ? c.best : c.lead).billNumber)),
                 document.getElementById('campaign-copy-status'));
      });
      document.getElementById('campaign-copy-blurb').addEventListener('click', () => {
        const c = currentCampaign;
        const url = shareUrl(Comms.hashFor(c.ga || currentGa(), (c.outcome === 'law' ? c.best : c.lead).billNumber));
        copyText(Comms.blurb(c, currentStatus(), url), document.getElementById('campaign-copy-status'));
      });
      document.getElementById('bill-modal-copy-link').addEventListener('click', () => {
        copyText(shareUrl(Comms.hashFor(currentGa(), currentBill.billNumber)), document.getElementById('bill-copy-status'));
      });
```

At the end of `init()`, after `setupEventListeners();`, add:

```js
      openFromHash(location.hash);
      window.addEventListener('hashchange', () => openFromHash(location.hash));
```

- [ ] **Step 4: Test and check the link cases**

Run: `export PATH="/c/Users/bpi/tools/node-v22.14.0-win-x64:$PATH" && node --test tests/static.test.js tests/comms.test.js`
Expected: `# fail 0`.

With the server on port 8000, take a headless screenshot of each URL (`--window-size=1280,2000 --virtual-time-budget=5000`) and Read each PNG:

| URL | Expected |
|---|---|
| `http://localhost:8000/#104-HB5234` | Junk-fees campaign window, "Law · PA 104-0514", both bills |
| `http://localhost:8000/#104-SB3763` | the same campaign window |
| `http://localhost:8000/#104-sb0062` | the SB62 campaign window |
| `http://localhost:8000/#HB4782` | the CLS tab is active, and the HB4782 campaign window is open |
| `http://localhost:8000/#104-HB4571` | a Watching bill: the plain bill window, with Copy link |
| `http://localhost:8000/#103-HB5234` | no window, normal page |
| `http://localhost:8000/#garbage` | no window, normal page, no console errors |

For the last row, also run `--enable-logging=stderr --v=0` and check that stderr has no `Uncaught`.

- [ ] **Step 5: Commit**

```bash
git add index.html tests/static.test.js
git commit -m "Campaign window with Copy link / Copy blurb; #104-HB5234 links

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: WordPress embed snippet and cross-origin test harness

**Files:**
- Create: `embed/wordpress-embed.html`
- Create: `embed/test-parent.html`

**Interfaces:**
- Consumes: the postMessage protocol from Task 7.

- [ ] **Step 1: Write the snippet**

Create `embed/wordpress-embed.html`:

```html
<!--
  IFE Bill Tracker — WordPress embed.
  Paste into a Custom HTML block (requires an Administrator/Editor role that can save <script>).
  Replaces the previous block. Before pasting, compare the old block's iframe
  attributes (title, width, height) and keep any that differ on purpose.
  Handles: auto-height, links like …/bill-tracker/#104-HB5234, scrolling to an opened bill.
-->
<iframe id="ife-bill-tracker"
        src="https://danielkayhertz.github.io/ife-bill-tracker-external/"
        title="Impact for Equity Illinois Bill Tracker"
        style="width:100%;border:0;min-height:900px;display:block;"
        allow="clipboard-write"
        loading="lazy"></iframe>
<script>
(function () {
  var frame = document.getElementById('ife-bill-tracker');
  var base = frame.getAttribute('src').split('#')[0];
  var origin = new URL(base, location.href).origin;
  // Incoming link: pass #104-HB5234 through to the tracker.
  if (/^#(\d+-)?[A-Za-z]+\d+$/.test(location.hash)) frame.src = base + location.hash;
  frame.addEventListener('load', function () {
    frame.contentWindow.postMessage(
      { type: 'bill-tracker-parent', url: location.origin + location.pathname + location.search }, origin);
  });
  window.addEventListener('message', function (e) {
    if (e.origin !== origin || e.source !== frame.contentWindow || !e.data) return;
    var d = e.data;
    if (d.type === 'bill-tracker-resize' && d.height > 0) {
      frame.style.height = d.height + 'px';
    } else if (d.type === 'bill-tracker-hash' && typeof d.hash === 'string') {
      history.replaceState(null, '', location.pathname + location.search + d.hash);
    } else if (d.type === 'bill-tracker-scroll' && typeof d.top === 'number') {
      var y = frame.getBoundingClientRect().top + window.pageYOffset + d.top - 20;
      window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
    }
  });
})();
</script>
```

- [ ] **Step 2: Write the local harness**

Create `embed/test-parent.html`. It's the same snippet, pointed at the local tracker, with page content above it so scrolling can be seen:

```html
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Embed test parent</title></head>
<body style="font-family:sans-serif;margin:0">
  <div style="height:600px;background:#003F70;color:#fff;padding:24px">
    Fake IFE page header (600px) — local test harness for embed/wordpress-embed.html.
    Serve the repo on :8000 (tracker) and :8001 (this page) so they are cross-origin.
  </div>
  <iframe id="ife-bill-tracker"
          src="http://localhost:8000/"
          title="Impact for Equity Illinois Bill Tracker"
          style="width:100%;border:0;min-height:900px;display:block;"
          allow="clipboard-write"></iframe>
  <script>
  /* KEEP IN SYNC with the <script> in embed/wordpress-embed.html */
  (function () {
    var frame = document.getElementById('ife-bill-tracker');
    var base = frame.getAttribute('src').split('#')[0];
    var origin = new URL(base, location.href).origin;
    if (/^#(\d+-)?[A-Za-z]+\d+$/.test(location.hash)) frame.src = base + location.hash;
    frame.addEventListener('load', function () {
      frame.contentWindow.postMessage(
        { type: 'bill-tracker-parent', url: location.origin + location.pathname + location.search }, origin);
    });
    window.addEventListener('message', function (e) {
      if (e.origin !== origin || e.source !== frame.contentWindow || !e.data) return;
      var d = e.data;
      if (d.type === 'bill-tracker-resize' && d.height > 0) {
        frame.style.height = d.height + 'px';
      } else if (d.type === 'bill-tracker-hash' && typeof d.hash === 'string') {
        history.replaceState(null, '', location.pathname + location.search + d.hash);
      } else if (d.type === 'bill-tracker-scroll' && typeof d.top === 'number') {
        var y = frame.getBoundingClientRect().top + window.pageYOffset + d.top - 20;
        window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
      }
    });
  })();
  </script>
</body>
</html>
```

- [ ] **Step 3: Check that the two scripts match**

Run: `diff <(sed -n '/^(function () {/,/^})();/p' embed/wordpress-embed.html | sed 's/^ *//') <(sed -n '/^  (function () {/,/^  })();/p' embed/test-parent.html | sed 's/^ *//' | grep -v '^/\*')`
Expected: no output, meaning the scripts are identical apart from indentation and the harness comment.

- [ ] **Step 4: Cross-origin check**

Start a second server (Bash, `run_in_background: true`): `cd "/c/Users/bpi/Documents/Claude Code/ife-bill-tracker-external" && python -m http.server 8001`
Run a headless screenshot of `http://localhost:8001/embed/test-parent.html#104-HB5234` with `--window-size=1280,1400 --virtual-time-budget=8000`, and Read it.
Expected: the fake header is scrolled away or partly visible, the iframe is taller than 900px (resize works), and the junk-fees campaign window is visible in the viewport. Headless Chrome may not run smooth scrolling. If the window isn't in view, check in Daniel's real browser in Task 9 and note it; that doesn't fail this step.

Then ask Daniel to open `http://localhost:8001/embed/test-parent.html` in a normal browser. Opening any agenda row should change the parent's address bar to `…test-parent.html#104-…`, closing it should clear the hash, and Copy link should give a `http://localhost:8001/embed/test-parent.html#104-…` URL.

- [ ] **Step 5: Commit**

```bash
git add embed/wordpress-embed.html embed/test-parent.html
git commit -m "Add WordPress embed snippet with link pass-through and a local test harness

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Docs, full verification, handoff

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update `CLAUDE.md`**

Keep the existing uncommitted "Session Continuity" section as it is. Make these edits:
- Overview: 145 bills, plus the comms layer (session summary, Coming up, IFE's agenda, campaign windows, `#104-HB5234` links).
- Architecture list: add `js/comms.js` (pure logic, `node --test tests/comms.test.js`), `data/campaigns.json` and `data/session.json` (hand-edited, never script-written), `scripts/validate_campaigns.py`, and `embed/wordpress-embed.html` (the WordPress block; `embed/test-parent.html` is the local harness on ports 8000/8001).
- Read Flow: the browser reads `raw.githubusercontent.com/.../master/data/*.json` (on localhost it reads `data/`), and there's **no Worker dependency**.
- Replace "No Cloudflare Worker. No token injection. Public repo only." with: "The external tracker no longer uses the Cloudflare Worker. The Worker (shared with the internal tracker) still exposes an unauthenticated GitHub write endpoint. Securing it is a separate, open task."
- Add a section "Upkeep (rare)":
  - Each new GA: update `session.json` (ga, gaStart, gaEnd, phases, sources) and `CURRENT_GA` in `index.html`, and archive or clear `campaigns.json`.
  - End of session: optionally set `session.json` → `updates.Housing` / `updates.CLS` to `{text, date}`.
  - When a bill becomes law: optionally add `winNote` to its campaign.
  - New endorsed bill: add a campaign. If you don't, it shows under its ILGA title, and the Action logs a warning.
- Add a section "ILGA SSL": ILGA omits its intermediate certificate. The URL is in `ILGA_INTERMEDIATE_URLS` in `scripts/update_bill_status.py`. The leaf expires 2026-12-23. If fetches fail with `CERTIFICATE_VERIFY_FAILED` after that, update the URL from the new certificate (`openssl s_client -connect www.ilga.gov:443 -servername www.ilga.gov </dev/null | openssl x509 -noout -text | grep -A2 "Authority Information"`).
- Add to "HB4782 Collision": **HB624 lives in `user-bills.json`, and `update_bills_from_csv.py` clears that file. Re-add HB624 (Endorsed, Home for Good) after any CSV migration.**
- Replace the "Last updated" line with `Last updated: <today> — comms layer (campaigns, session summary, links)`.

- [ ] **Step 2: Run the full test suite**

Run: `export PATH="/c/Users/bpi/tools/node-v22.14.0-win-x64:$PATH" && node --test tests/comms.test.js tests/static.test.js && python -m pytest tests/ -q && python scripts/validate_campaigns.py`
Expected: node `# fail 0`; pytest all passed, with 0 skipped (the live SSL test must pass, not skip); `Campaign check: 0 warning(s).`

- [ ] **Step 3: Final screenshots**

Take headless screenshots at 1280 and 390 widths for: the default page, the CLS tab (`#104-HB5287`), and one campaign window. Read each one, and check them against spec sections 1–4 (layout order, labels, counts, no horizontal overflow). For print, run `chrome --headless --print-to-pdf="$SCRATCH/agenda.pdf" http://localhost:8000/` and Read the PDF. It should show the summary and agenda only.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "Document the comms layer, upkeep, and ILGA certificate workaround

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Hand off to Daniel (don't push or merge)**

Stop the background servers. Report:
1. The branch and its commits, plus the test results.
2. The staff review table from `scratchpad/campaigns-review.md`: names and "why" lines to approve or edit, including any flagged "needs a name".
3. The session dates used, with source URLs.
4. What's needed to go live: Daniel approves the campaign text, then merge `comms-layer` → `master` and push (GitHub Pages deploys it). Then a WordPress admin pastes `embed/wordpress-embed.html` into the tracker page's Custom HTML block, checking the old block's iframe attributes first. The new tracker works under the old embed block too; only the links through IFE's page need the new block.
5. Still open: securing the Cloudflare Worker (a separate project).

Then use superpowers:finishing-a-development-branch.
