'use client';

/**
 * LC-003: Event Detail - Client component with interactivity
 */

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  CalendarDays,
  MapPin,
  Users,
  Clock,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  UserPlus,
  UserMinus,
  Star,
  Download,
  Check,
  X,
} from 'lucide-react';
import {
  useRegisterForEvent,
  useCancelRegistration,
  useMarkAttendance,
  useBulkMarkAttendance,
  useSubmitFeedback,
  usePublishEvent,
  useCompleteEvent,
  useExportEventData,
} from '@/hooks/learners-council/use-lc-events';
import type { LCEvent, LCEventParticipant, LCEventApproval } from '@/types/learners-council';

interface EventDetailClientProps {
  event: LCEvent;
  userId: string;
  isRegistered: boolean;
  isProposer: boolean;
}

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; color: string }> = {
  draft: { label: 'Draft', variant: 'outline', color: 'text-gray-500' },
  pending_review: { label: 'Pending Review', variant: 'secondary', color: 'text-yellow-600' },
  approved: { label: 'Approved', variant: 'default', color: 'text-green-600' },
  published: { label: 'Published', variant: 'default', color: 'text-blue-600' },
  in_progress: { label: 'In Progress', variant: 'default', color: 'text-blue-600' },
  completed: { label: 'Completed', variant: 'secondary', color: 'text-green-700' },
  cancelled: { label: 'Cancelled', variant: 'destructive', color: 'text-red-600' },
};

const scopeLabels: Record<string, string> = {
  campus: 'Campus',
  inter_campus: 'Inter-Campus',
  institution_wide: 'Institution-Wide',
};

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function ApprovalChain({ approvals }: { approvals: LCEventApproval[] }) {
  if (!approvals || approvals.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No approval actions yet.</p>
    );
  }

  return (
    <div className="space-y-3">
      {approvals
        .sort((a: any, b: any) => (a.step_order || 0) - (b.step_order || 0))
        .map((approval: any) => (
          <div key={approval.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
            <div className="flex-shrink-0 mt-0.5">
              {approval.action === 'approve' ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : approval.action === 'reject' ? (
                <XCircle className="h-5 w-5 text-red-600" />
              ) : (
                <Clock className="h-5 w-5 text-yellow-500" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">
                  {approval.approver?.full_name || 'Unknown'}
                </span>
                <Badge
                  variant={approval.action === 'approve' ? 'default' : approval.action === 'reject' ? 'destructive' : 'outline'}
                  className="text-xs"
                >
                  {approval.action ? approval.action.charAt(0).toUpperCase() + approval.action.slice(1) : 'Pending'}
                </Badge>
                {approval.approver_role && (
                  <span className="text-xs text-muted-foreground">({approval.approver_role})</span>
                )}
              </div>
              {approval.comments && (
                <p className="text-sm text-muted-foreground mt-1">{approval.comments}</p>
              )}
              {approval.acted_at && (
                <p className="text-xs text-muted-foreground mt-1">
                  {formatDateTime(approval.acted_at)}
                </p>
              )}
            </div>
          </div>
        ))}
    </div>
  );
}

function ParticipantRow({
  participant,
  eventId,
  showAttendance,
}: {
  participant: LCEventParticipant;
  eventId: string;
  showAttendance: boolean;
}) {
  const markAttendance = useMarkAttendance();

  const statusColors: Record<string, string> = {
    registered: 'bg-blue-100 text-blue-800',
    confirmed: 'bg-green-100 text-green-800',
    attended: 'bg-green-200 text-green-900',
    absent: 'bg-red-100 text-red-800',
    cancelled: 'bg-gray-100 text-gray-600',
  };

  return (
    <div className="flex items-center justify-between py-2 px-3 rounded hover:bg-muted/30">
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium">
          {(participant as any).user?.full_name?.charAt(0) || '?'}
        </div>
        <div>
          <p className="text-sm font-medium">{(participant as any).user?.full_name || 'Unknown'}</p>
          <p className="text-xs text-muted-foreground">{(participant as any).user?.email || ''}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[participant.status] || statusColors.registered}`}>
          {participant.status}
        </span>
        {showAttendance && participant.status !== 'cancelled' && participant.status !== 'attended' && participant.status !== 'absent' && (
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-green-600 hover:text-green-700"
              onClick={() => markAttendance.mutate({ eventId, participantId: participant.id, attended: true })}
              disabled={markAttendance.isPending}
            >
              <Check className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
              onClick={() => markAttendance.mutate({ eventId, participantId: participant.id, attended: false })}
              disabled={markAttendance.isPending}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function FeedbackForm({ eventId, userId }: { eventId: string; userId: string }) {
  const submitFeedback = useSubmitFeedback();
  const [feedback, setFeedback] = useState('');
  const [rating, setRating] = useState(0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedback || rating === 0) return;
    submitFeedback.mutate({ eventId, userId, feedback, rating });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-2">
        <Label>Rating</Label>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => setRating(star)}
              className="p-1"
            >
              <Star
                className={`h-6 w-6 ${star <= rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}`}
              />
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="feedback">Your Feedback</Label>
        <Textarea
          id="feedback"
          placeholder="Share your experience..."
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          rows={3}
        />
      </div>
      <Button type="submit" size="sm" disabled={submitFeedback.isPending || !feedback || rating === 0}>
        {submitFeedback.isPending ? 'Submitting...' : 'Submit Feedback'}
      </Button>
    </form>
  );
}

export function EventDetailClient({
  event,
  userId,
  isRegistered,
  isProposer,
}: EventDetailClientProps) {
  const registerForEvent = useRegisterForEvent();
  const cancelRegistration = useCancelRegistration();
  const publishEvent = usePublishEvent();
  const completeEvent = useCompleteEvent();
  const exportEventData = useExportEventData();
  const bulkMarkAttendance = useBulkMarkAttendance();

  const statusCfg = statusConfig[event.status] || statusConfig.draft;
  const participants = (event.participants || []) as LCEventParticipant[];
  const approvals = (event.approvals || []) as LCEventApproval[];
  const activeParticipants = participants.filter((p) => p.status !== 'cancelled');
  const isUpcoming = new Date(event.starts_at) > new Date();
  const isPast = new Date(event.ends_at) < new Date();
  const canRegister = !isRegistered && (event.status === 'published' || event.status === 'approved') && isUpcoming;
  const canCancel = isRegistered && isUpcoming;
  const showAttendance = isProposer && (event.status === 'in_progress' || event.status === 'published' || event.status === 'completed');
  const showFeedback = isRegistered && isPast && event.feedback_enabled;

  const handleExport = () => {
    exportEventData.mutate(event.id, {
      onSuccess: (data) => {
        // Generate CSV from export data
        const headers = ['Name', 'Email', 'Status', 'Registered At', 'Attended At', 'Feedback', 'Rating'];
        const rows = data.participants.map((p) => [p.name, p.email, p.status, p.registered_at, p.attended_at, p.feedback, p.rating]);
        const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `event-${event.id}-participants.csv`;
        a.click();
        URL.revokeObjectURL(url);
      },
    });
  };

  const handleBulkAttendance = () => {
    const unmarkedIds = activeParticipants
      .filter((p) => p.status === 'registered' || p.status === 'confirmed')
      .map((p) => p.id);

    if (unmarkedIds.length === 0) return;
    bulkMarkAttendance.mutate({ eventId: event.id, attendeeIds: unmarkedIds });
  };

  return (
    <>
      {/* Back link */}
      <Link
        href="/learners-council/events"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Events
      </Link>

      {/* Event Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
            <Badge variant="outline">{scopeLabels[event.scope] || event.scope}</Badge>
            {event.type && <Badge variant="outline" className="text-xs">{event.type}</Badge>}
          </div>
          <h1 className="text-2xl font-bold">{event.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Proposed by {(event.proposer as any)?.full_name || 'Unknown'}
            {(event.institution as any)?.name && ` - ${(event.institution as any).name}`}
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          {canRegister && (
            <Button
              onClick={() => registerForEvent.mutate({ eventId: event.id, userId })}
              disabled={registerForEvent.isPending}
            >
              <UserPlus className="h-4 w-4 mr-2" />
              {registerForEvent.isPending ? 'Registering...' : 'Register'}
            </Button>
          )}
          {canCancel && (
            <Button
              variant="outline"
              onClick={() => cancelRegistration.mutate({ eventId: event.id, userId })}
              disabled={cancelRegistration.isPending}
            >
              <UserMinus className="h-4 w-4 mr-2" />
              {cancelRegistration.isPending ? 'Cancelling...' : 'Cancel Registration'}
            </Button>
          )}
          {isProposer && event.status === 'approved' && (
            <Button
              onClick={() => publishEvent.mutate(event.id)}
              disabled={publishEvent.isPending}
            >
              {publishEvent.isPending ? 'Publishing...' : 'Publish Event'}
            </Button>
          )}
          {isProposer && (event.status === 'published' || event.status === 'in_progress') && isPast && (
            <Button
              variant="secondary"
              onClick={() => completeEvent.mutate(event.id)}
              disabled={completeEvent.isPending}
            >
              {completeEvent.isPending ? 'Completing...' : 'Mark Completed'}
            </Button>
          )}
          {isProposer && (
            <Button variant="outline" onClick={handleExport} disabled={exportEventData.isPending}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          )}
        </div>
      </div>

      {/* Event Details Grid */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Main Info */}
        <div className="md:col-span-2 space-y-6">
          {/* Description */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Description</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap">{event.description}</p>
              {event.tags && event.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-4">
                  {event.tags.map((tag: string) => (
                    <Badge key={tag} variant="outline" className="text-xs font-normal">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Participants */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">
                  Participants ({activeParticipants.length}
                  {event.max_participants ? ` / ${event.max_participants}` : ''})
                </CardTitle>
                {showAttendance && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleBulkAttendance}
                    disabled={bulkMarkAttendance.isPending}
                  >
                    {bulkMarkAttendance.isPending ? 'Marking...' : 'Mark All Present'}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {activeParticipants.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No participants registered yet.
                </p>
              ) : (
                <div className="space-y-1">
                  {activeParticipants.map((participant) => (
                    <ParticipantRow
                      key={participant.id}
                      participant={participant}
                      eventId={event.id}
                      showAttendance={showAttendance}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Feedback */}
          {showFeedback && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Submit Feedback</CardTitle>
              </CardHeader>
              <CardContent>
                <FeedbackForm eventId={event.id} userId={userId} />
              </CardContent>
            </Card>
          )}

          {/* Post-event report */}
          {event.post_event_report && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Post-Event Report</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{event.post_event_report}</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Quick Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Event Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3">
                <CalendarDays className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Date & Time</p>
                  <p className="text-sm text-muted-foreground">{formatDateTime(event.starts_at)}</p>
                  <p className="text-sm text-muted-foreground">to {formatDateTime(event.ends_at)}</p>
                </div>
              </div>

              {event.venue_name && (
                <div className="flex items-start gap-3">
                  <MapPin className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Venue</p>
                    <p className="text-sm text-muted-foreground">{event.venue_name}</p>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-3">
                <Users className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Participants</p>
                  <p className="text-sm text-muted-foreground">
                    {event.current_participants} registered
                    {event.max_participants ? ` (max ${event.max_participants})` : ''}
                  </p>
                </div>
              </div>

              {event.requires_od && (
                <div className="flex items-center gap-2 p-2 bg-yellow-50 rounded text-sm">
                  <Clock className="h-4 w-4 text-yellow-600" />
                  <span className="text-yellow-700">OD/Permission Required</span>
                </div>
              )}

              {event.budget_estimate != null && (
                <div>
                  <p className="text-sm font-medium">Budget Estimate</p>
                  <p className="text-sm text-muted-foreground">
                    INR {Number(event.budget_estimate).toLocaleString('en-IN')}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Approval Chain */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Approval Chain</CardTitle>
            </CardHeader>
            <CardContent>
              <ApprovalChain approvals={approvals} />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
