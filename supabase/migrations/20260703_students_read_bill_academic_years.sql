-- /learners/my-bills groups bills by the academic year they were raised for.
-- students_view_own_academic_year only exposes the learner's admission-year
-- row, so year names for other billed years silently resolve to nothing.
-- Additive SELECT policy: a student may read the academic_years rows that
-- their own bills reference (name lookup only).

CREATE POLICY "Students can view academic years on their own bills"
ON public.academic_years
FOR SELECT
TO authenticated
USING (
  id IN (
    SELECT b.academic_year_id
    FROM public.billing_student_bills b
    WHERE b.academic_year_id IS NOT NULL
      AND b.student_id IN (
        SELECT lp.id
        FROM public.learners_profiles lp
        JOIN public.profiles p
          ON (p.email = lp.student_email OR p.email = lp.college_email)
        WHERE p.id = auth.uid()
          AND p.role = 'student'
      )
  )
);
