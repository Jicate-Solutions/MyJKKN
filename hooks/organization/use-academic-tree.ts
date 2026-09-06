'use client';

/**
 * Academic hierarchy (Degree → Department → Programme → Semester → Section)
 * for a single institution, loaded ONCE and cascaded in memory.
 *
 * WHY THIS EXISTS
 * The previous filter panel fetched each level from its own service inside its
 * own useEffect, with no cache. Picking an institution therefore cost a strict
 * five-request waterfall (degrees → departments → programmes → semesters →
 * sections), and every re-open paid it again from scratch.
 *
 * The whole tree is small enough that this is unnecessary: across ALL ten
 * institutions it is 1,403 rows (18 degrees, 89 departments, 128 programmes,
 * 550 semesters, 618 sections). The largest single institution is 305 rows.
 * Every one of these tables also carries the full set of ancestor FKs
 * (sections has degree_id, department_id, program_id AND semester_id), so once
 * the rows are in memory the cascade needs no further queries and no joins —
 * just Map lookups.
 *
 * Net effect: five sequential round trips become five PARALLEL ones on first
 * open (~one round trip of wall clock), then zero for the rest of the session.
 */

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { queryKeys } from '@/lib/query/query-keys';
import { getErrorMessage } from '@/lib/utils';

export interface AcademicOption {
  value: string;
  label: string;
}

/** The institution-scoped tables this hook reads. All six carry institution_id. */
type OrgTable =
  | 'degrees'
  | 'departments'
  | 'programs'
  | 'semesters'
  | 'sections'
  | 'academic_years';

interface DegreeRow {
  id: string;
  degree_name: string | null;
  display_name: string | null;
}
interface DepartmentRow {
  id: string;
  department_name: string | null;
  display_name: string | null;
  degree_id: string | null;
}
interface ProgramRow {
  id: string;
  program_name: string | null;
  display_name: string | null;
  degree_id: string | null;
  department_id: string | null;
}
interface SemesterRow {
  id: string;
  semester_name: string | null;
  semester_code: string | null;
  program_id: string | null;
}
interface SectionRow {
  id: string;
  section_name: string | null;
  semester_id: string | null;
}
interface AcademicYearRow {
  id: string;
  academic_year_name: string | null;
  start_date: string | null;
}

export interface AcademicTree {
  degrees: DegreeRow[];
  departments: DepartmentRow[];
  programs: ProgramRow[];
  semesters: SemesterRow[];
  sections: SectionRow[];
  academicYears: AcademicYearRow[];
}

const EMPTY_TREE: AcademicTree = {
  degrees: [],
  departments: [],
  programs: [],
  semesters: [],
  sections: [],
  academicYears: [],
};

/**
 * Load the entire academic tree for one institution.
 *
 * Every table is scoped by institution_id directly (all five carry the column,
 * 100% populated), so these five queries are independent and run in parallel.
 */
export function useAcademicTree(institutionId?: string) {
  return useQuery<AcademicTree>({
    queryKey: queryKeys.academicTree.byInstitution(institutionId ?? 'none'),
    // Never let an undefined id reach PostgREST — `.eq(col, undefined)`
    // serialises as the literal string "undefined" and errors with 22P02.
    enabled: Boolean(institutionId),
    // Org structure is near-static. Re-opening the filter panel, switching tabs
    // or navigating back must not re-fetch it.
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<AcademicTree> => {
      const supabase = createClientSupabaseClient();

      // `as any` on the builder is deliberate: passing a parameterised table
      // name to the generated Database types blows the instantiation depth
      // limit (TS2589) and fails the literal-union overload on .from(). The
      // row shape is asserted by the <T> callers instead.
      const scoped = async <T>(table: OrgTable, columns: string): Promise<T[]> => {
        const { data, error } = await (supabase.from(table) as any)
          .select(columns)
          .eq('institution_id', institutionId as string)
          .eq('is_active', true);

        // Supabase errors are plain objects, not Error instances — surface the
        // real code/message rather than letting a null result look like "no data".
        if (error) {
          throw new Error(
            `Failed to load academic hierarchy (${table}): ${getErrorMessage(error)}`
          );
        }
        return (data ?? []) as T[];
      };

      const [degrees, departments, programs, semesters, sections, academicYears] =
        await Promise.all([
          scoped<DegreeRow>('degrees', 'id, degree_name, display_name'),
          scoped<DepartmentRow>(
            'departments',
            'id, department_name, display_name, degree_id'
          ),
          scoped<ProgramRow>(
            'programs',
            'id, program_name, display_name, degree_id, department_id'
          ),
          scoped<SemesterRow>(
            'semesters',
            'id, semester_name, semester_code, program_id'
          ),
          scoped<SectionRow>('sections', 'id, section_name, semester_id'),
          // Matches the previous AcademicYearService.getAcademicYearsByInstitution
          // default, which filtered is_active=true.
          scoped<AcademicYearRow>(
            'academic_years',
            'id, academic_year_name, start_date'
          ),
        ]);

      return { degrees, departments, programs, semesters, sections, academicYears };
    },
  });
}

export interface CascadeSelection {
  degree_id?: string;
  department_id?: string;
  program_id?: string;
  semester_id?: string;
}

export interface CascadeOptions {
  degrees: AcademicOption[];
  departments: AcademicOption[];
  programs: AcademicOption[];
  semesters: AcademicOption[];
  sections: AcademicOption[];
  /** Institution-scoped only — academic years are not part of the cascade. */
  academicYears: AcademicOption[];
  isLoading: boolean;
  error: Error | null;
}

const byLabel = (a: AcademicOption, b: AcademicOption) =>
  a.label.localeCompare(b.label, undefined, { numeric: true });

/**
 * Options for each level, derived from the cached tree and the current
 * selection. Pure in-memory filtering — changing a dropdown issues no request.
 */
export function useAcademicCascade(
  institutionId: string | undefined,
  selection: CascadeSelection
): CascadeOptions {
  const { data, isLoading, error } = useAcademicTree(institutionId);
  const tree = data ?? EMPTY_TREE;

  const { degree_id, department_id, program_id, semester_id } = selection;

  return useMemo(() => {
    const degrees = tree.degrees
      .map((d) => ({ value: d.id, label: d.display_name || d.degree_name || '—' }))
      .sort(byLabel);

    const departments = tree.departments
      .filter((d) => !degree_id || d.degree_id === degree_id)
      .map((d) => ({
        value: d.id,
        label: d.display_name || d.department_name || '—',
      }))
      .sort(byLabel);

    const programs = tree.programs
      .filter((p) => !degree_id || p.degree_id === degree_id)
      .filter((p) => !department_id || p.department_id === department_id)
      .map((p) => ({
        value: p.id,
        label: p.display_name || p.program_name || '—',
      }))
      .sort(byLabel);

    const semesters = tree.semesters
      .filter((s) => !program_id || s.program_id === program_id)
      .map((s) => ({ value: s.id, label: s.semester_name || s.semester_code || '—' }))
      .sort(byLabel);

    const sections = tree.sections
      .filter((s) => !semester_id || s.semester_id === semester_id)
      .map((s) => ({ value: s.id, label: s.section_name || '—' }))
      .sort(byLabel);

    // Most recent year first — the one people almost always want.
    const academicYears = tree.academicYears
      .map((a) => ({ value: a.id, label: a.academic_year_name || '—' }))
      .sort((a, b) => byLabel(b, a));

    return {
      degrees,
      departments,
      programs,
      semesters,
      sections,
      academicYears,
      isLoading,
      error: (error as Error) ?? null,
    };
  }, [tree, degree_id, department_id, program_id, semester_id, isLoading, error]);
}
