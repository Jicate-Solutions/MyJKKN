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
  DollarSign,
  Search,
  Plus,
  Trash2
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { BillingItemCategoryService } from '@/lib/services/billing/categories/billing-item-category-service';
import { useStudentsForBulkOperations } from '@/hooks/billing/use-student-search';
import { useBulkCreateStudentBills } from '@/hooks/billing/use-student-bills';
import { usePermissions } from '@/hooks/use-permissions';
import type { Institution } from '@/types/organizations';
import type { BillingItemCategory } from '@/types/billing';
import type { StudentForBilling } from '@/types/billing-schedule';

const bulkBillSchema = z.object({
  institution_id: z.string().min(1, 'Institution is required'),
  department_id: z.string().optional(),
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
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [itemCategories, setItemCategories] = useState<BillingItemCategory[]>(
    []
  );
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [isLoadingInstitutions, setIsLoadingInstitutions] = useState(true);
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
    watchedValues.department_id,
    watchedValues.semester_id
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

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6'>
            <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
              {/* Left Column - Bill Details */}
              <div className='space-y-6'>
                <Card>
                  <CardHeader>
                    <CardTitle className='flex items-center gap-2'>
                      <Building className='h-5 w-5' />
                      Institution & Category
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

                    <FormField
                      control={form.control}
                      name='item_category_id'
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Item Category</FormLabel>
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
                                  {category.item_category_name}
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

                <Card>
                  <CardHeader>
                    <CardTitle className='flex items-center gap-2'>
                      <DollarSign className='h-5 w-5' />
                      Amount Details
                    </CardTitle>
                  </CardHeader>
                  <CardContent className='space-y-4'>
                    <div className='grid grid-cols-2 gap-4'>
                      <FormField
                        control={form.control}
                        name='quantity'
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Quantity</FormLabel>
                            <FormControl>
                              <Input
                                type='number'
                                min='1'
                                {...field}
                                onChange={(e) =>
                                  field.onChange(parseInt(e.target.value) || 1)
                                }
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name='unit_amount'
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Unit Amount (₹)</FormLabel>
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
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name='tax_amount'
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
                        <span>Total Amount:</span>
                        <span>₹{totalAmount.toFixed(2)}</span>
                      </div>
                      <div className='flex justify-between text-sm'>
                        <span>Tax Amount:</span>
                        <span>
                          ₹{(watchedValues.tax_amount || 0).toFixed(2)}
                        </span>
                      </div>
                      <div className='flex justify-between font-medium border-t pt-2'>
                        <span>Final Amount:</span>
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

              {/* Right Column - Student Selection */}
              <div className='space-y-6'>
                <Card>
                  <CardHeader>
                    <CardTitle className='flex items-center gap-2'>
                      <Users className='h-5 w-5' />
                      Select Students
                    </CardTitle>
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
                          : 'Select an institution to view students'}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
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
