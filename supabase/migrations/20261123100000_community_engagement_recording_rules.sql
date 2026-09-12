-- ============================================================================
-- What counts as recorded community work, and who checked it.
--
-- CONTEXT. `sh_community_engagements` has existed and held ZERO rows. The
-- machinery around it shipped (capture panel, review queue, monthly sweep) but
-- the first entry has never been made, so none of its rules had ever been
-- tested against a real user. Four Director decisions of 2026-09-09 settle
-- them before the first entry rather than after.
--
--   3. WHO RECORDS  — any team member may record; their HoD approves.
--   6. NOT APPROVED — it WAITS. Nothing counts until a human approves it.
--   7. SELF-APPROVAL— permitted, but LABELLED, so an auditor can see it.
--   8. WHAT COUNTS  — date, venue, people helped, and at least 2 hours.
--
-- ── decision 6 is already the behaviour, and that is why this file is small ──
-- `approval_status` already defaults to 'pending' and is NOT NULL, so an entry
-- already counts for nothing until approved. Nothing here re-implements that.
-- What was missing is the other half — a list an HoD can actually work from —
-- which is the view at the bottom.
--
-- ── decision 8, and the one place this file does NOT reject ─────────────────
-- Date and venue are hard requirements: they are always answerable, and an
-- entry without them cannot be checked by anyone later.
--
-- The TWO-HOUR rule is deliberately NOT a rejection. The option the Director
-- chose carried a stated cost — "real work that took 45 minutes, like a school
-- visit, gets excluded and simply goes unrecorded" — and a CHECK constraint is
-- what would make that cost invisible: the entry is refused, the person gives
-- up, and nobody ever learns what was lost. So short work is RECORDED and
-- simply does not COUNT. His rule is unchanged (under two hours earns nothing);
-- what changes is that the excluded work stays visible and countable, so the
-- threshold can be revisited against evidence instead of memory.
--
-- ── defaults removed, because a default is an unanswered question ───────────
-- `hours_spent` and `beneficiaries_count` both defaulted to 0. A default of 0
-- makes "nobody filled this in" and "genuinely zero" identical in the data, and
-- the whole point of decision 8 is that those two are different. Dropping the
-- defaults forces the caller to state a number. The table is EMPTY, so no
-- existing row is affected.
--
-- ── decision 7 is a GENERATED column, not a flag anyone writes ──────────────
-- `self_approved` is computed from `approved_by = recorded_by`. A writable
-- boolean would be a second source of truth for a fact the table already
-- holds, and the two would drift on the first UPDATE that forgot it. Generated
-- STORED means it cannot be set, cannot be forgotten, and cannot lie.
-- ============================================================================

-- ── 1. Venue — decision 8 ───────────────────────────────────────────────────
-- Named `venue` to match `public.events`, the closest sibling. (`place` looked
-- popular at 242 repo hits; every one is CREATE OR REPLACE, regexp_replace or
-- `cdc_placements`. No column of that name exists.)
ALTER TABLE public.sh_community_engagements
  ADD COLUMN IF NOT EXISTS venue text;

UPDATE public.sh_community_engagements SET venue = '(not recorded)' WHERE venue IS NULL;

ALTER TABLE public.sh_community_engagements
  ALTER COLUMN venue SET NOT NULL;

-- Blank-but-present is the way a NOT NULL text column gets defeated.
ALTER TABLE public.sh_community_engagements
  DROP CONSTRAINT IF EXISTS sh_community_engagements_venue_not_blank;
ALTER TABLE public.sh_community_engagements
  ADD CONSTRAINT sh_community_engagements_venue_not_blank
  CHECK (btrim(venue) <> '');

COMMENT ON COLUMN public.sh_community_engagements.venue IS
  'Where the work happened. Required (decision 8, 2026-09-09). Non-blank enforced: an entry nobody can locate cannot be verified by anyone later.';

-- ── 2. A default of 0 is an unanswered question — decision 8 ────────────────
ALTER TABLE public.sh_community_engagements ALTER COLUMN hours_spent        DROP DEFAULT;
ALTER TABLE public.sh_community_engagements ALTER COLUMN beneficiaries_count DROP DEFAULT;

COMMENT ON COLUMN public.sh_community_engagements.hours_spent IS
  'Hours spent. No default: the caller must state a number, so "unfilled" and "zero" stay distinguishable. Under 2 hours is RECORDED but does not COUNT — see counts_toward_activity.';
COMMENT ON COLUMN public.sh_community_engagements.beneficiaries_count IS
  'How many people the work helped. No default, for the same reason as hours_spent.';

-- ── 3. What counts — decision 8, as a measure and not a gate ────────────────
ALTER TABLE public.sh_community_engagements
  ADD COLUMN IF NOT EXISTS counts_toward_activity boolean
  GENERATED ALWAYS AS (hours_spent >= 2 AND beneficiaries_count > 0) STORED;

COMMENT ON COLUMN public.sh_community_engagements.counts_toward_activity IS
  'The Director''s 2026-09-09 bar: at least 2 hours AND at least one person helped. Generated, so it cannot be set by a caller. Entries that fail it are kept, not refused — the excluded work stays visible so the threshold can be judged against evidence.';

CREATE INDEX IF NOT EXISTS idx_sh_community_engagements_counting
  ON public.sh_community_engagements (department_id, counts_toward_activity)
  WHERE approval_status = 'approved';

-- ── 4. Self-approval, visible — decision 7 ──────────────────────────────────
ALTER TABLE public.sh_community_engagements
  ADD COLUMN IF NOT EXISTS self_approved boolean
  GENERATED ALWAYS AS (approved_by IS NOT NULL AND approved_by = recorded_by) STORED;

COMMENT ON COLUMN public.sh_community_engagements.self_approved IS
  'True when the approver is the person who recorded it. Permitted (decision 7, 2026-09-09) but never silent. Generated from approved_by = recorded_by so it cannot drift from the fact it describes.';

-- ── 5. The list an HoD can work from — decision 6's missing half ────────────
-- security_invoker so the viewer's own RLS on the base table applies; without
-- it the view would run as owner and publish every college's pending work.
-- CREATE OR REPLACE, never DROP: a DROP would discard the ACL and leave anon
-- holding Supabase's default SELECT grant.
CREATE OR REPLACE VIEW public.v_sh_community_engagements_awaiting_approval
WITH (security_invoker = true) AS
SELECT
  e.id,
  e.department_id,
  e.institution_id,
  e.title,
  e.venue,
  e.engagement_date,
  e.hours_spent,
  e.beneficiaries_count,
  e.counts_toward_activity,
  e.recorded_by,
  e.created_at,
  (CURRENT_DATE - e.engagement_date) AS days_since_the_work,
  (CURRENT_DATE - e.created_at::date) AS days_waiting
FROM public.sh_community_engagements e
WHERE e.approval_status = 'pending';

REVOKE ALL   ON public.v_sh_community_engagements_awaiting_approval FROM anon, PUBLIC;
GRANT  SELECT ON public.v_sh_community_engagements_awaiting_approval TO authenticated;

COMMENT ON VIEW public.v_sh_community_engagements_awaiting_approval IS
  'Decision 6 (2026-09-09): work waits until a human approves it, and HoDs get a list rather than being expected to remember. days_waiting is the number that makes a stalled queue visible.';

-- ── 6. Assert the end state ─────────────────────────────────────────────────
DO $$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(c, ', ') INTO v_missing
    FROM unnest(ARRAY['venue','counts_toward_activity','self_approved']) AS c
   WHERE NOT EXISTS (
     SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'sh_community_engagements'
        AND column_name = c);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Columns did not land: %', v_missing;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='sh_community_engagements'
                AND column_name IN ('hours_spent','beneficiaries_count')
                AND column_default IS NOT NULL) THEN
    RAISE EXCEPTION 'A default survived on hours_spent or beneficiaries_count — unfilled and zero would stay indistinguishable.';
  END IF;

  IF has_table_privilege('anon', 'public.v_sh_community_engagements_awaiting_approval', 'SELECT') THEN
    RAISE EXCEPTION 'anon can read the pending-approval view.';
  END IF;

  RAISE NOTICE 'Community-engagement recording rules in place (decisions 3, 6, 7, 8 of 2026-09-09).';
END $$;
