-- Add is_admin column to profiles (defaults to false)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

-- Create a security-definer function that checks admin status
-- SECURITY DEFINER means the function bypasses RLS when checking —
-- necessary because otherwise policies would recursively check themselves
CREATE OR REPLACE FUNCTION public.is_admin(user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM profiles WHERE id = user_id),
    false
  )
$$;

-- Allow authenticated users to check the function (needed for RLS policies)
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO anon;

-- Create an index on is_admin for the rare cases we query by it
CREATE INDEX IF NOT EXISTS profiles_is_admin_idx ON profiles(is_admin)
  WHERE is_admin = true;
