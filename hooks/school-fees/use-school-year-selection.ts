// hooks/school-fees/use-school-year-selection.ts
//
// Shared "which school, which academic year" selection for every school-fee
// screen. Extracted in Phase 4 so the term calendar and the plan grid cannot
// drift apart on the two subtleties below.
//
// 1. entityType MUST be 'school'. useInstitutionsWithAccess defaults to
//    'institution', which lists colleges and hides both schools entirely.
//    BUT that option alone is not enough — see the filter below.
// 2. State holds only what the user EXPLICITLY picked; the defaults are
//    DERIVED. Doing this with effects would mean setState inside useEffect —
//    cascading renders, and what react-hooks/set-state-in-effect rejects.

'use client';

import { useMemo, useState } from 'react';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { useAcademicYearsByInstitution } from '@/hooks/academic/use-academic-years';

export interface SchoolYearOption {
  id: string;
  academic_year_name: string;
  is_active?: boolean;
}

export function useSchoolYearSelection() {
  const { institutions: allInstitutions, loading: loadingInstitutions } =
    useInstitutionsWithAccess({ entityType: 'school' });

  // The `entityType: 'school'` option above is IGNORED for super admins:
  // useInstitutionsWithAccess does `isSuperAdmin ? 'all' : entityType`
  // (hooks/organization/use-institutions-with-access.ts), which is meant to stop
  // the *default* of 'institution' hiding schools from them — but it also
  // discards an explicit request, so the dropdown filled up with colleges,
  // Jicate Solutions and the Main Office.
  //
  // Filtered here rather than in the shared hook: 26 other call sites pass
  // entityType explicitly and would all change behaviour for super admins.
  // Every school-fee table is keyed to a school, so a college chosen here would
  // silently create data nothing can reach.
  const institutions = useMemo(
    () => allInstitutions.filter((i) => i.entity_type === 'school'),
    [allInstitutions],
  );

  const [institutionChoice, setInstitutionChoice] = useState('');
  const [yearChoice, setYearChoice] = useState('');

  // Fall back to the only school the user can reach — the common case for a
  // school-scoped accounts user, who would otherwise face a one-item dropdown
  // before seeing anything at all.
  const institutionId =
    institutionChoice || (institutions.length === 1 ? institutions[0].id : '');

  const { academicYears, loading: loadingYears } = useAcademicYearsByInstitution(
    institutionId || undefined,
  );

  const yearOptions: SchoolYearOption[] = useMemo(
    () =>
      (academicYears as SchoolYearOption[]).map((y) => ({
        id: y.id,
        academic_year_name: y.academic_year_name,
        is_active: y.is_active,
      })),
    [academicYears],
  );

  // Deriving the year also handles switching schools for free: academic_years
  // is per-institution, so a year id carried over from the previous school is
  // simply absent from the new list and falls through to the default. No reset
  // effect needed.
  const academicYearId = useMemo(() => {
    if (yearChoice && yearOptions.some((y) => y.id === yearChoice)) return yearChoice;
    return yearOptions.find((y) => y.is_active)?.id ?? yearOptions[0]?.id ?? '';
  }, [yearChoice, yearOptions]);

  return {
    institutions,
    institutionId,
    setInstitutionChoice,
    yearOptions,
    academicYearId,
    setYearChoice,
    loadingInstitutions,
    loadingYears,
    /** Both chosen — safe to load plans, calendars and learners. */
    ready: Boolean(institutionId && academicYearId),
  };
}
