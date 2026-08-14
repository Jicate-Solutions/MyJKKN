-- ================================================================================
-- SOLUTIONS HUB — PROPOSALS GET A RECORD
-- Created: 2026-08-14
-- Purpose: every proposal a client receives gets a row of its own — drafted,
--          sent, approved, signed (or rejected) — with a timestamp for each
--          step and the amount involved. This lets the hub answer: how many
--          proposals went out this quarter, how long approval takes, and what
--          value got signed.
--
-- RLS mirrors sh_clients (20260205000002) verbatim:
--   read   = management OR staff OR builders
--   write  = management (admin / JICATE staff / HOD)
--   delete = admins only
-- The sh_* helper functions already exist in production and sh_is_admin() was
-- rewritten on 2026-04-21 (20260421000003) to delegate to public.is_admin() so
-- it honours the is_super_admin flag and the director role. They are REUSED
-- here, never recreated — recreating the old bodies would silently lock the
-- director role out of proposals.
-- ================================================================================

CREATE TABLE IF NOT EXISTS sh_proposals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid NOT NULL REFERENCES sh_clients(id) ON DELETE CASCADE,
    prospect_id uuid NULL REFERENCES sh_prospects(id),
    solution_id uuid NULL REFERENCES sh_solutions(id),
    title text NOT NULL,
    amount_inr numeric NULL,
    status text NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'sent', 'approved', 'signed', 'rejected')),
    sent_at timestamptz,
    approved_at timestamptz,
    signed_at timestamptz,
    notes text,
    file_url text,
    created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sh_proposals_client_id ON sh_proposals(client_id);
CREATE INDEX IF NOT EXISTS idx_sh_proposals_status ON sh_proposals(status);

ALTER TABLE sh_proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sh_proposals_select" ON sh_proposals;
DROP POLICY IF EXISTS "sh_proposals_insert" ON sh_proposals;
DROP POLICY IF EXISTS "sh_proposals_update" ON sh_proposals;
DROP POLICY IF EXISTS "sh_proposals_delete" ON sh_proposals;

CREATE POLICY "sh_proposals_select" ON sh_proposals
    FOR SELECT USING (
        sh_has_management_access()
        OR sh_is_staff()
        OR sh_is_builder()
    );

CREATE POLICY "sh_proposals_insert" ON sh_proposals
    FOR INSERT WITH CHECK (
        sh_has_management_access()
    );

CREATE POLICY "sh_proposals_update" ON sh_proposals
    FOR UPDATE USING (
        sh_has_management_access()
    );

CREATE POLICY "sh_proposals_delete" ON sh_proposals
    FOR DELETE USING (
        sh_is_admin()
    );
