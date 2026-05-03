-- ============================================================================
-- Migration: 20260503180000_dedup_education_fair_bulk_import
-- Education-fair bulk-import remediation: mark duplicates
-- ============================================================================
--
-- Background (verified empirically 2026-05-03 evening):
--
--   * 14,412 admission_leads rows were inserted between 2026-04-25 and 2026-04-29
--     with source = 'education_fair', 99.6% by a single capturer (dhuraimurugan.g),
--     spanning 16 expo events. Capture rate (8,321 leads in one day from one
--     account) is mechanically only achievable via bulk import — paper-form
--     digitization or external CSV ingestion, not real-time field capture.
--
--   * Phone-uniqueness across these rows: only 7,321 distinct phones across
--     14,412 rows = 49.2% duplication. Yet `is_duplicate=false` on every row
--     (the bulk-import path skipped duplicate detection).
--
--   * 100% of these rows have `wa_opt_in=true` — uniformly stamped by the
--     import script, not collected per-lead. Real expo capture has 60-90%
--     opt-in rate. Treat as bulk-default opt-in; respect for downstream
--     consent decisions.
--
--   * 36% (5,239 of 14,412) ended up with both `counselor_id IS NULL` AND
--     `assigned_counselor_id IS NULL`. 99.8% of those (5,229) are at
--     institutions with ZERO active counselors mapped (Jicate Solutions
--     parent entity got 2,837; JKKN College of Education got 997; etc.) —
--     the bulk-import script's mapping defaulted unmappable rows to those
--     unstaffed institutions. Counselor-config gap, not a routing bug. That
--     side of the remediation lives elsewhere — this migration ONLY handles
--     the duplicate-detection gap.
--
-- What this migration does:
--
--   1. Pick a CANONICAL row per phone, scoped to source='education_fair'
--      and is_active=true, preferring:
--        (a) counselor-assigned (counselor_id IS NOT NULL) over unassigned
--        (b) earliest created_at as tiebreaker
--      Rationale: if a counselor has already touched a phone (even via the
--      partial bulk-import mapping), don't strip that signal. Use the
--      assigned row as canonical so future re-engagement preserves
--      counselor association.
--
--   2. Mark all OTHER rows for the same phone as `is_duplicate=true` with
--      `duplicate_of=<canonical row id>`.
--
--   3. Update `updated_at` on every modified row.
--
-- Idempotency:
--   The UPDATE filters on `COALESCE(is_duplicate, false) = false`. Re-running
--   is a no-op. The DISTINCT ON canonical pick is also re-run-safe — once the
--   canonical row is set, future runs identify the same canonical (no rows
--   change state on subsequent runs).
--
-- Reversibility:
--   `UPDATE admission_leads SET is_duplicate=false, duplicate_of=NULL
--    WHERE source='education_fair' AND duplicate_of IS NOT NULL;`
--
-- Expected outcome (run pre-migration probe):
--   14,412 total → ~7,321 canonical + ~7,091 marked is_duplicate.
--
-- Verification query (post-merge):
--   SELECT count(*) FILTER (WHERE COALESCE(is_duplicate,false)=false) AS canonical,
--          count(*) FILTER (WHERE is_duplicate=true)                   AS duplicates,
--          count(*)                                                    AS total
--     FROM admission_leads
--    WHERE source='education_fair' AND is_active=true;
--
-- Locked outcome metric (90-day):
--   Module: education_fair bulk-import remediation (ships in stages — this
--   migration is stage 1 of 3; stage 2 is broadcast launch on canonical IDs;
--   stage 3 is counselor-config gap surfacing for understaffed institutions).
--   metric_name: wa_reply_rate_on_dedup_fair_leads
--   baseline_value: 0% (broadcast not yet sent)
--   threshold_90d: ≥5% reply rate by 2026-08-01 (industry baseline 3-8% for
--                  cold WhatsApp re-engagement)
--   kill_criterion: if reply rate <2% at 90d, the synthetic 100% wa_opt_in
--                   flag indicates invalid consent — archive broadcast +
--                   route to compliance review.
-- ============================================================================

WITH canonical AS (
  SELECT DISTINCT ON (phone)
    id,
    phone,
    created_at,
    counselor_id
  FROM admission_leads
  WHERE source = 'education_fair'
    AND is_active = true
    AND COALESCE(is_duplicate, false) = false
    AND phone IS NOT NULL
    AND phone <> ''
  ORDER BY phone, (counselor_id IS NULL), created_at ASC
)
UPDATE admission_leads dup
   SET is_duplicate = true,
       duplicate_of = c.id,
       updated_at   = NOW()
  FROM canonical c
 WHERE dup.source = 'education_fair'
   AND dup.is_active = true
   AND COALESCE(dup.is_duplicate, false) = false
   AND dup.phone = c.phone
   AND dup.id <> c.id;
