'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Shield,
  Building2,
  Users,
  AlertTriangle,
  Clock,
  TrendingUp,
  TrendingDown,
  ArrowLeft,
  Bell,
  RefreshCw,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ComplianceData {
  overall: {
    total_mandatory_notifications: number;
    total_required_acknowledgments: number;
    total_acknowledged: number;
    overall_compliance_rate: number;
    total_overdue: number;
  };
  by_institution: Array<{
    name: string;
    total_required: number;
    acknowledged: number;
    compliance_rate: number;
    overdue: number;
  }>;
  by_notification: Array<{
    id: string;
    title: string;
    priority: string;
    category: string;
    sent_at: string;
    deadline_passed: boolean;
    expires_at: string | null;
    total: number;
    acknowledged: number;
    rate: number;
  }>;
  hod_responsiveness: Array<{
    name: string;
    email: string;
    role: string;
    institution: string;
    escalations_received: number;
    escalations_acknowledged: number;
    avg_response_hours: number | null;
  }>;
  worst_offenders: Array<{
    name: string;
    email: string;
    role: string;
    institution: string;
    unacknowledged_count: number;
  }>;
}

async function fetchComplianceData(): Promise<ComplianceData> {
  const response = await fetch('/api/admin/notifications/compliance-dashboard', {
    cache: 'no-store'
  });
  if (!response.ok) {
    throw new Error('Failed to fetch compliance data');
  }
  return response.json();
}

function getComplianceColor(rate: number): string {
  if (rate >= 50) return 'text-green-700';
  if (rate >= 20) return 'text-yellow-700';
  return 'text-red-700';
}

function getComplianceBg(rate: number): string {
  if (rate >= 50) return 'bg-green-500';
  if (rate >= 20) return 'bg-yellow-500';
  return 'bg-red-500';
}

function getComplianceBadge(rate: number) {
  if (rate >= 50) return { variant: 'default' as const, className: 'bg-green-100 text-green-800 hover:bg-green-100' };
  if (rate >= 20) return { variant: 'default' as const, className: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100' };
  return { variant: 'default' as const, className: 'bg-red-100 text-red-800 hover:bg-red-100' };
}

function getResponseColor(hours: number | null): string {
  if (hours === null) return 'text-gray-500';
  if (hours < 2) return 'text-green-700';
  if (hours < 4) return 'text-yellow-700';
  return 'text-red-700';
}

function getResponseBg(hours: number | null): string {
  if (hours === null) return 'bg-gray-100';
  if (hours < 2) return 'bg-green-50';
  if (hours < 4) return 'bg-yellow-50';
  return 'bg-red-50';
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

function OverallStatsSkeleton() {
  return (
    <div className='grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4'>
      {[1, 2, 3, 4].map((i) => (
        <Card key={i}>
          <CardHeader className='p-3 sm:p-6 pb-2 sm:pb-2'>
            <Skeleton className='h-4 w-24' />
          </CardHeader>
          <CardContent className='p-3 pt-0 sm:p-6 sm:pt-0'>
            <Skeleton className='h-8 w-16 mb-1' />
            <Skeleton className='h-3 w-32' />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className='space-y-3'>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className='flex items-center gap-4'>
          <Skeleton className='h-5 w-full' />
        </div>
      ))}
    </div>
  );
}

export function ComplianceDashboard() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['compliance-dashboard'],
    queryFn: fetchComplianceData,
    refetchInterval: 60000,
    staleTime: 30000
  });

  if (error) {
    return (
      <div className='space-y-4'>
        <div className='flex items-center gap-3'>
          <Link href='/admin/notifications'>
            <Button variant='outline' size='sm' className='h-8 w-8 p-0 sm:h-9 sm:w-auto sm:px-3'>
              <ArrowLeft className='h-4 w-4' />
            </Button>
          </Link>
          <h2 className='text-xl sm:text-2xl font-bold tracking-tight'>
            Acknowledgment Compliance
          </h2>
        </div>
        <Card>
          <CardContent className='py-8 text-center'>
            <AlertTriangle className='h-8 w-8 mx-auto text-destructive mb-3' />
            <p className='text-destructive font-medium'>
              Failed to load compliance data
            </p>
            <p className='text-sm text-muted-foreground mt-1'>
              {error instanceof Error ? error.message : 'An unexpected error occurred'}
            </p>
            <Button onClick={() => refetch()} variant='outline' className='mt-4'>
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className='space-y-4 sm:space-y-6'>
      {/* Header */}
      <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-3'>
        <div className='flex items-center gap-3'>
          <Link href='/admin/notifications'>
            <Button variant='outline' size='sm' className='h-8 w-8 p-0 sm:h-9 sm:w-auto sm:px-3'>
              <ArrowLeft className='h-4 w-4' />
            </Button>
          </Link>
          <div>
            <h2 className='text-xl sm:text-2xl font-bold tracking-tight'>
              Acknowledgment Compliance
            </h2>
            <p className='text-xs sm:text-sm text-muted-foreground hidden sm:block'>
              Track mandatory notification compliance across all institutions
            </p>
          </div>
        </div>
        <Button
          variant='outline'
          size='sm'
          onClick={() => refetch()}
          disabled={isFetching}
          className='h-8 sm:h-9 self-end sm:self-auto'
        >
          <RefreshCw className={cn('h-4 w-4 mr-2', isFetching && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Overall Stats */}
      {isLoading ? (
        <OverallStatsSkeleton />
      ) : data ? (
        <div className='grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4'>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2 p-3 sm:p-6 sm:pb-2'>
              <CardTitle className='text-xs sm:text-sm font-medium'>
                Mandatory Notifications
              </CardTitle>
              <Bell className='h-4 w-4 text-muted-foreground hidden sm:block' />
            </CardHeader>
            <CardContent className='p-3 pt-0 sm:p-6 sm:pt-0'>
              <div className='text-xl sm:text-2xl font-bold'>
                {data.overall.total_mandatory_notifications.toLocaleString()}
              </div>
              <p className='text-[10px] sm:text-xs text-muted-foreground'>
                High/urgent priority
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2 p-3 sm:p-6 sm:pb-2'>
              <CardTitle className='text-xs sm:text-sm font-medium'>
                Compliance Rate
              </CardTitle>
              {data.overall.overall_compliance_rate >= 50 ? (
                <TrendingUp className='h-4 w-4 text-green-600 hidden sm:block' />
              ) : (
                <TrendingDown className='h-4 w-4 text-red-600 hidden sm:block' />
              )}
            </CardHeader>
            <CardContent className='p-3 pt-0 sm:p-6 sm:pt-0'>
              <div className={cn(
                'text-xl sm:text-2xl font-bold',
                getComplianceColor(data.overall.overall_compliance_rate)
              )}>
                {data.overall.overall_compliance_rate}%
              </div>
              <p className='text-[10px] sm:text-xs text-muted-foreground'>
                Overall read rate
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2 p-3 sm:p-6 sm:pb-2'>
              <CardTitle className='text-xs sm:text-sm font-medium'>
                Acknowledged
              </CardTitle>
              <CheckCircle2 className='h-4 w-4 text-green-600 hidden sm:block' />
            </CardHeader>
            <CardContent className='p-3 pt-0 sm:p-6 sm:pt-0'>
              <div className='text-xl sm:text-2xl font-bold'>
                {data.overall.total_acknowledged.toLocaleString()}
              </div>
              <p className='text-[10px] sm:text-xs text-muted-foreground'>
                of {data.overall.total_required_acknowledgments.toLocaleString()} required
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2 p-3 sm:p-6 sm:pb-2'>
              <CardTitle className='text-xs sm:text-sm font-medium'>
                Overdue
              </CardTitle>
              <AlertTriangle className='h-4 w-4 text-red-600 hidden sm:block' />
            </CardHeader>
            <CardContent className='p-3 pt-0 sm:p-6 sm:pt-0'>
              <div className='text-xl sm:text-2xl font-bold text-red-700'>
                {data.overall.total_overdue.toLocaleString()}
              </div>
              <p className='text-[10px] sm:text-xs text-muted-foreground'>
                Past deadline or 7+ days
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Institution Compliance */}
      <Card>
        <CardHeader className='px-3 sm:px-6'>
          <div className='flex items-center gap-2'>
            <Building2 className='h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground' />
            <CardTitle className='text-base sm:text-lg'>Institution Compliance</CardTitle>
          </div>
          <CardDescription className='text-xs sm:text-sm'>
            Sorted by worst compliance first
          </CardDescription>
        </CardHeader>
        <CardContent className='px-2 sm:px-6'>
          {isLoading ? (
            <TableSkeleton rows={4} />
          ) : data && data.by_institution.length > 0 ? (
            <div className='space-y-3'>
              {data.by_institution.map((inst, idx) => (
                <div
                  key={idx}
                  className='flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 p-3 rounded-lg bg-slate-50 border border-slate-100'
                >
                  <div className='flex-1 min-w-0'>
                    <p className='font-medium text-sm sm:text-base truncate'>
                      {inst.name}
                    </p>
                    <p className='text-xs text-muted-foreground'>
                      {inst.acknowledged.toLocaleString()} / {inst.total_required.toLocaleString()} acknowledged
                    </p>
                  </div>

                  <div className='flex items-center gap-3 sm:gap-4'>
                    {/* Progress bar */}
                    <div className='w-24 sm:w-32'>
                      <div className='h-2 bg-slate-200 rounded-full overflow-hidden'>
                        <div
                          className={cn('h-full rounded-full transition-all', getComplianceBg(inst.compliance_rate))}
                          style={{ width: `${Math.min(inst.compliance_rate, 100)}%` }}
                        />
                      </div>
                    </div>

                    <Badge
                      variant={getComplianceBadge(inst.compliance_rate).variant}
                      className={cn('min-w-[52px] justify-center text-xs', getComplianceBadge(inst.compliance_rate).className)}
                    >
                      {inst.compliance_rate}%
                    </Badge>

                    {inst.overdue > 0 && (
                      <span className='text-xs font-medium text-red-600 whitespace-nowrap'>
                        {inst.overdue.toLocaleString()} overdue
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className='text-sm text-muted-foreground text-center py-4'>
              No institution compliance data available
            </p>
          )}
        </CardContent>
      </Card>

      {/* Notification History */}
      <Card>
        <CardHeader className='px-3 sm:px-6'>
          <div className='flex items-center gap-2'>
            <Shield className='h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground' />
            <CardTitle className='text-base sm:text-lg'>Mandatory Notifications</CardTitle>
          </div>
          <CardDescription className='text-xs sm:text-sm'>
            Each high/urgent priority notification and its compliance status
          </CardDescription>
        </CardHeader>
        <CardContent className='px-2 sm:px-6'>
          {isLoading ? (
            <TableSkeleton rows={5} />
          ) : data && data.by_notification.length > 0 ? (
            <div className='space-y-3'>
              {data.by_notification.map((notif) => (
                <Link
                  key={notif.id}
                  href={`/admin/notifications/${notif.id}`}
                  className='block'
                >
                  <div className='flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 p-3 rounded-lg border border-slate-100 hover:bg-slate-50 transition-colors'>
                    <div className='flex-1 min-w-0'>
                      <div className='flex items-center gap-2 flex-wrap'>
                        <p className='font-medium text-sm truncate max-w-[200px] sm:max-w-none'>
                          {notif.title}
                        </p>
                        <Badge variant='outline' className='text-[10px] sm:text-xs'>
                          {notif.priority}
                        </Badge>
                        {notif.deadline_passed && (
                          <Badge variant='destructive' className='text-[10px] sm:text-xs'>
                            Deadline Passed
                          </Badge>
                        )}
                      </div>
                      <p className='text-xs text-muted-foreground mt-1'>
                        Sent {formatDate(notif.sent_at)}
                        {notif.expires_at && (
                          <span className='ml-2'>
                            {notif.deadline_passed ? 'Expired' : 'Expires'} {formatDate(notif.expires_at)}
                          </span>
                        )}
                      </p>
                    </div>

                    <div className='flex items-center gap-3 sm:gap-4'>
                      <div className='w-20 sm:w-28'>
                        <div className='h-2 bg-slate-200 rounded-full overflow-hidden'>
                          <div
                            className={cn('h-full rounded-full transition-all', getComplianceBg(notif.rate))}
                            style={{ width: `${Math.min(notif.rate, 100)}%` }}
                          />
                        </div>
                      </div>

                      <span className={cn('text-xs font-semibold min-w-[40px] text-right', getComplianceColor(notif.rate))}>
                        {notif.rate}%
                      </span>

                      <span className='text-xs text-muted-foreground whitespace-nowrap'>
                        {notif.acknowledged}/{notif.total}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className='text-sm text-muted-foreground text-center py-4'>
              No mandatory notifications found
            </p>
          )}
        </CardContent>
      </Card>

      {/* HOD Responsiveness */}
      <Card>
        <CardHeader className='px-3 sm:px-6'>
          <div className='flex items-center gap-2'>
            <Clock className='h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground' />
            <CardTitle className='text-base sm:text-lg'>HOD/Principal Responsiveness</CardTitle>
          </div>
          <CardDescription className='text-xs sm:text-sm'>
            How quickly leadership responds to mandatory notifications
          </CardDescription>
        </CardHeader>
        <CardContent className='px-2 sm:px-6'>
          {isLoading ? (
            <TableSkeleton rows={5} />
          ) : data && data.hod_responsiveness.length > 0 ? (
            <div className='space-y-2'>
              {data.hod_responsiveness.map((hod, idx) => (
                <div
                  key={idx}
                  className={cn(
                    'flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 p-3 rounded-lg border border-slate-100',
                    getResponseBg(hod.avg_response_hours)
                  )}
                >
                  <div className='flex-1 min-w-0'>
                    <p className='font-medium text-sm truncate'>{hod.name}</p>
                    <div className='flex items-center gap-2 text-xs text-muted-foreground'>
                      <span className='capitalize'>{hod.role.replace(/_/g, ' ')}</span>
                      <span>&middot;</span>
                      <span className='truncate'>{hod.institution}</span>
                    </div>
                  </div>

                  <div className='flex items-center gap-3 sm:gap-4 flex-wrap'>
                    <div className='text-xs'>
                      <span className='font-medium'>
                        {hod.escalations_acknowledged}/{hod.escalations_received}
                      </span>
                      <span className='text-muted-foreground ml-1'>read</span>
                    </div>

                    <div className='flex items-center gap-1'>
                      <Clock className='h-3 w-3' />
                      <span className={cn(
                        'text-xs font-semibold',
                        getResponseColor(hod.avg_response_hours)
                      )}>
                        {hod.avg_response_hours !== null
                          ? `${hod.avg_response_hours}h avg`
                          : 'No response'
                        }
                      </span>
                    </div>

                    {hod.escalations_received > 0 && hod.escalations_acknowledged === 0 && (
                      <Badge variant='destructive' className='text-[10px]'>
                        No reads
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className='text-sm text-muted-foreground text-center py-4'>
              No HOD/principal notification data available
            </p>
          )}
        </CardContent>
      </Card>

      {/* Worst Offenders */}
      <Card>
        <CardHeader className='px-3 sm:px-6'>
          <div className='flex items-center gap-2'>
            <Users className='h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground' />
            <CardTitle className='text-base sm:text-lg'>Most Non-Compliant Users</CardTitle>
          </div>
          <CardDescription className='text-xs sm:text-sm'>
            Top 20 users with the most unacknowledged mandatory notifications
          </CardDescription>
        </CardHeader>
        <CardContent className='px-2 sm:px-6'>
          {isLoading ? (
            <TableSkeleton rows={8} />
          ) : data && data.worst_offenders.length > 0 ? (
            <div className='space-y-2'>
              {data.worst_offenders.map((user, idx) => (
                <div
                  key={idx}
                  className='flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 p-3 rounded-lg bg-slate-50 border border-slate-100'
                >
                  <div className='flex items-center gap-2 sm:gap-3 flex-1 min-w-0'>
                    <span className='text-xs font-mono text-muted-foreground w-5 text-right shrink-0'>
                      {idx + 1}
                    </span>
                    <div className='min-w-0'>
                      <p className='font-medium text-sm truncate'>{user.name}</p>
                      <p className='text-xs text-muted-foreground truncate'>{user.email}</p>
                    </div>
                  </div>

                  <div className='flex items-center gap-2 sm:gap-3 ml-7 sm:ml-0'>
                    <Badge variant='outline' className='text-[10px] sm:text-xs capitalize'>
                      {user.role.replace(/_/g, ' ')}
                    </Badge>
                    <span className='text-xs text-muted-foreground truncate max-w-[120px]'>
                      {user.institution}
                    </span>
                    <Badge
                      variant='default'
                      className={cn(
                        'text-xs min-w-[28px] justify-center',
                        user.unacknowledged_count >= 3
                          ? 'bg-red-100 text-red-800 hover:bg-red-100'
                          : user.unacknowledged_count === 2
                            ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100'
                            : 'bg-gray-100 text-gray-800 hover:bg-gray-100'
                      )}
                    >
                      {user.unacknowledged_count}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className='text-center py-6'>
              <CheckCircle2 className='h-8 w-8 mx-auto text-green-500 mb-2' />
              <p className='text-sm text-muted-foreground'>
                All users are compliant
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
