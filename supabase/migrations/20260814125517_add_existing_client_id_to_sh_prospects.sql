-- Add existing_client_id to sh_prospects
--
-- The Solutions Hub prospects service has referenced sh_prospects.existing_client_id
-- (repeat-business link back to sh_clients) since the first production ship of the
-- module (jicate/main 2fee21bd98, PR #162), but no migration ever created the column.
-- PostgREST therefore rejects every prospects query that embeds
-- existing_client:sh_clients!existing_client_id (PGRST200) or filters on the column
-- (42703), and GET /api/solutions/prospects has returned HTTP 500 since day one --
-- including the client page's Pipeline History card.
--
-- ON DELETE SET NULL matches the sibling converted_client_id FK convention on this table.

ALTER TABLE public.sh_prospects
  ADD COLUMN IF NOT EXISTS existing_client_id uuid REFERENCES public.sh_clients(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.sh_prospects.existing_client_id IS
  'Repeat business: the existing client this prospect/opportunity belongs to (distinct from converted_client_id, which records the client this prospect became on conversion).';

CREATE INDEX IF NOT EXISTS idx_sh_prospects_existing_client_id
  ON public.sh_prospects(existing_client_id);

-- Make the new FK relationship visible to PostgREST immediately
-- (Supabase usually auto-reloads on DDL; the explicit notify removes the ambiguity).
NOTIFY pgrst, 'reload schema';
