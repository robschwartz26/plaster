-- Account type distinguishes users for relationship semantics:
-- 'person' = mutual Connect (default for existing users)
-- 'artist' = one-way Follow (bands, solo artists, performers)
-- 'venue' = one-way Follow (event spaces)

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_type text NOT NULL DEFAULT 'person'
  CHECK (account_type IN ('person', 'artist', 'venue'));

CREATE INDEX IF NOT EXISTS profiles_account_type_idx ON public.profiles(account_type);

-- Backfill existing rows (migration default 'person' applies, but explicit for safety)
UPDATE public.profiles SET account_type = 'person' WHERE account_type IS NULL;
