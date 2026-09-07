-- SUPERSEDED by 20260902120000, which drops this function entirely.
-- Kept because it ran against the database; replaying the folder in order
-- must reproduce the same history.
-- ============================================================================
-- TDS BAND VALIDATION: SAY WHAT TO DO, NOT JUST WHAT IS WRONG (2026-09-02)
--
-- The first version of these messages stated the RULE and not the ACTION:
--
--   "The highest TDS band must be open-ended (leave its upper limit blank),
--    or the highest earners pay no tax at all."
--
-- Correct, and useless to the person who has just typed their first band. On an
-- empty table a lone capped band is refused -- these rules describe the whole
-- SET, judged at COMMIT -- so the fix is to supply the band above it in the
-- SAME save. Nothing said so, and the screen could not do it either until
-- TdsSlabService.create learned to insert several rows in one request.
--
-- The messages now name the figure and the remedy. Behaviour is unchanged.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.hr_tds_slabs_validate_set()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rows int;
  v_open int;
  v_gap  record;
  v_top  numeric;
BEGIN
  SELECT count(*) INTO v_rows FROM public.hr_tds_slabs;
  -- Zero rows is VALID: that is TDS switched off, and the state the table ships
  -- in. Nothing is seeded -- a lone capped band would violate the rule below, so
  -- there is no correct set to guess.
  IF v_rows = 0 THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO v_open
    FROM public.hr_tds_slabs WHERE max_monthly_gross IS NULL;

  IF v_open = 0 THEN
    SELECT max(max_monthly_gross) INTO v_top FROM public.hr_tds_slabs;
    RAISE EXCEPTION
      'The highest band must have no upper limit, or anyone earning above % pays no TDS at all. Add a band starting at % with its upper limit left blank -- in the same save as this one.',
      v_top, v_top
      USING ERRCODE = '23514';
  END IF;
  IF v_open > 1 THEN
    RAISE EXCEPTION
      'Only one band can be open-ended; % of them have no upper limit. Give every band except the highest an upper limit.', v_open
      USING ERRCODE = '23514';
  END IF;

  -- Contiguity. Ordered by floor, the open-ended band sorts last (any other
  -- band would overlap it), so its NULL ceiling is never compared.
  SELECT * INTO v_gap
    FROM (
      SELECT max_monthly_gross AS ceiling,
             lead(min_monthly_gross) OVER (ORDER BY min_monthly_gross) AS next_floor
        FROM public.hr_tds_slabs
    ) t
   WHERE t.ceiling IS NOT NULL
     AND t.next_floor IS DISTINCT FROM t.ceiling
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'The bands leave a gap: one ends at % and the next begins at %, so salaries in between would have no TDS deducted. Change one of the two limits to % so they meet, or add a band covering the gap at 0%% if it is meant to be exempt.',
      v_gap.ceiling, v_gap.next_floor, v_gap.ceiling
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$function$;
