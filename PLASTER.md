# PLASTER — Full Project Brief
Paste this at the start of every new Claude session

---

## What Is Plaster — The One Sentence Version
Plaster is a living Portland event poster wall — a beautiful, scrollable city of flyers that treats event art with the respect it deserves, connects people to their city's culture, and builds genuine community around the venues and nights that make Portland worth living in.

---

## Live URLs & Repos
- **Live:** https://the-plaster-wall.vercel.app
- **GitHub:** robschwartz26/plaster
- **Local dev:** localhost:8081
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
VITE_SUPABASE_SERVICE_KEY=(set — quoted to handle # character)
VITE_MAPBOX_TOKEN=(set)
VITE_ADMIN_PASSWORD=Plast3r!PDX#26
VITE_ANTHROPIC_API_KEY=(set — also set as Supabase secret ANTHROPIC_API_KEY for edge function)
```

---

## Database Schema

### Tables
- **profiles** — id, username, avatar_url, bio, is_public, interests[], created_at
- **venues** — id, name, neighborhood, address, location_lat, location_lng, website, instagram, cover_url, description, created_at
- **events** — id, venue_id, title, category, poster_url, starts_at, view_count, like_count, neighborhood, address, description, is_recurring, recurrence_rule, created_at
- **attendees** — id, event_id, user_id, created_at
- **event_likes** — id, event_id, user_id, created_at
- **event_wall_posts** — id, event_id, user_id, content, like_count, created_at
- **post_likes** — id, post_id, user_id, created_at
- **follows** — id, follower_id, following_id, status (pending/accepted), created_at

### RPCs
- add_view_count(p_event_id, delta)
- add_like_count(p_event_id, delta)
- add_post_like_count(p_post_id, delta)

### Real Data
- One real event: Jimi Hendrix Experience at Holocene
- Venue ID: 4afea641-c25e-4693-9aca-6f03e8e22b0f
- Event date needs to be kept current (update starts_at to avoid 6-hour lookback filter)

---

## Design System (LOCKED IN)

### Colors
- Night mode (default): background #0c0b0b, text #f0ece3
- Day mode: background #f0ece3, text #0c0b0b
- Theme toggle: Swipe "plaster" wordmark RIGHT — follows finger, spring bounce snap-back. Persisted in localStorage.

### Typography
- Playfair Display 900 — wordmark + headings
- Space Grotesk — UI, body text
- Barlow Condensed 700/900 — date indicator blocks, chip labels

### Hearts
- Unicode ♥ only — NEVER emoji ❤️ (renders red on iOS)
- Night mode: white heart / Day mode: black heart / Never red

---

## Navigation (5 Tabs — LOCKED IN)
Tonight · Map · Wall · Venues · You

- **Tonight** (far left) — friend activity, RSVPs, social pulse of the night
- **Map** — geographic venue/event view with knurl wheel day scrubber
- **Wall** (CENTER, larger icon) — the heart of the app, main poster grid
- **Venues** — browse Portland venues, tap to venue profile page
- **You** (far right) — profile, poster collection, superlatives, friends

---

## Wall Screen

### Grid
- Pinch zoom changes columns 1–5 (ctrl+scroll on desktop)
- 2px gap between cards, edge to edge
- At 4-5 columns: pure art, nothing on posters
- At 2-3 columns: small ♥ count pill top-right of poster only
- At 1 column: full letterboxed poster, no overlays at all

### Poster Cards — Blurred Backdrop (IMPORTANT)
Each poster card in 2-5 col view uses a **sampled color backdrop** — NOT objectFit cover cropping.
- The poster's 4 corner colors are sampled via canvas at load time
- A conic-gradient is built from those colors and used as the card background
- The poster itself uses objectFit: contain — always shows fully, never cropped
- This gives a natural color-matched backdrop at ALL column counts with consistent brightness
- Falls back to the event's category gradient while image loads
- This was built in Session 6 — do not revert to objectFit cover

### Date Indicator (Ransom-note blocks)
- Three Barlow Condensed blocks: solid "TONIGHT" + outline "TUE" + ghost "APR 14"
- Updates via scroll center position, cross-fades between days
- In 1-column mode: shows event title · venue · time on left, ♥ count + 👁 views on right

### Filter Chips
All · ♥ · Music · Drag · Dance · Art · Film · Literary · Trivia · Other

### 1-Column Mode
- Double tap any poster at 2-5 columns → jumps to 1-column centered on that poster
- Swipe RIGHT → info panel, swipe RIGHT again → post wall, swipe RIGHT again → back to poster (full loop)
- LEFT swipe to go back one panel
- 60° angle threshold to prevent accidental vertical scroll triggering horizontal swipe
- Poster is completely clean — no overlays
- Pinch to peek zoom up to 3x, springs back on release

---

## AI Poster Ingestion (Session 6 — BUILT)

### Import Poster section in /admin
- Drag-drop zone for poster images (or click to browse)
- Calls Supabase Edge Function `extract-poster` (NOT Anthropic API directly — CORS workaround)
- Edge function URL: https://lhetwgdlpulgnjetuope.supabase.co/functions/v1/extract-poster
- Claude Vision reads the image and extracts: title, venue_name, date, time, address, description, category, confidence, uncertain_fields, crop (fractional bounding box of poster art)
- Poster isolation: if image contains Instagram UI, white borders, or other noise, AI returns crop coordinates and browser crops before upload
- Review form pre-fills with extracted data — yellow ⚠ on uncertain fields
- Image optimization: resized to max 1200px longest side, converted to JPEG 85% quality
- Venue matching: tries to match extracted venue name to existing venues in DB; creates new venue if no match
- On confirm: uploads optimized/cropped image to Supabase storage, creates event record, appears on wall immediately
- DEV button (localhost only) for testing without real images
- Works without API key (form fills manually) — warning banner shown if key missing

### Edge Function
- Location: ~/plaster/supabase/functions/extract-poster/index.ts
- Deployed to Supabase (project: lhetwgdlpulgnjetuope)
- ANTHROPIC_API_KEY set as Supabase secret (not in .env.local for this function)
- Deploy command: npx supabase functions deploy extract-poster --project-ref lhetwgdlpulgnjetuope

### NOT YET BUILT (Session 8)
- Preview button at ingest review stage (shows poster in simulated grid card before posting)
- Crop adjustment sliders (top/bottom/left/right) at ingest review stage
- Admin crop editor on the wall — edit icon on each poster when logged in as admin, sliders to adjust crop, re-uploads cropped image replacing original in Supabase
- Duplicate detection — when dropping a second poster for same event, offer to merge/update instead of creating new record

---

## Map Screen
- Mapbox GL JS, centered on Portland (lat: 45.5051, lng: -122.6750, zoom: 12)
- Night mode: mapbox://styles/mapbox/dark-v11 / Day mode: mapbox://styles/mapbox/light-v11
- Venue pins for venues with events on selected day
- Knurl Wheel Day Scrubber — machined metal rotary encoder aesthetic, 7 days, momentum drag
- Radius filter top right
- List mode toggle — bottom sheet with events for selected day
- Category filter chips same as Wall screen

---

## Auth & Profiles
- Supabase email/password signup/login
- After sign in: check if username exists → skip onboarding if yes
- Onboarding: username → avatar (optional) → interests (optional)
- Profile: avatar, @username, bio, public/private toggle, liked events grid, superlatives, follows

### Known Bugs
- Avatar not displaying on profile — upload works, avatar_url not rendering in YouScreen
- Onboarding shown every login — needs to check if username already exists before showing
- Map theme — map.setStyle() fix may still be needed

---

## Venues Tab & Venue Profile
- Alphabetical list of all venues as cards
- Venue profile: hero image, follow button, address, website, Instagram, upcoming events row, post wall

---

## Tonight Tab
- Events user has RSVPed to for tonight
- Friend activity (public profiles only)
- Superlative holders attending shown
- Login prompt if not authenticated

---

## Admin Page (/admin)

### Section 1 — Add Venue
Name, neighborhood (dropdown), address (Mapbox auto-geocoded), website, Instagram

### Section 2 — Add Event
Venue selector, poster image upload, title, category, date picker, start time, description, recurring toggle

### Section 3 — Import Poster (NEW — Session 6)
See "AI Poster Ingestion" section above

---

## Superlatives System (PLANNED — Session 7)
- Earned by repeatedly attending a venue
- Named by venue admin: "King of Holocene", "Trivia Terror of Breakside"
- Shows on user profile and event post wall when user RSVPs
- Foursquare Mayorship inspiration but more personal and creative

---

## Dev Preview Mode
Every new feature flow must include a DEV button that is:
- Only visible on localhost (hidden in production)
- Steps through multi-step flows with mock data
- This is a hard rule. Every new flow, every session. No exceptions.

---

## Completed Sessions
- **Session 1:** Wall UI — PosterGrid, PosterCard, DateIndicator, FilterBar, BottomNav, 20 mock events
- **Session 2:** Supabase backend integration
- **Session 3:** Admin page at /admin (password gated), PWA setup
- **Session 4:** 5-tab nav, auth, profiles, follows, Tonight tab, Venues tab, heart filter chip, event_likes
- **Session 5:** FlyerCarousel (1-column native carousel), carousel panel swipe fixes
- **Map Sessions:** Mapbox map, venue pins, knurl wheel scrubber, day/night theme, radius filter, list mode
- **Session 6:** AI poster ingestion — Import Poster section in admin, Supabase Edge Function for Claude Vision, poster isolation/cropping, image optimization, blurred backdrop replaced with sampled color gradient on grid cards

---

## Session Roadmap Going Forward

### Session 7 — Superlatives
- Database schema for superlatives
- Venue admin superlative naming UI
- Superlative display on profiles, post wall, Tonight tab

### Session 8 — Admin Crop Editor + Ingest Preview
- Preview button at ingest review stage (simulated grid card view before posting)
- Crop adjustment sliders (top/bottom/left/right) at ingest review stage
- Admin crop editor on the wall — edit icon on each poster when logged in as admin
- Sliders to adjust crop → re-uploads cropped image replacing original in Supabase
- Duplicate detection at ingest — offer to merge when same event dropped twice

### Session 9 — Tonight Tab
- Full friend activity feed
- RSVPs displaying correctly
- Superlative holder attendance
- Real-time feel

### Session 10 — Venue Owner Accounts
- Claim venue page flow
- Venue-scoped dashboard
- Analytics placeholder

### Future
- Map venue pins with event poster thumbnails
- Post wall likes fully functional
- Foursquare-style check-in mechanics
- Email branding (currently shows "Supabase Auth")
- Outpainting for poster backgrounds (fal.ai or similar) — deferred, not urgent

---

## Founder Context
Rob Schwartz — first-time founder, Portland OR. Building Plaster and Swapper simultaneously. No prior coding background, using Claude Code in Warp terminal.

**Swapper** (other app) — community item trading platform. Repo: robschwartz26/cosmic-swaps. Deployed at cosmic-swaps.vercel.app. Supabase project: fiyoectikcqwpoqacdmm (us-west-2).

**Working style:**
- Action-first — prefers direct instructions over theory
- Learns by doing
- Wants progress acknowledged
- Two test accounts for testing social features simultaneously (main + "letshavesometea")
- All credentials in a locked Apple Note
- DEV button must be in every new flow
- When asked to cat a file, paste the full raw output — never summarize

**Beta launch plan:** Portland book community first → expand by category → expand by city

---

## How to Start a New Claude Code Session
```bash
cd ~/plaster
# Paste PLASTER.md contents at start of conversation
npm run dev
# App runs on localhost:8081
# Live: the-plaster-wall.vercel.app
# Admin: localhost:8081/admin (password: Plast3r!PDX#26)
```

---

## Ad Philosophy
Tasteful local advertising between forum posts and on swap/RSVP completion screen. NEVER on the wall itself, exchange screen, chat, or any core browsing screen.

---

*Last updated: April 14, 2026 — end of Session 6 (AI ingestion + sampled color backdrop)*
*This document should be updated at the end of every major session*
