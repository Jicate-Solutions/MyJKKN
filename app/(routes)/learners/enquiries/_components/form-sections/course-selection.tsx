// ============================================
// COURSE SELECTION FORM SECTION
// ============================================
// Created: 2025-01-18
// Updated: 2025-01-19 - Added complete admission form fields
// Purpose: Academic program and semester selection
// Changes:
// - Added Quota and Category fields (moved from Academic Information tab)
// - Added Entry Type, Academic Year, Section (required)
// - Added Roll Number, College Email, Register Number (optional)
// - Added Regulation and Batch fields (optional)
// - Matches admissions form structure completely
// ============================================

import { UseFormReturn } from 'react-hook-form';
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
import { useRegulations } from '@/hooks/academic/use-regulations';
import { useBatches } from '@/hooks/academic/use-batches';
import type { Degree, Department, Program, Semester } from '@/types/organizations';
import type { AcademicYear, Regulation, Batch } from '@/types/academics';

interface CourseSelectionProps {
  form: UseFormReturn<any>;
}

export function CourseSelectionSection({ form }: CourseSelectionProps) {
  // Watch selections for cascading filters
  const watchedInstitutionId = form.watch('institution_id');
  const watchedDegreeId = form.watch('degree_id');
  const watchedDepartmentId = form.watch('department_id');
  const watchedProgramId = form.watch('program_id');
  const watchedSemesterId = form.watch('semester_id');

  // Fetch organizations data with hierarchical filtering
  const { institutions } = useInstitutionsWithAccess();

  // Degrees - filtered by institution
  const { data: degreesData, isLoading: loadingDegrees } = useDegrees({
    institution_id: watchedInstitutionId || undefined,
  });

  // Departments - filtered by degree (only fetch if degree is selected)
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
  const { regulations, loading: loadingRegulations } = useRegulations({ institution_id: watchedInstitutionId });
  const { batches, loading: loadingBatches } = useBatches({ institution_id: watchedInstitutionId });

  // Fetch sections (semester + institution dependent)
  const { data: sectionsData, isLoading: loadingSections } = useSections({
    semester_id: watchedSemesterId || undefined,
    institution_id: watchedInstitutionId || undefined,
  });

  // Extract data arrays from React Query results
  const degrees = degreesData?.data || [];
  const departments = departmentsData?.data || [];
  const programs = programsData?.data || [];
  const semesters = semestersData?.data || [];
  const sections = sectionsData?.data || [];

  // Filter active academic years
  const activeAcademicYears = academicYears?.filter((year: AcademicYear) => year.is_active) || [];

  return (
    <div className="space-y-6">
      {/* Quota & Category */}
      <div className="space-y-4 pb-4 border-b">
        <h3 className="text-lg font-semibold">Quota & Category</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="quota"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Quota</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select quota" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                  <SelectItem value='GOVERNMENT'>Government Quota</SelectItem>
                  <SelectItem value='MANAGEMENT'>Management Quota</SelectItem>
                  <SelectItem value='NRI'>NRI Quota</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="category"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Category</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                  <SelectItem value='GENERAL'>GENERAL</SelectItem>
                  <SelectItem value='BC'>BC</SelectItem>
                  <SelectItem value='BCM'>BCM</SelectItem>
                  <SelectItem value='MBC'>MBC</SelectItem>
                  <SelectItem value='DNC'>DNC</SelectItem>
                  <SelectItem value='BC-CC'>BC-CC</SelectItem>
                  <SelectItem value='SC'>SC</SelectItem>
                  <SelectItem value='ST'>ST</SelectItem>
                  <SelectItem value='SCA'>SCA</SelectItem>
                  <SelectItem value='MBC & DNC'>MBC & DNC</SelectItem>
                  <SelectItem value='OC'>OC</SelectItem>
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
                  field.onChange(value);
                  // Reset dependent fields
                  form.setValue('degree_id', '');
                  form.setValue('department_id', '');
                  form.setValue('program_id', '');
                }}
                defaultValue={field.value}
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
              <FormLabel>Degree</FormLabel>
              <Select
                onValueChange={(value) => {
                  field.onChange(value);
                  // Reset dependent fields
                  form.setValue('department_id', '');
                  form.setValue('program_id', '');
                }}
                defaultValue={field.value}
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

        {/* Department */}
        <FormField
          control={form.control}
          name="department_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Department</FormLabel>
              <Select
                onValueChange={(value) => {
                  field.onChange(value);
                  // Reset dependent fields
                  form.setValue('program_id', '');
                }}
                defaultValue={field.value}
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
                  ) : departments.length > 0 ? (
                    departments.map((dept: Department) => (
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
              <FormLabel>Entry Type</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select entry type" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="FIRST YEAR">FIRST YEAR</SelectItem>
                  <SelectItem value="LATERAL ENTRY">LATERAL ENTRY</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>Type of entry into the course</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

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
                  field.onChange(value);
                  // Reset dependent fields
                  form.setValue('semester_id', '');
                  form.setValue('section_id', '');
                }}
                defaultValue={field.value}
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

        {/* Academic Year */}
        <FormField
          control={form.control}
          name="academic_year_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Academic Year</FormLabel>
              <Select
                onValueChange={field.onChange}
                defaultValue={field.value}
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
                  field.onChange(value);
                  // Reset dependent field
                  form.setValue('section_id', '');
                }}
                defaultValue={field.value}
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

        {/* Section - REQUIRED */}
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
                defaultValue={field.value}
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
                Student's roll number (optional, can be added later)
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
                Student's register number (optional)
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
                defaultValue={field.value}
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
                defaultValue={field.value}
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
