'use client';

// app/(routes)/grievance/_components/ticket-detail.tsx
// F004: Grievance Ticketing System - Ticket Detail Component

import { useState } from 'react';
import { formatDistanceToNow, format } from 'date-fns';
import { useForm } from 'react-hook-form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  User,
  Calendar,
  MessageSquare,
  Send,
  Star,
  RotateCcw,
  Loader2,
  AlertTriangle
} from 'lucide-react';
import {
  useGrievanceComments,
  useAddGrievanceComment,
  useResolveGrievanceTicket,
  useRateGrievanceSatisfaction,
  useReopenGrievanceTicket,
  useGrievanceHistory
} from '@/hooks/grievance';
import type { GrievanceTicket, GrievanceComment, GrievanceStatus, GrievancePriority, GrievanceSLAStatus } from '@/types/grievance';

interface TicketDetailProps {
  ticket: GrievanceTicket;
  currentUserId: string;
  currentUserName: string;
  isStaff: boolean;
}

// Status badge styling
const statusConfig: Record<GrievanceStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ReactNode }> = {
  open: { label: 'Open', variant: 'default', icon: <AlertCircle className="h-4 w-4" /> },
  in_progress: { label: 'In Progress', variant: 'secondary', icon: <Clock className="h-4 w-4" /> },
  pending_info: { label: 'Pending Info', variant: 'outline', icon: <AlertTriangle className="h-4 w-4" /> },
  resolved: { label: 'Resolved', variant: 'default', icon: <CheckCircle2 className="h-4 w-4" /> },
  closed: { label: 'Closed', variant: 'secondary', icon: <CheckCircle2 className="h-4 w-4" /> },
  reopened: { label: 'Reopened', variant: 'destructive', icon: <AlertCircle className="h-4 w-4" /> }
};

// Priority badge styling
const priorityConfig: Record<GrievancePriority, { label: string; className: string }> = {
  low: { label: 'Low', className: 'bg-gray-100 text-gray-700' },
  medium: { label: 'Medium', className: 'bg-blue-100 text-blue-700' },
  high: { label: 'High', className: 'bg-orange-100 text-orange-700' },
  urgent: { label: 'Urgent', className: 'bg-red-100 text-red-700' }
};

// SLA status styling
const slaConfig: Record<GrievanceSLAStatus, { label: string; className: string }> = {
  on_track: { label: 'On Track', className: 'bg-green-100 text-green-700' },
  at_risk: { label: 'At Risk', className: 'bg-yellow-100 text-yellow-700' },
  breached: { label: 'Breached', className: 'bg-red-100 text-red-700' }
};

export function TicketDetail({ ticket, currentUserId, currentUserName, isStaff }: TicketDetailProps) {
  const [comment, setComment] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [resolution, setResolution] = useState('');
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [reopenReason, setReopenReason] = useState('');
  const [showResolveDialog, setShowResolveDialog] = useState(false);
  const [showRateDialog, setShowRateDialog] = useState(false);
  const [showReopenDialog, setShowReopenDialog] = useState(false);

  const { data: comments, isLoading: commentsLoading } = useGrievanceComments(ticket.id, isStaff);
  const { data: history, isLoading: historyLoading } = useGrievanceHistory(ticket.id);
  const { mutate: addComment, isPending: addingComment } = useAddGrievanceComment();
  const { mutate: resolveTicket, isPending: resolving } = useResolveGrievanceTicket();
  const { mutate: rateTicket, isPending: ratingPending } = useRateGrievanceSatisfaction();
  const { mutate: reopenTicket, isPending: reopening } = useReopenGrievanceTicket();

  const status = statusConfig[ticket.status];
  const priority = priorityConfig[ticket.priority];
  const sla = slaConfig[ticket.sla_status];

  const canResolve = isStaff && ['open', 'in_progress', 'pending_info', 'reopened'].includes(ticket.status);
  const canRate = ticket.status === 'resolved' && ticket.raised_by_id === currentUserId && !ticket.satisfaction_rating;
  const canReopen = ticket.status === 'resolved' && ticket.raised_by_id === currentUserId;

  const handleAddComment = () => {
    if (!comment.trim()) return;

    addComment({
      ticketId: ticket.id,
      data: {
        author_id: currentUserId,
        author_name: currentUserName,
        author_type: isStaff ? 'staff' : 'learner',
        content: comment,
        is_internal: isStaff && isInternal
      }
    }, {
      onSuccess: () => {
        setComment('');
        setIsInternal(false);
      }
    });
  };

  const handleResolve = () => {
    if (!resolution.trim()) return;

    resolveTicket({
      ticketId: ticket.id,
      resolution,
      resolvedBy: currentUserId
    }, {
      onSuccess: () => {
        setShowResolveDialog(false);
        setResolution('');
      }
    });
  };

  const handleRate = () => {
    if (rating === 0) return;

    rateTicket({
      ticketId: ticket.id,
      rating,
      feedback: feedback || undefined
    }, {
      onSuccess: () => {
        setShowRateDialog(false);
      }
    });
  };

  const handleReopen = () => {
    if (!reopenReason.trim()) return;

    reopenTicket({
      ticketId: ticket.id,
      reason: reopenReason
    }, {
      onSuccess: () => {
        setShowReopenDialog(false);
        setReopenReason('');
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground font-mono">
                {ticket.ticket_number}
              </p>
              <CardTitle className="text-xl mt-1">{ticket.subject}</CardTitle>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant={status.variant} className="flex items-center gap-1">
                {status.icon}
                {status.label}
              </Badge>
              <Badge variant="outline" className={priority.className}>
                {priority.label}
              </Badge>
              {ticket.status !== 'resolved' && ticket.status !== 'closed' && (
                <Badge variant="outline" className={sla.className}>
                  {sla.label}
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm whitespace-pre-wrap">{ticket.description}</p>

          <Separator />

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 text-sm">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-muted-foreground">Raised By</p>
                <p className="font-medium">{ticket.raised_by_name}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-muted-foreground">Created</p>
                <p className="font-medium">
                  {format(new Date(ticket.created_at), 'PPp')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-muted-foreground">SLA Deadline</p>
                <p className="font-medium">
                  {format(new Date(ticket.sla_deadline), 'PPp')}
                </p>
              </div>
            </div>
            {ticket.assignee && (
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-muted-foreground">Assigned To</p>
                  <p className="font-medium">{ticket.assignee.full_name}</p>
                </div>
              </div>
            )}
          </div>

          {/* Resolution */}
          {ticket.resolution && (
            <>
              <Separator />
              <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                <h4 className="font-medium text-green-800 mb-2 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Resolution
                </h4>
                <p className="text-sm text-green-700 whitespace-pre-wrap">
                  {ticket.resolution}
                </p>
                {ticket.resolved_at && (
                  <p className="text-xs text-green-600 mt-2">
                    Resolved {formatDistanceToNow(new Date(ticket.resolved_at), { addSuffix: true })}
                    {ticket.resolver && ` by ${ticket.resolver.full_name}`}
                  </p>
                )}
              </div>
            </>
          )}

          {/* Satisfaction Rating */}
          {ticket.satisfaction_rating && (
            <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
              <h4 className="font-medium text-purple-800 mb-2 flex items-center gap-2">
                <Star className="h-4 w-4" />
                Satisfaction Rating
              </h4>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    className={`h-5 w-5 ${
                      star <= ticket.satisfaction_rating!
                        ? 'text-yellow-500 fill-yellow-500'
                        : 'text-gray-300'
                    }`}
                  />
                ))}
                <span className="ml-2 text-sm text-purple-700">
                  {ticket.satisfaction_rating}/5
                </span>
              </div>
              {ticket.satisfaction_feedback && (
                <p className="text-sm text-purple-700 mt-2">
                  &ldquo;{ticket.satisfaction_feedback}&rdquo;
                </p>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2">
            {canResolve && (
              <Dialog open={showResolveDialog} onOpenChange={setShowResolveDialog}>
                <DialogTrigger asChild>
                  <Button>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Resolve Ticket
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Resolve Ticket</DialogTitle>
                    <DialogDescription>
                      Provide a resolution for this grievance ticket.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="py-4">
                    <Label htmlFor="resolution">Resolution</Label>
                    <Textarea
                      id="resolution"
                      value={resolution}
                      onChange={(e) => setResolution(e.target.value)}
                      placeholder="Describe how the issue was resolved..."
                      className="mt-2 min-h-[100px]"
                    />
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowResolveDialog(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleResolve} disabled={resolving || !resolution.trim()}>
                      {resolving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Resolve
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}

            {canRate && (
              <Dialog open={showRateDialog} onOpenChange={setShowRateDialog}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <Star className="h-4 w-4 mr-2" />
                    Rate Resolution
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Rate Your Experience</DialogTitle>
                    <DialogDescription>
                      How satisfied are you with the resolution of your grievance?
                    </DialogDescription>
                  </DialogHeader>
                  <div className="py-4 space-y-4">
                    <div className="flex justify-center gap-2">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setRating(star)}
                          className="p-1 hover:scale-110 transition"
                        >
                          <Star
                            className={`h-8 w-8 ${
                              star <= rating
                                ? 'text-yellow-500 fill-yellow-500'
                                : 'text-gray-300'
                            }`}
                          />
                        </button>
                      ))}
                    </div>
                    <div>
                      <Label htmlFor="feedback">Feedback (Optional)</Label>
                      <Textarea
                        id="feedback"
                        value={feedback}
                        onChange={(e) => setFeedback(e.target.value)}
                        placeholder="Any additional feedback..."
                        className="mt-2"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowRateDialog(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleRate} disabled={ratingPending || rating === 0}>
                      {ratingPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Submit Rating
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}

            {canReopen && (
              <Dialog open={showReopenDialog} onOpenChange={setShowReopenDialog}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reopen Ticket
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Reopen Ticket</DialogTitle>
                    <DialogDescription>
                      Please explain why you need to reopen this ticket.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="py-4">
                    <Label htmlFor="reopen-reason">Reason</Label>
                    <Textarea
                      id="reopen-reason"
                      value={reopenReason}
                      onChange={(e) => setReopenReason(e.target.value)}
                      placeholder="Explain why the issue is not resolved..."
                      className="mt-2 min-h-[100px]"
                    />
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowReopenDialog(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleReopen} disabled={reopening || !reopenReason.trim()}>
                      {reopening && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Reopen
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Comments Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Comments
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {commentsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : comments && comments.length > 0 ? (
            <div className="space-y-4">
              {comments.map((c) => (
                <div
                  key={c.id}
                  className={`p-4 rounded-lg ${
                    c.is_internal
                      ? 'bg-yellow-50 border border-yellow-200'
                      : 'bg-muted'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-medium">{c.author_name}</span>
                    <Badge variant="outline" className="text-xs">
                      {c.author_type}
                    </Badge>
                    {c.is_internal && (
                      <Badge variant="outline" className="text-xs bg-yellow-100">
                        Internal Note
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground ml-auto">
                      {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{c.content}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              No comments yet
            </p>
          )}

          {/* Add Comment */}
          {ticket.status !== 'closed' && (
            <div className="space-y-2 pt-4 border-t">
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Add a comment..."
                className="min-h-[80px]"
              />
              <div className="flex items-center justify-between">
                {isStaff && (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={isInternal}
                      onChange={(e) => setIsInternal(e.target.checked)}
                      className="rounded"
                    />
                    Internal note (not visible to ticket raiser)
                  </label>
                )}
                <Button
                  onClick={handleAddComment}
                  disabled={addingComment || !comment.trim()}
                  className="ml-auto"
                >
                  {addingComment ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  Send
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* History Section */}
      {isStaff && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {historyLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : history && history.length > 0 ? (
              <div className="space-y-2">
                {history.map((h) => (
                  <div
                    key={h.id}
                    className="flex items-center gap-3 text-sm py-2 border-b last:border-0"
                  >
                    <span className="text-muted-foreground text-xs w-32">
                      {format(new Date(h.performed_at), 'PP p')}
                    </span>
                    <Badge variant="outline" className="text-xs capitalize">
                      {h.action.replace('_', ' ')}
                    </Badge>
                    {h.old_value && h.new_value && (
                      <span className="text-muted-foreground">
                        {h.old_value} → {h.new_value}
                      </span>
                    )}
                    {!h.old_value && h.new_value && (
                      <span className="text-muted-foreground truncate max-w-[200px]">
                        {h.new_value}
                      </span>
                    )}
                    {h.performer && (
                      <span className="text-muted-foreground ml-auto">
                        by {h.performer.full_name}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                No history available
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
