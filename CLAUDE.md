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
