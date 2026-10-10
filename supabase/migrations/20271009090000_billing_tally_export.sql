-- ============================================================================
-- 20271009090000 — Tally export setup for the Collection report
-- ============================================================================
-- /billing/reports?tab=collection gains a "Tally XML" download: each receipt
-- becomes a TallyPrime Receipt voucher (Dr cash/bank ledger, Cr learner
-- ledger). Tally identifies ledgers by NAME, so MyJKKN has to know two things
-- per institution (one Tally company per institution):
--
--   billing_tally_settings         payment mode -> cash/bank ledger name
--   billing_tally_learner_ledgers  MyJKKN ID    -> learner ledger name
--
-- `book` separates the two Tally companies a receipt can post to: 'fees' (the
-- college / school books) and 'transport' (Transport Maintenance Fee, exported
-- as its own file with its own ledger names).
--
-- NOTHING in this migration touches billing_receipts, billing_student_bills or
-- any other existing table, function, trigger or policy. The export only READS
-- receipts, through the existing get_billing_reports_collection_daywise RPC.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.billing_tally_settings (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id  uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    book            text NOT NULL DEFAULT 'fees' CHECK (book IN ('fees','transport')),
    -- billing_receipts.payment_mode -> exact Tally ledger name, e.g.
    -- {"cash": "Cash", "online": "HDFC A/C 50100843279416"}. 'combined' is never
    -- mapped: those receipts carry no cash/bank split and are left out.
    mode_ledgers    jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    UNIQUE (institution_id, book)
);

CREATE TABLE IF NOT EXISTS public.billing_tally_learner_ledgers (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id     uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
    book               text NOT NULL DEFAULT 'fees' CHECK (book IN ('fees','transport')),
    -- jkkn_identities.jkkn_id, trimmed. Text rather than an FK to the learner:
    -- the mapping sheet is keyed on the printed MyJKKN ID.
    jkkn_id            text NOT NULL CHECK (btrim(jkkn_id) <> ''),
    -- Stored exactly as it is spelled in Tally (inner spaces included); Tally
    -- rejects a voucher whose ledger name differs by a single character.
    tally_ledger_name  text NOT NULL CHECK (btrim(tally_ledger_name) <> ''),
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_by         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    UNIQUE (institution_id, book, jkkn_id)
);

DROP TRIGGER IF EXISTS trg_billing_tally_settings_touch ON public.billing_tally_settings;
CREATE TRIGGER trg_billing_tally_settings_touch
    BEFORE UPDATE ON public.billing_tally_settings
    FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

DROP TRIGGER IF EXISTS trg_billing_tally_learner_ledgers_touch ON public.billing_tally_learner_ledgers;
CREATE TRIGGER trg_billing_tally_learner_ledgers_touch
    BEFORE UPDATE ON public.billing_tally_learner_ledgers
    FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

COMMENT ON TABLE public.billing_tally_settings IS
  'Per institution and book: which Tally cash/bank ledger each payment mode posts to in the Collection report''s Tally XML export.';
COMMENT ON TABLE public.billing_tally_learner_ledgers IS
  'MyJKKN ID -> Tally learner ledger name, per institution and book, for the Collection report''s Tally XML export.';

-- ---------------------------------------------------------------------------
-- RLS — read with the report, write with its export permission; both scoped
-- to the caller's institutions (role_has_institution_access is CAS-aware).
-- ---------------------------------------------------------------------------
ALTER TABLE public.billing_tally_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_tally_settings FROM anon, PUBLIC;

DROP POLICY IF EXISTS billing_tally_settings_read ON public.billing_tally_settings;
CREATE POLICY billing_tally_settings_read
    ON public.billing_tally_settings FOR SELECT
    USING (
      (SELECT public.is_super_admin() OR public.is_admin())
      OR (
        public.user_has_permission('billing.reports.view')
        AND public.role_has_institution_access(institution_id)
      )
    );

DROP POLICY IF EXISTS billing_tally_settings_write ON public.billing_tally_settings;
CREATE POLICY billing_tally_settings_write
    ON public.billing_tally_settings FOR ALL
    USING (
      (SELECT public.is_super_admin() OR public.is_admin())
      OR (
        public.user_has_permission('billing.reports.export')
        AND public.role_has_institution_access(institution_id)
      )
    )
    WITH CHECK (
      (SELECT public.is_super_admin() OR public.is_admin())
      OR (
        public.user_has_permission('billing.reports.export')
        AND public.role_has_institution_access(institution_id)
      )
    );

ALTER TABLE public.billing_tally_learner_ledgers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_tally_learner_ledgers FROM anon, PUBLIC;

DROP POLICY IF EXISTS billing_tally_learner_ledgers_read ON public.billing_tally_learner_ledgers;
CREATE POLICY billing_tally_learner_ledgers_read
    ON public.billing_tally_learner_ledgers FOR SELECT
    USING (
      (SELECT public.is_super_admin() OR public.is_admin())
      OR (
        public.user_has_permission('billing.reports.view')
        AND public.role_has_institution_access(institution_id)
      )
    );

DROP POLICY IF EXISTS billing_tally_learner_ledgers_write ON public.billing_tally_learner_ledgers;
CREATE POLICY billing_tally_learner_ledgers_write
    ON public.billing_tally_learner_ledgers FOR ALL
    USING (
      (SELECT public.is_super_admin() OR public.is_admin())
      OR (
        public.user_has_permission('billing.reports.export')
        AND public.role_has_institution_access(institution_id)
      )
    )
    WITH CHECK (
      (SELECT public.is_super_admin() OR public.is_admin())
      OR (
        public.user_has_permission('billing.reports.export')
        AND public.role_has_institution_access(institution_id)
      )
    );

GRANT SELECT, INSERT, UPDATE, DELETE ON
    public.billing_tally_settings,
    public.billing_tally_learner_ledgers
TO authenticated;

COMMIT;
