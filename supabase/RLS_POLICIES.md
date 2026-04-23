# Plaster RLS Policy Reference

**Last verified against live DB: 2026-04-22 (venues updated migration 011, 2026-04-22)**

This document is the authoritative reference for all Row Level Security
policies on the public schema. Migration files may diverge from live state —
always trust the live DB (or re-run the query below) when debugging RLS issues.

---

## Tables at a Glance

| Table | RLS On | Notes |
|---|---|---|
| admin_notifications | ❌ NO | **Security gap** — see below |
| attendees | ✅ | Duplicate policies present |
| conversation_members | ✅ | Uses `is_conversation_member()` RPC |
| conversations | ✅ | Uses `is_conversation_member()` RPC |
| event_likes | ✅ | |
| event_wall_posts | ✅ | Duplicate policies present |
| events | ✅ | Broad UPDATE bypass — see below |
| follows | ✅ | |
| messages | ✅ | No DELETE policy by design |
| post_likes | ✅ | |
| profiles | ✅ | No DELETE policy by design |
| superlatives | ✅ | SELECT only — writes are service-role only |
| venue_follows | ✅ | |
| venues | ✅ | UPDATE/DELETE require `is_admin()` or `created_by` ownership (migration 011) |

---

## Tables and Policies

### admin_notifications
**Purpose:** Internal admin alerts — recurring event check-ins, duplicate venue detection results.

**RLS: DISABLED** — any authenticated client can read and write this table freely. Since
this table is only accessed from `/admin` (password-gated), this is low-risk in practice,
but should be fixed before Plaster has real users.

**Recommendation:** Enable RLS with no policies (blocks all client access) or add a
service-role-only policy. Admin page uses the anon key from the browser, so the simplest
fix is enabling RLS with no public policies — the admin page would then need to route
notification writes through an Edge Function with the service key.

**Policies:** None.

---

### attendees
**Purpose:** Tracks which users are attending which events ("I'll Be There" RSVPs).

**⚠️ Duplicate policies:** This table has two complete sets of policies — an older set with
human-readable names and a newer snake_case set. Both are PERMISSIVE, so they OR together
and don't conflict, but the duplicates are cleanup debt.

**Policies:**

- **`attendees_select`** / **`Attendees are viewable by everyone`** (`SELECT`, public)
  - Condition: `true`
  - Intent: Anyone (logged in or not) can see the attendee list for any event. Powers the
    "X people going" count on the info panel.

- **`attendees_insert`** / **`Users can mark themselves as attending`** (`INSERT`, public)
  - Condition: `auth.uid() = user_id`
  - Intent: You can only RSVP as yourself — prevents inserting rows on behalf of other users.

- **`attendees_delete`** / **`Users can remove their own attendance`** (`DELETE`, public)
  - Condition: `auth.uid() = user_id`
  - Intent: You can only un-RSVP yourself.

**TODO:** Remove the duplicate older named policies (keep snake_case set).

---

### conversation_members
**Purpose:** Maps users to conversations (many-to-many). One row per user per conversation.

**Policies:**

- **`select_members_if_in_conversation`** (`SELECT`, authenticated)
  - Condition: `is_conversation_member(conversation_id, auth.uid())`
  - Intent: You can only see membership rows for conversations you're already in. Prevents
    enumerating who else is in private conversations you aren't part of.

- **`insert_own_membership`** (`INSERT`, authenticated)
  - Condition: `user_id = auth.uid()`
  - Intent: You can only insert yourself into a conversation — not add other users.
    The `create_or_get_conversation` RPC handles multi-party setup using the service role.

- **`update_own_last_read`** (`UPDATE`, authenticated)
  - Condition: `user_id = auth.uid()`
  - Intent: You can only update your own `last_read_at` timestamp — used to track unread
    message counts.

---

### conversations
**Purpose:** A conversation thread. Contains metadata (created_at, etc.) but not messages.

**Policies:**

- **`select_conversations_if_member`** (`SELECT`, authenticated)
  - Condition: `is_conversation_member(id, auth.uid())`
  - Intent: You can only see conversations you belong to.

- **`insert_conversations_authenticated`** (`INSERT`, authenticated)
  - Condition: `auth.uid() IS NOT NULL`
  - Intent: Any logged-in user can create a new conversation. The membership rows are
    inserted separately via `create_or_get_conversation` RPC.

- **`update_conversations_if_member`** (`UPDATE`, authenticated)
  - Condition: `is_conversation_member(id, auth.uid())`
  - Intent: Any member can update conversation metadata (e.g. group name). TODO: may
    want to restrict this to conversation creator only in the future.

---

### event_likes
**Purpose:** Tracks which users liked which events (heart on poster).

**Policies:**

- **`Likes are viewable by everyone`** (`SELECT`, public)
  - Condition: `true`
  - Intent: Like counts are public. Also needed so the wall can show whether the current
    user has liked a given event.

- **`Authenticated users can like`** (`INSERT`, public)
  - Condition: `auth.uid() = user_id`
  - Intent: You can only like as yourself.

- **`Users can unlike their own likes`** (`DELETE`, public)
  - Condition: `auth.uid() = user_id`
  - Intent: You can only remove your own like.

---

### event_wall_posts
**Purpose:** User-written notes on an event's wall (the Post Wall panel in 1-col mode).

**⚠️ Duplicate policies:** Same as `attendees` — two complete sets with different naming
conventions. PERMISSIVE so no conflict, but cleanup debt.

**Policies:**

- **`posts_select`** / **`Wall posts are viewable by everyone`** (`SELECT`, public)
  - Condition: `true`
  - Intent: Posts are public — anyone can read the wall for any event.

- **`posts_insert`** / **`Authenticated users can post`** (`INSERT`, public)
  - Condition: `auth.uid() = user_id`
  - Intent: You can only post as yourself.

- **`posts_delete`** / **`Users can delete their own posts`** (`DELETE`, public)
  - Condition: `auth.uid() = user_id`
  - Intent: You can only delete your own posts. No moderation policy yet — TODO when
    real users arrive.

**TODO:** Remove duplicate older named policies. Add admin/moderation DELETE policy.

---

### events
**Purpose:** The core event records — title, venue, date, poster, category, description.

**⚠️ Broad UPDATE bypass:** The `Admin can update events` policy uses `USING: true, WITH
CHECK: true` on the `public` role. This means **any authenticated user can update any
event record**. It was added intentionally to unblock the admin poster-editing flow (the
browser-based admin uses the anon key, not the service key). Before Plaster has real users
this should be narrowed — either move admin writes to an Edge Function with the service
key, or add a check against a `is_admin` flag on profiles.

**Policies:**

- **`Events are viewable by everyone`** (`SELECT`, public)
  - Condition: `true`
  - Intent: Events are fully public — no login required to browse the wall or map.

- **`Authenticated users can create events`** (`INSERT`, public)
  - Condition: `auth.role() = 'authenticated'`
  - Intent: Any logged-in user can create an event. In practice, event creation happens
    only via the admin import flow.

- **`Admin can update events`** (`UPDATE`, public)
  - Condition: `USING: true` / `WITH CHECK: true`
  - Intent: Allows the browser-based admin (which runs as the anon key) to update event
    records — crop saves, poster swaps, title/date edits.
  - **Security gap:** Effectively allows any authenticated user to update any event.
    Acceptable while Plaster is invite-only; must be narrowed before public launch.

- **`Event creators can update via venue ownership`** (`UPDATE`, public)
  - Condition: venue's `created_by = auth.uid()`
  - Intent: Venue owners can update events at their venue. Redundant given the broad
    admin policy above, but is the right long-term policy to keep.

---

### follows
**Purpose:** User-to-user follow relationships. `status` field: `pending` or `accepted`.

**Policies:**

- **`Follows are viewable by everyone`** (`SELECT`, public)
  - Condition: `true`
  - Intent: Follow counts and follower lists are public.

- **`Users can follow others`** (`INSERT`, public)
  - Condition: `auth.uid() = follower_id`
  - Intent: You can only initiate follows as yourself.

- **`Users can accept incoming requests`** (`UPDATE`, public)
  - Condition: `auth.uid() = following_id`
  - Intent: Only the person being followed can accept a follow request (change status from
    `pending` to `accepted`). The follower cannot accept their own request.

- **`Users can unfollow`** (`DELETE`, public)
  - Condition: `auth.uid() = follower_id`
  - Intent: Only the follower can remove the relationship. The followed person cannot
    forcibly remove a follower — there's no "remove follower" policy yet.
  - **TODO:** Add a DELETE policy where `auth.uid() = following_id` to allow blocking /
    removing followers.

---

### messages
**Purpose:** Individual messages within a conversation.

**Policies:**

- **`select_messages_if_member`** (`SELECT`, authenticated)
  - Condition: `is_conversation_member(conversation_id, auth.uid())`
  - Intent: You can only read messages in conversations you belong to.

- **`insert_messages_if_member`** (`INSERT`, authenticated)
  - Condition: `sender_id = auth.uid() AND is_conversation_member(conversation_id, auth.uid())`
  - Intent: You can only send messages as yourself, and only into conversations you're
    already a member of.

**No DELETE policy** — messages cannot be deleted via the client. Intentional for now;
add when a "delete message" feature is built.

---

### post_likes
**Purpose:** Tracks which users liked which event wall posts.

**Policies:**

- **`post_likes_select`** (`SELECT`, public)
  - Condition: `true`
  - Intent: Like counts on wall posts are public.

- **`post_likes_insert`** (`INSERT`, public)
  - Condition: `auth.uid() = user_id`
  - Intent: You can only like as yourself.

- **`post_likes_delete`** (`DELETE`, public)
  - Condition: `auth.uid() = user_id`
  - Intent: You can only unlike your own likes.

---

### profiles
**Purpose:** User profiles — username, avatar, bio, interests.

**Policies:**

- **`Public profiles are viewable by everyone`** (`SELECT`, public)
  - Condition: `true`
  - Intent: Profiles are public. The `is_public` field exists on the table but is not
    yet enforced in RLS — **TODO:** add `USING (is_public = true OR auth.uid() = id)`
    to respect the privacy flag when private profiles are implemented.

- **`Users can insert their own profile`** (`INSERT`, public)
  - Condition: `auth.uid() = id`
  - Intent: You can only create a profile for yourself. Triggered during onboarding.

- **`Users can update their own profile`** (`UPDATE`, public)
  - Condition: `auth.uid() = id`
  - Intent: You can only edit your own profile.

**No DELETE policy** — profiles cannot be deleted via the client. Cascade deletes on
related tables (attendees, follows, etc.) are handled at the DB schema level.

---

### superlatives
**Purpose:** Badges awarded to users at venues (e.g. "Queen of the Crystal Ballroom").

**Policies:**

- **`Superlatives viewable by everyone`** (`SELECT`, public)
  - Condition: `true`
  - Intent: Superlatives are public badges displayed on profiles.

**No INSERT/UPDATE/DELETE policies** — all writes are blocked for client users. Superlatives
can only be written via the service role (Edge Functions or direct DB access). This is
intentional — superlatives are awarded by the system, not self-assigned.

---

### venue_follows
**Purpose:** Tracks which users follow which venues.

**Policies:**

- **`Venue follows are viewable by everyone`** (`SELECT`, public)
  - Condition: `true`
  - Intent: Venue follower counts are public.

- **`Users can follow venues`** (`INSERT`, public)
  - Condition: `auth.uid() = user_id`
  - Intent: You can only follow a venue as yourself.

- **`Users can unfollow venues`** (`DELETE`, public)
  - Condition: `auth.uid() = user_id`
  - Intent: You can only unfollow venues you followed.

---

### venues
**Purpose:** Venue records — name, neighborhood, address, lat/lng, hours, website, instagram.

**Policies (as of migration 011):**

- **`Venues are viewable by everyone`** (`SELECT`, public)
  - Condition: `true`
  - Intent: Venues are fully public — no login required.

- **`Authenticated users can create venues`** (`INSERT`, public)
  - Condition: `auth.role() = 'authenticated'`
  - Intent: Any logged-in user can create a venue. In practice, venue creation only happens
    via the admin form.

- **`Venue creator or admin can update venues`** (`UPDATE`, authenticated)
  - `USING`: `public.is_admin(auth.uid()) OR created_by = auth.uid()`
  - `WITH CHECK`: same
  - Intent: Admins can update any venue; the original creator can update their own venue.
    Replaced the old `Venue creators can update their venues` policy which had no admin
    escape hatch and no `WITH CHECK`.

- **`Venue creator or admin can delete venues`** (`DELETE`, authenticated)
  - `USING`: `public.is_admin(auth.uid()) OR created_by = auth.uid()`
  - Intent: Admins or original creators can delete a venue. Previously no DELETE policy
    existed — client-side deletes were silently blocked for everyone including admins.
  - **Note:** `created_by` may be null on venues inserted before this column was tracked.
    For those rows only admins can update/delete.

---

## Known RLS Gotchas

1. **`admin_notifications` has RLS disabled** — any authenticated user can read/write admin
   internal notifications. Safe while the app is invite-only. Must be fixed before public launch.

2. **`events` UPDATE is effectively wide-open for authenticated users** — the `Admin can update
   events` policy (`USING: true, WITH CHECK: true`) was added to unblock browser-based admin
   editing. Any logged-in user can currently update any event record. Intentional for now;
   must be narrowed before public launch.

3. **Duplicate policies on `attendees` and `event_wall_posts`** — both tables have two
   complete sets of policies (old human-named + new snake_case). They're PERMISSIVE so they
   don't conflict, but they're confusing and should be cleaned up.

4. **`profiles.is_public` is ignored by RLS** — the column exists but SELECT policy is
   `USING: true` regardless. Private profiles are not yet enforced.

5. **`venues.created_by` may be null** — admin-inserted venues may have no `created_by`,
   making the creator branch of the UPDATE/DELETE policy a no-op for those rows. Admins
   can still update/delete them via `is_admin()`. Ensure all new venue inserts set `created_by`.

6. **No follower-removal policy on `follows`** — the followed person cannot remove a follower.
   Only the follower can delete the relationship. No block/remove-follower feature yet.

7. **`is_conversation_member()` is a load-bearing RPC** — conversations, messages, and
   conversation_members all depend on this function for their SELECT/INSERT policies. If it
   breaks or is dropped, messaging goes dark.

---

## Regenerating this document

Run in Supabase SQL editor (Dashboard → SQL Editor):

```sql
-- All policies
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- RLS enabled/disabled per table
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```

Then update each table section above with any changes. For new policies, add an Intent
explanation. Mark anything unclear with `TODO: clarify intent`.
