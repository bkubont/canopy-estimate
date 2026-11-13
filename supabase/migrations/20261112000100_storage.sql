-- Private file storage for logos, signatures, photos and PDFs.
-- Paths are always "<org_id>/<anything>", so access follows company membership.

insert into storage.buckets (id, name, public)
values ('org-files', 'org-files', false)
on conflict (id) do nothing;

create policy "org files: members read"
  on storage.objects for select to authenticated
  using (bucket_id = 'org-files' and public.is_member(((storage.foldername(name))[1])::uuid));

create policy "org files: members upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'org-files' and public.is_member(((storage.foldername(name))[1])::uuid));

create policy "org files: members replace"
  on storage.objects for update to authenticated
  using (bucket_id = 'org-files' and public.is_member(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'org-files' and public.is_member(((storage.foldername(name))[1])::uuid));

create policy "org files: owner/office delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'org-files' and public.has_role(((storage.foldername(name))[1])::uuid, array['owner', 'office']));
