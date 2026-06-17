# PLASTER — Full Briefing for a New Claude (chat-side) Session
**Generated: June 16, 2026** · For: the Claude.ai chat assistant that designs/specs Plaster work
**Status of repo at time of writing: `main` @ commit `f2d1fe9`, local in sync with origin**

Read this whole document before designing anything. It is exhaustive on purpose. It supersedes any older "PLASTER brief" you may have been given — where they conflict, trust this file (it reflects the **live, verified** state of the database and code as of today).

---

## 0. WHO YOU ARE AND HOW THIS OPERATION WORKS (read first)

There are **two Claudes** working on Plaster, plus the founder:

- **You (this chat, on claude.ai)** — you do **planning, design decisions, mockups, and prompt-writing**. You see the app through **periodic code dumps** that Rob pastes/uploads (a single big `codebase copy.md`). **You do NOT have live database access, you cannot run the app, and you cannot run commands.** You design the *intent* of each change and write the *spec/prompt* that the other Claude executes.
- **Warp Claude (Claude Code, in the terminal)** — has the **live Supabase DB (read + write via MCP and CLI), the running app, the real RLS policies, the actual schema, git, and the build/deploy pipeline.** It executes your prompts, **verifies them against reality first**, and reports back.
- **Rob Schwartz** — the founder. Portland, OR. First-time founder, **no prior coding background**, action-first learner. He runs both Plaster and a second app (Swapper). He relays your prompts to Warp and relays code dumps back to you.

### The standing division of labor (this is now a committed rule in the repo's `CLAUDE.md`)
- You surface existing code/patterns/prior decisions and write the **intent + design** of each change.
- Warp **confirms against reality.** For ANY task touching **schema, RLS, privacy/permission enforcement, storage, realtime, or live-data behavior**, Warp verifies ground truth against the live DB *before* building (inspects actual RLS policies, real column names/types, how a policy actually resolves at query time), reports findings, and **follows reality over the prompt** when they differ.
- **Practical implication for you:** when you write a prompt that touches data/permissions, *explicitly invite Warp to verify against the live DB first and correct your assumptions.* Don't assert schema/RLS as fact — frame it as "my read is X; confirm against the live DB." This has already caught real bugs (e.g., a spec assumed the profile-photo diamond was wired on a component that the live code doesn't even use for that screen).

### How to write a good Warp prompt (template that works well here)
```
FEATURE / FIX / AUDIT: <one-line goal>

CONTEXT (from the dump): <files/patterns/prior decisions you can see>

BEFORE building, verify against the live DB/app: <the assumptions Warp should
check — RLS, columns, how something actually resolves. Tell it to report
findings first and follow reality over this prompt if they differ.>

DO: <numbered, concrete steps>
DON'T: <explicit guardrails — what not to touch>

VERIFY: <how to prove it works>
Then: tsc/tests/build/cap sync, commit (push only if asked).
```
Guardrails matter — Rob's auto-approval classifier will block irreversible prod actions (e.g. destructive deletes, RLS-bypassing migrations) unless clearly authorized, so call those out so Warp surfaces them rather than getting stuck.

---

## 1. WHAT PLASTER IS (the soul — every decision serves this)

Plaster is a **living Portland event poster wall**. It's the telephone pole outside the venue, the cork board at the record store, the flyer in your jacket pocket you forgot about until it fell out three days later and you thought *wait, that's tonight*. Portland's cultural life made visible, beautiful, and shareable.

It is **not** Eventbrite, **not** a calendar app, **not** Instagram for shows. It's a place where the *art of going out* — discovery, anticipation, shared excitement, the memory of having been there — lives as a first-class citizen.

### Core values (use these to resolve any ambiguity)
- **Anti-extractive design.** No attention harvesting, no dark patterns, no manufactured anxiety. Every decision: does this serve the person or the platform? The platform serves the person. Ads (someday) are tasteful local ones, only between forum posts and on the RSVP completion screen — **never on the wall, never in chat, never in the LINE UP feed.** The wall is sacred.
- **The poster as art.** Event posters are one of the last great vernacular art forms. Treat them as art objects: full bleed, sampled-color backdrops, no UI chrome on the art at high zoom.
- **Community over consumption.** Goal is connection to the city and its people, not ticket sales. Joy is the product.
- **Local first, always.** Launches in Portland; may grow; never loses the texture of a specific place.
- **The wall is the thing.** Map, LINE UP, messaging all orbit the wall. The wall is the heartbeat.
- **Night mode is correct, not trendy.** You use this in a dark room, on your way to a show.
- **Analogue texture in a digital space.** Knurl wheel feels machined, diamonds feel cut, chips feel like a card index, date blocks feel like rubber stamps. Weight and materiality everywhere.

### Beta launch strategy
Portland **book and music community first** — communities that already know how to show up. The wall must feel full and alive before it's shown widely.

---

## 2. LIVE URLS, REPOS, STACK, ENV

- **Live:** https://plasterthewall.com (also the-plaster-wall.vercel.app)
- **GitHub:** robschwartz26/plaster
- **Local dev:** `cd ~/plaster && npm run dev` → localhost:8081
- **Admin:** /admin — password `Plast3r!PDX#26`
- **Supabase project ref:** `lhetwgdlpulgnjetuope` (us-west-1)
- **Founder's 2nd app (separate):** Swapper — robschwartz26/cosmic-swaps · cosmic-swaps.vercel.app · Supabase `fiyoectikcqwpoqacdmm`

**Stack:** React + TypeScript + Vite + Tailwind · Supabase (auth, DB, storage, edge functions, realtime) · Mapbox GL JS · Vercel (auto-deploys from `main`) · Capacitor (iOS native shell) · Claude Vision via Supabase edge fn (poster ingestion) · Klipy (GIFs) · Resend (email alerts).

**Storage buckets:** `posters` (public), `avatars` (public).

**Env vars:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_SERVICE_KEY`, `VITE_MAPBOX_TOKEN`, `VITE_ADMIN_PASSWORD`, `VITE_ANTHROPIC_API_KEY` (also Supabase secret `ANTHROPIC_API_KEY`). `VITE_STRIPE_BUSINESS_POST_URL` exists but is currently **unset** (community business posts are a v1 stub).

---

## 3. NAVIGATION — 5 TABS (LOCKED IN)

**LINE UP · MAP · WALL · MSG · YOU**

- **LINE UP** — social activity feed + diamond queue of upcoming RSVPs (feed still partly mock; see Known Issues).
- **MAP** — Mapbox map, venue pins, knurl-wheel day scrubber.
- **WALL** — the poster grid (heart of the app). The neighborhood **community wall** opens from a chip in the Wall's filter carousel.
- **MSG** — DMs + group chats + notifications panel (replaced the old "Venues" tab).
- **YOU** — profile, attended events, follow lists.

"Tonight" tab is **gone**; "Venues" tab is **gone**. Both permanent. (Files named `TonightScreen.tsx` / `VenuesScreen.tsx` may still exist but are not the live nav.)

---

## 4. LIVE DATABASE SCHEMA (verified against prod this session)

> ⚠️ When you spec anything data-related, have Warp re-confirm column names/types and RLS against the live DB — this is accurate as of June 16 2026 but the DB is the source of truth.

### Core tables
- **profiles** — `id, username, avatar_url, avatar_diamond_url, avatar_full_url, bio, is_public, interests[], account_type ('person'|'artist'|'venue'), pending_account_type, phone_hash, email_hash, show_social_publicly, is_admin, is_suspended, banner_url, banner_focal_y, home_neighborhood, home_sextant, venue_id, created_at`
  - `avatar_diamond_url` = pre-cropped diamond square (always preferred for diamonds); `avatar_full_url` = full portrait (used by AvatarFullscreen).
- **venues** — `id, name, neighborhood, address, location_lat, location_lng, website, instagram, cover_url, description, hours, created_at`
- **events** — `id, venue_id, title, category, poster_url, starts_at, ends_at, view_count, like_count, neighborhood, address, description, is_recurring, recurrence_rule, recurrence_group_id, recurrence_frequency, fill_frame (bool), focal_x (float 0.5), focal_y (float 0.5), poster_offset_y (int), sold_out, created_at`
- **attendees** — `id, event_id, user_id, created_at`
- **event_likes** — `id, event_id, user_id, created_at`
- **event_wall_posts** — `id, event_id, user_id, content, like_count, media_url, media_type, media_width, media_height, created_at`
- **post_likes** — `id, post_id, user_id, created_at`
- **follows** — `id, follower_id, following_id, status ('pending'|'accepted'), created_at`
- **superlatives** — `id, user_id, venue_id, title, awarded_at`

### Messaging tables
- **conversations** — `id, created_at, last_message_at, name (nullable; groups), created_by, avatar_url (group photo)`. **NOTE: there is no `deleted_at` column** — soft-delete/hide is **per-member** (via the `dismiss_conversation` RPC), not per-conversation. (Older docs claiming `conversations.deleted_at` are wrong.)
- **conversation_members** — `conversation_id, user_id, last_read_at, created_at`
- **messages** — `id, conversation_id, sender_id, body (nullable), media_url, media_type, media_width, media_height, message_type ('text'|'slap'), event_id (nullable; the slapped show), deleted_at, created_at`

### Notification + push tables
- **notifications** — `id, user_id, sender_id, kind, target_event_id, target_post_id, target_conversation_id, target_community_post_id, read_at, created_at`
  - `kind` values in use / allowed: `follow`, `follow_accepted`, `message`, `reply`, `mention`, `activity_like:rsvp`, `activity_like:wall_post`, `slap`, `lost_pet`, `va_approved`, `venue_new_show`.
- **device_tokens** — `id, user_id, token, platform ('ios'|'android'|'web'), created_at`

### Moderation tables
- **user_blocks** — `blocker_id, blocked_id, created_at` (PK both cols)
- **user_mutes** — `muter_id, muted_id, created_at` (PK both cols)
- **content_reports** — `id, reporter_id, target_kind ('profile'|'wall_post'|'message'), target_id, target_user_id, reason, notes, status ('open'|'reviewing'|'resolved'|'dismissed'), admin_notes, reviewed_by, reviewed_at, created_at`

### Community / neighborhood tables
- **community_posts** — neighborhood + sextant, `post_type` (personal / lost_pet / business), `status` (published/pending/etc.), flagged/flag_reason, `is_paid`, `expires_at`, moderation + rejection fields. Posts are scoped to the viewer's **sextant** (region); **lost-pet alerts** target the **exact neighborhood**.
- Staff/ingest tables also exist (staff roster/shifts/chat/stats, venue_sources, event staging, upload_history, etc.) — admin/staff tooling, not user-facing.

### Key RPCs
- `match_contacts(hashes text[])` — SECURITY DEFINER; returns matched profiles, never exposes hashes.
- `search_my_messages(query text)` — pg_trgm search across the caller's conversations.
- `get_social_diamond_row(user_id)` — mutual follows for SocialDiamondRow.
- `create_conversation_with_members(p_member_ids[], p_name)` / `add_members_to_conversation(...)` / `dismiss_conversation(p_conversation_id)`.
- `get_my_conversation_members()` — **NEW (migration 088).** SECURITY DEFINER; returns identity fields only (`id, username, avatar_diamond_url, avatar_url`) for people who share a conversation with the caller, honoring blocks. See §6 MSG for why.
- `admin_approve_va_request(user_id)` / `admin_decline_va_request(user_id)`.
- `scrub_my_account_data(user_id)`.
- `notify_neighborhood_on_lost_pet` (trigger fn), `community_set_status` (community moderation).

### RLS facts you must respect (verified)
- **`profiles` SELECT policy:** `(is_public = true) OR (auth.uid() = id) OR is_admin(auth.uid())`. **There is NO follower exception.** A private profile's row is readable **only by the owner and admins** — not by followers, not by people who share a group. This is the master privacy gate for the whole app.
- Plus a **restrictive block filter** on profiles (and follows/wall_posts/messages/notifications): you can't see users who've blocked you or whom you've blocked. Helpers: `is_blocked_either_way(viewer, target)`, `is_muted_by(...)` (SECURITY DEFINER).
- Blocking auto-deletes follows in both directions (trigger `cleanup_follows_on_block`).
- `phone_hash` / `email_hash`: SELECT revoked from `authenticated`/`anon`; readable only via `match_contacts()`.
- `conversations` UPDATE: `update_conversations_if_member` (members can rename / set group photo).

---

## 5. ARCHITECTURE / FILE MAP (so you can reference real paths in prompts)

**Pages (`src/pages/`):** `WallScreen` lives in `components/Wall.tsx`; route screens: `MapScreen`, `LineUpScreen`, `MsgScreen` (largest, most active), `YouScreen`, `OnboardingScreen`, `AuthScreen`, `Admin`, `StaffScreen`, `TermsOfUse`, `PrivacyPolicy`, `VenueProfile`. (`TonightScreen`, `VenuesScreen` are legacy/not in nav.)

**Key components (`src/components/`):**
- Wall: `Wall.tsx`, `PosterCard.tsx`, `PosterGrid.tsx`, `FilterBar.tsx`, `DatePoster.tsx`, `DateIndicator.tsx`, `SoldOutChip.tsx`, `TrendingStrip.tsx`
- Identity/diamonds: `Diamond.tsx`, `AvatarUploader.tsx`, `AvatarFullscreen.tsx`, `BannerUploader.tsx`, `AccountTypeBadge.tsx`, `SocialDiamondRow.tsx`
- Profile: `AccountProfile.tsx` ← **this renders OTHER users' profiles (YouScreen delegates non-self to it)**, `FollowButton.tsx`, `FollowListPanel.tsx`, `UserActionsMenu.tsx`
- MSG/Slap: `MentionInput.tsx`, `GifPicker.tsx`, `GifMessage.tsx`, `SwipeableConversationRow.tsx`, `UserPicker.tsx`, `GroupEditSheet.tsx`, `SlapSheet.tsx`, `SlapHand.tsx`
- Community: `CommunityWall.tsx`, `NeighborhoodPicker.tsx`
- Moderation/settings: `SettingsPanel.tsx`, `PrivacyPanel.tsx`, `ReportContentSheet.tsx`, `SuspendedBanner.tsx`
- Shell: `AppLayout.tsx`, `BottomNav.tsx`, `BottomSheet.tsx`, `PlasterHeader.tsx`, `SplashAnimation.tsx`, `ErrorBoundary.tsx`, `CameraDeniedSheet.tsx`, `FindFriends.tsx`
- Admin (`src/components/admin/`): `Ingester.tsx` (wraps `ImportForm.tsx`), `BatchImport.tsx`, `EventForm.tsx`, `VenueForm.tsx`, `AdminEditModal.tsx`, `CropPreviewModal.tsx`, `AdminReports.tsx`, `AdminVARequests.tsx`, `AdminVenueAccounts.tsx`, `AdminCommunityPosts.tsx`, `AdminPendingEvents.tsx`, `AdminNotifications.tsx`, `AdminAutoIngest.tsx` (mothballed), `DuplicateEventMerger.tsx`, `DuplicateVenueMerger.tsx`

**Hooks (`src/hooks/`):** `usePushNotifications.ts`, `useTheme.ts`, `useUserBlocks.ts`, `useUserMutes.ts` (last two are backed by a shared module store — see below).

**Lib (`src/lib/`):** `supabase.ts`, `slap.ts`, `messaging.ts`, `cropUtils.ts` (`optimizeImage` — canvas re-encode, strips EXIF), `imageUtils.ts`, `posterThumb.ts`, `contactHash.ts`, `klipy.ts`/`klipyId.ts`, `neighborhoods.ts`, `communityPosts.ts`, `categories.ts`, `dates.ts`/`recurringDates.ts`, `reports.ts`, `userRelationStore.ts` (shared blocks/mutes store), `lineupSpine.ts`, `pickImage.ts` (Capacitor camera), `pickHeart.ts`, `env.ts`, `utils.ts`, `adapters.ts`.

**Contexts:** `AuthContext.tsx`.

**Edge functions (`supabase/functions/`):** `extract-poster`, `extract-schedule`, `submit-community-post` (authoritative AI moderation), `delete-my-account`, `create-venue-account`, `set-venue-imagery`, `fetch-image`, `push-notification`, `report-alert`, `va-request-alert`, `va-decision-alert`, `scrape-sources` (**mothballed/unused — ignore unless explicitly asked**).

**Migrations:** numbered `supabase/migrations/002 … 088` (085=Plaster Slap, 086=slap dedupe, 087=conversation avatar, 088=conversation member profiles). 066 intentionally absent.

---

## 6. FEATURE SUBSYSTEMS (current behavior)

### WALL (`Wall.tsx`, `PosterCard.tsx`, `FilterBar.tsx`)
- **Sampled color backdrop — DO NOT EVER REMOVE.** Each poster card samples its 4 corner pixels into a conic-gradient halo. Core design feature. (The blurred backdrop `<img>` must keep `loading="lazy"` — without it the whole mounted wall fetches at once and floods requests; this was a real bug, fixed.)
- Grid: **default 5 columns** (permanent), pinch-zoom 1–5 cols, 2px gap edge-to-edge, no mock events (real Supabase only). "Tonight" events get a 2px top line.
- **1-column mode:** double-tap a poster → 1-col centered on it. Swipe RIGHT cycles Poster → Info → Post wall → back. Date pill bottom-right, sharp corners, "WED APR 16". Pinch peek zoom to ~3x, springs back. (Perf: only the *active* 1-col card mounts the post-wall composers.)
- Search input dims non-matching events; works with category filters. (View-transition animates chip taps, not keystrokes.)
- **FilterBar (LOCKED):** 'All' and '♥' are fixed left anchors over a solid bg ("magic wall" — carousel chips disappear behind them). Category chips: Music, Drag, Dance, Art, Film, Literary, Trivia, Other. Chips tripled for infinite-loop illusion; drag-to-scroll with wrap; active chip snaps 16px from right. The **neighborhood/community chip** is folded into the genre carousel (scrolls like a normal chip, small diamond, neutral styling) and opens the community wall.

### COMMUNITY WALL (`CommunityWall.tsx`, edge fn `submit-community-post`)
- Opens from the neighborhood chip. A region (**sextant**) board of free **personal** posts (sale items, yard sales, notices), visually distinct from event posters (rounded cards, COMMUNITY tag, author chip).
- **AI moderation is authoritative server-side:** Claude Vision screens each image; clean → publish immediately; flagged (sexual/violent/hateful/disturbing) → `pending` for admin review; moderation failure → fails SAFE to pending. Author always sees their own post ("In review" until approved).
- **Lost-pet alerts** (`post_type='lost_pet'`): always route through admin approval (approval is what fires the broadcast); on publish, a trigger notifies every profile whose `home_neighborhood` EXACTLY matches (one alert/post, author excluded). Community wall covers the whole region; lost-pet hits the exact neighborhood only.
- **Business posts**: minimal v1 stub — never auto-publish; admin "Mark paid → release"; Stripe Payment Link via `VITE_STRIPE_BUSINESS_POST_URL` (currently unset). Per-post Checkout + webhook is TODO.

### MSG (`MsgScreen.tsx`) + PLASTER SLAP (`slap.ts`, `SlapSheet.tsx`, `SlapHand.tsx`)
- DMs + group chats. GIFs (Klipy). Search across participant usernames AND message content (`search_my_messages`). Soft-delete messages (`deleted_at`). Notifications panel lives in this tab and routes by `kind`.
- **Conversation identity = PEOPLE, not events.** 1-on-1 titled by the other person's `@username` + their diamond; never an event poster/title. Group title = `name` if set, else members' names. A slapped thread is never event-titled.
- **Group rename + group photo:** `GroupEditSheet.tsx` (image via `optimizeImage` → avatars bucket; updates `conversations.name`/`avatar_url`; member-only RLS).
- **Co-member visibility (migration 088 / `get_my_conversation_members`):** because the `profiles` RLS hides private users from non-followers, a *private* member of a group you're in used to vanish entirely (no name/diamond, blank message-bubble avatar). Now `loadInbox` sources co-member identity from the SECURITY DEFINER RPC — shared membership is the consent (like iMessage/WhatsApp). **Identity only** comes through; the **full portrait stays `is_public`-gated**, so tapping a private co-member's diamond shows AvatarFullscreen's "private" locked state.
- **Plaster Slap** = invite friends to a show via a group chat. From a poster's event detail, "Slap your friends" → `SlapSheet`: "Recent crews" (existing groups) as presets + a friends list (people you follow). **No auto-RSVP — a slap is an invitation.** Thread resolution: reuse the conversation whose member set **exactly** equals {you + slapped} (DM/group-agnostic; consolidates onto the oldest if duplicates exist); only a genuinely new set of people creates a thread. Posts a structured `message_type='slap'` message with `event_id`. A trigger fires one `slap` notification per other member (deduped so a slap doesn't also fire a `message` notification — migration 086).
- **Slap message render:** centered, card-less — event poster, then "@sender wants to go with you to" (third-person for EVERYONE incl. the sender — no "You wanna go…" variant), then the bold event title, then "tap to see the event →". A floating green **outline** "Going ✓" button (uses `--slap-green-border`/`--slap-green-text` so it's legible in dark mode) does the independent in-chat RSVP.
- **Slap icon:** line-art hand `SlapHand.tsx` (stroke=currentColor). **Never an emoji hand** (🤚/🖐).
- Conversation-row right edge shows the slapped event poster thumb **only while the row is unread**, and it clears once the thread is opened.

### YOU + PROFILES (`YouScreen.tsx`, `AccountProfile.tsx`, `AvatarFullscreen.tsx`)
- **`YouScreen` handles self-view; for any OTHER user it delegates to `AccountProfile.tsx`.** (This bit you — a recent bug was that the profile-photo diamond tap was wired in YouScreen's self layout + the chat header but NOT in `AccountProfile`, so tapping a friend's diamond did nothing. Now fixed: both diamonds in `AccountProfile` open `AvatarFullscreen`.)
- **AvatarFullscreen** = tap a diamond → full portrait. Gate is entirely the existing `is_public` RLS: self → always (with edit pencil); public → anyone; private/blocked & not self → the fetch returns nothing → graceful "This profile is private" locked state (a `loaded` flag distinguishes loading from locked). Account-type-agnostic (public venues/artists view like anyone). This same component is used on the profile page AND the MSG chat header.
- Self view: diamond avatar + "+" → AvatarUploader (diamond crop); @username + badge + bio; followers/following/attended counts (tap → FollowListPanel); pending-VA banner (realtime); edit profile (bio + public toggle); find-people search; attended grid; SocialDiamondRow; settings gear.
- Other-user view: read-only header; FollowButton + Message; UserActionsMenu (block/mute/report); diamond → AvatarFullscreen.

### ONBOARDING (`OnboardingScreen.tsx`) — 6 steps, shown only when `username` is null
1. Username 2. Account type (Personal / Artist / Venue — VA writes `pending_account_type`, stays 'person' until admin approves) 3. Avatar (Capacitor Camera → AvatarUploader; skippable) 4. Interests 5. Phone (hashed client-side, E.164 → SHA-256, before leaving device; skippable) 6. Find Friends (reads contacts via Capacitor, hashes, calls `match_contacts()`).

### AUTH (`AuthScreen.tsx`)
Sign in / Sign up. OTP signup (email 6-digit code → verify → session → onboarding). Password reveal. Terms + Privacy agreement gate on signup. 60s resend cooldown.

### MAP (`MapScreen.tsx`)
Mapbox GL JS, Portland centered (45.5051, -122.6750, zoom 12). Night = dark-v11 / Day = light-v11. **Knurl-wheel** day scrubber (machined metal, 7 days, momentum + snap). Venue pins, radius filter, list-mode bottom sheet (two snap points), category chips, search slides up matching events, preferences panel.

### LINE UP (`LineUpScreen.tsx`)
Activity feed (♥ hearts, real poster images in diamonds) + a right-edge diamond queue of upcoming RSVPs. LINE UP panel slides from the RIGHT (yours); profile panels slide from the LEFT (theirs) — spatial logic is intentional and LOCKED. **The feed still uses mock data with real Portland show names — wiring it to a real activity source is an open task.**

### MODERATION
User-facing `UserActionsMenu` (block = mutual invisibility + auto-deletes follows + blocks messaging; mute = one-way silence, no notice; report → `ReportContentSheet`). `PrivacyPanel` lists blocked/muted with unblock/unmute. Admin: `AdminReports.tsx` queue (resolve/dismiss/suspend/delete), email alert to plasterpdx@gmail.com via Resend, nav badge when open reports exist. DB-enforced via restrictive RLS + the block/mute helpers.

### VA (Venue/Artist) ACCOUNTS
Pick Artist/Venue in onboarding → `pending_account_type` → admin `AdminVARequests` approve/decline → `account_type` set, pending cleared → YouScreen banner updates via realtime. `AccountTypeBadge` shows for artist/venue.

### CONTACTS / FIND FRIENDS (`FindFriends.tsx`, `contactHash.ts`)
Phone + email hashed client-side; only hashes leave the device. `match_contacts()` returns display columns only. Shows "On Plaster" (FollowButton) + "Invite" (Capacitor Share to plasterthewall.com).

### PUSH (iOS) (`usePushNotifications.ts`)
Registers APNs token → `device_tokens`. DB triggers fire for follow/follow_accepted/message/reply/slap/etc. In-app routing by `kind`.

### ADMIN (`/admin`) + STAFF
Password gate → `sessionStorage.plaster_admin_unlocked`. Wall shows an "Edit" pill when unlocked → `AdminEditModal` (8-handle crop, dark mask, live 2:3 preview, fill-frame + focal pan, poster offset, 30s undo). Admin page: notifications panel, VA queue, reports queue, Add Venue, Add Event, **Import Poster** (full AI ingestion: drop up to 4 images → `extract-poster` Claude Vision → title/venue/date/time/address/editorial description/category/confidence/crop → venue enrichment DB→Mapbox→AI → review form with ⚠ on uncertain fields → duplicate detection → fill_frame + focal → recurring toggle → submit). **Batch poster mode** (`BatchImport.tsx`): drop many, auto-pair poster+info, review checklist, sequential extraction reusing the same pipeline. Staff tooling (roster/shifts/chat/presence/stats) exists for venue check-off.

### iOS / Capacitor
B&W torn-paper icon; theme-aware splash with fade; edge-to-edge (StatusBar overlay + safe-area-inset-top); keyboard accessory bar disabled; `pickImage.ts` wraps Camera (handles denial → `CameraDeniedSheet`); Contacts plugin for FindFriends.

### IMAGE / EXIF HYGIENE
All **client** upload paths re-encode through a canvas (`optimizeImage` or `canvas.toBlob`/`convertToBlob`), which strips EXIF before upload: ImportForm, BatchImport, EventForm, AvatarUploader, BannerUploader, AdminEditModal, CommunityWall, GroupEditSheet. (The scraper has its own best-effort strip but is mothballed.)

---

## 7. DESIGN SYSTEM (LOCKED IN — DO NOT CHANGE)

**Colors:** Night (default) bg `#0c0b0b`, text `#f0ece3`. Day bg `#f0ece3`, text `#0c0b0b`. Theme toggle = swipe the "plaster" wordmark RIGHT (spring bounce, persisted). CSS vars `--bg`, `--fg`, and `--fg-08 … --fg-80` opacity ramp. Accent purple `#A855F7` exists (solid bg, white text) — **but Rob now prefers NOT to default new UI to purple; use the neutral palette unless purple is clearly right.**

**Typography (not interchangeable — they're the identity):** Playfair Display 900 (wordmark + headings), Barlow Condensed 700/900 (date blocks, chips, nav labels), Space Grotesk (UI/body).

**Hearts:** Unicode `♥` only — NEVER the emoji ❤️ (renders red on iOS). Never red anywhere.

**Diamonds:** square on its tip, `clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)`. Poster images inside a diamond are always UPRIGHT (diamond is a mask, not a rotation). `Diamond.tsx` takes `diamondUrl` (preferred), `fallbackUrl`, `size`, `onClick`. Used in LINE UP queue, feed avatars, profiles everywhere.

---

## 8. WORKFLOW & STANDING RULES

- **Editing:** Warp Claude does all file edits. You (chat) do planning/design/prompts.
- **Deploy:** `git push` → Vercel auto-deploys from `main`.
- **DB migrations (hard rule):** schema changes go through **numbered files** in `supabase/migrations/` applied with `npx supabase db push`. The Supabase MCP may *inspect* prod freely, but any MCP-applied DDL must be immediately followed by a matching numbered file + `supabase migration repair` reconciliation (so local files and remote history don't diverge). History was reconciled on 2026-06-11.
- **Quality gate before commit:** `npx tsc --noEmit && npm run build && npm test && npx cap sync ios`. Regenerate types after a migration: `npm run types:gen` (linked).
- **DEV button rule:** every new feature flow gets a localhost-only DEV button. No exceptions.
- **Commits:** end messages with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Push only when Rob asks. Destructive/irreversible prod actions need explicit authorization (an auto-approval classifier will otherwise block them).
- **Rob's working style:** action-first, learns by doing; when he asks to cat a file he wants RAW output, not a summary; prefers direct instructions and acknowledged progress; two test accounts (his main + "letshavesometea"; also "Slobber", "coinsforcatbert"). Credentials in a locked Apple Note.

---

## 9. RECENT HISTORY — WHAT'S SHIPPED (last ~15 commits, newest first)

```
f2d1fe9 fix(profile): tap a user's diamond on their profile to view full photo
14d9565 docs(claude): standing rule — chat↔Warp verify-first
6142ce3 Co-members visible to each other in group chats (option A) [migration 088]
45f5c9c Tap chat-header diamonds to view full photo; person-only slap picker
31e5bad legal(terms): add Community posts and neighborhood content section
bf2d82b chore(scrape): note EXIF-strip fallback in last_run_note
21e119e fix(slap): reuse thread by exact participant set, not by event
72ecdc0 perf(wall/1col): only the active card mounts the post-wall composers
a39795e fix(msg): conversation identity = people, event lives inside the thread
fd051cd fix(slap): sender line names the slapped crew, not "the crew"
2256242 fix(slap): drop avatar on slap-thread header, short "Going ✓"
4b80082 fix(slap): portal SlapSheet to body (1-col strip transform clip)
c41ebb0 redesign(slap): poster to header, centered text, outline Going button
2141fb8 perf(blocks/mutes): share one fetch across all callers
3945d18 perf(wall): lazy-load the blurred card backdrop
```
Earlier this cycle: Plaster Slap core (`5cbf84a`), neighborhood foundation + community wall + lost-pet (`082`–`084`, commits a190fcd/4WQ.../etc.), batch poster mode, EXIF hygiene, Terms third-party + community clauses, migration-history reconciliation.

**Verified live this session:** all the above are deployed; the DB has `community_posts`, `conversations.avatar_url`, `messages.message_type/event_id`, `notifications.target_conversation_id/target_community_post_id`, `profiles.home_neighborhood/home_sextant/avatar_full_url`, and the `get_my_conversation_members` function. `lost_pet` is allowed by the notifications kind constraint (no lost-pet has fired in prod yet).

---

## 10. KNOWN ISSUES / OPEN ITEMS

1. **LINE UP feed is still mock data** — needs wiring to a real activity source (a real `activity_feed` view/query). Biggest "soul" gap.
2. **reportGifShare 400** (Klipy analytics URL/JSON shape wrong) — tracked in `src/components/admin/KNOWN_BUGS.md`.
3. **Showbar address wrong in DB** ("Southwest Naito Parkway" is incorrect).
4. **Duplicate same-people message threads** existed in the test DB (pre-slap-fix leftovers); Rob considers these handled/not worth cleaning. The current code reuses the oldest thread, so no *new* duplicates are created.
5. **Community business posts** are a v1 stub (Stripe Payment Link unset; no per-post Checkout/webhook yet).
6. `scrape-sources` / auto-ingest is **mothballed** — don't design around it unless explicitly asked.

---

## 11. ONE-PARAGRAPH "THE FEELING" (keep this in mind)

You open Plaster and you feel the city. You see a poster for something you didn't know was happening and think — *wait, that's this Friday.* You see your friend is going. You tap "I'll be there" and a diamond joins your queue. You close the app and go get ready. That's the whole product. Every decision should serve that.

---

*End of briefing. When in doubt: the wall is sacred, night mode is right, the poster is art, and have Warp verify anything data-shaped against the live DB before building.*
