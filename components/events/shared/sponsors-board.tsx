'use client';

// components/events/shared/sponsors-board.tsx
// Shared Sponsorship CRM board for ANY event type (Events Platform Promotion PR1;
// UI overhaul 2026-07). Promoted from the marathon sponsors page — self-contained,
// so it drops into the shared <EventLogistics> Sponsors tab for tournaments,
// lectures, cultural events, etc. Read-only when canManage is false.
//
// Layout: summary stat tiles → stage filter chips (wrap, no horizontal scroll —
// the old 6-column Kanban forced ~1300px of sideways scrolling inside a nested
// tab) → responsive sponsor card grid. Stage identity is always dot + label,
// never color alone; amounts use tabular figures.

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
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
  Loader2,
  Plus,
  Handshake,
  IndianRupee,
  CheckCircle2,
  TrendingUp,
  Mail,
  Phone,
  User,
  Globe,
  ListChecks,
  Trash2,
  Pencil,
  StickyNote,
} from 'lucide-react';
import {
  useEventSponsors,
  useEventSponsorSummary,
  useCreateEventSponsor,
  useUpdateEventSponsor,
  useMoveEventSponsorStage,
  useDeleteEventSponsor,
  useEventSponsorshipNotes,
  useSaveEventSponsorshipNotes,
} from '@/hooks/events/shared/use-event-sponsors';
import {
  EMPTY_SPONSOR_FORM,
  sponsorFormToPayload,
  sponsorToForm,
  type SponsorFormState,
} from '@/lib/utils/events/sponsor-form';
import type {
  MarathonSponsor,
  SponsorTier,
  SponsorPipelineStage,
  CreateMarathonSponsorDto,
} from '@/types/events-marathon';

const PIPELINE_STAGES: { key: SponsorPipelineStage; label: string; dot: string }[] = [
  { key: 'lead', label: 'Lead', dot: 'bg-slate-400' },
  { key: 'contacted', label: 'Contacted', dot: 'bg-blue-500' },
  { key: 'proposal_sent', label: 'Proposal Sent', dot: 'bg-amber-500' },
  { key: 'negotiating', label: 'Negotiating', dot: 'bg-orange-500' },
  { key: 'committed', label: 'Committed', dot: 'bg-emerald-600' },
  { key: 'declined', label: 'Declined', dot: 'bg-red-500' },
];

/** Tier badges: soft tinted bg + strong text in both themes; label always shown. */
const TIER_BADGE: Record<string, { label: string; className: string }> = {
  platinum: {
    label: 'Platinum',
    className: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
  },
  gold: {
    label: 'Gold',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  },
  silver: {
    label: 'Silver',
    className: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  },
  bronze: {
    label: 'Bronze',
    className: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
  },
  in_kind: {
    label: 'In-Kind',
    className: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  },
  prospect: {
    label: 'Prospect',
    className: 'bg-muted text-muted-foreground',
  },
};

const TIER_OPTIONS: SponsorTier[] = ['platinum', 'gold', 'silver', 'bronze', 'in_kind', 'prospect'];

const inr = (n: number) => `₹${(n ?? 0).toLocaleString('en-IN')}`;

/** Free-text organizer input → safe external href: http(s) only (blocks javascript: URIs). */
function safeWebsiteUrl(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim());
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    // Tolerate bare domains like "acme.com" that organizers commonly enter.
    try {
      const u = new URL(`https://${raw.trim()}`);
      return u.hostname.includes('.') ? u.toString() : null;
    } catch {
      return null;
    }
  }
}

function SummaryCards({ eventId }: { eventId: string }) {
  const { data: summary, isLoading } = useEventSponsorSummary(eventId);

  if (isLoading || !summary) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
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
  const collectedPct =
    summary.total_pledged > 0
      ? Math.min(100, Math.round((summary.total_received / summary.total_pledged) * 100))
      : 0;

  const cards: {
    label: string;
    value: string;
    icon: typeof Handshake;
    sub?: string;
    meter?: number;
  }[] = [
    {
      label: 'Total Sponsors',
      value: String(summary.total_sponsors),
      icon: Handshake,
      sub: `${summary.by_tier.length} tier${summary.by_tier.length !== 1 ? 's' : ''} active`,
    },
    {
      label: 'Total Pledged',
      value: inr(summary.total_pledged),
      icon: TrendingUp,
      sub: `${summary.by_pipeline.length} stages active`,
    },
    {
      label: 'Total Received',
      value: inr(summary.total_received),
      icon: IndianRupee,
      sub: `${collectedPct}% of pledged collected`,
      meter: collectedPct,
    },
    {
      label: 'Committed',
      value: String(committedCount),
      icon: CheckCircle2,
      sub: 'Confirmed sponsors',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardContent className="flex items-start gap-3 p-4">
            <div className="mt-0.5 shrink-0 rounded-lg bg-emerald-50 p-2 dark:bg-emerald-950/50">
              <c.icon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">{c.label}</p>
              <p className="truncate text-xl font-semibold leading-tight tabular-nums">{c.value}</p>
              {c.sub && <p className="mt-0.5 truncate text-xs text-muted-foreground">{c.sub}</p>}
              {typeof c.meter === 'number' && (
                <div className="mt-1.5 h-1.5 w-full rounded-full bg-muted" title={`${c.meter}% collected`}>
                  <div
                    className="h-full rounded-full bg-emerald-600 dark:bg-emerald-500"
                    style={{ width: `${c.meter}%` }}
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/** Company initials avatar — fallback when the sponsor has no logo. */
function SponsorAvatar({ sponsor }: { sponsor: MarathonSponsor }) {
  if (sponsor.logo_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- sponsor logos live on arbitrary external hosts; next/image would require domain allow-listing per sponsor
      <img
        src={sponsor.logo_url}
        alt={`${sponsor.company_name} logo`}
        width={40}
        height={40}
        loading="lazy"
        className="h-10 w-10 shrink-0 rounded-lg border bg-white object-contain p-1"
      />
    );
  }
  const initials = sponsor.company_name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <div
      aria-hidden
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-sm font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
    >
      {initials || '?'}
    </div>
  );
}

/**
 * One free-text box for the whole sponsorship effort (BUG-006143) — "5 sponsors
 * so far, ₹1.2L committed, banner vendor pending", typed rather than picked
 * from dropdowns. Stored in event_sponsorship_notes.
 */
function SponsorshipNotesCard({ eventId, canManage }: { eventId: string; canManage: boolean }) {
  const { data: saved = '', isLoading } = useEventSponsorshipNotes(eventId);
  const save = useSaveEventSponsorshipNotes(eventId);
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? saved;
  const dirty = draft !== null && draft !== saved;

  if (isLoading) return null;
  // Nothing to show a read-only viewer when no note has been written.
  if (!canManage && !saved.trim()) return null;

  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <Label htmlFor={`sponsorship-notes-${eventId}`} className="flex items-center gap-2 text-sm font-medium">
          <StickyNote className="h-4 w-4 text-muted-foreground" />
          Sponsorship notes
        </Label>
        {canManage ? (
          <>
            <Textarea
              id={`sponsorship-notes-${eventId}`}
              rows={3}
              maxLength={10000}
              placeholder="Share any details about sponsorship here — total sponsors, total amount, pending follow-ups…"
              value={value}
              onChange={(e) => setDraft(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              {dirty && (
                <Button size="sm" variant="ghost" onClick={() => setDraft(null)} disabled={save.isPending}>
                  Discard
                </Button>
              )}
              <Button
                size="sm"
                disabled={!dirty || save.isPending}
                onClick={() => save.mutate(value, { onSuccess: () => setDraft(null) })}
              >
                {save.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                Save notes
              </Button>
            </div>
          </>
        ) : (
          <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{saved}</p>
        )}
      </CardContent>
    </Card>
  );
}

function SponsorCard({
  sponsor,
  canManage,
  showStage,
  onEdit,
}: {
  sponsor: MarathonSponsor;
  canManage: boolean;
  showStage: boolean;
  onEdit: (s: MarathonSponsor) => void;
}) {
  const movePipeline = useMoveEventSponsorStage();
  const deleteSponsor = useDeleteEventSponsor(sponsor.event_id);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deliverables = (sponsor.deliverables ?? []) as { status?: string }[];
  const completed = deliverables.filter((d) => d.status === 'completed').length;
  const total = deliverables.length;
  const tier = TIER_BADGE[sponsor.tier] ?? { label: sponsor.tier, className: 'bg-muted' };
  const stage = PIPELINE_STAGES.find((s) => s.key === sponsor.pipeline_stage);
  const pledged = sponsor.amount_pledged ?? 0;
  const received = sponsor.amount_received ?? 0;
  const receivedPct = pledged > 0 ? Math.min(100, Math.round((received / pledged) * 100)) : 0;
  const websiteHref = safeWebsiteUrl(sponsor.website);

  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="space-y-3 p-4">
        {/* Identity */}
        <div className="flex items-start gap-3">
          <SponsorAvatar sponsor={sponsor} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-semibold leading-tight">
                {sponsor.company_name}
              </span>
              {websiteHref && (
                <a
                  href={websiteHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`Open ${sponsor.company_name} website`}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <Globe className="h-3.5 w-3.5" />
                </a>
              )}
              {/* Delete sits on the card, not behind a menu: with several
                  sponsors on screen the only unambiguous way to say WHICH one
                  is to act on that card. Hidden entirely without canManage
                  rather than disabled — a greyed button on a read-only board
                  invites a click that can never work. */}
              {canManage && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto h-6 w-6 shrink-0 p-0 text-muted-foreground hover:text-foreground"
                  title={`Edit ${sponsor.company_name}`}
                  aria-label={`Edit ${sponsor.company_name}`}
                  onClick={() => onEdit(sponsor)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              )}
              {canManage && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                  title={`Delete ${sponsor.company_name}`}
                  aria-label={`Delete ${sponsor.company_name}`}
                  disabled={deleteSponsor.isPending}
                  onClick={() => setConfirmDelete(true)}
                >
                  {deleteSponsor.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </Button>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge className={`border-0 px-1.5 py-0 text-[10px] font-semibold ${tier.className}`}>
                {tier.label}
              </Badge>
              {showStage && stage && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <span className={`h-1.5 w-1.5 rounded-full ${stage.dot}`} />
                  {stage.label}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Contact */}
        {(sponsor.contact_person || sponsor.contact_email || sponsor.contact_phone) && (
          <div className="space-y-0.5 text-xs text-muted-foreground">
            {sponsor.contact_person && (
              <p className="flex items-center gap-1.5 truncate">
                <User className="h-3 w-3 shrink-0" />
                {sponsor.contact_person}
              </p>
            )}
            {sponsor.contact_email && (
              <a
                href={`mailto:${sponsor.contact_email}`}
                className="flex items-center gap-1.5 truncate hover:text-foreground"
              >
                <Mail className="h-3 w-3 shrink-0" />
                {sponsor.contact_email}
              </a>
            )}
            {sponsor.contact_phone && (
              <a
                href={`tel:${sponsor.contact_phone}`}
                className="flex items-center gap-1.5 truncate hover:text-foreground"
              >
                <Phone className="h-3 w-3 shrink-0" />
                {sponsor.contact_phone}
              </a>
            )}
          </div>
        )}

        {/* Money: pledged + collection progress */}
        <div className="rounded-md bg-muted/50 p-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs text-muted-foreground">Pledged</span>
            <span className="text-sm font-semibold tabular-nums">{inr(pledged)}</span>
          </div>
          {pledged > 0 && (
            <>
              <div className="mt-1 flex items-baseline justify-between gap-2">
                <span className="text-xs text-muted-foreground">Received</span>
                <span className="text-xs font-medium tabular-nums">
                  {inr(received)} · {receivedPct}%
                </span>
              </div>
              <div className="mt-1.5 h-1.5 w-full rounded-full bg-muted" title={`${receivedPct}% received`}>
                <div
                  className="h-full rounded-full bg-emerald-600 dark:bg-emerald-500"
                  style={{ width: `${receivedPct}%` }}
                />
              </div>
            </>
          )}
        </div>

        {sponsor.notes && (
          <p className="line-clamp-3 whitespace-pre-wrap break-words text-xs text-muted-foreground" title={sponsor.notes}>
            {sponsor.notes}
          </p>
        )}

        {/* Deliverables */}
        {total > 0 && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ListChecks className="h-3.5 w-3.5" />
            {completed}/{total} deliverables done
          </p>
        )}

        {/* Stage control */}
        <Select
          value={sponsor.pipeline_stage}
          disabled={!canManage || movePipeline.isPending}
          onValueChange={(v) =>
            movePipeline.mutate({ id: sponsor.id, newStage: v as SponsorPipelineStage })
          }
        >
          <SelectTrigger className="h-8 w-full text-xs" aria-label="Pipeline stage">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PIPELINE_STAGES.map((s) => (
              <SelectItem key={s.key} value={s.key} className="text-xs">
                <span className="flex items-center gap-2">
                  <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                  {s.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Deleting a sponsor is not just losing a name: event_sponsor_deliverables
            and event_sponsor_activity_log both reference it ON DELETE CASCADE, so
            every promised deliverable and the whole contact history go with it.
            The dialog counts what will actually be lost rather than warning in the
            abstract, and money already received is called out separately — that is
            a fact about the world that deleting the row does not undo. */}
        <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {sponsor.company_name}?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2">
                  <p>
                    This removes the sponsor from this event permanently. It cannot be
                    undone.
                  </p>
                  {total > 0 && (
                    <p>
                      Its {total} deliverable{total === 1 ? '' : 's'} and its full activity
                      history are deleted with it.
                    </p>
                  )}
                  {received > 0 && (
                    <p className="font-medium text-destructive">
                      {inr(received)} is recorded as already received from this sponsor.
                      Deleting the record does not reverse the payment — it only removes
                      the account of it.
                    </p>
                  )}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleteSponsor.isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleteSponsor.isPending}
                onClick={(e) => {
                  // The dialog closes itself on action; keep it open until the
                  // delete resolves so a failure is not hidden behind a dismissal.
                  e.preventDefault();
                  deleteSponsor.mutate(sponsor.id, {
                    onSuccess: () => setConfirmDelete(false),
                    onError: () => setConfirmDelete(false),
                  });
                }}
              >
                {deleteSponsor.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                Delete sponsor
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

/**
 * Add a sponsor, or edit an existing one (BUG-006143 — the board used to be
 * add/delete only, so a typo or a changed amount meant deleting the sponsor and
 * losing its deliverables and history). `sponsor` set = edit mode.
 */
function SponsorFormDialog({
  open,
  onClose,
  eventId,
  sponsor,
}: {
  open: boolean;
  onClose: () => void;
  eventId: string;
  sponsor?: MarathonSponsor | null;
}) {
  const createSponsor = useCreateEventSponsor();
  const updateSponsor = useUpdateEventSponsor();
  const isEdit = !!sponsor;
  // Seeded once per mount — the parent re-keys this dialog on every open, so
  // each open starts from the sponsor (or a blank form).
  const [form, setForm] = useState<SponsorFormState>(() =>
    sponsor ? sponsorToForm(sponsor) : EMPTY_SPONSOR_FORM
  );

  const set = <K extends keyof SponsorFormState>(key: K, value: SponsorFormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const pending = createSponsor.isPending || updateSponsor.isPending;

  const handleSubmit = () => {
    if (!form.company_name.trim()) return;
    if (sponsor) {
      updateSponsor.mutate(
        { id: sponsor.id, dto: sponsorFormToPayload(form, 'edit') as Partial<MarathonSponsor> },
        { onSuccess: onClose }
      );
      return;
    }
    const payload = sponsorFormToPayload(form, 'add');
    const dto: CreateMarathonSponsorDto = {
      event_id: eventId,
      company_name: payload.company_name,
      contact_person: payload.contact_person ?? undefined,
      contact_email: payload.contact_email ?? undefined,
      contact_phone: payload.contact_phone ?? undefined,
      website: payload.website ?? undefined,
      tier: payload.tier,
      amount_pledged: payload.amount_pledged,
      pipeline_stage: payload.pipeline_stage,
      notes: payload.notes,
    };
    createSponsor.mutate(dto, { onSuccess: onClose });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${sponsor?.company_name}` : 'Add Sponsor'}</DialogTitle>
          <DialogDescription className="sr-only">
            {isEdit ? 'Edit this sponsor.' : 'Add a sponsor to this event.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1">
            <Label className="text-xs">Company Name *</Label>
            <Input
              placeholder="Acme Corp"
              value={form.company_name}
              onChange={(e) => set('company_name', e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Tier</Label>
              <Select value={form.tier} onValueChange={(v) => set('tier', v as SponsorTier)}>
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
                value={form.pipeline_stage}
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
          <div className={isEdit ? 'grid grid-cols-2 gap-3' : ''}>
            <div className="space-y-1">
              <Label className="text-xs">Amount Pledged (₹)</Label>
              <Input
                type="number"
                min={0}
                placeholder="0"
                value={form.amount_pledged}
                onChange={(e) => set('amount_pledged', e.target.value)}
              />
            </div>
            {/* Received is recorded after the fact, so it is an edit-only field. */}
            {isEdit && (
              <div className="space-y-1">
                <Label className="text-xs">Amount Received (₹)</Label>
                <Input
                  type="number"
                  min={0}
                  placeholder="0"
                  value={form.amount_received}
                  onChange={(e) => set('amount_received', e.target.value)}
                />
              </div>
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Contact Person</Label>
            <Input
              placeholder="John Doe"
              value={form.contact_person}
              onChange={(e) => set('contact_person', e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Email</Label>
              <Input
                type="email"
                placeholder="john@acme.com"
                value={form.contact_email}
                onChange={(e) => set('contact_email', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Phone</Label>
              <Input
                placeholder="+91 98765 43210"
                value={form.contact_phone}
                onChange={(e) => set('contact_phone', e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Website</Label>
            <Input
              placeholder="https://acme.com"
              value={form.website}
              onChange={(e) => set('website', e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Notes</Label>
            <Textarea
              rows={3}
              maxLength={4000}
              placeholder="Anything to share about this sponsor — what was agreed, banner / stall details, follow-ups…"
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={pending || !form.company_name.trim()}>
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {isEdit ? 'Save Changes' : 'Add Sponsor'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type StageFilter = 'all' | SponsorPipelineStage;

export function SponsorsBoard({ eventId, canManage = true }: { eventId: string; canManage?: boolean }) {
  const [addOpen, setAddOpenState] = useState(false);
  // Bumped on every open so the add dialog remounts with a blank form.
  const [addCount, setAddCount] = useState(0);
  const setAddOpen = (open: boolean) => {
    if (open) setAddCount((n) => n + 1);
    setAddOpenState(open);
  };
  const [editing, setEditing] = useState<MarathonSponsor | null>(null);
  const [stageFilter, setStageFilter] = useState<StageFilter>('all');
  const { data: sponsors, isLoading, error } = useEventSponsors(eventId);

  const countByStage = useMemo(() => {
    const m = new Map<SponsorPipelineStage, number>();
    for (const s of sponsors ?? []) m.set(s.pipeline_stage, (m.get(s.pipeline_stage) ?? 0) + 1);
    return m;
  }, [sponsors]);

  const visible = useMemo(
    () =>
      stageFilter === 'all'
        ? (sponsors ?? [])
        : (sponsors ?? []).filter((s) => s.pipeline_stage === stageFilter),
    [sponsors, stageFilter]
  );

  const chipClass = (active: boolean) =>
    `flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors ${
      active
        ? 'border-emerald-500 bg-emerald-50/60 text-foreground dark:bg-emerald-950/40'
        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
    }`;

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

      <SponsorshipNotesCard eventId={eventId} canManage={canManage} />

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
      {error && (
        <div className="py-12 text-center text-destructive">Failed to load sponsors. Please try again.</div>
      )}

      {!isLoading && !error && (
        <>
          {/* Stage filter chips — wrap instead of the old sideways-scrolling Kanban. */}
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by pipeline stage">
            <button
              type="button"
              aria-pressed={stageFilter === 'all'}
              onClick={() => setStageFilter('all')}
              className={chipClass(stageFilter === 'all')}
            >
              All
              <Badge variant="secondary" className="px-1.5 py-0 text-[10px] tabular-nums">
                {(sponsors ?? []).length}
              </Badge>
            </button>
            {PIPELINE_STAGES.map((s) => (
              <button
                key={s.key}
                type="button"
                aria-pressed={stageFilter === s.key}
                onClick={() => setStageFilter(s.key)}
                className={chipClass(stageFilter === s.key)}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                {s.label}
                <Badge variant="secondary" className="px-1.5 py-0 text-[10px] tabular-nums">
                  {countByStage.get(s.key) ?? 0}
                </Badge>
              </button>
            ))}
          </div>

          {visible.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
                <Handshake className="h-8 w-8 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">
                    {stageFilter === 'all'
                      ? 'No sponsors yet'
                      : `No sponsors in "${PIPELINE_STAGES.find((s) => s.key === stageFilter)?.label}"`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {stageFilter === 'all'
                      ? 'Add your first sponsor to start tracking the pipeline.'
                      : 'Move a sponsor into this stage or pick another filter.'}
                  </p>
                </div>
                {canManage && stageFilter === 'all' && (
                  <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
                    <Plus className="mr-1 h-4 w-4" />
                    Add Sponsor
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((s) => (
                <SponsorCard
                  key={s.id}
                  sponsor={s}
                  canManage={canManage}
                  showStage={stageFilter === 'all'}
                  onEdit={setEditing}
                />
              ))}
            </div>
          )}
        </>
      )}

      <SponsorFormDialog
        key={`add-${addCount}`}
        open={addOpen}
        onClose={() => setAddOpen(false)}
        eventId={eventId}
      />
      <SponsorFormDialog
        key={`edit-${editing?.id ?? 'none'}`}
        open={!!editing}
        onClose={() => setEditing(null)}
        eventId={eventId}
        sponsor={editing}
      />
    </div>
  );
}
