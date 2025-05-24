'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  CalendarIcon,
  Search,
  User,
  Building,
  DollarSign,
  RefreshCw
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
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { BillingItemCategoryService } from '@/lib/services/billing/categories/billing-item-category-service';
import { useSearchStudentsByQuery } from '@/hooks/billing/use-student-search';
import {
  useCreateStudentBill,
  useUpdateStudentBill
} from '@/hooks/billing/use-student-bills';
import type { Institution } from '@/types/organizations';
import type { BillingItemCategory } from '@/types/billing';
import type {
  StudentBill,
  CreateStudentBillDto
} from '@/types/billing-schedule';

const studentBillSchema = z.object({
  student_id: z.string().min(1, 'Student is required'),
  institution_id: z.string().min(1, 'Institution is required'),
  item_category_id: z.string().min(1, 'Item category is required'),
  bill_description: z.string().min(1, 'Bill description is required'),
  due_date: z.date({ required_error: 'Due date is required' }),
  quantity: z.number().min(1, 'Quantity must be at least 1').default(1),
  unit_amount: z.number().min(0, 'Unit amount must be positive'),
  tax_amount: z.number().min(0, 'Tax amount must be positive').default(0),
  remarks: z.string().optional(),
  is_recurring: z.boolean().default(false),
  recurrence_pattern: z.enum(['monthly', 'quarterly', 'yearly']).optional(),
  number_of_recurrences: z.number().min(1).max(100).optional()
});

type StudentBillFormData = z.infer<typeof studentBillSchema>;

interface StudentBillFormProps {
  bill?: StudentBill;
  onSuccess?: () => void;
}

export function StudentBillForm({ bill, onSuccess }: StudentBillFormProps) {
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

  const form = useForm<StudentBillFormData>({
    resolver: zodResolver(studentBillSchema),
    defaultValues: {
      student_id: bill?.student_id || '',
      institution_id: bill?.institution_id || '',
      item_category_id: bill?.item_category_id || '',
      bill_description: bill?.bill_description || '',
      due_date: bill?.due_date ? new Date(bill.due_date) : undefined,
      quantity: bill?.quantity || 1,
      unit_amount: bill?.unit_amount || 0,
      tax_amount: bill?.tax_amount || 0,
      remarks: bill?.remarks || '',
      is_recurring: bill?.is_recurring || false,
      recurrence_pattern: bill?.recurrence_pattern,
      number_of_recurrences: bill?.number_of_recurrences
    }
  });

  const { data: searchResults } = useSearchStudentsByQuery(
    studentSearchQuery,
    form.watch('institution_id'),
    10
  );

  const watchedValues = form.watch();
  const totalAmount =
    (watchedValues.quantity || 0) * (watchedValues.unit_amount || 0);
  const finalAmount = totalAmount + (watchedValues.tax_amount || 0);

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

  useEffect(() => {
    if (bill?.student) {
      setSelectedStudent(bill.student);
      setStudentSearchQuery(
        `${bill.student.student_name} (${bill.student.roll_number})`
      );
    }
  }, [bill]);

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
    setStudentSearchQuery(`${student.student_name} (${student.roll_number})`);
    form.setValue('student_id', student.id);
  };

  const onSubmit = async (data: StudentBillFormData) => {
    try {
      const submitData: CreateStudentBillDto = {
        ...data,
        due_date: format(data.due_date, 'yyyy-MM-dd'),
        total_amount: totalAmount,
        final_amount: finalAmount
      };

      if (bill) {
        await updateStudentBill.mutateAsync({
          id: bill.id,
          billData: submitData
        });
      } else {
        await createStudentBill.mutateAsync(submitData);
      }

      if (onSuccess) {
        onSuccess();
      } else {
        router.push('/billing/schedule');
      }
    } catch (error) {
      console.error('Error saving bill:', error);
    }
  };

  const isLoading = createStudentBill.isPending || updateStudentBill.isPending;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-6'>
        <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
          {/* Left Column */}
          <div className='space-y-6'>
            {/* Student Selection */}
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <User className='h-5 w-5' />
                  Student Information
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
                          form.setValue('item_category_id', '');
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
                              {student.student_name}
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

                {selectedStudent && (
                  <div className='p-3 bg-muted rounded-md'>
                    <div className='flex items-center justify-between'>
                      <div>
                        <div className='font-medium'>
                          {selectedStudent.student_name}
                        </div>
                        <div className='text-sm text-muted-foreground'>
                          {selectedStudent.roll_number}
                        </div>
                      </div>
                      <Badge variant='outline'>
                        Outstanding: ₹{selectedStudent.outstanding_amount || 0}
                      </Badge>
                    </div>
                  </div>
                )}

                <FormField
                  control={form.control}
                  name='student_id'
                  render={({ field }) => (
                    <FormItem className='hidden'>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Bill Details */}
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <Building className='h-5 w-5' />
                  Bill Details
                </CardTitle>
              </CardHeader>
              <CardContent className='space-y-4'>
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
                            <SelectItem key={category.id} value={category.id}>
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
                        <PopoverContent className='w-auto p-0' align='start'>
                          <Calendar
                            mode='single'
                            selected={field.value}
                            onSelect={field.onChange}
                            disabled={(date) =>
                              date < new Date(new Date().setHours(0, 0, 0, 0))
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
          </div>

          {/* Right Column */}
          <div className='space-y-6'>
            {/* Amount Details */}
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
                            {...field}
                            onChange={(e) =>
                              field.onChange(parseFloat(e.target.value) || 0)
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
                          {...field}
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
                    <span>₹{(watchedValues.tax_amount || 0).toFixed(2)}</span>
                  </div>
                  <div className='flex justify-between font-medium border-t pt-2'>
                    <span>Final Amount:</span>
                    <span>₹{finalAmount.toFixed(2)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

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

            {/* Additional Information */}
            <Card>
              <CardHeader>
                <CardTitle>Additional Information</CardTitle>
              </CardHeader>
              <CardContent>
                <FormField
                  control={form.control}
                  name='remarks'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Remarks</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder='Any additional notes or remarks'
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
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
          <Button type='submit' disabled={isLoading}>
            {isLoading ? 'Saving...' : bill ? 'Update Bill' : 'Create Bill'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
