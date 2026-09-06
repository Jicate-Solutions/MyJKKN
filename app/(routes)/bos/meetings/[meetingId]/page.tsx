'use client';

import { Suspense, use, useMemo, useState } from 'react';
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
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useQuery } from '@tanstack/react-query';
import { useBosInstitutionScope } from '@/hooks/bos/use-bos-institution-scope';
import { AgendaTab } from './_components/agenda-tab';
import { AttendanceTab } from './_components/attendance-tab';
import { DocumentsTab } from './_components/documents-tab';
import { SyllabusTab } from './_components/syllabi-tab';
import { MembersTab } from './_components/members-tab';
import { MinutesTab } from './_components/minutes-tab';

import { useBosMeeting, useTransitionBosMeetingStatus } from '@/hooks/bos/use-bos-meetings';
import { useTabParam } from '@/hooks/use-tab-param';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuth } from '@/hooks/use-auth';
import { useBosBoardScope } from '@/hooks/bos/use-bos-board-scope';
import { MeetingStatusStepper } from '../_components/meeting-status-stepper';
import {
  BosMeetingStatus,
  BOS_MEETING_STATUS_LABELS,
  BOS_MEETING_TYPE_LABELS,
  AC_MEETING_STATUS_ORDER,
  meetingNextStatusMap,
} from '@/types/bos';
import { logger } from '@/lib/utils/enhanced-logger';

// ── Transition button labels ──────────────────────────────────────────────────

const TRANSITION_LABELS: Partial<Record<BosMeetingStatus, string>> = {
  principal_approved: 'Submit for Principal Approval',
  noticed: 'Approved',
  expert_invited: 'Forward to Experts Invite',
  completed: 'Meeting Finalized',
  minutes_drafted: 'Draft Minutes',
  minutes_approved: 'Forward to Minutes Approval',
  ratified: 'Minutes Approved',
};

// Academic Council meetings use a shorter flow (no principal approval / expert
// invite / ratification), so the button labels differ: draft → noticed is the
// principal issuing the notice, not a chairman's "approved" hand-off.
const AC_TRANSITION_LABELS: Partial<Record<BosMeetingStatus, string>> = {
  noticed: 'Issue Notice',
  completed: 'Meeting Finalized',
  minutes_drafted: 'Draft Minutes',
  minutes_approved: 'Forward to Minutes Approval',
};

// ── Transitions that need extra metadata from the user ────────────────────────

const METADATA_TRANSITIONS = new Set<BosMeetingStatus>([
  'principal_approved',
  'minutes_approved',
  'ratified',
  // The entries below are included purely for *confirmation* — they don't
  // need extra metadata, but each is a non-trivial workflow step:
  //   • 'noticed'         → triggers post-approval handoff (this is the
  //                         principal confirming the approval; a misclick
  //                         shouldn't fire it).
  //   • 'expert_invited'  → sends invitation requests to external experts
  //                         (will fan out emails/notifications downstream).
  //   • 'completed'       → marks the meeting as finished; no rollback.
  // The TransitionDialog falls through to its generic "Confirm moving this
  // meeting to ..." branch for any nextStatus that isn't approval /
  // ratification / minutes-draft, so no dialog code changes are needed.
  'noticed',
  'expert_invited',
  'completed',
]);

interface TransitionMetadata {
  // staff.id of the selected principal/approver. Stored on bos_meetings as
  // principal_approved_by (UUID FK to staff) for principal_approved and as
  // minutes_approved_by for minutes_approved. The DB column is what later
  // gates the "Mark Notice Sent" button: only the user whose auth profile
  // matches staff.profile_id can advance the workflow further.
  principal_approved_by?: string;
  minutes_approved_by?: string;
  ratified_date?: string;   // for ratified
  minutes_summary?: string; // for minutes_drafted
}

// ── Transition Confirm Dialog ─────────────────────────────────────────────────

interface TransitionDialogProps {
  open: boolean;
  nextStatus: BosMeetingStatus;
  /** Used to scope the principal lookup to staff in this meeting's institution. */
  institutionsId: string;
  onConfirm: (meta: TransitionMetadata) => void;
  onCancel: () => void;
  isPending: boolean;
}

// Staff row shape returned by /api/staff (only the fields we use)
interface PrincipalStaff {
  id: string;
  staff_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  designation?: string | null;
}

function buildStaffDisplayName(s: PrincipalStaff): string {
  const full = `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim();
  return full || s.staff_id || 'Unnamed';
}

function TransitionDialog({
  open,
  nextStatus,
  institutionsId,
  onConfirm,
  onCancel,
  isPending,
}: TransitionDialogProps) {
  const [approver, setApprover] = useState('');
  const [ratifiedDate, setRatifiedDate] = useState('');
  const [minutesSummary, setMinutesSummary] = useState('');

  const isApproval = nextStatus === 'principal_approved' || nextStatus === 'minutes_approved';
  const isRatification = nextStatus === 'ratified';
  const isMinutesDraft = nextStatus === 'minutes_drafted';

  // CAS-aware institution scope. The meeting's institutions_id may be one
  // half of an Aided + Self-Financing pair, but the principal could be
  // registered under the sibling UUID. useBosInstitutionScope expands the
  // single id into the full pair via the COE-authoritative resolver, so we
  // never silently miss data for CAS colleges.
  const instScope = useBosInstitutionScope(institutionsId);

  // Fetch principals via the dedicated BoS lookup endpoint, NOT /api/staff.
  // /api/staff applies the staff-module scope, which collapses to 'own_records'
  // for faculty BoS members — they can only see their own staff row and would
  // never find a principal. /api/bos/lookup/principals is the designated
  // exception: BoS-auth gated, service-role staff read, matches on
  //   role_key = 'principal' OR employment_categories.category_name ILIKE 'Principal%'
  // and CAS-expands the meeting's institutions_id server-side.
  const { data: principalsData, isLoading: loadingPrincipals } = useQuery({
    queryKey: ['bos', 'principals', instScope.csv],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '50' });
      if (instScope.csv) params.set('institutionsIds', instScope.csv);
      const res = await fetch(`/api/bos/lookup/principals?${params}`);
      if (!res.ok) throw new Error('Failed to load principals');
      return res.json() as Promise<{ data: PrincipalStaff[] }>;
    },
    enabled: open && isApproval && !instScope.isLoading && !!instScope.csv,
    staleTime: 10 * 60 * 1000,
  });

  // Option value = staff.id (opaque UUID — won't collide with cmdk's value
  // normalization inside a Radix Dialog). Display string is resolved at
  // submit time so the persisted approver field remains human-readable.
  const principalOptions = useMemo(() => {
    return (principalsData?.data ?? []).map((s) => {
      const name = buildStaffDisplayName(s);
      const label = s.designation ? `${name} — ${s.designation}` : name;
      return { value: s.id, label };
    });
  }, [principalsData]);

  const handleConfirm = () => {
    // Send the raw staff.id (UUID) — the DB columns principal_approved_by /
    // minutes_approved_by are typed UUID REFERENCES staff(id). The display
    // name is derivable from the embedded staff join on the next read; we no
    // longer denormalize it into the column. Earlier code was sending a
    // formatted display string under the wrong metadata key (`approver`),
    // which the API ignored — so principal_approved_by was silently NULL for
    // every meeting up to this fix.
    const staffId = approver.trim() || undefined;
    onConfirm({
      principal_approved_by:
        nextStatus === 'principal_approved' ? staffId : undefined,
      minutes_approved_by:
        nextStatus === 'minutes_approved' ? staffId : undefined,
      ratified_date: ratifiedDate || undefined,
      minutes_summary: minutesSummary.trim() || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className='max-w-sm'>
        <DialogHeader>
          <DialogTitle>{TRANSITION_LABELS[nextStatus] ?? `Move to ${BOS_MEETING_STATUS_LABELS[nextStatus]}`}</DialogTitle>
        </DialogHeader>

        <div className='space-y-4 py-2'>
          {isApproval && (
            <div className='space-y-2'>
              <Label>
                Approved by <span className='text-destructive'>*</span>
              </Label>
              <SearchableSelect
                value={approver}
                onValueChange={setApprover}
                options={principalOptions}
                placeholder={
                  instScope.isLoading
                    ? 'Resolving institution…'
                    : loadingPrincipals
                      ? 'Loading principals…'
                      : principalOptions.length === 0
                        ? 'No principals found for this institution'
                        : 'Select principal'
                }
                searchPlaceholder='Search principal…'
                loading={instScope.isLoading || loadingPrincipals}
                disabled={instScope.isLoading || loadingPrincipals || principalOptions.length === 0}
                className='w-full'
                modal
              />
              {instScope.isCAS && !loadingPrincipals && (
                <p className='text-[11px] text-muted-foreground'>
                  Searching across both Aided & Self-Financing campuses.
                </p>
              )}
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
          <Button
            onClick={handleConfirm}
            disabled={isPending || (isApproval && !approver.trim())}
          >
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

// Main tab group values (in TabsTrigger order). `minutes` is only rendered for
// later statuses, but it's a valid deep-link target so it's included here.
const MEETING_DETAIL_TABS = [
  'agenda',
  'attendance',
  'members',
  'documents',
  'syllabus',
  'minutes',
] as const;

function MeetingDetailPageInner({ params }: MeetingDetailPageProps) {
  const { meetingId } = use(params);
  const [activeTab, setActiveTab] = useTabParam('agenda', MEETING_DETAIL_TABS);
  const router = useRouter();
  const { canAccess, isSuperAdmin } = usePermissions();
  const { profile } = useAuth();
  const bosScope = useBosBoardScope();
  const { data: meeting, isLoading } = useBosMeeting(meetingId);
  const transitionStatus = useTransitionBosMeetingStatus();
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [showTransitionDialog, setShowTransitionDialog] = useState(false);
  // Email-threshold info dialog state. Surfaced when the user clicks
  // "Meeting Finalized" (expert_invited → completed) but fewer than half of
  // the composition members have a successful email send recorded for this
  // meeting. The dialog points them at the Members tab to send more.
  const [emailThresholdInfo, setEmailThresholdInfo] = useState<{
    sent: number;
    total: number;
  } | null>(null);

  // Board meetings use academic.bos-meetings.edit. Council-family meetings
  // (Academic Council / Governing Body) are convened by principals who hold
  // the dedicated *.manage keys instead — include those so Edit Schedule &
  // Venue is visible to the people who can open those list pages.
  const canEdit =
    isSuperAdmin ||
    canAccess('academic.bos-meetings', 'edit') ||
    canAccess('academic.bos-academic-council', 'manage') ||
    canAccess('academic.bos-governing-body', 'manage');

  // Open dialog for transitions that need extra metadata; fire directly otherwise
  const handleTransition = async () => {
    if (!meeting) return;
    const nextStatus = meetingNextStatusMap(meeting.meeting_type)[meeting.status];
    if (!nextStatus) return;

    // Block draft → principal_approved if no agenda items exist. The server
    // route enforces the same rule (so we stay correct under stale cache), but
    // catching it here avoids opening the approver picker for an action that
    // will fail anyway.
    if (nextStatus === 'principal_approved' && (meeting.agenda_item_count ?? 0) < 1) {
      toast.error('Add at least one agenda item before submitting for Principal Approval.');
      return;
    }

    // Email-threshold check for "Meeting Finalized" (expert_invited → completed).
    // We require ≥ 50% of composition members to have a recorded successful
    // email send for this meeting before allowing finalization. The audit
    // source is bos_email_send_log via /api/bos/meetings/[id]/email-status —
    // the same endpoint the Members tab uses to render send-status badges.
    // Falling below threshold opens an info dialog steering the user to the
    // Members tab to send more invites; it does NOT itself send anything.
    if (nextStatus === 'completed') {
      const compositionMembers =
        ((meeting as { bos_compositions?: { bos_members?: unknown[] } }).bos_compositions
          ?.bos_members ?? []) as unknown[];
      const totalMembers = compositionMembers.length;
      if (totalMembers > 0) {
        try {
          const res = await fetch(`/api/bos/meetings/${meetingId}/email-status`);
          if (res.ok) {
            const json = (await res.json()) as {
              byMemberId?: Record<string, { status: string }>;
            };
            const sentCount = Object.values(json.byMemberId ?? {}).filter(
              (e) => e.status === 'sent',
            ).length;
            const pct = sentCount / totalMembers;
            if (pct < 0.5) {
              // Park the user-facing reminder; abort further flow until the
              // user dismisses the info dialog.
              setEmailThresholdInfo({ sent: sentCount, total: totalMembers });
              return;
            }
          }
          // If the status endpoint fails (e.g. log table missing), fall
          // through to the dialog — better to allow finalization than to
          // hard-block on an infra hiccup. The server-side workflow gates
          // still apply.
        } catch (e) {
          console.warn('[bos/meeting] email-status check failed, proceeding anyway:', e);
        }
      }
    }

    if (METADATA_TRANSITIONS.has(nextStatus)) {
      setShowTransitionDialog(true);
    } else {
      void handleTransitionConfirm({});
    }
  };

  const handleTransitionConfirm = async (meta: TransitionMetadata) => {
    if (!meeting) return;
    const nextMap = meetingNextStatusMap(meeting.meeting_type);
    const nextStatus = nextMap[meeting.status];
    if (!nextStatus) return;

    setIsTransitioning(true);
    try {
      await transitionStatus.mutateAsync({ id: meetingId, newStatus: nextStatus, metadata: meta as any });

      // Chain through the hidden 'completed' state: per the 2026-05-20 UX
      // change, clicking "Meeting Finalized" at expert_invited collapses the
      // expert_invited → completed → minutes_drafted sequence into a single
      // user action. The first PATCH lands at 'completed', then we fire a
      // follow-up to advance straight to 'minutes_drafted' so the stepper
      // visibly jumps past the Completed step. If the second PATCH fails,
      // the meeting is left at 'completed' — a super-admin can recover via
      // the legacy "Draft Minutes" button (the state-machine entry
      // completed → minutes_drafted is still permitted).
      if (nextStatus === 'completed') {
        const followUp = nextMap.completed;
        if (followUp) {
          try {
            await transitionStatus.mutateAsync({
              id: meetingId,
              newStatus: followUp,
              metadata: {},
            });
            toast.success(`Status updated to: ${BOS_MEETING_STATUS_LABELS[followUp]}`);
          } catch (chainError) {
            logger.error('academic/bos', 'Failed to chain to minutes_drafted', chainError);
            toast.error('Meeting marked completed, but advancing to Minutes Drafted failed. Use Draft Minutes to continue.');
          }
        }
      } else {
        toast.success(`Status updated to: ${BOS_MEETING_STATUS_LABELS[nextStatus]}`);
      }

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
      <div className='w-full space-y-4'>
        <Skeleton className='h-10 w-72' />
        <Skeleton className='h-20 w-full' />
        <Skeleton className='h-32 w-full' />
        <Skeleton className='h-48 w-full' />
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className='w-full'>
        <p className='text-muted-foreground'>Meeting not found.</p>
      </div>
    );
  }

  // Council-family meetings (Academic Council + Governing Body) share the shorter
  // principal-driven flow, labels, and status order. They differ only in their
  // display label and dedicated edit sub-route.
  const isGbMeeting = meeting.meeting_type === 'governing_body';
  const isAcMeeting = meeting.meeting_type === 'academic_council' || isGbMeeting;
  const councilLabel = isGbMeeting ? 'Governing Body' : 'Academic Council';
  const councilEditBase = isGbMeeting ? '/bos/governing-body' : '/bos/academic-council';
  const nextStatus = meetingNextStatusMap(meeting.meeting_type)[meeting.status];
  const transitionLabels = isAcMeeting ? AC_TRANSITION_LABELS : TRANSITION_LABELS;
  const isDraft = meeting.status === 'draft';
  const isRatified = meeting.status === 'ratified';
  const board = meeting.board as any;
  const composition = (meeting as any).bos_compositions as any;

  // Gate the next-status button. For every transition except the
  // post-principal-approval step the regular canEdit gate applies. The
  // principal_approved → noticed step is special: only the staff member who
  // was recorded as the approver during draft submission may advance it. If
  // the column is NULL (legacy meeting from before the dialog-bug fix on
  // 2026-05-19), the button is restricted to super admins so those records
  // don't get permanently stuck.
  const approverProfileId = meeting.principal_approved_by_staff?.profile_id ?? null;
  const canAdvanceFromPrincipalApproved =
    approverProfileId !== null
      ? !!profile?.id && profile.id === approverProfileId
      : isSuperAdmin;
  // Workflow gate:
  //   • draft → principal_approved (Submit for Principal Approval): only
  //     super admin OR a board member of THIS meeting's composition can push.
  //     memberOf already includes chairmen (chairman is a member record with
  //     member_type='chairman'), so a single Set check covers both. The
  //     previous rule allowed any user with the broad edit permission OR any
  //     principal — too permissive for a workflow-initiating action; tightened
  //     per UX request on 2026-05-20.
  //   • principal_approved → noticed: only the recorded approver may advance
  //   • noticed → expert_invited (Forward to Experts Invite),
  //     expert_invited → completed (Meeting Finalized),
  //     minutes_drafted → minutes_approved (Forward to Minutes Approval):
  //     same tightened rule as the draft submission — super admin OR a board
  //     member/chairman of this composition. Broad role-perm holders (e.g.
  //     someone with bos.meetings.edit but no membership) and principals can
  //     no longer push.
  //   • minutes_approved → ratified (Minutes Approved): the final
  //     ratification step belongs to the principal who oversees the academic
  //     council process. Only super-admin or principal can push — board
  //     members and chairmen who drafted the minutes are explicitly excluded
  //     from this one transition.
  //   • everything else: canEdit
  const isCompositionMember =
    !!meeting.composition_id && bosScope.memberOf.has(meeting.composition_id);
  // Minutes tab is meaningful from the minutes-drafting phase onward. We
  // explicitly include 'completed' because legacy meetings stuck at that
  // status (created before the 2026-05-20 skip-chain shipped) still need a
  // place to draft minutes — without this they'd be locked out of the tab
  // until a super-admin advances them.
  const showMinutesTab = ['completed', 'minutes_drafted', 'minutes_approved', 'ratified'].includes(
    meeting.status,
  );
  const canTransitionNext = isAcMeeting
    // Academic Council: the principal convenes and drives every transition
    // (they are not a bos_members row on the AC body, so the composition-member
    // rule below would wrongly lock them out). Super-admin always allowed.
    ? isSuperAdmin || bosScope.isPrincipal
    : meeting.status === 'principal_approved'
      ? canAdvanceFromPrincipalApproved
      : meeting.status === 'minutes_approved'
        ? isSuperAdmin || bosScope.isPrincipal
        : meeting.status === 'draft' ||
            meeting.status === 'noticed' ||
            meeting.status === 'expert_invited' ||
            meeting.status === 'minutes_drafted'
          ? isSuperAdmin || isCompositionMember
          : canEdit;

  return (
    <div className='w-full space-y-6'>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <PageHeader
        title={meeting.meeting_title ?? `Meeting #${meeting.meeting_number}/${meeting.academic_year}`}
        description={
          isAcMeeting
            ? `${councilLabel} · ${meeting.academic_year}`
            : board
              ? `${board.board_name} · ${BOS_MEETING_TYPE_LABELS[meeting.meeting_type]}`
              : ''
        }
      >
        <div className='flex flex-wrap items-center gap-2'>
          {canEdit && (isDraft || meeting.status === 'principal_approved') && (
            <Button
              size='sm'
              variant='outline'
              onClick={() =>
                router.push(
                  isAcMeeting
                    ? `${councilEditBase}/${meetingId}/edit`
                    : `/bos/meetings/${meetingId}/edit`,
                )
              }
            >
              <Edit className='mr-2 h-4 w-4' />
              Edit Schedule & Venue
            </Button>
          )}
          {canTransitionNext && nextStatus && !isRatified && (
            <Button
              size='sm'
              onClick={() => void handleTransition()}
              disabled={isTransitioning || transitionStatus.isPending}
            >
              <ArrowRight className='mr-2 h-4 w-4' />
              {isTransitioning
                ? 'Updating...'
                : transitionLabels[nextStatus] ?? `Move to ${BOS_MEETING_STATUS_LABELS[nextStatus]}`}
            </Button>
          )}
        </div>
      </PageHeader>

      {/* ── Status Stepper ───────────────────────────────────────────────── */}
      <Card>
        <CardContent className='p-4'>
          <MeetingStatusStepper
            currentStatus={meeting.status}
            order={isAcMeeting ? AC_MEETING_STATUS_ORDER : undefined}
          />
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
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className='mb-4 flex w-full max-w-full justify-start overflow-x-auto sm:inline-flex sm:w-auto [&>button]:shrink-0'>
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
              <TabsTrigger value='members'>Members</TabsTrigger>
              <TabsTrigger value='documents'>Documents</TabsTrigger>
              <TabsTrigger value='syllabus'>Syllabus</TabsTrigger>
              {showMinutesTab && (
                <TabsTrigger value='minutes'>Minutes</TabsTrigger>
              )}
            </TabsList>

            <TabsContent value='agenda'>
              <AgendaTab meetingId={meetingId} canEdit={canEdit} meetingStatus={meeting.status} />
            </TabsContent>

            <TabsContent value='attendance'>
              <AttendanceTab
                meetingId={meetingId}
                compositionId={meeting.composition_id}
                institutionsId={meeting.institutions_id}
                canEdit={canEdit}
                meetingStatus={meeting.status}
                committeeId={meeting.committee_id}
                meetingType={meeting.meeting_type}
              />
            </TabsContent>

            <TabsContent value='members'>
              <MembersTab
                meetingId={meetingId}
                compositionId={meeting.composition_id}
                meetingStatus={meeting.status}
                meetingType={meeting.meeting_type}
                committeeId={meeting.committee_id}
              />
            </TabsContent>

            <TabsContent value='documents'>
              <DocumentsTab
                meeting={meeting}
                compositionId={meeting.composition_id}
              />
            </TabsContent>

            <TabsContent value='syllabus'>
              <SyllabusTab
                meetingId={meetingId}
                boardId={meeting.board_id}
                regulationId={meeting.regulation_id}
                compositionId={meeting.composition_id}
                institutionsId={meeting.institutions_id}
                meetingStatus={meeting.status}
                canEdit={canEdit}
              />
            </TabsContent>

            {showMinutesTab && (
              <TabsContent value='minutes'>
                {/* Force read-only once minutes are approved or the meeting
                    is ratified: at that point the minutes are formally
                    accepted by the academic council and editing them would
                    invalidate the auto-forked V2 syllabi that were created
                    on that approval. canEdit composed with the status gate
                    keeps both permission and lifecycle rules in one place. */}
                <MinutesTab
                  meeting={meeting}
                  canEdit={
                    canEdit &&
                    meeting.status !== 'minutes_approved' &&
                    meeting.status !== 'ratified'
                  }
                />
              </TabsContent>
            )}
          </Tabs>
        </CardContent>
      </Card>

      {/* ── Transition Metadata Dialog ───────────────────────────────────── */}
      {nextStatus && (
        <TransitionDialog
          open={showTransitionDialog}
          nextStatus={nextStatus}
          institutionsId={meeting.institutions_id}
          onConfirm={handleTransitionConfirm}
          onCancel={() => setShowTransitionDialog(false)}
          isPending={isTransitioning || transitionStatus.isPending}
        />
      )}

      {/* ── Email-threshold info dialog ───────────────────────────────────
          Shown when "Meeting Finalized" is clicked but the per-meeting email
          send log shows fewer than 50% of composition members have a
          successful send recorded. Pure info — no action wired (the user
          must navigate to the Members tab themselves and send more emails). */}
      <Dialog
        open={!!emailThresholdInfo}
        onOpenChange={(v) => { if (!v) setEmailThresholdInfo(null); }}
      >
        <DialogContent className='max-w-md'>
          <DialogHeader>
            <DialogTitle>Email threshold not reached</DialogTitle>
            <DialogDescription>
              {emailThresholdInfo && (
                <>
                  Only <strong>{emailThresholdInfo.sent}</strong> of{' '}
                  <strong>{emailThresholdInfo.total}</strong> members
                  {' '}({Math.round(
                    (emailThresholdInfo.sent / Math.max(1, emailThresholdInfo.total)) * 100,
                  )}
                  %) have a successful meeting-invitation email recorded.
                  At least <strong>50%</strong> must be notified before this
                  meeting can be finalized.
                  <br />
                  <br />
                  Open the <strong>Members</strong> tab to send invitations to
                  the remaining members, then try again.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setEmailThresholdInfo(null)}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// useTabParam() reads useSearchParams(), so the page body must sit under a
// <Suspense> boundary.
export default function MeetingDetailPage({ params }: MeetingDetailPageProps) {
  return (
    <Suspense fallback={null}>
      <MeetingDetailPageInner params={params} />
    </Suspense>
  );
}
