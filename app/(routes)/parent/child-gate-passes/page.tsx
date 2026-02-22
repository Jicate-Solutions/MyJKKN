'use client';

import { useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/hooks/use-auth';
import {
  useChildGatePasses,
  useCancelGatePass,
  useConfirmReachedHome,
  useConfirmLeftHome,
} from '@/hooks/campus-living/use-gate-passes';
import {
  Loader2,
  DoorOpen,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  MapPin,
  Home,
  ArrowRight,
  Shield,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type PassStatus =
  | 'requested'
  | 'issued'
  | 'active'
  | 'returned'
  | 'overdue'
  | 'cancelled'
  | 'rejected';

const STATUS_CONFIG: Record<
  PassStatus,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; className: string }
> = {
  requested: { label: 'Pending', variant: 'outline', className: 'border-yellow-500 text-yellow-600 bg-yellow-50 dark:bg-yellow-950 dark:text-yellow-400' },
  issued: { label: 'Issued', variant: 'outline', className: 'border-blue-500 text-blue-600 bg-blue-50 dark:bg-blue-950 dark:text-blue-400' },
  active: { label: 'Active', variant: 'outline', className: 'border-green-500 text-green-600 bg-green-50 dark:bg-green-950 dark:text-green-400' },
  returned: { label: 'Returned', variant: 'secondary', className: '' },
  overdue: { label: 'Overdue', variant: 'destructive', className: '' },
  cancelled: { label: 'Cancelled', variant: 'secondary', className: '' },
  rejected: { label: 'Rejected', variant: 'destructive', className: '' },
};

const PASS_TYPE_LABELS: Record<string, string> = {
  regular_out: 'Regular Out',
  overnight: 'Overnight',
  emergency: 'Emergency',
  visitor_accompanied: 'Visitor Accompanied',
  home_visit: 'Home Visit',
};

type FilterKey = 'all' | 'active' | 'pending' | 'home_visit';

function formatDateTime(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface GatePassItem {
  id: string;
  learner_id: string;
  pass_type: string;
  status: string;
  destination: string;
  reason: string | null;
  expected_return: string;
  actual_return: string | null;
  pass_number: string | null;
  left_campus_at: string | null;
  reached_home_at: string | null;
  reached_home_confirmed_by: string | null;
  left_home_at: string | null;
  left_home_confirmed_by: string | null;
  reached_campus_at: string | null;
  cancelled_by: string | null;
  cancellation_reason: string | null;
  created_at: string;
  learner: { id: string; full_name: string; email: string } | null;
}

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status as PassStatus] ?? {
    label: status,
    variant: 'secondary' as const,
    className: '',
  };
  return (
    <Badge variant={config.variant} className={config.className}>
      {config.label}
    </Badge>
  );
}

function HomeVisitTracker({
  pass,
  parentUserId,
}: {
  pass: GatePassItem;
  parentUserId: string;
}) {
  const confirmReachedHome = useConfirmReachedHome();
  const confirmLeftHome = useConfirmLeftHome();

  const steps = [
    {
      label: 'Left Campus',
      timestamp: pass.left_campus_at,
      icon: <DoorOpen className="h-4 w-4" />,
      action: null,
    },
    {
      label: 'Reached Home',
      timestamp: pass.reached_home_at,
      icon: <Home className="h-4 w-4" />,
      action:
        !pass.reached_home_at && pass.left_campus_at
          ? () =>
              confirmReachedHome.mutateAsync({
                id: pass.id,
                parentUserId,
              }).catch(() => { /* Error toast shown by mutation onError */ })
          : null,
      actionLabel: 'Confirm Reached Home',
      actionColor: 'bg-green-600 hover:bg-green-700 text-white',
      isPending: confirmReachedHome.isPending,
    },
    {
      label: 'Left Home',
      timestamp: pass.left_home_at,
      icon: <ArrowRight className="h-4 w-4" />,
      action:
        !pass.left_home_at && pass.reached_home_at
          ? () =>
              confirmLeftHome.mutateAsync({
                id: pass.id,
                parentUserId,
              }).catch(() => { /* Error toast shown by mutation onError */ })
          : null,
      actionLabel: 'Confirm Left Home',
      actionColor: 'bg-blue-600 hover:bg-blue-700 text-white',
      isPending: confirmLeftHome.isPending,
    },
    {
      label: 'Reached Campus',
      timestamp: pass.reached_campus_at,
      icon: <Shield className="h-4 w-4" />,
      action: null,
    },
  ];

  return (
    <div className="mt-4 rounded-lg border bg-muted/30 p-4">
      <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
        Home Visit Tracker
      </p>
      <div className="space-y-3">
        {steps.map((step, idx) => {
          const completed = !!step.timestamp;
          const isNextStep = !!step.action;

          return (
            <div key={step.label} className="flex items-start gap-3">
              {/* Vertical line / node */}
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full border-2 ${
                    completed
                      ? 'border-green-500 bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-400'
                      : isNextStep
                        ? 'border-blue-500 bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400'
                        : 'border-muted-foreground/30 bg-muted text-muted-foreground'
                  }`}
                >
                  {completed ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    step.icon
                  )}
                </div>
                {idx < steps.length - 1 && (
                  <div
                    className={`w-0.5 flex-1 min-h-[16px] ${
                      completed ? 'bg-green-500' : 'bg-muted-foreground/20'
                    }`}
                  />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 pb-1">
                <p className="text-sm font-medium">{step.label}</p>
                {completed ? (
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(step.timestamp)}
                  </p>
                ) : step.action ? (
                  <Button
                    size="sm"
                    className={`mt-1 h-7 text-xs ${step.actionColor}`}
                    disabled={step.isPending}
                    onClick={step.action}
                  >
                    {step.isPending && (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    )}
                    {step.actionLabel}
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground">Pending</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CancelPassDialog({
  passId,
  parentUserId,
}: {
  passId: string;
  parentUserId: string;
}) {
  const [reason, setReason] = useState('');
  const [open, setOpen] = useState(false);
  const cancelGatePass = useCancelGatePass();

  const handleCancel = async () => {
    try {
      await cancelGatePass.mutateAsync({
        id: passId,
        cancelledBy: parentUserId,
        reason,
      });
      setReason('');
      setOpen(false);
    } catch {
      // Error toast shown by mutation onError — dialog stays open for retry
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" className="border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950">
          <XCircle className="mr-1 h-3.5 w-3.5" />
          Cancel Pass
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel Gate Pass</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to cancel this gate pass? This action cannot be undone. Please provide a reason for cancellation.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="cancel-reason">Reason for cancellation</Label>
          <Textarea
            id="cancel-reason"
            placeholder="Enter the reason for cancelling this gate pass..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setReason('')}>
            Go Back
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleCancel}
            disabled={!reason.trim() || cancelGatePass.isPending}
            className="bg-red-600 text-white hover:bg-red-700"
          >
            {cancelGatePass.isPending && (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            )}
            Confirm Cancel
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function GatePassCard({
  pass,
  parentUserId,
}: {
  pass: GatePassItem;
  parentUserId: string;
}) {
  const canCancel = ['requested', 'issued', 'active'].includes(pass.status);
  const isHomeVisit = pass.pass_type === 'home_visit';
  const showTracker = isHomeVisit && pass.status === 'active';

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4 sm:p-5">
        {/* Header row: child name + badges */}
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-semibold truncate">
              {pass.learner?.full_name ?? 'Unknown Learner'}
            </span>
            <Badge variant="outline" className="text-xs shrink-0">
              {PASS_TYPE_LABELS[pass.pass_type] ?? pass.pass_type}
            </Badge>
          </div>
          <StatusBadge status={pass.status} />
        </div>

        {/* Details */}
        <div className="mt-3 space-y-1.5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{pass.destination}</span>
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            <span>Expected return: {formatDateTime(pass.expected_return)}</span>
          </div>

          {pass.actual_return && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-500" />
              <span>Returned: {formatDateTime(pass.actual_return)}</span>
            </div>
          )}

          {pass.reason && (
            <p className="text-xs text-muted-foreground mt-1 pl-5">
              Reason: {pass.reason}
            </p>
          )}

          {pass.cancellation_reason && (
            <p className="text-xs text-red-500 mt-1 pl-5">
              Cancelled: {pass.cancellation_reason}
            </p>
          )}
        </div>

        {/* Home Visit Tracker */}
        {showTracker && (
          <HomeVisitTracker pass={pass} parentUserId={parentUserId} />
        )}

        {/* Actions */}
        {canCancel && (
          <div className="mt-4 flex justify-end">
            <CancelPassDialog passId={pass.id} parentUserId={parentUserId} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'pending', label: 'Pending' },
  { key: 'home_visit', label: 'Home Visits' },
];

export default function ChildGatePassesPage() {
  const { profile, isLoading: authLoading } = useAuth();
  const [filter, setFilter] = useState<FilterKey>('all');

  const parentUserId = profile?.id ?? '';
  const {
    data: passes,
    isLoading: passesLoading,
    error,
  } = useChildGatePasses(parentUserId);

  // Derived counts
  const allPasses = (passes ?? []) as GatePassItem[];
  const activeCount = allPasses.filter((p) =>
    ['issued', 'active'].includes(p.status),
  ).length;
  const pendingCount = allPasses.filter((p) => p.status === 'requested').length;
  const totalCount = allPasses.length;

  // Filtered list
  const filteredPasses = allPasses.filter((p) => {
    if (filter === 'active') return ['issued', 'active'].includes(p.status);
    if (filter === 'pending') return p.status === 'requested';
    if (filter === 'home_visit') return p.pass_type === 'home_visit';
    return true;
  });

  const isLoading = authLoading || passesLoading;

  return (
    <ContentLayout title="Child's Gate Passes">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: "Child's Gate Passes" },
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Title */}
        <div>
          <h1 className="text-2xl font-bold py-1">Child&apos;s Gate Passes</h1>
          <p className="text-sm text-muted-foreground">
            Monitor and manage your child&apos;s hostel gate passes
          </p>
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Error state */}
        {!isLoading && error && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <AlertTriangle className="h-12 w-12 text-red-400" />
              <p className="mt-4 text-sm text-red-600">
                Failed to load gate passes. Please try again later.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Content */}
        {!isLoading && !error && (
          <>
            {/* Stats Cards */}
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Active</CardTitle>
                  <Shield className="h-4 w-4 text-blue-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{activeCount}</div>
                  <p className="text-xs text-muted-foreground">
                    Issued or currently active
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Pending</CardTitle>
                  <Clock className="h-4 w-4 text-yellow-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{pendingCount}</div>
                  <p className="text-xs text-muted-foreground">
                    Awaiting approval
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total</CardTitle>
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{totalCount}</div>
                  <p className="text-xs text-muted-foreground">
                    All gate passes
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Filter Chips */}
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((f) => (
                <Button
                  key={f.key}
                  variant={filter === f.key ? 'default' : 'outline'}
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setFilter(f.key)}
                >
                  {f.label}
                </Button>
              ))}
            </div>

            {/* Gate Pass Cards */}
            {filteredPasses.length > 0 ? (
              <div className="space-y-4">
                {filteredPasses.map((pass) => (
                  <GatePassCard
                    key={pass.id}
                    pass={pass}
                    parentUserId={parentUserId}
                  />
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                  <DoorOpen className="h-12 w-12 text-muted-foreground/40" />
                  <p className="mt-4 font-medium text-muted-foreground">
                    No gate passes found
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground/70 max-w-sm">
                    {filter === 'all'
                      ? "Your child has no gate passes yet. They will appear here once requested."
                      : `No gate passes match the "${FILTERS.find((f) => f.key === filter)?.label}" filter.`}
                  </p>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </ContentLayout>
  );
}
