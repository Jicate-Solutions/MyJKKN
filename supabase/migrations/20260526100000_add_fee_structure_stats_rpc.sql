-- ============================================================================
-- get_fee_structure_stats — aggregated KPIs for the fee structures admin page.
-- Returns summary counts, coverage metrics, and financial stats in one call.
-- SECURITY DEFINER to avoid RLS recursion (items → parent → RLS); scoped
-- via role_has_institution_access inside the CTE.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_fee_structure_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH accessible AS (
    SELECT fs.id, fs.status, fs.institution_id
    FROM admission_fee_structures fs
    WHERE role_has_institution_access(fs.institution_id)
  ),
  counts AS (
    SELECT
      count(*)                                          AS total,
      count(*) FILTER (WHERE status = 'active')         AS active,
      count(*) FILTER (WHERE status = 'draft')          AS draft,
      count(*) FILTER (WHERE status = 'archived')       AS archived,
      count(DISTINCT institution_id)                    AS institutions_covered
    FROM accessible
  ),
  per_structure AS (
    SELECT
      a.id,
      COALESCE(SUM(i.amount), 0)                                   AS structure_total,
      COUNT(i.id)                                                   AS item_count,
      COUNT(i.id) FILTER (WHERE i.is_optional)                     AS optional_count,
      COUNT(i.id) FILTER (WHERE NOT i.is_optional)                 AS mandatory_count
    FROM accessible a
    LEFT JOIN admission_fee_structure_items i ON i.fee_structure_id = a.id
    WHERE a.status = 'active'
    GROUP BY a.id
  ),
  financial AS (
    SELECT
      COALESCE(SUM(structure_total), 0)                             AS total_fee_amount,
      COALESCE(AVG(structure_total), 0)                             AS avg_fee,
      COALESCE(MIN(structure_total), 0)                             AS min_fee,
      COALESCE(MAX(structure_total), 0)                             AS max_fee,
      COALESCE(AVG(item_count), 0)                                  AS avg_items,
      COALESCE(SUM(optional_count), 0)                              AS total_optional_items,
      COALESCE(SUM(mandatory_count), 0)                             AS total_mandatory_items,
      count(*) FILTER (WHERE item_count = 0)                        AS empty_structures
    FROM per_structure
  )
  SELECT jsonb_build_object(
    'total',                    c.total,
    'active',                   c.active,
    'draft',                    c.draft,
    'archived',                 c.archived,
    'institutions_covered',     c.institutions_covered,
    'total_fee_amount',         f.total_fee_amount,
    'avg_fee_per_structure',    ROUND(f.avg_fee::numeric, 2),
    'min_fee',                  f.min_fee,
    'max_fee',                  f.max_fee,
    'avg_items_per_structure',  ROUND(f.avg_items::numeric, 1),
    'total_optional_items',     f.total_optional_items,
    'total_mandatory_items',    f.total_mandatory_items,
    'structures_without_items', f.empty_structures
  )
  FROM counts c, financial f;
$$;
