'use client';

// components/events/shared/sponsors-board.tsx
// Shared Sponsorship CRM board (Kanban pipeline + summary + add dialog) for ANY event type.
// Promoted from the marathon sponsors page (Events Platform Promotion PR1). Self-contained — no
// marathon-specific routes — so it drops into the shared <EventLogistics> Sponsors tab for
// tournaments, lectures, cultural events, etc. Read-only when canManage is false.

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
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
  Loader2,
  Plus,
  Handshake,
  IndianRupee,
  CheckCircle2,
  TrendingUp,
} from 'lucide-react';
import {
  useEventSponsors,
  useEventSponsorSummary,
  useCreateEventSponsor,
  useMoveEventSponsorStage,
} from '@/hooks/events/shared/use-event-sponsors';
import type {
  MarathonSponsor,
  SponsorTier,
  SponsorPipelineStage,
  CreateMarathonSponsorDto,
} from '@/types/events-marathon';

const PIPELINE_STAGES: { key: SponsorPipelineStage; label: string; color: string }[] = [
  { key: 'lead', label: 'Lead', color: 'bg-slate-100 dark:bg-slate-800' },
  { key: 'contacted', label: 'Contacted', color: 'bg-blue-50 dark:bg-blue-950' },
  { key: 'proposal_sent', label: 'Proposal Sent', color: 'bg-yellow-50 dark:bg-yellow-950' },
  { key: 'negotiating', label: 'Negotiating', color: 'bg-orange-50 dark:bg-orange-950' },
  { key: 'committed', label: 'Committed', color: 'bg-green-50 dark:bg-green-950' },
  { key: 'declined', label: 'Declined', color: 'bg-red-50 dark:bg-red-950' },
];

const TIER_BADGE: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }
> = {
  platinum: { label: 'Platinum', variant: 'default' },
  gold: { label: 'Gold', variant: 'default' },
  silver: { label: 'Silver', variant: 'secondary' },
  bronze: { label: 'Bronze', variant: 'outline' },
  in_kind: { label: 'In-Kind', variant: 'secondary' },
  prospect: { label: 'Prospect', variant: 'outline' },
};

const TIER_OPTIONS: SponsorTier[] = ['platinum', 'gold', 'silver', 'bronze', 'in_kind', 'prospect'];

function SummaryCards({ eventId }: { eventId: string }) {
  const { data: summary, isLoading } = useEventSponsorSummary(eventId);

  if (isLoading || !summary) {
    return (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardContent className="pb-3 pt-4">
              <div className="h-16 animate-pulse rounded bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const committedCount = summary.by_pipeline.find((p) => p.stage === 'committed')?.count ?? 0;
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
    { label: 'Committed', value: committedCount, icon: CheckCircle2, sub: 'Confirmed sponsors' },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardContent className="pb-3 pt-4">
            <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
              <c.icon className="h-3.5 w-3.5" />
              {c.label}
            </div>
            <div className="text-2xl font-bold">{c.value}</div>
            <div className="mt-0.5 truncate text-xs text-muted-foreground">{c.sub}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function SponsorCard({ sponsor, canManage }: { sponsor: MarathonSponsor; canManage: boolean }) {
  const movePipeline = useMoveEventSponsorStage();
  const deliverables = (sponsor.deliverables ?? []) as { status?: string }[];
  const completed = deliverables.filter((d) => d.status === 'completed').length;
  const total = deliverables.length;
  const tier = TIER_BADGE[sponsor.tier] ?? { label: sponsor.tier, variant: 'outline' as const };

  return (
    <Card className="mb-2 transition-shadow hover:shadow-md">
      <CardContent className="space-y-2 px-3 pb-3 pt-3">
        <div className="flex items-start justify-between gap-1">
          <span className="truncate text-sm font-semibold leading-tight">{sponsor.company_name}</span>
          <Badge variant={tier.variant} className="shrink-0 px-1.5 py-0 text-[10px]">
            {tier.label}
          </Badge>
        </div>
        {sponsor.contact_person && (
          <p className="truncate text-xs text-muted-foreground">{sponsor.contact_person}</p>
        )}
        <div className="text-sm font-medium">
          ₹{(sponsor.amount_pledged ?? 0).toLocaleString('en-IN')}
        </div>
        {total > 0 && (
          <div className="text-xs text-muted-foreground">
            {completed}/{total} deliverables done
          </div>
        )}
        <Select
          value={sponsor.pipeline_stage}
          disabled={!canManage || movePipeline.isPending}
          onValueChange={(v) => movePipeline.mutate({ id: sponsor.id, newStage: v as SponsorPipelineStage })}
        >
          <SelectTrigger className="h-7 w-full text-[11px]">
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
      </CardContent>
    </Card>
  );
}

function AddSponsorDialog({
  open,
  onClose,
  eventId,
}: {
  open: boolean;
  onClose: () => void;
  eventId: string;
}) {
  const createSponsor = useCreateEventSponsor();
  const [form, setForm] = useState<Partial<CreateMarathonSponsorDto>>({
    event_id: eventId,
    tier: 'bronze',
    pipeline_stage: 'lead',
    amount_pledged: 0,
  });

  const set = (key: keyof CreateMarathonSponsorDto, value: unknown) =>
    setForm((f) => ({ ...f, [key]: value }));

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
              <Select value={form.tier ?? 'bronze'} onValueChange={(v) => set('tier', v as SponsorTier)}>
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
          <Button onClick={handleSubmit} disabled={createSponsor.isPending || !form.company_name?.trim()}>
            {createSponsor.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Add Sponsor
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SponsorsBoard({ eventId, canManage = true }: { eventId: string; canManage?: boolean }) {
  const [addOpen, setAddOpen] = useState(false);
  const { data: sponsors, isLoading, error } = useEventSponsors(eventId);

  const byStage = (stage: SponsorPipelineStage) =>
    (sponsors ?? []).filter((s) => s.pipeline_stage === stage);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Sponsorship CRM</h3>
          <p className="text-sm text-muted-foreground">Manage sponsors and track the pipeline.</p>
        </div>
        {canManage && (
          <Button onClick={() => setAddOpen(true)} size="sm">
            <Plus className="mr-1 h-4 w-4" />
            Add Sponsor
          </Button>
        )}
      </div>

      <SummaryCards eventId={eventId} />

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
      {error && (
        <div className="py-12 text-center text-destructive">Failed to load sponsors. Please try again.</div>
      )}

      {!isLoading && !error && (
        <div className="overflow-x-auto pb-4">
          <div className="flex min-w-max gap-3">
            {PIPELINE_STAGES.map((stage) => {
              const list = byStage(stage.key);
              return (
                <div key={stage.key} className="flex w-[220px] min-w-[220px] shrink-0 flex-col">
                  <div className={`flex items-center justify-between rounded-t-lg px-3 py-2 ${stage.color}`}>
                    <span className="text-xs font-semibold uppercase tracking-wide">{stage.label}</span>
                    <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                      {list.length}
                    </Badge>
                  </div>
                  <div className={`min-h-[120px] flex-1 rounded-b-lg p-2 ${stage.color}`}>
                    {list.length === 0 ? (
                      <p className="pt-4 text-center text-xs text-muted-foreground">No sponsors</p>
                    ) : (
                      list.map((s) => <SponsorCard key={s.id} sponsor={s} canManage={canManage} />)
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <AddSponsorDialog open={addOpen} onClose={() => setAddOpen(false)} eventId={eventId} />
    </div>
  );
}
