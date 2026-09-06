// app/(routes)/accreditation/naac/committees/[id]/_components/meetings-section.tsx
// ============================================================================
// IQAC Meeting Loop panel (PR 2/3) — mounted on the committee detail page.
//
// The loop: convene a meeting (Act) → review every still-open resolution from
// earlier meetings as done / carried / dropped (Measure) → carried items
// build a strike counter, 2+ strikes = "Escalate to Director" (Decide) →
// close the meeting with a prefilled Action-Taken-Report minutes summary,
// and whatever stayed open reappears at the NEXT meeting (Feed-forward).
// CI re-trigger 2026-07-10: merge-ref refresh after #1950 unblocked the coverage gate.
// ============================================================================

'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertTriangle,
  CalendarPlus,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  Plus,
  RefreshCcw,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { AccreditationCommittee } from '@/lib/services/accreditation/accreditation-committee-service';
import type {
  CommitteeMeeting,
  CommitteeResolution,
  MeetingStatus,
  ResolutionReviewAction,
} from '@/lib/services/accreditation/committee-meeting-service';
import {
  useCancelMeeting,
  useCloseMeeting,
  useCommitteeMeetings,
  useCreateMeeting,
  useMarkMeetingHeld,
  useMeetingResolutions,
  useOpenResolutions,
  usePassResolution,
  useReviewedInMeeting,
  useReviewResolution,
} from '@/hooks/accreditation/use-naac-committee-meetings';
import {
  useMeetingAiDrafts,
  usePendingSittingProposal,
} from '@/hooks/accreditation/use-naac-meeting-drafts';
import type { MeetingAiDraft } from '@/lib/services/accreditation/committee-meeting-service';
import {
  AgendaDraftPanel,
  MinutesPolishOffer,
  SittingProposalCard,
} from './ai-assistant-panels';
import { MemberNotesPanel } from './member-notes-panel';
import { toast } from 'sonner';

// ----------------------------------------------------------------------------
// Small shared helpers
// ----------------------------------------------------------------------------

const STATUS_LABELS: Record<MeetingStatus, string> = {
  scheduled: 'Scheduled',
  held: 'Held — in review',
  minuted: 'Minuted',
  cancelled: 'Cancelled',
};

const STATUS_ACCENT: Record<MeetingStatus, string> = {
  scheduled:
    'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
  held: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  minuted:
    'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  cancelled:
    'bg-slate-100 text-slate-500 dark:bg-slate-800/60 dark:text-slate-400',
};

function fmtDateTime(ts: string | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function meetingDateLabel(m: CommitteeMeeting): string {
  if (m.held_at) return `held ${fmtDateTime(m.held_at)}`;
  if (m.scheduled_for) return `scheduled for ${m.scheduled_for}`;
  return '';
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

function isOverdue(r: CommitteeResolution): boolean {
  return r.status === 'open' && !!r.due_date && r.due_date < todayISO();
}

interface ProfileLite {
  id: string;
  full_name: string | null;
  email: string | null;
}

function profileName(p: ProfileLite | undefined): string | null {
  if (!p) return null;
  return p.full_name?.trim() || (p.email ?? null);
}

/** Same lookup pattern as the detail page: batch-resolve profile names. */
function useProfileLookup(userIds: string[]) {
  return useQuery({
    queryKey: ['profiles', 'lookup', [...userIds].sort().join(',')],
    queryFn: async (): Promise<Record<string, ProfileLite>> => {
      if (userIds.length === 0) return {};
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds);
      if (error) throw error;
      return ((data ?? []) as ProfileLite[]).reduce<
        Record<string, ProfileLite>
      >((acc, p) => {
        acc[p.id] = p;
        return acc;
      }, {});
    },
    enabled: userIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}

function ownerDisplay(
  r: CommitteeResolution,
  profiles: Record<string, ProfileLite> | undefined,
): string {
  if (r.owner_label) return r.owner_label;
  if (r.owner_user_id) {
    return profileName(profiles?.[r.owner_user_id]) ?? 'Unassigned';
  }
  return 'Unassigned';
}

interface InstitutionLite {
  id: string;
  name: string;
  iqac_code: string | null;
  institution_type: string;
}

/**
 * Same institutions list (and query key) the committees list page uses —
 * shared react-query cache, no new fetch mechanism.
 */
function useJKKNInstitutions(enabled = true) {
  return useQuery({
    queryKey: ['institutions', 'jkkn-iqac'],
    queryFn: async (): Promise<InstitutionLite[]> => {
      const sb = createClientSupabaseClient() as any;
      const { data, error } = await sb
        .from('institutions')
        .select('id, name, iqac_code, institution_type')
        .not('iqac_code', 'is', null)
        .order('iqac_code');
      if (error) throw error;
      return (data ?? []) as InstitutionLite[];
    },
    enabled,
    staleTime: 30 * 60 * 1000,
  });
}

/**
 * C7 chips: the colleges a (cluster) resolution touches. Renders nothing
 * when the resolution carries no tags.
 */
function AffectedCollegesChips({
  ids,
}: {
  ids: string[] | null | undefined;
}) {
  const tagIds = ids ?? [];
  const { data: institutions } = useJKKNInstitutions(tagIds.length > 0);
  if (tagIds.length === 0) return null;
  return (
    <span className="flex flex-wrap items-center gap-1">
      {tagIds.map((iid) => {
        const inst = institutions?.find((i) => i.id === iid);
        return (
          <Badge key={iid} variant="outline" className="text-[10px]">
            {inst?.iqac_code ?? inst?.name ?? 'College'}
          </Badge>
        );
      })}
    </span>
  );
}

// ----------------------------------------------------------------------------
// Main section
// ----------------------------------------------------------------------------

export function MeetingsSection({
  committee,
  canManage,
}: {
  committee: AccreditationCommittee;
  canManage: boolean;
}) {
  const { data: meetings, isLoading } = useCommitteeMeetings(committee.id);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // AI committee assistant (DARK until the Director flips the job types on, so
  // both of these legitimately return nothing today).
  const { data: aiDrafts, isLoading: draftsLoading } = useMeetingAiDrafts(committee.id);
  const { data: proposal, isLoading: proposalLoading } = usePendingSittingProposal(committee.id);

  /** The live AI draft of one kind for one meeting (discarded ones are ignored). */
  const draftFor = (meetingId: string, kind: 'agenda' | 'minutes'): MeetingAiDraft | undefined =>
    (aiDrafts ?? []).find(
      (d) => d.meeting_id === meetingId && d.draft_kind === kind && d.status !== 'discarded',
    );

  const canWrite = canManage && committee.is_active;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <RefreshCcw className="h-5 w-5" />
            Meetings — Loop Review
            <Badge variant="outline" className="ml-2">
              {isLoading ? '—' : meetings?.length ?? 0}
            </Badge>
          </CardTitle>
          {canWrite && <ConveneMeetingDialog committee={committee} />}
        </div>
      </CardHeader>
      <CardContent>
        <SittingProposalCard
          proposal={proposal}
          isLoading={proposalLoading}
          canManage={canWrite}
        />
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (meetings ?? []).length === 0 ? (
          <div className="space-y-3 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            <p>
              Every meeting passes resolutions with an owner and a due date,
              and the next meeting opens by checking whether they actually
              happened — done, carried forward, or dropped.
            </p>
            {canWrite && <ConveneMeetingDialog committee={committee} />}
          </div>
        ) : (
          <div className="space-y-2">
            {(meetings ?? []).map((m) => (
              <MeetingRow
                key={m.id}
                meeting={m}
                committee={committee}
                canManage={canWrite}
                expanded={expandedId === m.id}
                onToggle={() =>
                  setExpandedId((cur) => (cur === m.id ? null : m.id))
                }
                agendaDraft={draftFor(m.id, 'agenda')}
                minutesDraft={draftFor(m.id, 'minutes')}
                draftsLoading={draftsLoading}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ----------------------------------------------------------------------------
// Convene dialog — one-tap "convene now" (create + held) or schedule ahead.
// ----------------------------------------------------------------------------

function ConveneMeetingDialog({
  committee,
}: {
  committee: AccreditationCommittee;
}) {
  const [open, setOpen] = useState(false);
  const [scheduledFor, setScheduledFor] = useState('');
  const createMeeting = useCreateMeeting();

  const submit = async (conveneNow: boolean) => {
    if (!conveneNow && !scheduledFor) {
      toast.error('Pick a date to schedule the meeting');
      return;
    }
    try {
      await createMeeting.mutateAsync({
        committee_id: committee.id,
        institution_id: committee.institution_id,
        scheduled_for: scheduledFor || null,
        convene_now: conveneNow,
      });
      toast.success(
        conveneNow ? 'Meeting convened — review is open' : 'Meeting scheduled',
      );
      setScheduledFor('');
      setOpen(false);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : 'Failed to create meeting',
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <CalendarPlus className="mr-2 h-4 w-4" />
          Convene meeting
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Convene a committee meeting</DialogTitle>
          <DialogDescription>
            "Convene now" opens the meeting immediately — you can review open
            resolutions and pass new ones straight away. Or schedule it for a
            later date.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>Meeting date (optional for "Convene now")</Label>
          <Input
            type="date"
            value={scheduledFor}
            onChange={(e) => setScheduledFor(e.target.value)}
          />
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => submit(false)}
            disabled={createMeeting.isPending}
          >
            Schedule
          </Button>
          <Button
            onClick={() => submit(true)}
            disabled={createMeeting.isPending}
          >
            {createMeeting.isPending ? 'Working…' : 'Convene now'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ----------------------------------------------------------------------------
// One meeting row — header + expandable body per status.
// ----------------------------------------------------------------------------

function MeetingRow({
  meeting,
  committee,
  canManage,
  expanded,
  onToggle,
  agendaDraft,
  minutesDraft,
  draftsLoading,
}: {
  meeting: CommitteeMeeting;
  committee: AccreditationCommittee;
  canManage: boolean;
  expanded: boolean;
  onToggle: () => void;
  agendaDraft?: MeetingAiDraft;
  minutesDraft?: MeetingAiDraft;
  draftsLoading: boolean;
}) {
  return (
    <div className="rounded-lg border">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-muted/50"
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <span className="text-sm font-medium">
            Meeting #{meeting.meeting_no}
          </span>
          <span className="text-xs text-muted-foreground">
            {meetingDateLabel(meeting)}
          </span>
        </div>
        <Badge
          className={`border-0 text-[11px] ${STATUS_ACCENT[meeting.status]}`}
        >
          {STATUS_LABELS[meeting.status]}
        </Badge>
      </button>

      {expanded && (
        <div className="border-t px-3 py-3">
          {meeting.status === 'scheduled' && (
            <ScheduledMeetingBody
              meeting={meeting}
              canManage={canManage}
              agendaDraft={agendaDraft}
              draftsLoading={draftsLoading}
            />
          )}
          {meeting.status === 'held' && (
            <HeldMeetingWorkview
              meeting={meeting}
              committee={committee}
              canManage={canManage}
              agendaDraft={agendaDraft}
              minutesDraft={minutesDraft}
              draftsLoading={draftsLoading}
            />
          )}
          {meeting.status === 'minuted' && (
            <MinutedMeetingBody
              meeting={meeting}
              committee={committee}
              canManage={canManage}
            />
          )}
          {meeting.status === 'cancelled' && (
            <p className="text-sm text-muted-foreground">
              This meeting was cancelled.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Scheduled meeting — mark held / cancel.
// ----------------------------------------------------------------------------

function ScheduledMeetingBody({
  meeting,
  canManage,
  agendaDraft,
  draftsLoading,
}: {
  meeting: CommitteeMeeting;
  canManage: boolean;
  agendaDraft?: MeetingAiDraft;
  draftsLoading: boolean;
}) {
  const markHeld = useMarkMeetingHeld();
  const cancel = useCancelMeeting();

  if (!canManage) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Scheduled{meeting.scheduled_for ? ` for ${meeting.scheduled_for}` : ''}
          . The review opens once the meeting is held.
        </p>
        <p className="text-xs text-muted-foreground">
          Member accounts open at the same moment. If this sitting has already
          taken place, ask the IQAC Coordinator to mark it held so everyone can
          write their own account of it.
        </p>
        <AgendaDraftPanel draft={agendaDraft} isLoading={draftsLoading} canManage={false} />
      </div>
    );
  }

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Action failed';
      toast.error(msg);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={() =>
            run(
              () =>
                markHeld.mutateAsync({
                  meetingId: meeting.id,
                  committeeId: meeting.committee_id,
                }),
              'Meeting marked held — review is open',
            )
          }
          disabled={markHeld.isPending || cancel.isPending}
        >
          <CheckCircle2 className="mr-2 h-4 w-4" />
          Mark held
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            run(
              () =>
                cancel.mutateAsync({
                  meetingId: meeting.id,
                  committeeId: meeting.committee_id,
                }),
              'Meeting cancelled',
            )
          }
          disabled={markHeld.isPending || cancel.isPending}
        >
          <XCircle className="mr-2 h-4 w-4" />
          Cancel meeting
        </Button>
      </div>
      <Separator />
      <AgendaDraftPanel draft={agendaDraft} isLoading={draftsLoading} canManage />
    </div>
  );
}

// ----------------------------------------------------------------------------
// Held meeting — the working view: review queue + new resolutions + close.
// ----------------------------------------------------------------------------

function HeldMeetingWorkview({
  meeting,
  committee,
  canManage,
  agendaDraft,
  minutesDraft,
  draftsLoading,
}: {
  meeting: CommitteeMeeting;
  committee: AccreditationCommittee;
  canManage: boolean;
  agendaDraft?: MeetingAiDraft;
  minutesDraft?: MeetingAiDraft;
  draftsLoading: boolean;
}) {
  const { data: openResolutions, isLoading: openLoading } = useOpenResolutions(
    committee.id,
  );
  const { data: passedHere, isLoading: passedLoading } = useMeetingResolutions(
    meeting.id,
  );
  const { data: reviewedHere } = useReviewedInMeeting(meeting.id);

  // Review queue = open items from EARLIER meetings, not yet reviewed in
  // THIS meeting (a carried item stays 'open' but leaves this queue once
  // its strike is recorded here; it reappears at the next meeting).
  const reviewQueue = (openResolutions ?? []).filter(
    (r) => r.meeting_id !== meeting.id && r.reviewed_in_meeting_id !== meeting.id,
  );

  const ownerIds = [
    ...new Set(
      [...(openResolutions ?? []), ...(passedHere ?? []), ...(reviewedHere ?? [])]
        .map((r) => r.owner_user_id)
        .filter((id): id is string => !!id),
    ),
  ];
  const { data: profiles } = useProfileLookup(ownerIds);

  return (
    <div className="space-y-5">
      {/* a. Review of open resolutions from earlier meetings */}
      <div>
        <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <RotateCcw className="h-4 w-4" />
          Review of open resolutions
          <Badge variant="outline">{reviewQueue.length}</Badge>
        </h4>
        {openLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : reviewQueue.length === 0 ? (
          <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
            No open resolutions from earlier meetings — nothing to review.
          </p>
        ) : (
          <div className="space-y-2">
            {reviewQueue.map((r) => (
              <ReviewRow
                key={r.id}
                resolution={r}
                meeting={meeting}
                profiles={profiles}
                canManage={canManage}
              />
            ))}
          </div>
        )}
        {(reviewedHere ?? []).length > 0 && (
          <div className="mt-2 space-y-1">
            {(reviewedHere ?? []).map((r) => (
              <ReviewedLine key={r.id} resolution={r} />
            ))}
          </div>
        )}
      </div>

      <Separator />

      {/* b. New resolutions passed in this meeting */}
      <div>
        <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Plus className="h-4 w-4" />
          New resolutions
          <Badge variant="outline">{passedHere?.length ?? 0}</Badge>
        </h4>
        {canManage && (
          <PassResolutionForm meeting={meeting} committee={committee} />
        )}
        {passedLoading ? (
          <Skeleton className="mt-2 h-10 w-full" />
        ) : (passedHere ?? []).length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            No resolutions passed in this meeting yet.
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {(passedHere ?? []).map((r) => (
              <li
                key={r.id}
                className="rounded-md border bg-card px-3 py-2 text-sm"
              >
                <div>{r.resolution_text}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <span>
                    Owner: {ownerDisplay(r, profiles)}
                    {r.due_date ? ` · due ${r.due_date}` : ''}
                  </span>
                  <AffectedCollegesChips ids={r.affected_institution_ids} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Separator />

      {/* c. Each member's own account of the sitting — and the Chairman /
             Coordinator's compile into the official minutes. */}
      <MemberNotesPanel
        meeting={meeting}
        committee={committee}
        canManage={canManage}
      />

      {agendaDraft && (
        <>
          <Separator />
          <AgendaDraftPanel
            draft={agendaDraft}
            isLoading={draftsLoading}
            canManage={canManage}
          />
        </>
      )}

      {canManage && (
        <>
          <Separator />
          <div className="flex justify-end">
            <CloseMeetingDialog
              meeting={meeting}
              reviewed={reviewedHere ?? []}
              passed={passedHere ?? []}
              profiles={profiles}
              minutesDraft={minutesDraft}
            />
          </div>
        </>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// One open resolution in the review queue.
// ----------------------------------------------------------------------------

function ReviewRow({
  resolution,
  meeting,
  profiles,
  canManage,
}: {
  resolution: CommitteeResolution;
  meeting: CommitteeMeeting;
  profiles: Record<string, ProfileLite> | undefined;
  canManage: boolean;
}) {
  const review = useReviewResolution();
  const [dialogAction, setDialogAction] =
    useState<Exclude<ResolutionReviewAction, 'carried'> | null>(null);

  const overdue = isOverdue(resolution);
  const escalate = resolution.carried_count >= 2;

  const carry = async () => {
    try {
      await review.mutateAsync({
        id: resolution.id,
        action: 'carried',
        reviewedInMeetingId: meeting.id,
        committeeId: resolution.committee_id,
      });
      toast.success('Carried forward — it reappears at the next meeting');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to record review');
    }
  };

  return (
    <div className="rounded-md border bg-card px-3 py-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="text-sm">{resolution.resolution_text}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>Owner: {ownerDisplay(resolution, profiles)}</span>
            {resolution.due_date && <span>Due: {resolution.due_date}</span>}
            {overdue && (
              <Badge
                variant="destructive"
                className="gap-1 text-[10px] uppercase"
              >
                <AlertTriangle className="h-3 w-3" />
                Overdue
              </Badge>
            )}
            {resolution.carried_count > 0 && (
              <Badge variant="outline" className="text-[10px]">
                Carried ×{resolution.carried_count}
              </Badge>
            )}
            {escalate && (
              <Badge className="gap-1 border-0 bg-red-100 text-[10px] uppercase text-red-800 dark:bg-red-900/40 dark:text-red-200">
                <AlertTriangle className="h-3 w-3" />
                Escalate to Director
              </Badge>
            )}
            <AffectedCollegesChips ids={resolution.affected_institution_ids} />
          </div>
        </div>
        {canManage && (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              onClick={() => setDialogAction('done')}
              disabled={review.isPending}
            >
              <CheckCircle2 className="mr-1 h-3.5 w-3.5 text-emerald-600" />
              Done
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              onClick={carry}
              disabled={review.isPending}
            >
              <RotateCcw className="mr-1 h-3.5 w-3.5 text-amber-600" />
              Carried
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              onClick={() => setDialogAction('dropped')}
              disabled={review.isPending}
            >
              <XCircle className="mr-1 h-3.5 w-3.5 text-red-600" />
              Dropped
            </Button>
          </div>
        )}
      </div>

      {dialogAction && (
        <ReviewOutcomeDialog
          resolution={resolution}
          meeting={meeting}
          action={dialogAction}
          onClose={() => setDialogAction(null)}
        />
      )}
    </div>
  );
}

function ReviewOutcomeDialog({
  resolution,
  meeting,
  action,
  onClose,
}: {
  resolution: CommitteeResolution;
  meeting: CommitteeMeeting;
  action: Exclude<ResolutionReviewAction, 'carried'>;
  onClose: () => void;
}) {
  const review = useReviewResolution();
  const [note, setNote] = useState('');
  const noteRequired = action === 'dropped';

  const confirm = async () => {
    if (noteRequired && !note.trim()) {
      toast.error('A reason is required when dropping a resolution');
      return;
    }
    try {
      await review.mutateAsync({
        id: resolution.id,
        action,
        reviewedInMeetingId: meeting.id,
        committeeId: resolution.committee_id,
        outcomeNote: note.trim() || null,
      });
      toast.success(
        action === 'done' ? 'Marked done' : 'Dropped with reason recorded',
      );
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to record review');
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {action === 'done' ? 'Mark resolution done' : 'Drop resolution'}
          </DialogTitle>
          <DialogDescription className="line-clamp-3">
            {resolution.resolution_text}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>
            Outcome note{noteRequired ? ' (required)' : ' (optional)'}
          </Label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              action === 'done'
                ? 'What was actually done / evidence reference…'
                : 'Why is this resolution being dropped…'
            }
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={review.isPending}>
            Cancel
          </Button>
          <Button
            onClick={confirm}
            disabled={review.isPending}
            variant={action === 'dropped' ? 'destructive' : 'default'}
          >
            {review.isPending
              ? 'Saving…'
              : action === 'done'
                ? 'Mark done'
                : 'Drop resolution'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A resolution already reviewed in this meeting — compact confirmation line. */
function ReviewedLine({ resolution }: { resolution: CommitteeResolution }) {
  const verdict =
    resolution.status === 'done'
      ? 'done'
      : resolution.status === 'dropped'
        ? 'dropped'
        : 'carried forward';
  const accent =
    resolution.status === 'done'
      ? 'text-emerald-700 dark:text-emerald-300'
      : resolution.status === 'dropped'
        ? 'text-red-700 dark:text-red-300'
        : 'text-amber-700 dark:text-amber-300';
  return (
    <div className="flex items-start gap-2 rounded-md bg-muted/50 px-3 py-1.5 text-xs">
      <span className={`font-medium ${accent}`}>{verdict}</span>
      <span className="min-w-0 flex-1 text-muted-foreground">
        {resolution.resolution_text}
        {resolution.outcome_note ? ` — ${resolution.outcome_note}` : ''}
      </span>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Pass a new resolution — inline form.
// ----------------------------------------------------------------------------

function PassResolutionForm({
  meeting,
  committee,
}: {
  meeting: CommitteeMeeting;
  committee: AccreditationCommittee;
}) {
  const pass = usePassResolution();
  const [text, setText] = useState('');
  const [ownerLabel, setOwnerLabel] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [affectedIds, setAffectedIds] = useState<string[]>([]);

  // C7: a cluster (CAC) resolution names the colleges it touches; those
  // colleges' IQAC briefs pick it up. Per-college committees skip the field.
  const isCluster = committee.committee_type === 'cluster';
  const { data: institutions } = useJKKNInstitutions(isCluster);

  const toggleAffected = (id: string, checked: boolean) => {
    setAffectedIds((cur) =>
      checked ? [...cur, id] : cur.filter((x) => x !== id),
    );
  };

  const submit = async () => {
    if (!text.trim()) {
      toast.error('Resolution text is required');
      return;
    }
    // The Act gate requires an accountable owner — mirrors the substrate's
    // acr_owner_required CHECK (#1947), so the constraint error never
    // surfaces raw.
    if (!ownerLabel.trim()) {
      toast.error('Every resolution needs an owner — add a name or designation');
      return;
    }
    try {
      await pass.mutateAsync({
        committee_id: committee.id,
        meeting_id: meeting.id,
        institution_id: committee.institution_id,
        resolution_text: text.trim(),
        owner_label: ownerLabel.trim(),
        due_date: dueDate || null,
        ...(isCluster && affectedIds.length > 0
          ? { affected_institution_ids: affectedIds }
          : {}),
      });
      toast.success('Resolution passed');
      setText('');
      setOwnerLabel('');
      setDueDate('');
      setAffectedIds([]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to pass resolution');
    }
  };

  return (
    <div className="space-y-2 rounded-md border border-dashed p-3">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="RESOLVED: …"
        rows={2}
      />
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={ownerLabel}
          onChange={(e) => setOwnerLabel(e.target.value)}
          placeholder="Owner (name / designation) — required"
          className="sm:flex-1"
        />
        <Input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="sm:w-44"
        />
        <Button size="sm" onClick={submit} disabled={pass.isPending}>
          {pass.isPending ? 'Passing…' : 'Pass resolution'}
        </Button>
      </div>
      {isCluster && (
        <div className="space-y-1.5 pt-1">
          <Label className="text-xs">Affected colleges (optional)</Label>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {(institutions ?? []).map((inst) => (
              <label
                key={inst.id}
                className="flex cursor-pointer items-center gap-1.5 text-xs"
              >
                <Checkbox
                  checked={affectedIds.includes(inst.id)}
                  onCheckedChange={(v) => toggleAffected(inst.id, v === true)}
                />
                {inst.iqac_code ? `[${inst.iqac_code}] ` : ''}
                {inst.name}
              </label>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Tags route this cluster resolution to each college's IQAC brief.
          </p>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Close meeting — prefilled, editable Action-Taken-Report minutes.
// ----------------------------------------------------------------------------

function buildMinutesSummary(
  meeting: CommitteeMeeting,
  reviewed: CommitteeResolution[],
  passed: CommitteeResolution[],
  profiles: Record<string, ProfileLite> | undefined,
): string {
  const done = reviewed.filter((r) => r.status === 'done');
  const dropped = reviewed.filter((r) => r.status === 'dropped');
  // Carried items keep status='open' with reviewed_in_meeting_id = this one.
  const carried = reviewed.filter(
    (r) => r.status !== 'done' && r.status !== 'dropped',
  );
  const dateLabel = meeting.held_at
    ? new Date(meeting.held_at).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : meeting.scheduled_for ?? '';

  const verdict = (r: CommitteeResolution) =>
    r.status === 'done' ? 'done' : r.status === 'dropped' ? 'dropped' : 'carried';

  const lines: string[] = [
    `Loop Review — meeting #${meeting.meeting_no}, ${dateLabel}. ` +
      `Reviewed ${reviewed.length} prior resolutions: ${done.length} done, ` +
      `${carried.length} carried forward, ${dropped.length} dropped. ` +
      `Passed ${passed.length} new resolutions.`,
  ];
  for (const r of reviewed) {
    lines.push(
      `${r.resolution_text} — ${verdict(r)}${r.outcome_note ? `: ${r.outcome_note}` : ''}`,
    );
  }
  for (const r of passed) {
    const owner = ownerDisplay(r, profiles);
    lines.push(
      `RESOLVED: ${r.resolution_text} (${owner}${r.due_date ? `, due ${r.due_date}` : ''})`,
    );
  }
  return lines.join('\n');
}

function CloseMeetingDialog({
  meeting,
  reviewed,
  passed,
  profiles,
  minutesDraft,
}: {
  meeting: CommitteeMeeting;
  reviewed: CommitteeResolution[];
  passed: CommitteeResolution[];
  profiles: Record<string, ProfileLite> | undefined;
  minutesDraft?: MeetingAiDraft;
}) {
  const [open, setOpen] = useState(false);
  const [minutes, setMinutes] = useState('');
  const close = useCloseMeeting();

  // Minutes text may already exist before close — the Chairman/Coordinator can
  // compile the members' own accounts into minutes_summary while the sitting is
  // still 'held'. Seeding the box from the structural builder in that case would
  // silently discard their work the moment this dialog opened, which is the same
  // hazard the compile dialog guards against from the other direction. Existing
  // text wins; the structural prefill is the fallback for an empty minute.
  const handleOpenChange = (v: boolean) => {
    if (v) {
      const existing = (meeting.minutes_summary ?? '').trim();
      setMinutes(
        existing.length > 0
          ? existing
          : buildMinutesSummary(meeting, reviewed, passed, profiles),
      );
    }
    setOpen(v);
  };

  const confirm = async () => {
    if (!minutes.trim()) {
      toast.error('Minutes summary cannot be empty');
      return;
    }
    try {
      await close.mutateAsync({
        meetingId: meeting.id,
        committeeId: meeting.committee_id,
        minutesSummary: minutes.trim(),
      });
      toast.success('Meeting minuted — the loop record is closed');
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to close meeting');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">
          <FileText className="mr-2 h-4 w-4" />
          Close meeting
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Close meeting #{meeting.meeting_no}</DialogTitle>
          <DialogDescription>
            The minutes below are assembled from this session's reviews and
            new resolutions — edit freely before confirming. Closing marks the
            meeting minuted; this text becomes the Action-Taken Report.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          rows={12}
          className="font-mono text-xs"
        />
        {/* The AI write-up is an alternative offered BESIDE the structural
            prefill, never an auto-overwrite: "Use this text" only fills the box
            above, and closeMeeting stays the sole writer of minutes_summary. */}
        <MinutesPolishOffer draft={minutesDraft} onUse={setMinutes} />
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={close.isPending}
          >
            Cancel
          </Button>
          <Button onClick={confirm} disabled={close.isPending}>
            {close.isPending ? 'Closing…' : 'Confirm & close'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ----------------------------------------------------------------------------
// Minuted meeting — read-only record.
// ----------------------------------------------------------------------------

function MinutedMeetingBody({
  meeting,
  committee,
  canManage,
}: {
  meeting: CommitteeMeeting;
  committee: AccreditationCommittee;
  canManage: boolean;
}) {
  const { data: passedHere } = useMeetingResolutions(meeting.id);
  const { data: reviewedHere } = useReviewedInMeeting(meeting.id);

  const ownerIds = [
    ...new Set(
      [...(passedHere ?? []), ...(reviewedHere ?? [])]
        .map((r) => r.owner_user_id)
        .filter((id): id is string => !!id),
    ),
  ];
  const { data: profiles } = useProfileLookup(ownerIds);

  return (
    <div className="space-y-4">
      <div>
        <h4 className="mb-1.5 flex items-center gap-2 text-sm font-semibold">
          <FileText className="h-4 w-4" />
          Minutes — Action-Taken Report
        </h4>
        <pre className="whitespace-pre-wrap rounded-md border bg-muted/40 p-3 font-sans text-xs leading-relaxed">
          {meeting.minutes_summary ?? '—'}
        </pre>
      </div>

      {/* A member may still write, and the Chairman/Coordinator may still
          compile, after the sitting is minuted — an account written late is
          worth more than one never written. */}
      <Separator />
      <MemberNotesPanel
        meeting={meeting}
        committee={committee}
        canManage={canManage}
      />

      {(reviewedHere ?? []).length > 0 && (
        <div>
          <h4 className="mb-1.5 text-sm font-semibold">
            Resolutions reviewed in this meeting
          </h4>
          <div className="space-y-1">
            {(reviewedHere ?? []).map((r) => (
              <ReviewedLine key={r.id} resolution={r} />
            ))}
          </div>
        </div>
      )}

      {(passedHere ?? []).length > 0 && (
        <div>
          <h4 className="mb-1.5 text-sm font-semibold">
            Resolutions passed in this meeting
          </h4>
          <ul className="space-y-1.5">
            {(passedHere ?? []).map((r) => (
              <li
                key={r.id}
                className="rounded-md border bg-card px-3 py-2 text-sm"
              >
                <div>{r.resolution_text}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <span>
                    Owner: {ownerDisplay(r, profiles)}
                    {r.due_date ? ` · due ${r.due_date}` : ''}
                    {' · '}
                    {r.status === 'open' ? 'still open' : r.status}
                  </span>
                  <AffectedCollegesChips ids={r.affected_institution_ids} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
