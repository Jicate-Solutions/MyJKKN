-- Add RLS policy to allow students to view degrees linked to their profile
-- This allows students to see their degree details even if institution_id doesn't match
-- (which can happen with shared degree records or multi-institution setups)

CREATE POLICY "students_view_own_degree"
ON degrees
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM learners_profiles lp
    INNER JOIN profiles p ON p.learner_id = lp.id
    WHERE p.id = auth.uid()
      AND p.role = 'student'
      AND lp.degree_id = degrees.id
  )
);

COMMENT ON POLICY "students_view_own_degree" ON degrees IS
'Allows students to view degrees that are linked to their learner profile, regardless of institution matching';
