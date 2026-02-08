'use client';

/**
 * Billing Refund Policies Page
 *
 * Displays institution refund policies, rules, categories, and methods.
 * View-only informational page for understanding refund processing guidelines.
 */

import { useEffect, useState } from 'react';
import {
  CreditCard,
  Clock,
  ShieldCheck,
  AlertCircle,
  CheckCircle,
  XCircle,
  Info
} from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { usePermissions } from '@/hooks/use-permissions';
// Note: useUserInstitutionAccess not needed on this view-only page
import { RefundCategory, RefundMethod } from '@/types/billing-schedule';
import BeatLoader from 'react-spinners/BeatLoader';

interface RefundPolicy {
  id: string;
  name: string;
  timeframe: string;
  refundPercentage: number;
  processingFee: number;
  description: string;
  icon: typeof CheckCircle;
  color: string;
}

interface CategoryInfo {
  category: RefundCategory;
  label: string;
  description: string;
  requiresApproval: boolean;
}

interface MethodInfo {
  method: RefundMethod;
  label: string;
  description: string;
  processingTime: string;
}

export default function RefundPoliciesPage() {
  const [isLoading, setIsLoading] = useState(true);
  const { canAccess } = usePermissions();
  useEffect(() => {
    // Simulate loading
    const timer = setTimeout(() => setIsLoading(false), 500);
    return () => clearTimeout(timer);
  }, []);

  // Check permissions
  const hasAccess = canAccess('billing.refunds', 'view');

  // Refund policy rules
  const refundPolicies: RefundPolicy[] = [
    {
      id: '1',
      name: 'Full Refund Policy',
      timeframe: 'Within 7 days of payment',
      refundPercentage: 100,
      processingFee: 0,
      description:
        'Complete refund with no processing fee for requests made within 7 days of payment receipt.',
      icon: CheckCircle,
      color: 'text-green-600'
    },
    {
      id: '2',
      name: 'Partial Refund Policy',
      timeframe: '8-30 days after payment',
      refundPercentage: 75,
      processingFee: 2,
      description:
        '75% refund with 2% processing fee for requests made between 8-30 days after payment.',
      icon: AlertCircle,
      color: 'text-blue-600'
    },
    {
      id: '3',
      name: 'Late Refund Policy',
      timeframe: '31-60 days after payment',
      refundPercentage: 50,
      processingFee: 5,
      description:
        '50% refund with 5% processing fee for requests made between 31-60 days after payment.',
      icon: AlertCircle,
      color: 'text-orange-600'
    },
    {
      id: '4',
      name: 'No Refund',
      timeframe: 'After 60 days',
      refundPercentage: 0,
      processingFee: 0,
      description:
        'No refunds available for requests made more than 60 days after payment.',
      icon: XCircle,
      color: 'text-red-600'
    }
  ];

  // Refund categories
  const refundCategories: CategoryInfo[] = [
    {
      category: 'course_change',
      label: 'Course Change',
      description:
        'Refunds for students changing courses or programs within the same institution.',
      requiresApproval: true
    },
    {
      category: 'withdrawal',
      label: 'Student Withdrawal',
      description:
        'Refunds for students withdrawing from the institution or program.',
      requiresApproval: true
    },
    {
      category: 'overpayment',
      label: 'Overpayment',
      description:
        'Refunds for payments made in excess of the actual amount due.',
      requiresApproval: false
    },
    {
      category: 'duplicate_payment',
      label: 'Duplicate Payment',
      description:
        'Refunds for accidental duplicate payments made by students or parents.',
      requiresApproval: false
    },
    {
      category: 'administrative_error',
      label: 'Administrative Error',
      description:
        'Refunds due to billing errors or administrative mistakes by the institution.',
      requiresApproval: true
    },
    {
      category: 'service_not_provided',
      label: 'Service Not Provided',
      description:
        'Refunds when a paid service or course is not provided as expected.',
      requiresApproval: true
    },
    {
      category: 'system_error',
      label: 'System Error',
      description:
        'Refunds due to payment gateway or system errors causing incorrect charges.',
      requiresApproval: false
    },
    {
      category: 'other',
      label: 'Other Reasons',
      description: 'Refunds for other valid reasons not covered above.',
      requiresApproval: true
    }
  ];

  // Refund methods
  const refundMethods: MethodInfo[] = [
    {
      method: 'bank_transfer',
      label: 'Bank Transfer',
      description: 'Direct transfer to student or parent bank account.',
      processingTime: '3-5 business days'
    },
    {
      method: 'cash',
      label: 'Cash Refund',
      description: 'Cash refund from the institution accounts office.',
      processingTime: 'Same day'
    },
    {
      method: 'cheque',
      label: 'Cheque',
      description: 'Refund by cheque payable to the student or parent.',
      processingTime: '5-7 business days'
    },
    {
      method: 'online_transfer',
      label: 'Online Transfer',
      description: 'Instant online transfer via payment gateway.',
      processingTime: '1-2 business days'
    },
    {
      method: 'adjust_future_bills',
      label: 'Adjust to Future Bills',
      description:
        'Credit applied to future billing instead of cash refund.',
      processingTime: 'Immediate (next billing cycle)'
    }
  ];

  if (isLoading) {
    return (
      <ContentLayout title='Refund Policies'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' size={12} />
        </div>
      </ContentLayout>
    );
  }

  if (!hasAccess) {
    return (
      <ContentLayout title='Refund Policies'>
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Billing', href: '/billing/schedule' },
            { label: 'Refunds', href: '/billing/refunds' },
            { label: 'Policies', href: '/billing/refunds/policies' }
          ]}
        />
        <Alert variant='destructive' className='mt-4'>
          <AlertCircle className='h-4 w-4' />
          <AlertDescription>
            You do not have permission to view refund policies.
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Refund Policies'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Billing', href: '/billing/schedule' },
          { label: 'Refunds', href: '/billing/refunds' },
          { label: 'Policies', href: '/billing/refunds/policies' }
        ]}
      />

      <div className='space-y-6 mt-4'>
        {/* Header */}
        <div>
          <h1 className='text-2xl font-bold py-1'>Refund Policies</h1>
          <p className='text-sm sm:text-base text-muted-foreground'>
            Review institution refund policies, categories, methods, and
            processing guidelines
          </p>
        </div>

        {/* Info Alert */}
        <Alert>
          <Info className='h-4 w-4' />
          <AlertDescription>
            These policies apply to all refund requests processed through the
            billing system. Actual refund amounts may vary based on specific
            circumstances and administrative approvals.
          </AlertDescription>
        </Alert>

        {/* Refund Policy Rules */}
        <div>
          <h2 className='text-xl font-semibold mb-4 flex items-center gap-2'>
            <Clock className='h-5 w-5' />
            Refund Policy Rules
          </h2>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
            {refundPolicies.map((policy) => {
              const Icon = policy.icon;
              return (
                <Card key={policy.id}>
                  <CardHeader className='pb-3'>
                    <div className='flex items-start justify-between'>
                      <CardTitle className='text-lg flex items-center gap-2'>
                        <Icon className={`h-5 w-5 ${policy.color}`} />
                        {policy.name}
                      </CardTitle>
                      <Badge
                        variant={
                          policy.refundPercentage === 100
                            ? 'default'
                            : policy.refundPercentage > 0
                              ? 'secondary'
                              : 'destructive'
                        }
                      >
                        {policy.refundPercentage}%
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className='space-y-2'>
                      <div className='flex items-center gap-2 text-sm'>
                        <Clock className='h-4 w-4 text-muted-foreground' />
                        <span className='font-medium'>{policy.timeframe}</span>
                      </div>
                      <p className='text-sm text-muted-foreground'>
                        {policy.description}
                      </p>
                      {policy.processingFee > 0 && (
                        <div className='text-sm text-orange-600 flex items-center gap-1'>
                          <AlertCircle className='h-3 w-3' />
                          Processing Fee: {policy.processingFee}%
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Refund Categories */}
        <div>
          <h2 className='text-xl font-semibold mb-4 flex items-center gap-2'>
            <ShieldCheck className='h-5 w-5' />
            Refund Categories
          </h2>
          <Card>
            <CardContent className='p-0'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className='text-center'>
                      Requires Approval
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {refundCategories.map((cat) => (
                    <TableRow key={cat.category}>
                      <TableCell className='font-medium'>
                        {cat.label}
                      </TableCell>
                      <TableCell className='text-sm text-muted-foreground'>
                        {cat.description}
                      </TableCell>
                      <TableCell className='text-center'>
                        {cat.requiresApproval ? (
                          <Badge variant='secondary'>Required</Badge>
                        ) : (
                          <Badge variant='outline'>Not Required</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Refund Methods */}
        <div>
          <h2 className='text-xl font-semibold mb-4 flex items-center gap-2'>
            <CreditCard className='h-5 w-5' />
            Refund Methods
          </h2>
          <Card>
            <CardContent className='p-0'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Method</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Processing Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {refundMethods.map((method) => (
                    <TableRow key={method.method}>
                      <TableCell className='font-medium'>
                        {method.label}
                      </TableCell>
                      <TableCell className='text-sm text-muted-foreground'>
                        {method.description}
                      </TableCell>
                      <TableCell>
                        <Badge variant='outline'>
                          {method.processingTime}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Additional Guidelines */}
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Info className='h-5 w-5' />
              Additional Guidelines
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-3'>
            <div>
              <h3 className='font-semibold text-sm mb-1'>
                Approval Workflow
              </h3>
              <p className='text-sm text-muted-foreground'>
                Refunds requiring approval must be authorized by the department
                head or accounts manager before processing. Approval timeframe
                is typically 2-3 business days.
              </p>
            </div>
            <div>
              <h3 className='font-semibold text-sm mb-1'>
                Supporting Documentation
              </h3>
              <p className='text-sm text-muted-foreground'>
                Students may be required to submit supporting documents such as
                medical certificates, transfer certificates, or fee receipts
                depending on the refund category.
              </p>
            </div>
            <div>
              <h3 className='font-semibold text-sm mb-1'>Exceptions</h3>
              <p className='text-sm text-muted-foreground'>
                The institution reserves the right to make exceptions to these
                policies in special circumstances, subject to approval by senior
                management.
              </p>
            </div>
            <div>
              <h3 className='font-semibold text-sm mb-1'>Contact</h3>
              <p className='text-sm text-muted-foreground'>
                For questions about refund policies, please contact the accounts
                office at your institution.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
