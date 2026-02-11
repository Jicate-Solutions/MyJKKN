'use client';

/**
 * LC-004: OD Requests - Client-side component
 * Create OD request form + list with visual approval progress
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  Send,
  Clock,
  CheckCircle2,
  XCircle,
  FileEdit,
  CalendarDays,
  ClipboardSignature,
  ArrowRight,
  AlertTriangle,
} from 'lucide-react';
import { useCreateODRequest, useSubmitODRequest } from '@/hooks/learners-council/use-lc-od';
import type { LCODRequest, CreateODRequestDto, ODRequestStatus } from '@/types/learners-council';

interface ODRequestsClientProps {
  initialRequests: LCODRequest[];
  upcomingEvents: { id: string; title: string; starts_at: string; ends_at: string; requires_od: boolean }[];
  userId: string;
  institutionId: string;
}

const statusConfig: Record<string, { label: string; icon: React.ElementType; color: string; badgeVariant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  draft: { label: 'Draft', icon: FileEdit, color: 'text-gray-500', badgeVariant: 'outline' },
  submitted: { label: 'Submitted', icon: Send, color: 'text-blue-600', badgeVariant: 'secondary' },
  in_review: { label: 'In Review', icon: Clock, color: 'text-yellow-600', badgeVariant: 'secondary' },
  approved: { label: 'Approved', icon: CheckCircle2, color: 'text-green-600', badgeVariant: 'default' },
  rejected: { label: 'Rejected', icon: XCircle, color: 'text-red-600', badgeVariant: 'destructive' },
  cancelled: { label: 'Cancelled', icon: XCircle, color: 'text-gray-500', badgeVariant: 'outline' },
  expired: { label: 'Expired', icon: AlertTriangle, color: 'text-orange-500', badgeVariant: 'outline' },
};

function ODApprovalProgress({ request }: { request: LCODRequest }) {
  const chain = request.chain as any;
  const steps = chain?.steps || [];
  const approvals = (request.approvals || []) as any[];
  const currentStep = request.current_step || 0;
  const isRejected = request.status === 'rejected';

  if (steps.length === 0) {
    // No chain assigned - simple status display
    const stepNames = ['Created', 'Submitted', 'Approved'];
    const idx =
      request.status === 'draft' ? 0
      : request.status === 'approved' ? 2
      : 1;

    return (
      <div className="flex items-center gap-1">
        {stepNames.map((name, i) => (
          <div key={name} className="flex items-center">
            <div
              className={`h-2.5 w-2.5 rounded-full ${
                isRejected ? 'bg-red-400' : i <= idx ? 'bg-green-500' : 'bg-gray-200'
              }`}
            />
            <span className={`text-xs ml-1 ${i <= idx ? 'text-foreground' : 'text-muted-foreground'}`}>
              {name}
            </span>
            {i < stepNames.length - 1 && (
              <div className={`h-0.5 w-5 mx-1 ${isRejected ? 'bg-red-300' : i < idx ? 'bg-green-500' : 'bg-gray-200'}`} />
            )}
          </div>
        ))}
      </div>
    );
  }

  // Chain-based progress
  return (
    <div className="flex items-center gap-1 flex-wrap">
      <div className="flex items-center">
        <div className="h-2.5 w-2.5 rounded-full bg-green-500" />
        <span className="text-xs ml-1">Submitted</span>
        <div className="h-0.5 w-5 mx-1 bg-green-500" />
      </div>
      {steps.map((step: any, idx: number) => {
        const stepNum = idx + 1;
        const approval = approvals.find((a) => a.step_order === stepNum);
        const isComplete = approval?.action === 'approve';
        const isRejectedStep = approval?.action === 'reject';
        const isCurrent = stepNum === currentStep && !isComplete && !isRejectedStep;

        return (
          <div key={idx} className="flex items-center">
            <div
              className={`h-2.5 w-2.5 rounded-full ${
                isRejectedStep ? 'bg-red-500'
                : isComplete ? 'bg-green-500'
                : isCurrent ? 'bg-yellow-500 animate-pulse'
                : 'bg-gray-200'
              }`}
            />
            <span className={`text-xs ml-1 ${isComplete || isCurrent ? 'text-foreground' : 'text-muted-foreground'}`}>
              {step.approver_role?.replace(/_/g, ' ')}
            </span>
            {idx < steps.length - 1 && (
              <div className={`h-0.5 w-5 mx-1 ${isComplete ? 'bg-green-500' : 'bg-gray-200'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function CreateODForm({
  userId,
  institutionId,
  upcomingEvents,
  onSuccess,
}: {
  userId: string;
  institutionId: string;
  upcomingEvents: { id: string; title: string; starts_at: string; ends_at: string; requires_od: boolean }[];
  onSuccess: () => void;
}) {
  const createOD = useCreateODRequest();
  const [form, setForm] = useState<Partial<CreateODRequestDto>>({
    event_id: undefined,
    reason: '',
    start_date: '',
    end_date: '',
    duration_hours: 0,
  });

  const handleEventSelect = (eventId: string) => {
    if (eventId === 'none') {
      setForm({ ...form, event_id: undefined });
      return;
    }
    const event = upcomingEvents.find((e) => e.id === eventId);
    if (event) {
      setForm({
        ...form,
        event_id: eventId,
        start_date: event.starts_at.split('T')[0],
        end_date: event.ends_at.split('T')[0],
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.reason || !form.start_date || !form.end_date) return;

    createOD.mutate(
      {
        data: form as CreateODRequestDto,
        userId,
        institutionId,
      },
      { onSuccess }
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="event">Link to Event (Optional)</Label>
        <Select onValueChange={handleEventSelect}>
          <SelectTrigger id="event">
            <SelectValue placeholder="Select an event or leave blank" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No linked event</SelectItem>
            {upcomingEvents.map((ev) => (
              <SelectItem key={ev.id} value={ev.id}>
                {ev.title} ({new Date(ev.starts_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="reason">Reason for OD *</Label>
        <Textarea
          id="reason"
          placeholder="Describe the reason for the On-Duty request..."
          value={form.reason}
          onChange={(e) => setForm({ ...form, reason: e.target.value })}
          rows={3}
          required
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="start_date">Start Date *</Label>
          <Input
            id="start_date"
            type="date"
            value={form.start_date}
            onChange={(e) => setForm({ ...form, start_date: e.target.value })}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="end_date">End Date *</Label>
          <Input
            id="end_date"
            type="date"
            value={form.end_date}
            onChange={(e) => setForm({ ...form, end_date: e.target.value })}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="duration">Duration (Hours) *</Label>
          <Input
            id="duration"
            type="number"
            min={1}
            max={72}
            value={form.duration_hours || ''}
            onChange={(e) => setForm({ ...form, duration_hours: parseInt(e.target.value) || 0 })}
            required
          />
        </div>
      </div>

      <Separator />

      <div className="flex justify-end">
        <Button type="submit" disabled={createOD.isPending}>
          {createOD.isPending ? 'Creating...' : 'Create OD Request'}
        </Button>
      </div>
    </form>
  );
}

export function ODRequestsClient({
  initialRequests,
  upcomingEvents,
  userId,
  institutionId,
}: ODRequestsClientProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [requests, setRequests] = useState(initialRequests);
  const submitOD = useSubmitODRequest();

  const handleSubmitOD = (id: string) => {
    submitOD.mutate(id, {
      onSuccess: () => {
        setRequests((prev) =>
          prev.map((r: any) => (r.id === id ? { ...r, status: 'submitted' } : r))
        );
      },
    });
  };

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">My OD Requests</h1>
          <p className="text-sm text-muted-foreground">
            Create and track On-Duty requests
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New OD Request
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create OD Request</DialogTitle>
            </DialogHeader>
            <CreateODForm
              userId={userId}
              institutionId={institutionId}
              upcomingEvents={upcomingEvents}
              onSuccess={() => setDialogOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total', count: requests.length, color: 'bg-gray-100 text-gray-700' },
          { label: 'Pending', count: requests.filter((r: any) => ['submitted', 'in_review'].includes(r.status)).length, color: 'bg-yellow-50 text-yellow-700' },
          { label: 'Approved', count: requests.filter((r: any) => r.status === 'approved').length, color: 'bg-green-50 text-green-700' },
          { label: 'Rejected', count: requests.filter((r: any) => r.status === 'rejected').length, color: 'bg-red-50 text-red-700' },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold">{stat.count}</p>
              <Badge className={`text-xs mt-1 ${stat.color}`} variant="outline">{stat.label}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Requests List */}
      {requests.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <ClipboardSignature className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No OD requests yet</p>
            <p className="text-sm mt-1">Create your first On-Duty request above.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {requests.map((req: any) => {
            const cfg = statusConfig[req.status] || statusConfig.draft;
            const StatusIcon = cfg.icon;

            return (
              <Card key={req.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <code className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          {req.request_number}
                        </code>
                        <Badge variant={cfg.badgeVariant}>
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {cfg.label}
                        </Badge>
                      </div>
                      <p className="text-sm mt-1.5">{req.reason}</p>
                      {req.event && (
                        <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                          <CalendarDays className="h-3 w-3" />
                          <span>Event: {(req.event as any)?.title}</span>
                        </div>
                      )}
                    </div>

                    {req.status === 'draft' && (
                      <Button
                        size="sm"
                        onClick={() => handleSubmitOD(req.id)}
                        disabled={submitOD.isPending}
                      >
                        <Send className="h-3.5 w-3.5 mr-1.5" />
                        Submit
                      </Button>
                    )}
                  </div>

                  <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
                    <span>
                      {new Date(req.start_date).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                      {req.start_date !== req.end_date && (
                        <>
                          {' - '}
                          {new Date(req.end_date).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </>
                      )}
                    </span>
                    <span>{req.duration_hours}h</span>
                  </div>

                  {/* Approval Progress */}
                  <ODApprovalProgress request={req} />

                  {/* Approval Comments */}
                  {req.approvals && req.approvals.length > 0 && (
                    <div className="mt-3 pt-3 border-t">
                      {req.approvals.map((approval: any) => (
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
