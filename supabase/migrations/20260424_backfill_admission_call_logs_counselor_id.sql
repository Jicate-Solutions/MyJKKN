-- 20260424_backfill_admission_call_logs_counselor_id.sql
-- Bug B2 — Backfill counselor_id on existing admission_call_logs rows.
--
-- Context: Before 2026-04-24, both the webhook insert path and the CDR cron
-- sync path left counselor_id NULL on ~99% of inbound calls (1894/1912).
-- PR B1 fixes the go-forward insert paths. This migration backfills the
-- existing rows using the same two signals, in priority order:
--
--   1. admission_leads.assigned_counselor_id (when lead_id is set and the
--      lead already has a counselor assigned).
--   2. AGENT_MAP phone → profiles.email (when to_number matches a known
--      Exotel co-worker whose email exists as a MyJKKN profile).
--
-- Rows where no signal resolves are left NULL — guessing would corrupt
-- counselor activity reports.
--
-- Idempotent: uses `WHERE counselor_id IS NULL` so re-running does nothing.

-- ─────────────────────────────────────────────────────────────────────────
-- Signal 1: lead.assigned_counselor_id
-- ─────────────────────────────────────────────────────────────────────────
UPDATE admission_call_logs cl
SET counselor_id = l.assigned_counselor_id,
    updated_at = now()
FROM admission_leads l
WHERE cl.lead_id = l.id
  AND cl.counselor_id IS NULL
  AND l.assigned_counselor_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- Signal 2: to_number → AGENT_MAP → profiles.email
-- The (phone, email) pairs below mirror AGENT_MAP in
-- lib/services/telephony/exotel-agent-map.ts. Only pairs whose email
-- resolves to an active profile will attribute — the rest stay NULL.
-- ─────────────────────────────────────────────────────────────────────────
WITH agent_map(phone, email) AS (
  VALUES
    ('09894116664', 'exotel@jkkn.org'),
    ('08778377147', 'ranjith@jkkn.ac.in'),
    ('09942405777', 'shanmugaprabhu@jkkn.org'),
    ('09842547666', 'gowrisankar@jkkn.ac.in'),
    ('09092327666', 'ratheshraj@jkkn.ac.in'),
    ('09865933332', 'murugan.s@jkkn.org'),
    ('09788261666', 'rajendiran.km@jkkn.ac.in'),
    ('09092334666', 'saranyadevi.pm@jkkn.ac.in'),
    ('08754864052', 'gandhimathi.v@jkkn.ac.in'),
    ('09171668571', 'hodpublichealthdentistry@jkkn.ac.in'),
    ('09841101475', 'aishwarya@jkkn.ac.in'),
    ('09629771832', 'tamilselvi.c@jkkn.ac.in'),
    ('09842663659', 'hodpharmaceuticalanalysis@jkkn.ac.in'),
    ('09943583666', 'hemaparvathi.s@jkkn.ac.in'),
    ('09965939333', 'a.nandhini@jkkn.ac.in'),
    ('09976253000', 'school@jkkn.ac.in'),
    ('09047515766', 'matricprincipal@jkkn.ac.in'),
    ('09994344986', 'vidhyalyaprincipal@jkkn.ac.in'),
    ('09976622671', 'hodphysics@jkkn.ac.in'),
    ('09865910003', 'nirmalsathyaraj@jkkn.ac.in'),
    ('09942717828', 'subramanian.r@jkkn.ac.in'),
    ('09578085089', 'loganandhi.p@jkkn.ac.in'),
    ('09789298008', 'kandasamy@jkkn.ac.in'),
    ('09788648307', 'gunasekar_s@jkkn.ac.in'),
    ('06369319639', 'pranoukumar1999@gmail.com'),
    ('09715737333', 'nazarkhan.k@jkkn.ac.in'),
    ('09629001443', 'dinesh.kulanthaivel@jkkn.ac.in'),
    ('09498837581', 'boopathi.k@jkkn.ac.in'),
    ('09787800286', 'sroja@jkkn.ac.in'),
    ('08248275908', 'janaki@jkkn.ac.in'),
    ('09344114367', 'snehapoppy.ss@gmail.com'),
    ('09095255887', 'surendhar@jkkn.ac.in'),
    ('09787800772', 'naveenkumar@atchayamtrust.com'),
    ('09025449944', 'dhineshkumar.b@jkkn.ac.in')
)
UPDATE admission_call_logs cl
SET counselor_id = p.id,
    updated_at = now()
FROM agent_map am
JOIN profiles p ON LOWER(p.email) = LOWER(am.email)
WHERE cl.to_number = am.phone
  AND cl.counselor_id IS NULL
  AND cl.direction = 'inbound';

-- ─────────────────────────────────────────────────────────────────────────
-- Post-backfill audit (comment for reviewer; does nothing)
-- Run after apply to confirm:
--   SELECT COUNT(*) FILTER (WHERE counselor_id IS NULL) AS null_counselor,
--          COUNT(*) AS total_inbound
--   FROM admission_call_logs WHERE direction = 'inbound';
-- Expected post-apply: null_counselor drops by ~138 (7.3% of 1894 as of
-- 2026-04-24). The remaining NULLs are calls routed via ExoPhone DIDs with
-- no detectable agent, or agent phones whose email isn't yet a MyJKKN
-- profile (Agent A's identity-sync bucket).
-- ─────────────────────────────────────────────────────────────────────────
