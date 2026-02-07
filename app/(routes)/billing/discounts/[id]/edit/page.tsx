'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
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
import {
  useBillingDiscount,
  useUpdateBillingDiscount
} from '@/hooks/billing/use-billing-discounts';
import type {
  DiscountCategory,
  DiscountType,
  UpdateDiscountDto,
  OutcomeCriteria,
  OutcomeCriteriaType
} from '@/types/billing-schedule';

export default function EditDiscountPage() {
  const router = useRouter();
  const params = useParams();
  const discountId = params.id as string;

  const [formData, setFormData] = useState<Partial<UpdateDiscountDto>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOutcomeBased, setIsOutcomeBased] = useState(false);
  const [outcomeCriteria, setOutcomeCriteria] = useState<Partial<OutcomeCriteria>>({
    type: 'competency_achievement',
    minimum_level: 'intermediate'
  });

  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions();

  const canEditDiscounts =
    isSuperAdmin || canAccess('billing.discounts', 'edit');

  const { data: discount, isLoading, error } = useBillingDiscount(discountId);
  const updateDiscountMutation = useUpdateBillingDiscount();

  // Initialize form data when discount is loaded
  useEffect(() => {
    if (discount) {
      setFormData({
        discount_category: discount.discount_category,
        discount_type: discount.discount_type,
        discount_value: discount.discount_value,
        discount_reason: discount.discount_reason,
        effective_date: discount.effective_date,
        expiry_date: discount.expiry_date
      });
      // Initialize outcome-based fields
      setIsOutcomeBased(discount.is_outcome_based || false);
      if (discount.outcome_criteria) {
        setOutcomeCriteria(discount.outcome_criteria);
      }
    }
  }, [discount]);

  // Show loading state while permissions are loading
  if (permissionsLoading || isLoading) {
    return (
      <ContentLayout title='Edit Discount'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  if (!canEditDiscounts) {
    return (
      <ContentLayout title='Edit Discount'>
        <div className='text-center py-8'>
          <p className='text-destructive'>
            You don&apos;t have permission to edit discounts.
          </p>
        </div>
      </ContentLayout>
    );
  }

  if (error) {
    return (
      <ContentLayout title='Edit Discount'>
        <div className='text-center py-8'>
          <p className='text-destructive'>
            Error loading discount: {error.message}
          </p>
          <Button
            variant='outline'
            onClick={() => router.back()}
            className='mt-4'
          >
            Go Back
          </Button>
        </div>
      </ContentLayout>
    );
  }

  if (!discount) {
    return (
      <ContentLayout title='Edit Discount'>
        <div className='text-center py-8'>
          <p className='text-muted-foreground'>Discount not found</p>
          <Button
            variant='outline'
            onClick={() => router.back()}
            className='mt-4'
          >
            Go Back
          </Button>
        </div>
      </ContentLayout>
    );
  }

  // Don't allow editing approved or rejected discounts
  if (discount.approval_status !== 'pending') {
    return (
      <ContentLayout title='Edit Discount'>
        <div className='text-center py-8'>
          <p className='text-muted-foreground'>
            Cannot edit discount with status:{' '}
            {discount.approval_status.toUpperCase()}
          </p>
          <Button
            variant='outline'
            onClick={() => router.back()}
            className='mt-4'
          >
            Go Back
          </Button>
        </div>
      </ContentLayout>
    );
  }

  const handleInputChange = (field: keyof UpdateDiscountDto, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value
    }));
  };

  const calculateDiscountAmount = () => {
    if (!discount?.bill?.total_amount || !formData.discount_value) return 0;

    if (formData.discount_type === 'percentage') {
      return (discount.bill.total_amount * formData.discount_value) / 100;
    } else {
      return formData.discount_value;
    }
  };

  const discountAmount = calculateDiscountAmount();
  const billAmount = discount?.bill?.total_amount || 0;

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

    if (discountAmount > billAmount) {
      toast.error('Discount amount cannot exceed bill amount');
      return;
    }

    try {
      setIsSubmitting(true);

      const updateData: UpdateDiscountDto = {
        ...formData,
        discount_amount: discountAmount
      };

      await updateDiscountMutation.mutateAsync({
        id: discountId,
        data: updateData
      });

      toast.success('Discount updated successfully');
      router.push(`/billing/discounts/${discountId}`);
    } catch (error) {
      console.error('Error updating discount:', error);
      toast.error('Failed to update discount');
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
    <ContentLayout title='Edit Scholarship'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Billing', href: '/billing/schedule' },
          { label: 'Scholarships', href: '/billing/discounts' },
          { label: 'Details', href: `/billing/discounts/${discountId}` },
          { label: 'Edit', href: `/billing/discounts/${discountId}/edit` }
        ]}
      />

      <div className='space-y-6 mt-4'>
        {/* Header */}
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div className='flex items-center gap-4'>
            <Button variant='outline' size='sm' onClick={() => router.back()}>
              <ArrowLeft className='mr-2 h-4 w-4' />
              Back
            </Button>
            <div>
              <h1 className='text-2xl font-bold py-1'>Edit Scholarship</h1>
              <p className='text-sm sm:text-base text-muted-foreground'>
                Update scholarship details for pending approval
              </p>
            </div>
          </div>
        </div>

        {/* Bill Information Summary */}
        {discount.bill && (
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <Percent className='h-5 w-5' />
                Associated Scholarship
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
                <div>
                  <Label className='text-sm font-medium text-muted-foreground'>
                    Scholarship Description
                  </Label>
                  <p className='font-medium'>
                    {discount.bill.bill_description}
                  </p>
                </div>
                <div>
                  <Label className='text-sm font-medium text-muted-foreground'>
                    Student
                  </Label>
                  <p className='font-medium'>
                    {`${discount.bill.student?.first_name} ${
                      discount.bill.student?.last_name || ''
                    }`.trim()}
                  </p>
                </div>
                <div>
                  <Label className='text-sm font-medium text-muted-foreground'>
                    Scholarship Amount
                  </Label>
                  <p className='font-medium'>
                    {formatCurrency(discount.bill.total_amount)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Edit Form */}
        <Card>
          <CardHeader>
            <CardTitle>Edit Scholarship Details</CardTitle>
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
                <div className='space-y-2 md:col-span-2'>
                  <Label htmlFor='expiry_date'>Expiry Date (Optional)</Label>
                  <Input
                    id='expiry_date'
                    type='date'
                    value={formData.expiry_date || ''}
                    onChange={(e) =>
                      handleInputChange('expiry_date', e.target.value)
                    }
                    min={formData.effective_date}
                    className='md:w-1/2'
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

              {/* Discount Calculation Preview */}
              {formData.discount_value && formData.discount_type && (
                <div className='p-4 bg-blue-50 border border-blue-200 rounded-lg'>
                  <h4 className='font-medium mb-3'>
                    Scholarship Calculation Preview
                  </h4>
                  <div className='grid grid-cols-2 md:grid-cols-4 gap-4 text-sm'>
                    <div>
                      <span className='text-muted-foreground'>
                        Bill Amount:
                      </span>
                      <div className='font-semibold'>
                        {formatCurrency(billAmount)}
                      </div>
                    </div>
                    <div>
                      <span className='text-muted-foreground'>
                        Scholarship:
                      </span>
                      <div className='font-semibold text-green-600'>
                        -{formatCurrency(discountAmount)}
                      </div>
                    </div>
                    <div>
                      <span className='text-muted-foreground'>
                        Final Amount:
                      </span>
                      <div className='font-semibold text-blue-600'>
                        {formatCurrency(billAmount - discountAmount)}
                      </div>
                    </div>
                    <div>
                      <span className='text-muted-foreground'>
                        Scholarship %:
                      </span>
                      <div className='font-semibold'>
                        {billAmount > 0
                          ? Math.round((discountAmount / billAmount) * 100)
                          : 0}
                        %
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Validation Warning */}
              {discountAmount > billAmount && (
                <div className='flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg'>
                  <AlertCircle className='h-4 w-4 text-red-600' />
                  <span className='text-sm text-red-600'>
                    Warning: Scholarship amount cannot exceed bill amount
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
                    updateDiscountMutation.isPending ||
                    discountAmount > billAmount
                  }
                  className='min-w-[120px]'
                >
                  {isSubmitting || updateDiscountMutation.isPending ? (
                    <>
                      <BeatLoader size={8} color='white' />
                      <span className='ml-2'>Updating...</span>
                    </>
                  ) : (
                    <>
                      <Save className='mr-2 h-4 w-4' />
                      Update Scholarship
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
