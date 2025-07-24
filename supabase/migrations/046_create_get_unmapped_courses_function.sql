-- Function to get courses by institution with optional search
CREATE OR REPLACE FUNCTION get_institution_courses(
  p_institution_id UUID,
  p_search_term TEXT DEFAULT ''
)
RETURNS TABLE (
  id UUID,
  course_name TEXT,
  course_code TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.course_name,
    c.course_code
  FROM
    courses c
  WHERE
    c.institution_id = p_institution_id
    AND (c.is_active = TRUE OR c.is_active IS NULL)
    AND (
      p_search_term IS NULL
      OR p_search_term = ''
      OR c.course_name ILIKE '%' || p_search_term || '%'
      OR c.course_code ILIKE '%' || p_search_term || '%'
    )
  ORDER BY
    c.course_code;
END;
$$ LANGUAGE plpgsql; 