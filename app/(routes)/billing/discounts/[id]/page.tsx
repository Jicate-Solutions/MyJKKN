'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft,
  Eye,
  Check,
  X,
  FileText,
  User,
  Calendar,
  Percent,
  Award
} from 'lucide-react';
import { format } from 'date-fns';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog';
import { usePermissions } from '@/hooks/use-permissions';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { BeatLoader } from 'react-spinners';
import { toast } from 'react-hot-toast';
import {
  useBillingDiscount,
  useApproveDiscount,
  useRejectDiscount
} from '@/hooks/billing/use-billing-discounts';
import { UserService } from '@/lib/services/users/user-service';
import type { BillingDiscount } from '@/types/billing-schedule';
import type { Profile } from '@/types/auth';

export default function DiscountDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const discountId = params.id as string;

  const [approverUsers, setApproverUsers] = useState<Profile[]>([]);
  const [selectedApprover, setSelectedApprover] = useState<string>('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [showApprovalDialog, setShowApprovalDialog] = useState(false);
  const [showRejectionDialog, setShowRejectionDialog] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions();

  const canViewDiscounts =
    isSuperAdmin || canAccess('billing.discounts', 'view');
  const canApproveDiscounts =
    isSuperAdmin || canAccess('billing.discounts', 'approve');

  const { data: discount, isLoading, error } = useBillingDiscount(discountId);
  const approveDiscountMutation = useApproveDiscount();
  const rejectDiscountMutation = useRejectDiscount();

  // Fetch users who can approve discounts
  useEffect(() => {
    if (canApproveDiscounts && discount?.approval_status === 'pending') {
      fetchApproverUsers();
    }
  }, [canApproveDiscounts, discount]);

  const fetchApproverUsers = async () => {
    try {
      setLoadingUsers(true);
      const users = await UserService.getUsersWithRoles();
      // Filter users who can approve discounts (super_admin, administrator, finance_manager)
      const approvers = users.filter((user) =>
        [
          'super_admin',
          'administrator',
          'finance_manager',
          'billing_manager'
        ].includes(user.role)
      );
      setApproverUsers(approvers);
    } catch (error) {
      console.error('Error fetching approver users:', error);
      toast.error('Failed to fetch approver users');
    } finally {
      setLoadingUsers(false);
    }
  };

  // Show loading state while permissions are loading
  if (permissionsLoading || isLoading) {
    return (
      <ContentLayout title='Discount Details'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  if (!canViewDiscounts) {
    return (
      <ContentLayout title='Discount Details'>
        <div className='text-center py-8'>
          <p className='text-destructive'>
            You don&apos;t have permission to view discount details.
          </p>
        </div>
      </ContentLayout>
    );
  }

  if (error) {
    return (
      <ContentLayout title='Discount Details'>
        <div className='text-center py-8'>
          <p className='text-destructive'>
            Error loading discount details: {error.message}
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
      <ContentLayout title='Discount Details'>
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

  const handleApprove = async () => {
    if (!selectedApprover && canApproveDiscounts) {
      toast.error('Please select an approver');
      return;
    }

    try {
      await approveDiscountMutation.mutateAsync(discountId);
      setShowApprovalDialog(false);
      setSelectedApprover('');
      toast.success('Discount approved successfully');
    } catch (error) {
      // Error is handled by the mutation
    }
  };

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      toast.error('Please provide a rejection reason');
      return;
    }

    try {
      await rejectDiscountMutation.mutateAsync({
        id: discountId,
        reason: rejectionReason
      });
      setShowRejectionDialog(false);
      setRejectionReason('');
      toast.success('Discount rejected');
    } catch (error) {
      // Error is handled by the mutation
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

  const formatDate = (date: string) => {
    return format(new Date(date), 'PPP');
  };

  const getDiscountCategoryBadge = (category: string) => {
    const categoryConfig = {
      merit_scholarship: {
        variant: 'default' as const,
        label: 'Merit Scholarship'
      },
      financial_aid: { variant: 'secondary' as const, label: 'Financial Aid' },
      staff_quota: { variant: 'outline' as const, label: 'Staff Quota' },
      sports_quota: { variant: 'secondary' as const, label: 'Sports Quota' },
      special_circumstances: {
        variant: 'outline' as const,
        label: 'Special Circumstances'
      }
    };

    const config = categoryConfig[category as keyof typeof categoryConfig] || {
      variant: 'secondary' as const,
      label: category.replace('_', ' ').toUpperCase()
    };

    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getDiscountTypeBadge = (type: string) => {
    const typeConfig = {
      amount: { variant: 'default' as const, label: 'Fixed Amount' },
      percentage: { variant: 'secondary' as const, label: 'Percentage' }
    };

    const config = typeConfig[type as keyof typeof typeConfig] || {
      variant: 'secondary' as const,
      label: type.toUpperCase()
    };

    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getApprovalStatusBadge = (status: string) => {
    const statusConfig = {
      pending: {
        variant: 'outline' as const,
        className: 'bg-yellow-100 text-yellow-800 border-yellow-200'
      },
      approved: {
        variant: 'default' as const,
        className: 'bg-green-100 text-green-800 border-green-200'
      },
      rejected: {
        variant: 'destructive' as const,
        className: 'bg-red-100 text-red-800 border-red-200'
      }
    };

    const config =
      statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
    return (
      <Badge variant={config.variant} className={config.className}>
        {status.replace('_', ' ').toUpperCase()}
      </Badge>
    );
  };

  const getInitials = (name: string | null) => {
    if (!name) return 'U';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase();
  };

  return (
    <ContentLayout title='Scholarship Details'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Billing', href: '/billing/schedule' },
          { label: 'Scholarships', href: '/billing/discounts' },
          { label: 'Details', href: `/billing/discounts/${discountId}` }
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
              <h1 className='text-2xl font-bold py-1'>Scholarship Details</h1>
              <p className='text-sm sm:text-base text-muted-foreground'>
                View scholarship information and manage approval status
              </p>
            </div>
          </div>
          {canApproveDiscounts && discount.approval_status === 'pending' && (
            <div className='flex gap-2'>
              <Button
                onClick={() => setShowApprovalDialog(true)}
                disabled={approveDiscountMutation.isPending}
                className='bg-green-600 hover:bg-green-700'
              >
                <Check className='mr-2 h-4 w-4' />
                Approve
              </Button>
              <Button
                variant='destructive'
                onClick={() => setShowRejectionDialog(true)}
                disabled={rejectDiscountMutation.isPending}
              >
                <X className='mr-2 h-4 w-4' />
                Reject
              </Button>
            </div>
          )}
        </div>

        <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
          {/* Main Discount Information */}
          <div className='lg:col-span-2 space-y-6'>
            {/* Discount Overview */}
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <Percent className='h-5 w-5' />
                  Scholarship Overview
                </CardTitle>
              </CardHeader>
              <CardContent className='space-y-6'>
                <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                  <div className='space-y-4'>
                    <div>
                      <Label className='text-sm font-medium text-muted-foreground'>
                        Scholarship ID
                      </Label>
                      <p className='font-mono text-sm'>{discount.id}</p>
                    </div>
                    <div>
                      <Label className='text-sm font-medium text-muted-foreground'>
                        Category
                      </Label>
                      <div className='mt-1'>
                        {getDiscountCategoryBadge(discount.discount_category)}
                      </div>
                    </div>
                    <div>
                      <Label className='text-sm font-medium text-muted-foreground'>
                        Type
                      </Label>
                      <div className='mt-1'>
                        {getDiscountTypeBadge(discount.discount_type)}
                      </div>
                    </div>
                    <div>
                      <Label className='text-sm font-medium text-muted-foreground'>
                        Status
                      </Label>
                      <div className='mt-1'>
                        {getApprovalStatusBadge(discount.approval_status)}
                      </div>
                    </div>
                  </div>
                  <div className='space-y-4'>
                    <div>
                      <Label className='text-sm font-medium text-muted-foreground'>
                        Scholarship Value
                      </Label>
                      <p className='text-lg font-semibold'>
                        {discount.discount_type === 'percentage'
                          ? `${discount.discount_value}%`
                          : formatCurrency(discount.discount_value)}
                      </p>
                    </div>
                    <div>
                      <Label className='text-sm font-medium text-muted-foreground'>
                        Scholarship Amount
                      </Label>
                      <p className='text-lg font-semibold text-green-600'>
                        {formatCurrency(discount.discount_amount)}
                      </p>
                    </div>
                    <div>
                      <Label className='text-sm font-medium text-muted-foreground'>
                        Effective Date
                      </Label>
                      <p>{formatDate(discount.effective_date)}</p>
                    </div>
                    {discount.expiry_date && (
                      <div>
                        <Label className='text-sm font-medium text-muted-foreground'>
                          Expiry Date
                        </Label>
                        <p>{formatDate(discount.expiry_date)}</p>
                      </div>
                    )}
                  </div>
                </div>

                <Separator />

                <div>
                  <Label className='text-sm font-medium text-muted-foreground'>
                    Scholarship Reason
                  </Label>
                  <p className='mt-1 p-3 bg-muted rounded-md'>
                    {discount.discount_reason}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Bill Information */}
            {discount.bill && (
              <Card>
                <CardHeader>
                  <CardTitle className='flex items-center gap-2'>
                    <FileText className='h-5 w-5' />
                    Associated Bill
                  </CardTitle>
                </CardHeader>
                <CardContent className='space-y-4'>
                  <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                    <div>
                      <Label className='text-sm font-medium text-muted-foreground'>
                        Bill Description
                      </Label>
                      <p className='font-medium'>
                        {discount.bill.bill_description}
                      </p>
                    </div>
                    <div>
                      <Label className='text-sm font-medium text-muted-foreground'>
                        Bill Amount
                      </Label>
                      <p className='font-medium'>
                        {formatCurrency(discount.bill.total_amount)}
                      </p>
                    </div>
                  </div>

                  {discount.bill.student && (
                    <>
                      <Separator />
                      <div>
                        <Label className='text-sm font-medium text-muted-foreground'>
                          Student Information
                        </Label>
                        <div className='mt-2 flex items-center gap-3'>
                          <Avatar className='h-8 w-8'>
                            <AvatarFallback className='text-xs'>
                              {getInitials(
                                `${discount.bill.student.first_name} ${
                                  discount.bill.student.last_name || ''
                                }`.trim()
                              )}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className='font-medium'>
                              {`${discount.bill.student.first_name} ${
                                discount.bill.student.last_name || ''
                              }`.trim()}
                            </p>
                            <p className='text-sm text-muted-foreground'>
                              {discount.bill.student.roll_number} •{' '}
                              {discount.bill.student.college_email}
                            </p>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className='space-y-6'>
            {/* Approval Information */}
            {discount.authorizer && (
              <Card>
                <CardHeader>
                  <CardTitle className='flex items-center gap-2'>
                    <User className='h-5 w-5' />
                    Approved By
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className='flex items-center gap-3'>
                    <Avatar>
                      <AvatarFallback>
                        {getInitials(discount.authorizer.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className='font-medium'>
                        {discount.authorizer.full_name}
                      </p>
                      <p className='text-sm text-muted-foreground'>
                        {discount.approval_date &&
                          formatDate(discount.approval_date)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Who Can Approve */}
            {discount.approval_status === 'pending' && (
              <Card>
                <CardHeader>
                  <CardTitle className='flex items-center gap-2'>
                    <User className='h-5 w-5' />
                    Approvers
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {loadingUsers ? (
                    <div className='flex justify-center py-4'>
                      <BeatLoader size={4} color='#666' />
                    </div>
                  ) : (
                    <div className='space-y-3'>
                      <p className='text-sm text-muted-foreground'>
                        Users who can approve this scholarship:
                      </p>
                      <div className='space-y-2'>
                        {approverUsers.map((user) => (
                          <div
                            key={user.id}
                            className='flex items-center gap-2'
                          >
                            <Avatar className='h-6 w-6'>
                              <AvatarFallback className='text-xs'>
                                {getInitials(user.full_name)}
                              </AvatarFallback>
                            </Avatar>
                            <div className='flex-1 min-w-0'>
                              <p className='text-sm font-medium truncate'>
                                {user.full_name}
                              </p>
                              <p className='text-xs text-muted-foreground'>
                                {user.role.replace('_', ' ').toUpperCase()}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Timeline */}
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <Calendar className='h-5 w-5' />
                  Timeline
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className='space-y-3 text-sm'>
                  <div className='flex justify-between'>
                    <span className='text-muted-foreground'>Created</span>
                    <span>{formatDate(discount.created_at)}</span>
                  </div>
                  {discount.approval_date && (
                    <div className='flex justify-between'>
                      <span className='text-muted-foreground'>
                        {discount.approval_status === 'approved'
                          ? 'Approved'
                          : 'Rejected'}
                      </span>
                      <span>{formatDate(discount.approval_date)}</span>
                    </div>
                  )}
                  <div className='flex justify-between'>
                    <span className='text-muted-foreground'>Last Updated</span>
                    <span>{formatDate(discount.updated_at)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Approval Dialog */}
      <Dialog open={showApprovalDialog} onOpenChange={setShowApprovalDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Scholarship</DialogTitle>
          </DialogHeader>
          <div className='space-y-4'>
            <p className='text-sm text-muted-foreground'>
              Are you sure you want to approve this discount of{' '}
              <span className='font-medium'>
                {formatCurrency(discount.discount_amount)}
              </span>
              ?
            </p>
            {/* In a real implementation, you might want to add approval workflow here */}
          </div>
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => setShowApprovalDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleApprove}
              disabled={approveDiscountMutation.isPending}
              className='bg-green-600 hover:bg-green-700'
            >
              {approveDiscountMutation.isPending ? 'Approving...' : 'Approve'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rejection Dialog */}
      <Dialog open={showRejectionDialog} onOpenChange={setShowRejectionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Discount</DialogTitle>
          </DialogHeader>
          <div className='space-y-4'>
            <div>
              <Label htmlFor='reason'>Rejection Reason *</Label>
              <Textarea
                id='reason'
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder='Enter reason for rejection'
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => {
                setShowRejectionDialog(false);
                setRejectionReason('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant='destructive'
              onClick={handleReject}
              disabled={!rejectionReason || rejectDiscountMutation.isPending}
            >
              {rejectDiscountMutation.isPending ? 'Rejecting...' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentLayout>
  );
}
