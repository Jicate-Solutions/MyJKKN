'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useMarathonSponsors,
  useSponsorSummary,
  useCreateSponsor,
  useMovePipelineStage,
} from '@/hooks/events/marathon/use-marathon-sponsors';
import { useMarathonEvent } from '@/hooks/events/marathon/use-marathon-events';
import {
  Loader2,
  Plus,
  Handshake,
  IndianRupee,
  CheckCircle2,
  TrendingUp,
  ExternalLink,
} from 'lucide-react';
import type {
  MarathonSponsor,
  SponsorTier,
  SponsorPipelineStage,
  CreateMarathonSponsorDto,
} from '@/types/events-marathon';

// ============================================================================
// Constants
// ============================================================================

const PIPELINE_STAGES: { key: SponsorPipelineStage; label: string; color: string }[] = [
  { key: 'lead', label: 'Lead', color: 'bg-slate-100 dark:bg-slate-800' },
  { key: 'contacted', label: 'Contacted', color: 'bg-blue-50 dark:bg-blue-950' },
  { key: 'proposal_sent', label: 'Proposal Sent', color: 'bg-yellow-50 dark:bg-yellow-950' },
  { key: 'negotiating', label: 'Negotiating', color: 'bg-orange-50 dark:bg-orange-950' },
  { key: 'committed', label: 'Committed', color: 'bg-green-50 dark:bg-green-950' },
  { key: 'declined', label: 'Declined', color: 'bg-red-50 dark:bg-red-950' },
];

const TIER_BADGE: Record<
  SponsorTier,
  { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }
> = {
  platinum: { label: 'Platinum', variant: 'default' },
  gold: { label: 'Gold', variant: 'default' },
  silver: { label: 'Silver', variant: 'secondary' },
  bronze: { label: 'Bronze', variant: 'outline' },
  in_kind: { label: 'In-Kind', variant: 'secondary' },
  prospect: { label: 'Prospect', variant: 'outline' },
  contacted: { label: 'Contacted', variant: 'outline' },
  negotiating: { label: 'Negotiating', variant: 'outline' },
  committed: { label: 'Committed', variant: 'default' },
};

const TIER_OPTIONS: SponsorTier[] = [
  'platinum',
  'gold',
  'silver',
  'bronze',
  'in_kind',
  'prospect',
];

// ============================================================================
// Summary Cards
// ============================================================================

function SummaryCards({ eventId }: { eventId: string }) {
  const { data: summary, isLoading } = useSponsorSummary(eventId);

  if (isLoading || !summary) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-4 pb-3">
              <div className="h-16 animate-pulse bg-muted rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const committedCount =
    summary.by_pipeline.find((p) => p.stage === 'committed')?.count ?? 0;

  const cards = [
    {
      label: 'Total Sponsors',
      value: summary.total_sponsors,
      icon: Handshake,
      sub: `${summary.by_tier.length} tier${summary.by_tier.length !== 1 ? 's' : ''} active`,
    },
    {
      label: 'Total Pledged',
      value: `₹${summary.total_pledged.toLocaleString('en-IN')}`,
      icon: TrendingUp,
      sub: `${summary.by_pipeline.length} stages active`,
    },
    {
      label: 'Total Received',
      value: `₹${summary.total_received.toLocaleString('en-IN')}`,
      icon: IndianRupee,
      sub:
        summary.total_pledged > 0
          ? `${Math.round((summary.total_received / summary.total_pledged) * 100)}% collected`
          : '0% collected',
    },
    {
      label: 'Committed',
      value: committedCount,
      icon: CheckCircle2,
      sub: 'Confirmed sponsors',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <c.icon className="h-3.5 w-3.5" />
              {c.label}
            </div>
            <div className="text-2xl font-bold">{c.value}</div>
            <div className="text-xs text-muted-foreground truncate mt-0.5">{c.sub}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ============================================================================
// Sponsor Card
// ============================================================================

function SponsorCard({
  sponsor,
  eventId,
}: {
  sponsor: MarathonSponsor;
  eventId: string;
}) {
  const movePipeline = useMovePipelineStage();

  const deliverables = (sponsor.deliverables ?? []) as any[];
  const completed = deliverables.filter((d) => d.status === 'completed').length;
  const total = deliverables.length;
  const tier = TIER_BADGE[sponsor.tier] ?? { label: sponsor.tier, variant: 'outline' as const };

  return (
    <Card className="mb-2 hover:shadow-md transition-shadow">
      <CardContent className="pt-3 pb-3 px-3 space-y-2">
        {/* Header row */}
        <div className="flex items-start justify-between gap-1">
          <Link
            href={`/events/marathon/${eventId}/sponsors/${sponsor.id}`}
            className="font-semibold text-sm hover:underline truncate leading-tight"
          >
            {sponsor.company_name}
          </Link>
          <Badge variant={tier.variant} className="text-[10px] px-1.5 py-0 shrink-0">
            {tier.label}
          </Badge>
        </div>

        {/* Contact */}
        {sponsor.contact_person && (
          <p className="text-xs text-muted-foreground truncate">{sponsor.contact_person}</p>
        )}

        {/* Amount */}
        <div className="text-sm font-medium">
          ₹{(sponsor.amount_pledged ?? 0).toLocaleString('en-IN')}
        </div>

        {/* Deliverables progress */}
        {total > 0 && (
          <div className="text-xs text-muted-foreground">
            {completed}/{total} deliverables done
          </div>
        )}

        {/* Move stage */}
        <Select
          value={sponsor.pipeline_stage}
          onValueChange={(v) =>
            movePipeline.mutate({ id: sponsor.id, newStage: v as SponsorPipelineStage })
          }
        >
          <SelectTrigger className="h-7 text-[11px] w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PIPELINE_STAGES.map((s) => (
              <SelectItem key={s.key} value={s.key} className="text-xs">
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Detail link */}
        <Link
          href={`/events/marathon/${eventId}/sponsors/${sponsor.id}`}
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <ExternalLink className="h-3 w-3" />
          View details
        </Link>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Kanban Column
// ============================================================================

function KanbanColumn({
  stage,
  sponsors,
  eventId,
}: {
  stage: (typeof PIPELINE_STAGES)[number];
  sponsors: MarathonSponsor[];
  eventId: string;
}) {
  return (
    <div className="flex flex-col min-w-[220px] w-[220px] shrink-0">
      {/* Column header */}
      <div
        className={`rounded-t-lg px-3 py-2 flex items-center justify-between ${stage.color}`}
      >
        <span className="text-xs font-semibold uppercase tracking-wide">
          {stage.label}
        </span>
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
          {sponsors.length}
        </Badge>
      </div>

      {/* Cards */}
      <div className={`flex-1 rounded-b-lg p-2 min-h-[120px] ${stage.color}`}>
        {sponsors.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center pt-4">No sponsors</p>
        ) : (
          sponsors.map((s) => (
            <SponsorCard key={s.id} sponsor={s} eventId={eventId} />
          ))
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Add Sponsor Dialog
// ============================================================================

function AddSponsorDialog({
  open,
  onClose,
  eventId,
}: {
  open: boolean;
  onClose: () => void;
  eventId: string;
}) {
  const createSponsor = useCreateSponsor();
  const [form, setForm] = useState<Partial<CreateMarathonSponsorDto>>({
    event_id: eventId,
    tier: 'bronze',
    pipeline_stage: 'lead',
    amount_pledged: 0,
  });

  const handleSubmit = () => {
    if (!form.company_name?.trim()) return;
    createSponsor.mutate(
      {
        event_id: eventId,
        company_name: form.company_name,
        contact_person: form.contact_person,
        contact_email: form.contact_email,
        contact_phone: form.contact_phone,
        website: form.website,
        tier: form.tier,
        amount_pledged: form.amount_pledged ?? 0,
        pipeline_stage: form.pipeline_stage,
      },
      {
        onSuccess: () => {
          setForm({ event_id: eventId, tier: 'bronze', pipeline_stage: 'lead', amount_pledged: 0 });
          onClose();
        },
      }
    );
  };

  const set = (key: keyof CreateMarathonSponsorDto, value: unknown) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Sponsor</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1">
            <Label className="text-xs">Company Name *</Label>
            <Input
              placeholder="Acme Corp"
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
                    <SelectItem key={t} value={t} className="text-sm capitalize">
                      {TIER_BADGE[t]?.label ?? t}
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

          <div className="space-y-1">
            <Label className="text-xs">Amount Pledged (₹)</Label>
            <Input
              type="number"
              min={0}
              placeholder="0"
              value={form.amount_pledged ?? ''}
              onChange={(e) => set('amount_pledged', Number(e.target.value))}
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Contact Person</Label>
            <Input
              placeholder="John Doe"
              value={form.contact_person ?? ''}
              onChange={(e) => set('contact_person', e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Email</Label>
              <Input
                type="email"
                placeholder="john@acme.com"
                value={form.contact_email ?? ''}
                onChange={(e) => set('contact_email', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Phone</Label>
              <Input
                placeholder="+91 98765 43210"
                value={form.contact_phone ?? ''}
                onChange={(e) => set('contact_phone', e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Website</Label>
            <Input
              placeholder="https://acme.com"
              value={form.website ?? ''}
              onChange={(e) => set('website', e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={createSponsor.isPending || !form.company_name?.trim()}
          >
            {createSponsor.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : null}
            Add Sponsor
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function MarathonSponsorsPage() {
  const params = useParams();
  const eventId = params.id as string;

  const [addOpen, setAddOpen] = useState(false);

  const { data: event, isLoading: eventLoading } = useMarathonEvent(eventId);
  const { data: sponsors, isLoading, error } = useMarathonSponsors(eventId);

  // Group sponsors by pipeline stage
  const byStage = (stage: SponsorPipelineStage) =>
    (sponsors ?? []).filter((s) => s.pipeline_stage === stage);

  if (eventLoading) {
    return (
      <ContentLayout title="Sponsors">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={`${event?.name ?? 'Event'} - Sponsors`}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Events', href: '/events' },
          { label: 'Marathon', href: '/events/marathon' },
          { label: event?.name ?? '...', href: `/events/marathon/${eventId}/settings` },
          { label: 'Sponsors' },
        ]}
      />

      <div className="space-y-4 mt-4">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold py-1">Sponsorship CRM</h1>
            <p className="text-sm text-muted-foreground">
              Manage sponsors and track the pipeline for {event?.name ?? 'this event'}.
            </p>
          </div>
          <Button onClick={() => setAddOpen(true)} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Add Sponsor
          </Button>
        </div>

        {/* Summary cards */}
        <SummaryCards eventId={eventId} />

        {/* Loading / error */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="text-center py-12 text-destructive">
            Failed to load sponsors. Please try again.
          </div>
        )}

        {/* Kanban board */}
        {!isLoading && !error && (
          <div className="overflow-x-auto pb-4">
            <div className="flex gap-3 min-w-max">
              {PIPELINE_STAGES.map((stage) => (
                <KanbanColumn
                  key={stage.key}
                  stage={stage}
                  sponsors={byStage(stage.key)}
                  eventId={eventId}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <AddSponsorDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        eventId={eventId}
      />
    </ContentLayout>
  );
}
