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

## New functions are world-callable by default (standing rule)

Postgres grants `EXECUTE` to `PUBLIC` on every `CREATE FUNCTION`, and `PUBLIC`
includes `anon`. **A `GRANT EXECUTE ... TO authenticated` does not close
anything** — it restates a grant that is already implied. The only thing that
closes it is an explicit revoke:

```sql
revoke execute on function public.my_fn(arg_types) from public;
revoke execute on function public.my_fn(arg_types) from anon;
grant  execute on function public.my_fn(arg_types) to authenticated;  -- if a user needs it
```

So **every new `SECURITY DEFINER` function is reachable by any stranger holding
the anon key until you revoke it** — and the anon key ships in the browser
bundle, by design. Write the revoke in the same migration as the function.

Verify rather than assume, with nothing but the anon key:

```bash
curl -s -X POST "$VITE_SUPABASE_URL/rest/v1/rpc/<fn>" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" -H "Content-Type: application/json" -d '{}'
```

A `42501` is correct. A result, or a complaint about *arguments*, means anon
reached the function body.

> History (2026-11-23 audit): `match_contacts` and `capture_daily_metrics` were
> both anon-callable this way. `match_contacts` mattered most — a phone number
> is ten digits, so SHA-256 of an E.164 number is brute-forceable on a laptop,
> and anonymous access made it a scriptable "is this number on Plaster?" oracle
> against the whole North American numbering plan. Fixed in 118.

**Do not blanket-revoke across all security-definer functions.** Several are
called inside RLS policy expressions, which evaluate as the *querying* role —
`is_admin()` appears in policies across eight migrations — so a sweep locks real
users out of their own rows. Go one function at a time with its policies in view.

## Collaboration model — Claude chat ↔ Warp (standing rule)

Prompts for this project are written by **Claude (the chat assistant)**, which designs and specs work from periodic code dumps. It does **not** have live database access. **You (Warp/Claude Code) do** — plus the running app, the real RLS, and the actual schema.

So the standing division of labor is:

- The chat assistant surfaces existing code, patterns, and prior decisions so you aren't starting blind, and writes the intent + design of each change.
- **You confirm against reality.** For ANY task touching the **schema, RLS, privacy/permission enforcement, storage, realtime, or live-data behavior**: BEFORE building, verify ground truth against the live DB — inspect actual RLS policies, run `\d` on the relevant tables, confirm real column names/types, and check how a policy *actually* resolves at query time (not how it's assumed to). Report findings first.
- If the live DB differs from what the prompt assumes, **say so and follow reality over the prompt.** Propose the optimal integration given what's actually there, then build.
- Apply this even when an individual prompt doesn't restate it — it's the baseline for every database- or permission-touching task.

The goal is to combine strengths: the chat assistant's design/pattern view + your live-DB authority, so neither works blind.
