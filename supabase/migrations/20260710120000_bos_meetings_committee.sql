-- Adds bos_meetings.committee_id — which council/committee of the composition
-- convened the meeting (e.g. Curriculum Development Cell, Department Advisory
-- Board, Academic Council body).
--
-- Why: TA/DA remuneration rates differ per council/committee. Tagging each
-- meeting with the convening committee lets the attendance-driven claim
-- generation and reports pick the right rate table, and lets the meeting's
-- member list draw from that committee's members (bos_members.committee_id).
--
-- Committees are composition-owned (20260610 + 20260706 migrations), so the
-- meeting's committee is always one of its composition's committees — the UI
-- enforces this; no cross-composition constraint is added at the DB level to
-- keep legacy/template rows (composition_id IS NULL) usable.
ALTER TABLE public.bos_meetings
  ADD COLUMN IF NOT EXISTS committee_id uuid
    REFERENCES public.bos_committees(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bos_meetings_committee_id
  ON public.bos_meetings(committee_id);

COMMENT ON COLUMN public.bos_meetings.committee_id IS
  'Convening council/committee (bos_committees, composition-owned). Drives council-specific TA/DA rate selection and scopes the meeting''s member list. NULL for Academic Council meetings (the AC body itself convenes) and legacy rows.';

-- Backfill: when the meeting''s composition has exactly one active committee
-- (the common case — the default "Curriculum Development Cell"), attribute the
-- meeting to it. Ambiguous/zero-committee compositions stay NULL.
UPDATE public.bos_meetings m
SET committee_id = c.id
FROM public.bos_committees c
WHERE m.committee_id IS NULL
  AND c.composition_id = m.composition_id
  AND c.is_active
  AND (
    SELECT count(*) FROM public.bos_committees c2
    WHERE c2.composition_id = m.composition_id AND c2.is_active
  ) = 1;

-- Supersedes the short-lived bos_meetings.council text column (added earlier
-- on 2026-07-10, never consumed by any shipped code): the convening body is
-- relational (committee_id) rather than a free-text enum.
ALTER TABLE public.bos_meetings DROP COLUMN IF EXISTS council;
