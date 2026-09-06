-- ============================================================================
-- Normalize existing father_occupation / mother_occupation TEXT values into
-- the new OCCUPATION_OPTIONS categories.
-- ============================================================================
-- Created: 2026-05-19
-- Purpose:
--   The new dropdown component (components/admission/occupation-field.tsx)
--   stores category codes like 'DRIVER', 'HOMEMAKER', etc. instead of raw
--   free-text like 'COOLIE', 'BUSSINESS', 'HOUSE WIFE'. This migration
--   does a one-time fuzzy-match of the existing ~8,772 filled occupation
--   strings to the 14 normalised codes.
--
-- Coverage (from pre-migration preview):
--   father:  92.2% normalised, 7.8% left as-is (render as 'Other (specify)')
--   mother:  96.3% normalised, 3.7% left as-is
--   Overall: 8,263 / 8,772 = 94.2% rows normalised
--
-- Strategy:
--   - CASE-WHEN regex match against patterns derived from the actual top
--     values in the DB (typos and variants explicitly included)
--   - Garbage values (NIL/NILL/-/2022/NOT APPLICABLE/etc.) become NULL
--   - Anything unmatched stays as-is; the form renders it via the OTHER
--     fallback with the raw text pre-filled, so no data is lost
--   - Mappings are SAFE — only well-known patterns are normalised; ambiguous
--     values stay as-is
--
-- Per the documented project rule (feedback_placeholder_migrations_hide_typos.md),
-- the full UPDATE statement is committed here, not just a placeholder.
-- ============================================================================

DO $$
BEGIN
  -- ── FATHER ───────────────────────────────────────────────────────────────
  UPDATE public.learners_profiles
  SET father_occupation = CASE
    WHEN upper(trim(father_occupation)) ~ '(HOUSE\s*WIFE|HOMEMAKER|HOME\s*MAKER|HOUS.?WIFE|HOUSE.?WIFE)' THEN 'HOMEMAKER'
    WHEN upper(trim(father_occupation)) ~ '(^|\W)(COOLL?I?E?Y?|KOOLI|COLLIE|COLLI|COLI|COOLE|LABOUR(ER)?|LABOR(ER)?|DAILY\s*WAGES?|DAILYWAGES|DAILY\s*LABOUR|CONSTRUCTION\s*WORKER|WAGES)($|\W)' THEN 'DAILY_WAGE_WORKER'
    WHEN upper(trim(father_occupation)) ~ '(FARMER|FAMER|FORMER|FARMING|AGRICULTUR|^AGRI$)' THEN 'FARMER'
    WHEN upper(trim(father_occupation)) ~ '(DRIVER|CONDUCTOR)' THEN 'DRIVER'
    WHEN upper(trim(father_occupation)) ~ '(BUSI?NESS|BUSSINESS|BUISNESS|BUSI?NESS\s*MAN|BUSINESSMAN|SELF[\s\-]*EMPLOYED|OWN\s*BUI?SI?NESS|HOTEL\s*BUSINESS|SHOP\s*KEEPER|DRESS\s*SHOP)' THEN 'BUSINESS'
    WHEN upper(trim(father_occupation)) ~ '(WEAVER|WEAVING|WEVER|POWER\s*LOO[MP]|POWERLOOM|HAND\s*LOOM|HANDLOOM|TEXTILE|GARMENT|^MILL$|DYING|DYEING)' THEN 'WEAVER'
    WHEN upper(trim(father_occupation)) ~ '(TAILOR|TAILER|TAILORING)' THEN 'TAILOR'
    WHEN upper(trim(father_occupation)) ~ '(MECHANIC|ELECTRICIAN|ELECTRITION|ELECTRION|ELECTRISION|CARPENTER|PAINTER|MASON|MESON|WELDER|PLUMBER|BUILDING\s*CONTRACTOR|^CONTRACTOR$|BARB(OUR|ER)|GOLD\s*SMITH|MACHINE\s*OPERATOR|HOUSE\s*KEEPING)' THEN 'SKILLED_TRADE'
    WHEN upper(trim(father_occupation)) ~ '(TEACHER|PROFESSOR|LECTURER)' THEN 'TEACHER'
    WHEN upper(trim(father_occupation)) ~ '(NURSE|PHARMACIST|DOCTOR|ANM|ASHA|LAB\s*ASSISTANT|BEAUTICIAN)' THEN 'HEALTHCARE'
    WHEN upper(trim(father_occupation)) ~ '(TNEB|TNSTC|POLICE|GOVERNMENT\s*EMPLOYEE|GOVT|AWC\s*WORKER|EX[\s\-]*ARMY|^ARMY$|MILITARY|COURT\s*STAFF)' THEN 'GOVERNMENT_EMPLOYEE'
    WHEN upper(trim(father_occupation)) ~ '(EMPLOYEE|ACCOUNTANT|MANAGER|SUPERVISOR|SALES\s*MAN|SALESMAN|WATCHMAN|SECURITY|OFFICE|^AGENT$|LIC\s*AGENT|MARKETING|^FINANCE$|LIBRARIAN)' THEN 'PRIVATE_EMPLOYEE'
    WHEN upper(trim(father_occupation)) ~ '(ENGINEER|SOFTWARE|^CIVIL$|ADVOCATE|LAWYER|^CA$)' THEN 'ENGINEER'
    WHEN upper(trim(father_occupation)) ~ '(LATE|DECEASED|EXPIRED|NO\s*MORE|^LEFT$)' THEN 'DECEASED'
    WHEN upper(trim(father_occupation)) ~ '^(NIL+|NO|NA|N/A|-+|2[0-9]{3}|NOT\s*APPLICABLE|NULL|NONE|EMPTY)$' THEN NULL
    ELSE father_occupation  -- leave as-is; form renders via OTHER with raw text
  END
  WHERE father_occupation IS NOT NULL
    AND trim(father_occupation) <> '';

  -- ── MOTHER ───────────────────────────────────────────────────────────────
  UPDATE public.learners_profiles
  SET mother_occupation = CASE
    WHEN upper(trim(mother_occupation)) ~ '(HOUSE\s*WIFE|HOMEMAKER|HOME\s*MAKER|HOUS.?WIFE|HOUSE.?WIFE)' THEN 'HOMEMAKER'
    WHEN upper(trim(mother_occupation)) ~ '(^|\W)(COOLL?I?E?Y?|KOOLI|COLLIE|COLLI|COLI|COOLE|LABOUR(ER)?|LABOR(ER)?|DAILY\s*WAGES?|DAILYWAGES|DAILY\s*LABOUR|CONSTRUCTION\s*WORKER|WAGES)($|\W)' THEN 'DAILY_WAGE_WORKER'
    WHEN upper(trim(mother_occupation)) ~ '(FARMER|FAMER|FORMER|FARMING|AGRICULTUR|^AGRI$)' THEN 'FARMER'
    WHEN upper(trim(mother_occupation)) ~ '(DRIVER|CONDUCTOR)' THEN 'DRIVER'
    WHEN upper(trim(mother_occupation)) ~ '(BUSI?NESS|BUSSINESS|BUISNESS|BUSI?NESS\s*MAN|BUSINESSMAN|SELF[\s\-]*EMPLOYED|OWN\s*BUI?SI?NESS|HOTEL\s*BUSINESS|SHOP\s*KEEPER|DRESS\s*SHOP)' THEN 'BUSINESS'
    WHEN upper(trim(mother_occupation)) ~ '(WEAVER|WEAVING|WEVER|POWER\s*LOO[MP]|POWERLOOM|HAND\s*LOOM|HANDLOOM|TEXTILE|GARMENT|^MILL$|DYING|DYEING)' THEN 'WEAVER'
    WHEN upper(trim(mother_occupation)) ~ '(TAILOR|TAILER|TAILORING)' THEN 'TAILOR'
    WHEN upper(trim(mother_occupation)) ~ '(MECHANIC|ELECTRICIAN|ELECTRITION|ELECTRION|ELECTRISION|CARPENTER|PAINTER|MASON|MESON|WELDER|PLUMBER|BUILDING\s*CONTRACTOR|^CONTRACTOR$|BARB(OUR|ER)|GOLD\s*SMITH|MACHINE\s*OPERATOR|HOUSE\s*KEEPING)' THEN 'SKILLED_TRADE'
    WHEN upper(trim(mother_occupation)) ~ '(TEACHER|PROFESSOR|LECTURER)' THEN 'TEACHER'
    WHEN upper(trim(mother_occupation)) ~ '(NURSE|PHARMACIST|DOCTOR|ANM|ASHA|LAB\s*ASSISTANT|BEAUTICIAN)' THEN 'HEALTHCARE'
    WHEN upper(trim(mother_occupation)) ~ '(TNEB|TNSTC|POLICE|GOVERNMENT\s*EMPLOYEE|GOVT|AWC\s*WORKER|EX[\s\-]*ARMY|^ARMY$|MILITARY|COURT\s*STAFF)' THEN 'GOVERNMENT_EMPLOYEE'
    WHEN upper(trim(mother_occupation)) ~ '(EMPLOYEE|ACCOUNTANT|MANAGER|SUPERVISOR|SALES\s*MAN|SALESMAN|WATCHMAN|SECURITY|OFFICE|^AGENT$|LIC\s*AGENT|MARKETING|^FINANCE$|LIBRARIAN)' THEN 'PRIVATE_EMPLOYEE'
    WHEN upper(trim(mother_occupation)) ~ '(ENGINEER|SOFTWARE|^CIVIL$|ADVOCATE|LAWYER|^CA$)' THEN 'ENGINEER'
    WHEN upper(trim(mother_occupation)) ~ '(LATE|DECEASED|EXPIRED|NO\s*MORE|^LEFT$)' THEN 'DECEASED'
    WHEN upper(trim(mother_occupation)) ~ '^(NIL+|NO|NA|N/A|-+|2[0-9]{3}|NOT\s*APPLICABLE|NULL|NONE|EMPTY)$' THEN NULL
    ELSE mother_occupation
  END
  WHERE mother_occupation IS NOT NULL
    AND trim(mother_occupation) <> '';
END $$;
