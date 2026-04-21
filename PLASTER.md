# PLASTER — Complete Project Brief
**Last updated: April 17, 2026 — Sessions 1–10 complete**
Read this entire document before touching any code.

---

## What Plaster Is

Plaster is a living Portland event poster wall. It is the telephone pole outside the venue, the cork board at the record store, the flyer in your jacket pocket you forgot about until it fell out three days later. Portland's cultural life made visible, beautiful, and shareable.

It is not Eventbrite. It is not a calendar app. It is not Instagram for shows. It is a place where the art of going out — the discovery, the anticipation, the shared excitement, the memory of having been there — lives as a first-class citizen.

---

## Live URLs & Repos
- **Live:** https://the-plaster-wall.vercel.app
- **GitHub:** robschwartz26/plaster
- **Local dev:** localhost:8081 (`npm run dev` from ~/plaster)
- **Admin:** /admin — password: Plast3r!PDX#26
- **Supabase project:** lhetwgdlpulgnjetuope (us-west-1)

---

## Tech Stack
- **Frontend:** React + TypeScript + Vite + Tailwind
- **Backend/DB:** Supabase (auth, DB, storage)
- **Map:** Mapbox GL JS
- **Hosting:** Vercel (auto-deploys from GitHub main)
- **AI:** Claude Vision via Supabase Edge Function (extract-poster)
- **Storage buckets:** posters (public), avatars (public)

---

## Environment Variables
```
VITE_SUPABASE_URL=https://lhetwgdlpulgnjetuope.supabase.co
VITE_SUPABASE_ANON_KEY=(set)
VITE_SUPABASE_SERVICE_KEY=(set)
VITE_MAPBOX_TOKEN=(set)
VITE_ADMIN_PASSWORD=Plast3r!PDX#26
VITE_ANTHROPIC_API_KEY=(set — also Supabase secret ANTHROPIC_API_KEY)
```

---

## Navigation — 5 Tabs (LOCKED IN)

**LINE UP · MAP · WALL · VENUES · YOU**

- **LINE UP** — social activity feed + diamond queue of upcoming RSVPs (replaced "Tonight")
- **MAP** — Mapbox map with venue pins, knurl wheel day scrubber
- **WALL** — the poster grid (heart of the app)
- **VENUES** — being replaced with **MSG** (messaging) in next session
- **YOU** — user profile, attended events, superlatives

Tab name "Tonight" is GONE. It is now "LINE UP". This is permanent.
Venues tab is being replaced with MSG tab next session.

---

## Database Schema

### Tables
- **profiles** — id, username, avatar_url, bio, is_public, interests[], created_at
- **venues** — id, name, neighborhood, address, location_lat, location_lng, website, instagram, cover_url, description, hours, created_at
- **events** — id, venue_id, title, category, poster_url, starts_at, ends_at, view_count, like_count, neighborhood, address, description, is_recurring, recurrence_rule, recurrence_group_id (uuid), recurrence_frequency (text), fill_frame (bool default false), focal_x (float default 0.5), focal_y (float default 0.5), poster_offset_y (int default 0), created_at
- **attendees** — id, event_id, user_id, created_at
- **event_likes** — id, event_id, user_id, created_at
- **event_wall_posts** — id, event_id, user_id, content, like_count, created_at
- **post_likes** — id, post_id, user_id, created_at
- **follows** — id, follower_id, following_id, status (pending/accepted), created_at
- **superlatives** — id, user_id, venue_id, title, awarded_at
- **admin_notifications** — id, type, title, message, event_id, recurrence_group_id, snoozed_until, dismissed (bool), created_at

### RLS
- Events UPDATE: "Admin can update events" — `USING (true) WITH CHECK (true)` — already applied
- All standard select/insert/delete policies in place

### Pending SQL (run if columns missing)
```sql
ALTER TABLE events ADD COLUMN IF NOT EXISTS fill_frame boolean DEFAULT false;
ALTER TABLE events ADD COLUMN IF NOT EXISTS focal_x float DEFAULT 0.5;
ALTER TABLE events ADD COLUMN IF NOT EXISTS focal_y float DEFAULT 0.5;
ALTER TABLE events ADD COLUMN IF NOT EXISTS poster_offset_y integer DEFAULT 0;
ALTER TABLE events ADD COLUMN IF NOT EXISTS recurrence_group_id uuid;
ALTER TABLE events ADD COLUMN IF NOT EXISTS recurrence_frequency text;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS hours text;
CREATE TABLE IF NOT EXISTS superlatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  venue_id uuid REFERENCES venues(id) ON DELETE SET NULL,
  title text NOT NULL,
  awarded_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS admin_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  event_id uuid REFERENCES events(id) ON DELETE SET NULL,
  recurrence_group_id uuid,
  snoozed_until timestamptz,
  dismissed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
```

---

## Design System (LOCKED IN — DO NOT CHANGE)

### Colors
- Night mode (default): background #0c0b0b, text #f0ece3
- Day mode: background #f0ece3, text #0c0b0b
- Theme toggle: swipe "plaster" wordmark RIGHT — spring bounce, persisted in localStorage
- CSS vars: --bg, --fg, --fg-08, --fg-15, --fg-18, --fg-25, --fg-30, --fg-40, --fg-55, --fg-65, --fg-80
- Accent/button color: #A855F7 (purple) — solid background, white text, no approval needed

### Typography
- **Playfair Display 900** — wordmark + headings (drama of a poster headline)
- **Barlow Condensed 700/900** — date blocks, chip labels, nav labels (compressed urgency of a show bill)
- **Space Grotesk** — UI, body text (friendly, modern, legible)
These three fonts are not interchangeable. They are Plaster's identity.

### Hearts
- Unicode ♥ only — NEVER emoji ❤️ (renders red on iOS)
- Never red anywhere in the app

### Diamonds
The diamond shape (a square standing on its tip) is Plaster's signature motif. It appears in:
- LINE UP queue (upcoming RSVP icons on the right edge)
- Feed avatars (user/venue/artist identity in the activity feed)
- Profile pictures throughout the app
It feels cut, not rendered. Like a marquee, a suit of cards, something on a leather jacket at a show.
Implementation: `clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)`
Poster images inside diamonds are always UPRIGHT — the diamond is a mask, not a rotation.

---

## Wall Screen (src/components/Wall.tsx)

### Sampled Color Backdrop — DO NOT REMOVE EVER
This is the most important design feature in the app. Every poster card has a unique atmospheric halo — the poster's own colors bleeding into the space around it. Generated by sampling the 4 corner pixels of each poster image.

```typescript
// DO NOT REMOVE — sampled backdrop is core design feature
function usePosterBackdrop(posterUrl: string | null) {
  const [backdrop, setBackdrop] = useState<string | null>(null)
  useEffect(() => {
    if (!posterUrl) return
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const SIZE = 40
        const canvas = document.createElement('canvas')
        canvas.width = SIZE; canvas.height = SIZE
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0, SIZE, SIZE)
        const d = ctx.getImageData(0, 0, SIZE, SIZE).data
        function px(x: number, y: number) {
          const i = (y * SIZE + x) * 4
          return `${d[i]},${d[i+1]},${d[i+2]}`
        }
        const tl = px(2, 2); const tr = px(SIZE-3, 2)
        const bl = px(2, SIZE-3); const br = px(SIZE-3, SIZE-3)
        setBackdrop(`conic-gradient(from 0deg at 50% 50%, rgb(${tl}), rgb(${tr}), rgb(${br}), rgb(${bl}), rgb(${tl}))`)
      } catch { setBackdrop(null) }
    }
    img.onerror = () => setBackdrop(null)
    img.src = posterUrl
  }, [posterUrl])
  return backdrop
}
```

In 2-5 col grid — must use this exact pattern:
```tsx
{event.poster_url ? (
  <>
    <div style={{ position: 'absolute', inset: 0, background: sampledBackdrop ?? gradient, transition: 'background 0.3s ease' }} />
    <img src={event.poster_url} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: event.fill_frame ? 'cover' : 'contain', objectPosition: `${(event.focal_x??0.5)*100}% ${(event.focal_y??0.5)*100}%` }} />
  </>
) : (
  <div style={{ position: 'absolute', inset: 0, background: gradient }} />
)}
```

### Grid
- **Default: 5 columns** (changed from 2 — this is permanent)
- Pinch zoom changes columns 1–5
- 2px gap, edge to edge
- No mock events — only real Supabase data. If no events, show empty wall.
- Tonight events (starts_at is today): 2px line at top of card — `rgba(240,236,227,0.6)` on dark, same on light

### 1-Column Mode
- Double tap any poster → jumps to 1-col centered on that poster
- Swipe RIGHT through: Poster → Info panel → Post wall → back to Poster
- 60° angle swipe threshold
- Date pill: bottom-right of poster, sharp corners (border-radius: 0), format "WED APR 16", var(--bg)/var(--fg), fully opaque, sits at very bottom of screen
- Pinch peek zoom up to 3x, springs back on release

### Filter Chips (src/components/FilterBar.tsx) — LOCKED IN
- **'All' and '♥'** are fixed left anchors inside a solid-background container (var(--bg), z-index 10)
- They act as a "magic wall" — carousel chips disappear cleanly behind them
- Category chips: Music, Drag, Dance, Art, Film, Literary, Trivia, Other
- Chips rendered tripled ([...cats, ...cats, ...cats]) for infinite loop illusion
- Active chip snaps to RIGHT_MARGIN=16px from right edge of carousel window
- Snap algorithm: SAFE=1, GAP=6, find nearest chip boundary position, apply `bestOffset - SAFE`
- `activePosterCategory` prop: in 1-col scroll, highlights matching chip without filtering the wall
- 'All' chip does NOT highlight when activePosterCategory is active (only manual taps highlight All)
- Chip sizes and gaps: all 6px — equidistant between All, ♥, and first carousel chip

---

## Admin Mode

### Unlocking
- Visit /admin → enter password → sets `sessionStorage.plaster_admin_unlocked = '1'`
- Wall re-checks on window focus events
- "Edit" pill appears in Wall top bar
- Tap Edit → isAdminMode = true → ✏️ button on every poster card

### Edit Button Positions
- 1-col: absolutely positioned bottom-right, outside carousel strip, zIndex 20
- 2-5 col: bottom-left of grid card, zIndex 3

### AdminEditModal (src/components/AdminEditModal.tsx)
**Crop tool:**
- 8 drag handles (20×20 touch targets), dark mask outside crop rect
- Positioned relative to actual image element via getBoundingClientRect — NOT modal container
- Live preview canvas (72×108px, 2:3 ratio), updates on every drag
- Smart snap REMOVED — was broken, caused more problems than it solved
- Touch events: global touchmove with passive:false + preventDefault when dragging

**Fill frame + focal point:**
- Fill frame toggle + Apply button — saves fill_frame, focal_x, focal_y to DB
- When fill_frame ON: draggable 160×240 preview card, drag to reposition, updates objectPosition live
- No imgCacheRef dependency — just a plain img tag in the preview

**Poster position (offset):**
- Vertical drag on full poster → updates poster_offset_y (-50 to +50)
- Horizontal drag → poster_offset_x
- Applied in PosterCard as CSS transform: `translate(x%, y%)`

**Save Crop flow:**
1. optimizeImage(imageFile, editCrop) → cropped JPEG blob (max 1200px, JPEG 85%)
2. Upload to posters bucket → new filename with timestamp
3. supabase.from('events').update({ poster_url: newUrl }).eq('id', event.id)
4. onCropSaved(newUrl) → Wall adds ?t=Date.now() cache-bust → PosterCard resamples backdrop

**Undo:**
- previousUrlRef captures URL before save
- 30s undo window
- 1-col: "Confirm ✓" and "Undo ↩" pills at bottom of poster panel
- Confirm clears undo history, Undo restores previous URL to DB + state

### cropUtils.ts (src/lib/cropUtils.ts)
- CropRect — { x, y, width, height } fractional 0–1
- applyHandleDrag, optimizeImage, sampleCornerColors
- detectContentBounds — can be deleted, smart snap removed

---

## AI Poster Ingestion (/admin — Import Poster)

### Flow
1. Drop poster image (up to 4 images, second zone for extra info)
2. Calls extract-poster Supabase Edge Function
3. Claude Vision extracts: title, venue_name, date, time, address, description (editorial voice), category, confidence, uncertain_fields, crop coordinates
4. Venue enrichment: DB lookup → Mapbox geocoding → AI fallback
5. Review form pre-fills (⚠ on uncertain fields)
6. Duplicate detection: same title/venue/date → offer to update existing record
7. fill_frame toggle + focal point pan preview
8. **Recurring event toggle:** Weekly / Bi-weekly / Monthly → creates 3 months of occurrences using shared recurrence_group_id
9. Admin notification created on recurring submit — fires after 3 months to prompt renewal
10. On submit: optimizeImage → upload to posters bucket → insert/update event record

### Edge Function
Path: supabase/functions/extract-poster/index.ts
Secrets: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MAPBOX_TOKEN
Deploy: `npx supabase functions deploy extract-poster --project-ref lhetwgdlpulgnjetuope`
Accepts: `{ images: [{base64, mimeType}] }` OR `{ base64, mimeType }` (backward compatible)

### Editorial Description Prompt
"Write 2-3 sentences in a warm, culturally informed Portland voice. Lead with what makes this event worth attending. Include one key practical detail woven in naturally. Write like a knowledgeable friend recommending the show, not a list of facts."

### Venue Enrichment (3-tier)
1. DB lookup (case-insensitive name match) → stored address/hours/website/instagram
2. Mapbox geocoding (relevance > 0.5)
3. AI fallback for address/hours/website/instagram (flagged as uncertain)
Returns address_source: 'db' | 'mapbox' | 'ai' | 'none'

---

## Admin Page (/admin)

- Password gate → sessionStorage 'plaster_admin_unlocked' = '1'
- Bottom nav present (Wall tab highlighted) — can navigate to wall while in admin
- **Notifications panel** (top of page) — shows admin_notifications where not dismissed and snoozed_until < now()
  - Recurring check-in: "Extend 3 months" / "Mark as ended" / "Dismiss for now (2 weeks)"
  - Duplicate venue detection: fuzzy name match clusters, Keep/Merge/Delete UI
  - Merge venues: repoints all events from duplicate venue_ids to primary, deletes duplicates
- **Section 1:** Add Venue
- **Section 2:** Add Event
- **Section 3:** Import Poster (full AI ingestion)

---

## LINE UP Screen (src/pages/LineUpScreen.tsx)

### What it is
First tab. The social heartbeat of the app. An activity feed showing what friends, venues, and artists are doing, with a passive stack of diamond-shaped poster icons on the right representing the user's upcoming RSVPs.

### Feed
Each item: `[diamond avatar] [activity text]`
No poster thumbnails in feed rows — just avatar + text.

**Diamond avatar sizes by type (visual hierarchy):**
- **Venue**: 36×36px, paddingLeft 14px — most prominent, flush left
- **Artist**: 28×28px, paddingLeft 24px — mid-level, slightly indented
- **Friend**: 22×22px, paddingLeft 36px — most intimate, most indented

**Feed item types (9 types):**
1. Going — '[name] is going to [event] at [venue]'
2. Liked — '[name] liked [event]'
3. Wall post quote — '[name] wrote on the [event] wall: "[quote]"'
4. Superlative — '[name] was crowned [title] at [venue]'
5. Past attended — '[name] went to [event] last night'
6. Venue shout — '[venue]: [short message]'
7. Artist shout — '[artist]: [short message]'
8. Group activity — 'Your [group] is going to [event]'
9. New regular — '[name] is now a Regular at [venue]'

Real poster images from Supabase fill the diamond avatars. Thin divider every 4 items.

### Diamond Queue (right edge)
- position: absolute, right: 10px, top: 52px, gap: 8px, z-index: 5, pointer-events: none
- 5 diamonds stacked vertically: 34×34px each
- clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)
- Real poster images inside — upright, not rotated
- Represents user's upcoming RSVPs — feeds from attendees table

### LINE UP Panel (slides from RIGHT)
- Tap 'LINE UP' text in header → panel slides in from RIGHT (right: -100% → right: 0)
- Shows user's upcoming RSVPs in chronological order
- Each row: 36×54px poster thumbnail + title + venue · time + date
- Tap 'LINE UP ×' to close, slides back right
- Lives in content area — NEVER covers bottom nav
- Default state: CLOSED

### Profile Panels (slide from LEFT)
- Tap any diamond avatar → panel slides in from LEFT (translateX(-100%) → translateX(0))
- panelStack array — pushing new panels on tap, popping on back arrow
- Back arrow (← BACK) top of each panel
- **Venue panel:** venue name, upcoming events list, Follow + Message buttons
- **Artist panel:** artist name, upcoming shows, Follow + Message buttons
- **Friend panel:** diamond profile pic, username, followers/following, attended events grid, superlatives pills, Follow + Message buttons
- NEVER covers bottom nav

### Spatial Logic (LOCKED IN)
- Things that are YOURS slide from the RIGHT (LINE UP panel = your shows)
- Other people's worlds slide from the LEFT (profiles = stepping into their world)
This logic must be maintained throughout the entire app.

### Current State
- mockFeed hardcoded with real Portland show names
- mockLineup hardcoded with real shows
- Real poster images fetched from Supabase for diamonds
- Profile panels built, need testing/polish
- Avatar upload bug in YouScreen needs fixing

---

## Map Screen
- Mapbox GL JS, Portland centered (45.5051, -122.6750, zoom 12)
- Night: dark-v11 / Day: light-v11
- Knurl wheel day scrubber: machined metal aesthetic, 7 days, momentum drag, snap
- Venue pins, radius filter, list mode bottom sheet (two snap points), category chips
- Session 9 planned: custom pins with poster thumbnails, pin tap → event card popup

---

## YOU Screen (src/pages/YouScreen.tsx)
- Profile pic (diamond-shaped), username, followers/following counts
- Attended events wall — poster thumbnails in a grid
- Superlatives pills
- Edit profile, Sign out
- **Known bug:** avatar upload returns 400 — fix the upload path and upsert call

---

## MSG Screen (NEXT SESSION — replaces Venues tab)
- DMs: one-to-one messaging
- Groups: named groups (book club, trivia crew, best friends)
- Send events: embed event cards in messages ("we should go to this")
- Message button on all profile panels
- Same messaging accessible from LINE UP profile panels

---

## Real Portland Events in DB (as of Apr 17, 2026)
- Low Bar Chorale — Showbar
- Babes in Canyon — Holocene
- The Wallflowers — Revolution Hall
- Banff Mountain Film Festival — Holocene
- Stumpfest XI — Mississippi Studios
- Small Skies, My Body, Frecks — Holocene
- Disco Always: A Harry Styles Dance Night — Holocene
- Jenny Lawson — Revolution Hall
- Charlie Brown III Quartet — The 1905
- Laffy Taffy: Freaknik Edition — Holocene
- Weird Nightmare — Polaris Hall
- Marshall Crenshaw — Polaris Hall

---

## VENUE ADMIN & IMAGERY — PLANNED

### Status as of 2026-04-21
`banner_url` and `diamond_focal_x` / `diamond_focal_y` columns exist on the `venues` table (migration 005). Diamond rendering from banners with focal-point positioning is wired up in the `Diamond` component (shipped 2026-04-21). The venue banner upload UI has never been built — every venue currently has NULL for `banner_url`. Venue admin management UI does not exist.

---

### Part A — Venue management segment in /admin (PARKED)
A list view in Admin.tsx showing all venues in the database. Tap a venue → opens that venue's dashboard view. The dashboard is the MVP of what venue owners will eventually use to manage their own pages — for now, the Plaster admin controls it; later, venues authenticate and manage it themselves.

Dashboard should include:
- Editable venue name, neighborhood, address, description
- Banner image (upload / replace / view)
- Diamond image (upload / replace / toggle between custom diamond vs auto-derived from banner)
- Diamond focal-point positioner (drag UI to set focal_x / focal_y on the banner)
- List of upcoming events at this venue with basic metadata
- Social links (instagram, website)
- Hours

---

### Part B — Banner + diamond upload during event ingest (PARKED)
In the existing AI ingest flow in Admin.tsx, when an event is being reviewed before save, add two optional drop zones for that event's venue:

**Drop zone 1 — Venue banner photo**
- Upload/replace the venue's banner image
- Shows a live preview of how the banner will look on the venue page (full-width hero treatment)
- On save: uploads to `avatars/venues/{venue_id}-banner.{ext}`, writes URL to `venues.banner_url`
- Overwrites any existing banner

**Drop zone 2 — Venue diamond photo (optional)**
- Upload an optional custom diamond image for the venue
- If left empty: diamond defaults to a center-focal crop of the banner (existing behavior, focal_x=0.5, focal_y=0.5)
- If filled: stored as a separate image file, and the venue's diamond is rendered from this custom image instead of a banner crop
- This requires adding an `avatar_diamond_url` column to venues (it does NOT currently exist — verified via live schema query on 2026-04-21)

Both drop zones are optional. Ingest flow must still succeed if neither is touched — just creates the event row as today.

---

### Part C — Custom diamond vs derived-from-banner
**Schema change required (new migration):**
```sql
ALTER TABLE venues ADD COLUMN IF NOT EXISTS avatar_diamond_url text;
```

**Diamond rendering precedence:**
1. If `avatar_diamond_url` is set → render the diamond from that image (custom, no focal math needed)
2. If only `banner_url` is set → render from banner using `diamond_focal_x` / `diamond_focal_y` (current behavior)
3. If neither is set → dashed-diamond placeholder (current fallback)

**Rule:** When a venue has both a custom diamond and a banner, the custom diamond always wins for diamond contexts (feed rows, map pins, list items, friend panels). The banner is used only for the banner area on VenueSubPanel and full VenueProfile pages.

Update every Diamond call site that currently renders a venue to first check `venue.avatar_diamond_url`, and only fall back to `venue.banner_url` + focal if the custom diamond is absent. The Diamond component itself doesn't change — just the prop values passed into it.

---

### Part D — Focal-point positioner UI
Accessible from two places:
1. **Admin venue dashboard (Part A)** — admin can adjust focal for any venue at any time
2. **Venue's own page, eventually** — lets venues tweak their own focal after authenticating (aspirational, not needed for first ship)

**UI behavior:**
- Modal or embedded view showing the full banner with a draggable diamond-shaped outline overlay
- User drags the diamond around the banner to position which region gets cropped
- On release: saves updated `focal_x` / `focal_y` (fractions 0–1) to the venues row
- Diamond outline size: roughly 1/4 of the banner's shorter dimension

**Default focal point when no focal set yet:** center (0.5, 0.5). Not random — random focal points would make the same venue look different across screens.

---

### Build order
When this gets built (likely a dedicated session or mini-milestone):
1. Migration: add `avatar_diamond_url` column to venues
2. Update Diamond call sites to check custom diamond first, fall back to banner+focal
3. Ingest flow: add banner drop zone + diamond drop zone
4. Admin: venue list + venue dashboard skeleton
5. Admin: focal-point positioner UI in the venue dashboard
6. (Later, aspirational): venue-owner auth so venues can manage their own pages

---

## Known Bugs
1. **Avatar upload 400** in YouScreen.tsx — fix storage upload path and upsert
2. **LINE UP profile panels** — built but need testing, tap diamond to confirm slide-in works
3. **Onboarding shown every login** — should check if username already exists before showing
4. **Showbar address wrong** in DB — "Southwest Naito Parkway" is incorrect, needs manual fix
5. **Diagnostic console.logs** in AdminEditModal — remove once stable
6. **Admin duplicate-venue consolidation** — tapping 'Keep this one' never actually consolidates. Full diagnosis below.

### Admin duplicate-venue consolidation
**Symptom:** Duplicates are detected on /admin, but tapping 'Keep this one' never actually consolidates — duplicates keep getting re-flagged.

**Diagnosed root cause (2 compounding bugs):**

1. **Silent DELETE failure.** `src/pages/Admin.tsx` imports `supabase as supabaseAdmin` from `@/lib/supabase` — this is the anon-key singleton, NOT a service-role client. The `venues` table has no DELETE RLS policy defined in any migration. So `supabaseAdmin.from('venues').delete()` is blocked by RLS, the error is caught and only logged to console (`console.error('Merge failed:', e)`), and the user sees no indication of failure. Event reassignment (UPDATE) succeeds, but the loser venue row is never deleted.

2. **Detection is too aggressive.** `venueSimilarity()` uses name-only fuzzy matching with a substring check at threshold 0.7. "McMenamins Crystal Ballroom" and "The Crystal Ballroom" score 0.9 by substring match regardless of address. Even if the DELETE worked, any two venue names where one is a substring of the other will always re-flag.

**Fix paths (decide when fresh):**
- **A.** Add DELETE RLS policy on venues for admin sessions. Simplest. Requires a new migration + auth model for the admin page.
- **B.** Create a true service-role client for admin writes (stored server-side, never shipped to browser). More secure, more work.
- **C.** Raise similarity threshold or add address-match disambiguation. Addresses detection over-flagging, but doesn't fix the delete problem.

**Recommended fix order:** A or B first (make DELETE actually work), then test detection with clean data to see if C is still needed.

**Workaround until fixed:** Find and merge duplicates manually via SQL in Supabase SQL editor.

**Priority:** Low — cosmetic, workaround exists, no data corruption.

---

## Product Values (Read Before Making Any Decision)

### Anti-extractive design
Plaster does not harvest attention. No dark patterns. No manufactured anxiety. Every decision asks: does this serve the person using it, or the platform? The platform serves the person. Always.

Ads: tasteful local ads only — between forum posts and on RSVP completion screen. NEVER on the wall. NEVER in chat. NEVER in the LINE UP feed. The wall is sacred.

### The poster as art
Event posters are one of the last great vernacular art forms. Designed under pressure, printed in hundreds, stapled to poles in the rain, gone in a week. Plaster treats them as the art objects they are. Full bleed. Sampled color backdrops. No UI chrome on the art at high zoom.

### Community over consumption
The goal is not more ticket sales. The goal is connection — to the city and to the people in it. Joy is the product.

### Local first, always
Launches in Portland. May grow. Will never lose the texture of a specific place.

### The wall is the thing
Everything else — map, LINE UP, messaging — orbits the wall. The wall is the heartbeat.

### Night mode is correct, not trendy
You look at this app in a dark room, on your way to a show, standing outside a venue. Dark is right.

### Analogue texture in a digital space
Knurl wheel feels machined. Diamonds feel cut. Chips feel like a card index. Date blocks feel like rubber stamps. Every interaction should have weight and materiality.

---

## DEPLOYMENT & CACHING CONFIG

### Cache-Control strategy
**Configured:** 2026-04-19

**What's set:**
- `vercel.json` forces `Cache-Control: no-cache, no-store, must-revalidate` on three paths:
  - `/` (root)
  - `/index.html`
  - `/manifest.json`
- All other files (JS bundles, CSS, images, fonts) use Vercel's default caching, which for Vite-built hashed filenames is effectively immutable long-term caching. This is correct because Vite bundles are content-hashed (e.g. `main-D8Hu7bDG.js`) — the URL changes whenever content changes, so stale bundles are impossible.

**Why this is NOT a performance compromise:**
- `index.html` is ~2KB — fetching it fresh on every page load is trivial
- All expensive assets (JS bundles, CSS, images) continue to cache normally, long-term
- This is the industry-standard pattern for SPAs on Vercel — recommended by Vercel's own docs, used by virtually every production React app
- Without this config, Vercel's edge CDN and browsers would cache `index.html` and continue serving references to OLD bundle filenames, even after new code deploys — which was the "why isn't my change showing up" pain from the 2026-04-19 session

**What to check if this ever seems wrong:**
- Open Chrome DevTools → Network tab → reload → click `index.html` → verify response headers include `cache-control: no-cache, no-store, must-revalidate`
- Verify hashed bundles (like `main-*.js`) have a long `cache-control: public, max-age=31536000, immutable` header — this means they're caching correctly and aren't accidentally caught by the no-cache rule

If anyone tells you to "add caching for performance": they probably don't understand that hashed bundles are already cached long-term. The cache headers on `index.html` are NOT the problem — removing them would just bring back the stale-bundle issue.

---

## Dev Workflow
- **Claude Code in Warp:** all file edits
- **This chat (claude.ai):** planning, design decisions, mockups, prompt writing
- **PLASTER.md:** shared brain — update at end of every session
- Admin unlock: /admin → password → sessionStorage → Edit button on wall
- Deploy: `git push` → Vercel auto-deploys from main
- DEV button: every new feature must have one, localhost only, hard rule

```bash
cd ~/plaster && npm run dev
# localhost:8081
# Live: the-plaster-wall.vercel.app
# Admin: /admin — password Plast3r!PDX#26
```

---

## Founder Context
Rob Schwartz — Portland OR. First-time founder. Building Plaster + Swapper simultaneously. No prior coding background. Using Claude Code in Warp terminal. Action-first learner.

**Swapper:** robschwartz26/cosmic-swaps | cosmic-swaps.vercel.app | Supabase fiyoectikcqwpoqacdmm

**Working style:**
- Action-first, learns by doing
- When asked to cat a file: paste RAW OUTPUT, never summarize
- Two test accounts: main account + "letshavesometea"
- All credentials in locked Apple Note
- DEV button in every new feature flow — no exceptions
- Beta launch: Portland book + music community first
- Prefers direct instructions, progress acknowledged

---

## Lessons Learned

Hard-won rules and anti-patterns discovered across development sessions.

### Benign console errors can stay benign
**Date:** 2026-04-18
**Context:** Spent 15 minutes chasing a 400 Bad Request on event_wall_posts that was firing every time an event panel opened.
**What we did wrong:** Treated a red console error as urgent. The app was working fine — the error only broke a post-wall feature we weren't using today. Detoured into migration-vs-schema investigation, got a wrong diagnosis, re-investigated, fixed it.
**The rule going forward:** If a console error doesn't break anything visible or block today's work, log it in PLASTER.md under 'Known harmless noise' and move on. Chase it only when sitting down to build or test the feature it's touching.

### Always verify live DB state, not migration files
**Date:** 2026-04-18
**Context:** Diagnosed an event_wall_posts 400 by reading migration 004. Migration said body column; fix prompt was written around that. Actual live DB had content column. Migration wasn't fully applied.
**What we did wrong:** Trusted migration files as ground truth for DB schema. They're not — they're intent. The live database is reality.
**The rule going forward:** Before diagnosing any Supabase REST error, run `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'X';` in the SQL editor to see the actual live schema. Never assume migration files reflect what's deployed.

### Chrome iOS aggressively caches — Safari is source of truth
**Date:** 2026-04-18
**Context:** Multiple moments where a fix appeared to not have shipped. Many were actually shipped, but Chrome iOS was serving stale JavaScript bundles.
**What we did wrong:** Defaulted to 'Warp missed it' instead of 'my browser is lying to me' when expected changes didn't appear. Wrote follow-up fix prompts for problems that were already fixed.
**The rule going forward:** When Warp reports a change shipped and it appears not to have, verify by (a) checking the Vercel deployment status and commit message, (b) paste-checking the actual source file contents, and (c) only THEN re-prompting. Treat Safari on a hard refresh as the 'did it ship' oracle — Chrome iOS caching is noise.

### Multi-feature prompts risk drift
**Date:** 2026-04-18
**Context:** First avatar rebuild prompt bundled camera mirror, two-file storage, and the editor UX into one session. Result was partial implementation — the UX intent didn't land even though the code technically shipped.
**What we did wrong:** Packed too many concerns into a single Warp prompt. Warp did each piece mechanically but missed the through-line design intent.
**The rule going forward:** One prompt = one feature. If a feature touches 3+ files, describe the user-facing behavior in plain English at the top of the prompt so the implementation stays grounded in intent, not implementation details. When a feature genuinely spans multiple files, split into sequential prompts rather than bundling.

### Cleanup sessions are separate from feature sessions
**Date:** 2026-04-18
**Context:** Mid-feature-work, Rob asked 'can we clean up the whole file.' Reflex was to say yes.
**What we did wrong:** (Almost) conflated cleanup with feature work. Cleanups risk behavioral regressions silently; feature sessions have clear success criteria.
**The rule going forward:** Cleanup, refactor, and dead-code removal each get their own session. Ship the feature first. Cleanup later, with fresh eyes and a clear scope ('remove unused imports' is a session, 'clean up the file' is not).

---

### Manual beats auto when the platform is unreliable
**Date:** 2026-04-18
**Context:** Spent significant time trying to auto-detect and flip front-camera selfies via capture="user" logic. iOS Safari inconsistency made this unreliable across browsers and iOS versions.
**What we did wrong:** Kept chasing a 'clever' auto-detect solution when the platform kept fighting back. Multiple rebuild prompts, multiple diagnostic attempts.
**The rule going forward:** When fixing a UX issue on a platform you don't fully control (iOS Safari, Chrome iOS, native file inputs), try a manual user-facing control first (e.g. a Flip button). Users accept one extra tap. Auto-detection that works 90% of the time is worse UX than a reliable manual control that always works. Budget: 2 attempts at 'auto' before switching to manual.

### If a prompt isn't landing the UX intent, rewrite the prompt, not the code
**Date:** 2026-04-18
**Context:** First avatar editor rebuild produced technically correct code (full rectangle stored, not diamond-clipped) but missed the UX intent ('user picks an image, then positions a diamond stamp over it'). Warp built to the letter of the prompt, not the spirit.
**What we did wrong:** Shipped, tested, found UX was off, wrote another fix prompt. Second prompt also partially missed. Only the third — which explicitly described the two-step user flow in plain English at the top before any technical detail — produced the right result.
**The rule going forward:** For UX-heavy features, the prompt must open with a plain-English description of the user experience, written as a story ('user taps X → sees Y → drags Z → saves'). Technical requirements come after. If Warp produces code that technically matches the requirements but misses the feel, the prompt lacked intent, not detail.

### Iterating on approach vs iterating on numbers — know which you're doing
**Date:** 2026-04-18
**Context:** Map pin placement went through four approaches (padding-based → pixel-offset → zoom-change → ratio-based diagonal) before landing. Each approach took a full round-trip.
**What we did wrong:** Didn't recognize when an approach was fundamentally wrong vs when numbers just needed tuning. Kept tuning numbers on wrong approaches.
**The rule going forward:** After two failed tunings of an approach, step back and ask 'is this the right approach or the right numbers?' If the issue is that the approach produces wrong-feeling results regardless of values, switch approaches. One telltale: if tuning makes things 'better' but not 'right,' you're iterating on numbers when you should be iterating on approach.

### 'Admin' client isn't always actually admin
**Date:** 2026-04-18
**Context:** Admin.tsx imports `supabase as supabaseAdmin` — the alias is misleading. It's still the anon-key client, subject to all user RLS. DELETE operations silently fail because no RLS policy allows them.
**What we did wrong:** Trusted the alias. 'Admin' in a variable name meant 'privileged' to the reader, not 'still the anon client'.
**The rule going forward:** Before trusting any 'admin' or 'privileged' write, confirm it's actually using a service-role client (different key, server-side only) and that the target table has an RLS policy allowing the operation. Anon-key clients can only do what RLS allows anonymous/authenticated users to do, regardless of what the variable is named.

### Imports-from-context bugs show as blank screens
**Date:** 2026-04-18
**Context:** New component (FollowListPanel.tsx) rendered a blank YOU screen. Console flagged 'Multiple GoTrueClient instances' warning. Root cause: component imported createClient from @supabase/supabase-js directly instead of the singleton from ~/plaster/src/lib/supabase.ts.
**What we did wrong:** Initial panic/confusion treated the blank screen as a mystery. The warning was right there pointing to the cause.
**The rule going forward:** Every new component that talks to Supabase imports the shared singleton supabase from @/lib/supabase — never calls createClient itself. Add a one-line comment rule to any future Warp prompt involving Supabase: 'Import supabase singleton from @/lib/supabase. Do NOT call createClient.'

### Test the database directly before blaming the client
**Date:** 2026-04-19
**Context:** Spent over an hour chasing a 403 on conversations INSERT. Debugged RLS policies (dropped and recreated), checked client singleton config, verified JWT was in request, re-targeted policies to authenticated role, etc. None of it fixed the issue.
**What we did wrong:** Assumed the database was correctly configured because policies existed and looked right. Kept trying fixes at the client/RLS policy level without proving the database itself worked under simulated auth conditions.
**The rule going forward:** When a Supabase RLS error persists through multiple attempts, run a manual test in the SQL editor that simulates an authenticated user via `SELECT set_config('request.jwt.claim.sub', 'USER_UUID', false);` then attempt the failing INSERT directly. If it succeeds, the DB is fine and the bug is in the client→PostgREST request. If it fails, the bug is in the DB/policy layer. This single test saves hours of guessing.

### Warp's diagnoses are hypotheses, not answers
**Date:** 2026-04-19
**Context:** Warp repeatedly "found the smoking gun" — infinite recursion, service key client, policy roles. Each time it sounded definitive and each fix worked on its own merit, but none fixed the blocker. Each wrong diagnosis sent us down a detour.
**What we did wrong:** Treated Warp's confident "here's the root cause" as ground truth instead of as a theory to verify. Fixed each suspect, didn't test, moved on — then discovered the bug was still there.
**The rule going forward:** When Warp says "found it, this is the cause", read it as "here is one plausible theory." Fix it if the fix is independently correct (like the service key — that was genuinely worth fixing regardless). But before declaring victory, directly verify the bug is gone by reproducing it. Don't chain fixes without intermediate verification.

### For multi-table atomic writes, use SECURITY DEFINER RPC
**Date:** 2026-04-19
**Context:** Spent hours fighting RLS policies on conversations, conversation_members, and messages — because creating a conversation means inserting one row into conversations, then two rows into conversation_members, atomically. Every policy combination had edge cases.
**What we did wrong:** Built the flow as client-side multi-table inserts with per-table RLS. This is fragile — every table's policies must align perfectly, and any client/PostgREST auth flakiness breaks the whole flow.
**The rule going forward:** For any operation that inserts into 2+ related tables, write a Postgres function with SECURITY DEFINER that performs all inserts atomically. The client calls it via `supabase.rpc('fn_name', { ... })`. The function checks `auth.uid()` itself, then bypasses RLS for the multi-table writes. This is the idiomatic Supabase pattern and sidesteps client-auth edge cases entirely. RLS on individual tables is still useful for reads, but writes that touch multiple tables should go through RPCs.

### Stop running SQL in the wrong editor or pasting into non-empty editors
**Date:** 2026-04-19
**Context:** Multiple rounds of SQL errors today came from: running commands in the wrong SQL editor tab, pasting new SQL into an editor that still had old broken SQL, copying from a terminal that inserted invisible ● prompt characters, attempting -- comment text that contained stray chars.
**What we did wrong:** Rushed through paste operations while tired. Didn't verify the editor was clean before pasting. Didn't verify the target tab before running.
**The rule going forward:** Before running any SQL in the Supabase editor, (1) open a fresh new query tab, (2) paste, (3) visually verify the first 3 lines match what you intended, (4) run. For critical schema changes, verify with a separate `SELECT column_name FROM information_schema.columns WHERE table_name = 'X'` query after.

### Fatigue is a diagnostic signal
**Date:** 2026-04-19
**Context:** The messaging debug session spanned over an hour late at night, after an already-full day of work. Multiple times decisions got sloppier — running wrong SQL, trying fixes without verifying, jumping between theories.
**What we did wrong:** Pushed through diminishing returns when calling it for the night would have been faster in aggregate (fresh eyes would have found the RPC pattern in 15 minutes, versus the hour+ of tired detours).
**The rule going forward:** When a debug session passes 45 minutes without resolution AND it's late in the day, stop. Write the current state into PLASTER.md under 'KNOWN BROKEN' with full diagnostics and next steps. Come back fresh. This is an actual rule, not a suggestion — 'one more try when tired' reliably produces the slop we saw tonight.

---

### Sometimes the fix is the redeploy
**Date:** 2026-04-19
**Context:** Realtime WebSocket connection kept failing. Extensive theorizing about JWT key rotation, key format mismatches, publication config. None of those were verified. After a Vercel redeploy (no env var changes) plus the earlier fixes (REPLICA IDENTITY FULL, inbox subscription churn fix) had time to propagate, realtime started working.
**The rule going forward:** When multiple small fixes have shipped recently and realtime or cached-behavior bugs persist, force a fresh Vercel deploy AND wait 60+ seconds before hard-refreshing. 'Try it again' after proper cache invalidation is a legitimate debug step, not a cop-out. But document what you changed so you don't think it's magic next time.

### Known harmless noise

- **Multiple GoTrueClient instances detected** — harmless warning from Supabase. Likely caused by a component importing createClient directly instead of the singleton. Fix when it becomes relevant.
- **apple-mobile-web-app-capable is deprecated** — iOS meta tag name changed. Replace with mobile-web-app-capable when doing a cleanup pass.
- **Failed to preventDefault inside passive event listener** — from touch gesture handlers in avatar editor. Cosmetic, doesn't affect behavior.

---

## Current Session — Pick Up Here (Apr 17, 2026)

**Last completed:** LINE UP screen — activity feed (9 item types), diamond queue, LINE UP panel (slides right), profile panels (slide left), real Portland show names, real poster images from Supabase.

**Fix first:**
1. Avatar upload 400 in YouScreen.tsx — storage upload path broken
2. Test LINE UP profile panels — tap diamond avatar, confirm panel slides in from left

**Then build:**
1. Replace Venues tab with MSG tab
2. MSG screen: DMs + groups + send event cards in messages
3. YOU screen polish: attended events grid, superlatives
4. Keep ingesting Portland posters

**Start by reading:**
- `~/plaster/src/pages/LineUpScreen.tsx`
- `~/plaster/src/pages/YouScreen.tsx`
- `~/plaster/src/components/BottomNav.tsx`
