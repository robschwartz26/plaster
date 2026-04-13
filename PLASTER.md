# PLASTER

Plaster is a mobile-first event poster wall app for Portland, Oregon. It is a living digital version of a physical bulletin board — a place to discover what's happening tonight and this week through the visual language of event posters. The design is editorial, not social. The poster is the content.

---

## What Plaster Is

- Browse upcoming Portland events as a scrollable poster wall
- Pinch to adjust the grid density (1–5 columns)
- Double-tap any poster in multi-column mode to jump into 1-column view centered on that event
- In 1-column mode: full-height snap-scroll through posters one at a time, with event info in the top bar
- Filter by category or "Tonight"
- Day/night theme toggle — hidden gesture on the wordmark (swipe right to toggle)
- Admin upload page at `/admin` for adding venues and events

Plaster is not a social app. There are no accounts, no feeds, no follows on the main wall. It is a read-only discovery surface. The admin page is the only write surface for now.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | React 18 + TypeScript |
| Build | Vite (port 8081) |
| Styling | Tailwind CSS v3 + inline styles |
| Animation | Framer Motion |
| Routing | React Router v6 |
| Backend | Supabase (Postgres + Storage) |
| Fonts | Google Fonts |
| Geocoding | Mapbox Geocoding API |
| Deploy | Vercel (connected to GitHub) |

### Path alias
`@/` resolves to `./src/` — configured in both `vite.config.ts` and `tsconfig.app.json`.

### Environment variables (`.env.local`)
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_SUPABASE_SERVICE_KEY=   # used only by /admin — bypasses RLS
VITE_MAPBOX_TOKEN=            # used only for venue geocoding in /admin
```

### Dev commands
```bash
npm run dev      # start dev server on port 8081
npm run build    # production build (tsc + vite)
npm run lint     # eslint
```

---

## Design System

### Theme

Two themes: `night` (default) and `day`. Applied via `data-theme` attribute on `document.documentElement`. Toggled by swiping right on the "plaster" wordmark. Persisted in `localStorage` under key `plaster-theme`.

**Night (default):** `--bg: #0c0b0b` / `--fg: #f0ece3`
**Day:** `--bg: #f0ece3` / `--fg: #0c0b0b`

All colors use CSS custom properties — never hardcode hex values for theme-sensitive colors. Full opacity ladder defined in `src/index.css`:

```
--fg-80  --fg-65  --fg-55  --fg-40  --fg-30  --fg-25  --fg-18  --fg-15  --fg-08
--bg-50
```

Theme transitions: `background-color`, `color`, and `border-color` all transition at `150ms ease` via a global `*` rule in `src/index.css`.

### Fonts

| Class | Font | Usage |
|---|---|---|
| `font-display` | Playfair Display | Wordmark, section headings |
| `font-body` | Space Grotesk | UI chrome, inputs, info text |
| `font-condensed` | Barlow Condensed | Date indicator blocks, info bar pills |

### Layout constants (CSS vars)
```
--nav-height: 64px
--topbar-height: 52px
--dateindicator-height: 28px
--filterbar-height: 44px
```

### Scrollbars
Hidden globally — `::-webkit-scrollbar { display: none }` + `scrollbar-width: none`.

### Pinch zoom
Native browser pinch-zoom is disabled globally (`user-scalable=no` in viewport meta + document-level `touchmove` blocker in `main.tsx`). Pinch is intercepted only by the poster grid for column-count control.

---

## Component Structure

```
src/
  App.tsx                   # Router — /, /map, /venues, /you, /admin
  main.tsx                  # Root render + global touch blocker
  index.css                 # Theme tokens, global reset, font import

  components/
    Wall.tsx                # Main screen — top bar, filter bar, poster grid, bottom nav
    Wordmark.tsx            # (inside Wall.tsx) swipe-to-toggle-theme easter egg
    FilterBar.tsx           # Horizontally scrolling category chips
    PosterGrid.tsx          # Grid container — pinch gesture, scroll tracking, column state
    PosterCard.tsx          # Individual poster — 1-col and 2-5 col render paths
    DateIndicator.tsx       # Top info bar — shows date (multi-col) or event info (1-col)
    BottomNav.tsx           # Wall / Map / Venues / You tabs

  pages/
    Admin.tsx               # Password-gated admin upload page

  hooks/
    useTheme.ts             # Theme read/write/toggle — localStorage backed

  lib/
    supabase.ts             # Supabase client + DbEvent type
    adapters.ts             # mockEventToWallEvent, dbEventToWallEvent

  types/
    event.ts                # WallEvent interface

  data/
    mockEvents.ts           # 20 Portland events across 5 days (fallback when DB is empty)
```

---

## Data Flow

### WallEvent — the unified type

All UI components consume `WallEvent`. Both mock data and DB rows are normalized to this shape before rendering.

```ts
interface WallEvent {
  id: string
  title: string
  venue_name: string
  starts_at: string       // ISO datetime
  category: string
  poster_url: string | null
  color1: string          // gradient fallback color 1
  color2: string          // gradient fallback color 2
  view_count: number      // from DB; 0 for mock
  like_count: number      // always 0 — no likes table yet
}
```

### Supabase fetch

`Wall.tsx` fetches live events from Supabase on mount. Falls back to mock data if the query errors or returns nothing.

```ts
supabase
  .from('events')
  .select('*, venues(name)')
  .gte('starts_at', today)
  .order('starts_at', { ascending: true })
  .limit(200)
```

### Adapters (`src/lib/adapters.ts`)

- `mockEventToWallEvent` — maps mock shape to WallEvent, assigns `view_count: 0`
- `dbEventToWallEvent` — maps DB row to WallEvent, looks up gradient by category from `CATEGORY_GRADIENTS`

Category gradients (color1 → color2):
```
Music:    #1a0533 → #7c3aed
Drag:     #3b0764 → #ec4899
Dance:    #431407 → #f97316
Comedy:   #0f172a → #0ea5e9
Literary: #1e1b4b → #6366f1
Art:      #0a0a0a → #525252
Film:     #1a1a1a → #737373
Trivia:   #1c1917 → #78716c
Other:    #0f0520 → #8b5cf6
```

---

## PosterGrid — How It Works

`PosterGrid` is the core interactive component. It manages:

### Column count (1–5)
- State: `cols` (default 2)
- **Pinch gesture** on the scroll container changes cols 2–5
- **Ctrl+scroll** (desktop) simulates pinch
- **Double-tap** on any card in 2-5 col: jumps to 1-col centered on that event
- At 1-col, pinch is handed off to `PosterCard` for peek zoom

### 1-col snap scroll
- Cards are **direct children** of the scroll container (no grid wrapper)
- `height: 100%` resolves to `clientHeight` because there's no intermediate wrapper with `height: auto`
- `scroll-snap-type: y mandatory` + `scroll-snap-align: start` on each card

### Scroll tracking → active day
- Multi-col: `Math.floor((scrollTop + clientHeight / 2) / rowHeight) * cols`
- 1-col: `Math.round(scrollTop / clientHeight)`
- The active event index drives the `DateIndicator` in 1-col mode

### Double-tap → 1-col
1. `handleDoubleTap` finds event index in `allEvents`, stores in `pendingScrollIdx` ref, sets `cols = 1`
2. `useEffect` on `cols` fires, RAF scrolls to `idx * clientHeight` after layout settles

---

## PosterCard — Render Paths

### 1-col
- Outer div: `height: 100%`, `position: relative`, `overflow: hidden`, `scrollSnapAlign: start`
- Image: `position: absolute; inset: 0; objectFit: contain` — full artwork, letterboxed
- **No overlays of any kind** — poster is completely clean
- Peek zoom: non-passive touchstart/touchmove on cardRef, mutates imgRef transform directly (no React re-renders), springs back on release

### 2-5 col
- Outer div: `aspectRatio: 2/3`, `position: relative`, `overflow: hidden`
- Image: `objectFit: cover`
- **HeartPill** overlaid top-right: dark blur-backed pill `rgba(0,0,0,0.52)` with `♥ {like_count}`
- No other text overlays

---

## DateIndicator

Sits above the scroll container. Sticky, never scrolls.

**Date mode** (multi-col): shows three pill blocks — day label (solid), short day (outline), date (ghost). All use CSS vars — theme-adaptive.

**Event-info mode** (1-col): shows title · venue · time pills on the left, `♥ {likeCount}  👁 {viewCount}` on the right. Pill colors:
- Block 1 (title): `background: var(--fg)`, `color: var(--bg)` — fully inverts
- Block 2 (venue): `border: var(--fg-40)`, `color: var(--fg-80)`
- Block 3 (time): `color: var(--fg-65)`

Cross-fades between states via `AnimatePresence` with key `ev:{id}` vs `activeDay`.

---

## Database Schema

Supabase project: `lhetwgdlpulgnjetuope`. All tables have RLS enabled.

### `venues`
```sql
id               uuid PK
name             text NOT NULL
description      text
neighborhood     text   -- one of the 12 Portland neighborhoods
address          text
location_lat     double precision
location_lng     double precision
website          text
instagram        text   -- stored without @
avatar_url       text
cover_url        text
is_verified      boolean default false
created_by       uuid → profiles.id
created_at       timestamptz
```

### `events`
```sql
id               uuid PK
venue_id         uuid → venues.id ON DELETE CASCADE
title            text NOT NULL
description      text
category         text   -- Music | Drag | Dance | Comedy | Art | Film | Literary | Trivia | Other
poster_url       text   -- public URL from Supabase Storage (posters bucket)
starts_at        timestamptz NOT NULL
ends_at          timestamptz
is_recurring     boolean default false
recurrence_rule  text   -- FREQ=DAILY | FREQ=WEEKLY | FREQ=MONTHLY
neighborhood     text
address          text
location_lat     double precision
location_lng     double precision
view_count       integer default 0
created_at       timestamptz
```

### Other tables (not yet wired to UI)
- `profiles` — user accounts (future)
- `attendees` — event attendance (future)
- `venue_follows` — venue following (future)
- `event_wall_posts` — community posts on events (future)

### Storage
Bucket: `posters` (public). Admin uploads go to `/{uuid}.{ext}`. Public URL retrieved via `supabase.storage.from('posters').getPublicUrl(filename)`.

### RLS notes
- Select is open on all tables (anyone can read)
- Insert/update requires `auth.role() = 'authenticated'` — the `/admin` page bypasses this using the service role key via `VITE_SUPABASE_SERVICE_KEY`

---

## Admin Page (`/admin`)

Password-gated. Hardcoded password: `plaster-admin`. Unlocked state stored in `sessionStorage` under `plaster_admin_unlocked`. Replace with proper auth later.

Uses the regular `supabase` client aliased with the service role key from `VITE_SUPABASE_SERVICE_KEY` to bypass RLS.

### Section 1 — Add a Venue
Fields: name, neighborhood (dropdown), address (auto-geocoded via Mapbox → lat/lng), website, Instagram handle.

Geocoding: `https://api.mapbox.com/geocoding/v5/mapbox.places/{address}.json?...&proximity=-122.6784,45.5051` (Portland-biased).

### Section 2 — Add an Event
Fields: venue (dropdown from DB), poster image upload, title, category, date, start time, description, recurring toggle (daily/weekly/monthly).

---

## Neighborhoods (dropdown)
Northeast, Southeast, North, Northwest, Southwest, Downtown, Pearl, Alberta, Mississippi, Hawthorne, Division, Burnside

---

## Routes

| Path | Component | Status |
|---|---|---|
| `/` | `Wall` | Live |
| `/map` | Placeholder | Not built |
| `/venues` | Placeholder | Not built |
| `/you` | Placeholder | Not built |
| `/admin` | `Admin` | Live |

---

## Feature Roadmap

### Next up
- **Map view** — Mapbox GL map with venue pins, tap to see upcoming events at that venue
- **Venue detail** — upcoming events list, address, Instagram, follow button
- **Event detail** — full poster, description, time, venue info, attend button

### Future
- **User accounts** — Supabase Auth, profiles
- **Likes** — `likes` table wired to heart counter
- **Attendance** — "going" button, attendee count
- **Venue-scoped upload** — venue owners upload their own events (admin page is already structured for this)
- **Push notifications** — remind attendees an hour before event
- **Recurring event expansion** — generate individual occurrences from recurrence rules
- **Search** — full-text across titles, venues, neighborhoods

---

## Conventions

### Never do
- Hardcode `#0c0b0b` or `#f0ece3` anywhere — use `var(--bg)` and `var(--fg)`
- Use `rgba(240,236,227,...)` — that's a night-mode-only hardcode; use `var(--fg-XX)` opacity vars
- Put text overlays on poster images in the `PosterCard` render
- Use a wrapper with `height: auto` between the snap scroll container and 1-col cards — breaks `height: 100%`
- Create a new Supabase client (there is one instance in `src/lib/supabase.ts`; `/admin` imports it aliased)

### Always do
- Normalize everything to `WallEvent` before it touches UI
- Fall back to mock data when DB returns empty or errors
- Use `var(--fg-65)` or higher for any text that must be readable in day mode (30% is too faint on light bg)
- Run `npm run build` before committing to catch TypeScript errors early

### Git
Remote: `https://github.com/robschwartz26/plaster.git` — `main` branch, deployed to Vercel on push.
