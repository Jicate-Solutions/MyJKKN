-- Function to get program count by degree
CREATE OR REPLACE FUNCTION get_programs_by_degree_count(inst_ids UUID[] DEFAULT NULL)
RETURNS TABLE(name TEXT, count BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.degree_name AS name,
    COUNT(p.id)::BIGINT AS count
  FROM
    degrees d
  JOIN
    programs p ON d.id = p.degree_id
  WHERE
    (inst_ids IS NULL OR d.institution_id = ANY(inst_ids))
    AND d.is_active = TRUE
    AND p.is_active = TRUE
  GROUP BY
    d.degree_name
  ORDER BY
    count DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get course count by department
CREATE OR REPLACE FUNCTION get_courses_by_department_count(inst_ids UUID[] DEFAULT NULL)
RETURNS TABLE(name TEXT, count BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.department_name AS name,
    COUNT(DISTINCT cm.course_id)::BIGINT AS count
  FROM
    departments d
  JOIN
    course_mappings cm ON d.id = cm.department_id
  WHERE
    (inst_ids IS NULL OR d.institution_id = ANY(inst_ids))
    AND d.is_active = TRUE
    AND cm.is_active = TRUE
  GROUP BY
    d.department_name
  ORDER BY
    count DESC;
END;
$$ LANGUAGE plpgsql; 