'use client';

// Requests tab — My Hostel hub.
// Sections:
//   1. Vacate request (active + history + CTA)      — props from parent
//   2. My Leave Requests                             — own-scope via getMyLeaveRequests
//   3. My Gate Passes                                — own-scope via getMyGatePasses
//   4. My Room Cleanings                             — room-scope via useMyBookings

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  FileText,
  ArrowRight,
  Brush,
  CheckCircle2,
  DoorOpen,
  Loader2,
} from 'lucide-react';
import { HostelLeaveService } from '@/lib/services/campus-living/hostel-leave-service';
import { GatePassService } from '@/lib/services/campus-living/gate-pass-service';
import {
  useMyAllocation,
  useMyBookings,
} from '@/hooks/campus-living/use-housekeeping-bookings';
// Reused, not re-declared: a third copy of the status words is how one of them
// ends up saying something different from the Room Cleaning page itself.
import {
  LEARNER_STATUS_LABEL,
  LEARNER_STATUS_TONE,
  bookingDateLabel,
  hhmm,
} from '../housekeeping/_components/learner-booking-status';
import type { HostelVacateRequest } from '@/types/hostel-vacate';

// ---------------------------------------------------------------------------
// Status helpers — vacate
// ---------------------------------------------------------------------------
const vacateStatusVariant: Record<
  string,
  'default' | 'secondary' | 'destructive' | 'outline' | 'success'
> = {
  draft: 'outline',
  pending_parent: 'secondary',
  pending_warden: 'secondary',
  pending_chief: 'secondary',
  pending_dues: 'default',
  approved: 'default',
  completed: 'success',
  rejected: 'destructive',
  cancelled: 'outline',
};

const vacateStatusLabel: Record<string, string> = {
  draft: 'Draft',
  pending_parent: 'Waiting for parent consent',
  pending_warden: 'With warden',
  pending_chief: 'With chief warden',
  pending_dues: 'Dues clearance',
  approved: 'Approved — awaiting finalize',
  completed: 'Vacated',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

// ---------------------------------------------------------------------------
// Status helpers — leave
// ---------------------------------------------------------------------------
const leaveStatusVariant: Record<
  string,
  'default' | 'secondary' | 'destructive' | 'outline' | 'success'
> = {
  draft: 'outline',
  pending_parent: 'secondary',
  pending_warden: 'secondary',
  pending_chief: 'secondary',
  approved: 'success',
  rejected: 'destructive',
  cancelled: 'outline',
  expired: 'outline',
};

const leaveStatusLabel: Record<string, string> = {
  draft: 'Draft',
  pending_parent: 'Waiting for parent consent',
  pending_warden: 'With warden',
  pending_chief: 'With chief warden',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  expired: 'Expired',
};

// ---------------------------------------------------------------------------
// Status helpers — gate pass
// ---------------------------------------------------------------------------
// All seven live statuses. `rejected` was missing, so a learner whose request
// was refused saw the raw enum label instead of the word — and no reason.
const gatePassStatusVariant: Record<
  string,
  'default' | 'secondary' | 'destructive' | 'outline' | 'success'
> = {
  requested: 'secondary',
  issued: 'default',
  active: 'success',
  returned: 'outline',
  overdue: 'destructive',
  rejected: 'destructive',
  cancelled: 'outline',
};

const gatePassStatusLabel: Record<string, string> = {
  requested: 'Pending approval',
  issued: 'Approved',
  active: 'Out now',
  returned: 'Returned',
  overdue: 'Overdue',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface RequestsTabProps {
  profileId: string;
  reqLoading: boolean;
  activeRequest: HostelVacateRequest | undefined;
  pastRequests: HostelVacateRequest[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function RequestsTab({
  profileId,
  reqLoading,
  activeRequest,
  pastRequests,
}: RequestsTabProps) {
  // Own leave requests
  const { data: myLeaveRequests, isLoading: leaveLoading } = useQuery({
    queryKey: ['my-leave-requests', profileId],
    queryFn: () => HostelLeaveService.getMyLeaveRequests(profileId),
    enabled: !!profileId,
  });

  // Own gate passes
  const { data: myGatePasses, isLoading: gatePassLoading } = useQuery({
    queryKey: ['my-gate-passes', profileId],
    queryFn: () => GatePassService.getMyGatePasses(profileId),
    enabled: !!profileId,
  });

  // Room cleanings. Scoped to the ROOM, not the learner — any roommate may book
  // and any roommate may rate, so a cleaning someone else raised is still the
  // resident's business and must appear here.
  const { data: allocation } = useMyAllocation();
  const { data: myCleanings = [], isLoading: cleaningLoading } = useMyBookings(
    allocation?.room_id,
  );

  return (
    <div className='space-y-6'>
      {/* ── Section 1: Vacate request ─────────────────────────────── */}
      {reqLoading ? (
        <div className='flex items-center justify-center min-h-[200px]'>
          <Loader2 className='h-6 w-6 animate-spin text-primary' />
        </div>
      ) : (
        <>
          {/* Active vacate request status card */}
          {activeRequest && (
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <FileText className='h-5 w-5 text-amber-600' />
                  Your Vacate Request
                </CardTitle>
                <CardDescription>
                  Submitted {new Date(activeRequest.created_at).toLocaleDateString()}
                </CardDescription>
              </CardHeader>
              <CardContent className='space-y-3'>
                <div className='flex items-center gap-2'>
                  <Badge variant={vacateStatusVariant[activeRequest.status] ?? 'outline'}>
                    {vacateStatusLabel[activeRequest.status] ?? activeRequest.status}
                  </Badge>
                  <span className='text-xs text-muted-foreground capitalize'>
                    {activeRequest.reason_type.replace(/_/g, ' ')}
                  </span>
                </div>
                <p className='text-sm text-muted-foreground'>
                  Requested vacate date:{' '}
                  <strong>{activeRequest.requested_vacate_date}</strong>
                </p>
                <Button asChild variant='outline' size='sm'>
                  <Link href={`/campus-living/vacate-requests/${activeRequest.id}`}>
                    View details
                    <ArrowRight className='ml-2 h-4 w-4' />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Request Vacate CTA — withdrawn 2026-08-10. The learner-side vacate
              workflow is being rebuilt; until then `student` and `parent` no
              longer hold campus_living.vacate_requests.submit, and the form at
              /campus-living/my-hostel/vacate-request is closed by its own
              RoutePermissionGuard layout. Residents vacate via the hostel
              office. The two read-only blocks around this one are kept so any
              request raised on their behalf stays visible. */}

          {/* Vacate request history */}
          {pastRequests.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className='text-base'>Vacate Request History</CardTitle>
              </CardHeader>
              <CardContent>
                <div className='space-y-2'>
                  {pastRequests.map((r) => (
                    <div
                      key={r.id}
                      className='flex items-center justify-between gap-2 rounded-md border p-2'
                    >
                      <div className='flex items-center gap-3'>
                        {r.status === 'completed' ? (
                          <CheckCircle2 className='h-4 w-4 text-green-600' />
                        ) : (
                          <FileText className='h-4 w-4 text-muted-foreground' />
                        )}
                        <div className='flex flex-col'>
                          <span className='text-sm capitalize'>
                            {r.reason_type.replace(/_/g, ' ')}
                          </span>
                          <span className='text-xs text-muted-foreground'>
                            {new Date(r.created_at).toLocaleDateString()} &middot;{' '}
                            {vacateStatusLabel[r.status] ?? r.status}
                          </span>
                        </div>
                      </div>
                      <Button asChild size='sm' variant='ghost'>
                        <Link href={`/campus-living/vacate-requests/${r.id}`}>View</Link>
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ── Section 2: My Leave Requests ─────────────────────────── */}
      <Card>
        <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
          <CardTitle className='text-base flex items-center gap-2'>
            <FileText className='h-4 w-4' />
            My Leave Requests
          </CardTitle>
          {/* CTA: /campus-living/leave/new exists */}
          <Button asChild size='sm' variant='outline'>
            <Link href='/campus-living/leave/new'>Request Leave</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {leaveLoading ? (
            <div className='flex items-center justify-center py-8'>
              <Loader2 className='h-5 w-5 animate-spin text-primary' />
            </div>
          ) : !myLeaveRequests || myLeaveRequests.length === 0 ? (
            <p className='text-sm text-muted-foreground py-4 text-center'>
              No leave requests yet.
            </p>
          ) : (
            <div className='space-y-2'>
              {myLeaveRequests.map((lr) => (
                <div
                  key={lr.id}
                  className='flex items-center justify-between gap-2 rounded-md border p-2'
                >
                  <div className='flex flex-col gap-0.5'>
                    <span className='text-sm capitalize'>
                      {lr.leave_type?.replace(/_/g, ' ') ?? '—'}
                    </span>
                    <span className='text-xs text-muted-foreground'>
                      {lr.from_date} → {lr.to_date}
                    </span>
                    {lr.reason && (
                      <span className='text-xs text-muted-foreground truncate max-w-xs'>
                        {lr.reason}
                      </span>
                    )}
                  </div>
                  <Badge variant={leaveStatusVariant[lr.status] ?? 'outline'}>
                    {leaveStatusLabel[lr.status] ?? lr.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Section 3: My Gate Passes ────────────────────────────── */}
      <Card>
        <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
          <CardTitle className='text-base flex items-center gap-2'>
            <DoorOpen className='h-4 w-4' />
            My Gate Passes
          </CardTitle>
          {/* /request, NOT /new. /new issues an already-approved pass and is
              gated on gate_passes.approve — pointing a resident at it was how
              a learner could approve their own pass. */}
          <Button asChild size='sm' variant='outline'>
            <Link href='/campus-living/gate-passes/request'>Request Gate Pass</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {gatePassLoading ? (
            <div className='flex items-center justify-center py-8'>
              <Loader2 className='h-5 w-5 animate-spin text-primary' />
            </div>
          ) : !myGatePasses || myGatePasses.length === 0 ? (
            <p className='text-sm text-muted-foreground py-4 text-center'>
              No gate passes yet.
            </p>
          ) : (
            <div className='space-y-2'>
              {myGatePasses.map((gp) => (
                <div
                  key={gp.id}
                  className='flex items-center justify-between gap-2 rounded-md border p-2'
                >
                  <div className='flex flex-col gap-0.5'>
                    {/* The type is the configured hostel leave type now, not
                        the retired pass_type enum. */}
                    <span className='text-sm'>{gp.leave_type_name}</span>
                    <span className='text-xs text-muted-foreground'>
                      Return by: {gp.expected_return
                        ? new Date(gp.expected_return).toLocaleString()
                        : '—'}
                    </span>
                    {gp.destination && (
                      <span className='text-xs text-muted-foreground truncate max-w-xs'>
                        {gp.destination}
                      </span>
                    )}
                  </div>
                  <Badge variant={gatePassStatusVariant[gp.status] ?? 'outline'}>
                    {gatePassStatusLabel[gp.status] ?? gp.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Section 4: My Room Cleanings ─────────────────────────── */}
      {/* Hidden entirely when the resident has no room: without an allocation
          there is nothing to clean, and an empty card would only puzzle them. */}
      {allocation && (
        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-base flex items-center gap-2'>
              <Brush className='h-4 w-4' />
              My Room Cleanings
            </CardTitle>
            <Button asChild size='sm' variant='outline'>
              <Link href='/campus-living/my-hostel/housekeeping'>Book a Cleaning</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {cleaningLoading ? (
              <div className='flex items-center justify-center py-8'>
                <Loader2 className='h-5 w-5 animate-spin text-primary' />
              </div>
            ) : myCleanings.length === 0 ? (
              <p className='text-sm text-muted-foreground py-4 text-center'>
                No cleanings booked yet.
              </p>
            ) : (
              <div className='space-y-2'>
                {myCleanings.map((cb) => (
                  <div
                    key={cb.id}
                    className='flex items-center justify-between gap-2 rounded-md border p-2'
                  >
                    <div className='flex min-w-0 flex-col gap-0.5'>
                      <span className='text-sm'>{cb.type_name}</span>
                      <span className='text-xs text-muted-foreground'>
                        {bookingDateLabel(cb.booking_date)} · {hhmm(cb.slot_start)}–
                        {hhmm(cb.slot_end)}
                      </span>
                      {cb.cleaner_name && (
                        <span className='text-xs text-muted-foreground truncate max-w-xs'>
                          Cleaner: {cb.cleaner_name}
                        </span>
                      )}
                    </div>
                    <div className='flex shrink-0 flex-col items-end gap-1'>
                      <Badge className={LEARNER_STATUS_TONE[cb.status]} variant='secondary'>
                        {LEARNER_STATUS_LABEL[cb.status]}
                      </Badge>
                      {/* The only cleaning state that needs the resident to act,
                          and it holds the whole room's attendance until they do. */}
                      {cb.status === 'awaiting_feedback' && (
                        <Button asChild size='sm' variant='ghost'>
                          <Link href='/campus-living/my-hostel/housekeeping'>Rate it</Link>
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
