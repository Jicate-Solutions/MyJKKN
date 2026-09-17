-- ─── Comment tags — remember whether the tagged person was actually told ────
-- 2026-09-17  [BUG-006139, review follow-up on PR #3863]
--
-- THE GAP. The mentions API granted access (inserted the tag) and THEN sent the
-- alert. If the alert failed, access existed but the colleague was never told —
-- and re-tagging them was a no-op (ON CONFLICT DO NOTHING returned no row), so
-- nothing ever re-sent it.
--
-- THE FIX. Each tag records when its alert was delivered. A tag with
-- notified_at IS NULL is "granted, not yet told"; every tag request for that
-- person on that comment (the author's Resend) finishes the job. The alert uses
-- an idempotency key derived from the tag and its previous notified_at, so a
-- retried or double-clicked request sends once, and an explicit re-tag after a
-- successful alert sends a fresh reminder.
--
-- Written ONLY by the service role (the API route), after the fan-out
-- succeeds. authenticated keeps no UPDATE on either table.
--
-- No BEGIN/COMMIT: applied through exec_sql (scripts/apply-migration-file.mjs).
-- Idempotent.

ALTER TABLE public.resource_reservation_comment_mentions
  ADD COLUMN IF NOT EXISTS notified_at timestamptz;

ALTER TABLE public.event_review_comment_mentions
  ADD COLUMN IF NOT EXISTS notified_at timestamptz;

COMMENT ON COLUMN public.resource_reservation_comment_mentions.notified_at IS
  'When the tagged person''s in-app alert was last delivered. NULL = access granted but the alert has not gone out yet; the author''s Resend retries it. Set by the service role only.';
COMMENT ON COLUMN public.event_review_comment_mentions.notified_at IS
  'When the tagged person''s in-app alert was last delivered. NULL = access granted but the alert has not gone out yet; the author''s Resend retries it. Set by the service role only.';

-- Backfill: a tag counts as told when a mention notification for its comment
-- reached that person's inbox (verified 2026-09-17: all 3 event tags had one;
-- there were no reservation tags yet).
UPDATE public.event_review_comment_mentions m
   SET notified_at = sub.delivered_at
  FROM (
    SELECT m2.id AS mention_id, min(n.created_at) AS delivered_at
      FROM public.event_review_comment_mentions m2
      JOIN public.notifications n
        ON n.metadata->>'source' = 'events_review_mention'
       AND n.metadata->>'comment_id' = m2.comment_id::text
      JOIN public.user_notifications un
        ON un.notification_id = n.id
       AND un.user_id = m2.mentioned_user_id
     GROUP BY m2.id
  ) sub
 WHERE m.id = sub.mention_id
   AND m.notified_at IS NULL;

UPDATE public.resource_reservation_comment_mentions m
   SET notified_at = sub.delivered_at
  FROM (
    SELECT m2.id AS mention_id, min(n.created_at) AS delivered_at
      FROM public.resource_reservation_comment_mentions m2
      JOIN public.notifications n
        ON n.metadata->>'source' = 'resource_reservation_mention'
       AND n.metadata->>'comment_id' = m2.comment_id::text
      JOIN public.user_notifications un
        ON un.notification_id = n.id
       AND un.user_id = m2.mentioned_user_id
     GROUP BY m2.id
  ) sub
 WHERE m.id = sub.mention_id
   AND m.notified_at IS NULL;

DO $assert$
BEGIN
  IF has_table_privilege('authenticated', 'public.resource_reservation_comment_mentions', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.event_review_comment_mentions', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated must not hold UPDATE on a mentions table — notified_at is service-role only';
  END IF;
END
$assert$;

NOTIFY pgrst, 'reload schema';
