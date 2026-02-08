'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useBillingCOPQIncident,
  useResolveCOPQIncident,
  useWriteOffCOPQIncident
} from '@/hooks/billing/use-billing-copq';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog';
import { BeatLoader } from 'react-spinners';
import {
  ArrowLeft,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  IndianRupee,
  Users,
  FileText,
  Calendar,
  Loader2
} from 'lucide-react';
import {
  COPQ_CATEGORY_LABELS,
  COPQ_CATEGORY_DESCRIPTIONS,
  COPQ_STATUS_LABELS,
  COPQ_STATUS_COLORS
} from '@/types/billing-copq';

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(amount);
};

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
};

const formatDateTime = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export default function COPQIncidentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const incidentId = params.id as string;

  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [preventiveAction, setPreventiveAction] = useState('');

  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions();

  const { data: incident, isLoading, error } = useBillingCOPQIncident(incidentId);
  const resolveMutation = useResolveCOPQIncident();
  const writeOffMutation = useWriteOffCOPQIncident();

  const canViewCOPQ = isSuperAdmin || canAccess('billing.reports', 'view');

  const handleResolve = () => {
    resolveMutation.mutate(
      {
        id: incidentId,
        preventiveAction: preventiveAction.trim() || undefined
      },
      {
        onSuccess: () => {
          setResolveDialogOpen(false);
          setPreventiveAction('');
        }
      }
    );
  };

  const handleWriteOff = () => {
    writeOffMutation.mutate(incidentId);
  };

  const isActionable = incident?.status === 'logged' || incident?.status === 'investigating';

  // Loading state while permissions load
  if (permissionsLoading) {
    return (
      <ContentLayout title='Incident Details'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  // Permission check
  if (!canViewCOPQ) {
    return (
      <ContentLayout title='Incident Details'>
        <div className='text-center py-8'>
          <p className='text-destructive'>
            You don&apos;t have permission to view COPQ incidents.
          </p>
        </div>
      </ContentLayout>
    );
  }

  // Loading state while incident loads
  if (isLoading) {
    return (
      <ContentLayout title='Incident Details'>
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Billing', href: '/billing/schedule' },
            { label: 'Cost of Poor Quality', href: '/billing/copq' },
            { label: 'Incidents', href: '/billing/copq/incidents' },
            { label: 'Detail', href: '#' }
          ]}
        />
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  // Error state
  if (error || !incident) {
    return (
      <ContentLayout title='Incident Details'>
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Billing', href: '/billing/schedule' },
            { label: 'Cost of Poor Quality', href: '/billing/copq' },
            { label: 'Incidents', href: '/billing/copq/incidents' },
            { label: 'Detail', href: '#' }
          ]}
        />
        <div className='space-y-6 mt-4'>
          <Card className='border-destructive'>
            <CardContent className='flex flex-col items-center justify-center py-8'>
              <AlertTriangle className='h-12 w-12 text-destructive mb-4' />
              <h3 className='text-lg font-semibold mb-2'>Error Loading Incident</h3>
              <p className='text-muted-foreground text-center max-w-md mb-4'>
                {error?.message || 'Incident not found'}
              </p>
              <Button variant='outline' onClick={() => router.back()}>
                Go Back
              </Button>
            </CardContent>
          </Card>
        </div>
      </ContentLayout>
    );
  }

  const totalCOPQ = incident.visible_cost + incident.hidden_cost_estimate;

  return (
    <ContentLayout title='Incident Details'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Billing', href: '/billing/schedule' },
          { label: 'Cost of Poor Quality', href: '/billing/copq' },
          { label: 'Incidents', href: '/billing/copq/incidents' },
          { label: 'Detail', href: `/billing/copq/incidents/${incidentId}` }
        ]}
      />

      <div className='space-y-6 mt-4'>
        {/* Header */}
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div className='flex items-center gap-4'>
            <Button variant='outline' size='sm' asChild>
              <Link href='/billing/copq/incidents'>
                <ArrowLeft className='h-4 w-4 mr-2' />
                Back to Incidents
              </Link>
            </Button>
            <Badge className={COPQ_STATUS_COLORS[incident.status]}>
              {COPQ_STATUS_LABELS[incident.status]}
            </Badge>
          </div>
          <div className='flex flex-wrap gap-2'>
            {isActionable && (
              <>
                <Button
                  onClick={() => setResolveDialogOpen(true)}
                  className='bg-green-600 hover:bg-green-700'
                >
                  <CheckCircle className='mr-2 h-4 w-4' />
                  Resolve
                </Button>
                <Button
                  variant='outline'
                  onClick={handleWriteOff}
                  disabled={writeOffMutation.isPending}
                >
                  {writeOffMutation.isPending ? (
                    <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                  ) : (
                    <XCircle className='mr-2 h-4 w-4' />
                  )}
                  Write Off
                </Button>
              </>
            )}
            {incident.resolved_at && (
              <div className='flex items-center gap-2 text-sm text-muted-foreground'>
                <CheckCircle className='h-4 w-4 text-green-600' />
                <span>Resolved on {formatDate(incident.resolved_at)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Detail Cards Grid */}
        <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
          {/* Left Column */}
          <div className='space-y-6'>
            {/* Incident Information */}
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <AlertTriangle className='h-5 w-5' />
                  Incident Information
                </CardTitle>
              </CardHeader>
              <CardContent className='space-y-4'>
                <div>
                  <label className='text-sm font-medium text-muted-foreground'>
                    Category
                  </label>
                  <p className='font-medium'>
                    {COPQ_CATEGORY_LABELS[incident.category]}
                  </p>
                  <p className='text-sm text-muted-foreground mt-1'>
                    {COPQ_CATEGORY_DESCRIPTIONS[incident.category]}
                  </p>
                </div>
                <div>
                  <label className='text-sm font-medium text-muted-foreground'>
                    Incident Date
                  </label>
                  <div className='flex items-center gap-2'>
                    <Calendar className='h-4 w-4 text-muted-foreground' />
                    <p className='font-medium'>{formatDate(incident.incident_date)}</p>
                  </div>
                </div>
                <div>
                  <label className='text-sm font-medium text-muted-foreground'>
                    Description
                  </label>
                  <p className='font-medium whitespace-pre-wrap'>
                    {incident.description}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Financial Impact */}
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <IndianRupee className='h-5 w-5' />
                  Financial Impact
                </CardTitle>
              </CardHeader>
              <CardContent className='space-y-4'>
                <div className='grid grid-cols-2 gap-4'>
                  <div>
                    <label className='text-sm font-medium text-muted-foreground'>
                      Visible Cost
                    </label>
                    <p className='font-medium text-lg'>
                      {formatCurrency(incident.visible_cost)}
                    </p>
                  </div>
                  <div>
                    <label className='text-sm font-medium text-muted-foreground'>
                      Hidden Cost Estimate
                    </label>
                    <p className='font-medium text-lg'>
                      {formatCurrency(incident.hidden_cost_estimate)}
                    </p>
                  </div>
                </div>
                <div className='border-t pt-4'>
                  <label className='text-sm font-medium text-muted-foreground'>
                    Total COPQ
                  </label>
                  <p className='font-bold text-xl text-destructive'>
                    {formatCurrency(totalCOPQ)}
                  </p>
                </div>
                <div className='grid grid-cols-2 gap-4'>
                  <div>
                    <label className='text-sm font-medium text-muted-foreground'>
                      Time Spent
                    </label>
                    <div className='flex items-center gap-2'>
                      <Clock className='h-4 w-4 text-muted-foreground' />
                      <p className='font-medium'>
                        {incident.time_spent_hours !== null
                          ? `${incident.time_spent_hours} hours`
                          : 'Not recorded'}
                      </p>
                    </div>
                  </div>
                  <div>
                    <label className='text-sm font-medium text-muted-foreground'>
                      Affected Stakeholders
                    </label>
                    <div className='flex items-center gap-2'>
                      <Users className='h-4 w-4 text-muted-foreground' />
                      <p className='font-medium'>
                        {incident.affected_stakeholders}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Root Cause & Prevention */}
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <FileText className='h-5 w-5' />
                  Root Cause &amp; Prevention
                </CardTitle>
              </CardHeader>
              <CardContent className='space-y-4'>
                <div>
                  <label className='text-sm font-medium text-muted-foreground'>
                    Root Cause
                  </label>
                  {incident.root_cause ? (
                    <p className='font-medium whitespace-pre-wrap'>
                      {incident.root_cause}
                    </p>
                  ) : (
                    <p className='text-muted-foreground italic'>Not provided</p>
                  )}
                </div>
                <div>
                  <label className='text-sm font-medium text-muted-foreground'>
                    Preventive Action
                  </label>
                  {incident.preventive_action ? (
                    <p className='font-medium whitespace-pre-wrap'>
                      {incident.preventive_action}
                    </p>
                  ) : (
                    <p className='text-muted-foreground italic'>Not provided</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column */}
          <div className='space-y-6'>
            {/* Status Card */}
            <Card>
              <CardHeader>
                <CardTitle>Status</CardTitle>
              </CardHeader>
              <CardContent className='space-y-4'>
                <div>
                  <label className='text-sm font-medium text-muted-foreground'>
                    Current Status
                  </label>
                  <div className='mt-1'>
                    <Badge className={COPQ_STATUS_COLORS[incident.status]}>
                      {COPQ_STATUS_LABELS[incident.status]}
                    </Badge>
                  </div>
                </div>
                <div className='grid grid-cols-2 gap-4'>
                  <div>
                    <label className='text-sm font-medium text-muted-foreground'>
                      Created
                    </label>
                    <p className='font-medium'>{formatDateTime(incident.created_at)}</p>
                  </div>
                  <div>
                    <label className='text-sm font-medium text-muted-foreground'>
                      Last Updated
                    </label>
                    <p className='font-medium'>{formatDateTime(incident.updated_at)}</p>
                  </div>
                </div>
                {incident.resolved_at && (
                  <div>
                    <label className='text-sm font-medium text-muted-foreground'>
                      Resolved
                    </label>
                    <p className='font-medium'>{formatDateTime(incident.resolved_at)}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Related Information */}
            <Card>
              <CardHeader>
                <CardTitle>Related Information</CardTitle>
              </CardHeader>
              <CardContent className='space-y-4'>
                <div>
                  <label className='text-sm font-medium text-muted-foreground'>
                    Linked Bill
                  </label>
                  {incident.bill ? (
                    <Link
                      href={`/billing/schedule/${incident.bill.id}`}
                      className='block font-medium text-blue-600 hover:underline'
                    >
                      {incident.bill.bill_description || 'Bill'}
                    </Link>
                  ) : (
                    <p className='text-muted-foreground italic'>No bill linked</p>
                  )}
                </div>
                <div>
                  <label className='text-sm font-medium text-muted-foreground'>
                    Learner
                  </label>
                  {incident.learner ? (
                    <p className='font-medium'>
                      {incident.learner.name}
                      {incident.learner.roll_number && (
                        <span className='text-muted-foreground ml-2'>
                          ({incident.learner.roll_number})
                        </span>
                      )}
                    </p>
                  ) : (
                    <p className='text-muted-foreground italic'>No learner linked</p>
                  )}
                </div>
                <div>
                  <label className='text-sm font-medium text-muted-foreground'>
                    Reported By
                  </label>
                  {incident.reporter ? (
                    <p className='font-medium'>{incident.reporter.full_name}</p>
                  ) : (
                    <p className='text-muted-foreground italic'>Not available</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Resolve Dialog */}
      <Dialog open={resolveDialogOpen} onOpenChange={setResolveDialogOpen}>
        <DialogContent className='max-w-md'>
          <DialogHeader>
            <DialogTitle>Resolve Incident</DialogTitle>
          </DialogHeader>
          <div className='space-y-4 py-2'>
            <div className='space-y-2'>
              <label className='text-sm font-medium'>
                Preventive Action (Optional)
              </label>
              <Textarea
                placeholder='Describe what preventive action was taken to avoid recurrence...'
                value={preventiveAction}
                onChange={(e) => setPreventiveAction(e.target.value)}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => {
                setResolveDialogOpen(false);
                setPreventiveAction('');
              }}
              disabled={resolveMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleResolve}
              disabled={resolveMutation.isPending}
              className='bg-green-600 hover:bg-green-700'
            >
              {resolveMutation.isPending ? (
                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
              ) : (
                <CheckCircle className='mr-2 h-4 w-4' />
              )}
              Resolve Incident
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentLayout>
  );
}
