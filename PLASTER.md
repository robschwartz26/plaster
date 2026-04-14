# PLASTER — Full Project Brief
Paste this at the start of every new Claude session.

---

## What Is Plaster
Plaster is a living Portland event poster wall — a beautiful, scrollable city of flyers that treats event art with the respect it deserves, connects people to their city's culture, and builds genuine community around the venues and nights that make Portland worth living in.

---

## Live URLs & Repos
- **Live:** https://the-plaster-wall.vercel.app
- **GitHub:** robschwartz26/plaster
- **Local dev:** localhost:8081 (`npm run dev` from ~/plaster)
- **Admin:** /admin (password: Plast3r!PDX#26 stored as VITE_ADMIN_PASSWORD env var)
- **Supabase project:** lhetwgdlpulgnjetuope (us-west-1)

---

## Tech Stack
- **Frontend:** React + TypeScript + Vite + Tailwind + shadcn/ui + Framer Motion
- **Backend/DB:** Supabase (auth, DB, storage)
- **Map:** Mapbox GL JS (token: VITE_MAPBOX_TOKEN)
- **Hosting:** Vercel (auto-deploys from GitHub main)
- **Auth:** Supabase email/password auth
- **Storage:** Supabase storage buckets: posters (public), avatars (public)
- **AI:** Claude Vision via Supabase Edge Function (extract-poster)

---

## Environment Variables
Set in .env.local and Vercel production:
```
VITE_SUPABASE_URL=https://lhetwgdlpulgnjetuope.supabase.co
VITE_SUPABASE_ANON_KEY=(set)
VITE_SUPABASE_SERVICE_KEY=(set)
VITE_MAPBOX_TOKEN=(set)
VITE_ADMIN_PASSWORD=Plast3r!PDX#26
VITE_ANTHROPIC_API_KEY=(set — also set as Supabase secret ANTHROPIC_API_KEY)
```

---

## Database Schema

### Tables
- **profiles** — id, username, avatar_url, bio, is_public, interests[], created_at
- **venues** — id, name, neighborhood, address, location_lat, location_lng, website, instagram, cover_url, description, hours, created_at
- **events** — id, venue_id, title, category, poster_url, starts_at, view_count, like_count, neighborhood, address, description, is_recurring, recurrence_rule, fill_frame (boolean default false), created_at
- **attendees** — id, event_id, user_id, created_at
- **event_likes** — id, event_id, user_id, created_at
- **event_wall_posts** — id, event_id, user_id, content, like_count, created_at
- **post_likes** — id, post_id, user_id, created_at
- **follows** — id, follower_id, following_id, status (pending/accepted), created_at

### RPCs
- add_view_count(p_event_id, delta)
- add_like_count(p_event_id, delta)
- add_post_like_count(p_post_id, delta)

### RLS Notes
- Events UPDATE: "Admin can update events" policy already applied — `USING (true) WITH CHECK (true)` — allows crop saves from browser
- fill_frame and hours columns: run these if not yet applied:
```sql
ALTER TABLE events ADD COLUMN IF NOT EXISTS fill_frame boolean DEFAULT false;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS hours text;
```

---

## Design System (LOCKED IN)

### Colors
- Night mode (default): background #0c0b0b, text #f0ece3
- Day mode: background #f0ece3, text #0c0b0b
- Theme toggle: Swipe "plaster" wordmark RIGHT. Persisted in localStorage.
- CSS vars: --bg, --fg, --fg-08, --fg-15, --fg-18, --fg-25, --fg-30, --fg-40, --fg-55, --fg-65, --fg-80

### Typography
- Playfair Display 900 — wordmark + headings
- Space Grotesk — UI, body text
- Barlow Condensed 700/900 — date indicator blocks, chip labels

### Hearts
- Unicode ♥ only — NEVER emoji ❤️ (renders red on iOS)

---

## Navigation (5 Tabs — LOCKED IN)
Tonight · Map · Wall · Venues · You

---

## Wall Screen

### Poster Cards — Sampled Color Backdrop (DO NOT REMOVE — EVER)
Core design feature. Every edit to PosterCard.tsx must preserve this hook.

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

In 2-5 col grid card render — must use this pattern:
```tsx
{event.poster_url ? (
  <>
    <div style={{ position: 'absolute', inset: 0, background: sampledBackdrop ?? gradient, transition: 'background 0.3s ease' }} />
    <img src={event.poster_url} alt={event.title} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: event.fill_frame ? 'cover' : 'contain', pointerEvents: 'none', userSelect: 'none' }} />
  </>
) : (
  <div style={{ position: 'absolute', inset: 0, background: gradient }} />
)}
```

### fill_frame
- true → objectFit: cover (fills card, crops poster edges)
- false (default) → objectFit: contain (full poster visible, sampled backdrop fills sides)

### 1-Column Mode
- Double tap any poster → jumps to 1-col
- Swipe RIGHT → info panel → post wall → back to poster (full loop)
- 60° angle threshold
- Pinch peek zoom up to 3x

---

## Admin Mode (on the Wall)

### Unlocking
1. Go to /admin, enter password → sets `sessionStorage.plaster_admin_unlocked = '1'`
2. Navigate to Wall via bottom nav on /admin (stays unlocked)
3. "Edit" pill appears in Wall top bar
4. Tap Edit → isAdminMode = true → ✏️ button on every poster

### ✏️ Edit Button
- 1-col: absolutely positioned bottom-right floating pill outside carousel strip (zIndex 20)
- 2-5 col: bottom-left of grid card
- Opens AdminEditModal for that event

### AdminEditModal (src/components/AdminEditModal.tsx)
Full-screen overlay. Two modes: crop tool and details editor.

**Crop Tool:**
- Full poster with dark mask outside crop rectangle
- 8 drag handles (20×20 touch targets) — corners + edge midpoints
- Overlay positioned relative to actual image element (getBoundingClientRect) — NOT modal container
- Live preview canvas (72×108px, 2:3) updates on every drag with cropped image + sampled backdrop
- Smart snap: detects solid borders only (near-white avg > 220 OR near-black avg < 30 with low variance). Animates rect. No-border → toast.
- CORS note: img.crossOrigin = 'anonymous' required. Supabase CDN may block getImageData — smart snap silently fails if so.

**Save Crop flow:**
1. optimizeImage(imageFile, editCrop) → cropped JPEG blob
2. Upload to posters bucket → new filename with timestamp
3. supabase.from('events').update({ poster_url: newUrl }).eq('id', event.id)
4. onCropSaved(newUrl) → Wall adds ?t=timestamp cache-bust → PosterCard resamples backdrop

**Undo:**
- previousUrlRef captures URL before save
- Undo available 30s after save
- Wall.handleUndoCrop restores old URL to DB + state
- 1-col: Confirm ✓ / Undo ↩ pills at bottom of poster panel

### cropUtils.ts (src/lib/cropUtils.ts)
- CropRect — { x, y, width, height } fractional 0–1
- applyHandleDrag, optimizeImage, sampleCornerColors, detectContentBounds

---

## AI Poster Ingestion (/admin — Import Poster section)

### Flow
1. Drop poster image → Supabase Edge Function extract-poster called
2. Claude Vision extracts: title, venue_name, date, time, address, description, category, confidence, uncertain_fields, crop coordinates
3. Venue enrichment: DB lookup → Mapbox → AI fallback
4. Review form pre-fills (⚠ on uncertain fields)
5. Visual crop tool with smart snap
6. Preview button — shows simulated 2:3 grid card
7. Duplicate detection — same title/venue/date → offer to update existing
8. fill_frame toggle
9. On confirm: optimizeImage → upload → event record created/updated

### Edge Function (supabase/functions/extract-poster/index.ts)
Required Supabase secrets: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MAPBOX_TOKEN
Deploy: `npx supabase functions deploy extract-poster --project-ref lhetwgdlpulgnjetuope`

### Venue Enrichment
1. DB lookup (case-insensitive name match) — uses stored address/hours/website/instagram
2. Mapbox geocoding fallback (relevance > 0.5)
3. AI fallback for address, hours, website, instagram (flagged uncertain)
Returns address_source: 'db' | 'mapbox' | 'ai' | 'none'

### Auto-neighborhood
NE→Northeast, SE→Southeast, NW→Northwest, SW→Southwest, N→North

---

## Admin Page (/admin)
- Password gate → sessionStorage 'plaster_admin_unlocked' = '1'
- Bottom nav (same as main app) — Wall tab highlighted — navigate to wall while staying in admin mode
- Section 1: Add Venue (name, neighborhood, address/geocoding, website, instagram, hours)
- Section 2: Add Event (venue, poster upload, title, category, date/time, description, recurring)
- Section 3: Import Poster (full AI ingestion)

---

## Map Screen
- Mapbox GL JS, Portland centered (45.5051, -122.6750, zoom 12)
- Night: dark-v11 / Day: light-v11
- Knurl wheel day scrubber (machined metal aesthetic, 7 days, momentum drag, snap)
- Venue pins, radius filter, list mode bottom sheet, category chips

---

## Known Bugs
- Avatar not displaying on profile — upload works, avatar_url not rendering
- Onboarding shown every login — should check if username already exists
- Smart snap CORS — Supabase CDN may block canvas getImageData; configure Storage CORS headers
- Diagnostic console.logs in AdminEditModal should be removed once stable
- Crop tool in Admin.tsx import flow not as polished as AdminEditModal

---

## Completed Sessions
- **Session 1:** Wall UI — PosterGrid, PosterCard, DateIndicator, FilterBar, BottomNav
- **Session 2:** Supabase backend integration
- **Session 3:** Admin page, PWA setup
- **Session 4:** 5-tab nav, auth, profiles, follows, Tonight tab, Venues tab, event_likes
- **Session 5:** FlyerCarousel 1-col carousel, swipe fixes
- **Map Sessions:** Mapbox, venue pins, knurl wheel scrubber, radius filter, list mode
- **Session 6:** AI poster ingestion, Supabase Edge Function, poster isolation, image optimization, sampled color backdrop
- **Sessions 7-8:** Admin edit mode on wall (AdminEditModal, crop tool, smart snap, live preview, undo, fill_frame, cropUtils.ts, duplicate detection, venue enrichment, AdminBottomNav)

---

## Session Roadmap

### Next Session — Clean Up + Bulk Ingest
- Remove diagnostic console.logs from AdminEditModal
- Clean up dead/duplicate code from crop iterations
- Fix CORS on Supabase Storage for smart snap
- Polish import crop tool to match AdminEditModal quality
- **Rob drops 50+ real Portland posters to populate the wall**

### Session 9 — Superlatives
### Session 10 — Tonight Tab fully fleshed
### Session 11 — Venue Owner Accounts

### Future
- Outpainting for poster backgrounds (fal.ai) — deferred
- Capacitor wrapper for iOS App Store (native haptics)
- Email branding (currently "Supabase Auth")

---

## Dev Preview Mode
Every new feature flow must include a DEV button visible only on localhost. Hard rule. No exceptions.

---

## Founder Context
Rob Schwartz — Portland OR. Plaster + Swapper. No prior coding background, Claude Code in Warp.
Swapper: robschwartz26/cosmic-swaps, cosmic-swaps.vercel.app, Supabase fiyoectikcqwpoqacdmm

**Working style:** Action-first. When asked to cat a file — paste RAW OUTPUT, never summarize. Two test accounts: main + "letshavesometea". All credentials in locked Apple Note. DEV button in every new flow. Beta launch: Portland book community first.

---

## How to Start a New Session
```bash
cd ~/plaster && npm run dev
# localhost:8081 | the-plaster-wall.vercel.app
# Admin: /admin password Plast3r!PDX#26
```

*Last updated: April 14, 2026 — Sessions 6-8 complete*
