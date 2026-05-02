'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  CalendarIcon,
  Users,
  Building,
  IndianRupee,
  Search,
  Plus,
  Trash2,
  Upload,
  FileSpreadsheet,
  Download
} from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { DegreeService } from '@/lib/services/organization/degree-service';
import { DepartmentService } from '@/lib/services/organization/department-service';
import { ProgramService } from '@/lib/services/organization/program-service';
import { SemesterService } from '@/lib/services/organization/semester-service';
import { BillingCategoryService } from '@/lib/services/billing/categories/billing-category-service';
import { useStudentsForBulkOperations } from '@/hooks/billing/use-student-search';
import { useBulkCreateStudentBills } from '@/hooks/billing/use-student-bills';
import { usePermissions } from '@/hooks/use-permissions';
import { ImportBillsDialog } from './_components/import-bills-dialog';
import toast from 'react-hot-toast';
import type { Institution, Degree, Department, Program, Semester } from '@/types/organizations';
import type { BillingCategory } from '@/types/billing';
import type { StudentForBilling } from '@/types/billing-schedule';

/**
 * navMeta — documents that this page is invoked via a button/link on the
 * parent listing page. Required by `scripts/assert-nav-coverage.mjs`.
 */
export const navMeta = {
  invokedFrom: '/billing/schedule',
} as const;


const bulkBillSchema = z.object({
  institution_id: z.string().min(1, 'Institution is required'),
  degree_id: z.string().optional(),
  department_id: z.string().optional(),
  program_id: z.string().optional(),
  semester_id: z.string().optional(),
  item_category_id: z.string().min(1, 'Item category is required'),
  bill_description: z.string().optional(),
  due_date: z.date({ required_error: 'Due date is required' }),
  quantity: z.number().min(1, 'Quantity must be at least 1').default(1),
  unit_amount: z.number().min(0, 'Unit amount must be positive'),
  tax_amount: z.number().min(0, 'Tax amount must be positive').default(0),
  remarks: z.string().optional(),
  is_recurring: z.boolean().default(false),
  recurrence_pattern: z.enum(['monthly', 'quarterly', 'yearly']).optional(),
  number_of_recurrences: z.number().min(1).max(100).optional()
});

type BulkBillFormData = z.infer<typeof bulkBillSchema>;

export default function BulkCreateBillsPage() {
  const router = useRouter();
  const [importOpen, setImportOpen] = useState(false);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [degrees, setDegrees] = useState<Degree[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [itemCategories, setItemCategories] = useState<BillingCategory[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [isLoadingInstitutions, setIsLoadingInstitutions] = useState(true);
  const [isLoadingDegrees, setIsLoadingDegrees] = useState(false);
  const [isLoadingDepartments, setIsLoadingDepartments] = useState(false);
  const [isLoadingPrograms, setIsLoadingPrograms] = useState(false);
  const [isLoadingSemesters, setIsLoadingSemesters] = useState(false);
  const [isLoadingItemCategories, setIsLoadingItemCategories] = useState(false);

  const bulkCreateBills = useBulkCreateStudentBills();
  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions();
  const canCreateBills =
    isSuperAdmin || canAccess('billing.schedule', 'create');

  const form = useForm<BulkBillFormData>({
    resolver: zodResolver(bulkBillSchema),
    defaultValues: {
      quantity: 1,
      unit_amount: 0,
      tax_amount: 0,
      is_recurring: false
    }
  });

  const watchedValues = form.watch();
  const totalAmount =
    (watchedValues.quantity || 0) * (watchedValues.unit_amount || 0);
  const finalAmount = totalAmount + (watchedValues.tax_amount || 0);

  const { data: studentsData } = useStudentsForBulkOperations(
    watchedValues.institution_id,
    watchedValues.degree_id,
    watchedValues.department_id,
    watchedValues.program_id,
    watchedValues.semester_id
  );

  useEffect(() => {
    loadInstitutions();
  }, []);

  useEffect(() => {
    loadItemCategories();
  }, []);

  // Cascading hierarchy loaders — institution → degree → department → program → semester.
  // Each tier loads when its parent is set and clears when the parent is unset.
  useEffect(() => {
    if (watchedValues.institution_id) {
      loadDegrees(watchedValues.institution_id);
    } else {
      setDegrees([]);
    }
  }, [watchedValues.institution_id]);

  useEffect(() => {
    if (watchedValues.institution_id && watchedValues.degree_id) {
      loadDepartments(watchedValues.institution_id, watchedValues.degree_id);
    } else {
      setDepartments([]);
    }
  }, [watchedValues.institution_id, watchedValues.degree_id]);

  useEffect(() => {
    if (
      watchedValues.institution_id &&
      watchedValues.degree_id &&
      watchedValues.department_id
    ) {
      loadPrograms(
        watchedValues.institution_id,
        watchedValues.degree_id,
        watchedValues.department_id
      );
    } else {
      setPrograms([]);
    }
  }, [
    watchedValues.institution_id,
    watchedValues.degree_id,
    watchedValues.department_id
  ]);

  useEffect(() => {
    if (
      watchedValues.institution_id &&
      watchedValues.degree_id &&
      watchedValues.department_id &&
      watchedValues.program_id
    ) {
      loadSemesters(
        watchedValues.institution_id,
        watchedValues.degree_id,
        watchedValues.department_id,
        watchedValues.program_id
      );
    } else {
      setSemesters([]);
    }
  }, [
    watchedValues.institution_id,
    watchedValues.degree_id,
    watchedValues.department_id,
    watchedValues.program_id
  ]);

  const loadInstitutions = async () => {
    try {
      setIsLoadingInstitutions(true);
      const institutionNames = await OrganizationService.getInstitutionNames(
        true
      );
      setInstitutions(institutionNames as Institution[]);
    } catch (error) {
      console.error('Error loading institutions:', error);
    } finally {
      setIsLoadingInstitutions(false);
    }
  };

  const loadItemCategories = async () => {
    try {
      setIsLoadingItemCategories(true);
      const categories = await BillingCategoryService.getActiveBillingCategories();
      setItemCategories(categories);
    } catch (error) {
      console.error('Error loading billing categories:', error);
    } finally {
      setIsLoadingItemCategories(false);
    }
  };

  const loadDegrees = async (institutionId: string) => {
    try {
      setIsLoadingDegrees(true);
      const data = await DegreeService.getDegrees({
        institution_id: institutionId,
        limit: 1000,
        isActive: true
      });
      setDegrees(data.data);
    } catch (error) {
      console.error('Error loading degrees:', error);
    } finally {
      setIsLoadingDegrees(false);
    }
  };

  const loadDepartments = async (institutionId: string, degreeId: string) => {
    try {
      setIsLoadingDepartments(true);
      const data = await DepartmentService.getDepartments({
        institution_id: institutionId,
        degree_id: degreeId,
        limit: 1000,
        isActive: true
      });
      setDepartments(data.data);
    } catch (error) {
      console.error('Error loading departments:', error);
    } finally {
      setIsLoadingDepartments(false);
    }
  };

  const loadPrograms = async (
    institutionId: string,
    degreeId: string,
    departmentId: string
  ) => {
    try {
      setIsLoadingPrograms(true);
      const data = await ProgramService.getPrograms({
        institution_id: institutionId,
        degree_id: degreeId,
        department_id: departmentId,
        limit: 1000,
        isActive: true
      });
      setPrograms(data.data);
    } catch (error) {
      console.error('Error loading programs:', error);
    } finally {
      setIsLoadingPrograms(false);
    }
  };

  const loadSemesters = async (
    institutionId: string,
    degreeId: string,
    departmentId: string,
    programId: string
  ) => {
    try {
      setIsLoadingSemesters(true);
      const data = await SemesterService.getSemesters({
        institution_id: institutionId,
        degree_id: degreeId,
        department_id: departmentId,
        program_id: programId,
        limit: 1000,
        isActive: true
      });
      setSemesters(data.data);
    } catch (error) {
      console.error('Error loading semesters:', error);
    } finally {
      setIsLoadingSemesters(false);
    }
  };

  const handleSelectStudent = (studentId: string, checked: boolean) => {
    if (checked) {
      setSelectedStudents((prev) => [...prev, studentId]);
    } else {
      setSelectedStudents((prev) => prev.filter((id) => id !== studentId));
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked && studentsData?.data) {
      setSelectedStudents(studentsData.data.map((student) => student.id));
    } else {
      setSelectedStudents([]);
    }
  };

  const onSubmit = async (data: BulkBillFormData) => {
    if (selectedStudents.length === 0) {
      alert('Please select at least one student');
      return;
    }

    try {
      const billData = {
        ...data,
        due_date: format(data.due_date, 'yyyy-MM-dd'),
        total_amount: totalAmount,
        final_amount: finalAmount
      };

      await bulkCreateBills.mutateAsync({
        student_ids: selectedStudents,
        bills: [billData as any]
      });

      router.push('/billing/schedule');
    } catch (error) {
      console.error('Error creating bulk bills:', error);
    }
  };

  // Show loading state while permissions are loading  if (permissionsLoading) {    return (      <ContentLayout title='Bulk Create Bills'>        <div className='flex items-center justify-center min-h-[400px]'>          <div className='flex items-center space-x-2'>            <div className='w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin'></div>            <span>Loading permissions...</span>          </div>        </div>      </ContentLayout>    );  }  if (!canCreateBills) {    return (      <ContentLayout title='Bulk Create Bills'>        <div className='text-center py-8'>          <p className='text-destructive'>            You don&apos;t have permission to create student bills.          </p>        </div>      </ContentLayout>    );  }

  const isLoading = bulkCreateBills.isPending;

  return (
    <ContentLayout title='Bulk Create Bills'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Billing', href: '/billing/schedule' },
          { label: 'Bulk Create', href: '/billing/schedule/bulk-create' }
        ]}
      />

      <div className='space-y-6 mt-4'>
        <div>
          <h1 className='text-2xl font-bold py-1'>Bulk Create Student Bills</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Create bills for multiple students at once with the same bill
            details
          </p>
        </div>

        {/* Bulk upload from Excel — alternate path that bypasses the form below.
            Each row of the uploaded sheet becomes one bill (own student, own
            amount, own due date, own category). The form below remains for the
            common "same bill, many students" case. */}
        <Card className='border-dashed bg-muted/40'>
          <CardContent className='flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between'>
            <div className='flex items-start gap-3'>
              <div className='rounded-md bg-primary/10 p-2 text-primary'>
                <FileSpreadsheet className='h-6 w-6' />
              </div>
              <div className='space-y-1'>
                <p className='font-semibold leading-tight'>
                  Have many bills with different categories or amounts?
                </p>
                <p className='text-sm text-muted-foreground'>
                  Download the Excel template, fill one row per bill, then
                  upload to create them all at once. Each row needs a roll
                  number, billing category, due date, and amount.
                </p>
              </div>
            </div>
            <div className='flex shrink-0 gap-2'>
              <Button variant='outline' size='sm' asChild>
                <a
                  href='/api/billing/schedule/bills/template'
                  onClick={() => toast.success('Downloading template…')}
                >
                  <Download className='mr-2 h-4 w-4' />
                  Download Template
                </a>
              </Button>
              <Button
                size='sm'
                onClick={() => setImportOpen(true)}
                disabled={!canCreateBills}
              >
                <Upload className='mr-2 h-4 w-4' />
                Upload Excel
              </Button>
            </div>
          </CardContent>
        </Card>

        <ImportBillsDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          onImportComplete={() => {
            // Stay on the page so the user can upload another batch if they
            // want. Future: refresh a "recent imports" panel if we add one.
            setImportOpen(false);
          }}
        />

        <Form {...form}>

          <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6'>
            <div className='space-y-6'>
              {/* Linear flow: Step 1 (filters & bill) → Step 2 (students) → Step 3 (amount) → Submit. */}

              {/* Step 1 — Filters & Bill Details */}
              <Card>
                <CardHeader>
                  <CardTitle className='flex items-center gap-2'>
                    <span className='flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground'>
                      1
                    </span>
                    <Building className='h-5 w-5' />
                    Bill Details & Student Filters
                  </CardTitle>
                  <CardDescription>
                    Pick the institution (required), then narrow the cohort by
                    degree → department → program → semester. Set the billing
                    category, an optional description, and the due date.
                  </CardDescription>
                </CardHeader>
                  <CardContent className='space-y-4 grid grid-cols-1 md:grid-cols-2 gap-4'>
                    <FormField
                      control={form.control}
                      name='institution_id'
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Institution</FormLabel>
                          <Select
                            onValueChange={(value) => {
                              field.onChange(value);
                              // Reset all dependent hierarchy + dependent fields when institution changes.
                              form.setValue('degree_id', undefined);
                              form.setValue('department_id', undefined);
                              form.setValue('program_id', undefined);
                              form.setValue('semester_id', undefined);
                              form.setValue('item_category_id', '');
                              setSelectedStudents([]);
                            }}
                            value={field.value}
                            disabled={isLoadingInstitutions}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder='Select institution' />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {institutions.map((institution) => (
                                <SelectItem
                                  key={institution.id}
                                  value={institution.id}
                                >
                                  {institution.name} (
                                  {institution.counselling_code})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Cascading hierarchy: Degree → Department → Program → Semester.
                        Each tier is optional — picking institution alone fetches all
                        students for that institution; deeper tiers narrow the set. */}
                    <FormField
                      control={form.control}
                      name='degree_id'
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Degree (optional)</FormLabel>
                          <Select
                            onValueChange={(value) => {
                              const next = value === 'all' ? undefined : value;
                              field.onChange(next);
                              form.setValue('department_id', undefined);
                              form.setValue('program_id', undefined);
                              form.setValue('semester_id', undefined);
                              setSelectedStudents([]);
                            }}
                            value={field.value || 'all'}
                            disabled={
                              !watchedValues.institution_id || isLoadingDegrees
                            }
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue
                                  placeholder={
                                    !watchedValues.institution_id
                                      ? 'Select institution first'
                                      : isLoadingDegrees
                                      ? 'Loading degrees...'
                                      : 'All degrees'
                                  }
                                />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value='all'>All degrees</SelectItem>
                              {degrees.map((degree) => (
                                <SelectItem key={degree.id} value={degree.id}>
                                  {degree.degree_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name='department_id'
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Department (optional)</FormLabel>
                          <Select
                            onValueChange={(value) => {
                              const next = value === 'all' ? undefined : value;
                              field.onChange(next);
                              form.setValue('program_id', undefined);
                              form.setValue('semester_id', undefined);
                              setSelectedStudents([]);
                            }}
                            value={field.value || 'all'}
                            disabled={
                              !watchedValues.degree_id || isLoadingDepartments
                            }
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue
                                  placeholder={
                                    !watchedValues.degree_id
                                      ? 'Select degree first'
                                      : isLoadingDepartments
                                      ? 'Loading departments...'
                                      : 'All departments'
                                  }
                                />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value='all'>
                                All departments
                              </SelectItem>
                              {departments.map((department) => (
                                <SelectItem
                                  key={department.id}
                                  value={department.id}
                                >
                                  {department.department_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name='program_id'
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Program (optional)</FormLabel>
                          <Select
                            onValueChange={(value) => {
                              const next = value === 'all' ? undefined : value;
                              field.onChange(next);
                              form.setValue('semester_id', undefined);
                              setSelectedStudents([]);
                            }}
                            value={field.value || 'all'}
                            disabled={
                              !watchedValues.department_id || isLoadingPrograms
                            }
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue
                                  placeholder={
                                    !watchedValues.department_id
                                      ? 'Select department first'
                                      : isLoadingPrograms
                                      ? 'Loading programs...'
                                      : 'All programs'
                                  }
                                />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value='all'>All programs</SelectItem>
                              {programs.map((program) => (
                                <SelectItem
                                  key={program.id}
                                  value={program.id}
                                >
                                  {program.program_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name='semester_id'
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Semester (optional)</FormLabel>
                          <Select
                            onValueChange={(value) => {
                              const next = value === 'all' ? undefined : value;
                              field.onChange(next);
                              setSelectedStudents([]);
                            }}
                            value={field.value || 'all'}
                            disabled={
                              !watchedValues.program_id || isLoadingSemesters
                            }
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue
                                  placeholder={
                                    !watchedValues.program_id
                                      ? 'Select program first'
                                      : isLoadingSemesters
                                      ? 'Loading semesters...'
                                      : 'All semesters'
                                  }
                                />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value='all'>All semesters</SelectItem>
                              {semesters.map((semester) => (
                                <SelectItem
                                  key={semester.id}
                                  value={semester.id}
                                >
                                  {semester.semester_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name='item_category_id'
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Billing Category</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                            disabled={
                              !watchedValues.institution_id ||
                              isLoadingItemCategories
                            }
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder='Select item category' />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {itemCategories.map((category) => (
                                <SelectItem
                                  key={category.id}
                                  value={category.id}
                                >
                                  {category.category_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name='bill_description'
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Bill Description</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder='Enter bill description'
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name='due_date'
                      render={({ field }) => (
                        <FormItem className='flex flex-col'>
                          <FormLabel>Due Date</FormLabel>
                          <Popover>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant='outline'
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
                                  <CalendarIcon className='ml-auto h-4 w-4 opacity-50' />
                                </Button>
                              </FormControl>
                            </PopoverTrigger>
                            <PopoverContent
                              className='w-auto p-0'
                              align='start'
                            >
                              <Calendar
                                mode='single'
                                selected={field.value}
                                onSelect={field.onChange}
                                disabled={(date) =>
                                  date <
                                  new Date(new Date().setHours(0, 0, 0, 0))
                                }
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

              {/* Step 2 — Select Students */}
              <Card>
                <CardHeader>
                  <CardTitle className='flex items-center gap-2'>
                    <span className='flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground'>
                      2
                    </span>
                    <Users className='h-5 w-5' />
                    Select Students
                  </CardTitle>
                  <CardDescription>
                    {watchedValues.institution_id
                      ? 'Pick which students should receive this bill. Only students matching your filters above are listed.'
                      : 'Select an institution in step 1 to populate this list.'}
                  </CardDescription>
                </CardHeader>
                <CardContent className='space-y-4'>
                  {studentsData?.data && studentsData.data.length > 0 ? (
                    <>
                      <div className='flex items-center justify-between'>
                        <div className='flex items-center space-x-2'>
                          <Checkbox
                            checked={
                              selectedStudents.length ===
                              studentsData.data.length
                            }
                            onCheckedChange={handleSelectAll}
                          />
                          <label className='text-sm font-medium'>
                            Select All ({studentsData.data.length} students)
                          </label>
                        </div>
                        <Badge variant='outline'>
                          {selectedStudents.length} selected
                        </Badge>
                      </div>

                      <div className='max-h-96 overflow-y-auto space-y-2'>
                        {studentsData.data.map((student) => (
                          <div
                            key={student.id}
                            className='flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted'
                          >
                            <Checkbox
                              checked={selectedStudents.includes(student.id)}
                              onCheckedChange={(checked) =>
                                handleSelectStudent(
                                  student.id,
                                  checked as boolean
                                )
                              }
                            />
                            <div className='flex-1'>
                              <div className='font-medium'>
                                {`${student.first_name} ${student.last_name}`}
                              </div>
                              <div className='text-sm text-muted-foreground'>
                                {student.roll_number} • Outstanding: ₹
                                {student.outstanding_amount}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className='text-center py-8 text-muted-foreground'>
                      {watchedValues.institution_id
                        ? 'No students found for the selected criteria'
                        : 'Select an institution above to view students'}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Step 3 — Set Billing Amount */}
              <Card>
                <CardHeader>
                  <CardTitle className='flex items-center gap-2'>
                    <span className='flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground'>
                      3
                    </span>
                    <IndianRupee className='h-5 w-5' />
                    Set Billing Amount
                  </CardTitle>
                  <CardDescription>
                    Each selected student will be billed this amount. The total
                    below updates live as you change the count.
                  </CardDescription>
                </CardHeader>
                <CardContent className='space-y-4'>
                  <FormField
                    control={form.control}
                    name='unit_amount'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Billing Amount (₹)</FormLabel>
                        <FormControl>
                          <Input
                            type='number'
                            min='0'
                            step='0.01'
                            placeholder='0.00'
                            {...field}
                            value={field.value?.toString() || ''}
                            onChange={(e) =>
                              field.onChange(parseFloat(e.target.value) || 0)
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className='space-y-2 p-4 bg-muted rounded-md'>
                    <div className='flex justify-between text-sm'>
                      <span>Billing Amount per student:</span>
                      <span>₹{finalAmount.toFixed(2)}</span>
                    </div>
                    {selectedStudents.length > 0 && (
                      <div className='flex justify-between font-medium text-blue-600 border-t pt-2'>
                        <span>
                          Total for {selectedStudents.length} students:
                        </span>
                        <span>
                          ₹
                          {(finalAmount * selectedStudents.length).toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Form Actions */}
            <div className='flex justify-end gap-4'>
              <Button
                type='button'
                variant='outline'
                onClick={() => router.back()}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button
                type='submit'
                disabled={isLoading || selectedStudents.length === 0}
              >
                {isLoading
                  ? 'Creating Bills...'
                  : `Create Bills for ${selectedStudents.length} Students`}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </ContentLayout>
  );
}
