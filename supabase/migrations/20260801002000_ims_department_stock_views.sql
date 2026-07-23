-- Migration: 20260801002000_ims_department_stock_views
-- Purpose:  ims_department_stock_summary and ims_department_item_movements are
--           relied on by lib/services/ims/department-service.ts (getDepartmentStock,
--           getDepartmentSummaries, getDepartmentItemMovements) but were only ever
--           written into the reference SQL bundle supabase/setup/05_views.sql —
--           never captured as an applied migration. Confirmed live: the base
--           tables (ims_stock_issues, ims_department_consumption) exist but these
--           views do not, causing 42P01 "relation does not exist" at runtime.
--           This promotes the existing (already correct) view definitions from
--           setup/05_views.sql into a real migration — no SQL redesigned here.

-- Per-(department, item) aggregated balance.
-- Used by: useImsDepartmentStock (table) and useImsDepartmentSummaries (cards).
CREATE OR REPLACE VIEW ims_department_stock_summary
WITH (security_invoker = true) AS
WITH issued AS (
    SELECT
        si.department_id,
        si.item_id,
        si.store_id,
        si.institution_id,
        SUM(si.quantity)::numeric AS total_issued
    FROM ims_stock_issues si
    GROUP BY si.department_id, si.item_id, si.store_id, si.institution_id
),
consumed AS (
    SELECT
        dc.department_id,
        dc.item_id,
        dc.store_id,
        dc.institution_id,
        SUM(dc.quantity)::numeric AS total_consumed,
        SUM(dc.value)::numeric    AS total_value
    FROM ims_department_consumption dc
    GROUP BY dc.department_id, dc.item_id, dc.store_id, dc.institution_id
)
SELECT
    COALESCE(i.department_id,  c.department_id)  AS department_id,
    COALESCE(i.item_id,        c.item_id)        AS item_id,
    COALESCE(i.store_id,       c.store_id)       AS store_id,
    COALESCE(i.institution_id, c.institution_id) AS institution_id,
    d.department_name,
    it.name        AS item_name,
    it.cost_price  AS item_cost_price,
    COALESCE(i.total_issued,    0) AS total_issued,
    COALESCE(c.total_consumed,  0) AS total_consumed,
    COALESCE(c.total_value,     0) AS total_value,
    (COALESCE(i.total_issued, 0) - COALESCE(c.total_consumed, 0)) AS balance
FROM issued i
FULL OUTER JOIN consumed c
    ON  i.department_id = c.department_id
    AND i.item_id       = c.item_id
    AND COALESCE(i.store_id::text,       '') = COALESCE(c.store_id::text,       '')
    AND COALESCE(i.institution_id::text, '') = COALESCE(c.institution_id::text, '')
LEFT JOIN departments d ON d.id = COALESCE(i.department_id, c.department_id)
LEFT JOIN ims_items   it ON it.id = COALESCE(i.item_id, c.item_id);

-- Chronological event stream for one (department, item) pair.
-- Used by: useImsDepartmentItemMovements (history dialog).
-- 'received' rows come from issues; 'consumed' rows come from consumption.
-- 'returned' is intentionally omitted — no source table exists yet.
CREATE OR REPLACE VIEW ims_department_item_movements
WITH (security_invoker = true) AS
SELECT
    si.id,
    'received'::text   AS type,
    si.quantity,
    si.notes,
    si.created_at,
    si.issued_by       AS created_by_id,
    si.department_id,
    si.item_id,
    si.store_id,
    si.institution_id
FROM ims_stock_issues si
UNION ALL
SELECT
    dc.id,
    'consumed'::text   AS type,
    dc.quantity,
    NULL::text         AS notes,
    dc.created_at,
    NULL::uuid         AS created_by_id,
    dc.department_id,
    dc.item_id,
    dc.store_id,
    dc.institution_id
FROM ims_department_consumption dc;
