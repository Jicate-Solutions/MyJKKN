-- ============================================================================
-- Updated: 2026-07-31 — two School of Influence config rows describe themselves
-- wrongly to the person editing them. One presents a decorative control as a
-- live switch; the other stores its control type in a spelling the shared
-- widget dispatcher does not recognise.
--
-- Companion edit in the SAME change: the S1 seed
-- 20260731180200_seed_school_of_influence_policies.sql is corrected at source,
-- so a fresh replay produces the right end-state without this file. Both
-- migrations therefore converge on the SAME state whichever order a given
-- database reaches it by:
--   • seed already applied from the OLD file  → this migration does the work
--   • seed applied from the CORRECTED file    → this migration is a clean no-op
--   • seed never applied at all               → this migration is a clean no-op
-- The asserts at the bottom test the END STATE, never "did I change a row",
-- which is what keeps all three paths honest.
--
-- ── PART 1 — soi.block_multiple_batches is a decorative toggle ──────────────
--
-- The row renders as an on/off switch and its ui_consequence opens "When on, a
-- person cannot be in two batches of this programme at once."
--
-- "When on" is the false half. The one-batch-per-person rule (decision 10) is
-- uniq_soi_one_active_batch_per_person, an UNCONDITIONAL partial unique index
-- created by 20260808130000_soi_batches_on_cohort_spine.sql over
-- ((config->>'soi_programme_key'), member_ref) for non-terminal statuses.
-- Nothing in that index consults a policy value. Switching the toggle OFF and
-- saving changes precisely nothing: the database still refuses the second
-- membership. The Director is shown a lever that is not connected to anything.
--
-- THE CODEBASE ALREADY SAID SO, AND THAT INSTRUCTION WAS NOT CARRIED OUT.
-- lib/services/school-of-influence/batch-service.ts, in the doc block above
-- explainMembershipConflict, reads: "NOTE for S2: D10 is enforced by an INDEX,
-- so it is unconditional. Setting the soi.block_multiple_batches policy row to
-- false does NOT relax it — dropping the index would take a migration. The
-- settings UI must therefore not present that key as a live on/off toggle."
-- supabase/SQL_FILE_INDEX.md states the same conclusion. The seed then shipped
-- it as a toggle anyway.
--
-- DELETED RATHER THAN REWORDED, and the choice is not cosmetic. The shared
-- dispatcher (soi-widget-dispatcher.tsx) has no read-only control: every widget
-- it can render accepts input. Keeping the row with honest text would leave an
-- interactive switch under a caption saying the switch does nothing — a person
-- can still flip it, the save still succeeds, and they still walk away
-- believing they changed policy. A control that is documented as inert is a
-- worse trap than no control, because the save receipt contradicts the caption.
--
-- NOTHING READS THE KEY. Swept across the whole repository (all file types,
-- excluding node_modules/.git): the string 'block_multiple_batches' appears in
-- exactly three places, and none of them is a reader —
--   1. this seed row itself (the writer),
--   2. supabase/SQL_FILE_INDEX.md prose, which already says it is not live,
--   3. a JSDoc comment in batch-service.ts (the NOTE quoted above).
-- There is no fn_get_policy_bool('soi.block_multiple_batches', …) anywhere, at
-- any scope. Deleting the row removes a card from the settings screen and
-- changes no behaviour whatsoever.
--
-- The rule itself is untouched and stays enforced. When it fires,
-- explainMembershipConflict already turns the 23505 into a plain-English 409
-- ("This person already has an active place in another batch of this
-- programme…"), so a coordinator meets the rule as a sentence rather than as a
-- switch they cannot find.
--
-- Deleted at EVERY scope, not just the programme-wide default. A per-batch
-- override at scope_id = <cohort_id> would be exactly as decorative as the
-- default, and leaving one behind would put the same dead card back on a batch
-- screen with nothing to explain it.
--
-- ── PART 2 — soi.eligible_audiences stores an unrecognised widget token ─────
--
-- The seed writes ui_widget = 'multi-select' (hyphen). The token the shared
-- dispatcher switches on is 'multi_select' (underscore) — the spelling used by
-- the PDE and RCLTP policy editors this screen reuses its widgets from.
-- Verified live: the production row still reads 'multi-select'.
--
-- The screen works today only because PR #2686 added normaliseWidget(), which
-- lowercases and rewrites '-' to '_' before the switch. That normalisation is
-- DELIBERATELY LEFT IN PLACE — it is a general safety net and at least one
-- other seeded row relies on the same forgiveness
-- (health.programs.digest_roles, seeded 'multi-select' by
-- 20260615120000_health_wellness_programs_substrate.sql, is out of scope here
-- and is not touched). After this migration the net is simply no longer load-
-- bearing for THIS row.
--
-- Fixing the stored value rather than resting on the normaliser is the point:
-- the row is data other consumers will read, and the next one to read
-- ui_widget without going through this screen's helper hits the same trap with
-- nothing to catch it. A stored value that only works because one caller
-- forgives it is a latent defect, not a working configuration.
--
-- Only ui_widget changes. The row's value, description, ui_options,
-- validation_schema, ui_consequence and ui_cascade are all left byte-identical
-- — this is a spelling correction to a presentation column, not a policy edit,
-- and it must not disturb which audiences may apply.
--
-- Writes no table, creates no function, changes no grant. Carries no BEGIN; or
-- COMMIT; of its own so that wrapping it in a Mgmt-API BEGIN … ROLLBACK stays a
-- genuine dry run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- PART 1 — remove the decorative toggle, at every scope.
-- ---------------------------------------------------------------------------
DELETE FROM public.platform_policies
 WHERE policy_key = 'soi.block_multiple_batches';

-- ---------------------------------------------------------------------------
-- PART 2 — correct the stored widget token to the dispatcher's spelling.
-- Guarded on the value so a re-run touches nothing and updated_at does not
-- churn on a row that is already correct.
-- ---------------------------------------------------------------------------
UPDATE public.platform_policies
   SET ui_widget = 'multi_select'
 WHERE policy_key = 'soi.eligible_audiences'
   AND ui_widget IS DISTINCT FROM 'multi_select';

-- ---------------------------------------------------------------------------
-- Apply-time asserts. A corrective migration that silently did nothing is the
-- exact failure mode this change exists to fix, so the end state is proved here
-- and the apply fails loudly rather than reporting success it did not earn.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_decorative  integer;
  v_wrong_token integer;
  v_audiences   integer;
BEGIN
  SELECT count(*) INTO v_decorative
  FROM public.platform_policies
  WHERE policy_key = 'soi.block_multiple_batches';

  IF v_decorative > 0 THEN
    RAISE EXCEPTION
      'soi.block_multiple_batches still present (% row(s)) — the decorative toggle was not removed',
      v_decorative;
  END IF;

  SELECT count(*) INTO v_wrong_token
  FROM public.platform_policies
  WHERE policy_key = 'soi.eligible_audiences'
    AND ui_widget IS DISTINCT FROM 'multi_select';

  IF v_wrong_token > 0 THEN
    RAISE EXCEPTION
      'soi.eligible_audiences still stores an unrecognised ui_widget on % row(s) — expected multi_select',
      v_wrong_token;
  END IF;

  -- Not a failure, but worth saying out loud on apply: if the S1 seed has not
  -- been applied to this database yet, both statements above matched nothing
  -- and the asserts passed vacuously. The corrected seed then produces the same
  -- end state on its own.
  SELECT count(*) INTO v_audiences
  FROM public.platform_policies
  WHERE policy_key = 'soi.eligible_audiences';

  IF v_audiences = 0 THEN
    RAISE NOTICE
      'No soi.eligible_audiences row exists here — the S1 seed (20260731180200) has not been applied to this database. Nothing to correct; the corrected seed file already writes multi_select.';
  END IF;
END $$;

-- ROLLBACK (down migration) — restores the pre-correction state exactly. The
-- toggle comes back with its original misleading caption on purpose: a rollback
-- must reproduce what was there, not a tidied version of it.
--   UPDATE public.platform_policies
--      SET ui_widget = 'multi-select'
--    WHERE policy_key = 'soi.eligible_audiences';
--
--   INSERT INTO public.platform_policies
--     (policy_key, scope_type, scope_id, value, description, data_type,
--      validation_schema, classification, ui_widget, ui_category,
--      ui_consequence, ui_cascade, is_system, is_active)
--   VALUES
--     ('soi.block_multiple_batches', 'cohort', NULL, 'true'::jsonb,
--      'Whether one person may hold an active membership in only one batch of this programme at a time (decision 10).',
--      'boolean', '{"type":"boolean"}'::jsonb, 'operational', 'toggle',
--      'School of Influence',
--      'When on, a person cannot be in two batches of this programme at once. Also enforced by the database, so reports never double-count.',
--      '[{"effect":"Turning this off lets one person sit in two batches at once, so headcounts and attendance shares stop adding up","severity":"high"}]'::jsonb,
--      false, true);
