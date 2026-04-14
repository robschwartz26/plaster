-- Add hours column to venues
alter table public.venues add column if not exists hours text;
