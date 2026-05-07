-- ============================================================================
-- 20260507100017 — Gate Entry feature: schema, maintain trigger, and capture RPC
-- ============================================================================
-- Goal: gate security captures basic details when a student arrives at the
-- institution gate. The capture lands as a single admission_leads row with
-- N admission_lead_source_captures rows (one per visit), so the admission
-- team continues from there with no duplication. Gate-entry timestamp +
-- count are denormalized onto admission_leads for O(1) "did this lead come
-- via gate?" analytics.
--
-- Design decisions (verified via dossier 2026-05-07):
--   - Storage = capture row + 3 denormalized columns (Option C from dossier).
--     One capture row per visit preserves visit-frequency audit; denormalized
--     columns avoid joins in dashboards.
--   - lead_source enum gets a new 'gate_entry' value. Within this migration
--     we use ::text comparison in the trigger body to avoid the
--     same-transaction enum-not-yet-visible quirk.
--   - capture_gate_entry_lead is a wrapper over capture_admission_lead.
--     Don't extend the latter — it's already called from website / edu_fair /
--     walk-in flows; bloating the signature would break them.
--   - lead.source = 'walk_in' (the channel category); capture.source =
--     'gate_entry' (the per-touch flavor). Matches existing primary-source
--     vs touch-source split.
-- ============================================================================

-- ───────────────────── 1. Enum value ─────────────────────

ALTER TYPE public.lead_source ADD VALUE IF NOT EXISTS 'gate_entry';

-- ───────────────────── 2. Denormalized columns + index ─────────────────────

ALTER TABLE public.admission_leads
    ADD COLUMN IF NOT EXISTS first_gate_entry_at timestamptz,
    ADD COLUMN IF NOT EXISTS first_gate_entry_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS gate_entry_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_admission_leads_first_gate_entry_at
    ON public.admission_leads (institution_id, first_gate_entry_at)
 WHERE first_gate_entry_at IS NOT NULL;

-- ───────────────────── 3. Maintain trigger ─────────────────────
-- Updates the denormalized columns whenever a gate_entry capture lands.
-- COALESCE on first_* preserves the earliest visit; gate_entry_count
-- increments on every visit.

CREATE OR REPLACE FUNCTION public.maintain_lead_gate_entry_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Use ::text to dodge the same-transaction enum-not-yet-visible quirk.
    -- At runtime (post-commit) the cast resolves identically.
    IF NEW.source::text <> 'gate_entry' THEN
        RETURN NEW;
    END IF;

    UPDATE public.admission_leads
       SET first_gate_entry_at = COALESCE(first_gate_entry_at, NEW.captured_at),
           first_gate_entry_by = COALESCE(first_gate_entry_by, NEW.captured_by),
           gate_entry_count    = gate_entry_count + 1,
           updated_at          = now()
     WHERE id = NEW.lead_id;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_maintain_lead_gate_entry_columns
    ON public.admission_lead_source_captures;

CREATE TRIGGER trg_maintain_lead_gate_entry_columns
    AFTER INSERT ON public.admission_lead_source_captures
    FOR EACH ROW
    EXECUTE FUNCTION public.maintain_lead_gate_entry_columns();

-- ───────────────────── 4. capture_gate_entry_lead RPC ─────────────────────
-- Thin wrapper over capture_admission_lead. Enforces gate-specific permission
-- gate, validates required inputs, then delegates to the existing dedup
-- engine. Lead's primary source remains 'walk_in'; per-touch source on the
-- capture row is 'gate_entry'.

CREATE OR REPLACE FUNCTION public.capture_gate_entry_lead(
    p_first_name        text,
    p_phone             text,
    p_institution_id    uuid,
    p_last_name         text DEFAULT NULL,
    p_program_id        uuid DEFAULT NULL,
    p_referral_type     text DEFAULT NULL,
    p_referred_by_id    uuid DEFAULT NULL,
    p_referred_by_name  text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_result  jsonb;
BEGIN
    -- Permission gate: gate_entry.create OR a parent admission permission.
    -- Mirrors the gate in capture_admission_lead but adds gate_entry.create
    -- so a gate-only role (gate_security) can use this without being granted
    -- the broader leads.create.
    IF v_user_id IS NULL OR NOT (
        public.is_super_admin()
        OR public.is_admin(v_user_id)
        OR public.user_has_permission('admission.gate_entry.create')
        OR public.user_has_permission('admission.leads.create')
    ) THEN
        RAISE EXCEPTION 'Insufficient permission to log gate entry'
            USING ERRCODE = '42501';
    END IF;

    -- Required-field guards (belt-and-suspenders; downstream RPC also checks)
    IF p_institution_id IS NULL THEN
        RAISE EXCEPTION 'institution_id is required' USING ERRCODE = '23502';
    END IF;
    IF p_first_name IS NULL OR length(trim(p_first_name)) = 0 THEN
        RAISE EXCEPTION 'first_name is required' USING ERRCODE = '23502';
    END IF;
    IF p_phone IS NULL OR length(trim(p_phone)) = 0 THEN
        RAISE EXCEPTION 'phone is required' USING ERRCODE = '23502';
    END IF;

    -- Delegate to the existing dedup engine. capture_admission_lead handles
    -- phone+institution dedup atomically (FOR UPDATE), reactivates lost/dormant
    -- stages, and never overwrites identity fields (COALESCE).
    v_result := public.capture_admission_lead(
        p_lead := jsonb_build_object(
            'first_name',       trim(p_first_name),
            'last_name',        NULLIF(trim(COALESCE(p_last_name, '')), ''),
            'phone',            trim(p_phone),
            'institution_id',   p_institution_id,
            'source',           'walk_in',
            'program_id',       p_program_id,
            'referral_type',    p_referral_type,
            'referred_by_id',   p_referred_by_id,
            'referred_by_name', p_referred_by_name,
            'captured_by',      v_user_id
        ),
        p_capture := jsonb_build_object(
            'source',       'gate_entry',
            'captured_by',  v_user_id,
            'captured_at',  now(),
            'raw_payload',  jsonb_build_object('via', 'gate-entry-form')
        )
    );

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_gate_entry_lead(text, text, uuid, text, uuid, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.capture_gate_entry_lead(text, text, uuid, text, uuid, text, uuid, text) TO authenticated;
