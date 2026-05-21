// ============================================
// COURSE SELECTION FORM SECTION
// ============================================
// Created: 2025-01-18
// Updated: 2025-01-19 - Added complete admission form fields
// Purpose: Academic program and semester selection
// Changes:
// - Added Quota field (moved from Academic Information tab). Community is
//   collected on the Basic Details tab; the redundant "Category" dropdown
//   that lived here was removed 2026-05-07 along with the underlying column.
// - Added Entry Type (required); Academic Year + Section relaxed to optional
//   2026-05-21 — counsellors set those during onboarding, not on enquiry capture.
// - Added Roll Number, College Email, Register Number (optional)
// - Added Regulation and Batch fields (optional)
// - Matches admissions form structure completely
// ============================================

import { useEffect, useMemo } from 'react';
import { UseFormReturn } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Info } from 'lucide-react';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { useDegrees } from '@/hooks/organization/use-degrees';
import { useDepartments } from '@/hooks/organization/use-departments';
import { usePrograms } from '@/hooks/organization/use-programs';
import { useSemesters } from '@/hooks/organization/use-semesters';
import { useSections } from '@/hooks/organization/use-sections';
import { useAcademicYearsByInstitution } from '@/hooks/academic/use-academic-years';
import { useQuery } from '@tanstack/react-query';
import { AcademicYearService } from '@/lib/services/academic/academic-year-service';
import { DegreeService } from '@/lib/services/organization/degree-service';
import { DepartmentService } from '@/lib/services/organization/department-service';
import { ProgramService } from '@/lib/services/organization/program-service';
import { SemesterService } from '@/lib/services/organization/semester-service';
import { SectionService } from '@/lib/services/organization/section-service';
import { useRegulations } from '@/hooks/academic/use-regulations';
import { useBatches } from '@/hooks/academic/use-batches';
import type { Degree, Department, Program, Semester, Section } from '@/types/organizations';
import type { AcademicYear, Regulation, Batch } from '@/types/academics';
import { ENTRY_TYPE_OPTIONS, QUOTA_OPTIONS } from '@/lib/constants/learner-dropdown-values';
import { AdmissionYearSelect } from '@/components/admission/admission-year-select';

interface CourseSelectionProps {
  form: UseFormReturn<any>;
  showLearnerType?: boolean;
}

export function CourseSelectionSection({ form, showLearnerType = false }: CourseSelectionProps) {
  // Watch selections for cascading filters
  const watchedInstitutionId = form.watch('institution_id');
  const watchedDegreeId = form.watch('degree_id');
  const watchedDepartmentId = form.watch('department_id');
  const watchedProgramId = form.watch('program_id');
  const watchedSemesterId = form.watch('semester_id');
  // 2026-05-21: watched so the SH-department engineering-first-year rule
  // can react to entry-type changes (filter departments + clear stale pick).
  const watchedEntryType = form.watch('entry_type');

  // Fetch organizations data with hierarchical filtering
  const { institutions } = useInstitutionsWithAccess();

  // Degrees - filtered by institution
  const { data: degreesData, isLoading: loadingDegrees } = useDegrees({
    institution_id: watchedInstitutionId || undefined,
  });

  // Departments - filtered by degree
  const { data: departmentsData, isLoading: loadingDepartments } = useDepartments({
    degree_id: watchedDegreeId || undefined,
  });

  // Programs - filtered by department (only fetch if department is selected)
  const { data: programsData, isLoading: loadingPrograms } = usePrograms({
    department_id: watchedDepartmentId || undefined,
  });

  // Semesters - filtered by program (only fetch if program is selected)
  const { data: semestersData, isLoading: loadingSemesters } = useSemesters({
    program_id: watchedProgramId || undefined,
  });

  // Fetch academic data (institution-dependent)
  const { academicYears, loading: loadingAcademicYears } = useAcademicYearsByInstitution(watchedInstitutionId);
  const { regulations, loading: loadingRegulations, updateFilters: updateRegulationFilters } = useRegulations({ institution_id: watchedInstitutionId || undefined });
  const { batches, loading: loadingBatches, updateFilters: updateBatchFilters } = useBatches({ institution_id: watchedInstitutionId || undefined });

  // Sync regulation/batch filters when institution changes (useState in hooks ignores prop updates after mount)
  useEffect(() => {
    updateRegulationFilters({ institution_id: watchedInstitutionId || undefined });
  }, [watchedInstitutionId, updateRegulationFilters]);

  useEffect(() => {
    updateBatchFilters({ institution_id: watchedInstitutionId || undefined });
  }, [watchedInstitutionId, updateBatchFilters]);

  // Fetch sections (semester + institution dependent)
  const { data: sectionsData, isLoading: loadingSections } = useSections({
    semester_id: watchedSemesterId || undefined,
    institution_id: watchedInstitutionId || undefined,
  });

  // Extract data arrays from React Query results and merge with current selections
  const filteredDegrees = degreesData?.data || [];
  const currentDegreeInFiltered = filteredDegrees.find((d: Degree) => d.id === watchedDegreeId);

  // If degree not in filtered list, fetch it directly by ID
  const { data: specificDegree } = useQuery({
    queryKey: ['degree', watchedDegreeId],
    queryFn: () => DegreeService.getDegree(watchedDegreeId),
    enabled: !!watchedDegreeId && !currentDegreeInFiltered,
  });

  const currentDegreeToUse = currentDegreeInFiltered || specificDegree;
  const degrees = currentDegreeToUse && !filteredDegrees.find((d: Degree) => d.id === watchedDegreeId)
    ? [currentDegreeToUse, ...filteredDegrees]
    : filteredDegrees;

  console.log('[course-selection] Degree Debug:', {
    watchedInstitutionId,
    watchedDegreeId,
    filteredDegreesCount: filteredDegrees.length,
    currentDegreeInFiltered,
    specificDegree,
    currentDegreeToUse,
    finalDegreesCount: degrees.length,
    loadingDegrees
  });

  const filteredDepartments = departmentsData?.data || [];
  const currentDepartmentInFiltered = filteredDepartments.find((d: Department) => d.id === watchedDepartmentId);

  // If department not in filtered list, fetch it directly by ID
  const { data: specificDepartment } = useQuery({
    queryKey: ['department', watchedDepartmentId],
    queryFn: () => DepartmentService.getDepartment(watchedDepartmentId),
    enabled: !!watchedDepartmentId && !currentDepartmentInFiltered,
  });

  const currentDepartmentToUse = currentDepartmentInFiltered || specificDepartment;
  const departments = currentDepartmentToUse && !filteredDepartments.find((d: Department) => d.id === watchedDepartmentId)
    ? [currentDepartmentToUse, ...filteredDepartments]
    : filteredDepartments;

  // ──────────────────────────────────────────────────────────────────────
  // Engineering-college first-year department filter (2026-05-21)
  // ──────────────────────────────────────────────────────────────────────
  // JKKN College of Engineering and Technology (and any future institution
  // that follows the same convention) routes ALL first-year learners
  // through the Science and Humanities ('SH') department. For lateral
  // entry and later admissions, students go straight into their branch
  // department — SH should NOT be selectable.
  //
  // Detection: any department with department_code='SH' belongs to the
  //            institution → trigger the rule. No institution_type check
  //            (that column is funding model, not discipline).
  // Activation:
  //   - entry_type === 'FIRST YEAR' → show ONLY SH dept
  //   - entry_type set, NOT FIRST YEAR → HIDE SH dept
  //   - entry_type unset → also hide SH (SH only makes sense when
  //     entry_type is committed to FIRST YEAR)
  const institutionHasShDept = departments.some(
    (d: Department) => d.department_code === 'SH',
  );
  const restrictToSh = institutionHasShDept && watchedEntryType === 'FIRST YEAR';
  const hideSh = institutionHasShDept && watchedEntryType !== 'FIRST YEAR';
  const displayedDepartments = useMemo(() => {
    if (!institutionHasShDept) return departments;
    if (restrictToSh) return departments.filter((d: Department) => d.department_code === 'SH');
    if (hideSh) return departments.filter((d: Department) => d.department_code !== 'SH');
    return departments;
  }, [departments, restrictToSh, hideSh, institutionHasShDept]);

  console.log('[course-selection] Department Debug:', {
    watchedDegreeId,
    watchedDepartmentId,
    filteredDepartmentsCount: filteredDepartments.length,
    currentDepartmentInFiltered,
    specificDepartment,
    currentDepartmentToUse,
    finalDepartmentsCount: departments.length,
    loadingDepartments
  });

  // Programs - with fallback fetch for edit mode
  const filteredPrograms = programsData?.data || [];
  const currentProgramInFiltered = filteredPrograms.find((p: Program) => p.id === watchedProgramId);

  const { data: specificProgram } = useQuery({
    queryKey: ['program', watchedProgramId],
    queryFn: () => ProgramService.getProgram(watchedProgramId),
    enabled: !!watchedProgramId && !currentProgramInFiltered,
  });

  const currentProgramToUse = currentProgramInFiltered || specificProgram;
  const programs = currentProgramToUse && !filteredPrograms.find((p: Program) => p.id === watchedProgramId)
    ? [currentProgramToUse, ...filteredPrograms]
    : filteredPrograms;

  // Semesters - with fallback fetch for edit mode
  const filteredSemesters = semestersData?.data || [];
  const currentSemesterInFiltered = filteredSemesters.find((s: Semester) => s.id === watchedSemesterId);

  const { data: specificSemester } = useQuery({
    queryKey: ['semester', watchedSemesterId],
    queryFn: () => SemesterService.getSemester(watchedSemesterId),
    enabled: !!watchedSemesterId && !currentSemesterInFiltered,
  });

  const currentSemesterToUse = currentSemesterInFiltered || specificSemester;
  const semesters = currentSemesterToUse && !filteredSemesters.find((s: Semester) => s.id === watchedSemesterId)
    ? [currentSemesterToUse, ...filteredSemesters]
    : filteredSemesters;

  // Sections - with fallback fetch for edit mode
  const watchedSectionId = form.watch('section_id');
  const filteredSections = sectionsData?.data || [];
  const currentSectionInFiltered = filteredSections.find((s: Section) => s.id === watchedSectionId);

  const { data: specificSection } = useQuery({
    queryKey: ['section', watchedSectionId],
    queryFn: () => SectionService.getSection(watchedSectionId),
    enabled: !!watchedSectionId && !currentSectionInFiltered,
  });

  const currentSectionToUse = currentSectionInFiltered || specificSection;
  const sections = currentSectionToUse && !filteredSections.find((s: Section) => s.id === watchedSectionId)
    ? [currentSectionToUse, ...filteredSections]
    : filteredSections;

  // Filter active academic years and include current selection if not in filtered list
  const watchedAcademicYearId = form.watch('academic_year_id');

  // First, check if current selection exists in institution-filtered list
  const currentYearInFiltered = academicYears?.find((y: AcademicYear) => y.id === watchedAcademicYearId);

  // If not in filtered list, fetch it directly by ID
  const { data: specificAcademicYear } = useQuery({
    queryKey: ['academic-year', watchedAcademicYearId],
    queryFn: () => AcademicYearService.getAcademicYear(watchedAcademicYearId),
    enabled: !!watchedAcademicYearId && !currentYearInFiltered, // Only fetch if we have an ID and it's not in the filtered list
  });

  // Filter for active years
  const filteredAcademicYears = academicYears?.filter((year: AcademicYear) => year.is_active) || [];

  // Determine which year to use: from filtered list or fetched specifically
  const currentAcademicYearToUse = currentYearInFiltered || specificAcademicYear;

  // If current year exists but is not active or not in filtered list, still include it
  const activeAcademicYears = currentAcademicYearToUse && !filteredAcademicYears.find((y: AcademicYear) => y.id === watchedAcademicYearId)
    ? [currentAcademicYearToUse, ...filteredAcademicYears]
    : filteredAcademicYears;

  console.log('[course-selection] Academic Year Debug:', {
    watchedInstitutionId,
    watchedAcademicYearId,
    academicYearsCount: academicYears?.length || 0,
    academicYearsData: academicYears,
    currentYearInFiltered,
    specificAcademicYear,
    currentAcademicYearToUse,
    filteredAcademicYearsCount: filteredAcademicYears.length,
    filteredAcademicYearsData: filteredAcademicYears,
    finalAcademicYearsCount: activeAcademicYears.length,
    finalAcademicYearsData: activeAcademicYears,
    loadingAcademicYears
  });

  return (
    <div className="space-y-6">
      {/* Quota */}
      <div className="space-y-4 pb-4 border-b">
        <h3 className="text-lg font-semibold">Quota</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="quota"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Quota</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || ''}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select quota" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {QUOTA_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>

      {/* Course Selection */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Course Selection</h3>
        <div className="grid gap-4 md:grid-cols-2">
          {/* Institution */}
          <FormField
          control={form.control}
          name="institution_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Institution <span className="text-red-500">*</span>
              </FormLabel>
              <Select
                onValueChange={(value) => {
                  const oldValue = field.value;
                  field.onChange(value);
                  // Only reset dependent fields if institution is actually changing (not initial load)
                  if (oldValue && oldValue !== value) {
                    form.setValue('degree_id', '');
                    form.setValue('department_id', '');
                    form.setValue('program_id', '');
                  }
                }}
                value={field.value || ''}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select institution" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {institutions?.map((inst) => (
                    <SelectItem key={inst.id} value={inst.id}>
                      {inst.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Degree */}
        <FormField
          control={form.control}
          name="degree_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Degree <span className="text-red-500">*</span></FormLabel>
              <Select
                onValueChange={(value) => {
                  const oldValue = field.value;
                  field.onChange(value);
                  // Only reset dependent fields if degree is actually changing (not initial load)
                  if (oldValue && oldValue !== value) {
                    form.setValue('department_id', '');
                    form.setValue('program_id', '');
                  }
                }}
                value={field.value || ''}
                disabled={!watchedInstitutionId || loadingDegrees}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select degree" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {loadingDegrees ? (
                    <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                      Loading...
                    </div>
                  ) : degrees.length > 0 ? (
                    degrees.map((deg: Degree) => (
                      <SelectItem key={deg.id} value={deg.id}>
                        {deg.degree_name}
                      </SelectItem>
                    ))
                  ) : (
                    <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                      No degrees available
                    </div>
                  )}
                </SelectContent>
              </Select>
              <FormDescription>
                The degree program
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Engineering-first-year info banner — shown when the SH-dept rule
         *  is actively filtering the department list. */}
        {restrictToSh && (
          <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="leading-relaxed">
              <p className="font-medium">First-year — Science &amp; Humanities only</p>
              <p className="mt-0.5 text-blue-800/90 dark:text-blue-300/90">
                First-year learners at this institution enrol under Science &amp;
                Humanities. Only that department + its programmes are selectable.
              </p>
            </div>
          </div>
        )}
        {hideSh && watchedEntryType && (
          <div className="flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="leading-relaxed">
              <p className="font-medium">Branch-department admission</p>
              <p className="mt-0.5 text-slate-700/90 dark:text-slate-300/90">
                Lateral entry and later admissions skip the Science &amp;
                Humanities first-year track. Only branch departments are shown.
              </p>
            </div>
          </div>
        )}

        {/* Department */}
        <FormField
          control={form.control}
          name="department_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Department <span className="text-red-500">*</span></FormLabel>
              <Select
                onValueChange={(value) => {
                  const oldValue = field.value;
                  field.onChange(value);
                  // Only reset dependent field if department is actually changing (not initial load)
                  if (oldValue && oldValue !== value) {
                    form.setValue('program_id', '');
                  }
                }}
                value={field.value || ''}
                disabled={!watchedDegreeId || loadingDepartments}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {loadingDepartments ? (
                    <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                      Loading...
                    </div>
                  ) : displayedDepartments.length > 0 ? (
                    displayedDepartments.map((dept: Department) => (
                      <SelectItem key={dept.id} value={dept.id}>
                        {dept.department_name}
                      </SelectItem>
                    ))
                  ) : (
                    <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                      No departments available
                    </div>
                  )}
                </SelectContent>
              </Select>
              <FormDescription>
                The academic department
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Entry Type */}
        <FormField
          control={form.control}
          name="entry_type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Entry Type <span className="text-red-500">*</span></FormLabel>
              <Select
                onValueChange={(value) => {
                  field.onChange(value);

                  // 2026-05-21: SH-dept first-year rule — if the entry-type
                  // change makes the currently-picked department invalid,
                  // clear it (and program_id, which cascades from it) so
                  // the user re-picks from the now-filtered list.
                  if (institutionHasShDept && watchedDepartmentId) {
                    const currentDept = departments.find(
                      (d: Department) => d.id === watchedDepartmentId,
                    );
                    if (currentDept) {
                      const into1Y =
                        value === 'FIRST YEAR' &&
                        currentDept.department_code !== 'SH';
                      const outOf1Y =
                        value !== 'FIRST YEAR' &&
                        currentDept.department_code === 'SH';
                      if (into1Y) {
                        form.setValue('department_id', '');
                        form.setValue('program_id', '');
                        toast(
                          'First-year admissions at this institution belong to Science and Humanities — please re-pick the department.',
                          { duration: 6000, icon: 'ℹ️' },
                        );
                      } else if (outOf1Y) {
                        form.setValue('department_id', '');
                        form.setValue('program_id', '');
                        toast(
                          'Lateral entry and later admissions belong to the branch department — please re-pick the department.',
                          { duration: 6000, icon: 'ℹ️' },
                        );
                      }
                    }
                  }

                  // Auto-pick semester based on entry type. Fires only on
                  // user-initiated change (not on initial form load), so a
                  // manually-picked semester from an existing lead is not
                  // overwritten when the form first hydrates.
                  //
                  //   FIRST YEAR     → semester with initial_semester=true,
                  //                    else lowest semester_order.
                  //   LATERAL ENTRY  → For year-based programs (PharmD, BDS,
                  //                    BSc-NS, etc.) pick Year 2 (semester_order=2).
                  //                    For semester-based programs (CSE, MBA, BPharm)
                  //                    pick Semester III (semester_order=3). Detect
                  //                    program type by checking whether the first
                  //                    semester's name contains "Year".
                  if (semesters.length === 0) return;
                  const sorted = [...semesters].sort(
                    (a: any, b: any) => (a.semester_order ?? 0) - (b.semester_order ?? 0)
                  );
                  if (value === 'FIRST YEAR') {
                    const target = sorted.find((s: any) => s.initial_semester === true) ?? sorted[0];
                    if (target?.id) form.setValue('semester_id', target.id);
                  } else if (value === 'LATERAL ENTRY') {
                    const isYearBased = /year/i.test((sorted[0] as any)?.semester_name ?? '');
                    const targetOrder = isYearBased ? 2 : 3;
                    const target =
                      sorted.find((s: any) => s.semester_order === targetOrder) ??
                      sorted[isYearBased ? 1 : 2];
                    if (target?.id) form.setValue('semester_id', target.id);
                  }
                  // For RE-ADMISSION / COLLEGE TRANSFER we deliberately don't
                  // auto-pick — those students choose their semester manually.
                }}
                value={field.value || ''}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select entry type" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {ENTRY_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>
                Type of entry into the course. First Year and Lateral Entry will
                auto-pick the appropriate semester.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Learner Type - OPTIONAL, admin edit only */}
        {showLearnerType && (
          <FormField
            control={form.control}
            name="learner_type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Learner Type</FormLabel>
                <Select onValueChange={field.onChange} value={field.value || ''}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select learner type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="regular">Regular</SelectItem>
                    <SelectItem value="irregular">Irregular</SelectItem>
                    <SelectItem value="intern">Intern</SelectItem>
                  </SelectContent>
                </Select>
                <FormDescription>
                  Classification of the learner (optional)
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {/* Program */}
        <FormField
          control={form.control}
          name="program_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Program <span className="text-red-500">*</span>
              </FormLabel>
              <Select
                onValueChange={(value) => {
                  const oldValue = field.value;
                  field.onChange(value);
                  // Auto-fill department_id from the picked program. Each program
                  // is FK'd to exactly one department, so the department is
                  // unambiguously determined by the program. This is mainly a
                  // self-healing safeguard: if a saved lead has program_id but
                  // a missing/wrong department_id, picking (or re-picking) the
                  // program rebinds the department correctly. The current UI
                  // still gates Programs behind Department selection, so this
                  // is usually a no-op — but it makes the data shape consistent.
                  const picked = programs.find((p: Program) => p.id === value);
                  const pickedDeptId = (picked as any)?.department_id;
                  if (pickedDeptId && pickedDeptId !== watchedDepartmentId) {
                    form.setValue('department_id', pickedDeptId);
                  }
                  // Only reset dependent fields if program is actually changing (not initial load)
                  if (oldValue && oldValue !== value) {
                    form.setValue('semester_id', '');
                    form.setValue('section_id', '');
                    // 2026-04-23: clear admission_year selection too — old
                    // cohort row is scoped to the previous program and would
                    // be rejected by the DB scope-validator trigger on save.
                    form.setValue('admission_year_id', '');
                    form.setValue('admission_year', undefined);
                  }
                }}
                value={field.value || ''}
                disabled={!watchedDepartmentId || loadingPrograms}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select program" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {loadingPrograms ? (
                    <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                      Loading...
                    </div>
                  ) : programs.length > 0 ? (
                    programs.map((prog: Program) => (
                      <SelectItem key={prog.id} value={prog.id}>
                        {prog.program_name}
                      </SelectItem>
                    ))
                  ) : (
                    <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                      No programs available
                    </div>
                  )}
                </SelectContent>
              </Select>
              <FormDescription>
                The specific program (required)
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Admission Year — cohort window for this learner's (institution, program).
            Added here 2026-04-23 to sit next to Institution/Program where it
            belongs semantically. Replaces the disconnected hardcoded year
            dropdown that lived in Basic Details. The picker also writes the
            legacy `admission_year` integer (= program_start_year) on the form
            so the 6 B2A endpoints that still expose it keep working. */}
        <FormField
          control={form.control}
          name="admission_year_id"
          render={({ field }) => (
            <FormItem>
              <AdmissionYearSelect
                institutionId={watchedInstitutionId}
                programId={watchedProgramId}
                value={field.value || ''}
                onChange={(id, row) => {
                  field.onChange(id);
                  // Sync the legacy integer column for B2A back-compat.
                  form.setValue('admission_year', row?.program_start_year ?? null);
                }}
                label="Admission Year"
                placeholderNoProgram="Select program first"
              />
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Academic Year */}
        <FormField
          control={form.control}
          name="academic_year_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Academic Year</FormLabel>
              <Select
                onValueChange={field.onChange}
                value={field.value || ''}
                disabled={!watchedInstitutionId || loadingAcademicYears}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select academic year" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {loadingAcademicYears ? (
                    <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                      Loading...
                    </div>
                  ) : activeAcademicYears.length > 0 ? (
                    activeAcademicYears.map((year: AcademicYear) => (
                      <SelectItem key={year.id} value={year.id}>
                        {year.academic_year_name}
                      </SelectItem>
                    ))
                  ) : (
                    <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                      No academic years available
                    </div>
                  )}
                </SelectContent>
              </Select>
              <FormDescription>
                The academic year for admission
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Semester - REQUIRED */}
        <FormField
          control={form.control}
          name="semester_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Semester <span className="text-red-500">*</span>
              </FormLabel>
              <Select
                onValueChange={(value) => {
                  const oldValue = field.value;
                  field.onChange(value);
                  // Only reset dependent field if semester is actually changing (not initial load)
                  if (oldValue && oldValue !== value) {
                    form.setValue('section_id', '');
                  }
                }}
                value={field.value || ''}
                disabled={!watchedProgramId || loadingSemesters}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select semester" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {loadingSemesters ? (
                    <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                      Loading...
                    </div>
                  ) : semesters.length > 0 ? (
                    semesters.map((sem: Semester) => (
                      <SelectItem key={sem.id} value={sem.id}>
                        {sem.semester_name}
                      </SelectItem>
                    ))
                  ) : (
                    <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                      No semesters available
                    </div>
                  )}
                </SelectContent>
              </Select>
              <FormDescription>
                The semester for enrollment (required)
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Section — optional 2026-05-21 (was required). Counsellors set
         *  this during onboarding once the student is placed in a section. */}
        <FormField
          control={form.control}
          name="section_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Section</FormLabel>
              <Select
                onValueChange={field.onChange}
                value={field.value || ''}
                disabled={!watchedSemesterId || !watchedInstitutionId || loadingSections}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select section" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {loadingSections ? (
                    <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                      Loading...
                    </div>
                  ) : sections.length > 0 ? (
                    sections.map((section) => (
                      <SelectItem key={section.id} value={section.id}>
                        {section.section_name}
                      </SelectItem>
                    ))
                  ) : (
                    <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                      No sections available
                    </div>
                  )}
                </SelectContent>
              </Select>
              <FormDescription>
                The section assignment (required)
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Roll Number - OPTIONAL */}
        <FormField
          control={form.control}
          name="roll_number"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Roll Number</FormLabel>
              <FormControl>
                <Input
                  placeholder="Enter roll number (optional)"
                  {...field}
                  value={field.value || ''}
                />
              </FormControl>
              <FormDescription>
                Student&apos;s roll number (optional, can be added later)
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* College Email - OPTIONAL */}
        <FormField
          control={form.control}
          name="college_email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>College Email</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  placeholder="student@jkkn.ac.in (optional)"
                  {...field}
                  value={field.value || ''}
                />
              </FormControl>
              <FormDescription>
                College email must use @jkkn.ac.in domain (optional)
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Register Number - OPTIONAL */}
        <FormField
          control={form.control}
          name="register_number"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Register Number</FormLabel>
              <FormControl>
                <Input
                  placeholder="Enter register number (optional)"
                  {...field}
                  value={field.value || ''}
                />
              </FormControl>
              <FormDescription>
                Student&apos;s register number (optional)
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Regulation - OPTIONAL */}
        <FormField
          control={form.control}
          name="regulation_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Regulation</FormLabel>
              <Select
                onValueChange={field.onChange}
                value={field.value || ''}
                disabled={!watchedInstitutionId || loadingRegulations}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select regulation (optional)" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {loadingRegulations ? (
                    <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                      Loading...
                    </div>
                  ) : regulations.length > 0 ? (
                    regulations.map((regulation: Regulation) => (
                      <SelectItem key={regulation.id} value={regulation.id}>
                        {regulation.regulation_code} ({regulation.regulation_year})
                      </SelectItem>
                    ))
                  ) : (
                    <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                      No regulations available
                    </div>
                  )}
                </SelectContent>
              </Select>
              <FormDescription>
                The regulation under which the student is admitted (optional)
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Batch - OPTIONAL */}
        <FormField
          control={form.control}
          name="batch_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Batch</FormLabel>
              <Select
                onValueChange={field.onChange}
                value={field.value || ''}
                disabled={!watchedInstitutionId || loadingBatches}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select batch (optional)" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {loadingBatches ? (
                    <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                      Loading...
                    </div>
                  ) : batches.length > 0 ? (
                    batches.map((batch: Batch) => (
                      <SelectItem key={batch.id} value={batch.id}>
                        {batch.batch_name}
                      </SelectItem>
                    ))
                  ) : (
                    <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                      No batches available
                    </div>
                  )}
                </SelectContent>
              </Select>
              <FormDescription>
                The batch the student belongs to (optional)
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        </div>
      </div>
    </div>
  );
}
