-- Private storage for saved estimate / invoice PDFs.
-- Paths are "<org_id>/<job_id>/<kind>-<n>.pdf". Only owner/office can read or
-- add files, and nobody can change or delete one (copies are final).
-- Run after 20261126000000_documents.sql.

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

drop policy if exists "documents: owner/office read" on storage.objects;
create policy "documents: owner/office read"
  on storage.objects for select to authenticated
  using (bucket_id = 'documents' and public.has_role(((storage.foldername(name))[1])::uuid, array['owner', 'office']));

drop policy if exists "documents: owner/office upload" on storage.objects;
create policy "documents: owner/office upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and public.has_role(((storage.foldername(name))[1])::uuid, array['owner', 'office']));
