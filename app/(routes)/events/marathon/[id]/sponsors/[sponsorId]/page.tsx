'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  useMarathonSponsor,
  useUpdateSponsor,
  useDeleteSponsor,
  useMovePipelineStage,
  useAddDeliverable,
  useUpdateDeliverable,
  useDeleteDeliverable,
  useLogSponsorActivity,
} from '@/hooks/events/marathon/use-marathon-sponsors';
import { useMarathonEvent } from '@/hooks/events/marathon/use-marathon-events';
import { useMarathonAccess } from '@/hooks/events/marathon/use-marathon-access';
import { MarathonAccessDenied } from '../../_components/marathon-access-denied';
import {
  Loader2,
  ArrowLeft,
  Globe,
  Mail,
  Phone,
  User,
  Trash2,
  Plus,
  CheckCircle2,
  Circle,
  Clock,
  XCircle,
  PhoneCall,
  MessageSquare,
  Calendar,
  CreditCard,
  FileText,
} from 'lucide-react';
import { format } from 'date-fns';
import type {
  MarathonSponsor,
  MarathonSponsorDeliverable,
  SponsorTier,
  SponsorPipelineStage,
} from '@/types/events-marathon';

// ============================================================================
// Constants
// ============================================================================

const PIPELINE_STAGES: { key: SponsorPipelineStage; label: string }[] = [
  { key: 'lead', label: 'Lead' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'proposal_sent', label: 'Proposal Sent' },
  { key: 'negotiating', label: 'Negotiating' },
  { key: 'committed', label: 'Committed' },
  { key: 'declined', label: 'Declined' },
  { key: 'churned', label: 'Churned' },
];

const TIER_OPTIONS: { value: SponsorTier; label: string }[] = [
  { value: 'platinum', label: 'Platinum' },
  { value: 'gold', label: 'Gold' },
  { value: 'silver', label: 'Silver' },
  { value: 'bronze', label: 'Bronze' },
  { value: 'in_kind', label: 'In-Kind' },
  { value: 'prospect', label: 'Prospect' },
];

const DELIVERABLE_STATUS_ICON: Record<
  MarathonSponsorDeliverable['status'],
  React.ElementType
> = {
  pending: Circle,
  in_progress: Clock,
  completed: CheckCircle2,
  cancelled: XCircle,
};

const DELIVERABLE_STATUS_CLASS: Record<MarathonSponsorDeliverable['status'], string> = {
  pending: 'text-muted-foreground',
  in_progress: 'text-blue-500',
  completed: 'text-green-500',
  cancelled: 'text-destructive',
};

const ACTIVITY_ICON: Record<string, React.ElementType> = {
  call: PhoneCall,
  email: Mail,
  meeting: Calendar,
  payment: CreditCard,
  note: FileText,
};

// ============================================================================
// Edit Sponsor Dialog
// ============================================================================

function EditSponsorDialog({
  sponsor,
  open,
  onClose,
}: {
  sponsor: MarathonSponsor;
  open: boolean;
  onClose: () => void;
}) {
  const updateSponsor = useUpdateSponsor();
  const [form, setForm] = useState<Partial<MarathonSponsor>>({ ...sponsor });

  const set = (key: keyof MarathonSponsor, value: unknown) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = () => {
    updateSponsor.mutate(
      { id: sponsor.id, dto: form },
      { onSuccess: onClose }
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Sponsor</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1">
            <Label className="text-xs">Company Name *</Label>
            <Input
              value={form.company_name ?? ''}
              onChange={(e) => set('company_name', e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Tier</Label>
              <Select
                value={form.tier ?? 'bronze'}
                onValueChange={(v) => set('tier', v as SponsorTier)}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIER_OPTIONS.map((t) => (
                    <SelectItem key={t.value} value={t.value} className="text-sm">
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Pipeline Stage</Label>
              <Select
                value={form.pipeline_stage ?? 'lead'}
                onValueChange={(v) => set('pipeline_stage', v as SponsorPipelineStage)}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PIPELINE_STAGES.map((s) => (
                    <SelectItem key={s.key} value={s.key} className="text-sm">
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Amount Pledged (₹)</Label>
              <Input
                type="number"
                min={0}
                value={form.amount_pledged ?? 0}
                onChange={(e) => set('amount_pledged', Number(e.target.value))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Amount Received (₹)</Label>
              <Input
                type="number"
                min={0}
                value={form.amount_received ?? 0}
                onChange={(e) => set('amount_received', Number(e.target.value))}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Contact Person</Label>
            <Input
              value={form.contact_person ?? ''}
              onChange={(e) => set('contact_person', e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Email</Label>
              <Input
                type="email"
                value={form.contact_email ?? ''}
                onChange={(e) => set('contact_email', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Phone</Label>
              <Input
                value={form.contact_phone ?? ''}
                onChange={(e) => set('contact_phone', e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Website</Label>
            <Input
              placeholder="https://"
              value={form.website ?? ''}
              onChange={(e) => set('website', e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Notes</Label>
            <Textarea
              rows={3}
              value={form.notes ?? ''}
              onChange={(e) => set('notes', e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={updateSponsor.isPending || !form.company_name?.trim()}
          >
            {updateSponsor.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Add Deliverable Dialog
// ============================================================================

function AddDeliverableDialog({
  sponsorId,
  open,
  onClose,
}: {
  sponsorId: string;
  open: boolean;
  onClose: () => void;
}) {
  const addDeliverable = useAddDeliverable();
  const [form, setForm] = useState<Partial<MarathonSponsorDeliverable>>({ status: 'pending' });

  const handleSubmit = () => {
    if (!form.title?.trim()) return;
    addDeliverable.mutate(
      { sponsorId, dto: form },
      {
        onSuccess: () => {
          setForm({ status: 'pending' });
          onClose();
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add Deliverable</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1">
            <Label className="text-xs">Title *</Label>
            <Input
              placeholder="Logo on banner"
              value={form.title ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Category</Label>
            <Input
              placeholder="branding / digital / print"
              value={form.category ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Description</Label>
            <Textarea
              rows={2}
              value={form.description ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select
                value={form.status ?? 'pending'}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    status: v as MarathonSponsorDeliverable['status'],
                  }))
                }
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Due Date</Label>
              <Input
                type="date"
                value={form.due_date ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={addDeliverable.isPending || !form.title?.trim()}
          >
            {addDeliverable.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Add Activity Dialog
// ============================================================================

function AddActivityDialog({
  sponsorId,
  open,
  onClose,
}: {
  sponsorId: string;
  open: boolean;
  onClose: () => void;
}) {
  const logActivity = useLogSponsorActivity();
  const [form, setForm] = useState({ activity_type: 'note', description: '' });

  const handleSubmit = () => {
    if (!form.description.trim()) return;
    logActivity.mutate(
      { sponsorId, dto: form },
      {
        onSuccess: () => {
          setForm({ activity_type: 'note', description: '' });
          onClose();
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Log Activity</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1">
            <Label className="text-xs">Type</Label>
            <Select
              value={form.activity_type}
              onValueChange={(v) => setForm((f) => ({ ...f, activity_type: v }))}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="call">Call</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="meeting">Meeting</SelectItem>
                <SelectItem value="payment">Payment</SelectItem>
                <SelectItem value="note">Note</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Description *</Label>
            <Textarea
              rows={3}
              placeholder="What happened..."
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={logActivity.isPending || !form.description.trim()}
          >
            {logActivity.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Log
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Deliverables Section
// ============================================================================

function DeliverablesSection({ sponsor }: { sponsor: MarathonSponsor }) {
  const [addOpen, setAddOpen] = useState(false);
  const updateDeliverable = useUpdateDeliverable();
  const deleteDeliverable = useDeleteDeliverable();

  const deliverables = sponsor.deliverables ?? [];

  const cycleStatus = (d: MarathonSponsorDeliverable) => {
    const cycle: MarathonSponsorDeliverable['status'][] = [
      'pending',
      'in_progress',
      'completed',
    ];
    const next = cycle[(cycle.indexOf(d.status) + 1) % cycle.length];
    updateDeliverable.mutate({ id: d.id, sponsorId: d.sponsor_id, dto: { status: next } });
  };

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold">
          Deliverables ({deliverables.length})
        </CardTitle>
        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add
        </Button>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {deliverables.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">No deliverables yet.</p>
        ) : (
          deliverables.map((d) => {
            const Icon = DELIVERABLE_STATUS_ICON[d.status] ?? Circle;
            const cls = DELIVERABLE_STATUS_CLASS[d.status] ?? '';
            return (
              <div
                key={d.id}
                className="flex items-start gap-2 group"
              >
                <button
                  onClick={() => cycleStatus(d)}
                  className={`mt-0.5 shrink-0 ${cls} hover:opacity-70 transition-opacity`}
                  title="Click to cycle status"
                >
                  <Icon className="h-4 w-4" />
                </button>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${d.status === 'completed' ? 'line-through text-muted-foreground' : ''}`}>
                    {d.title}
                  </p>
                  {d.category && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 mt-0.5">
                      {d.category}
                    </Badge>
                  )}
                  {d.due_date && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Due {format(new Date(d.due_date), 'dd MMM yyyy')}
                    </p>
                  )}
                </div>
                <button
                  onClick={() =>
                    deleteDeliverable.mutate({ id: d.id, sponsorId: d.sponsor_id })
                  }
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })
        )}
      </CardContent>
      <AddDeliverableDialog
        sponsorId={sponsor.id}
        open={addOpen}
        onClose={() => setAddOpen(false)}
      />
    </Card>
  );
}

// ============================================================================
// Activity Timeline Section
// ============================================================================

function ActivityTimeline({ sponsor }: { sponsor: MarathonSponsor }) {
  const [addOpen, setAddOpen] = useState(false);
  const activities = [...(sponsor.activity_log ?? [])].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold">
          Activity Log ({activities.length})
        </CardTitle>
        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Log
        </Button>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {activities.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">No activity logged yet.</p>
        ) : (
          <div className="relative">
            {/* Timeline vertical line */}
            <div className="absolute left-[11px] top-0 bottom-0 w-px bg-border" />
            <div className="space-y-4 pl-7">
              {activities.map((a) => {
                const Icon = ACTIVITY_ICON[a.activity_type] ?? MessageSquare;
                return (
                  <div key={a.id} className="relative">
                    {/* Dot */}
                    <div className="absolute -left-[22px] top-0 h-6 w-6 rounded-full border bg-background flex items-center justify-center">
                      <Icon className="h-3 w-3 text-muted-foreground" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">
                          {a.activity_type}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground">
                          {format(new Date(a.created_at), 'dd MMM yyyy, HH:mm')}
                        </span>
                      </div>
                      <p className="text-sm mt-1">{a.description}</p>
                      {a.performed_by && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          — {a.performed_by}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
      <AddActivityDialog
        sponsorId={sponsor.id}
        open={addOpen}
        onClose={() => setAddOpen(false)}
      />
    </Card>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function SponsorDetailPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.id as string;
  const sponsorId = params.sponsorId as string;
  const access = useMarathonAccess();

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: event } = useMarathonEvent(eventId);
  const { data: sponsor, isLoading, error } = useMarathonSponsor(sponsorId);

  // Block non-admin users
  if (!access.isLoading && !access.canManage) {
    return <MarathonAccessDenied title="Sponsor Details" eventId={eventId} />;
  }

  const movePipeline = useMovePipelineStage();
  const deleteSponsor = useDeleteSponsor();

  const handleDelete = () => {
    deleteSponsor.mutate(
      { id: sponsorId, eventId },
      {
        onSuccess: () => router.push(`/events/marathon/${eventId}/sponsors`),
      }
    );
  };

  if (isLoading) {
    return (
      <ContentLayout title="Sponsor">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </ContentLayout>
    );
  }

  if (error || !sponsor) {
    return (
      <ContentLayout title="Sponsor Not Found">
        <div className="text-center py-20 text-muted-foreground">
          Sponsor not found.{' '}
          <button
            onClick={() => router.push(`/events/marathon/${eventId}/sponsors`)}
            className="underline"
          >
            Go back
          </button>
        </div>
      </ContentLayout>
    );
  }

  const tierInfo = TIER_OPTIONS.find((t) => t.value === sponsor.tier);

  return (
    <ContentLayout title={sponsor.company_name}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Events', href: '/events' },
          { label: 'Marathon', href: '/events/marathon' },
          { label: event?.name ?? '...', href: `/events/marathon/${eventId}/settings` },
          { label: 'Sponsors', href: `/events/marathon/${eventId}/sponsors` },
          { label: sponsor.company_name },
        ]}
      />

      <div className="space-y-4 mt-4">
        {/* Page header */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push(`/events/marathon/${eventId}/sponsors`)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{sponsor.company_name}</h1>
              <Badge variant="default" className="capitalize">
                {tierInfo?.label ?? sponsor.tier}
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
              Edit
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              Delete
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left column: info cards */}
          <div className="lg:col-span-1 space-y-4">
            {/* Company Info */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Company Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                {sponsor.contact_person && (
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span>{sponsor.contact_person}</span>
                  </div>
                )}
                {sponsor.contact_email && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <a
                      href={`mailto:${sponsor.contact_email}`}
                      className="hover:underline truncate"
                    >
                      {sponsor.contact_email}
                    </a>
                  </div>
                )}
                {sponsor.contact_phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <a href={`tel:${sponsor.contact_phone}`} className="hover:underline">
                      {sponsor.contact_phone}
                    </a>
                  </div>
                )}
                {sponsor.website && (
                  <div className="flex items-center gap-2 text-sm">
                    <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <a
                      href={sponsor.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline truncate"
                    >
                      {sponsor.website.replace(/^https?:\/\//, '')}
                    </a>
                  </div>
                )}
                {sponsor.signed_date && (
                  <div className="text-xs text-muted-foreground">
                    Signed: {format(new Date(sponsor.signed_date), 'dd MMM yyyy')}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Financial */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Financials</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Pledged</span>
                  <span className="font-semibold">
                    ₹{(sponsor.amount_pledged ?? 0).toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Received</span>
                  <span className="font-semibold text-green-600">
                    ₹{(sponsor.amount_received ?? 0).toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Outstanding</span>
                  <span className="font-semibold text-orange-500">
                    ₹{(
                      (sponsor.amount_pledged ?? 0) - (sponsor.amount_received ?? 0)
                    ).toLocaleString('en-IN')}
                  </span>
                </div>
                {(sponsor.amount_pledged ?? 0) > 0 && (
                  <div>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                      <span>Collected</span>
                      <span>
                        {Math.round(
                          ((sponsor.amount_received ?? 0) /
                            (sponsor.amount_pledged ?? 1)) *
                            100
                        )}
                        %
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-green-500 rounded-full transition-all"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.round(
                              ((sponsor.amount_received ?? 0) /
                                (sponsor.amount_pledged ?? 1)) *
                                100
                            )
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Pipeline Stage */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Pipeline Stage</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <Select
                  value={sponsor.pipeline_stage}
                  onValueChange={(v) =>
                    movePipeline.mutate({
                      id: sponsor.id,
                      newStage: v as SponsorPipelineStage,
                    })
                  }
                >
                  <SelectTrigger className="h-9 text-sm w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PIPELINE_STAGES.map((s) => (
                      <SelectItem key={s.key} value={s.key} className="text-sm">
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            {/* Notes */}
            {sponsor.notes && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Notes</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-sm text-muted-foreground whitespace-pre-line">
                    {sponsor.notes}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right column: deliverables + activity */}
          <div className="lg:col-span-2 space-y-4">
            <DeliverablesSection sponsor={sponsor} />
            <ActivityTimeline sponsor={sponsor} />
          </div>
        </div>
      </div>

      {/* Edit dialog */}
      {editOpen && (
        <EditSponsorDialog
          sponsor={sponsor}
          open={editOpen}
          onClose={() => setEditOpen(false)}
        />
      )}

      {/* Delete confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Sponsor</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{' '}
              <strong>{sponsor.company_name}</strong>? This will also remove all
              deliverables and activity logs. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteSponsor.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ContentLayout>
  );
}
