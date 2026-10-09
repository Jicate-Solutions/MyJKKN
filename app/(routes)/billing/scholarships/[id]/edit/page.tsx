'use client';


import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Save, Percent, AlertCircle } from 'lucide-react';
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
import { usePermissions } from '@/hooks/use-permissions';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { BeatLoader } from 'react-spinners';
import { toast } from 'react-hot-toast';
import {
  useBillingScholarship,
  useUpdateBillingScholarship
} from '@/hooks/billing/use-billing-scholarships';
import { useScholarshipSetup } from '@/hooks/billing/use-scholarship-setup';
import { validateScholarshipSelection } from '@/lib/billing/scholarship-type-defaults';
import { ScholarshipSelectFields } from '../../_components/scholarship-select-fields';
import type {
  ScholarshipValueMode,
  ScholarshipType,
  UpdateScholarshipDto
} from '@/types/billing-schedule';

export default function EditScholarshipPage() {
  const router = useRouter();
  const params = useParams();
  const scholarshipId = params.id as string;

  const [formData, setFormData] = useState<Partial<UpdateScholarshipDto>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions();

  const canEditScholarships =
    isSuperAdmin || canAccess('billing.scholarships', 'edit');

  const canManageSetup =
    isSuperAdmin || canAccess('billing.scholarship_setup', 'view');

  const { data: scholarship, isLoading, error } = useBillingScholarship(scholarshipId);
  const updateScholarshipMutation = useUpdateBillingScholarship();
  const { data: scholarshipTree = [] } = useScholarshipSetup();

  // Initialize form data when scholarship is loaded
  useEffect(() => {
    if (scholarship) {
      setFormData({
        scholarship_category_id: scholarship.scholarship_category_id,
        scholarship_type_id: scholarship.scholarship_type_id,
        value_mode: scholarship.value_mode,
        scholarship_value: scholarship.scholarship_value,
        scholarship_reason: scholarship.scholarship_reason,
        effective_date: scholarship.effective_date,
        expiry_date: scholarship.expiry_date
      });
    }
  }, [scholarship]);

  // Show loading state while permissions are loading
  if (permissionsLoading || isLoading) {
    return (
      <ContentLayout title='Edit Scholarship'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  if (!canEditScholarships) {
    return (
      <ContentLayout title='Edit Scholarship'>
        <div className='text-center py-8'>
          <p className='text-destructive'>
            You don&apos;t have permission to edit scholarships.
          </p>
        </div>
      </ContentLayout>
    );
  }

  if (error) {
    return (
      <ContentLayout title='Edit Scholarship'>
        <div className='text-center py-8'>
          <p className='text-destructive'>
            Error loading scholarship: {error.message}
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

  if (!scholarship) {
    return (
      <ContentLayout title='Edit Scholarship'>
        <div className='text-center py-8'>
          <p className='text-muted-foreground'>Scholarship not found</p>
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

  // Don't allow editing approved or rejected scholarships
  if (scholarship.approval_status !== 'pending') {
    return (
      <ContentLayout title='Edit Scholarship'>
        <div className='text-center py-8'>
          <p className='text-muted-foreground'>
            Cannot edit scholarship with status:{' '}
            {scholarship.approval_status.toUpperCase()}
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

  const handleInputChange = (field: keyof UpdateScholarshipDto, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value
    }));
  };

  // A type belongs to exactly one category, so changing category drops the type.
  const handleCategoryChange = (categoryId: string) => {
    setFormData((prev) => ({
      ...prev,
      scholarship_category_id: categoryId,
      scholarship_type_id: undefined
    }));
  };

  const handleTypeChange = (type: ScholarshipType) => {
    setFormData((prev) => ({ ...prev, scholarship_type_id: type.id }));
  };

  const calculateScholarshipAmount = () => {
    if (!scholarship?.bill?.total_amount || !formData.scholarship_value) return 0;

    if (formData.value_mode === 'percentage') {
      return (scholarship.bill.total_amount * formData.scholarship_value) / 100;
    } else {
      return formData.scholarship_value;
    }
  };

  const scholarshipAmount = calculateScholarshipAmount();
  const billAmount = scholarship?.bill?.total_amount || 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const selectionError = validateScholarshipSelection(
      scholarshipTree,
      formData.scholarship_category_id,
      formData.scholarship_type_id,
      {
        allowInactiveCategoryId: scholarship.scholarship_category_id,
        allowInactiveTypeId: scholarship.scholarship_type_id
      }
    );
    if (selectionError) {
      toast.error(selectionError);
      return;
    }

    if (!formData.value_mode) {
      toast.error('Please select a value mode');
      return;
    }

    if (!formData.scholarship_value || formData.scholarship_value <= 0) {
      toast.error('Please enter a valid scholarship value');
      return;
    }

    if (!formData.scholarship_reason || formData.scholarship_reason.trim() === '') {
      toast.error('Please provide a reason for the scholarship');
      return;
    }

    if (scholarshipAmount > billAmount) {
      toast.error('Scholarship amount cannot exceed bill amount');
      return;
    }

    try {
      setIsSubmitting(true);

      const updateData: UpdateScholarshipDto = {
        ...formData,
        scholarship_amount: scholarshipAmount
      };

      await updateScholarshipMutation.mutateAsync({
        id: scholarshipId,
        data: updateData
      });

      toast.success('Scholarship updated successfully');
      router.push(`/billing/scholarships/${scholarshipId}`);
    } catch (error) {
      console.error('Error updating scholarship:', error);
      toast.error('Failed to update scholarship');
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
          { label: 'Scholarships', href: '/billing/scholarships' },
          { label: 'Details', href: `/billing/scholarships/${scholarshipId}` },
          { label: 'Edit', href: `/billing/scholarships/${scholarshipId}/edit` }
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
        {scholarship.bill && (
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
                    {scholarship.bill.bill_description}
                  </p>
                </div>
                <div>
                  <Label className='text-sm font-medium text-muted-foreground'>
                    Student
                  </Label>
                  <p className='font-medium'>
                    {`${scholarship.bill.student?.first_name} ${
                      scholarship.bill.student?.last_name || ''
                    }`.trim()}
                  </p>
                </div>
                <div>
                  <Label className='text-sm font-medium text-muted-foreground'>
                    Scholarship Amount
                  </Label>
                  <p className='font-medium'>
                    {formatCurrency(scholarship.bill.total_amount)}
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
                {/* Scholarship Category + Scholarship Type (dynamic) */}
                <ScholarshipSelectFields
                  categoryId={formData.scholarship_category_id}
                  typeId={formData.scholarship_type_id}
                  onCategoryChange={handleCategoryChange}
                  onTypeChange={handleTypeChange}
                  originalCategoryId={scholarship.scholarship_category_id}
                  originalTypeId={scholarship.scholarship_type_id}
                  canManageSetup={canManageSetup}
                />

                {/* Value Mode (percentage | fixed amount) */}
                <div className='space-y-2'>
                  <Label htmlFor='value_mode'>Value Mode *</Label>
                  <Select
                    value={formData.value_mode || ''}
                    onValueChange={(value) =>
                      handleInputChange('value_mode', value as ScholarshipValueMode)
                    }
                  >
                    <SelectTrigger id='value_mode'>
                      <SelectValue placeholder='Select value mode' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='percentage'>Percentage</SelectItem>
                      <SelectItem value='amount'>Fixed Amount</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Scholarship Value */}
                <div className='space-y-2'>
                  <Label htmlFor='scholarship_value'>
                    Scholarship Value *{' '}
                    {formData.value_mode === 'percentage' ? '(%)' : '(₹)'}
                  </Label>
                  <Input
                    id='scholarship_value'
                    type='number'
                    step={
                      formData.value_mode === 'percentage' ? '0.01' : '1'
                    }
                    min='0'
                    max={
                      formData.value_mode === 'percentage'
                        ? '100'
                        : undefined
                    }
                    placeholder={
                      formData.value_mode === 'percentage' ? '10.5' : '1000'
                    }
                    value={formData.scholarship_value || ''}
                    onChange={(e) =>
                      handleInputChange(
                        'scholarship_value',
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

              {/* Scholarship Reason */}
              <div className='space-y-2'>
                <Label htmlFor='scholarship_reason'>Scholarship Reason *</Label>
                <Textarea
                  id='scholarship_reason'
                  placeholder='Provide detailed reason for applying this scholarship'
                  value={formData.scholarship_reason || ''}
                  onChange={(e) =>
                    handleInputChange('scholarship_reason', e.target.value)
                  }
                  rows={3}
                  required
                />
              </div>

              {/* Scholarship Calculation Preview */}
              {formData.scholarship_value && formData.value_mode && (
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
                        -{formatCurrency(scholarshipAmount)}
                      </div>
                    </div>
                    <div>
                      <span className='text-muted-foreground'>
                        Final Amount:
                      </span>
                      <div className='font-semibold text-blue-600'>
                        {formatCurrency(billAmount - scholarshipAmount)}
                      </div>
                    </div>
                    <div>
                      <span className='text-muted-foreground'>
                        Scholarship %:
                      </span>
                      <div className='font-semibold'>
                        {billAmount > 0
                          ? Math.round((scholarshipAmount / billAmount) * 100)
                          : 0}
                        %
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Validation Warning */}
              {scholarshipAmount > billAmount && (
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
                    updateScholarshipMutation.isPending ||
                    scholarshipAmount > billAmount
                  }
                  className='min-w-[120px]'
                >
                  {isSubmitting || updateScholarshipMutation.isPending ? (
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
