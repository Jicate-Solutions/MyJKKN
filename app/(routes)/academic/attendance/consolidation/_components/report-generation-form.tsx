'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { format } from 'date-fns';
import { Building2, CalendarIcon, FileText, Loader2, Table2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useCreateConsolidationReport } from '@/hooks/academic/use-attendance-consolidation';
import type { GroupByType, ReportFormat, ReportTemplate } from '@/types/attendance';
import { useAdaptiveLabels } from '@/hooks/use-adaptive-labels';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { DegreeService } from '@/lib/services/organization/degree-service';
import { DepartmentService } from '@/lib/services/organization/department-service';
import { ProgramService } from '@/lib/services/organization/program-service';
import { SemesterService } from '@/lib/services/organization/semester-service';
import { SectionService } from '@/lib/services/organization/section-service';
import { CourseMappingService } from '@/lib/services/organization/course-mapping-service';

// Form schema
const formSchema = z.object({
  reportName: z.string().min(3, 'Report name must be at least 3 characters'),
  reportDescription: z.string().optional(),
  institutionId: z.string().min(1, 'Institution is required'),
  dateFrom: z.date({
    required_error: 'Start date is required',
  }),
  dateTo: z.date({
    required_error: 'End date is required',
  }),
  template: z.enum(['summary', 'subjectwise']),
  groupBy: z.enum(['department', 'program', 'semester', 'section', 'student', 'course']),
  format: z.enum(['pdf', 'excel', 'csv']),
  includeAbsentDetails: z.boolean().default(false),
  includePeriodBreakdown: z.boolean().default(false),
  degrees: z.array(z.string()).optional(),
  departments: z.array(z.string()).optional(),
  programs: z.array(z.string()).optional(),
  semesters: z.array(z.string()).optional(),
  sections: z.array(z.string()).optional(),
  courses: z.array(z.string()).optional(),
}).refine((data) => data.dateTo >= data.dateFrom, {
  message: 'End date must be after or equal to start date',
  path: ['dateTo'],
});

type FormValues = z.infer<typeof formSchema>;

interface FilterOption {
  id: string;
  label: string;
}

// Checkbox multi-select block (house pattern: bordered scroll list, empty = All)
function FilterMultiSelect({
  title,
  step,
  options,
  value,
  onChange,
  loading,
  emptyText,
}: {
  title: string;
  step: number;
  options: FilterOption[];
  value: string[];
  onChange: (next: string[]) => void;
  loading?: boolean;
  emptyText: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium flex items-center gap-1.5">
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
            {step}
          </Badge>
          {title}
        </span>
        <Badge variant="secondary" className="text-xs">
          {value.length > 0 ? `${value.length} selected` : 'All'}
        </Badge>
      </div>
      <div className="border rounded-md p-2 max-h-36 overflow-y-auto">
        {loading ? (
          <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading...
          </div>
        ) : options.length === 0 ? (
          <p className="py-2 text-center text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          options.map((option) => (
            <label
              key={option.id}
              className="flex items-center gap-2 py-1 text-sm cursor-pointer"
            >
              <Checkbox
                checked={value.includes(option.id)}
                onCheckedChange={(checked) =>
                  onChange(
                    checked === true
                      ? [...value, option.id]
                      : value.filter((id) => id !== option.id)
                  )
                }
              />
              <span className="leading-tight">{option.label}</span>
            </label>
          ))
        )}
      </div>
    </div>
  );
}

interface ReportGenerationFormProps {
  institutionId: string;
  onSuccess?: () => void;
}

export function ReportGenerationForm({
  institutionId: initialInstitutionId,
  onSuccess,
}: ReportGenerationFormProps) {
  const [fromDateOpen, setFromDateOpen] = useState(false);
  const [toDateOpen, setToDateOpen] = useState(false);
  const createReport = useCreateConsolidationReport();
  const label = useAdaptiveLabels();
  const { institutions, loading: institutionsLoading } = useInstitutionsWithAccess({
    isActive: true,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      reportName: `Attendance Report - ${format(new Date(), 'MMM yyyy')}`,
      reportDescription: '',
      institutionId: initialInstitutionId || '',
      template: 'summary',
      groupBy: 'section',
      format: 'pdf',
      includeAbsentDetails: false,
      includePeriodBreakdown: false,
      degrees: [],
      departments: [],
      programs: [],
      semesters: [],
      sections: [],
      courses: [],
    },
  });

  const template = form.watch('template');
  const selectedInstitutionId = form.watch('institutionId');
  const selectedDegrees = form.watch('degrees') || [];
  const selectedDepartments = form.watch('departments') || [];
  const selectedPrograms = form.watch('programs') || [];
  const selectedSemesters = form.watch('semesters') || [];

  // Subjectwise matrix: only department/semester/section blocks make sense,
  // and CSV output is not supported.
  useEffect(() => {
    if (template === 'subjectwise') {
      const currentGroupBy = form.getValues('groupBy');
      if (!['department', 'semester', 'section'].includes(currentGroupBy)) {
        form.setValue('groupBy', 'section');
      }
      if (form.getValues('format') === 'csv') {
        form.setValue('format', 'pdf');
      }
    }
  }, [template, form]);

  // Changing institution invalidates every downstream hierarchy selection
  const handleInstitutionChange = (nextInstitutionId: string) => {
    form.setValue('institutionId', nextInstitutionId);
    form.setValue('degrees', []);
    form.setValue('departments', []);
    form.setValue('programs', []);
    form.setValue('semesters', []);
    form.setValue('sections', []);
    form.setValue('courses', []);
  };

  // Scope lookups keyed on the institution picked inside this modal.
  // Services default to limit 10 (silent truncation), so pass explicit limits.
  const lookupsEnabled = !!selectedInstitutionId;

  const degreesQuery = useQuery({
    queryKey: ['consolidation-filters', 'degrees', selectedInstitutionId],
    queryFn: () =>
      DegreeService.getDegrees({
        institution_id: selectedInstitutionId,
        isActive: true,
        limit: 200,
      } as any),
    enabled: lookupsEnabled,
    staleTime: 5 * 60 * 1000,
  });

  const departmentsQuery = useQuery({
    queryKey: ['consolidation-filters', 'departments', selectedInstitutionId],
    queryFn: () =>
      DepartmentService.getDepartments({
        institution_id: selectedInstitutionId,
        isActive: true,
        limit: 500,
      }),
    enabled: lookupsEnabled,
    staleTime: 5 * 60 * 1000,
  });

  const programsQuery = useQuery({
    queryKey: ['consolidation-filters', 'programs', selectedInstitutionId],
    queryFn: () =>
      ProgramService.getPrograms({
        institution_id: selectedInstitutionId,
        isActive: true,
        limit: 500,
      }),
    enabled: lookupsEnabled,
    staleTime: 5 * 60 * 1000,
  });

  const semestersQuery = useQuery({
    queryKey: ['consolidation-filters', 'semesters', selectedInstitutionId],
    queryFn: () =>
      SemesterService.getSemesters({
        institution_id: selectedInstitutionId,
        isActive: true,
        limit: 1000,
      }),
    enabled: lookupsEnabled,
    staleTime: 5 * 60 * 1000,
  });

  const sectionsQuery = useQuery({
    queryKey: ['consolidation-filters', 'sections', selectedInstitutionId],
    queryFn: () =>
      SectionService.getSections({
        institution_id: selectedInstitutionId,
        isActive: true,
        limit: 1000,
      }),
    enabled: lookupsEnabled,
    staleTime: 5 * 60 * 1000,
  });

  const courseMappingsQuery = useQuery({
    queryKey: ['consolidation-filters', 'course-mappings', selectedInstitutionId],
    queryFn: () =>
      CourseMappingService.getCourseMappings({
        institution_id: selectedInstitutionId,
        isActive: true,
        limit: 1000,
      } as any),
    enabled: lookupsEnabled,
    staleTime: 5 * 60 * 1000,
  });

  // Cascade: Institution → Degree → Department → Program → Semester → Section
  const degreeOptions = useMemo<FilterOption[]>(
    () =>
      (degreesQuery.data?.data || []).map((d: any) => ({
        id: d.id,
        label: d.degree_name || d.display_name,
      })),
    [degreesQuery.data]
  );

  const departmentOptions = useMemo<FilterOption[]>(
    () =>
      (departmentsQuery.data?.data || [])
        .filter(
          (d: any) =>
            selectedDegrees.length === 0 || selectedDegrees.includes(d.degree_id)
        )
        .map((d: any) => ({
          id: d.id,
          label: d.department_name,
        })),
    [departmentsQuery.data, selectedDegrees]
  );

  const programOptions = useMemo<FilterOption[]>(
    () =>
      (programsQuery.data?.data || [])
        .filter((p: any) => {
          if (selectedDepartments.length > 0)
            return selectedDepartments.includes(p.department_id);
          if (selectedDegrees.length > 0) return selectedDegrees.includes(p.degree_id);
          return true;
        })
        .map((p: any) => ({ id: p.id, label: p.program_name })),
    [programsQuery.data, selectedDepartments, selectedDegrees]
  );

  const semesterOptions = useMemo<FilterOption[]>(
    () =>
      (semestersQuery.data?.data || [])
        .filter((s: any) => {
          if (selectedPrograms.length > 0) return selectedPrograms.includes(s.program_id);
          if (selectedDepartments.length > 0)
            return selectedDepartments.includes(s.department_id);
          if (selectedDegrees.length > 0) return selectedDegrees.includes(s.degree_id);
          return true;
        })
        .map((s: any) => ({
          id: s.id,
          label: s.program?.program_name
            ? `${s.semester_name} — ${s.program.program_name}`
            : s.semester_name,
        })),
    [semestersQuery.data, selectedPrograms, selectedDepartments, selectedDegrees]
  );

  const sectionOptions = useMemo<FilterOption[]>(
    () =>
      (sectionsQuery.data?.data || [])
        .filter((s: any) => {
          if (selectedSemesters.length > 0) return selectedSemesters.includes(s.semester_id);
          if (selectedPrograms.length > 0) return selectedPrograms.includes(s.program_id);
          if (selectedDepartments.length > 0)
            return selectedDepartments.includes(s.department_id);
          if (selectedDegrees.length > 0) return selectedDegrees.includes(s.degree_id);
          return true;
        })
        .map((s: any) => ({
          id: s.id,
          label: s.semester?.semester_name
            ? `${s.section_name} — ${s.semester.semester_name}`
            : s.section_name,
        })),
    [
      sectionsQuery.data,
      selectedSemesters,
      selectedPrograms,
      selectedDepartments,
      selectedDegrees,
    ]
  );

  const courseOptions = useMemo<FilterOption[]>(() => {
    const mappings = (courseMappingsQuery.data?.data || []).filter((m: any) => {
      if (selectedSemesters.length > 0) return selectedSemesters.includes(m.semester_id);
      if (selectedPrograms.length > 0) return selectedPrograms.includes(m.program_id);
      if (selectedDepartments.length > 0)
        return selectedDepartments.includes(m.department_id);
      if (selectedDegrees.length > 0) return selectedDegrees.includes(m.degree_id);
      return true;
    });
    const byCourse = new Map<string, FilterOption>();
    for (const m of mappings as any[]) {
      if (m.course?.id && !byCourse.has(m.course.id)) {
        byCourse.set(m.course.id, {
          id: m.course.id,
          label: m.course.course_code
            ? `${m.course.course_code} — ${m.course.course_name}`
            : m.course.course_name,
        });
      }
    }
    return Array.from(byCourse.values()).sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { numeric: true })
    );
  }, [
    courseMappingsQuery.data,
    selectedSemesters,
    selectedPrograms,
    selectedDepartments,
    selectedDegrees,
  ]);

  // Handler for From Date selection
  const handleFromDateSelect = (date: Date | undefined) => {
    if (date) {
      form.setValue('dateFrom', date);
      setFromDateOpen(false);
    }
  };

  // Handler for To Date selection
  const handleToDateSelect = (date: Date | undefined) => {
    if (date) {
      form.setValue('dateTo', date);
      setToDateOpen(false);
    }
  };

  const onSubmit = async (values: FormValues) => {
    // Keep only selections that are still visible after cascading — a parent
    // change may have hidden previously ticked children (no auto-pruning while
    // editing, so stale ids are dropped here instead).
    const visibleIds = (options: FilterOption[]) => new Set(options.map((o) => o.id));
    const clean = (selected: string[] | undefined, visible: Set<string>) =>
      (selected || []).filter((id) => id && id.trim() !== '' && visible.has(id));

    const cleanDegrees = clean(values.degrees, visibleIds(degreeOptions));
    const cleanDepartments = clean(values.departments, visibleIds(departmentOptions));
    const cleanPrograms = clean(values.programs, visibleIds(programOptions));
    const cleanSemesters = clean(values.semesters, visibleIds(semesterOptions));
    const cleanSections = clean(values.sections, visibleIds(sectionOptions));
    const cleanCourses = clean(values.courses, visibleIds(courseOptions));

    const dto = {
      reportName: values.reportName,
      reportDescription: values.reportDescription,
      institutionId: values.institutionId,
      format: values.format as ReportFormat,
      reportParams: {
        dateFrom: format(values.dateFrom, 'yyyy-MM-dd'),
        dateTo: format(values.dateTo, 'yyyy-MM-dd'),
        template: values.template as ReportTemplate,
        groupBy: values.groupBy as GroupByType,
        includeAbsentDetails: values.includeAbsentDetails,
        includePeriodBreakdown: values.includePeriodBreakdown,
        degrees: cleanDegrees,
        departments: cleanDepartments,
        programs: cleanPrograms,
        semesters: cleanSemesters,
        sections: cleanSections,
        courses: cleanCourses,
      },
    };

    const result = await createReport.mutateAsync(dto);
    if (result && onSuccess) {
      form.reset();
      onSuccess();
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Basic Information */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Basic Information</h3>

          <FormField
            control={form.control}
            name="reportName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Report Name</FormLabel>
                <FormControl>
                  <Input placeholder="Enter report name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="reportDescription"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description (Optional)</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Enter report description"
                    className="resize-none"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Report Template */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Report Template</h3>
          <FormField
            control={form.control}
            name="template"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <RadioGroup
                    value={field.value}
                    onValueChange={field.onChange}
                    className="grid grid-cols-1 md:grid-cols-2 gap-3"
                  >
                    <div className="flex items-start space-x-3 border rounded-md p-3 cursor-pointer hover:bg-accent">
                      <RadioGroupItem value="summary" id="templateSummary" className="mt-1" />
                      <Label htmlFor="templateSummary" className="cursor-pointer flex-1">
                        <div className="font-medium flex items-center gap-2">
                          <FileText className="h-4 w-4 text-primary" />
                          Summary Report
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Grouped attendance statistics with per-learner totals,
                          percentages and absent details.
                        </div>
                      </Label>
                    </div>
                    <div className="flex items-start space-x-3 border rounded-md p-3 cursor-pointer hover:bg-accent bg-blue-50/50 dark:bg-blue-900/10">
                      <RadioGroupItem value="subjectwise" id="templateSubjectwise" className="mt-1" />
                      <Label htmlFor="templateSubjectwise" className="cursor-pointer flex-1">
                        <div className="font-medium flex items-center gap-2">
                          <Table2 className="h-4 w-4 text-primary" />
                          Subjectwise % Matrix
                          <Badge variant="secondary" className="text-xs">Camu format</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Learners × {label('courses')} grid — each cell shows
                          attendance % with attended/taken periods (A/T).
                        </div>
                      </Label>
                    </div>
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Report Scope — Institution → Degree → Department → Program → Semester → Section */}
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold">Report Scope</h3>
            <p className="text-sm text-muted-foreground">
              Select in order: Institution → {label('Degree')} → {label('Department')} →{' '}
              {label('Program')} → {label('Semester')} → {label('Section')}. Leave a level
              empty to include everything under it.
            </p>
          </div>

          <FormField
            control={form.control}
            name="institutionId"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex items-center gap-1.5">
                  <Building2 className="h-4 w-4 text-primary" />
                  Institution <span className="text-red-500">*</span>
                </FormLabel>
                <Select onValueChange={handleInstitutionChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          institutionsLoading ? 'Loading institutions...' : 'Select institution'
                        }
                      />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {institutions.map((institution) => (
                      <SelectItem key={institution.id} value={institution.id}>
                        {institution.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {!selectedInstitutionId ? (
            <p className="text-sm text-amber-600 border border-amber-200 bg-amber-50 dark:bg-amber-900/10 rounded-md p-3">
              Select an institution to load its {label('degrees').toLowerCase()},{' '}
              {label('departments').toLowerCase()}, {label('programs').toLowerCase()},{' '}
              {label('semesters').toLowerCase()} and {label('sections').toLowerCase()}.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="degrees"
                render={({ field }) => (
                  <FormItem>
                    <FilterMultiSelect
                      title={label('Degrees')}
                      step={2}
                      options={degreeOptions}
                      value={field.value || []}
                      onChange={field.onChange}
                      loading={degreesQuery.isLoading}
                      emptyText={`No ${label('degrees').toLowerCase()} found`}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="departments"
                render={({ field }) => (
                  <FormItem>
                    <FilterMultiSelect
                      title={label('Departments')}
                      step={3}
                      options={departmentOptions}
                      value={field.value || []}
                      onChange={field.onChange}
                      loading={departmentsQuery.isLoading}
                      emptyText={`No ${label('departments').toLowerCase()} found`}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="programs"
                render={({ field }) => (
                  <FormItem>
                    <FilterMultiSelect
                      title={label('Programs')}
                      step={4}
                      options={programOptions}
                      value={field.value || []}
                      onChange={field.onChange}
                      loading={programsQuery.isLoading}
                      emptyText={`No ${label('programs').toLowerCase()} found`}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="semesters"
                render={({ field }) => (
                  <FormItem>
                    <FilterMultiSelect
                      title={label('Semesters')}
                      step={5}
                      options={semesterOptions}
                      value={field.value || []}
                      onChange={field.onChange}
                      loading={semestersQuery.isLoading}
                      emptyText={`No ${label('semesters').toLowerCase()} found`}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="sections"
                render={({ field }) => (
                  <FormItem>
                    <FilterMultiSelect
                      title={label('Sections')}
                      step={6}
                      options={sectionOptions}
                      value={field.value || []}
                      onChange={field.onChange}
                      loading={sectionsQuery.isLoading}
                      emptyText={`No ${label('sections').toLowerCase()} found`}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="courses"
                render={({ field }) => (
                  <FormItem>
                    <FilterMultiSelect
                      title={`${label('Courses')} (optional)`}
                      step={7}
                      options={courseOptions}
                      value={field.value || []}
                      onChange={field.onChange}
                      loading={courseMappingsQuery.isLoading}
                      emptyText={`No mapped ${label('courses').toLowerCase()} found`}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          )}
        </div>

        {/* Date Range */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Date Range</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="dateFrom"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>From Date</FormLabel>
                  <Popover open={fromDateOpen} onOpenChange={setFromDateOpen} modal={true}>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          type="button"
                          onClick={() => setFromDateOpen(true)}
                          className={cn(
                            'w-full pl-3 text-left font-normal',
                            !field.value && 'text-muted-foreground'
                          )}
                        >
                          {field.value ? (
                            format(field.value, 'PPP')
                          ) : (
                            <span>Pick a date</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 z-[200]" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={handleFromDateSelect}
                        disabled={(date) =>
                          date > new Date() || date < new Date('1900-01-01')
                        }
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="dateTo"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>To Date</FormLabel>
                  <Popover open={toDateOpen} onOpenChange={setToDateOpen} modal={true}>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          type="button"
                          onClick={() => setToDateOpen(true)}
                          className={cn(
                            'w-full pl-3 text-left font-normal',
                            !field.value && 'text-muted-foreground'
                          )}
                        >
                          {field.value ? (
                            format(field.value, 'PPP')
                          ) : (
                            <span>Pick a date</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 z-[200]" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={handleToDateSelect}
                        disabled={(date) =>
                          date > new Date() || date < new Date('1900-01-01')
                        }
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Report Configuration */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Report Configuration</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="groupBy"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {template === 'subjectwise' ? 'One Matrix Per' : 'Group By'}
                  </FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select grouping" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="department">{label('Department')}</SelectItem>
                      {template === 'summary' && (
                        <SelectItem value="program">{label('Program')}</SelectItem>
                      )}
                      <SelectItem value="semester">{label('Semester')}</SelectItem>
                      <SelectItem value="section">{label('Section')}</SelectItem>
                      {template === 'summary' && (
                        <SelectItem value="student">Student</SelectItem>
                      )}
                      {template === 'summary' && (
                        <SelectItem value="course">{label('Course')}</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    {template === 'subjectwise'
                      ? 'Each selected unit gets its own learners × courses matrix'
                      : 'How to organize the attendance data in the report'}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="format"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Output Format</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select format" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="pdf">PDF</SelectItem>
                      <SelectItem value="excel">Excel (.xlsx)</SelectItem>
                      {template === 'summary' && (
                        <SelectItem value="csv">CSV</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Additional Options — summary template only */}
          {template === 'summary' && (
            <div className="space-y-3 pt-2">
              <FormField
                control={form.control}
                name="includeAbsentDetails"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Include Absent Details</FormLabel>
                      <FormDescription>
                        Show specific dates when students were absent
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="includePeriodBreakdown"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Include Period Breakdown</FormLabel>
                      <FormDescription>
                        Show attendance statistics for each period
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />
            </div>
          )}
        </div>

        {/* Submit Button */}
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => form.reset()}
          >
            Reset
          </Button>
          <Button
            type="submit"
            disabled={createReport.isPending}
          >
            {createReport.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating Report...
              </>
            ) : (
              <>
                <FileText className="mr-2 h-4 w-4" />
                Generate Report
              </>
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
