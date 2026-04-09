'use client';

/**
 * LC-003: Event Proposals - Create form + Proposals list with status tracking
 */

import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
} from 'lucide-react';
import { useCreateEvent, useSubmitForApproval } from '@/hooks/learners-council/use-lc-events';
import type { LCEvent, CreateEventDto, EventScope } from '@/types/learners-council';

interface EventProposalsClientProps {
  initialProposals: LCEvent[];
  userId: string;
  institutionId: string;
}

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
  onSuccess,
}: {
  userId: string;
  institutionId: string;
  onSuccess: () => void;
}) {
  const createEvent = useCreateEvent();
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

    createEvent.mutate(
      {
        data: {
          ...form,
          institution_id: institutionId,
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

export function EventProposalsClient({
  initialProposals,
  userId,
  institutionId,
}: EventProposalsClientProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [proposals, setProposals] = useState(initialProposals);
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

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Event Proposals</h1>
          <p className="text-sm text-muted-foreground">
            Create and track your event proposals
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
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
              onSuccess={handleCreateSuccess}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Proposals List */}
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
                        onClick={() => handleSubmit(event.id)}
                        disabled={submitForApproval.isPending}
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
