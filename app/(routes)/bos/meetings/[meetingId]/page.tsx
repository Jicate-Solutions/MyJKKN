'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  Edit,
  CalendarDays,
  MapPin,
  Clock,
  ArrowRight,
  CheckCircle2,
  Users,
} from 'lucide-react';
import { toast } from 'react-hot-toast';

import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AgendaTab } from './_components/agenda-tab';
import { AttendanceTab } from './_components/attendance-tab';
import { DocumentsTab } from './_components/documents-tab';

import { useBosMeeting, useTransitionBosMeetingStatus } from '@/hooks/bos/use-bos-meetings';
import { usePermissions } from '@/hooks/use-permissions';
import { MeetingStatusStepper } from '../_components/meeting-status-stepper';
import {
  BosMeetingStatus,
  BOS_MEETING_STATUS_LABELS,
  BOS_MEETING_NEXT_STATUS,
  BOS_MEETING_TYPE_LABELS,
} from '@/types/bos';
import { logger } from '@/lib/utils/enhanced-logger';

// ── Transition button labels ──────────────────────────────────────────────────

const TRANSITION_LABELS: Partial<Record<BosMeetingStatus, string>> = {
  principal_approved: 'Submit for Principal Approval',
  noticed: 'Mark Notice Sent',
  expert_invited: 'Mark Experts Invited',
  completed: 'Mark Meeting Completed',
  minutes_drafted: 'Draft Minutes',
  minutes_approved: 'Approve Minutes',
  ratified: 'Record Ratification',
};

// ── Transitions that need extra metadata from the user ────────────────────────

const METADATA_TRANSITIONS = new Set<BosMeetingStatus>([
  'principal_approved',
  'minutes_approved',
  'ratified',
]);

interface TransitionMetadata {
  approver?: string;        // for principal_approved, minutes_approved
  ratified_date?: string;   // for ratified
  minutes_summary?: string; // for minutes_drafted
}

// ── Transition Confirm Dialog ─────────────────────────────────────────────────

interface TransitionDialogProps {
  open: boolean;
  nextStatus: BosMeetingStatus;
  onConfirm: (meta: TransitionMetadata) => void;
  onCancel: () => void;
  isPending: boolean;
}

function TransitionDialog({ open, nextStatus, onConfirm, onCancel, isPending }: TransitionDialogProps) {
  const [approver, setApprover] = useState('');
  const [ratifiedDate, setRatifiedDate] = useState('');
  const [minutesSummary, setMinutesSummary] = useState('');

  const handleConfirm = () => {
    onConfirm({
      approver: approver.trim() || undefined,
      ratified_date: ratifiedDate || undefined,
      minutes_summary: minutesSummary.trim() || undefined,
    });
  };

  const isApproval = nextStatus === 'principal_approved' || nextStatus === 'minutes_approved';
  const isRatification = nextStatus === 'ratified';
  const isMinutesDraft = nextStatus === 'minutes_drafted';

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className='max-w-sm'>
        <DialogHeader>
          <DialogTitle>{TRANSITION_LABELS[nextStatus] ?? `Move to ${BOS_MEETING_STATUS_LABELS[nextStatus]}`}</DialogTitle>
        </DialogHeader>

        <div className='space-y-4 py-2'>
          {isApproval && (
            <div className='space-y-2'>
              <Label>Approved by</Label>
              <Input
                placeholder='e.g. Dr. K. Rajamani, Principal'
                value={approver}
                onChange={(e) => setApprover(e.target.value)}
              />
            </div>
          )}
          {isRatification && (
            <div className='space-y-2'>
              <Label>Academic Council Ratification Date</Label>
              <Input
                type='date'
                value={ratifiedDate}
                onChange={(e) => setRatifiedDate(e.target.value)}
              />
            </div>
          )}
          {isMinutesDraft && (
            <div className='space-y-2'>
              <Label>Minutes Summary (optional)</Label>
              <textarea
                className='w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none'
                rows={3}
                placeholder='Brief summary of proceedings...'
                value={minutesSummary}
                onChange={(e) => setMinutesSummary(e.target.value)}
              />
            </div>
          )}
          {!isApproval && !isRatification && !isMinutesDraft && (
            <p className='text-sm text-muted-foreground'>
              Confirm moving this meeting to{' '}
              <strong>{BOS_MEETING_STATUS_LABELS[nextStatus]}</strong>.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={onCancel} disabled={isPending}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={isPending}>
            {isPending ? 'Updating...' : 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Info row ──────────────────────────────────────────────────────────────────

function InfoItem({ icon: Icon, label, value }: { icon: any; label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className='flex items-start gap-2 text-sm'>
      <Icon className='h-4 w-4 text-muted-foreground mt-0.5 shrink-0' />
      <div>
        <span className='text-muted-foreground'>{label}: </span>
        <span className='font-medium'>{value}</span>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

interface MeetingDetailPageProps {
  params: Promise<{ meetingId: string }>;
}

export default function MeetingDetailPage({ params }: MeetingDetailPageProps) {
  const { meetingId } = use(params);
  const router = useRouter();
  const { canAccess, isSuperAdmin } = usePermissions();
  const { data: meeting, isLoading } = useBosMeeting(meetingId);
  const transitionStatus = useTransitionBosMeetingStatus();
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [showTransitionDialog, setShowTransitionDialog] = useState(false);

  const canEdit = isSuperAdmin || canAccess('academic.bos-meetings', 'edit');

  // Open dialog for transitions that need extra metadata; fire directly otherwise
  const handleTransition = () => {
    if (!meeting) return;
    const nextStatus = BOS_MEETING_NEXT_STATUS[meeting.status];
    if (!nextStatus) return;

    if (METADATA_TRANSITIONS.has(nextStatus)) {
      setShowTransitionDialog(true);
    } else {
      void handleTransitionConfirm({});
    }
  };

  const handleTransitionConfirm = async (meta: TransitionMetadata) => {
    if (!meeting) return;
    const nextStatus = BOS_MEETING_NEXT_STATUS[meeting.status];
    if (!nextStatus) return;

    setIsTransitioning(true);
    try {
      await transitionStatus.mutateAsync({ id: meetingId, newStatus: nextStatus, metadata: meta as any });
      toast.success(`Status updated to: ${BOS_MEETING_STATUS_LABELS[nextStatus]}`);
      setShowTransitionDialog(false);
    } catch (error) {
      logger.error('academic/bos', 'Failed to transition meeting status', error);
      toast.error((error as Error).message || 'Failed to update status');
    } finally {
      setIsTransitioning(false);
    }
  };

  if (isLoading) {
    return (
      <div className='max-w-4xl space-y-4'>
        <Skeleton className='h-10 w-72' />
        <Skeleton className='h-20 w-full' />
        <Skeleton className='h-32 w-full' />
        <Skeleton className='h-48 w-full' />
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className='max-w-4xl'>
        <p className='text-muted-foreground'>Meeting not found.</p>
      </div>
    );
  }

  const nextStatus = BOS_MEETING_NEXT_STATUS[meeting.status];
  const isDraft = meeting.status === 'draft';
  const isRatified = meeting.status === 'ratified';
  const board = meeting.board as any;
  const composition = (meeting as any).bos_compositions as any;

  return (
    <div className='max-w-4xl space-y-6'>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <PageHeader
        title={meeting.meeting_title ?? `Meeting #${meeting.meeting_number}/${meeting.academic_year}`}
        description={board ? `${board.board_name} · ${BOS_MEETING_TYPE_LABELS[meeting.meeting_type]}` : ''}
      >
        <div className='flex items-center gap-2'>
          <Badge variant='outline'>
            {BOS_MEETING_STATUS_LABELS[meeting.status]}
          </Badge>
          {canEdit && isDraft && (
            <Button
              size='sm'
              variant='outline'
              onClick={() => router.push(`/bos/meetings/${meetingId}/edit`)}
            >
              <Edit className='mr-2 h-4 w-4' />
              Edit
            </Button>
          )}
          {canEdit && nextStatus && !isRatified && (
            <Button
              size='sm'
              onClick={handleTransition}
              disabled={isTransitioning || transitionStatus.isPending}
            >
              <ArrowRight className='mr-2 h-4 w-4' />
              {isTransitioning
                ? 'Updating...'
                : TRANSITION_LABELS[nextStatus] ?? `Move to ${BOS_MEETING_STATUS_LABELS[nextStatus]}`}
            </Button>
          )}
        </div>
      </PageHeader>

      {/* ── Status Stepper ───────────────────────────────────────────────── */}
      <Card>
        <CardContent className='p-4'>
          <MeetingStatusStepper currentStatus={meeting.status} />
        </CardContent>
      </Card>

      {/* ── Meeting Info ─────────────────────────────────────────────────── */}
      <div className='grid gap-4 md:grid-cols-2'>
        {/* Schedule card */}
        <Card>
          <CardHeader className='pb-3'>
            <CardTitle className='text-sm font-medium text-muted-foreground uppercase tracking-wide'>
              Schedule
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-2'>
            <InfoItem
              icon={CalendarDays}
              label='Date'
              value={
                meeting.scheduled_date
                  ? format(new Date(meeting.scheduled_date), 'EEEE, dd MMMM yyyy')
                  : null
              }
            />
            <InfoItem icon={Clock} label='Time' value={meeting.scheduled_time ?? null} />
            <InfoItem icon={MapPin} label='Venue' value={meeting.venue ?? null} />
            <InfoItem icon={CalendarDays} label='Academic Year' value={meeting.academic_year} />
            {meeting.actual_date && (
              <>
                <Separator className='my-2' />
                <InfoItem
                  icon={CheckCircle2}
                  label='Actual Date'
                  value={format(new Date(meeting.actual_date), 'dd MMM yyyy')}
                />
                {meeting.quorum_met !== undefined && (
                  <div className='flex items-center gap-2 text-sm'>
                    <CheckCircle2 className='h-4 w-4 text-muted-foreground shrink-0' />
                    <span className='text-muted-foreground'>Quorum: </span>
                    <Badge variant={meeting.quorum_met ? 'default' : 'destructive'} className='text-xs'>
                      {meeting.quorum_met ? 'Met' : 'Not Met'}
                    </Badge>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Composition card */}
        <Card>
          <CardHeader className='pb-3'>
            <CardTitle className='text-sm font-medium text-muted-foreground uppercase tracking-wide'>
              Composition
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-2'>
            {composition && (
              <>
                <p className='text-sm font-medium'>{composition.composition_title}</p>
                <p className='text-xs text-muted-foreground'>{composition.academic_year}</p>
                {Array.isArray(composition.bos_members) && (
                  <div className='flex items-center gap-1 text-xs text-muted-foreground mt-2'>
                    <Users className='h-3.5 w-3.5' />
                    <span>{composition.bos_members.length} members</span>
                  </div>
                )}
                <Button
                  variant='link'
                  size='sm'
                  className='h-auto p-0 text-xs'
                  onClick={() =>
                    router.push(
                      `/bos/compositions/${meeting.composition_id}`
                    )
                  }
                >
                  View Composition →
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Agenda Overview ───────────────────────────────────────────────── */}
      {meeting.agenda_text && (
        <Card>
          <CardHeader className='pb-3'>
            <CardTitle className='text-base'>Agenda Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <p className='text-sm whitespace-pre-line text-muted-foreground'>{meeting.agenda_text}</p>
          </CardContent>
        </Card>
      )}

      {/* ── Minutes ───────────────────────────────────────────────────────── */}
      {meeting.minutes_summary && (
        <Card>
          <CardHeader className='pb-3'>
            <CardTitle className='text-base'>Minutes Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <p className='text-sm whitespace-pre-line text-muted-foreground'>
              {meeting.minutes_summary}
            </p>
            {meeting.minutes_approved_at && (
              <p className='text-xs text-muted-foreground mt-2'>
                Approved: {format(new Date(meeting.minutes_approved_at), 'dd MMM yyyy')}
                {meeting.minutes_approved_by ? ` by ${meeting.minutes_approved_by}` : ''}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Ratification ─────────────────────────────────────────────────── */}
      {meeting.ratified_by_ac && (
        <Card>
          <CardContent className='p-4 flex items-center gap-2'>
            <CheckCircle2 className='h-5 w-5 text-green-600 shrink-0' />
            <div>
              <p className='text-sm font-medium text-green-700'>Ratified by Academic Council</p>
              {meeting.ratified_date && (
                <p className='text-xs text-muted-foreground'>
                  {format(new Date(meeting.ratified_date), 'dd MMMM yyyy')}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Agenda & Attendance Tabs ─────────────────────────────────────── */}
      <Card>
        <CardContent className='p-4'>
          <Tabs defaultValue='agenda'>
            <TabsList className='mb-4'>
              <TabsTrigger value='agenda' className='gap-1.5'>
                Agenda
                {(meeting.agenda_item_count ?? 0) > 0 && (
                  <Badge variant='secondary' className='text-xs h-5 px-1.5'>
                    {meeting.agenda_item_count}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value='attendance' className='gap-1.5'>
                Attendance
                {(meeting.attendee_count ?? 0) > 0 && (
                  <Badge variant='secondary' className='text-xs h-5 px-1.5'>
                    {meeting.attendee_count}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value='documents'>Documents</TabsTrigger>
            </TabsList>

            <TabsContent value='agenda'>
              <AgendaTab meetingId={meetingId} canEdit={canEdit} />
            </TabsContent>

            <TabsContent value='attendance'>
              <AttendanceTab
                meetingId={meetingId}
                compositionId={meeting.composition_id}
                institutionsId={meeting.institutions_id}
                canEdit={canEdit}
              />
            </TabsContent>

            <TabsContent value='documents'>
              <DocumentsTab
                meeting={meeting}
                compositionId={meeting.composition_id}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* ── Transition Metadata Dialog ───────────────────────────────────── */}
      {nextStatus && (
        <TransitionDialog
          open={showTransitionDialog}
          nextStatus={nextStatus}
          onConfirm={handleTransitionConfirm}
          onCancel={() => setShowTransitionDialog(false)}
          isPending={isTransitioning || transitionStatus.isPending}
        />
      )}
    </div>
  );
}
