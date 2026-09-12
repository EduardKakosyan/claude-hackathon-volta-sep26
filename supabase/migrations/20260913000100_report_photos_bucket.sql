-- Private bucket for report photos. Separate file because `storage.buckets` only exists on
-- Supabase; the PGlite harness applies the reports migration alone.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('report-photos', 'report-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- No storage.objects policies are created: with no policies, only the service role can read or
-- write the bucket, which is the intended access model.
