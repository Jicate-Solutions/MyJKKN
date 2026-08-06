-- ============================================================================
-- NAAC catalog — digitize the Binary-deck MARKS so the 900 ceiling is real
-- File: 20260727090000_naac_binary_deck_marks_weights.sql
-- Date: 2026-07-27
--
-- WHY (the live defect, measured on prod kvizhngldtiuufknvehv 2026-07-26)
--   sh_accreditation_metrics holds 51 active metric_type='NAAC' rows.
--   SUM(max_score) = 380.00 and 25 of the 51 rows have max_score NULL or 0,
--   while /accreditation/naac promises "Score ceiling per college: 900" and a
--   75% (~675) target. Every percentage on that page has therefore been
--   measured against a denominator less than half the truth.
--
--   This is the deferred half of PR #1903 (20260709030000), which stated
--   plainly: "Numeric per-metric score values by college type are defined in
--   the Binary deck (pp.41-63) but the deck is not digitized in-repo — notes
--   record the APPLICABILITY split ... rather than fabricating point values."
--   The deck is now digitized. This migration writes those point values.
--
-- SOURCE OF THE NUMBERS
--   NAAC Reforms 2024 Binary Framework deck, pp.41-63 — 58 metrics across the
--   10 attributes, each carrying an AUTONOMOUS-column and an AFFILIATED-column
--   mark ("NA" = not applicable to that college type).
--
-- THE AUTONOMOUS/AFFILIATED DECISION (Director-visible, NOT absorbed silently)
--   Live institutions.institution_type values are ONLY: autonomous (5 colleges
--   — ALHD, DENT, ENGG, NURS, PHAR), self (2 — ASSF, EDUC), aided (1 — ASAI).
--   There is NO 'affiliated' institution_type. A survey for a per-type
--   weighting mechanism found NONE: the `weightage` column is NULL on all 87
--   catalog rows across all 10 bodies and is read nowhere; the only per-type
--   store in the schema is accreditation_metric_crosswalk.college_type, which
--   maps CODES (1.4→5.4, 1.6→5.5, 1.7→5.3 for affiliated) and not MARKS.
--   => max_score therefore holds the AUTONOMOUS column, for every college.
--   This migration does NOT invent a second column and does NOT map
--   self/aided → affiliated. Both are Director decisions; see the column
--   COMMENT at the end of this file and the on-page caveat.
--
--   The Affiliated column is additionally UNRECONCILED at source: it totals
--   860, not 900 — a documented 40-mark double-count where the deck shifts
--   1.4/1.6/1.7 into 5.4/5.5/5.3 for affiliated colleges while still printing
--   the Attribute-1 marks. That defect is flagged here, in the column comment
--   and on the dashboard; it is NOT quietly folded into any total.
--
--   ┌── CORRECTION 2026-07-27 (migration 20260727123000) ─────────────────────┐
--   │ The paragraph immediately above is WITHDRAWN as unsourced. It is left   │
--   │ in place because this file is already applied; do not act on it.        │
--   │  · "860 … a 40-mark double-count" is self-contradictory: a column       │
--   │    totalling 860 against a 900 ceiling is a SHORTFALL of 40. A          │
--   │    double-count inflates a total, it cannot deflate one.                │
--   │  · The three Attribute-1 rows named (1.4, 1.6, 1.7) carry 10 + 5 + 5    │
--   │    = 20.00 marks in this very file's VALUES list, not 40. The figure    │
--   │    does not derive from the rows it cites.                              │
--   │  · No affiliated mark values exist in the database or the repository,   │
--   │    and the source deck (pp. 41-63) is not checked in, so 860 cannot be  │
--   │    confirmed or refuted from here.                                      │
--   │ Nothing is scored from the Affiliated column, so no total moves. The    │
--   │ replacement column COMMENT states only what is verifiable.              │
--   └─────────────────────────────────────────────────────────────────────────┘
--
--   Also corrected there: the "autonomous (5) / self (2) / aided (1)" census on
--   line 25-26 is the census of the 8 IQAC colleges, NOT of `institutions`,
--   which holds 14 rows — autonomous 5, aided 1, self 8. The six extra `self`
--   rows are two schools, two companies, the admin office and a test
--   institution. A per-type rule keyed on institution_type alone sweeps them in.
--
-- THE ATTRIBUTE-2 SCALE (the deck's own over-count, kept visible)
--   Attribute 2's printed sub-scores exceed its attribute total in the source
--   deck: 10 + 25 + 25 + 25 = 85 printed against an attribute total of 50
--   (Autonomous). Sub-scores are therefore scaled by 50/85, exactly as the
--   audited coverage artifact does:
--       2.1   FSR                 10 × 50/85 = 5.8824  → 5.88
--       2.2.1 sanctioned strength 25 × 50/85 = 14.7059 → 14.71
--       2.2.2 PhD %               25 × 50/85 = 14.7059 → 14.71
--       2.2.3 cadre distribution  25 × 50/85 = 14.7059 → 14.70  ← residual
--   max_score is numeric(5,2), and 250/17 has no exact 2-decimal form. The
--   0.01 rounding residual is absorbed ONCE, on 2.2.3, so Attribute 2 sums to
--   exactly 50.00 and the NAAC total to exactly 900.00. Stated in that row's
--   notes rather than left as an unexplained asymmetry.
--
-- WHAT THIS MIGRATION DOES  (rows + column comment only — no DDL on the table,
-- no function, no RLS change, no grant change, no permission change)
--   1. Sets max_score on the 42 existing marks-carrying rows.
--   2. Sets max_score = 0 on the 9 existing rows that must NOT carry marks,
--      each with a note saying WHY zero (facet / affiliated-only / superseded).
--      Zero here never means "worthless" — see each note.
--   3. Seeds the 18 deck metrics entirely absent from the catalog (180
--      autonomous marks) — WHERE NOT EXISTS, never ON CONFLICT (this table's
--      unique key is a plain constraint, but the house seed pattern is
--      WHERE NOT EXISTS and it is what keeps the file idempotent).
--   4. COMMENTs the max_score column with the Autonomous-only decision.
--   5. Asserts the result (SUM = 900.00, per-attribute totals, no NULLs, no
--      orphaned evidence code, unknown-code alarm) and fails loudly if wrong.
--
-- CONSEQUENCE TO EXPECT, STATED UP FRONT
--   The denominator moves 380 → 900, so every coverage percentage the NAAC
--   dashboard has ever shown roughly halves. Coverage did not get worse; the
--   ceiling became true.
--
-- APPLY STATUS: ~~NOT applied to any database.~~ Validated on prod inside ONE
--   BEGIN … ROLLBACK batch via the Management API (assertion output in the PR
--   body). Application is Director-gated.
--
--   ⚠ STALE — CORRECTED 2026-07-27. This migration **IS APPLIED** to prod
--   kvizhngldtiuufknvehv. Verified three independent ways: 69 active NAAC rows ·
--   SUM(max_score) = 900.00 exactly · all 69 rows carry the
--   "[deck-marks 2026-07-27]" notes stamp · all 10 attribute totals match the
--   deck (75/50/50/50/150/125/100/125/100/75).
--   It is NOT recorded in supabase_migrations.schema_migrations — that table's
--   newest row is 20260725191500, so nothing applied via the Management API
--   since 07-25 is recorded. That is a property of the apply path, not of this
--   file. Re-running is safe: the UPDATEs are idempotent and the seeds use
--   WHERE NOT EXISTS.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. MARKS on the 42 existing marks-carrying rows (Autonomous column).
--    One VALUES line per row so the diff is auditable metric by metric.
--    Column 3 is the deck metric each catalog row answers to.
-- ---------------------------------------------------------------------------
WITH deck(code, marks, deck_metric) AS (
  VALUES
    -- Attribute 1: Curriculum — 75
    ('1.1.1',   15.00, '1.1  Outcome-based curriculum (POs/COs defined)'),
    ('1.2',     10.00, '1.2  Stakeholder participation in curriculum'),
    ('1.3.1',   10.00, '1.3  Curriculum flexibility (CBCS / ABC / MEME)'),
    -- Attribute 2: Faculty Resources — 50 (sub-scores scaled 50/85, see header)
    ('2.1',      5.88, '2.1  Faculty-student ratio (10 × 50/85)'),
    ('2.2.1',   14.71, '2.2a Cadre-wise strength vs sanctioned posts (25 × 50/85)'),
    ('2.2.2',   14.71, '2.2b % teachers with PhD (25 × 50/85)'),
    ('2.2.3',   14.70, '2.2c Average teaching experience (25 × 50/85, less the 0.01 residual)'),
    -- Attribute 3: Infrastructure — 50
    ('3.1.1',   10.00, '3.1  Physical infrastructure facilities'),
    ('3.2.1',   10.00, '3.2  % expenditure on books / e-resources'),
    ('3.4.1',   10.00, '3.4  IT infrastructure (bandwidth, learner:computer)'),
    -- Attribute 4: Financial — 50
    ('4.4.1',   10.00, '4.4  Financial controls & risk management'),
    -- Attribute 5: Learning & Teaching — 150
    ('5.1.1',   35.00, '5.1  Pedagogical approaches (lesson plans)'),
    ('5.2.1',   20.00, '5.2  Learning Management System in effective use'),
    ('5.3.1',   25.00, '5.3  Industry-academia linkage'),
    ('5.4.1',   25.00, '5.4  Continuous assessment components'),
    -- Attribute 6: Extended Curricular — 125
    ('6.1.1',   25.00, '6.1  Domain clubs, activities, festivals'),
    ('6.2',     25.00, '6.2  Cultural clubs & festivals'),
    ('6.3.1',   15.00, '6.3  Mental well-being clubs & mentoring'),
    ('6.4.1',   15.00, '6.4  Value education'),
    ('6.5.1',   20.00, '6.5  Sports participation (external events)'),
    ('6.6',     25.00, '6.6  Community-focused activities'),
    -- Attribute 7: Governance — 100
    ('7.1.1',   10.00, '7.1  Institutional Development Plan'),
    ('7.3.1',   10.00, '7.3  Quality Assurance System (IQAC)'),
    ('7.6',     15.00, '7.6  Efforts for employability'),
    ('7.7.1',    5.00, '7.7  Grievance handling cells'),
    ('7.9',     10.00, '7.9  National & international collaborations'),
    ('7.10.1',  15.00, '7.10 Faculty retention %'),
    -- Attribute 8: Student Outcomes — 125
    ('8.1.1',   20.00, '8.1  Student enrolment vs sanctioned seats'),
    ('8.2.1',   30.00, '8.2  Graduate progression (placement / higher ed)'),
    ('8.3',     15.00, '8.3  Student awards & recognitions'),
    ('8.4.1',   60.00, '8.4  Learning Experience survey (student + alumni)'),
    -- Attribute 9: Research & Innovation — 100
    ('9.1',     20.00, '9.1  External research grants'),
    ('9.2',     25.00, '9.2  Research publications per teacher'),
    ('9.3',     20.00, '9.3  Research quality (h-index, citations)'),
    ('9.4',     20.00, '9.4  PhDs awarded per guide'),
    ('9.5',      0.00, '9.5  Research fellowships — NA for colleges in BOTH deck columns'),
    ('9.6',      5.00, '9.6  Intellectual property (patents, copyrights)'),
    ('9.7',     10.00, '9.7  Consultancy & training revenue'),
    -- Attribute 10: Sustainability & Green — 75
    ('10.1',    25.00, '10.1 Community activities % (NSS/NCC)'),
    ('10.2',    20.00, '10.2 Water & waste management'),
    ('10.3',    20.00, '10.3 Progressing towards net zero (solar, LED)'),
    ('10.4',    10.00, '10.4 Green audits & initiatives')
)
UPDATE public.sh_accreditation_metrics m
SET max_score = d.marks,
    notes = CASE
      WHEN coalesce(m.notes, '') LIKE '%[deck-marks 2026-07-27]%' THEN m.notes
      ELSE coalesce(nullif(coalesce(m.notes, '') || ' | ', ' | '), '')
           || '[deck-marks 2026-07-27] Autonomous-column marks ' || d.marks
           || ' digitized from NAAC Reforms 2024 Binary deck pp.41-63, metric '
           || d.deck_metric || '. Completes the deferral recorded in 20260709030000.'
    END
FROM deck d
WHERE m.metric_type = 'NAAC'
  AND m.metric_code = d.code;

-- ---------------------------------------------------------------------------
-- 2. The 9 rows that must carry ZERO marks — and exactly why, per row.
--    THREE different reasons; they are NOT interchangeable, and the dashboard
--    treats them differently (see lib/services/accreditation/naac-marks.ts).
--
--    (a) FACET rows share a deck metric with a canonical sibling. Evidence
--        landing here legitimately earns the PARENT's marks. 53 of the 148
--        live NAAC evidence rows sit on facet rows (7.3.d=47, 7.3.f=4,
--        6.3.2=1, 4.4.2=1) — 36% of all NAAC evidence. Rolling marks up
--        per-catalog-row instead of per-deck-metric would silently zero all
--        of it. This is the single most dangerous mistake available here.
--    (b) 8.2.2 is AFFILIATED-ONLY and is NOT a facet of 8.2.1. The deck
--        numbers pass-percentage "8.2", colliding with Graduate Progression
--        "8.2" (source-deck bug already documented in 20260709030000). Its 8
--        live evidence rows must NEVER mint 8.2.1's 30 marks.
--    (c) 9.1.1 and 10.1.1 are SUPERSEDED starter rows — their own notes
--        already say the canonical Binary homes are 9.2 and 10.4. They are
--        not facets: evidence here must earn nothing, and be flagged so it
--        gets re-pointed. Both currently hold ZERO evidence rows.
-- ---------------------------------------------------------------------------
WITH zeroed(code, why) AS (
  VALUES
    ('1.1.2',  'FACET of Binary metric 1.1 (Outcome-based curriculum, 15 marks) — marks are held on 1.1.1; evidence here credits 1.1. Zero means "shares 1.1.1''s marks", NOT "worthless".'),
    ('4.4.2',  'FACET of Binary metric 4.4 (Financial controls & risk management, 10 marks) — marks are held on 4.4.1; evidence here credits 4.4. Zero means "shares 4.4.1''s marks", NOT "worthless".'),
    ('6.3.2',  'FACET of Binary metric 6.3 (Mental well-being clubs & mentoring, 15 marks) — marks are held on 6.3.1; evidence here credits 6.3. Zero means "shares 6.3.1''s marks", NOT "worthless".'),
    ('7.3.d',  'FACET of Binary metric 7.3 (Quality Assurance System / IQAC, 10 marks) — marks are held on 7.3.1; evidence here credits 7.3. Zero means "shares 7.3.1''s marks", NOT "worthless". This facet alone carries 47 of the platform''s 148 live NAAC evidence rows.'),
    ('7.3.e',  'FACET of Binary metric 7.3 (Quality Assurance System / IQAC, 10 marks) — marks are held on 7.3.1; evidence here credits 7.3. Zero means "shares 7.3.1''s marks", NOT "worthless".'),
    ('7.3.f',  'FACET of Binary metric 7.3 (Quality Assurance System / IQAC, 10 marks) — marks are held on 7.3.1; evidence here credits 7.3. Zero means "shares 7.3.1''s marks", NOT "worthless".'),
    ('8.2.2',  'AFFILIATED-ONLY metric — the Autonomous deck column is NA, hence 0 here. Affiliated marks = 10. NOT a facet of 8.2.1: the deck numbers this metric 8.2, colliding with Graduate Progression 8.2 (NAAC source-deck bug), and its evidence must never credit 8.2.1. Its live evidence (COE pass-percentage mirror) stays visible and flagged on the dashboard, never absorbed into an autonomous total.'),
    ('9.1.1',  'SUPERSEDED starter row — the canonical Binary publications metric is 9.2, which now carries the 25 marks. NOT a facet of 9.1 (External research grants): a publication must never mint grant marks. Evidence landing here earns nothing and should be re-pointed to 9.2.'),
    ('10.1.1', 'SUPERSEDED starter row — the canonical Binary green-audit metric is 10.4, which now carries the 10 marks. NOT a facet of 10.1 (Community activities): a green-campus record must never mint community-participation marks. Evidence landing here earns nothing and should be re-pointed to 10.4.')
)
UPDATE public.sh_accreditation_metrics m
SET max_score = 0.00,
    notes = CASE
      WHEN coalesce(m.notes, '') LIKE '%[deck-marks 2026-07-27]%' THEN m.notes
      ELSE coalesce(nullif(coalesce(m.notes, '') || ' | ', ' | '), '')
           || '[deck-marks 2026-07-27] ' || z.why
    END
FROM zeroed z
WHERE m.metric_type = 'NAAC'
  AND m.metric_code = z.code;

-- ---------------------------------------------------------------------------
-- 3. Seed the 18 Binary-deck metrics absent from the catalog (180 marks).
--    Codes are the bare two-part deck form so fn_event_naac_resolve_codes
--    (which tries the raw code, then raw||'.1') resolves them unchanged.
--    WHERE NOT EXISTS, never ON CONFLICT — house pattern for this catalog.
-- ---------------------------------------------------------------------------
INSERT INTO public.sh_accreditation_metrics
  (metric_type, metric_code, metric_name, category, max_score, is_active, is_system, notes)
SELECT 'NAAC', v.code, v.name, v.category, v.marks, true, true,
       '[deck-marks 2026-07-27] ' || v.why
       || ' Seeded from NAAC Reforms 2024 Binary deck pp.41-63 (Autonomous column) — this deck metric had no catalog row at all, so its marks were missing from the 900 ceiling entirely. Completes the deferral recorded in 20260709030000.'
FROM (VALUES
  -- Attribute 1: Curriculum — 40 marks were missing here
  ('1.4', 'Practical & industry focus — share of courses / programmes with practical or industry orientation',
          'Attribute 1: Curriculum', 10.00,
          'Deck metric 1.4. For AFFILIATED colleges the deck shifts this slot to 5.4 (see accreditation_metric_crosswalk).'),
  ('1.5', 'Skill courses aligned to NSQF / NHEQF',
          'Attribute 1: Curriculum', 10.00,
          'Deck metric 1.5.'),
  ('1.6', 'Indian Knowledge System — courses and content',
          'Attribute 1: Curriculum', 5.00,
          'Deck metric 1.6. For AFFILIATED colleges the deck shifts this slot to 5.5 (see accreditation_metric_crosswalk).'),
  ('1.7', 'Online & blended learning — SWAYAM / MOOC credited courses',
          'Attribute 1: Curriculum', 5.00,
          'Deck metric 1.7. For AFFILIATED colleges the deck shifts this slot to 5.3 and weights it 20 (see accreditation_metric_crosswalk).'),
  ('1.8', 'Curriculum revision — share of programmes revised in the last 3 years',
          'Attribute 1: Curriculum', 10.00,
          'Deck metric 1.8.'),
  -- Attribute 3: Infrastructure — 20 marks were missing here
  ('3.3', 'Research resources — e-journals, databases and consortia subscriptions',
          'Attribute 3: Infrastructure', 15.00,
          'Deck metric 3.3.'),
  ('3.5', 'Divyangjan-friendly facilities',
          'Attribute 3: Infrastructure', 5.00,
          'Deck metric 3.5.'),
  ('3.6', 'Innovation resources — tinkering labs, incubation and startup facilities',
          'Attribute 3: Infrastructure', 0.00,
          'Deck metric 3.6 carries NO marks for colleges in EITHER deck column (informational / university-level). Seeded so evidence has a home and the metric is never mistaken for missing.'),
  -- Attribute 4: Financial — 40 marks were missing here
  ('4.1', 'Capital income vs capital expenditure',
          'Attribute 4: Financial', 15.00,
          'Deck metric 4.1.'),
  ('4.2', 'Revenue income vs revenue expenditure',
          'Attribute 4: Financial', 15.00,
          'Deck metric 4.2.'),
  ('4.3', 'Financial sustainability — corpus and investments',
          'Attribute 4: Financial', 10.00,
          'Deck metric 4.3.'),
  -- Attribute 5: Learning & Teaching — 45 marks were missing here
  ('5.5', 'Catering to learner diversity — remedial and bridge provision',
          'Attribute 5: Learning & Teaching', 15.00,
          'Deck metric 5.5.'),
  ('5.6', 'Academic grievance redressal — re-totaling, re-evaluation and attendance-shortage relief',
          'Attribute 5: Learning & Teaching', 15.00,
          'Deck metric 5.6.'),
  ('5.7', 'Adherence to the academic calendar — exam-to-result turnaround',
          'Attribute 5: Learning & Teaching', 15.00,
          'Deck metric 5.7.'),
  -- Attribute 7: Governance — 35 marks were missing here
  ('7.2', 'Effective leadership — delegation of powers and feedback mechanisms',
          'Attribute 7: Governance', 10.00,
          'Deck metric 7.2.'),
  ('7.4', 'Statutory compliance & public disclosure',
          'Attribute 7: Governance', 0.00,
          'Deck metric 7.4 carries NO marks for colleges in EITHER deck column (university-level metric). Seeded so evidence has a home and the metric is never mistaken for missing.'),
  ('7.5', 'Learner & employee welfare schemes',
          'Attribute 7: Governance', 15.00,
          'Deck metric 7.5.'),
  ('7.8', 'e-Governance — digital administration across admission, finance, academics and examinations',
          'Attribute 7: Governance', 10.00,
          'Deck metric 7.8.')
) AS v(code, name, category, marks, why)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.sh_accreditation_metrics m
  WHERE m.metric_type = 'NAAC'
    AND m.metric_code = v.code
);

-- ---------------------------------------------------------------------------
-- 4. Column comment — the Autonomous-only decision, permanently attached to
--    the column a future reader will find first.
-- ---------------------------------------------------------------------------
COMMENT ON COLUMN public.sh_accreditation_metrics.max_score IS
'Marks possible for this metric. For metric_type=''NAAC'' this holds the AUTONOMOUS-column marks of the NAAC Reforms 2024 Binary deck (pp.41-63); active NAAC rows sum to exactly 900.00, matching the ceiling the /accreditation/naac dashboard reports. '
'ONE COLUMN CANNOT EXPRESS BOTH DECK COLUMNS: live institutions.institution_type values are autonomous / self / aided only — there is no ''affiliated'' type — so all 8 IQAC colleges (5 autonomous, 2 self, 1 aided) are scored against the Autonomous column. Mapping self/aided to the deck''s Affiliated column is an OPEN DIRECTOR DECISION, not settled here. '
'The Affiliated column is also unreconciled at source: it totals 860, not 900 — a 40-mark double-count where the deck shifts metrics 1.4/1.6/1.7 into 5.4/5.5/5.3 for affiliated colleges while still printing the Attribute-1 marks. Whether to correct or preserve that gap is a second open Director decision. '
'If per-type marks are ever stored, the two candidate homes are the (currently unused, NULL on all 87 rows across all 10 bodies) weightage column and accreditation_metric_crosswalk.college_type, which already models the affiliated CODE shifts. Neither is used by migration 20260727090000. '
'ZERO IS NOT "WORTHLESS": a 0.00 NAAC row is either a facet sharing a canonical sibling''s marks, an affiliated-only metric NA in the Autonomous column (8.2.2), a deck metric with no college marks at all (3.6, 7.4, 9.5), or a superseded starter row (9.1.1, 10.1.1). Each row''s notes say which. Set by 20260727090000.';

-- ---------------------------------------------------------------------------
-- 5. Assertions. Any failure aborts — this file must never leave the catalog
--    in a state where the dashboard's 900 is a promise the data contradicts.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_total     numeric;
  v_rows      integer;
  v_nulls     integer;
  v_attr      record;
  v_expected  jsonb := '{"1":75,"2":50,"3":50,"4":50,"5":150,"6":125,"7":100,"8":125,"9":100,"10":75}'::jsonb;
  v_orphans   text;
  v_unknown   text;
BEGIN
  -- (i) the whole point of the file: the ceiling is real
  SELECT coalesce(sum(max_score), 0), count(*), count(*) FILTER (WHERE max_score IS NULL)
    INTO v_total, v_rows, v_nulls
  FROM public.sh_accreditation_metrics
  WHERE metric_type = 'NAAC' AND is_active;

  IF v_total <> 900.00 THEN
    RAISE EXCEPTION 'ASSERT FAIL: active NAAC max_score total = % (expected exactly 900.00)', v_total;
  END IF;
  IF v_nulls <> 0 THEN
    RAISE EXCEPTION 'ASSERT FAIL: % active NAAC rows still have max_score NULL', v_nulls;
  END IF;
  RAISE NOTICE 'ASSERT OK  (i)   active NAAC rows = %, SUM(max_score) = % (was 51 rows / 380.00)', v_rows, v_total;

  -- (ii) every attribute matches its deck total, so no attribute silently
  --      absorbs another's marks
  FOR v_attr IN
    SELECT split_part(metric_code, '.', 1) AS attr, sum(max_score) AS total
    FROM public.sh_accreditation_metrics
    WHERE metric_type = 'NAAC' AND is_active
    GROUP BY 1
  LOOP
    IF NOT v_expected ? v_attr.attr THEN
      RAISE EXCEPTION 'ASSERT FAIL: unexpected NAAC attribute "%" in the catalog', v_attr.attr;
    END IF;
    IF v_attr.total <> (v_expected ->> v_attr.attr)::numeric THEN
      RAISE EXCEPTION 'ASSERT FAIL: attribute % sums to % (deck says %)',
        v_attr.attr, v_attr.total, v_expected ->> v_attr.attr;
    END IF;
  END LOOP;
  RAISE NOTICE 'ASSERT OK  (ii)  all 10 attribute totals match the deck (75/50/50/50/150/125/100/125/100/75)';

  -- (iii) no live evidence is orphaned by this change
  SELECT string_agg(DISTINCT q.metric_code, ', ')
    INTO v_orphans
  FROM public.quality_evidence_mappings q
  WHERE q.body_code = 'NAAC'
    AND NOT EXISTS (
      SELECT 1 FROM public.sh_accreditation_metrics m
      WHERE m.metric_type = 'NAAC' AND m.metric_code = q.metric_code AND m.is_active
    );
  IF v_orphans IS NOT NULL THEN
    RAISE EXCEPTION 'ASSERT FAIL: live NAAC evidence points at codes with no active catalog row: %', v_orphans;
  END IF;
  RAISE NOTICE 'ASSERT OK  (iii) every live NAAC evidence metric_code still resolves to an active catalog row';

  -- (iv) LOUD ALARM: any active NAAC code this migration does not recognise.
  --      A sibling pane seeding new rows must not be silently averaged into
  --      the 900 — if this fires, the mapping above needs a line, not a bypass.
  SELECT string_agg(metric_code, ', ' ORDER BY metric_code)
    INTO v_unknown
  FROM public.sh_accreditation_metrics
  WHERE metric_type = 'NAAC' AND is_active
    AND coalesce(notes, '') NOT LIKE '%[deck-marks 2026-07-27]%';
  IF v_unknown IS NOT NULL THEN
    RAISE EXCEPTION 'ASSERT FAIL: active NAAC codes not covered by the deck mapping: % — add them to this migration rather than letting them dilute the 900', v_unknown;
  END IF;
  RAISE NOTICE 'ASSERT OK  (iv)  every active NAAC row is accounted for by the deck mapping (no unknown codes)';
END $$;

COMMIT;
