insert into storage.buckets (id, name, public)
  values ('posters', 'posters', true)
on conflict (id) do nothing;

create policy "Anyone can read posters"
  on storage.objects for select
  using (bucket_id = 'posters');

create policy "Authenticated users can upload posters"
  on storage.objects for insert
  with check (bucket_id = 'posters' and auth.role() = 'authenticated');
