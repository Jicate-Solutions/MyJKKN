-- ============================================================================
-- 20260727123000_naac_max_score_comment_correction.sql
--
-- APPLY STATUS: NOT applied to any database. Validated BEGIN…ROLLBACK against
--               prod kvizhngldtiuufknvehv on 2026-07-27; rollback confirmed in
--               a separate call (max_score COMMENT unchanged afterwards).
--
-- WHAT THIS IS
--   A documentation-only correction to migration 20260727090000. It changes NO
--   marks, NO catalog rows, NO scoring, and adds NO columns. Two artifacts it
--   wrote carry a claim that this file withdraws, plus one miscounted census.
--
-- WHY (defect 1 — the "860 / 40-mark double-count" claim)
--   20260727090000 asserts, in its header, in the max_score column COMMENT, in
--   supabase/SQL_FILE_INDEX.md and on /accreditation/naac:
--
--     "The Affiliated column … totals 860, not 900 — a 40-mark double-count
--      where the deck shifts metrics 1.4/1.6/1.7 into 5.4/5.5/5.3 for
--      affiliated colleges while still printing the Attribute-1 marks."
--
--   Three problems, all checkable without leaving this repository:
--
--   (a) It contradicts itself. A column totalling 860 against a 900 ceiling is
--       a SHORTFALL of 40. A double-count INFLATES a total; it cannot produce
--       one 40 below the ceiling. The stated total and the stated mechanism
--       point in opposite directions.
--
--   (b) The arithmetic does not come from the rows it names. The three
--       Attribute-1 rows cited carry, in 20260727090000's own VALUES list and
--       in prod today:
--           1.4  Practical & industry focus                    10.00
--           1.6  Indian Knowledge System                        5.00
--           1.7  Online & blended (SWAYAM / MOOC)               5.00
--                                                      total = 20.00
--       Not 40. No pairing of live rows yields 40.
--
--   (c) It is not checkable from anything in the repository. `git ls-tree
--       jicate/main -r` contains no PDF, xlsx, CSV or digitized table of the
--       NAAC Reforms 2024 Binary deck, and NO affiliated mark value exists in
--       any prod table. Every in-repo mention of 860 traces back to this one
--       PR. Whether the Affiliated column totals 860, 900 or anything else
--       rests entirely on a reading of pp. 41-63 of a document that is not
--       checked in.
--
--   This file therefore WITHDRAWS the claim rather than replacing it with a
--   different number. Picking a number would repeat the original error. The
--   replacement COMMENT states only what is verifiable and names the source
--   that must be consulted. Nothing is scored from the Affiliated column, so
--   no total moves either way.
--
-- WHY (defect 2 — the college-type census)
--   The COMMENT reads "live institutions.institution_type values are
--   autonomous / self / aided only … all 8 IQAC colleges (5 autonomous, 2
--   self, 1 aided)". 5 / 2 / 1 is the census AFTER the dashboard's
--   `iqac_code IS NOT NULL` filter. The `institutions` table itself holds 14
--   rows: autonomous 5, aided 1, self 8. The six extra `self` rows are JKKN
--   Main Office (admin_office), JKKN Matric HSS + Nattraja Vidhyalya CBSE
--   (school), Jicate Solutions + Nattraja Incubation Forum (company) and JKKN
--   Testing Institution. This matters directly for the open Director decision
--   the COMMENT exists to flag: any per-type scoring rule keyed on
--   institution_type ALONE, without the iqac_code filter, sweeps in six
--   institutions that are not assessed colleges. Also note institution_type
--   carries no CHECK constraint — it is free text.
--
-- WHY (defect 3 — the crosswalk rows are unresolvable AND semantically
--      contradictory; FLAGGED IN THE ROWS, DELIBERATELY NOT REMAPPED)
--   accreditation_metric_crosswalk holds three college_type='affiliated' rows,
--   seeded by 20260709030000. Verified on prod 2026-07-27:
--
--     legacy  current  active catalog rows matching `current`  matching `current||'.1'`
--       1.4     5.4                 0                                   1  (5.4.1)
--       1.6     5.5                 1                                   0
--       1.7     5.3                 0                                   1  (5.3.1)
--
--   Two of the three destinations match NO active catalog row. Anyone
--   implementing the affiliated shift with a plain join crosswalk.current_code
--   → sh_accreditation_metrics.metric_code silently moves ONE of three shifts
--   and drops the other two, with no error. (fn_event_naac_resolve_codes
--   already compensates with `metric_code IN (raw, raw||'.1')`, but it resolves
--   EVENT codes and never touches max_score.)
--
--   Separately, the mapping is semantically contradicted by 20260727090000's
--   own deck naming (its VALUES list, column 3):
--       5.3 = Industry-academia linkage
--       5.4 = Continuous assessment components
--       5.5 = Catering to learner diversity
--   which makes the seeded triple read:
--       1.4 Practical & industry focus   → 5.4 Continuous assessment    ✗
--       1.6 Indian Knowledge System      → 5.5 Learner diversity        ✗
--       1.7 Online & blended SWAYAM/MOOC → 5.3 Industry-academia        ✗
--   All three land somewhere unrelated, while 5.2.1 "Learning Path enrollment
--   (SWAYAM, MOOCs)" — the obvious home for 1.7 — sits unused.
--
--   EITHER the crosswalk triple OR the Attribute-5 deck naming is wrong. Both
--   are in production. Resolving that needs pp. 41-63, so this file does NOT
--   remap anything — it appends a warning to the three rows' `note` so the
--   next implementer meets it in the data rather than in a migration header.
--   Codes, college_type and every mark are left exactly as they are.
--
-- SAFETY
--   · No DDL. No table created, so no REVOKE block is required.
--   · No function created, so no EXECUTE grant is required.
--   · Idempotent: the COMMENT is an unconditional replace; the note append is
--     guarded on its own marker.
--   · Assertions abort if the catalog is not in the state this text describes.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Preconditions. If the catalog no longer matches the text we are about to
--    attach to it, stop — a stale COMMENT is what this file exists to fix.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_rows       integer;
  v_total      numeric;
  v_a1         numeric;
  v_inst_total integer;
  v_inst_iqac  integer;
BEGIN
  SELECT count(*), sum(max_score)
    INTO v_rows, v_total
    FROM public.sh_accreditation_metrics
   WHERE metric_type = 'NAAC' AND is_active;

  IF v_rows <> 69 OR v_total <> 900.00 THEN
    RAISE EXCEPTION
      'NAAC catalog drifted: % active rows summing to % (expected 69 / 900.00). '
      'Re-read the catalog before attaching this COMMENT.', v_rows, v_total;
  END IF;

  -- The 20.00 that disproves the withdrawn "40-mark" figure.
  SELECT sum(max_score) INTO v_a1
    FROM public.sh_accreditation_metrics
   WHERE metric_type = 'NAAC' AND is_active
     AND metric_code IN ('1.4', '1.6', '1.7');

  IF v_a1 <> 20.00 THEN
    RAISE EXCEPTION
      'Rows 1.4 + 1.6 + 1.7 now total % (expected 20.00). The withdrawal note '
      'in this file quotes 20.00 — re-derive it before applying.', v_a1;
  END IF;

  SELECT count(*),
         count(*) FILTER (WHERE iqac_code IS NOT NULL)
    INTO v_inst_total, v_inst_iqac
    FROM public.institutions;

  IF v_inst_total <> 14 OR v_inst_iqac <> 8 THEN
    RAISE WARNING
      'institutions is now % rows / % with iqac_code (was 14 / 8 on 2026-07-27). '
      'The census in the COMMENT below names those figures — refresh it.',
      v_inst_total, v_inst_iqac;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Replace the max_score COMMENT. Same structure as 20260727090000's, with
--    the withdrawn claim removed, the census qualified, and the weightage row
--    count refreshed (87 → 107 rows across all 10 bodies; still NULL on every
--    one of them).
-- ---------------------------------------------------------------------------
COMMENT ON COLUMN public.sh_accreditation_metrics.max_score IS
$c$Marks possible for this metric. For metric_type='NAAC' this holds the AUTONOMOUS-column marks of the NAAC Reforms 2024 Binary deck (pp.41-63); active NAAC rows sum to exactly 900.00, matching the ceiling the /accreditation/naac dashboard reports.
ONE COLUMN CANNOT EXPRESS BOTH DECK COLUMNS: institutions.institution_type carries only autonomous / self / aided — there is no 'affiliated' value, and the column has no CHECK constraint — so all 8 assessed colleges are scored against the Autonomous column. Mapping self/aided to the deck's Affiliated column is an OPEN DIRECTOR DECISION, not settled here.
CENSUS CAVEAT (corrected 2026-07-27, migration 20260727123000): the 8 assessed colleges are 5 autonomous / 2 self / 1 aided, but that is the census AFTER the dashboard's `iqac_code IS NOT NULL` filter. The institutions table holds 14 rows: autonomous 5, aided 1, self 8. The six extra 'self' rows are two schools, two companies, the admin office and a test institution. A per-type scoring rule keyed on institution_type ALONE would sweep all six in.
AFFILIATED-COLUMN TOTAL — UNVERIFIED (claim withdrawn 2026-07-27, migration 20260727123000): this comment previously put a specific total on the deck's Affiliated column (860 against the 900 ceiling) and explained the 40-mark gap as metrics 1.4/1.6/1.7 being counted in two attributes at once. That is withdrawn, and deliberately NOT replaced with another number. It was self-contradictory — a column 40 below the ceiling is a SHORTFALL, whereas counting a metric twice INFLATES a total and cannot deflate one — and its arithmetic did not come from the rows it cited: 1.4 + 1.6 + 1.7 = 10.00 + 5.00 + 5.00 = 20.00, not 40. No affiliated mark value exists in this database or anywhere in the codebase, and the source deck is not checked into the repository, so the figure can be neither confirmed nor refuted from the platform. Read pp.41-63 before building on it. Nothing is scored from the Affiliated column today, so no total is affected either way. The withdrawn wording is quoted in full on /accreditation/naac for anyone who saw it.
CROSSWALK IS NOT A MARKS STORE, AND IS ITSELF UNRESOLVED: accreditation_metric_crosswalk.college_type maps CODES, never MARKS. Its three affiliated rows are additionally unusable as-is — current_code '5.4' and '5.3' match NO active catalog row (the codes are 5.4.1 and 5.3.1), so a plain join applies 1 of the 3 shifts and drops 2 silently; and all three destinations are semantically unrelated to their sources under this deck's own Attribute-5 naming. See those rows' notes.
IF PER-TYPE MARKS ARE EVER STORED, the weightage column is NOT a candidate on its own: it is a single numeric per row (NULL on all 107 rows across all 10 bodies as of 2026-07-27, read by no scoring code, but WRITABLE from /accreditation/manage/metrics today). Expressing two deck columns needs either a second max_score_affiliated column or a child table keyed (metric_id, college_type).
ZERO IS NOT "WORTHLESS": a 0.00 NAAC row is either a facet sharing a canonical sibling's marks, an affiliated-only metric NA in the Autonomous column (8.2.2), a deck metric with no college marks at all (3.6, 7.4, 9.5), or a superseded starter row (9.1.1, 10.1.1). Each row's notes say which. Marks set by 20260727090000; this text corrected by 20260727123000.$c$;

-- ---------------------------------------------------------------------------
-- 3. Flag the three affiliated crosswalk rows IN THE DATA. Append only; the
--    mapping itself (legacy_code, current_code, college_type) is untouched
--    because resolving it needs the source deck. Guarded on its own marker so
--    a re-run appends nothing.
-- ---------------------------------------------------------------------------
UPDATE public.accreditation_metric_crosswalk
   SET note = note ||
     ' ⚠ UNRESOLVED (flagged 2026-07-27, migration 20260727123000): '
     'current_code ''' || current_code || ''' does not match any active '
     'sh_accreditation_metrics row for NAAC — the catalog codes are 5.3.1 / '
     '5.4.1 (5.5 resolves). A plain join on current_code applies 1 of these 3 '
     'shifts and silently drops the other 2. The destination is also '
     'semantically unrelated to the source under migration 20260727090000''s '
     'Attribute-5 deck naming (5.3 Industry-academia linkage / 5.4 Continuous '
     'assessment components / 5.5 Catering to learner diversity) — e.g. 1.7 '
     'Online & blended SWAYAM/MOOC maps here to 5.3 Industry-academia while '
     '5.2.1 Learning Path enrollment (SWAYAM, MOOCs) sits unused. EITHER this '
     'triple OR that deck naming is wrong; resolving it needs NAAC Reforms '
     '2024 Binary pp.41-63, which is not in the repository. Do not build the '
     'affiliated shift on these rows until a Director confirms the mapping.'
 WHERE body_code = 'NAAC'
   AND college_type = 'affiliated'
   AND note NOT LIKE '%20260727123000%';

-- ---------------------------------------------------------------------------
-- 4. Post-conditions. Prove the correction landed and that nothing scoring-
--    related moved.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_comment text;
  v_flagged integer;
  v_rows    integer;
  v_total   numeric;
BEGIN
  SELECT col_description('public.sh_accreditation_metrics'::regclass,
                         (SELECT attnum FROM pg_attribute
                           WHERE attrelid = 'public.sh_accreditation_metrics'::regclass
                             AND attname  = 'max_score'))
    INTO v_comment;

  -- The replacement paraphrases the withdrawn claim rather than quoting it, so
  -- this substring test is meaningful: any hit means the old text survived.
  IF v_comment IS NULL OR v_comment LIKE '%double-count%' THEN
    RAISE EXCEPTION 'max_score COMMENT still carries the withdrawn claim.';
  END IF;
  IF v_comment NOT LIKE '%claim withdrawn 2026-07-27%' THEN
    RAISE EXCEPTION 'max_score COMMENT did not pick up the withdrawal marker.';
  END IF;

  SELECT count(*) INTO v_flagged
    FROM public.accreditation_metric_crosswalk
   WHERE body_code = 'NAAC' AND college_type = 'affiliated'
     AND note LIKE '%20260727123000%';

  IF v_flagged <> 3 THEN
    RAISE EXCEPTION 'Expected 3 flagged affiliated crosswalk rows, found %.', v_flagged;
  END IF;

  -- Nothing scoring-related may have moved.
  SELECT count(*), sum(max_score) INTO v_rows, v_total
    FROM public.sh_accreditation_metrics
   WHERE metric_type = 'NAAC' AND is_active;

  IF v_rows <> 69 OR v_total <> 900.00 THEN
    RAISE EXCEPTION 'Catalog moved: % rows / % marks. This file must not touch marks.',
      v_rows, v_total;
  END IF;
END $$;
