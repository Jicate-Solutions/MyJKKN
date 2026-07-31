'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { AcademicYearService } from '@/lib/services/academic/academic-year-service';
import { DegreeService } from '@/lib/services/organization/degree-service';
import { DepartmentService } from '@/lib/services/organization/department-service';
import { ProgramService } from '@/lib/services/organization/program-service';
import { SemesterService } from '@/lib/services/organization/semester-service';
import { SectionService } from '@/lib/services/organization/section-service';
import { BillingCategoryService } from '@/lib/services/billing/categories/billing-category-service';

export interface HierarchyOption {
  id: string;
  name: string;
}

export interface HierarchySelection {
  institution_id?: string;
  degree_id?: string;
  department_id?: string;
  program_id?: string;
  semester_id?: string;
}

/** Clearing a level must clear everything below it, or the query filters on a
 *  child that no longer belongs to the newly-chosen parent. */
export const CASCADE_CLEAR_MAP: Record<string, string[]> = {
  institution_id: ['degree_id', 'department_id', 'program_id', 'semester_id', 'section_id', 'academic_year_id'],
  degree_id: ['department_id', 'program_id', 'semester_id', 'section_id'],
  department_id: ['program_id', 'semester_id', 'section_id'],
  program_id: ['semester_id', 'section_id'],
  semester_id: ['section_id'],
};

const pick = (row: any): HierarchyOption => ({
  id: row.id,
  name:
    row.name ??
    row.degree_name ??
    row.department_name ??
    row.program_name ??
    row.semester_name ??
    row.section_name ??
    row.category_name ??
    row.academic_year_name ??
    'Unknown',
});

function useLevel(
  parentId: string | undefined,
  load: (id: string) => Promise<any[]>
) {
  const [options, setOptions] = useState<HierarchyOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!parentId) {
      setOptions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    load(parentId)
      .then((rows) => {
        if (!cancelled) setOptions((rows ?? []).map(pick));
      })
      .catch((err) => {
        console.error('[hierarchy-filters] level load failed:', err);
        if (!cancelled) setOptions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // `load` is a module-level service method; stable by construction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentId]);

  return { options, loading };
}

export function useAcademicHierarchyFilters(sel: HierarchySelection) {
  const { institutions: accessible, loading: loadingInstitutions } =
    useInstitutionsWithAccess({ isActive: true });

  const academicYears = useLevel(sel.institution_id, (id) =>
    AcademicYearService.getAcademicYearsByInstitution(id)
  );
  const degrees = useLevel(sel.institution_id, (id) =>
    DegreeService.getDegreesByInstitution(id)
  );
  const departments = useLevel(sel.degree_id, (id) =>
    DepartmentService.getDepartmentsByDegree(id)
  );
  const programs = useLevel(sel.department_id, (id) =>
    ProgramService.getProgramsByDepartment(id)
  );
  const semesters = useLevel(sel.program_id, (id) =>
    SemesterService.getSemestersByProgram(id)
  );
  const sections = useLevel(sel.semester_id, (id) =>
    SectionService.getSectionsBySemester(id)
  );

  const [categories, setCategories] = useState<HierarchyOption[]>([]);
  useEffect(() => {
    let cancelled = false;
    // getActiveBillingCategories, NOT getBillingCategories — the latter
    // defaults to limit=10 and there are 17 active categories.
    BillingCategoryService.getActiveBillingCategories()
      .then((rows) => {
        if (!cancelled) setCategories((rows ?? []).map(pick));
      })
      .catch((err) => console.error('[hierarchy-filters] categories failed:', err));
    return () => {
      cancelled = true;
    };
  }, []);

  const institutions = useMemo<HierarchyOption[]>(
    () => accessible.map((i) => ({ id: i.id, name: i.name })),
    [accessible]
  );

  /** Returns the patch to apply when `key` changes: the new value plus every
   *  descendant cleared. Callers merge it into their filter state in one update. */
  const cascadeClear = useCallback(
    (key: string, value: string | undefined): Record<string, string | undefined> => {
      const patch: Record<string, string | undefined> = { [key]: value };
      for (const child of CASCADE_CLEAR_MAP[key] ?? []) patch[child] = undefined;
      return patch;
    },
    []
  );

  return {
    institutions,
    hasMultiInstitutionAccess: accessible.length > 1,
    academicYears: academicYears.options,
    degrees: degrees.options,
    departments: departments.options,
    programs: programs.options,
    semesters: semesters.options,
    sections: sections.options,
    categories,
    loading: {
      institutions: loadingInstitutions,
      academicYears: academicYears.loading,
      degrees: degrees.loading,
      departments: departments.loading,
      programs: programs.loading,
      semesters: semesters.loading,
      sections: sections.loading,
    },
    cascadeClear,
  };
}
