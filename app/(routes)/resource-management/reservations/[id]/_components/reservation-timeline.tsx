'use client';
// app/(routes)/resource-management/reservations/[id]/_components/reservation-timeline.tsx

import {
  CheckCircle2,
  XCircle,
  Clock,
  LogIn,
  LogOut,
  Calendar,
  Shield,
  User
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Reservation } from '@/types/reservation';
import type { ApprovalChainEntry } from '@/hooks/reservation/use-reservations';
import { format } from 'date-fns';

interface ReservationTimelineProps {
  reservation: Reservation;
  approvals?: ApprovalChainEntry[];
  isLoadingApprovals?: boolean;
}

interface TimelineEvent {
  icon: React.ReactNode;
  title: string;
  description: string;
  timestamp: string;
  variant: 'default' | 'success' | 'error' | 'warning';
}

export function ReservationTimeline({
  reservation,
  approvals = [],
  isLoadingApprovals
}: ReservationTimelineProps) {
  const formatTimestamp = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'MMM dd, yyyy - h:mm a');
    } catch {
      return dateStr;
    }
  };

  const events: TimelineEvent[] = [];

  // Created event
  events.push({
    icon: <Calendar className='h-4 w-4' />,
    title: 'Reservation Created',
    description: `By ${reservation.user?.full_name || 'Unknown'}`,
    timestamp: formatTimestamp(reservation.created_at),
    variant: 'default'
  });

  // Individual approver events from the approval chain
  const actedApprovals = approvals
    .filter((a) => a.status !== 'pending' && a.approved_at)
    .sort(
      (a, b) =>
        new Date(a.approved_at!).getTime() - new Date(b.approved_at!).getTime()
    );

  for (const approval of actedApprovals) {
    const isApproved = approval.status === 'approved';
    events.push({
      icon: isApproved ? (
        <CheckCircle2 className='h-4 w-4' />
      ) : (
        <XCircle className='h-4 w-4' />
      ),
      title: `Level ${approval.approval_level} ${isApproved ? 'Approved' : 'Rejected'}`,
      description: `By ${approval.approver?.full_name || 'Unknown'}${
        approval.comments ? ` — "${approval.comments}"` : ''
      }${
        !isApproved && approval.rejection_reason
          ? ` — ${approval.rejection_reason}`
          : ''
      }`,
      timestamp: formatTimestamp(approval.approved_at!),
      variant: isApproved ? 'success' : 'error'
    });
  }

  // Final reservation approved event (chain complete)
  if (reservation.approved_at && reservation.status === 'approved') {
    events.push({
      icon: <CheckCircle2 className='h-4 w-4' />,
      title: 'Reservation Fully Approved',
      description: `Final approval by ${reservation.approver?.full_name || 'Admin'}`,
      timestamp: formatTimestamp(reservation.approved_at),
      variant: 'success'
    });
  }

  // Final reservation rejected event
  if (reservation.status === 'rejected' && reservation.approved_at) {
    events.push({
      icon: <XCircle className='h-4 w-4' />,
      title: 'Reservation Rejected',
      description: reservation.rejection_reason || 'No reason provided',
      timestamp: formatTimestamp(reservation.approved_at),
      variant: 'error'
    });
  }

  // Checked in event
  if (reservation.checked_in_at) {
    events.push({
      icon: <LogIn className='h-4 w-4' />,
      title: 'Checked In',
      description: `By ${reservation.checked_in_user?.full_name || 'Unknown'}`,
      timestamp: formatTimestamp(reservation.checked_in_at),
      variant: 'success'
    });
  }

  // Checked out event
  if (reservation.checked_out_at) {
    events.push({
      icon: <LogOut className='h-4 w-4' />,
      title: 'Checked Out',
      description: `By ${reservation.checked_out_user?.full_name || 'Unknown'}`,
      timestamp: formatTimestamp(reservation.checked_out_at),
      variant: 'success'
    });
  }

  // Cancelled event
  if (reservation.cancelled_at) {
    events.push({
      icon: <XCircle className='h-4 w-4' />,
      title: 'Reservation Cancelled',
      description:
        reservation.cancellation_reason ||
        `By ${reservation.cancelled_user?.full_name || 'Unknown'}`,
      timestamp: formatTimestamp(reservation.cancelled_at),
      variant: 'error'
    });
  }

  // Pending status indicator
  if (reservation.status === 'pending') {
    events.push({
      icon: <Clock className='h-4 w-4 animate-pulse' />,
      title: 'Awaiting Approval',
      description: 'This reservation is pending approval',
      timestamp: 'Current',
      variant: 'warning'
    });
  }

  const getVariantStyles = (variant: TimelineEvent['variant']) => {
    switch (variant) {
      case 'success':
        return 'bg-green-100 text-green-700 border-green-200';
      case 'error':
        return 'bg-red-100 text-red-700 border-red-200';
      case 'warning':
        return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      default:
        return 'bg-blue-100 text-blue-700 border-blue-200';
    }
  };

  const getApprovalStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return (
          <Badge className='bg-green-100 text-green-700 border-green-200 hover:bg-green-100'>
            <CheckCircle2 className='h-3 w-3 mr-1' />
            Approved
          </Badge>
        );
      case 'rejected':
        return (
          <Badge className='bg-red-100 text-red-700 border-red-200 hover:bg-red-100'>
            <XCircle className='h-3 w-3 mr-1' />
            Rejected
          </Badge>
        );
      default:
        return (
          <Badge className='bg-yellow-100 text-yellow-700 border-yellow-200 hover:bg-yellow-100'>
            <Clock className='h-3 w-3 mr-1' />
            Pending
          </Badge>
        );
    }
  };

  const hasApprovalChain = approvals.length > 0;

  // Determine if sequential — next approver is the lowest pending level
  const lowestPendingLevel = approvals
    .filter((a) => a.status === 'pending')
    .reduce(
      (min, a) => Math.min(min, a.approval_level),
      Infinity
    );

  return (
    <div className='space-y-6'>
      {/* Activity Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>Activity Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className='space-y-4'>
            {events.map((event, index) => (
              <div key={index} className='flex gap-4'>
                <div
                  className={`
                    flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2
                    ${getVariantStyles(event.variant)}
                  `}
                >
                  {event.icon}
                </div>
                <div className='flex-1 space-y-1'>
                  <p className='text-sm font-semibold'>{event.title}</p>
                  <p className='text-sm text-muted-foreground'>
                    {event.description}
                  </p>
                  <p className='text-xs text-muted-foreground'>
                    {event.timestamp}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Approval Chain */}
      {(hasApprovalChain || isLoadingApprovals) && (
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <Shield className='h-5 w-5' />
              Approval Chain
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingApprovals ? (
              <div className='space-y-3'>
                {[1, 2].map((i) => (
                  <div
                    key={i}
                    className='h-16 animate-pulse rounded-lg bg-muted'
                  />
                ))}
              </div>
            ) : (
              <div className='space-y-3'>
                {approvals.map((approval, index) => {
                  const isNext =
                    approval.status === 'pending' &&
                    approval.approval_level === lowestPendingLevel &&
                    reservation.status === 'pending';

                  return (
                    <div key={approval.id}>
                      <div
                        className={`
                          flex items-center gap-3 rounded-lg border p-3
                          ${isNext ? 'border-yellow-300 bg-yellow-50/50' : 'bg-background'}
                          ${approval.status === 'approved' ? 'border-green-200 bg-green-50/50' : ''}
                          ${approval.status === 'rejected' ? 'border-red-200 bg-red-50/50' : ''}
                        `}
                      >
                        {/* Level badge */}
                        <div
                          className={`
                            flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold
                            ${approval.status === 'approved' ? 'bg-green-600 text-white' : ''}
                            ${approval.status === 'rejected' ? 'bg-red-600 text-white' : ''}
                            ${approval.status === 'pending' && isNext ? 'bg-yellow-500 text-white' : ''}
                            ${approval.status === 'pending' && !isNext ? 'bg-muted text-muted-foreground' : ''}
                          `}
                        >
                          {approval.approval_level}
                        </div>

                        {/* Approver info */}
                        <div className='flex-1 min-w-0'>
                          <div className='flex items-center gap-2'>
                            <p className='text-sm font-medium truncate'>
                              {approval.approver?.full_name || 'Unknown'}
                            </p>
                            {isNext && (
                              <Badge
                                variant='outline'
                                className='text-[10px] px-1.5 py-0 border-yellow-400 text-yellow-700 shrink-0'
                              >
                                Next
                              </Badge>
                            )}
                          </div>
                          <p className='text-xs text-muted-foreground truncate'>
                            {approval.approver?.email}
                            {approval.approver?.role && (
                              <span className='ml-1'>
                                ({approval.approver.role.replace(/_/g, ' ')})
                              </span>
                            )}
                          </p>
                        </div>

                        {/* Status + timestamp */}
                        <div className='flex flex-col items-end gap-1 shrink-0'>
                          {getApprovalStatusBadge(approval.status)}
                          {approval.approved_at && (
                            <p className='text-[10px] text-muted-foreground'>
                              {formatTimestamp(approval.approved_at)}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Connector between approvers */}
                      {index < approvals.length - 1 && (
                        <div className='flex justify-center py-1'>
                          <div className='h-3 w-0.5 bg-border' />
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Chain summary */}
                <div className='mt-2 pt-3 border-t'>
                  <div className='flex items-center justify-between text-xs text-muted-foreground'>
                    <span>
                      {approvals.filter((a) => a.status === 'approved').length}/
                      {approvals.length} approvals completed
                    </span>
                    {reservation.status === 'pending' &&
                      approvals.some((a) => a.status === 'pending') && (
                        <span className='text-yellow-600 font-medium'>
                          Waiting for Level {lowestPendingLevel} approval
                        </span>
                      )}
                    {reservation.status === 'approved' && (
                      <span className='text-green-600 font-medium'>
                        All approvals complete
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
