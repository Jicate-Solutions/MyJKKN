-- Shift timings gain a gender dimension.
--
-- Several institutions run different hours for women — Jicate Solutions works
-- 09:00–17:30 but wants female staff on 09:00–16:30 — and the existing
-- teaching / non_teaching / category scoping cannot express that.
--
-- A COLUMN, NOT A FOURTH staff_scope. Gender composes with the three existing
-- scopes rather than competing with them, so teaching+female, non_teaching+female
-- and category+female are all expressible and no new precedence tier has to be
-- invented against 'category'. It also mirrors hr_leave_types.applicable_gender,
-- which already does exactly this a table away.
--
-- DOMAIN MIRRORS staff's OWN CHECK plus 'all'. staff.gender is NOT NULL with
-- CHECK IN ('male','female','bigender'), so allowing the same three here means
-- no gender a staff row can actually hold is unreachable as a rule. Today only
-- male (280) and female (475) occur, across 100% of 594 HR-managed staff — no
-- backfill or cleanup is needed for this feature to work.
--
-- THIS MIGRATION IS A DELIBERATE NO-OP FOR RESOLUTION. All 357 existing rows
-- (196 of them current) take the 'all' default, and 'all' matches every staff
-- member, so nobody's shift window moves. Verified by fingerprinting
-- fn_resolve_shift_timings_bulk over 37 staff × 31 days before and after: the
-- md5 was identical. The resolution predicate itself is not touched here — that
-- is the next migration, which also collapses the five copy-pasted copies of it
-- into one body.

ALTER TABLE public.hr_shift_timings
  ADD COLUMN IF NOT EXISTS applicable_gender text NOT NULL DEFAULT 'all';

ALTER TABLE public.hr_shift_timings
  DROP CONSTRAINT IF EXISTS hr_shift_timings_applicable_gender_chk;

ALTER TABLE public.hr_shift_timings
  ADD CONSTRAINT hr_shift_timings_applicable_gender_chk
  CHECK (applicable_gender IN ('all', 'male', 'female', 'bigender'));

COMMENT ON COLUMN public.hr_shift_timings.applicable_gender IS
  'Which staff gender this row applies to. ''all'' matches everyone and is the default; a value matching staff.gender wins over ''all'' for that person. Domain mirrors staff.gender plus ''all'', so no gender a staff row can hold is unreachable.';

-- The current-row uniqueness key MUST include the new column. Without it an
-- 'all' week and a 'female' week for the same (institution, scope, category,
-- weekday) collide on this index and the second save is rejected — which is
-- precisely the pair of rows the feature exists to allow.
DROP INDEX IF EXISTS public.hr_shift_timings_current_uq;

CREATE UNIQUE INDEX hr_shift_timings_current_uq
  ON public.hr_shift_timings (
    institution_id,
    staff_scope,
    COALESCE(employment_category_id, '00000000-0000-0000-0000-000000000000'::uuid),
    applicable_gender,
    day_of_week)
  WHERE effective_until IS NULL AND is_active;
