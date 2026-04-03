# Highlights Bar — Design Spec

## Overview

Replace the current stat-number bar (showing counts of bills by IFE type) with a two-panel "Highlights" bar that provides more actionable information: the status of IFE-sponsored bills and recent stage changes for endorsed bills. The bar is program-area-aware — it updates when switching between Housing and CLS tabs.

## Layout

Two-panel horizontal bar, positioned where the current stats bar is (below header, above filters).

### Left Panel: IFE-Sponsored Bills

Lists every sponsored bill for the selected program area, each on its own row:

```
[Bill Number (link)] [Stage Badge]
```

- **Bill number**: Linked to the bill's ILGA page (`bill.url`)
- **Stage badge**: Colored pill matching existing `stageConfig` colors (e.g., blue for "Passed House Committee", gray for "In Committee")
- Sorted by stage progression (furthest along first), using existing `STAGE_ORDER`
- Panels separated by a vertical 1px border

### Right Panel: Recent Endorsed Bill Activity

Shows the 3 most recent stage changes for endorsed bills in the selected program area:

```
[Bill Number (link)] → [New Stage]  [Date]
```

- **Bill number**: Linked to ILGA page
- **Date**: Short format (M/D), derived from `stageChangedAt`
- **Recency window**: 30 days rolling from current date
- Sorted by `stageChangedAt` descending (most recent first)
- If more than 3 changes exist in the window, show a "Show N more changes" link

### "Show More" Popup

Clicking "Show N more changes" opens a modal/popover showing the full list:

- Title: "Endorsed Bill Activity — Last 30 Days"
- Close button (X) in top-right
- Same row format as the inline list: `[Bill Number (link)] → [Stage] [Date]`
- All bill numbers link to ILGA pages
- Closes on X click or clicking outside

## Data Sources

All data comes from existing `legislationData` array in memory. No new fetches needed.

| Field | Source | Used For |
|-------|--------|----------|
| `bill.type` | bills.json | Filter: "Sponsored" or "Endorsed" |
| `bill.programArea` | bills.json | Filter by Housing/CLS tab |
| `bill.stage` | bills.json | Stage badge text + color |
| `bill.stageChangedAt` | bills.json | Recency filter (30 days) + sort order + display date |
| `bill.billNumber` | bills.json | Display text |
| `bill.url` | bills.json | ILGA link target |

## Interaction with Program Area Tabs

When the user switches between Housing and CLS:
- Both panels re-render with bills filtered to the new `currentProgramArea`
- The "Show more" popup closes if open

## Edge Cases

- **No sponsored bills for program area**: Left panel shows "No sponsored bills" in muted text
- **No endorsed stage changes in 30 days**: Right panel shows "No recent activity" in muted text
- **`stageChangedAt` is null/missing**: Exclude that bill from the endorsed activity list
- **0 extra changes beyond 3**: "Show more" link is hidden

## Styling

- Reuses existing `stageConfig` color map for stage badges
- Same font family (Montserrat) and color palette as rest of tracker
- Stage badges use the existing pill style: `background`, `color`, `border` from `stageConfig[stage]`
- Bill number links: `color: #005a8c`, no underline, underline on hover
- Section headers: 11px uppercase, `#666`, letter-spacing 1px (matches existing label style)
- Popup: white background, 1px border, 10px border-radius, drop shadow, max-width ~420px

## Responsive (Mobile)

At `max-width: 768px`:
- Panels stack vertically (left panel on top, right panel below)
- Remove the vertical border separator
- Add bottom margin between panels

## Files to Modify

- `index.html` — all changes in this single file:
  - **HTML**: Replace `.stats-bar` section with new `.highlights-bar` markup + popup
  - **CSS**: Replace `.stats-bar` / `.stat-item` / `.stat-number` styles with `.highlights-bar` styles + popup styles
  - **JS**: Replace `updateStats()` with `updateHighlights()` function; add popup open/close logic; call from all places that currently call `updateStats()` (init, tab switch, refresh, add/delete bill)
