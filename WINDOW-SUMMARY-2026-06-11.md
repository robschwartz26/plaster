# Plaster — What We Accomplished This Window
**Reconstructed: June 11, 2026** (from the "before the close" session transcript — the prior session died on `ConnectionRefused` before it could write this)

This window ran from `62bf161` (already pushed at start) through `cc11e6b` (current HEAD). Three big workstreams: **Wall refinements + the iOS 1-col tearing saga**, the **Auto-Ingest pilot** (venue scraping + Import-from-URL), and the **Staff/Admin dashboard unification**. Plus a real safety-net testing pass.

---

## State at the end of the window
- **HEAD:** `cc11e6b fix(staff): narrow dashboard respects panel chips`
- **Unpushed:** ~26–29 commits local-only. The Wall refinements were pushed mid-window; the **entire Auto-Ingest + Import-from-URL + orphan-queue line and the staff dashboard** are live on the edge-function side but **absent from plasterthewall.com until pushed**.
- **Tree:** clean except the usual untracked/loose `codebase copy.md` dump (left unstaged on purpose).
- **Migrations:** continued past 075 (window added more — admin DELETE RLS, ingest tables, orphan queue).
- **Suite at last commit:** `tsc --noEmit` clean · 7 tests passing · `npm run build` ok · `cap sync ios` ok.

---

## 1. Wall refinements & the iOS 1-col tearing saga

### Filtering & motion
- **True filtering** (`110fe9f`, and the filter-build change): chips now **remove** non-matching events from the grid instead of just fading them; date markers only render for days that still have a matching event. Done at the item-list build in PosterGrid so date-posters fall out naturally for emptied days.
- **Animated reorganization on filter change** via the **View Transitions API** (`110fe9f`) — posters slide to their new positions when a chip changes the set.
- **Animate filter-chip taps only, not search** (`7328d0b`) — search stays instant/un-animated; only chip taps trigger the transition (avoids janky reflow on every keystroke; this is what "debounce the search transition" was about).
- **Quieter trending pill** (`eef0620`) — muted grey word only, collapsed.
- **Spine retired / trending strip** housekeeping (`a831878`, reverted to bare strip in `62bf161`).
- `eb03604` — ordering fix: moved `visibleEvents` useMemo below the `searchQuery` declaration.

### 1-col persistent panel browsing
- **Persistent info-panel browsing** (`dbcdfd2`) — in 1-col, info stays info as you scroll (panel state persists across cards instead of resetting to poster).

### The iOS tearing hunt (multiple root-cause attempts)
This was the long one — poster→info swipe showed torn/ghosted rendering on iOS (WKWebView). Sequence of fixes:
- `8c11dfa` — prefetch + defer commits mid-gesture (first attempt; `fetchPanelData()` was the suspected cause).
- `dba195b` — "real root cause": gesture-scoped GPU promotion.
- `b4fd486` — active-card GPU promotion to kill residual swipe-time tear.
- `b52da3a` — **per-panel layer promotion (v3 root-cause fix)**: the actual cause was WKWebView **tile-memory exhaustion** — every card was being promoted; fixed by gating promotion per-panel.
- `3c72bbf` — fallback C: gate heavy panel content to in-view only.
- Built and later **archived/removed a "Tear Lab"** — a controlled-toggle isolation harness to stop guessing and reproduce the tear deterministically.

### Wall scale
- **Windowed infinite loading** (`b6efbf6`) — removes the event-count ceiling (no more 200/500 cap as the real limit).
- **Slimmed the events query + raised limit 200→500** (`b556688`) as an interim step.
- **Render hygiene on multi-col cards** (`252e62d`) — lazy `img` + `content-visibility`.

---

## 2. Auto-Ingest pilot (admin-first venue scraping)

A new pipeline to scrape venue websites for structured event data → pending events for review.

- **`scrape-sources` edge function** (`82f417c`) — JSON-LD → pending events.
- **Tier 1.5 endpoint audit script** (`414be92`) — venue calendars are client-rendered, so it hunts the actual JSON endpoint each page fetches.
- **Fixture verification PASSED** (`028e29a`) — found 3 / would-insert 2 / inserted on run; cleaned up test data.
- **Import from URL** (`89786ff`) — paste any event page (venue site, Eventbrite, raw JSON, etc.) and ingest one-off, ad-hoc.
- **URL hunting + hidden-endpoint probes + new-venue enrichment** (`33eb40a`) — extends adhoc mode to discover endpoints and enrich previously-unknown venues.
- **Original-voice descriptions for ALL scraped events** (`87dd091`) — editorial voice applied uniformly, not just AI-extracted ones.
- **Fuzzy venue match + bulk assignment + structured registered data** (`5ecf1d9`) — from the first real test (Kelly's Olympian, 19 found).
- **Similarity-based duplicate detection** (`e883753`).
- **Sold-out detection in the scraper** (`e30fd20`).
- **Configurable ingest horizon** (`067b8a8`) — `MAX_DAYS_OUT` (default 120) drives a single window.
- **Surface horizon-discarded events** (`cab3676`) — visibility only, no behavior change, so valid scrapes don't look broken when events fall outside the window.
- **Orphan queue** — scraped events at unknown venues get **parked instead of dropped** (recoverable rather than silently lost).
- **Raw-JSON URL support in the adhoc importer** (`d40b004`).
- QC fixes from real venue feeds: **scheme-less URL handling** ("kellysolympian.com" → no more "page fetch 0"), **HTML entity decoding** (Tribe-style feeds), **htmlToText `<header>` preservation** (Mississippi Studios theme), and **surfacing the real extraction failure reason in the UI** (`a0f24fc`).

---

## 3. Staff / Admin dashboard unification

- **`/admin` now routes to the unified staff dashboard shell** (`c9adaf0`) — one shell, role-aware.
- **Admin panel set** (`e518ef9`) — Auto-Ingest + Tools panels added; role-aware shell (admin vs worker panel sets/order).
- **Preview 'all pending' scope for admin QC** (`d050fe4`) — admins preview all pending events, not just their own.
- **"Reject all" button in the pending review queue** (`4f1e788`).
- **Venue coverage high-water mark** (`b904849`) — visibility metric, explicitly **not a gate** (dedupe stays the real guard).
- **Narrow (<900px) dashboard respects panel chips** (`cc11e6b`) — extracted `chipButtons` once; chips render in the top bar when wide and as a scrollable row under the bar when narrow. Narrow stack now maps only open panels in role order, each capped at 70vh with internal scroll; Preview keeps its 480px block; minimize buttons everywhere; empty-state hint when all chips are off.
- **Admin DELETE RLS** — added the missing DELETE policy so admins can actually delete events (the `events` table had no DELETE policy).

---

## 4. Testing & safety net
- **Rerunnable staging-trigger verification script** (`3dbef55`).
- **Recurring-date expansion extracted to a pure lib + vitest coverage** (`8c899cf`).
- **Regression tests for two silent-data-corruption behaviors** (the "Batch 4 safety net").

---

## 5. Model notes (meta, from the session)
- Confirmed this build work was happening on **Opus**; mid-window had switched to **Sonnet** at one point, switched back to **Opus** for the heavier reasoning (the tearing root-cause hunt, feedback passes).
- Briefly tried **Fable 5** ("can we use claude fable / fable 5") — newly available this Claude Code version.

---

## Suggested next steps
1. **Push.** ~26 commits are local-only — the entire Auto-Ingest + Import-from-URL + orphan-queue line and the unified staff dashboard are invisible on plasterthewall.com until you `git push`. (Edge functions are already deployed; `git push` updates web only.)
2. Run the standard gate before pushing if you've touched anything since: `npx tsc --noEmit && npm run build && npx cap sync ios`.
3. Real-venue QC continues — Kelly's Olympian / Mississippi Studios / Tribe were the test feeds; keep an eye on the orphan queue for unknown-venue parks.
