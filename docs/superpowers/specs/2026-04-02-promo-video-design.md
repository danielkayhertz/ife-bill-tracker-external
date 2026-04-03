# IFE Springfield Bill Tracker — Promo Video Design Spec

**Date:** 2026-04-02
**Format:** 1080×1920 vertical (Instagram Reels / TikTok / YouTube Shorts)
**Duration:** ~41 seconds (5 scenes, 30fps)
**Tech:** Remotion (new standalone project)
**Reference:** Housing Advocates Guide promo video (`C:\Users\bpi\Documents\Claude Code\housing-advocates-guide-2\promo-video\`)

---

## Audience

Primary: Housing and CLS advocates/nonprofits who would use the tracker regularly.
Secondary: General public / Illinois residents curious about legislation.
Lead with advocates; keep it accessible to everyone.

## Tone

Friendly, clear, professional. Make people excited to use it and help them understand what it can do.

## Core Message Arc

Problem → Solution → Features → Credibility → Action

---

## Scene Breakdown

### Scene 1 — Hook (6 seconds / 180 frames)

**Background:** Dark navy (#003F70)

**Content:**
- Headline: "Every year, hundreds of bills are introduced in the Illinois legislature that affect **housing** and **criminal legal system reform**."
- Detail pills animate in one by one: `committees` · `amendments` · `sponsors` · `deadlines` · `hearings` · `floor votes`
- Question in orange: "How do you keep track of what matters?"

**Animation:**
- 0–60f: Headline fades in with spring easing. "Housing" and "criminal justice" in orange (#F37021).
- 60–120f: Detail pills appear staggered (~10f each), light blue text (#84B8E3) on translucent white pill backgrounds.
- 130–180f: Orange question fades up from bottom.

---

### Scene 2 — Reveal (7 seconds / 210 frames)

**Background:** Gradient (#005a8c → #007bb8)

**Content:**
- "Introducing" label (small, uppercase, translucent)
- Title: "Impact for Equity's Springfield Bill Tracker"
- Orange divider line
- Tagline: "Track dozens of housing and criminal legal system reform bills in the Illinois legislature — updated daily."
- Badge: "Free · No login required"

**Animation:**
- 0–30f: "Introducing" fades in
- 30–75f: Title scales in (0.85 → 1.0) with spring
- 75–105f: Orange divider wipes in from center
- 105–150f: Tagline slides up from bottom
- 150–210f: "Free · No login" badge fades in

---

### Scene 3 — Filter Demo (9 seconds / 270 frames)

**Background:** Off-white (#F5F7FA)

This is the hero scene. Shows the power of stacking filters to find exactly what you need.

**Content:**
- Headline: "Find exactly what you need"
- Mockup filter bar with:
  - Program area tabs: **Housing** (active, blue) | CLS (inactive, gray)
  - Type filter: switches to "Endorsed" (orange highlight border)
  - Search bar: typing animation "zoning"
- Result count: "Showing **8** of 137 Housing bills"
- Two bill cards matching the dashboard design:
  - Gradient header bar (blue for endorsed)
  - Tags row: type badge + category tag
  - Bill number (large, bold, blue)
  - Sponsor name
  - Title + truncated description
  - Last action with date
  - Footer with stage badge

**Animation:**
- 0–40f: Headline + filter bar fade in
- 40–80f: "Housing" tab highlights (simulated click)
- 80–120f: Type filter animates to "Endorsed"
- 120–170f: Search bar typing "zoning" (one char at a time)
- 170–200f: Count updates: "Showing 8 of 137 Housing bills"
- 200–270f: Two result cards slide in from bottom with staggered spring

**Note:** Bill numbers and titles are illustrative — use real bills from bills.json at implementation.

---

### Scene 4 — Always Current (7 seconds / 210 frames)

**Background:** Light blue tint (#e8f4f8)

Shows bill statuses updating automatically — makes the daily ILGA update tangible.

**Content:**
- Headline: "Always up to date"
- Subtext: "Bill statuses update automatically every day from the Illinois General Assembly."
- A single bill card showing stage progression:
  - "In House Committee" (faded, Mar 1) → arrow
  - "Passed House" (faded, Mar 18) → arrow
  - **"Senate Committee Hearing"** (highlighted with orange border, "Today")
- ILGA source badge: 🏛️ "Sourced from **ILGA.gov**"

**Animation:**
- 0–40f: Headline + subtext fade in
- 40–70f: Card appears with "In House Committee" stage
- 70–110f: Arrow draws down, "Passed House" slides in
- 110–150f: Arrow draws down, "Senate Committee Hearing" slides in with orange highlight
- 150–180f: "Today" label appears
- 180–210f: ILGA.gov source badge fades in

---

### Scene 5 — Call to Action (7 seconds / 210 frames)

**Background:** Dark navy (#003F70) — bookends with Scene 1

**Content:**
- Label: "Explore the tracker at"
- URL: **impactforequity.org** (large, orange, spring bounce)
- Orange divider line
- Badge: "Free · No login required"
- "A project of" + Impact for Equity logo (vertical reverse variant)

**Animation:**
- 0–30f: "Explore the tracker at" fades in
- 30–75f: URL scales in (0.6 → 1.0) with spring bounce
- 75–105f: Orange divider wipes in + "Free" badge fades in
- 105–150f: "A project of" + IFE logo fade in
- 150–210f: Hold — everything visible, music fades out

---

## Transitions

12-frame (~0.4s) fade transitions between all scenes using `@remotion/transitions`. Snappy enough for social media.

## Audio

- Background music: Low-volume ambient track (~18% volume), similar style to "Fresh Morning" from the housing guide video. User will source from the same royalty-free site.
- Fade in: 30 frames (1 second)
- Fade out: 45 frames (1.5 seconds) during Scene 5 hold

## Color Palette

Matches the bill tracker dashboard:

| Name | Hex | Usage |
|------|-----|-------|
| Navy | #003F70 | Hook/CTA backgrounds |
| Blue | #005a8c | Dashboard header, headings |
| Light Blue | #007bb8 | Gradients |
| Sky | #2899D5 | Category tags |
| Light Sky | #84B8E3 | Detail pill text |
| Orange | #F37021 | Accent, highlights, CTA |
| Amber | #e98300 | Endorsed stat color |
| Indigo | #5c6bc0 | Sponsored/Watching |
| Red | #c62828 | Opposed |
| Gray | #6b7280 | Watching stat |
| Off-white | #F5F7FA | Light backgrounds |
| Light tint | #e8f4f8 | Scene 4 background |

## Typography

- Primary: Montserrat (Google Font, matches dashboard)
- Weights: 400, 600, 700
- Sizes: Range from 11px (tags) to 42px (counters) — scaled for 1080px width

## Project Structure (New Standalone)

```
ife-bill-tracker-video/
├── public/
│   ├── audio/
│   │   └── background.mp3
│   └── logos/
│       └── logo-vertical-reverse.png
├── src/
│   ├── components/
│   │   ├── shared/
│   │   │   ├── AnimatedText.tsx
│   │   │   └── Background.tsx
│   │   ├── Hook.tsx
│   │   ├── Reveal.tsx
│   │   ├── FilterDemo.tsx
│   │   ├── AlwaysCurrent.tsx
│   │   └── CallToAction.tsx
│   ├── data/
│   │   └── script.ts
│   ├── Root.tsx
│   ├── Video.tsx
│   ├── theme.ts
│   └── index.ts
├── remotion.config.ts
├── package.json
└── tsconfig.json
```

## Reusable Patterns from Housing Guide Video

- `AnimatedText` component (delay/direction system) — port and adapt
- `Background` component (AbsoluteFill wrapper)
- `TransitionSeries` pattern for scene sequencing
- `script.ts` data structure separating content from animation logic
- `theme.ts` pattern for centralized color/dimension constants
- Spring physics approach (damping: 200 for text, damping: 20 / stiffness: 120 for scale)

## Assets Needed

- [ ] IFE logo (vertical reverse variant) — copy from housing guide project
- [ ] Background music MP3 — user will source
- [ ] Real bill data for filter demo cards — pull from bills.json

## Verification

1. Run `npm run studio` to preview in Remotion Studio
2. Verify each scene renders correctly at 1080×1920
3. Check transition timing between scenes
4. Verify spring animations feel natural (not too bouncy, not too stiff)
5. Render with `npm run render` and review full video
6. Confirm total duration is ~41 seconds
7. Test that bill card mockups visually match the actual dashboard
