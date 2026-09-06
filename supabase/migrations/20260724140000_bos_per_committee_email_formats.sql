-- ─────────────────────────────────────────────────────────────────────────────
-- 20260724140000_bos_per_committee_email_formats.sql
--
-- Per-committee, date-effective BoS email + call-letter formats, plus
-- board-level sender identity. Extends the existing notify-members /
-- /bos/email-settings infrastructure rather than replacing it.
--
-- CET engineering colleges convene nine distinct bodies (Board of Studies,
-- Department Financial Plan Committee, Programme Assessment Committee,
-- Programme Alumni Interactive Cell, Industry Advisory Board, Department
-- Advisory Board, Curriculum Development Cell, Academic Council, Governing
-- Body). Each wants its own email wording + attached PDF text, changeable
-- with-effect-from a date, and (optionally) sending from a per-board address.
--
-- Design decisions this migration encodes:
--   1. bos_body_types           — a stable, seeded catalog of the 9 bodies,
--                                 unifying the two axes they live on today
--                                 (meeting_type for BOS/AC/GB, bos_committees
--                                 for the middle six).
--   2. bos_committees.body_type_code
--                               — maps a committee row to its catalog code so
--                                 a meeting can resolve its body type.
--   3. bos_email_templates      — gains body_type_code + effective_from (the
--                                 "w.e.f." date, compared against the meeting's
--                                 scheduled_date) + per-body PDF/signoff fields.
--                                 The single-active unique index is REPLACED by
--                                 one keyed on (institution, code, body, date)
--                                 so multiple dated versions coexist as history.
--   4. bos_board_senders        — per-(institution, COE board) From override,
--                                 falling back to smtp_configuration.
--
-- RLS deliberately reuses existing permission keys (bos-compositions.*) so no
-- new grant migration is needed — the exact drift that has caused blank-page
-- bugs before (see 20260516_normalize_bos_perm_key_format_drift).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. bos_body_types (catalog) ──────────────────────────────────────────────
-- Global (institution-agnostic) so codes stay stable across the org. Seeded
-- with the 9 bodies; super-admins may add/rename via a small catalog control.

CREATE TABLE IF NOT EXISTS bos_body_types (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        VARCHAR(32)  NOT NULL,
  name        VARCHAR(255) NOT NULL,
  sort_order  INTEGER      NOT NULL DEFAULT 0,
  is_active   BOOLEAN      NOT NULL DEFAULT true,
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Code unique (case-insensitive) — it's the join key everything else uses.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_bos_body_types_code
  ON bos_body_types (lower(code));

ALTER TABLE bos_body_types ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can read the catalog (needed to render pickers +
-- resolve a meeting's body). Only super-admins mutate it — it's org-wide.
DROP POLICY IF EXISTS bos_body_types_select ON bos_body_types;
CREATE POLICY bos_body_types_select ON bos_body_types
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS bos_body_types_write ON bos_body_types;
CREATE POLICY bos_body_types_write ON bos_body_types
  FOR ALL TO authenticated
  USING (is_super_admin() OR is_admin())
  WITH CHECK (is_super_admin() OR is_admin());

DROP TRIGGER IF EXISTS update_bos_body_types_updated_at ON bos_body_types;
CREATE TRIGGER update_bos_body_types_updated_at
  BEFORE UPDATE ON bos_body_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE bos_body_types IS
  'Catalog of governing bodies a BoS-family meeting can belong to (BOS, DFPC, PAC, PAIC, IAB, DAB, CDC, AC, GB). Stable code is the join key for per-body email/PDF formats.';

-- Seed the 9 bodies. ON CONFLICT keeps re-runs idempotent.
INSERT INTO bos_body_types (code, name, sort_order) VALUES
  ('BOS',  'Board of Studies',                    10),
  ('DFPC', 'Department Financial Plan Committee',  20),
  ('PAC',  'Programme Assessment Committee',       30),
  ('PAIC', 'Programme Alumni Interactive Cell',    40),
  ('IAB',  'Industry Advisory Board',              50),
  ('DAB',  'Department Advisory Board',            60),
  ('CDC',  'Curriculum Development Cell',          70),
  ('AC',   'Academic Council',                     80),
  ('GB',   'Governing Body',                       90)
ON CONFLICT (lower(code)) DO NOTHING;

-- ── 2. bos_committees.body_type_code ─────────────────────────────────────────
-- Which catalog body this committee represents. Nullable — legacy/unmapped
-- committees fall through to BOS in the resolver.

ALTER TABLE bos_committees
  ADD COLUMN IF NOT EXISTS body_type_code VARCHAR(32);

CREATE INDEX IF NOT EXISTS idx_bos_committees_body_type
  ON bos_committees (body_type_code);

COMMENT ON COLUMN bos_committees.body_type_code IS
  'Catalog code (bos_body_types.code) this committee maps to. Drives per-body email/PDF format selection. NULL → resolver defaults to BOS.';

-- Backfill by matching the committee name / short_code to a catalog body.
-- Case-insensitive, tolerant of the common name spellings.
UPDATE bos_committees c SET body_type_code = CASE
  WHEN lower(c.name) LIKE '%board of studies%'                 OR upper(coalesce(c.short_code,'')) IN ('BOS')          THEN 'BOS'
  WHEN lower(c.name) LIKE '%financial plan%'                   OR upper(coalesce(c.short_code,'')) IN ('DFPC')         THEN 'DFPC'
  WHEN lower(c.name) LIKE '%programme assessment%'             OR upper(coalesce(c.short_code,'')) IN ('PAC')          THEN 'PAC'
  WHEN lower(c.name) LIKE '%alumni interactive%'               OR upper(coalesce(c.short_code,'')) IN ('PAIC')         THEN 'PAIC'
  WHEN lower(c.name) LIKE '%industry advisory%'                OR upper(coalesce(c.short_code,'')) IN ('IAB')          THEN 'IAB'
  WHEN lower(c.name) LIKE '%department advisory%'              OR upper(coalesce(c.short_code,'')) IN ('DAB')          THEN 'DAB'
  WHEN lower(c.name) LIKE '%curriculum development%'           OR upper(coalesce(c.short_code,'')) IN ('CDC')          THEN 'CDC'
  ELSE c.body_type_code
END
WHERE c.body_type_code IS NULL;

-- ── 3. bos_email_templates: body + effective-date versioning + PDF/signoff ───

ALTER TABLE bos_email_templates
  ADD COLUMN IF NOT EXISTS body_type_code   VARCHAR(32),
  ADD COLUMN IF NOT EXISTS effective_from   DATE NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS pdf_heading      TEXT,
  ADD COLUMN IF NOT EXISTS pdf_intro_html   TEXT,
  ADD COLUMN IF NOT EXISTS pdf_closing_html TEXT,
  ADD COLUMN IF NOT EXISTS reply_to_email   VARCHAR(255),
  ADD COLUMN IF NOT EXISTS signoff_html     TEXT;

-- Existing rows (the seeded global 'meeting_invitation') predate the catalog:
-- attribute them to BOS and to an epoch effective_from so they remain the
-- always-selectable base version for any meeting date.
UPDATE bos_email_templates
SET body_type_code = 'BOS'
WHERE body_type_code IS NULL;

UPDATE bos_email_templates
SET effective_from = DATE '2000-01-01'
WHERE effective_from = CURRENT_DATE
  AND created_at < CURRENT_DATE;   -- only pre-existing rows, not fresh inserts

ALTER TABLE bos_email_templates
  ALTER COLUMN body_type_code SET DEFAULT 'BOS';

-- Replace the single-active unique index with one that allows multiple dated
-- versions per (institution, code, body). The old index enforced one active
-- row per (institution, code) — incompatible with w.e.f. history.
DROP INDEX IF EXISTS uniq_bos_email_templates_active;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_bos_email_templates_versioned
  ON bos_email_templates (
    COALESCE(institutions_id, '00000000-0000-0000-0000-000000000000'::uuid),
    template_code,
    COALESCE(body_type_code, 'BOS'),
    effective_from
  )
  WHERE is_active = true;

-- Resolver index: newest-effective lookup per (code, body, institution).
CREATE INDEX IF NOT EXISTS idx_bos_email_templates_resolve
  ON bos_email_templates (template_code, body_type_code, institutions_id, effective_from DESC)
  WHERE is_active = true;

COMMENT ON COLUMN bos_email_templates.body_type_code IS
  'Which governing body (bos_body_types.code) this format is for. Second selection axis alongside template_code.';
COMMENT ON COLUMN bos_email_templates.effective_from IS
  'w.e.f. date. Resolver picks the newest row with effective_from <= meeting.scheduled_date. Older meetings keep their era''s format.';

-- ── 4. bos_board_senders (per-board From override) ───────────────────────────
-- Same authenticated SMTP account (smtp_configuration); only the visible
-- From: identity differs per board. Mirrors the proven ac_sender_email pattern.

CREATE TABLE IF NOT EXISTS bos_board_senders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  board_id        UUID NOT NULL,          -- COE board id (ECE, EEE, …); not FK-constrained (COE-owned)
  sender_email    VARCHAR(255) NOT NULL,
  sender_name     VARCHAR(255),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One active sender per (institution, board).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_bos_board_senders_active
  ON bos_board_senders (institutions_id, board_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_bos_board_senders_lookup
  ON bos_board_senders (institutions_id, board_id)
  WHERE is_active = true;

ALTER TABLE bos_board_senders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bos_board_senders_select ON bos_board_senders;
CREATE POLICY bos_board_senders_select ON bos_board_senders
  FOR SELECT TO authenticated
  USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('academic.bos-compositions.view')
        AND role_has_institution_access(institutions_id))
  );

DROP POLICY IF EXISTS bos_board_senders_write ON bos_board_senders;
CREATE POLICY bos_board_senders_write ON bos_board_senders
  FOR ALL TO authenticated
  USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('academic.bos-compositions.edit')
        AND role_has_institution_access(institutions_id))
  )
  WITH CHECK (
    is_super_admin() OR is_admin()
    OR (user_has_permission('academic.bos-compositions.edit')
        AND role_has_institution_access(institutions_id))
  );

DROP TRIGGER IF EXISTS update_bos_board_senders_updated_at ON bos_board_senders;
CREATE TRIGGER update_bos_board_senders_updated_at
  BEFORE UPDATE ON bos_board_senders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE bos_board_senders IS
  'Per-(institution, COE board) From: identity override for BoS notices. Absent row → smtp_configuration institution default. Same SMTP credentials; only the visible From differs.';
