# Comms Layer for IFE-Endorsed Bills — Design Spec

**Date:** 2026-09-30
**Status:** Approved in brainstorm; awaiting written-spec review

## Goal

Make the external tracker work as a communications tool for bills IFE has endorsed or sponsored, while keeping the full tracking and lookup features (145 bills, filters, search, ILGA status) exactly as useful as they are now.

**Audiences**
1. Public and partner visitors to the tracker embedded on IFE's WordPress site.
2. IFE staff reusing tracker content in newsletters, social posts, one-pagers and end-of-session recaps.

**Maintenance constraint:** staff-written updates will be rare, only at the end of a session or when a bill becomes law. Everything that can be worked out from ILGA data and the session calendar must be worked out automatically. When staff content is missing or old, the page must still look correct.

## Current state (findings that drive this design)

- Endorsed bills show ILGA short titles ("Prop Tx - Circuit Breaker", "Government - Tech"), with no plain-language name and nothing saying why IFE cares.
- House/Senate companion bills (about 10 pairs among the 41 endorsed and sponsored bills) show as separate cards.
- The `status` field reads "Not passed into law" for every bill, including the 5 bills that are Public Acts (HB5234, SB3777, HB598, HB4217, HB4571).
- 35 of the 41 endorsed and sponsored bills were re-referred to Rules/Assignments at deadlines, but the page shows them as "In Committee".
- The highlights bar lists sponsored bills plus the last 3 stage changes for endorsed bills, using ILGA titles.
- The public page has buttons (Refresh from ILGA, Add bill, Delete bill, Refresh bill) that write to the repo through the Cloudflare Worker with no authentication. Its data reads also go through the Worker.
- `data/notes.json` contains a test note ("Notes notes notes") on HB5198.
- There's no way to link to a single bill.
- **The daily ILGA update has failed every day since 2026-09-08**, with 0/145 bills fetched. The error is `SSL: CERTIFICATE_VERIFY_FAILED — unable to get local issuer certificate` from Python's `urllib` on the GitHub runner. Fetching the same XML URL with curl from a local machine returns HTTP 403. Data is frozen at 2026-09-07.

## Page layout (stacked briefing)

The order from top to bottom is fixed. The Housing / Criminal Legal System tabs at the top control every section below them.

1. **Program area tabs** (these exist today).
2. **Session summary.**
3. **Coming up.**
4. **IFE's agenda**: campaigns in compact rows, grouped by outcome.
5. **All tracked bills (N)**: today's filters and card grid, unchanged except that each card shows its outcome as well as its stage and opens the campaign window when the bill belongs to a campaign.

A "Jump to all tracked bills" link sits at the top for lookup users. The current highlights bar is removed, because sections 2–4 replace it.

## 1. Outcomes

Outcomes are worked out **in the page (JavaScript)** from each bill's `lastAction`, the action history fields, `nextActionDate`, and `session.json`. The update script does not compute them. The labels depend on today's date, and keeping the rules in one place avoids two copies drifting apart.

### Bill-level outcome (in priority order, first match wins)

| Outcome | Rule |
|---|---|
| `law` | `lastAction` matches `/Public Act/`. The PA number is taken from the text, e.g. "104-0514". |
| `vetoed` | `lastAction` matches `/Total Veto|Amendatory Veto/` and no later override or acceptance appears. |
| `governor` | `lastAction` matches `/Sent to the Governor|Passed Both Houses/`. |
| `died` | Today is after the GA end date in `session.json`, and the bill is not `law`. |
| `stalled` | `lastAction` matches the deadline re-referral patterns: `Rule 19\(a\)`, `Rule 19\(b\)`, `Rule 3-9\(a\)`, `Rule 3-9\(b\)`. **Or**, once the spring session has ended per `session.json`, any bill that has had no action since the spring session ended and has no scheduled next action. This avoids tracking deadlines for each chamber. |
| `moving` | Everything else. |

**Display labels**

| Outcome | Label |
|---|---|
| `law` | "Law · PA 104-xxxx" |
| `vetoed` | "Vetoed · override possible" |
| `governor` | "On the governor's desk" |
| `died` | "Died with the 104th GA" |
| `stalled` | **"Stalled"** while a session phase is active. **"Didn't advance this session"** once the spring session has ended. |
| `moving` | "Moving" |

The exact regexes are finalized during planning against the real `lastAction` values in `bills.json` and the action histories.

### Campaign-level outcome

A campaign shows the **furthest-along** outcome of its bills, ranked law > governor > vetoed > moving > stalled > died. A staff `outcomeOverride` in `campaigns.json` replaces it, with an optional `overrideNote` (e.g. "Passed as part of the budget (SB250)").

### Status field

The contradictory `status` field is no longer displayed anywhere. Outcome replaces it. The stage labels stay on full-tracker cards.

## 2. Coming up

- **Source:** the `nextActionDate` / `nextActionType` fields that the update script already collects.
- **Scope:** only bills that belong to a campaign (endorsed and sponsored).
- **Window:** the next 14 days, sorted by date.
- **Row:** date and weekday, the committee or action text, the campaign name, and a link that opens the campaign window.
- **Awaiting a floor vote:** campaigns whose furthest bill's last action puts it on the 3rd Reading calendar (`/Calendar Order of 3rd Reading/`, finalized in planning) appear in a separate "Awaiting a floor vote" group, because ILGA rarely schedules floor votes in advance.
- **Witness slips:** add a "File a witness slip" link to each hearing row **only if** planning confirms that ILGA's bill or hearing data gives a usable URL. Otherwise it's dropped, without a placeholder.
- **Empty state:** one line based on the session phase, e.g. "No hearings scheduled. Bills can move again during veto session, Oct X–Y and Nov X–Y."
- **Update frequency:** change the Action's cron from daily to every 3 hours. It only commits when data changed.
- The full tracker's existing "Upcoming hearing" filter is unchanged.

## 3. Session summary

**Headline**, generated from today's date and `session.json`. Examples:
- "Spring session is over. Veto session: Oct X–Y and Nov X–Y."
- "Veto session is in progress: week 1 of 2."
- "The 105th General Assembly begins [date]."

**Counts**, generated per program area from campaign outcomes: Became law · On the governor's desk · Vetoed · Moving · Stalled/Didn't advance. A zero count is hidden.

**Staff paragraph** (optional, one per program area, in `session.json`). It shows with a date label, *"IFE update, June 2026"*, and hides automatically once the GA it belongs to has ended.

## 4. IFE's agenda (compact rows)

- **Groups, in this order:** Became law · On the governor's desk · Vetoed · Moving · Stalled/Didn't advance · Died. Each heading shows its count. Empty groups are hidden.
- **Row:** campaign name, the companion bill numbers in small text, "why it matters" on a second line, and an outcome pill on the right. The whole row opens the campaign window.
- **Order within a group:** sponsored campaigns first, then by the most recent `lastActionDate`.

### Campaign window

This replaces the bill modal for bills that belong to a campaign. Watching and Opposed bills keep the current bill modal.

- Header: the IFE position tag, category tags, the campaign name, "104th General Assembly".
- The outcome pill, with the PA number when it's law.
- "Why it matters" (falls back to the lead bill's ILGA title when missing).
- The win line, if present.
- A row for each bill: bill number, sponsor, outcome pill, last action and date, next action if any, and the ILGA link.
- A "Bill details" section, collapsed by default, with the official description and the existing amendment warning.
- **Copy link** copies the IFE page URL with `#104-HB5234`, or the GitHub Pages URL when the page isn't embedded.
- **Copy blurb** copies text built from a template, e.g. "IFE-endorsed: Ban landlord junk fees (HB5234) was signed into law as Public Act 104-0514. [link]". There's one template per outcome.
- Bill modals for bills not in a campaign also get Copy link.

When a window is opened from a link (no click to position it against), the page scrolls to the top of the tracker and the window opens there.

## 5. Data files

### `data/campaigns.json` (new, hand-edited, never written by scripts)

```json
[
  {
    "id": "landlord-junk-fees",
    "ga": 104,
    "programArea": "Housing",
    "name": "Ban landlord junk fees",
    "why": "Caps the fees landlords can charge tenants on top of rent.",
    "bills": ["HB5234", "SB3763"],
    "leadBill": "HB5234",
    "winNote": null,
    "outcomeOverride": null,
    "overrideNote": null
  }
]
```

- Every Endorsed or Sponsored bill should belong to exactly one campaign.
- If an Endorsed or Sponsored bill has no campaign, the page creates a **single-bill fallback campaign** under its ILGA title and shows it normally. The update script logs a warning.
- **I draft the first version**: I pair bills with identical ILGA titles, add known cross-title pairs, and draft names and "why" lines from the bill descriptions. Staff review it once.
- Known pairing: **Home for Good** = SB4162 + HB624. Both are Endorsed, and HB624's `type` changes from Watching to Endorsed in `user-bills.json`.

### `data/session.json` (new, hand-edited)

```json
{
  "ga": 104,
  "gaStart": "YYYY-MM-DD",
  "gaEnd": "YYYY-MM-DD",
  "phases": [
    {"name": "Spring session", "start": "…", "end": "…"},
    {"name": "Veto session", "start": "…", "end": "…"},
    {"name": "Lame duck session", "start": "…", "end": "…"}
  ],
  "updates": {
    "Housing": {"text": "…", "date": "2026-06-15"},
    "CLS": null
  }
}
```

All dates are filled from ILGA's published session calendar during implementation. None come from memory. The values shown above are placeholders for the shape only.

### Links

- The format is `#<GA>-<billNumber>`, e.g. `#104-HB5234`. The parser accepts `SB0062` and `SB62`, and upper or lower case.
- A link to any bill in a campaign opens that campaign.
- A link without the GA, e.g. `#HB5234`, is treated as the current GA.
- An unknown bill leaves the page on its default view, with no error.
- Opening a window sets the hash with `history.replaceState`, and closing it clears the hash.

## 6. WordPress embed (option 1)

A complete replacement Custom HTML block, saved in the repo as `embed/wordpress-embed.html`. It contains:

- the `<iframe>` pointing to the GitHub Pages URL;
- a resize listener for `bill-tracker-resize` messages (the tracker already sends them);
- **incoming links:** on load, if the parent URL has a bill hash, it's added to the iframe `src`;
- **outgoing links:** the tracker sends `{type: 'bill-tracker-hash', hash}` when a window opens or closes, and the parent updates its own address bar with `history.replaceState`;
- **scrolling:** the tracker sends `{type: 'bill-tracker-scroll', top}` when a window opens from a link, and the parent scrolls to it;
- a check on the message origin (`event.origin === 'https://danielkayhertz.github.io'`).

The tracker learns the parent page URL for Copy link from a `PARENT_URL` constant, and falls back to its own URL when not embedded.

Someone with a WordPress Administrator (or Editor, depending on the site) role pastes the block, because other roles have `<script>` stripped. The old block's iframe attributes (title, width) are checked against the new one when it's pasted, since the old block was never saved.

## 7. Printable snapshot

A `@media print` stylesheet prints the session summary and IFE's agenda (all groups expanded, "why it matters" included) on a clean page. Filters, the full tracker, buttons and Coming up (when empty) are hidden. The print date appears at the bottom. It's started from a "Print agenda" link next to the agenda heading.

## 8. Security and cleanup

- Remove the public write buttons and their code: `refreshAllFromILGA`, `refreshBillILGA`, `deleteBill`, `addBill`/`lookupBillILGA` and their UI, and `writeGitHubFile`. From now on, bills are added through the repo.
- Change the data reads from the Worker proxy to `https://raw.githubusercontent.com/danielkayhertz/ife-bill-tracker-external/master/data/<file>`. After this change, the external tracker does not depend on the Worker. The `FALLBACK_DATA` fallback stays.
- Delete the test note from `data/notes.json`.
- Add `.superpowers/` to `.gitignore`.

## 9. Phase 0: restore the ILGA update (prerequisite)

Coming up and the outcomes depend on current data. Before any feature work:

1. Diagnose the `CERTIFICATE_VERIFY_FAILED` error. It's likely that ILGA's server stopped sending its intermediate certificate, or changed certificate authority. Fix it properly: install `certifi` and/or supply the missing intermediate. Do **not** disable verification.
2. Check whether ILGA now blocks non-browser clients (the local 403). If it does, send an honest identifying User-Agent, and change the fetch path only if needed.
3. Add a staleness signal. If `ilgaFetchedAt` is more than 3 days old, the page shows a subtle "Status data last updated [date]" note by the summary. The Action already exits with code 1 when every fetch fails, and that behavior stays.

## Out of scope

- **The Worker security fix.** The Worker's write endpoint is exposed to anyone who reads the page source, and the internal tracker also depends on it. This is a **separate small project, to be done soon**. It needs the Worker's code, which hasn't been reviewed yet.
- Per-bill static preview pages for social link cards.
- "IFE's ask" / call-to-action text, which would go stale between the rare updates.
- Calendar (.ics) exports.
- Any change to the internal tracker.

## Testing

- **Outcome rules:** a table-driven test over the real `lastAction` strings in `bills.json`, with an expected outcome for each distinct string, plus date-based cases (the Stalled vs. Didn't advance label, died after the GA end).
- **Link parsing:** padded and unpadded numbers, a missing GA, case differences, an unknown bill, and a companion bill opening its campaign.
- **Campaign validation:** every Endorsed and Sponsored bill resolves to one campaign or a fallback, and no bill appears in two campaigns. This runs in the update Action as a warning.
- **Embed:** a local test parent page that hosts the tracker in an iframe, used to check incoming and outgoing links, resizing and scrolling.
- **Manual pass in a real browser:** the embedded and direct URLs, both program tabs, phone width, and print preview.
