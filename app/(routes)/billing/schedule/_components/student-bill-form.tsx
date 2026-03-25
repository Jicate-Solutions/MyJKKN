'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  CalendarIcon,
  Search,
  User,
  Building,
  RefreshCw,
  Plus,
  Trash2,
  FileText,
  Calculator,
  ShoppingCart,
  IndianRupee
} from 'lucide-react';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { BillingItemCategoryService } from '@/lib/services/billing/categories/billing-item-category-service';
import {
  useSearchStudentsByQuery,
  useStudentForBilling
} from '@/hooks/billing/use-student-search';
import {
  useCreateStudentBill,
  useUpdateStudentBill
} from '@/hooks/billing/use-student-bills';
import type { Institution } from '@/types/organizations';
import type { BillingItemCategory } from '@/types/billing';
import type {
  StudentBill,
  CreateStudentBillDto,
  StudentForBilling
} from '@/types/billing-schedule';

// Schema for individual billing item
const billingItemSchema = z.object({
  item_category_id: z.string().min(1, 'Item category is required'),
  unit_amount: z.number().min(0, 'Unit amount must be positive'),
  tax_amount: z.number().min(0, 'Tax amount must be positive').default(0)
});

// Main form schema with multiple billing items
const studentBillSchema = z.object({
  student_id: z.string().min(1, 'Student is required'),
  institution_id: z.string().min(1, 'Institution is required'),
  due_date: z.date({ required_error: 'Due date is required' }),
  billing_items: z
    .array(billingItemSchema)
    .min(1, 'At least one billing item is required'),
  overall_remarks: z.string().optional(),
  is_recurring: z.boolean().default(false),
  recurrence_pattern: z.enum(['monthly', 'quarterly', 'yearly']).optional(),
  number_of_recurrences: z.number().min(1).max(100).optional()
});

type StudentBillFormData = z.infer<typeof studentBillSchema>;
type BillingItem = z.infer<typeof billingItemSchema>;

interface StudentBillFormProps {
  bill?: StudentBill;
  preSelectedStudent?: StudentForBilling;
  onSuccess?: () => void;
}

export function StudentBillForm({
  bill,
  preSelectedStudent,
  onSuccess
}: StudentBillFormProps) {
  const router = useRouter();
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [itemCategories, setItemCategories] = useState<BillingItemCategory[]>(
    []
  );
  const [studentSearchQuery, setStudentSearchQuery] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [isLoadingInstitutions, setIsLoadingInstitutions] = useState(true);
  const [isLoadingItemCategories, setIsLoadingItemCategories] = useState(false);

  const createStudentBill = useCreateStudentBill();
  const updateStudentBill = useUpdateStudentBill();

  // Fetch complete student data when editing a bill
  const { data: completeStudentData } = useStudentForBilling(
    bill?.student_id || null
  );

  // Determine initial values based on pre-selected student or existing bill
  const getInitialValues = (): StudentBillFormData => {
    if (bill) {
      return {
        student_id: bill.student_id,
        institution_id: bill.institution_id,
        due_date: bill.due_date ? new Date(bill.due_date) : new Date(),
        billing_items: [
          {
            item_category_id: bill.item_category_id || '',
            unit_amount: bill.unit_amount || 0,
            tax_amount: bill.tax_amount || 0
          }
        ],
        overall_remarks: bill.remarks || '',
        is_recurring: bill.is_recurring || false,
        recurrence_pattern: bill.recurrence_pattern || undefined,
        number_of_recurrences: bill.number_of_recurrences || undefined
      };
    } else if (preSelectedStudent) {
      return {
        student_id: preSelectedStudent.id,
        institution_id: preSelectedStudent.institution_id,
        due_date: new Date(),
        billing_items: [
          {
            item_category_id: '',
            unit_amount: 0,
            tax_amount: 0
          }
        ],
        overall_remarks: '',
        is_recurring: false,
        recurrence_pattern: undefined,
        number_of_recurrences: undefined
      };
    } else {
      return {
        student_id: '',
        institution_id: '',
        due_date: new Date(),
        billing_items: [
          {
            item_category_id: '',
            unit_amount: 0,
            tax_amount: 0
          }
        ],
        overall_remarks: '',
        is_recurring: false,
        recurrence_pattern: undefined,
        number_of_recurrences: undefined
      };
    }
  };

  const form = useForm<StudentBillFormData>({
    resolver: zodResolver(studentBillSchema),
    defaultValues: getInitialValues()
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'billing_items'
  });

  const { data: searchResults } = useSearchStudentsByQuery(
    studentSearchQuery,
    form.watch('institution_id'),
    10
  );

  const watchedValues = form.watch();

  // Calculate totals from all billing items
  const calculateTotals = () => {
    const items = watchedValues.billing_items || [];
    const subtotal = items.reduce((sum, item) => {
      return sum + item.unit_amount;
    }, 0);
    const totalTax = items.reduce((sum, item) => {
      return sum + (item.tax_amount || 0);
    }, 0);
    const finalAmount = subtotal + totalTax;

    return { subtotal, totalTax, finalAmount };
  };

  const { subtotal, totalTax, finalAmount } = calculateTotals();

  // Check if student is pre-selected (either from bill or preSelectedStudent prop)
  const isStudentPreSelected = !!(
    bill?.student ||
    preSelectedStudent ||
    completeStudentData
  );

  useEffect(() => {
    loadInstitutions();
  }, []);

  useEffect(() => {
    if (watchedValues.institution_id) {
      loadItemCategories(watchedValues.institution_id);
    } else {
      setItemCategories([]);
    }
  }, [watchedValues.institution_id]);

  // Reset form when bill changes (for edit mode)
  useEffect(() => {
    if (bill) {
      const formValues = {
        student_id: bill.student_id,
        institution_id: bill.institution_id,
        due_date: bill.due_date ? new Date(bill.due_date) : new Date(),
        billing_items: [
          {
            item_category_id: bill.item_category_id || '',
            unit_amount: bill.unit_amount || 0,
            tax_amount: bill.tax_amount || 0
          }
        ],
        overall_remarks: bill.remarks || '',
        is_recurring: bill.is_recurring || false,
        recurrence_pattern: bill.recurrence_pattern || undefined,
        number_of_recurrences: bill.number_of_recurrences || undefined
      };

      // Reset form with bill data
      form.reset(formValues);

      // Load item categories for the bill's institution
      if (bill.institution_id) {
        loadItemCategories(bill.institution_id);
      }

      // Use complete student data if available, otherwise fallback to bill.student
      const studentToUse = completeStudentData || bill.student;
      if (studentToUse) {
        setSelectedStudent(studentToUse);
        setStudentSearchQuery(
          `${
            [studentToUse.first_name, studentToUse.last_name]
              .filter(Boolean)
              .join(' ') || 'N/A'
          } (${studentToUse.roll_number || 'N/A'})`
        );
      }
    } else if (preSelectedStudent) {
      // Handle pre-selected student from query parameter
      const formValues = {
        student_id: preSelectedStudent.id,
        institution_id: preSelectedStudent.institution_id,
        due_date: undefined,
        billing_items: [
          {
            item_category_id: '',
            unit_amount: 0,
            tax_amount: 0
          }
        ],
        overall_remarks: '',
        is_recurring: false,
        recurrence_pattern: undefined,
        number_of_recurrences: undefined
      };

      form.reset(formValues);
      setSelectedStudent(preSelectedStudent);
      setStudentSearchQuery(
        `${
          [preSelectedStudent.first_name, preSelectedStudent.last_name]
            .filter(Boolean)
            .join(' ') || 'N/A'
        } (${preSelectedStudent.roll_number || 'N/A'})`
      );
    }
  }, [bill, preSelectedStudent, form, completeStudentData]);

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

  const loadItemCategories = async (institutionId: string) => {
    try {
      setIsLoadingItemCategories(true);
      const categories =
        await BillingItemCategoryService.getBillingItemCategoriesByInstitution(
          institutionId,
          true
        );
      setItemCategories(categories);
    } catch (error) {
      console.error('Error loading item categories:', error);
    } finally {
      setIsLoadingItemCategories(false);
    }
  };

  const handleStudentSelect = (student: any) => {
    setSelectedStudent(student);
    setStudentSearchQuery(
      `${
        [student.first_name, student.last_name].filter(Boolean).join(' ') ||
        'N/A'
      } (${student.roll_number || 'N/A'})`
    );
    form.setValue('student_id', student.id);
  };

  const onSubmit = async (data: StudentBillFormData) => {
    try {
      // For now, we'll create separate bills for each item
      // In the future, this could be enhanced to support true multi-item bills
      const firstItem = data.billing_items[0];

      // Get the selected category name for default description
      const selectedCategory = itemCategories.find(cat => cat.id === firstItem.item_category_id);
      const defaultDescription = selectedCategory?.item_category_name || 'Billing Item';

      const submitData: CreateStudentBillDto = {
        student_id: data.student_id,
        institution_id: data.institution_id,
        item_category_id: firstItem.item_category_id,
        bill_description: defaultDescription, // Use category name as default description
        due_date: format(data.due_date, 'yyyy-MM-dd'),
        quantity: 1, // Default quantity to 1 since it's removed from form
        unit_amount: firstItem.unit_amount,
        tax_amount: firstItem.tax_amount,
        total_amount: firstItem.unit_amount,
        final_amount: firstItem.unit_amount + firstItem.tax_amount,
        remarks: data.overall_remarks,
        is_recurring: data.is_recurring,
        recurrence_pattern: data.recurrence_pattern,
        number_of_recurrences: data.number_of_recurrences
      };

      if (bill) {
        const result = await updateStudentBill.mutateAsync({
          id: bill.id,
          billData: submitData
        });

        if (onSuccess) {
          onSuccess();
        } else {
          // Redirect to the updated bill details page
          router.push(`/billing/schedule/students/${bill.student_id}`);
        }
      } else {
        const result = await createStudentBill.mutateAsync(submitData);

        if (onSuccess) {
          onSuccess();
        } else {
          // If bill was created from student details page, redirect back to that student's page
          if (preSelectedStudent) {
            router.push(`/billing/schedule/students/${preSelectedStudent.id}`);
          } else {
            router.push('/billing/schedule');
          }
        }
      }
    } catch (error) {
      console.error('Error saving bill:', error);

      // Show user-friendly error message
      alert(
        `Failed to ${bill ? 'update' : 'create'} bill: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  };

  const addBillingItem = () => {
    append({
      item_category_id: '',
      unit_amount: 0,
      tax_amount: 0
    });
  };

  const removeBillingItem = (index: number) => {
    if (fields.length > 1) {
      remove(index);
    }
  };

  const isLoading = createStudentBill.isPending || updateStudentBill.isPending;

  return (
    <div className='space-y-8'>
      {/* Student Information Header */}
      {selectedStudent && (
        <Card className='border-2 border-blue-200 dark:border-blue-800'>
          <CardHeader className='bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950'>
            <CardTitle className='flex items-center gap-3 text-xl'>
              <div className='p-2 bg-blue-100 dark:bg-blue-900 rounded-full'>
                <User className='h-6 w-6 text-blue-600 dark:text-blue-400' />
              </div>
              Student Information
              {isStudentPreSelected && (
                <Badge
                  variant='outline'
                  className='text-blue-700 border-blue-300 bg-blue-50'
                >
                  Pre-selected
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className='p-6'>
            <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
              {/* Basic Information */}
              <div>
                <label className='text-sm font-medium text-muted-foreground'>
                  Student Name
                </label>
                <p className='text-base font-semibold text-gray-900 dark:text-gray-100'>
                  {[selectedStudent.first_name, selectedStudent.last_name]
                    .filter(Boolean)
                    .join(' ') || 'N/A'}
                </p>
              </div>

              <div>
                <label className='text-sm font-medium text-muted-foreground'>
                  Roll Number
                </label>
                <p className='font-medium'>
                  {selectedStudent.roll_number || 'N/A'}
                </p>
              </div>

              <div>
                <label className='text-sm font-medium text-muted-foreground'>
                  Email
                </label>
                <p className='font-medium text-sm break-all'>
                  {selectedStudent.college_email || 'N/A'}
                </p>
              </div>

              <div>
                <label className='text-sm font-medium text-muted-foreground'>
                  Mobile
                </label>
                <p className='font-medium'>
                  {selectedStudent.mobile_number ||
                    selectedStudent.student_mobile ||
                    'N/A'}
                </p>
              </div>

              {/* Academic Information */}
              <div>
                <label className='text-sm font-medium text-muted-foreground'>
                  Institution
                </label>
                <p className='font-medium'>
                  {selectedStudent.institution?.name || 'N/A'}
                </p>
              </div>

              <div>
                <label className='text-sm font-medium text-muted-foreground'>
                  Academic Year
                </label>
                <p className='font-medium'>
                  {selectedStudent.academic_year?.academic_year_name || 'N/A'}
                </p>
              </div>

              <div>
                <label className='text-sm font-medium text-muted-foreground'>
                  Degree
                </label>
                <p className='font-medium'>
                  {selectedStudent.degree?.degree_name || 'N/A'}
                </p>
              </div>

              <div>
                <label className='text-sm font-medium text-muted-foreground'>
                  Department
                </label>
                <p className='font-medium'>
                  {selectedStudent.department?.department_name || 'N/A'}
                </p>
              </div>

              <div>
                <label className='text-sm font-medium text-muted-foreground'>
                  Program
                </label>
                <p className='font-medium'>
                  {selectedStudent.program?.program_name || 'N/A'}
                </p>
              </div>

              <div>
                <label className='text-sm font-medium text-muted-foreground'>
                  Semester
                </label>
                <p className='font-medium'>
                  {selectedStudent.semester?.semester_name || 'N/A'}
                </p>
              </div>

              <div>
                <label className='text-sm font-medium text-muted-foreground'>
                  Section
                </label>
                <p className='font-medium'>
                  {selectedStudent.section?.section_name || 'N/A'}
                </p>
              </div>
            </div>

            <Separator className='my-4' />

            <div className='flex items-center justify-between'>
              <div className='flex items-center gap-4'>
                <Badge
                  variant='outline'
                  className='text-orange-600 border-orange-300'
                >
                  Outstanding: ₹
                  {selectedStudent.outstanding_amount?.toLocaleString() || '0'}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-8'>
          {/* Student Selection (only when not pre-selected) */}
          {!isStudentPreSelected && (
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <Search className='h-5 w-5' />
                  Select Student
                </CardTitle>
              </CardHeader>
              <CardContent className='space-y-4'>
                <FormField
                  control={form.control}
                  name='institution_id'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Institution</FormLabel>
                      <Select
                        onValueChange={(value) => {
                          field.onChange(value);
                          setSelectedStudent(null);
                          setStudentSearchQuery('');
                          form.setValue('student_id', '');
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
                              {institution.name} ({institution.counselling_code}
                              )
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className='space-y-2'>
                  <FormLabel>Search Student</FormLabel>
                  <div className='relative'>
                    <Search className='absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4' />
                    <Input
                      placeholder='Search by name, roll number, mobile...'
                      value={studentSearchQuery}
                      onChange={(e) => setStudentSearchQuery(e.target.value)}
                      className='pl-10'
                      disabled={!watchedValues.institution_id}
                    />
                  </div>

                  {searchResults &&
                    searchResults.length > 0 &&
                    studentSearchQuery && (
                      <div className='border rounded-md max-h-48 overflow-y-auto'>
                        {searchResults.map((student) => (
                          <div
                            key={student.id}
                            className='p-3 hover:bg-muted cursor-pointer border-b last:border-b-0'
                            onClick={() => handleStudentSelect(student)}
                          >
                            <div className='font-medium'>
                              {`${student.first_name} ${student.last_name}`}
                            </div>
                            <div className='text-sm text-muted-foreground'>
                              {student.roll_number} • Outstanding: ₹
                              {student.outstanding_amount}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Hidden form fields for pre-selected student */}
          {isStudentPreSelected && (
            <>
              <FormField
                control={form.control}
                name='institution_id'
                render={({ field }) => (
                  <FormItem className='hidden'>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='student_id'
                render={({ field }) => (
                  <FormItem className='hidden'>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </>
          )}

          {/* Bill Information */}
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <FileText className='h-5 w-5' />
                Bill Information
              </CardTitle>
            </CardHeader>
            <CardContent className='space-y-4'>
              <FormField
                control={form.control}
                name='due_date'
                render={({ field }) => (
                  <FormItem className='flex flex-col'>
                    <FormLabel>Due Date *</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant='outline'
                            className={cn(
                              'w-full max-w-sm pl-3 text-left font-normal',
                              !field.value && 'text-muted-foreground'
                            )}
                          >
                            {field.value ? (
                              format(field.value, 'PPP')
                            ) : (
                              <span>Pick a due date</span>
                            )}
                            <CalendarIcon className='ml-auto h-4 w-4 opacity-50' />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className='w-auto p-0' align='start'>
                        <Calendar
                          mode='single'
                          selected={field.value}
                          onSelect={field.onChange}
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

          {/* Billing Items Table */}
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center justify-between'>
                <div className='flex items-center gap-2'>
                  <ShoppingCart className='h-5 w-5' />
                  Billing Items
                </div>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={addBillingItem}
                  className='flex items-center gap-2'
                >
                  <Plus className='h-4 w-4' />
                  Add Item
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className='space-y-6'>
                {fields.map((field, index) => (
                  <Card key={field.id} className='border-l-4 border-l-blue-500'>
                    <CardHeader className='pb-3'>
                      <CardTitle className='flex items-center justify-between text-base'>
                        <span>Item #{index + 1}</span>
                        {fields.length > 1 && (
                          <Button
                            type='button'
                            variant='ghost'
                            size='sm'
                            onClick={() => removeBillingItem(index)}
                            className='text-red-600 hover:text-red-700 hover:bg-red-50'
                          >
                            <Trash2 className='h-4 w-4' />
                          </Button>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className='space-y-4'>
                      <FormField
                        control={form.control}
                        name={`billing_items.${index}.item_category_id`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Item Category *</FormLabel>
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
                                  <SelectValue placeholder='Select category' />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {itemCategories.map((category) => (
                                  <SelectItem
                                    key={category.id}
                                    value={category.id}
                                  >
                                    {category.item_category_name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                        <FormField
                          control={form.control}
                          name={`billing_items.${index}.unit_amount`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Base Amount (₹) *</FormLabel>
                              <FormControl>
                                <Input
                                  type='number'
                                  min='0'
                                  step='0.01'
                                  placeholder='0.00'
                                  {...field}
                                  value={field.value?.toString() || ''}
                                  onChange={(e) =>
                                    field.onChange(
                                      parseFloat(e.target.value) || 0
                                    )
                                  }
                                  onWheel={(e) => e.currentTarget.blur()}
                                  className='[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none'
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name={`billing_items.${index}.tax_amount`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Tax Amount (₹)</FormLabel>
                              <FormControl>
                                <Input
                                  type='number'
                                  min='0'
                                  step='0.01'
                                  placeholder='0.00'
                                  {...field}
                                  value={field.value?.toString() || ''}
                                  onChange={(e) =>
                                    field.onChange(
                                      parseFloat(e.target.value) || 0
                                    )
                                  }
                                  onWheel={(e) => e.currentTarget.blur()}
                                  className='[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none'
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      {/* Item Total Display */}
                      <div className='p-3 bg-gray-50 dark:bg-gray-800 rounded-lg'>
                        <div className='flex justify-between items-center text-sm'>
                          <span>Item Total:</span>
                          <span className='font-medium'>
                            ₹
                            {(
                              (watchedValues.billing_items?.[index]?.unit_amount || 0) +
                              (watchedValues.billing_items?.[index]?.tax_amount || 0)
                            ).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}

                {/* Grand Total Summary */}
                <Card className='bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-950 dark:to-blue-950 border-2 border-green-200 dark:border-green-800'>
                  <CardHeader>
                    <CardTitle className='flex items-center gap-2 text-green-800 dark:text-green-200'>
                      <Calculator className='h-5 w-5' />
                      Bill Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className='space-y-3'>
                      <div className='flex justify-between text-sm'>
                        <span>Subtotal:</span>
                        <span className='font-medium'>
                          ₹{subtotal.toFixed(2)}
                        </span>
                      </div>
                      <div className='flex justify-between text-sm'>
                        <span>Total Tax:</span>
                        <span className='font-medium'>
                          ₹{totalTax.toFixed(2)}
                        </span>
                      </div>
                      <Separator />
                      <div className='flex justify-between text-lg font-bold text-green-700 dark:text-green-300'>
                        <span>Final Amount:</span>
                        <span>₹{finalAmount.toFixed(2)}</span>
                      </div>
                      <div className='text-xs text-muted-foreground text-center'>
                        Total for {fields.length} item
                        {fields.length > 1 ? 's' : ''}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>

          {/* Additional Settings */}
          <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
            {/* Recurring Settings */}
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <RefreshCw className='h-5 w-5' />
                  Recurring Settings
                </CardTitle>
              </CardHeader>
              <CardContent className='space-y-4'>
                <FormField
                  control={form.control}
                  name='is_recurring'
                  render={({ field }) => (
                    <FormItem className='flex flex-row items-start space-x-3 space-y-0'>
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className='space-y-1 leading-none'>
                        <FormLabel>Make this a recurring bill</FormLabel>
                        <FormDescription>
                          Automatically create future bills based on the
                          recurrence pattern
                        </FormDescription>
                      </div>
                    </FormItem>
                  )}
                />

                {watchedValues.is_recurring && (
                  <>
                    <FormField
                      control={form.control}
                      name='recurrence_pattern'
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Recurrence Pattern</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder='Select pattern' />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value='monthly'>Monthly</SelectItem>
                              <SelectItem value='quarterly'>
                                Quarterly
                              </SelectItem>
                              <SelectItem value='yearly'>Yearly</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name='number_of_recurrences'
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Number of Recurrences</FormLabel>
                          <FormControl>
                            <Input
                              type='number'
                              min='1'
                              max='100'
                              placeholder='e.g., 12 for 12 months'
                              {...field}
                              onChange={(e) =>
                                field.onChange(
                                  parseInt(e.target.value) || undefined
                                )
                              }
                              onWheel={(e) => e.currentTarget.blur()}
                              className='[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none'
                            />
                          </FormControl>
                          <FormDescription>
                            Total number of bills to create (including this one)
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}
              </CardContent>
            </Card>

            {/* Overall Remarks */}
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <FileText className='h-5 w-5' />
                  Additional Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <FormField
                  control={form.control}
                  name='overall_remarks'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Overall Remarks</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder='Any additional notes or remarks for the entire bill'
                          rows={4}
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        These remarks will apply to the entire bill
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          </div>

          {/* Form Actions */}
          <Card className='border-t-4 border-t-blue-500'>
            <CardContent className='pt-6'>
              <div className='flex flex-col sm:flex-row justify-end gap-4'>
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => router.back()}
                  disabled={isLoading}
                  className='w-full sm:w-auto'
                >
                  Cancel
                </Button>
                <Button
                  type='submit'
                  disabled={isLoading || fields.length === 0}
                  className='w-full sm:w-auto min-w-[200px]'
                >
                  {isLoading ? (
                    <div className='flex items-center gap-2'>
                      <RefreshCw className='h-4 w-4 animate-spin' />
                      {bill ? 'Updating Bill...' : 'Creating Bill...'}
                    </div>
                  ) : (
                    <div className='flex items-center gap-2'>
                      <IndianRupee className='h-4 w-4' />
                      {bill
                        ? 'Update Bill'
                        : `Create Bill (₹${finalAmount.toFixed(2)})`}
                    </div>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </Form>
    </div>
  );
}
