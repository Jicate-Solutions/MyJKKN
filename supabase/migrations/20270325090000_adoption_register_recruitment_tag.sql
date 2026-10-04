-- Adoption loop — register "tag a colleague on a recruitment candidate's discussion"
-- (#4006, merged 2026-09-24 17:27 IST) and record it where it happens.
--
-- Traced in jicate/main, not from the PR title:
--   route  POST /api/hr/recruitment/candidates/[id]/comments/mentions
--          (lib/api/hr/recruitment/candidates/handlers/comment-mentions.ts)
--   gate   the tag is written through the caller's session: RLS on
--          hr_recruitment_comment_mentions allows only the comment's author, and the
--          comment itself needs the candidate row to be readable (candidate RLS).
--   wired  directly, on the session client, when outcome.created is non-empty — a new
--          tag, so a repeat of the same tag counts nothing. Share means "did it".
--
-- intended_roles — the people who actually discuss candidates. Every comment ever
-- written on a candidate (94 at 19:20 IST 2026-09-24) came from coo, cao, principal,
-- ceo, hod or a super admin; the COO wrote 84 of them. hr_head and 'recuritment' (the
-- recruitment office, spelled as stored) run the process and are included. HODs are
-- left out: one HOD has ever commented once, and counting all HODs would make the
-- feature read dead for the wrong reason.
--
-- cadence 'event' — there is only something to discuss when a candidate is in play.
-- usage_wired false — no tag has been made yet (0 rows in
-- hr_recruitment_comment_mentions at 19:20 IST); flipped after a real use.
--
-- NOT registered: searching candidates from the approvals page (also #4006). It is a
-- way to find a candidate, not an action of its own.
--
-- GUARD: adds at most one row, only this key; the end state must hold the label as
-- written. Re-running is safe: 0 rows added, the end-state check still passes.

DO $$
DECLARE
  v_added int;
BEGIN
  INSERT INTO public.feature_registry (
    feature_key, title, module, intended_roles, core_action,
    shipped_at, source_pr, usage_wired, status, cadence
  )
  VALUES (
    'hr.recruitment_tag_colleague',
    'Tag a colleague on a candidate''s discussion',
    'hr',
    ARRAY['coo', 'cao', 'ceo', 'principal', 'hr_head', 'recuritment']::text[],
    'tag a colleague on a recruitment candidate''s discussion',
    '2026-09-24T11:57:33Z'::timestamptz,
    4006,
    false,
    'live',
    'event'
  )
  ON CONFLICT (feature_key) DO NOTHING;
  GET DIAGNOSTICS v_added = ROW_COUNT;
  IF v_added > 1 THEN
    RAISE EXCEPTION 'adoption guard: insert added % rows, expected at most 1', v_added;
  END IF;

  IF (SELECT count(*) FROM public.feature_registry
       WHERE feature_key = 'hr.recruitment_tag_colleague'
         AND intended_roles = ARRAY['coo', 'cao', 'ceo', 'principal', 'hr_head', 'recuritment']::text[]
         AND cadence = 'event'
         AND status = 'live') <> 1 THEN
    RAISE EXCEPTION 'adoption guard: hr.recruitment_tag_colleague is not registered as written';
  END IF;

  RAISE NOTICE 'adoption: % registry row(s) added', v_added;
END $$;
