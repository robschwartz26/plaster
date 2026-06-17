# Plaster — Claude Code project rules

## Database migrations (standing rule)

Schema changes go through **numbered migration files** in `supabase/migrations/`
applied with **`npx supabase db push`**. The numbered files + remote migration
history are the source of truth and must stay in sync.

The Supabase **MCP may be used to INSPECT prod** (read-only queries, schema
checks, advisors) freely. But any **MCP-applied DDL** (`apply_migration`, or
`execute_sql` that changes schema) **must be immediately followed by**:

1. a matching **numbered migration file** committed to `supabase/migrations/`, and
2. a migration-history reconciliation so the numbered version — not the MCP's
   auto-generated timestamp entry — is what remote records:
   - `npx supabase migration repair --linked --status applied <NNN>` for the new
     numbered file, and
   - `npx supabase migration repair --linked --status reverted <timestamp>` to
     drop the timestamp entry the MCP created.

Skipping this makes the local numbered files and the remote migration history
diverge, which makes `supabase db push` unusable.

> History: 067–081 were MCP/dashboard-applied without numbered-file
> reconciliation, diverging the history. Reconciled via `migration repair` on
> 2026-06-11; `db push` reports "up to date" when alignment holds.

## Collaboration model — Claude chat ↔ Warp (standing rule)

Prompts for this project are written by **Claude (the chat assistant)**, which designs and specs work from periodic code dumps. It does **not** have live database access. **You (Warp/Claude Code) do** — plus the running app, the real RLS, and the actual schema.

So the standing division of labor is:

- The chat assistant surfaces existing code, patterns, and prior decisions so you aren't starting blind, and writes the intent + design of each change.
- **You confirm against reality.** For ANY task touching the **schema, RLS, privacy/permission enforcement, storage, realtime, or live-data behavior**: BEFORE building, verify ground truth against the live DB — inspect actual RLS policies, run `\d` on the relevant tables, confirm real column names/types, and check how a policy *actually* resolves at query time (not how it's assumed to). Report findings first.
- If the live DB differs from what the prompt assumes, **say so and follow reality over the prompt.** Propose the optimal integration given what's actually there, then build.
- Apply this even when an individual prompt doesn't restate it — it's the baseline for every database- or permission-touching task.

The goal is to combine strengths: the chat assistant's design/pattern view + your live-DB authority, so neither works blind.
