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
// - 2026-07-27: Entry Type FIRST YEAR locked Semester to the program's structural
//   "Freshers" row and Section to its "A". REVERTED 2026-08-05 — the Freshers
//   holding pen was removed entirely, so every entry type now auto-picks a real
//   academic term and both dropdowns stay editable.
// - 2026-07-27: Admission Year, Academic Year and Section are required again.
//   The asterisks here reflect the enquiry form's contract; transfer-enquiry-dialog
//   reuses this section against a schema that keeps them optional (same pre-existing
//   mismatch Semester already has there).
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
import { ENTRY_TYPE_OPTIONS } from '@/lib/constants/learner-dropdown-values';
import { AdmissionYearSelect } from '@/components/admission/admission-year-select';
import { LookupService } from '@/lib/services/admission/lookup-service';

interface CourseSelectionProps {
  form: UseFormReturn<any>;
  showLearnerType?: boolean;
  /**
   * Admission-time policy (SH-only first-year departments). True for the
   * enquiry + admission capture flow it was written for.
   *
   * Learner Profiles must pass FALSE. Those screens cover the whole existing
   * population, where entry_type is a historical fact rather than a choice
   * being made now: a FIRST YEAR learner already sitting in Semester III with a
   * MECH department is normal, and enforcing the rule there hid their real
   * department behind an SH-only list.
   */
  enforceAdmissionRules?: boolean;
}

export function CourseSelectionSection({
  form,
  showLearnerType = false,
  enforceAdmissionRules = true,
}: CourseSelectionProps) {
  // Watch selections for cascading filters
  const watchedInstitutionId = form.watch('institution_id');
  const watchedDegreeId = form.watch('degree_id');
  const watchedDepartmentId = form.watch('department_id');
  const watchedProgramId = form.watch('program_id');
  const watchedSemesterId = form.watch('semester_id');
  // 2026-05-21: watched so the SH-department engineering-first-year rule
  // can react to entry-type changes (filter departments + clear stale pick).
  const watchedEntryType = form.watch('entry_type');

  // Determine if currently selected institution is a school
  const { institutions } = useInstitutionsWithAccess();
  const selectedInstitution = institutions?.find((inst) => inst.id === watchedInstitutionId);
  const isSelectedInstitutionSchool = selectedInstitution?.entity_type === 'school';

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

  // Quotas — bound to the global quotas lookup so the form writes quota_id (the
  // FK) directly, not free text. Migrated off the static QUOTA_VALUES enum
  // 2026-06-02 to kill the text↔FK drift that mismatched fee structures.
  const { data: quotasData } = useQuery({
    queryKey: ['lookup', 'quotas', 'active'],
    queryFn: () => LookupService.listQuotas(true),
    staleTime: 5 * 60 * 1000,
  });

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
  const restrictToSh =
    enforceAdmissionRules && institutionHasShDept && watchedEntryType === 'FIRST YEAR';
  const hideSh =
    enforceAdmissionRules && institutionHasShDept && watchedEntryType !== 'FIRST YEAR';
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

  /**
   * Clear every course field that hangs off `from` downwards.
   *
   * Each picker used to clear only its immediate child (institution wiped
   * degree/department/program and stopped; degree wiped department/program;
   * department wiped program). Only the Program picker cleared the deep set
   * (semester / section / admission year), and it can never run after an
   * upstream change: an upstream cascade sets program_id via setValue, which
   * does not fire the Program Select's onValueChange, so when the user
   * re-picks the programme its `oldValue` is '' and the `oldValue &&` guard
   * skips the deep clears entirely.
   *
   * The stale semester/section then reached the UPDATE and Postgres refused
   * the WHOLE row (23514, from trg_validate_learner_semester_year_scope):
   *   "semester_id <id> belongs to institution <old>, not the learner's
   *    institution <new>"
   * — so changing a learner's institution saved none of the course details.
   * Clearing the whole downstream chain at the point of change is what keeps
   * the payload internally consistent.
   */
  const clearDownstreamCourseFields = (
    from: 'institution' | 'degree' | 'department' | 'program',
  ) => {
    if (from === 'institution') {
      form.setValue('degree_id', '');
      // Institution-scoped, and validated against institution_id by
      // trg_validate_learner_semester_year_scope / _admission_year_scope.
      form.setValue('academic_year_id', '');
      form.setValue('regulation_id', '');
      form.setValue('batch_id', '');
    }
    if (from === 'institution' || from === 'degree') {
      form.setValue('department_id', '');
    }
    if (from === 'institution' || from === 'degree' || from === 'department') {
      form.setValue('program_id', '');
    }
    // Programme-scoped: semester and section are FK'd to programs, and the
    // admission-year cohort row is scoped to (institution, program).
    form.setValue('semester_id', '');
    form.setValue('section_id', '');
    form.setValue('admission_year_id', '');
    form.setValue('admission_year', undefined);
  };

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
            name="quota_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Quota <span className="text-red-500">*</span>
                </FormLabel>
                <Select onValueChange={field.onChange} value={field.value || ''}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select quota" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {(quotasData ?? []).map((q) => (
                      <SelectItem key={q.id} value={q.id}>
                        {q.name}
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
                    clearDownstreamCourseFields('institution');
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

        {/* School info banner — degree and department auto-populated */}
        {isSelectedInstitutionSchool && watchedInstitutionId && (
          <div className="flex items-start gap-2 rounded-md border border-green-200 bg-green-50 p-3 text-xs text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="leading-relaxed">
              <p className="font-medium">School admission</p>
              <p className="mt-0.5 text-green-800/90 dark:text-green-300/90">
                Degree and department are automatically assigned for school students.
              </p>
            </div>
          </div>
        )}

        {/* Degree — hidden for schools */}
        {!isSelectedInstitutionSchool && (
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
                    clearDownstreamCourseFields('degree');
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
        )}

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

        {/* Department — hidden for schools */}
        {!isSelectedInstitutionSchool && (
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
                    clearDownstreamCourseFields('department');
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
        )}

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

                  // Profiles: entry_type is a historical attribute of an
                  // existing learner, so changing it must not clear their
                  // department or move their semester. Record it and stop.
                  if (!enforceAdmissionRules) return;

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
                  // Changing entry type repoints the semester, so any section
                  // already chosen belongs to the previous one.
                  form.setValue('section_id', '');

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
                  // Only reset dependent fields if program is actually changing
                  // (not initial load). 2026-04-23: the admission_year cohort
                  // row is scoped to the previous program and would be rejected
                  // by the DB scope-validator trigger on save, so it clears too
                  // — see clearDownstreamCourseFields.
                  if (oldValue && oldValue !== value) {
                    clearDownstreamCourseFields('program');
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
            legacy `admission_year` integer (= admission_years.year) on the form
            so the 6 B2A endpoints that still expose it keep working. */}
        <FormField
          control={form.control}
          name="admission_year_id"
          render={({ field }) => (
            <FormItem>
              <AdmissionYearSelect
                institutionId={watchedInstitutionId}
                value={field.value || ''}
                onChange={(id, row) => {
                  field.onChange(id);
                  // Sync the legacy integer column for B2A back-compat.
                  form.setValue('admission_year', row?.year ?? null);
                }}
                label="Admission Year"
                required
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
              <FormLabel>
                Academic Year <span className="text-red-500">*</span>
              </FormLabel>
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
                The academic year for admission (required)
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

        {/* Section — required again 2026-07-27 (relaxed to optional 2026-05-21
         *  so counsellors could capture an enquiry before placement). Early
         *  capture still works via Save Draft / Save & Next, which skip
         *  validation; only final Submit demands a section. */}
        <FormField
          control={form.control}
          name="section_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Section <span className="text-red-500">*</span>
              </FormLabel>
              <Select
                onValueChange={field.onChange}
                value={field.value || ''}
                disabled={
                  !watchedSemesterId || !watchedInstitutionId || loadingSections
                }
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

        {/* College Email moved to the Contact Details tab (staff only), so the
            edit form groups it with the other contact addresses the way the
            profile detail page does. */}

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

        {/* Regulation */}
        <FormField
          control={form.control}
          name="regulation_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Regulation <span className="text-red-500">*</span>
              </FormLabel>
              <Select
                onValueChange={field.onChange}
                value={field.value || ''}
                disabled={!watchedInstitutionId || loadingRegulations}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select regulation" />
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
                The regulation under which the learner is admitted
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
