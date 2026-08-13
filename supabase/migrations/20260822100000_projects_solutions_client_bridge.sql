-- 2026-08-12: Bridge the Solutions Hub to the PM Projects module.
-- Until now sh_clients / sh_solutions and public.projects had no link at all:
-- a client's page could not show its projects, team, or task status, and a
-- project could not say which client it is delivered for. Both columns are
-- nullable — internal projects stay client-less.
-- ON DELETE SET NULL: removing a client/solution must never delete or block
-- the project row; it just becomes unlinked.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.sh_clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS solution_id uuid REFERENCES public.sh_solutions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_projects_client
  ON public.projects(client_id) WHERE client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_projects_solution
  ON public.projects(solution_id) WHERE solution_id IS NOT NULL;

COMMENT ON COLUMN public.projects.client_id IS
  'Solutions Hub client (sh_clients) this project is delivered for. Null = internal project.';
COMMENT ON COLUMN public.projects.solution_id IS
  'Solutions Hub solution (sh_solutions) this project delivers. Null = not solution-linked.';
