# Highlights Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stat-number bar with a two-panel Highlights bar showing IFE-sponsored bill statuses and recent endorsed bill activity, filtered by program area.

**Architecture:** All changes in `index.html` (single-file SPA). Replace the CSS stats styles, the HTML stats-bar section, and the `updateStats()` JS function with new highlights equivalents. Add a popup overlay for the "Show more" endorsed activity list.

**Tech Stack:** Vanilla HTML/CSS/JS. No build step. Reuses existing `stageConfig`, `STAGE_ORDER`, `legislationData`, and `currentProgramArea` from the app.

**Note on innerHTML:** The existing codebase uses `innerHTML` throughout for rendering bill cards, modals, filters, etc. (see `renderCards()`, `populateStageFilter()`, `populateCategoryFilter()`). All data is from the app's own `bills.json` — not user input — so this plan follows the same pattern. All bill data values (billNumber, stage, url) are controlled by the update scripts, not external users.

**Spec:** `docs/superpowers/specs/2026-04-03-highlights-bar-design.md`

---

### Task 1: Replace CSS — stats bar to highlights bar

**Files:**
- Modify: `index.html:64-99` (CSS stats styles)
- Modify: `index.html:1026-1027` (CSS responsive stats rules)

- [ ] **Step 1: Replace stats CSS block with highlights CSS**

Replace lines 64-99 (from `/* Stats Bar */` through the `.stat-label` closing brace) with:

```css
    /* Highlights Bar */
    .highlights-bar {
      background: white;
      border-bottom: 1px solid #e0e0e0;
      padding: 20px 24px;
    }

    .highlights-container {
      max-width: 1200px;
      margin: 0 auto;
      display: flex;
      gap: 28px;
    }

    .highlights-panel {
      flex: 1;
    }

    .highlights-panel:first-child {
      border-right: 1px solid #e0e0e0;
      padding-right: 24px;
    }

    .highlights-panel-title {
      font-size: 11px;
      text-transform: uppercase;
      color: #666;
      letter-spacing: 1px;
      font-weight: 600;
      margin-bottom: 10px;
    }

    .highlights-sponsored-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .highlights-sponsored-row {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .highlights-bill-link {
      font-weight: 600;
      font-size: 13px;
      color: #005a8c;
      text-decoration: none;
    }

    .highlights-bill-link:hover {
      text-decoration: underline;
    }

    .highlights-stage-badge {
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 600;
    }

    .highlights-activity-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .highlights-activity-row {
      font-size: 13px;
      color: #333;
      line-height: 1.5;
    }

    .highlights-activity-row .arrow {
      color: #444;
    }

    .highlights-activity-row .date {
      color: #999;
      font-size: 12px;
    }

    .highlights-show-more {
      font-size: 12px;
      color: #1976d2;
      text-decoration: none;
      font-weight: 500;
      cursor: pointer;
      background: none;
      border: none;
      padding: 0;
      margin-top: 4px;
    }

    .highlights-show-more:hover {
      text-decoration: underline;
    }

    .highlights-empty {
      font-size: 13px;
      color: #999;
      font-style: italic;
    }

    /* Highlights Popup */
    .highlights-popup-overlay {
      display: none;
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.3);
      z-index: 1000;
      justify-content: center;
      align-items: center;
    }

    .highlights-popup-overlay.visible {
      display: flex;
    }

    .highlights-popup {
      background: #fff;
      border: 1px solid #ddd;
      border-radius: 10px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.12);
      padding: 20px;
      max-width: 480px;
      width: 90%;
      max-height: 70vh;
      overflow-y: auto;
    }

    .highlights-popup-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 14px;
    }

    .highlights-popup-title {
      font-size: 14px;
      font-weight: 700;
      color: #333;
    }

    .highlights-popup-close {
      cursor: pointer;
      font-size: 22px;
      color: #888;
      background: none;
      border: none;
      line-height: 1;
      padding: 0 4px;
    }

    .highlights-popup-close:hover {
      color: #333;
    }

    .highlights-popup-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .highlights-popup-row {
      font-size: 13px;
      display: flex;
      align-items: baseline;
      gap: 6px;
    }

    .highlights-popup-row .date {
      color: #999;
      font-size: 12px;
      margin-left: auto;
      white-space: nowrap;
    }
```

- [ ] **Step 2: Replace responsive stats rules**

In the `@media (max-width: 768px)` block (around line 1024), replace:

```css
      .stats-container { gap: 20px; }
      .stat-number { font-size: 24px; }
```

with:

```css
      .highlights-container { flex-direction: column; gap: 16px; }
      .highlights-panel:first-child { border-right: none; padding-right: 0; margin-bottom: 8px; }
```

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "style: replace stats bar CSS with highlights bar CSS"
```

---

### Task 2: Replace HTML — stats bar to highlights bar plus popup

**Files:**
- Modify: `index.html:1049-1073` (HTML stats bar section)

- [ ] **Step 1: Replace stats bar HTML**

Replace lines 1049-1073 (from `<!-- Stats Bar -->` through the closing `</div>` of `.stats-bar`) with:

```html
  <!-- Highlights Bar -->
  <div class="highlights-bar">
    <div class="highlights-container">
      <div class="highlights-panel" id="highlights-sponsored">
        <div class="highlights-panel-title">IFE-Sponsored Bills</div>
        <div class="highlights-sponsored-list" id="highlights-sponsored-list"></div>
      </div>
      <div class="highlights-panel" id="highlights-activity">
        <div class="highlights-panel-title">Recent Endorsed Bill Activity</div>
        <div class="highlights-activity-list" id="highlights-activity-list"></div>
      </div>
    </div>
  </div>

  <!-- Highlights Popup -->
  <div class="highlights-popup-overlay" id="highlights-popup-overlay">
    <div class="highlights-popup">
      <div class="highlights-popup-header">
        <span class="highlights-popup-title">Endorsed Bill Activity — Last 30 Days</span>
        <button class="highlights-popup-close" id="highlights-popup-close">&times;</button>
      </div>
      <div class="highlights-popup-list" id="highlights-popup-list"></div>
    </div>
  </div>
```

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "markup: replace stats bar HTML with highlights bar and popup"
```

---

### Task 3: Replace JS — updateStats with updateHighlights

**Files:**
- Modify: `index.html:1486-1492` (JS `updateStats` function)

- [ ] **Step 1: Replace updateStats with updateHighlights**

Replace the `updateStats` function (lines 1486-1492) with the following. Note: this uses the same `innerHTML` pattern as the existing `renderCards()`, `populateStageFilter()`, and `populateCategoryFilter()` functions in this codebase. All rendered data comes from the app's own `bills.json`, not external user input.

```javascript
    function updateHighlights() {
      const programBills = legislationData.filter(b => (b.programArea ?? "Housing") === currentProgramArea);

      // -- Left panel: Sponsored bills --
      const sponsored = programBills
        .filter(b => b.type === "Sponsored")
        .sort((a, b) => {
          const ai = STAGE_ORDER.indexOf(a.stage), bi = STAGE_ORDER.indexOf(b.stage);
          return bi - ai; // furthest along first
        });

      const sponsoredList = document.getElementById('highlights-sponsored-list');
      if (sponsored.length === 0) {
        sponsoredList.innerHTML = '<div class="highlights-empty">No sponsored bills</div>';
      } else {
        sponsoredList.innerHTML = sponsored.map(bill => {
          const sc = stageConfig[bill.stage] || { bg: '#f5f5f5', text: '#666', border: '#ddd' };
          return '<div class="highlights-sponsored-row">'
            + '<a class="highlights-bill-link" href="' + bill.url + '" target="_blank" rel="noopener noreferrer">' + bill.billNumber + '</a>'
            + '<span class="highlights-stage-badge" style="background:' + sc.bg + ';color:' + sc.text + ';border:1px solid ' + sc.border + ';">' + bill.stage + '</span>'
            + '</div>';
        }).join('');
      }

      // -- Right panel: Recent endorsed activity --
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const recentEndorsed = programBills
        .filter(b => b.type === "Endorsed" && b.stageChangedAt && new Date(b.stageChangedAt) >= thirtyDaysAgo)
        .sort((a, b) => new Date(b.stageChangedAt) - new Date(a.stageChangedAt));

      const activityList = document.getElementById('highlights-activity-list');
      if (recentEndorsed.length === 0) {
        activityList.innerHTML = '<div class="highlights-empty">No recent activity</div>';
      } else {
        const visible = recentEndorsed.slice(0, 3);
        const extra = recentEndorsed.length - 3;

        activityList.innerHTML = visible.map(bill => {
          const d = new Date(bill.stageChangedAt);
          const dateStr = (d.getMonth() + 1) + '/' + d.getDate();
          return '<div class="highlights-activity-row">'
            + '<a class="highlights-bill-link" href="' + bill.url + '" target="_blank" rel="noopener noreferrer">' + bill.billNumber + '</a>'
            + ' <span class="arrow">&rarr; ' + bill.stage + '</span>'
            + ' <span class="date">' + dateStr + '</span>'
            + '</div>';
        }).join('');

        if (extra > 0) {
          activityList.innerHTML += '<button class="highlights-show-more" onclick="openHighlightsPopup()">Show ' + extra + ' more change' + (extra === 1 ? '' : 's') + ' &darr;</button>';
        }
      }

      // -- Pre-render popup list --
      const popupList = document.getElementById('highlights-popup-list');
      popupList.innerHTML = recentEndorsed.map(bill => {
        const d = new Date(bill.stageChangedAt);
        const dateStr = (d.getMonth() + 1) + '/' + d.getDate();
        return '<div class="highlights-popup-row">'
          + '<a class="highlights-bill-link" href="' + bill.url + '" target="_blank" rel="noopener noreferrer" style="min-width:54px;">' + bill.billNumber + '</a>'
          + ' <span class="arrow">&rarr; ' + bill.stage + '</span>'
          + ' <span class="date">' + dateStr + '</span>'
          + '</div>';
      }).join('');
    }

    function openHighlightsPopup() {
      document.getElementById('highlights-popup-overlay').classList.add('visible');
    }

    function closeHighlightsPopup() {
      document.getElementById('highlights-popup-overlay').classList.remove('visible');
    }
```

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "feat: add updateHighlights function with sponsored and endorsed panels"
```

---

### Task 4: Wire up call sites and popup event listeners

**Files:**
- Modify: `index.html` — 4 existing call sites + 1 new call site + event listeners

There are 4 places that currently call `updateStats()`. Each must be changed to `updateHighlights()`. The tab-switch handler also needs a new call (it didn't call `updateStats` before because stats were not program-area-aware).

- [ ] **Step 1: Replace all updateStats() calls with updateHighlights()**

Use find-and-replace across the file. The 4 occurrences are:

1. In `loadData()` (around line 1467): `updateStats();` becomes `updateHighlights();`
2. After bill delete (around line 1762): `updateStats();` becomes `updateHighlights();`
3. After ILGA refresh (around line 1866): `updateStats();` becomes `updateHighlights();`
4. After add-bill (around line 2127): `updateStats();` becomes `updateHighlights();`

- [ ] **Step 2: Add updateHighlights() call to tab-switch handler**

In the tab-switch event listener (the `document.querySelectorAll('.tab-btn').forEach` block around line 2176), add `closeHighlightsPopup();` and `updateHighlights();` after `updateCategoryBtnLabel();` and before `renderCards();`. The block should read:

```javascript
          populateStageFilter();
          populateCategoryFilter();
          updateCategoryBtnLabel();
          closeHighlightsPopup();
          updateHighlights();
          renderCards();
```

- [ ] **Step 3: Add popup close event listeners**

In `setupEventListeners()`, find the end of the function (before its closing `}`) and add:

```javascript
      // Highlights popup close handlers
      document.getElementById('highlights-popup-close').addEventListener('click', closeHighlightsPopup);
      document.getElementById('highlights-popup-overlay').addEventListener('click', (e) => {
        if (e.target === document.getElementById('highlights-popup-overlay')) closeHighlightsPopup();
      });
```

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: wire updateHighlights to all call sites and add popup close handlers"
```

---

### Task 5: Clean up and verify

**Files:**
- Modify: `index.html` — remove any dead code

- [ ] **Step 1: Search for orphaned stats references**

Search the file for these terms and remove any remaining references:
- `stat-number`, `stat-item`, `stat-label`, `stats-bar`, `stats-container`
- `updateStats`
- `total-bills`, `endorsed-bills`, `sponsored-bills`, `opposed-bills`, `watching-bills`

These may appear in comments or the FALLBACK_DATA section. Remove any dead references.

- [ ] **Step 2: Open index.html in a browser and verify**

Test checklist:
1. Highlights bar appears below header, above filters
2. Housing tab: shows 3 sponsored bills (HB4377, HB5198, SB3084) each with colored stage badges
3. Housing tab: shows 3 most recent endorsed stage changes with bill links and dates
4. "Show N more changes" link appears if more than 3 endorsed changes in 30 days
5. Clicking "Show more" opens popup with full list of endorsed changes
6. Popup closes on X click
7. Popup closes when clicking outside
8. Switch to CLS tab: highlights update to show CLS data (HB5287 sponsored, CLS endorsed activity)
9. Switch back to Housing: highlights return to Housing data
10. Bill number links open ILGA pages in new tab
11. Mobile responsive: at narrow width, panels stack vertically

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "chore: clean up unused stats references, verify highlights bar"
```
