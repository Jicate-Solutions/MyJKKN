-- Solution ↔ GitHub repository links
-- Capability 1 of the Solutions Hub ↔ intern-repo integration.
-- Spec: specs/solutions-hub-intern-repo-integration-spec-2026-07-11.md (12 Director decisions locked 2026-07-11)
--
-- Many-to-many BY DESIGN (Director decision 8): the same repo may serve multiple
-- solutions, so uniqueness is per (solution_id, repo_full_name) only — no global
-- unique on repo_full_name. Links die with their solution (CASCADE) but the
-- GitHub repo itself is never touched (decision 7).

CREATE TABLE IF NOT EXISTS public.sh_solution_repos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    solution_id UUID NOT NULL REFERENCES public.sh_solutions(id) ON DELETE CASCADE,
    -- "org/name" e.g. Jicate-Solutions/pharmacy-pos. Validated shape only —
    -- existence/protection is checked live by the repo-activity service, never stored.
    repo_full_name TEXT NOT NULL CHECK (repo_full_name ~ '^[A-Za-z0-9_.\-]+/[A-Za-z0-9_.\-]+$'),
    linked_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (solution_id, repo_full_name)
);

CREATE INDEX IF NOT EXISTS idx_sh_solution_repos_solution ON public.sh_solution_repos(solution_id);
-- Supports the "also used by [other solution]" cross-link lookup (decision 8).
CREATE INDEX IF NOT EXISTS idx_sh_solution_repos_repo ON public.sh_solution_repos(repo_full_name);

ALTER TABLE public.sh_solution_repos ENABLE ROW LEVEL SECURITY;

-- Mirrors sh_phase_deployments policies (20260205000002_add_solutions_hub_rls_policies.sql).
-- Deviation: DELETE allowed for management/staff (not admin-only) — unlinking is
-- reversible metadata, unlike deleting deployment history.
DROP POLICY IF EXISTS "sh_solution_repos_select" ON sh_solution_repos;
DROP POLICY IF EXISTS "sh_solution_repos_insert" ON sh_solution_repos;
DROP POLICY IF EXISTS "sh_solution_repos_update" ON sh_solution_repos;
DROP POLICY IF EXISTS "sh_solution_repos_delete" ON sh_solution_repos;

CREATE POLICY "sh_solution_repos_select" ON sh_solution_repos
    FOR SELECT USING (
        sh_has_management_access()
        OR sh_is_staff()
        OR sh_is_builder()
    );

CREATE POLICY "sh_solution_repos_insert" ON sh_solution_repos
    FOR INSERT WITH CHECK (
        sh_has_management_access()
        OR sh_is_staff()
    );

CREATE POLICY "sh_solution_repos_update" ON sh_solution_repos
    FOR UPDATE USING (
        sh_has_management_access()
        OR sh_is_staff()
    );

CREATE POLICY "sh_solution_repos_delete" ON sh_solution_repos
    FOR DELETE USING (
        sh_has_management_access()
        OR sh_is_staff()
    );
