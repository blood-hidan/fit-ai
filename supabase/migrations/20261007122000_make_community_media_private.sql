-- Replace legacy public URLs with object paths before disabling public access.
UPDATE public.posts
SET media_url = regexp_replace(media_url, '^.*/object/public/community-media/', '')
WHERE media_url LIKE '%/object/public/community-media/%';

UPDATE public.stories
SET media_url = regexp_replace(media_url, '^.*/object/public/community-media/', '')
WHERE media_url LIKE '%/object/public/community-media/%';

UPDATE storage.buckets
SET public = false
WHERE id = 'community-media';

DROP POLICY IF EXISTS "Community media public read" ON storage.objects;
CREATE POLICY "Community media readable only for visible content"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (
    bucket_id = 'community-media'
    AND (
      (SELECT auth.uid())::text = (storage.foldername(name))[1]
      OR EXISTS (SELECT 1 FROM public.posts p WHERE p.media_url = storage.objects.name)
      OR EXISTS (
        SELECT 1 FROM public.stories s
        WHERE s.media_url = storage.objects.name AND s.expires_at > now()
      )
    )
  );
