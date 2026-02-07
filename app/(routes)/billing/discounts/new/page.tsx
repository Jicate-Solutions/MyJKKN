'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Save, Percent, AlertCircle, Award } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { usePermissions } from '@/hooks/use-permissions';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { BeatLoader } from 'react-spinners';
import { toast } from 'react-hot-toast';
import { BillingReceiptService } from '@/lib/services/billing/receipts/billing-receipt-service';
import { useCreateBillingDiscount } from '@/hooks/billing/use-billing-discounts';
import type {
  DiscountCategory,
  DiscountType,
  CreateDiscountDto,
  OutcomeCriteria,
  OutcomeCriteriaType
} from '@/types/billing-schedule';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';

export default function NewDiscountPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const billId = searchParams.get('bill_id');
  const billIds = searchParams.get('bill_ids'); // For bulk discount application
  const studentId = searchParams.get('student_id');

  const [selectedBills, setSelectedBills] = useState<any[]>([]);
  const [isLoadingBills, setIsLoadingBills] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<Partial<CreateDiscountDto>>({
    discount_category: 'merit_scholarship',
    discount_type: 'percentage',
    discount_value: 0,
    effective_date: new Date().toISOString().split('T')[0]
  });
  const [isOutcomeBased, setIsOutcomeBased] = useState(false);
  const [outcomeCriteria, setOutcomeCriteria] = useState<Partial<OutcomeCriteria>>({
    type: 'competency_achievement',
    minimum_level: 'intermediate',
    min_proficiency: 'intermediate',
    min_score: 0,
    evaluation_period_days: 90
  });

  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions();

  const canApplyDiscounts =
    isSuperAdmin || canAccess('billing.discounts', 'create');

  const createDiscountMutation = useCreateBillingDiscount();

  useEffect(() => {
    if (billId || billIds) {
      loadBillDetails();
    }
    // loadBillDetails is defined inline and would cause infinite loop if added to deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billId, billIds]);

  const loadBillDetails = async () => {
    try {
      setIsLoadingBills(true);
      const billsToLoad = billIds
        ? billIds.split(',')
        : [billId].filter((id): id is string => id !== null);

      if (billsToLoad.length === 0) return;

      const bills = await BillingReceiptService.getBillsByIds(billsToLoad);
      setSelectedBills(bills);
    } catch (error) {
      console.error('Error loading bill details:', error);
      toast.error('Failed to load bill details');
    } finally {
      setIsLoadingBills(false);
    }
  };

  // Show loading state while permissions are loading
  if (permissionsLoading) {
    return (
      <ContentLayout title='Apply Scholarship'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  if (!canApplyDiscounts) {
    return (
      <ContentLayout title='Apply Scholarship'>
        <div className='text-center py-8'>
          <p className='text-destructive'>
            You don&apos;t have permission to apply discounts.
          </p>
        </div>
      </ContentLayout>
    );
  }

  const handleInputChange = (field: keyof CreateDiscountDto, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value
    }));
  };

  const calculateDiscountAmount = (billAmount: number) => {
    if (formData.discount_type === 'percentage') {
      return (billAmount * (formData.discount_value || 0)) / 100;
    } else {
      return formData.discount_value || 0;
    }
  };

  const totalBillAmount = selectedBills.reduce(
    (sum, bill) => sum + (bill.total_amount || bill.final_amount),
    0
  );

  const totalDiscountAmount = selectedBills.reduce(
    (sum, bill) =>
      sum + calculateDiscountAmount(bill.total_amount || bill.final_amount),
    0
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.discount_category) {
      toast.error('Please select a discount category');
      return;
    }

    if (!formData.discount_type) {
      toast.error('Please select a discount type');
      return;
    }

    if (!formData.discount_value || formData.discount_value <= 0) {
      toast.error('Please enter a valid discount value');
      return;
    }

    if (!formData.discount_reason || formData.discount_reason.trim() === '') {
      toast.error('Please provide a reason for the discount');
      return;
    }

    if (selectedBills.length === 0) {
      toast.error('No bills selected for discount application');
      return;
    }

    try {
      setIsSubmitting(true);

      // Apply discount to each selected bill
      const discountPromises = selectedBills.map(async (bill) => {
        const discountData: CreateDiscountDto = {
          bill_id: bill.id,
          discount_category: formData.discount_category!,
          discount_type: formData.discount_type!,
          discount_value: formData.discount_value!,
          discount_reason: formData.discount_reason!,
          effective_date: formData.effective_date!,
          expiry_date: formData.expiry_date,
          // Outcome-based discount fields
          is_outcome_based: isOutcomeBased,
          outcome_criteria: isOutcomeBased ? outcomeCriteria as OutcomeCriteria : undefined
        };

        // Create the discount using the mutation
        return await createDiscountMutation.mutateAsync(discountData);
      });

      await Promise.all(discountPromises);

      toast.success(
        `Discount applied successfully to ${selectedBills.length} bill(s)`
      );
      router.push('/billing/discounts');
    } catch (error) {
      console.error('Error applying discount:', error);
      toast.error('Failed to apply discount');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  return (
    <ContentLayout title='Apply Scholarship'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Billing', href: '/billing/schedule' },
          { label: 'Scholarships', href: '/billing/discounts' },
          { label: 'Apply Scholarship', href: '/billing/discounts/new' }
        ]}
      />

      <div className='space-y-6 mt-4'>
        {/* Header */}
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div className='flex items-center gap-4'>
            <Button variant='outline' size='sm' onClick={() => router.back()}>
              <ArrowLeft className='h-4 w-4' />
            </Button>
            <div>
              <h1 className='text-2xl font-bold py-1'>Apply Scholarship</h1>
              <p className='text-sm sm:text-base text-muted-foreground'>
                Apply scholarship to selected student bills
              </p>
            </div>
          </div>
        </div>

        {/* Selected Bills Section */}
        {selectedBills.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <Percent className='h-5 w-5' />
                Selected Bills ({selectedBills.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className='rounded-md border'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Bill Description</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className='text-right'>Bill Amount</TableHead>
                      <TableHead className='text-right'>
                        Scholarship Amount
                      </TableHead>
                      <TableHead className='text-right'>Final Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedBills.map((bill) => {
                      const billAmount = bill.total_amount || bill.final_amount;
                      const discountAmount =
                        calculateDiscountAmount(billAmount);
                      const finalAmount = billAmount - discountAmount;

                      return (
                        <TableRow key={bill.id}>
                          <TableCell>
                            <div className='space-y-1'>
                              <div className='font-medium'>
                                {bill.bill_description}
                              </div>
                              <div className='text-xs text-muted-foreground'>
                                Bill ID: {bill.id}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className='space-y-1'>
                              <div className='text-sm font-medium'>
                                {bill.item_category?.item_category_name}
                              </div>
                              <div className='text-xs text-muted-foreground'>
                                {
                                  bill.item_category?.parent_category
                                    ?.parent_category_name
                                }{' '}
                                →{' '}
                                {
                                  bill.item_category?.sub_category
                                    ?.sub_category_name
                                }
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className='text-right'>
                            <div className='font-medium'>
                              {formatCurrency(billAmount)}
                            </div>
                          </TableCell>
                          <TableCell className='text-right'>
                            <div className='font-medium text-green-600'>
                              -{formatCurrency(discountAmount)}
                            </div>
                          </TableCell>
                          <TableCell className='text-right'>
                            <div className='font-medium text-blue-600'>
                              {formatCurrency(finalAmount)}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Summary */}
              <div className='mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg'>
                <div className='grid grid-cols-2 md:grid-cols-4 gap-4 text-sm'>
                  <div>
                    <span className='text-muted-foreground'>Total Bills:</span>
                    <div className='font-semibold'>{selectedBills.length}</div>
                  </div>
                  <div>
                    <span className='text-muted-foreground'>Total Amount:</span>
                    <div className='font-semibold'>
                      {formatCurrency(totalBillAmount)}
                    </div>
                  </div>
                  <div>
                    <span className='text-muted-foreground'>
                      Total Scholarship:
                    </span>
                    <div className='font-semibold text-green-600'>
                      -{formatCurrency(totalDiscountAmount)}
                    </div>
                  </div>
                  <div>
                    <span className='text-muted-foreground'>Final Amount:</span>
                    <div className='font-semibold text-blue-600'>
                      {formatCurrency(totalBillAmount - totalDiscountAmount)}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Discount Form */}
        <Card>
          <CardHeader>
            <CardTitle>Scholarship Details</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className='space-y-6'>
              <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                {/* Discount Category */}
                <div className='space-y-2'>
                  <Label htmlFor='discount_category'>
                    Scholarship Category *
                  </Label>
                  <Select
                    value={formData.discount_category || ''}
                    onValueChange={(value) =>
                      handleInputChange(
                        'discount_category',
                        value as DiscountCategory
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder='Select discount category' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='merit_scholarship'>
                        Merit Scholarship
                      </SelectItem>
                      <SelectItem value='financial_aid'>
                        Financial Aid
                      </SelectItem>
                      <SelectItem value='staff_quota'>Staff Quota</SelectItem>
                      <SelectItem value='sports_quota'>Sports Quota</SelectItem>
                      <SelectItem value='special_circumstances'>
                        Special Circumstances
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Discount Type */}
                <div className='space-y-2'>
                  <Label htmlFor='discount_type'>Scholarship Type *</Label>
                  <Select
                    value={formData.discount_type || ''}
                    onValueChange={(value) =>
                      handleInputChange('discount_type', value as DiscountType)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder='Select discount type' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='percentage'>Percentage</SelectItem>
                      <SelectItem value='amount'>Fixed Amount</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Discount Value */}
                <div className='space-y-2'>
                  <Label htmlFor='discount_value'>
                    Scholarship Value *{' '}
                    {formData.discount_type === 'percentage' ? '(%)' : '(₹)'}
                  </Label>
                  <Input
                    id='discount_value'
                    type='number'
                    step={
                      formData.discount_type === 'percentage' ? '0.01' : '1'
                    }
                    min='0'
                    max={
                      formData.discount_type === 'percentage'
                        ? '100'
                        : undefined
                    }
                    placeholder={
                      formData.discount_type === 'percentage' ? '10.5' : '1000'
                    }
                    value={formData.discount_value || ''}
                    onChange={(e) =>
                      handleInputChange(
                        'discount_value',
                        parseFloat(e.target.value)
                      )
                    }
                    required
                  />
                </div>

                {/* Effective Date */}
                <div className='space-y-2'>
                  <Label htmlFor='effective_date'>Effective Date *</Label>
                  <Input
                    id='effective_date'
                    type='date'
                    value={formData.effective_date || ''}
                    onChange={(e) =>
                      handleInputChange('effective_date', e.target.value)
                    }
                    required
                  />
                </div>

                {/* Expiry Date */}
                <div className='space-y-2'>
                  <Label htmlFor='expiry_date'>Expiry Date (Optional)</Label>
                  <Input
                    id='expiry_date'
                    type='date'
                    value={formData.expiry_date || ''}
                    onChange={(e) =>
                      handleInputChange('expiry_date', e.target.value)
                    }
                    min={formData.effective_date}
                  />
                </div>
              </div>

              {/* Discount Reason */}
              <div className='space-y-2'>
                <Label htmlFor='discount_reason'>Scholarship Reason *</Label>
                <Textarea
                  id='discount_reason'
                  placeholder='Provide detailed reason for applying this scholarship'
                  value={formData.discount_reason || ''}
                  onChange={(e) =>
                    handleInputChange('discount_reason', e.target.value)
                  }
                  rows={3}
                  required
                />
              </div>

              {/* Outcome-Based Discount Toggle */}
              <div className='space-y-4'>
                <div className='flex items-center justify-between p-4 border rounded-lg bg-muted/30'>
                  <div className='space-y-0.5'>
                    <Label htmlFor='outcome-toggle' className='text-base font-medium flex items-center gap-2'>
                      <Award className='h-4 w-4 text-amber-600' />
                      Outcome-Based Discount
                    </Label>
                    <p className='text-sm text-muted-foreground'>
                      Link this discount to student learning outcomes or competency achievements
                    </p>
                  </div>
                  <Switch
                    id='outcome-toggle'
                    checked={isOutcomeBased}
                    onCheckedChange={setIsOutcomeBased}
                  />
                </div>

                {/* Outcome Criteria Fields (shown when toggle is on) */}
                {isOutcomeBased && (
                  <Card className='border-amber-200 bg-amber-50/50'>
                    <CardHeader className='pb-3'>
                      <CardTitle className='text-base flex items-center gap-2'>
                        <Award className='h-4 w-4 text-amber-600' />
                        Outcome Criteria
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                        {/* Criteria Type */}
                        <div className='space-y-2'>
                          <Label htmlFor='outcome_type'>Achievement Type *</Label>
                          <Select
                            value={outcomeCriteria.type || 'competency_achievement'}
                            onValueChange={(value) =>
                              setOutcomeCriteria((prev) => ({
                                ...prev,
                                type: value as OutcomeCriteriaType
                              }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder='Select achievement type' />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value='competency_achievement'>Competency Achieved</SelectItem>
                              <SelectItem value='attendance'>Attendance Target Met</SelectItem>
                              <SelectItem value='cgpa'>CGPA Threshold Met</SelectItem>
                              <SelectItem value='industry_readiness'>Industry Readiness Score</SelectItem>
                              <SelectItem value='placement'>Placement Secured</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Required Level */}
                        <div className='space-y-2'>
                          <Label htmlFor='minimum_level'>Required Proficiency Level</Label>
                          <Select
                            value={outcomeCriteria.minimum_level || 'intermediate'}
                            onValueChange={(value) =>
                              setOutcomeCriteria((prev) => ({
                                ...prev,
                                minimum_level: value as 'novice' | 'beginner' | 'intermediate' | 'advanced' | 'expert'
                              }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder='Select proficiency level' />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value='novice'>Novice</SelectItem>
                              <SelectItem value='beginner'>Beginner</SelectItem>
                              <SelectItem value='intermediate'>Intermediate</SelectItem>
                              <SelectItem value='advanced'>Advanced</SelectItem>
                              <SelectItem value='expert'>Expert</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Minimum Score / Threshold */}
                        {(outcomeCriteria.type === 'attendance' || outcomeCriteria.type === 'cgpa' || outcomeCriteria.type === 'industry_readiness') && (
                          <div className='space-y-2'>
                            <Label htmlFor='minimum_percentage'>
                              Minimum {outcomeCriteria.type === 'cgpa' ? 'CGPA Value' : 'Percentage'} *
                            </Label>
                            <Input
                              id='minimum_percentage'
                              type='number'
                              step='0.01'
                              min='0'
                              max={outcomeCriteria.type === 'cgpa' ? '10' : '100'}
                              placeholder={outcomeCriteria.type === 'cgpa' ? '7.5' : '75'}
                              value={outcomeCriteria.minimum_percentage || ''}
                              onChange={(e) =>
                                setOutcomeCriteria((prev) => ({
                                  ...prev,
                                  minimum_percentage: parseFloat(e.target.value)
                                }))
                              }
                            />
                          </div>
                        )}

                        {/* Industry Readiness Threshold */}
                        {outcomeCriteria.type === 'industry_readiness' && (
                          <div className='space-y-2'>
                            <Label htmlFor='readiness_threshold'>Industry Readiness Threshold (0-100)</Label>
                            <Input
                              id='readiness_threshold'
                              type='number'
                              step='1'
                              min='0'
                              max='100'
                              placeholder='70'
                              value={outcomeCriteria.industry_readiness_threshold || ''}
                              onChange={(e) =>
                                setOutcomeCriteria((prev) => ({
                                  ...prev,
                                  industry_readiness_threshold: parseInt(e.target.value)
                                }))
                              }
                            />
                          </div>
                        )}

                        {/* Competency IDs (text input for now) */}
                        {(outcomeCriteria.type === 'competency_achievement') && (
                          <div className='space-y-2 md:col-span-2'>
                            <Label htmlFor='required_competencies'>
                              Required Competency IDs (comma-separated)
                            </Label>
                            <Input
                              id='required_competencies'
                              type='text'
                              placeholder='e.g., comp-001, comp-002'
                              value={(outcomeCriteria.required_competencies || []).join(', ')}
                              onChange={(e) =>
                                setOutcomeCriteria((prev) => ({
                                  ...prev,
                                  required_competencies: e.target.value
                                    .split(',')
                                    .map((s) => s.trim())
                                    .filter(Boolean)
                                }))
                              }
                            />
                            <p className='text-xs text-muted-foreground'>
                              Enter competency IDs from the competency catalog
                            </p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Validation Warning */}
              {totalDiscountAmount > totalBillAmount && (
                <div className='flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg'>
                  <AlertCircle className='h-4 w-4 text-red-600' />
                  <span className='text-sm text-red-600'>
                    Warning: Total scholarship amount exceeds total bill amount
                  </span>
                </div>
              )}

              {/* Submit Button */}
              <div className='flex justify-end gap-4'>
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => router.back()}
                >
                  Cancel
                </Button>
                <Button
                  type='submit'
                  disabled={
                    isSubmitting ||
                    createDiscountMutation.isPending ||
                    totalDiscountAmount > totalBillAmount
                  }
                  className='min-w-[120px]'
                >
                  {isSubmitting || createDiscountMutation.isPending ? (
                    <>
                      <BeatLoader size={8} color='white' />
                      <span className='ml-2'>Applying...</span>
                    </>
                  ) : (
                    <>
                      <Save className='mr-2 h-4 w-4' />
                      Apply Scholarship
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
