-- Phase 5, step 4: keep receipt pictures from crew in file storage too.
-- (Run after 20261117000000_photos.sql. Tree and job photos stay readable by
-- the whole team; "<org_id>/receipts/…" only by owner/office.)

drop policy if exists "org files: members read" on storage.objects;
create policy "org files: members read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'org-files'
    and public.is_member(((storage.foldername(name))[1])::uuid)
    and (
      coalesce((storage.foldername(name))[2], '') <> 'receipts'
      or public.has_role(((storage.foldername(name))[1])::uuid, array['owner', 'office'])
    )
  );
