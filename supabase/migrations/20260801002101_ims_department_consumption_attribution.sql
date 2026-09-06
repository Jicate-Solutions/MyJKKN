-- Migration: attribution columns for ims_department_consumption
--
-- The Department Stock page is gaining a "Record Usage" action, which writes
-- consumption rows from the UI for the first time. Until now the table was
-- only ever intended to be populated by (never-built) batch reporting, so it
-- carries no notes or actor columns — the ims_department_item_movements view
-- hardcodes NULL for both on the consumed branch, which would render every
-- usage entry in the History dialog as "by Unknown" with no reason.
--
-- Adds both columns (nullable, so existing rows stay valid) and rebuilds the
-- view to surface them.

ALTER TABLE public.ims_department_consumption
    ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE public.ims_department_consumption
    ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id);

CREATE INDEX IF NOT EXISTS idx_ims_dept_consumption_created_by
    ON public.ims_department_consumption(created_by);

-- Rebuild the movements view so consumed rows carry their notes/actor instead
-- of the NULL placeholders. The issued branch is unchanged.
CREATE OR REPLACE VIEW public.ims_department_item_movements AS
 SELECT si.id,
    'received'::text AS type,
    si.quantity,
    si.notes,
    si.created_at,
    si.issued_by AS created_by_id,
    si.department_id,
    si.item_id,
    si.store_id,
    si.institution_id
   FROM public.ims_stock_issues si
UNION ALL
 SELECT dc.id,
    'consumed'::text AS type,
    dc.quantity,
    dc.notes,
    dc.created_at,
    dc.created_by AS created_by_id,
    dc.department_id,
    dc.item_id,
    dc.store_id,
    dc.institution_id
   FROM public.ims_department_consumption dc;
