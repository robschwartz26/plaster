-- Privacy toggle for the social diamond row on profile views.
-- When true (default), other people can see this user's followers/following row.
-- When false, the row only renders for the user themselves.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS show_social_publicly boolean NOT NULL DEFAULT true;

UPDATE public.profiles SET show_social_publicly = true WHERE show_social_publicly IS NULL;
