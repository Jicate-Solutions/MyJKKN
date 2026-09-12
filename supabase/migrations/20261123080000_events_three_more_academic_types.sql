-- ============================================================================
-- Three more academic event types: Convocation, Alumni Meet, School of Influence.
--
-- WHY THIS EXISTS. 20261121090000 seeded the catalogue from
-- MyJKKN_Event_Management_Workflow.pdf: 20 types, transcribed verbatim, in the
-- PDF's order. Applied to production 2026-09-09.
--
-- Back-mapping the 51 events already recorded then showed that FOUR of them
-- match none of the 20:
--
--     convocation           2 events
--     alumni                1 event
--     school_of_influence   1 event
--
-- Those are not edge cases invented here — `school_of_influence` is a live
-- MyJKKN module with its own routes and its own application form, and a
-- convocation is the single most public thing a college does all year.
--
-- ⚠️  THIS DELIBERATELY DIVERGES FROM THE SOURCE PDF. The PDF names twenty
--     types. After this migration the catalogue holds TWENTY-THREE. That is a
--     Director decision taken 2026-09-09, choosing "add new kinds for them"
--     over "leave them blank" and over "put them under Other", with the
--     divergence stated in the option he chose. The next person to diff this
--     catalogue against the PDF WILL find a mismatch — it is intentional, and
--     the PDF is the document that is now behind, not this table.
--
-- WHY NOT 'Other'. 'Other' is in the catalogue and would have accepted all
--   four. But a convocation and an alumni meet filed as 'Other' are
--   indistinguishable in the report, and the report is the accreditation
--   evidence. A named type keeps the claim specific.
--
-- SCOPE. institution_id IS NULL — cluster-wide, matching all 20 existing rows.
--
-- ORDER. display_order 200/210/220: after Field Visit (190) and before Other
--   (900), so the twenty PDF types keep their exact published sequence and
--   'Other' stays last where a catch-all belongs. Nothing above is renumbered.
--   (The 09-08 defect in the parent migration was precisely a reordering of the
--   PDF's twenty; this file must not repeat it, so it only APPENDS.)
--
-- IDEMPOTENT. ON CONFLICT DO NOTHING against uq_event_academic_types_scope_code.
--
-- NOT DONE HERE. The four existing events are still untagged. The column that
--   would hold the tag (`events.academic_type_id`) arrives with PR #3371, which
--   is open and unmerged; back-mapping them is that PR's follow-up, not this
--   file's. This migration only makes the destination exist.
-- ============================================================================

INSERT INTO public.event_academic_types (institution_id, code, label, description, display_order)
VALUES
  (NULL, 'convocation',        'Convocation',
   'The formal graduation ceremony at which degrees are conferred.', 200),
  (NULL, 'alumni_meet',        'Alumni Meet',
   'A gathering of former learners of the institution.', 210),
  (NULL, 'school_of_influence','School of Influence',
   'A session run under the School of Influence programme.', 220)
ON CONFLICT DO NOTHING;

-- ── Assert, rather than trust the insert ────────────────────────────────────
-- Checked against the cluster-wide scope only, so a college's own extra rows
-- can never mask a shortfall here. Three separate assertions rather than one
-- count, because "23 rows exist" would still pass if this file inserted the
-- wrong three and a college had added three of its own.
DO $$
DECLARE
  v_total   integer;
  v_missing text;
BEGIN
  SELECT count(*) INTO v_total
    FROM public.event_academic_types
   WHERE institution_id IS NULL;

  SELECT string_agg(c, ', ') INTO v_missing
    FROM unnest(ARRAY['convocation','alumni_meet','school_of_influence']) AS c
   WHERE NOT EXISTS (
     SELECT 1 FROM public.event_academic_types
      WHERE institution_id IS NULL AND lower(code) = c);

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION
      'Academic types: these did not land: %. Nothing has been committed.', v_missing;
  END IF;

  IF v_total < 23 THEN
    RAISE EXCEPTION
      'Academic types: expected at least 23 cluster-wide rows, found %. The catalogue is incomplete.',
      v_total;
  END IF;

  RAISE NOTICE 'Catalogue now holds % cluster-wide academic event types (20 from the PDF + 3 added 2026-09-09).',
    v_total;
END $$;
