'use client';

/**
 * LC-003: Event Proposals - Create form + Proposals list with status tracking
 */

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import {
  Plus,
  CalendarDays,
  MapPin,
  Send,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  FileEdit,
  ArrowRight,
  CalendarX,
  Hourglass,
  Inbox,
  User,
} from 'lucide-react';
import {
  useCreateEvent,
  useSubmitForApproval,
  useApproveEvent,
  useRejectEvent,
} from '@/hooks/learners-council/use-lc-events';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import type { LCEvent, CreateEventDto, EventScope } from '@/types/learners-council';

interface EventProposalsClientProps {
  initialProposals: LCEvent[];
  initialReviewQueue: ReviewQueueItem[];
  /** From ?tab= on the URL — how the dashboard's approval card arrives here. */
  requestedTab?: 'review' | 'mine' | null;
  canReview: boolean;
  reviewerRole: string;
  userId: string;
  institutionId: string | null;
  isSuperAdmin: boolean;
}

const dateFmt: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
};

/**
 * How long this proposal has sat in the queue. lc_events carries no submitted_at
 * column, so the clock runs from the last time the row moved (updated_at), falling
 * back to when it was created.
 */
/**
 * A queue row with its two time facts already resolved SERVER-side, off one
 * clock: `daysLapsed` is null when the date has not passed, and `daysWaiting`
 * counts from the moment it entered review (updated_at, falling back to
 * created_at). Computing these in the client made the same card disagree with
 * itself across hydration.
 */
export type ReviewQueueItem = LCEvent & {
  daysLapsed: number | null;
  daysWaiting: number;
};

const statusConfig: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  draft: { label: 'Draft', icon: FileEdit, color: 'text-gray-500' },
  pending_review: { label: 'Pending Review', icon: Clock, color: 'text-yellow-600' },
  approved: { label: 'Approved', icon: CheckCircle2, color: 'text-green-600' },
  published: { label: 'Published', icon: CheckCircle2, color: 'text-blue-600' },
  in_progress: { label: 'In Progress', icon: ArrowRight, color: 'text-blue-600' },
  completed: { label: 'Completed', icon: CheckCircle2, color: 'text-green-700' },
  cancelled: { label: 'Cancelled', icon: XCircle, color: 'text-red-600' },
};

const eventTypes = [
  'Workshop',
  'Seminar',
  'Cultural Event',
  'Sports Event',
  'Social Service',
  'Technical Event',
  'Guest Lecture',
  'Meeting',
  'Other',
];

function ApprovalProgress({ event }: { event: LCEvent }) {
  const steps = ['Draft', 'Submitted', 'Review', 'Approved'];
  const currentStep =
    event.status === 'draft' ? 0
    : event.status === 'pending_review' ? 2
    : event.status === 'approved' || event.status === 'published' ? 3
    : event.status === 'cancelled' ? -1
    : 1;

  if (currentStep === -1) {
    return (
      <div className="flex items-center gap-2 text-red-600 text-sm">
        <XCircle className="h-4 w-4" />
        <span>Rejected / Cancelled</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {steps.map((step, idx) => (
        <div key={step} className="flex items-center">
          <div
            className={`h-2.5 w-2.5 rounded-full ${
              idx <= currentStep ? 'bg-green-500' : 'bg-gray-200'
            }`}
          />
          <span className={`text-xs ml-1 ${idx <= currentStep ? 'text-foreground' : 'text-muted-foreground'}`}>
            {step}
          </span>
          {idx < steps.length - 1 && (
            <div
              className={`h-0.5 w-6 mx-1 ${
                idx < currentStep ? 'bg-green-500' : 'bg-gray-200'
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function CreateEventForm({
  userId,
  institutionId,
  isSuperAdmin,
  onSuccess,
}: {
  userId: string;
  institutionId: string | null;
  isSuperAdmin: boolean;
  onSuccess: () => void;
}) {
  const createEvent = useCreateEvent();
  // Super admins can pick from any institution they can access (or leave blank
  // for LC-wide events). Non-super-admins are locked to their profile institution.
  const { institutions: accessibleInstitutions, loading: institutionsLoading } =
    useInstitutionsWithAccess({ autoFetch: isSuperAdmin });
  const [selectedInstitutionId, setSelectedInstitutionId] = useState<string>(
    institutionId ?? '',
  );
  const [form, setForm] = useState<Partial<CreateEventDto>>({
    title: '',
    description: '',
    type: '',
    scope: 'campus',
    venue_name: '',
    starts_at: '',
    ends_at: '',
    max_participants: undefined,
    requires_od: false,
    budget_estimate: undefined,
    tags: [],
  });
  const [tagInput, setTagInput] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.description || !form.type || !form.starts_at || !form.ends_at) return;

    // Validate end date is after start date
    if (new Date(form.ends_at) <= new Date(form.starts_at)) {
      toast.error('End date must be after start date');
      return;
    }

    // Resolve institution: super admin selection > profile institution > null.
    // CRITICAL: never send '' as a UUID — Postgres rejects it with 22P02.
    // See feedback_institution_id_or_empty_string_antipattern.md
    const resolvedInstitutionId =
      (selectedInstitutionId || institutionId || null) as string | null;

    createEvent.mutate(
      {
        data: {
          ...form,
          // Omit the key entirely when null so the service doesn't have to
          // re-coerce; explicit `null` would also work because the service
          // does `dto.institution_id || null`.
          ...(resolvedInstitutionId ? { institution_id: resolvedInstitutionId } : {}),
        } as CreateEventDto,
        userId,
      },
      { onSuccess }
    );
  };

  const addTag = () => {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !(form.tags || []).includes(tag)) {
      setForm({ ...form, tags: [...(form.tags || []), tag] });
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    setForm({ ...form, tags: (form.tags || []).filter((t) => t !== tag) });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="title">Event Title *</Label>
          <Input
            id="title"
            placeholder="e.g. Annual Tech Fest 2026"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="type">Event Type *</Label>
          <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
            <SelectTrigger id="type">
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              {eventTypes.map((t) => (
                <SelectItem key={t} value={t.toLowerCase().replace(/\s+/g, '_')}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description *</Label>
        <Textarea
          id="description"
          placeholder="Describe the event purpose, agenda, and expected outcomes..."
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={4}
          required
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="scope">Scope *</Label>
          <Select
            value={form.scope}
            onValueChange={(v) => setForm({ ...form, scope: v as EventScope })}
          >
            <SelectTrigger id="scope">
              <SelectValue placeholder="Select scope" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="campus">Campus</SelectItem>
              <SelectItem value="inter_campus">Inter-Campus</SelectItem>
              <SelectItem value="institution_wide">Institution-Wide</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="venue">Venue</Label>
          <Input
            id="venue"
            placeholder="e.g. Main Auditorium"
            value={form.venue_name}
            onChange={(e) => setForm({ ...form, venue_name: e.target.value })}
          />
        </div>
      </div>

      {isSuperAdmin && (
        <div className="space-y-2">
          <Label htmlFor="institution">Institution</Label>
          <Select
            value={selectedInstitutionId || '__none__'}
            onValueChange={(v) => setSelectedInstitutionId(v === '__none__' ? '' : v)}
          >
            <SelectTrigger id="institution">
              <SelectValue placeholder={institutionsLoading ? 'Loading…' : 'Select institution (optional)'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">LC-Wide (No Institution)</SelectItem>
              {accessibleInstitutions.map((inst) => (
                <SelectItem key={inst.id} value={inst.id}>
                  {inst.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            As a super admin you may tag the event to a specific institution or leave it LC-wide.
          </p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="starts_at">Start Date & Time *</Label>
          <Input
            id="starts_at"
            type="datetime-local"
            value={form.starts_at}
            onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ends_at">End Date & Time *</Label>
          <Input
            id="ends_at"
            type="datetime-local"
            value={form.ends_at}
            onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
            required
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="max_participants">Max Participants</Label>
          <Input
            id="max_participants"
            type="number"
            min={1}
            placeholder="Unlimited"
            value={form.max_participants || ''}
            onChange={(e) => setForm({ ...form, max_participants: e.target.value ? parseInt(e.target.value) : undefined })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="budget">Budget Estimate (INR)</Label>
          <Input
            id="budget"
            type="number"
            min={0}
            placeholder="0"
            value={form.budget_estimate || ''}
            onChange={(e) => setForm({ ...form, budget_estimate: e.target.value ? parseFloat(e.target.value) : undefined })}
          />
        </div>
        <div className="flex items-end gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.requires_od}
              onChange={(e) => setForm({ ...form, requires_od: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300"
            />
            <span className="text-sm">Requires OD</span>
          </label>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Tags</Label>
        <div className="flex gap-2">
          <Input
            placeholder="Add a tag..."
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); addTag(); }
            }}
          />
          <Button type="button" variant="outline" onClick={addTag}>
            Add
          </Button>
        </div>
        {(form.tags || []).length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {(form.tags || []).map((tag) => (
              <Badge key={tag} variant="secondary" className="cursor-pointer" onClick={() => removeTag(tag)}>
                {tag} x
              </Badge>
            ))}
          </div>
        )}
      </div>

      <Separator />

      <div className="flex justify-end">
        <Button type="submit" disabled={createEvent.isPending}>
          {createEvent.isPending ? 'Creating...' : 'Create Draft Event'}
        </Button>
      </div>
    </form>
  );
}

/**
 * One row of the reviewer queue. Carries the two facts a reviewer needs and the
 * proposals page never showed: how long this has been waiting, and whether the
 * date being approved has already gone by.
 */
function ReviewQueueCard({
  event,
  reviewerId,
  reviewerRole,
  onDecided,
}: {
  event: ReviewQueueItem;
  reviewerId: string;
  reviewerRole: string;
  onDecided: (id: string) => void;
}) {
  const approveEvent = useApproveEvent();
  const rejectEvent = useRejectEvent();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectComments, setRejectComments] = useState('');
  // Approving a proposal whose date has gone is a deliberate act, not a click.
  const [lapseAcked, setLapseAcked] = useState(false);

  const waiting = event.daysWaiting;
  const lapsed = event.daysLapsed !== null;
  const busy = approveEvent.isPending || rejectEvent.isPending;
  const approveBlocked = lapsed && !lapseAcked;

  const dayWord = (n: number) => (n === 1 ? 'day' : 'days');

  const handleApprove = () => {
    approveEvent.mutate(
      { eventId: event.id, approverId: reviewerId, approverRole: reviewerRole },
      { onSuccess: () => onDecided(event.id) }
    );
  };

  // Opening the decline dialog pre-fills the reason a lapsed proposal almost
  // always needs, so the reviewer edits a sentence instead of writing one.
  const openDecline = () => {
    if (lapsed && !rejectComments.trim()) {
      setRejectComments(
        `The proposed date passed ${event.daysLapsed} ${dayWord(event.daysLapsed!)} ago while this was waiting for review. Please re-submit with a date that still works.`,
      );
    }
    setRejectOpen(true);
  };

  const handleReject = () => {
    if (!rejectComments.trim()) {
      toast.error('Please give a reason so the proposer knows what to change');
      return;
    }
    rejectEvent.mutate(
      {
        eventId: event.id,
        approverId: reviewerId,
        approverRole: reviewerRole,
        comments: rejectComments.trim(),
      },
      {
        onSuccess: () => {
          setRejectOpen(false);
          setRejectComments('');
          onDecided(event.id);
        },
      }
    );
  };

  return (
    <Card className={lapsed ? 'border-orange-300' : undefined}>
      <CardContent className="p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <Badge variant="outline" className="text-yellow-600">
                <Clock className="h-3 w-3 mr-1" />
                Pending review
              </Badge>
              <Badge
                variant="outline"
                className={waiting >= 7 ? 'text-orange-700 border-orange-300' : 'text-muted-foreground'}
              >
                <Hourglass className="h-3 w-3 mr-1" />
                Waiting {waiting} {waiting === 1 ? 'day' : 'days'}
              </Badge>
              {event.scope && (
                <Badge variant="outline" className="text-xs font-normal">
                  {event.scope.replace(/_/g, ' ')}
                </Badge>
              )}
            </div>

            <Link
              href={`/learners-council/events/${event.id}`}
              className="font-semibold text-lg hover:underline"
            >
              {event.title}
            </Link>
            <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">
              {event.description}
            </p>
          </div>

          <div className="flex shrink-0 gap-2">
            <Button
              size="sm"
              className="bg-green-600 hover:bg-green-700"
              onClick={handleApprove}
              disabled={busy || approveBlocked}
              title={
                approveBlocked
                  ? 'Tick the confirmation below first — this date has already passed.'
                  : undefined
              }
            >
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
              {approveEvent.isPending ? 'Approving...' : 'Approve'}
            </Button>
            {/* "Decline", not "Reject": event-service.ts's own NOTE records that
                the CHECK constraint has no 'rejected' status, so the row becomes
                'cancelled' and the refusal is tracked in lc_event_approvals.
                Labelling it Reject would name a state the row never enters. */}
            <Button
              size="sm"
              variant="destructive"
              onClick={openDecline}
              disabled={busy}
            >
              <XCircle className="h-3.5 w-3.5 mr-1.5" />
              Decline
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground mt-3">
          <span className="flex items-center gap-1.5">
            <User className="h-3.5 w-3.5" />
            {event.proposer?.full_name || 'Unknown proposer'}
          </span>
          <span className="flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" />
            Event date {new Date(event.starts_at).toLocaleDateString('en-IN', dateFmt)}
          </span>
          {event.venue_name && (
            <span className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              {event.venue_name}
            </span>
          )}
          {event.institution?.name && (
            <span className="text-xs">{event.institution.name}</span>
          )}
        </div>

        {lapsed && (
          <div className="mt-3 space-y-2 rounded-md border border-orange-300 bg-orange-50 p-3 text-sm text-orange-800">
            <div className="flex items-start gap-2">
              <CalendarX className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                {`This event's date passed ${event.daysLapsed} ${dayWord(event.daysLapsed!)} ago, while it was waiting here. Approving cannot un-lapse it — it would record a past date as approved and tell the proposer it is going ahead. Declining with a reason, so they can re-submit with a workable date, is usually the honest move.`}
              </span>
            </div>
            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={lapseAcked}
                onChange={(e) => setLapseAcked(e.target.checked)}
              />
              <span>
                I am approving this on purpose, knowing the date has already passed.
              </span>
            </label>
          </div>
        )}
      </CardContent>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decline &ldquo;{event.title}&rdquo;</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label htmlFor={`reject-reason-${event.id}`}>
              Reason (the proposer will see this)
            </Label>
            <Textarea
              id={`reject-reason-${event.id}`}
              rows={4}
              placeholder="Explain what would need to change for this to be approved..."
              value={rejectComments}
              onChange={(e) => setRejectComments(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRejectOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleReject}
                disabled={rejectEvent.isPending || !rejectComments.trim()}
              >
                {rejectEvent.isPending ? 'Declining...' : 'Confirm decline'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export function EventProposalsClient({
  initialProposals,
  initialReviewQueue,
  requestedTab,
  canReview,
  reviewerRole,
  userId,
  institutionId,
  isSuperAdmin,
}: EventProposalsClientProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [proposals, setProposals] = useState(initialProposals);
  const [reviewQueue, setReviewQueue] = useState<ReviewQueueItem[]>(initialReviewQueue);
  const submitForApproval = useSubmitForApproval();

  const handleCreateSuccess = () => {
    setDialogOpen(false);
    // Refresh will happen via revalidation; for now just close dialog
  };

  const handleSubmit = (id: string) => {
    submitForApproval.mutate(id, {
      onSuccess: () => {
        setProposals((prev) =>
          prev.map((p: any) => (p.id === id ? { ...p, status: 'pending_review' } : p))
        );
      },
    });
  };

  // A decided proposal leaves the queue; its outcome shows on the proposal itself.
  const handleDecided = (id: string) => {
    setReviewQueue((prev) => prev.filter((e) => e.id !== id));
  };

  const lapsedCount = reviewQueue.filter((e) => e.daysLapsed !== null).length;

  const myProposalsSection = (
    <MyProposalsList
      proposals={proposals}
      onSubmit={handleSubmit}
      submitting={submitForApproval.isPending}
    />
  );

  const reviewSection =
    reviewQueue.length === 0 ? (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <Inbox className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Nothing waiting on you</p>
          <p className="text-sm mt-1">
            Every proposal submitted for review has had a decision.
          </p>
        </CardContent>
      </Card>
    ) : (
      <div className="space-y-4">
        <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
          Oldest first. A proposal cannot move until someone here decides on it
          {lapsedCount > 0 && (
            <>
              {' '}&mdash; and {lapsedCount === 1 ? 'one of these has' : `${lapsedCount} of these have`} already
              run past the date being asked for
            </>
          )}
          .
        </div>
        {reviewQueue.map((event) => (
          <ReviewQueueCard
            key={event.id}
            event={event}
            reviewerId={userId}
            reviewerRole={reviewerRole}
            onDecided={handleDecided}
          />
        ))}
      </div>
    );

  return (
    <>
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">Event Proposals</h1>
          <p className="text-sm text-muted-foreground">
            Create and track your event proposals
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="shrink-0">
              <Plus className="h-4 w-4 mr-2" />
              New Proposal
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Propose a New Event</DialogTitle>
            </DialogHeader>
            <CreateEventForm
              userId={userId}
              institutionId={institutionId}
              isSuperAdmin={isSuperAdmin}
              onSuccess={handleCreateSuccess}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Reviewers get a second tab; everyone else sees their own list unchanged.
          Opens on the queue when something is waiting, because the dashboard's
          "Awaiting Your Approval" card links straight here. */}
      {canReview && (
        <Tabs
          defaultValue={requestedTab ?? (reviewQueue.length > 0 ? 'review' : 'mine')}
          className="w-full"
        >
          <TabsList className="w-full max-w-full justify-start overflow-x-auto md:w-auto [&>button]:shrink-0">
            <TabsTrigger value="mine">My Proposals</TabsTrigger>
            <TabsTrigger value="review" className="flex items-center gap-2">
              Pending review
              {reviewQueue.length > 0 && (
                <Badge variant="secondary" className="px-1.5">
                  {reviewQueue.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="mine" className="mt-4 space-y-4">
            {myProposalsSection}
          </TabsContent>
          <TabsContent value="review" className="mt-4">
            {reviewSection}
          </TabsContent>
        </Tabs>
      )}

      {!canReview && myProposalsSection}
    </>
  );
}

/** Renders one proposer's own proposals — the original page content, unchanged. */
function MyProposalsList({
  proposals,
  onSubmit,
  submitting,
}: {
  proposals: LCEvent[];
  onSubmit: (id: string) => void;
  submitting: boolean;
}) {
  return (
    <>
      {proposals.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <CalendarDays className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No proposals yet</p>
            <p className="text-sm mt-1">Create your first event proposal to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {proposals.map((event: any) => {
            const cfg = statusConfig[event.status] || statusConfig.draft;
            const StatusIcon = cfg.icon;

            return (
              <Card key={event.id}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <StatusIcon className={`h-4 w-4 ${cfg.color}`} />
                        <Badge variant="outline" className={cfg.color}>
                          {cfg.label}
                        </Badge>
                      </div>
                      <h3 className="font-semibold text-lg">{event.title}</h3>
                      <p className="text-sm text-muted-foreground line-clamp-1 mt-0.5">
                        {event.description}
                      </p>
                    </div>

                    {event.status === 'draft' && (
                      <Button
                        size="sm"
                        onClick={() => onSubmit(event.id)}
                        disabled={submitting}
                      >
                        <Send className="h-3.5 w-3.5 mr-1.5" />
                        Submit
                      </Button>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mb-3">
                    <div className="flex items-center gap-1.5">
                      <CalendarDays className="h-3.5 w-3.5" />
                      <span>
                        {new Date(event.starts_at).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                    {event.venue_name && (
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5" />
                        <span>{event.venue_name}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className="text-xs font-normal">
                        {event.scope?.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                  </div>

                  {/* Approval Progress */}
                  <ApprovalProgress event={event} />

                  {/* Approval Comments */}
                  {event.approvals && event.approvals.length > 0 && (
                    <div className="mt-3 pt-3 border-t">
                      <p className="text-xs font-medium text-muted-foreground mb-2">
                        Approval Activity
                      </p>
                      {event.approvals.map((approval: any) => (
                        <div key={approval.id} className="flex items-start gap-2 text-xs mb-1.5">
                          <Badge
                            variant={approval.action === 'approve' ? 'default' : 'destructive'}
                            className="text-[10px] px-1.5"
                          >
                            {approval.action === 'approve' ? 'Approved' : 'Rejected'}
                          </Badge>
                          <span className="text-muted-foreground">
                            by {approval.approver?.full_name || 'Unknown'}
                          </span>
                          {approval.comments && (
                            <span className="text-muted-foreground italic">
                              - {approval.comments}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
