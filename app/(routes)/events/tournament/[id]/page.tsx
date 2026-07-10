'use client';

// Sports Tournament — detail / manage page (Sports Tournament PR2; UI overhaul 2026-07).
// Data-dense dashboard layout: identity header (status lifecycle control, publish
// toggle, share actions), KPI stat-tile row, two small charts (entries per
// division — single-hue bars; payment mix — stacked status bar, palette
// CVD-validated for light+dark), then per-division entry management with
// organizer actions (mark paid, payment link, withdraw), fixtures and shared
// event logistics. Reachable from the tournament list (dynamic [id] route —
// reachability-exempt by design).

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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
  Trophy,
  Calendar,
  MapPin,
  Users,
  User,
  CheckCircle2,
  CreditCard,
  XCircle,
  Globe,
  Building2,
  ExternalLink,
  Copy,
  Layers,
  Swords,
  Wallet,
  AlertCircle,
  ShieldCheck,
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import {
  useTournament,
  useUpdateTournament,
  useUpdateTournamentStatus,
} from '@/hooks/events/use-tournaments';
import type { EventStatus } from '@/types/events';
import { EVENT_STATUS_TRANSITIONS } from '@/types/events';
import {
  useTournamentEntries,
  useMarkEntryPaid,
  useWithdrawEntry,
  useGeneratePaymentLink,
} from '@/hooks/events/use-tournament-registrations';
import { useTournamentMatches } from '@/hooks/events/use-tournament-fixtures';
import { TEAM_SPORTS } from '@/types/health-sports';
import type { TournamentDivision, TournamentEntry, TournamentMatch } from '@/types/tournament';
import { AddEntryDialog } from './_components/add-entry-dialog';
import { DivisionFixtures } from './_components/fixtures-section';
import { InchargePanel } from './_components/incharge-panel';
import { EventLogistics } from '@/components/events/shared/event-logistics';
import { useTournamentAccess } from '@/hooks/events/use-tournament-access';

function divisionLabel(d: TournamentDivision): string {
  return [d.sport, d.age_band, d.gender && d.gender !== 'open' ? d.gender : null]
    .filter(Boolean)
    .join(' · ');
}

function PaymentBadge({ entry }: { entry: TournamentEntry }) {
  const s = entry.payment_status;
  if (s === 'paid') return <Badge className="bg-emerald-100 text-emerald-700">Paid</Badge>;
  if (s === 'refunded') return <Badge className="bg-gray-100 text-gray-600">Refunded</Badge>;
  if (s === 'pending') return <Badge className="bg-red-100 text-red-700">Unpaid</Badge>;
  if (s === 'not_required') return <Badge variant="outline" className="text-muted-foreground">No fee</Badge>;
  if (s === 'waived') return <Badge className="bg-blue-50 text-blue-700">Waived</Badge>;
  return <Badge variant="outline">—</Badge>;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    registered: 'bg-blue-50 text-blue-700',
    confirmed: 'bg-emerald-50 text-emerald-700',
    withdrawn: 'bg-gray-100 text-gray-500',
    disqualified: 'bg-red-50 text-red-700',
  };
  return <Badge className={map[status] ?? 'bg-gray-100 text-gray-600'}>{status}</Badge>;
}

const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  draft: 'Draft',
  planning: 'Planning',
  preparation: 'Preparation',
  execution: 'Execution',
  live: 'Live',
  post_event: 'Post Event',
  archived: 'Archived',
  cancelled: 'Cancelled',
};

/** Status badge + transition dropdown (mirror of marathon's EventStatusControl). */
function TournamentStatusControl({
  eventId,
  status,
  canManage,
}: {
  eventId: string;
  status: EventStatus;
  canManage: boolean;
}) {
  const updateStatus = useUpdateTournamentStatus();
  const allowedTransitions = canManage ? EVENT_STATUS_TRANSITIONS[status] ?? [] : [];

  return (
    <div className="flex items-center gap-2">
      <Badge variant="outline" className="text-[10px] uppercase">
        {EVENT_STATUS_LABELS[status] ?? status}
        {status === 'live' && (
          <span className="ml-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
        )}
      </Badge>
      {allowedTransitions.length > 0 && (
        <Select
          onValueChange={(newStatus) =>
            updateStatus.mutate({ id: eventId, status: newStatus as EventStatus })
          }
          disabled={updateStatus.isPending}
        >
          <SelectTrigger className="h-7 w-[140px] text-xs">
            <SelectValue placeholder="Change status…" />
          </SelectTrigger>
          <SelectContent>
            {allowedTransitions.map((s) => (
              <SelectItem key={s} value={s}>
                → {EVENT_STATUS_LABELS[s] ?? s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

// ─── KPI stat tile (dataviz: stat tile > one-bar chart for headline numbers) ───

function StatTile({
  icon: Icon,
  label,
  value,
  sub,
  subTone = 'muted',
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  subTone?: 'muted' | 'good' | 'critical';
}) {
  const subClass =
    subTone === 'good'
      ? 'text-emerald-700 dark:text-emerald-400'
      : subTone === 'critical'
        ? 'text-red-700 dark:text-red-400'
        : 'text-muted-foreground';
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <div className="mt-0.5 rounded-lg bg-emerald-50 p-2 dark:bg-emerald-950/50">
          <Icon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold leading-tight tabular-nums">{value}</p>
          {sub && <p className={`mt-0.5 truncate text-xs ${subClass}`}>{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Charts (inline CSS bars; palettes validated for light+dark, CVD-safe) ────

/** Payment mix stacked-bar segments. Colors from the validated status set:
 *  paid #0ca30c (good) · waived #2a78d6/#3987e5 (blue) · unpaid #d03b3b (critical);
 *  refunded/no-fee render as a neutral remainder (identity via legend, not hue). */
const PAYMENT_SEGMENTS = [
  {
    key: 'paid',
    label: 'Paid',
    icon: CheckCircle2,
    bar: 'bg-[#0ca30c]',
    dot: 'text-[#0ca30c]',
  },
  {
    key: 'waived',
    label: 'Waived',
    icon: CreditCard,
    bar: 'bg-[#2a78d6] dark:bg-[#3987e5]',
    dot: 'text-[#2a78d6] dark:text-[#3987e5]',
  },
  {
    key: 'pending',
    label: 'Unpaid',
    icon: AlertCircle,
    bar: 'bg-[#d03b3b]',
    dot: 'text-[#d03b3b]',
  },
  {
    key: 'neutral',
    label: 'No fee / refunded',
    icon: XCircle,
    bar: 'bg-muted-foreground/25',
    dot: 'text-muted-foreground',
  },
] as const;

function PaymentMixChart({ counts }: { counts: Record<string, number> }) {
  const total = PAYMENT_SEGMENTS.reduce((s, seg) => s + (counts[seg.key] ?? 0), 0);
  if (total === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No entries yet.</p>;
  }
  const visible = PAYMENT_SEGMENTS.filter((seg) => (counts[seg.key] ?? 0) > 0);
  return (
    <div>
      {/* 2px surface gaps between segments (mark spec) */}
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full" role="img"
        aria-label={visible.map((s) => `${s.label}: ${counts[s.key]}`).join(', ')}>
        {visible.map((seg) => (
          <div
            key={seg.key}
            className={`${seg.bar} h-full rounded-[2px]`}
            style={{ width: `${((counts[seg.key] ?? 0) / total) * 100}%` }}
            title={`${seg.label}: ${counts[seg.key]}`}
          />
        ))}
      </div>
      {/* Legend: icon + label + count — meaning never carried by color alone */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {visible.map((seg) => (
          <span key={seg.key} className="flex items-center gap-1.5 text-xs">
            <seg.icon className={`h-3.5 w-3.5 ${seg.dot}`} />
            <span className="text-muted-foreground">{seg.label}</span>
            <span className="font-medium tabular-nums">{counts[seg.key]}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Entries per division — horizontal bars, single sequential hue, direct labels. */
function DivisionEntriesChart({
  rows,
}: {
  rows: { id: string; label: string; count: number }[];
}) {
  const max = Math.max(...rows.map((r) => r.count), 1);
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No divisions yet.</p>;
  }
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.id} title={`${r.label}: ${r.count} entries`}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
            <span className="truncate text-muted-foreground">{r.label}</span>
            <span className="font-medium tabular-nums">{r.count}</span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-emerald-600 dark:bg-emerald-500"
              style={{ width: `${(r.count / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TournamentManagePage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id ?? '');

  const { data: tournament, isLoading: loadingT } = useTournament(id);
  // Access model: manage-permission holders and this tournament's in-charges get
  // full control; committee members view everything and edit only their tasks.
  const access = useTournamentAccess(id, tournament);
  const canManage = access.canManage;
  const updateTournament = useUpdateTournament();
  const { data: entries = [], isLoading: loadingE } = useTournamentEntries(id);
  const { data: matches = [] } = useTournamentMatches(id);
  const markPaid = useMarkEntryPaid(id);
  const withdraw = useWithdrawEntry(id);
  const payLink = useGeneratePaymentLink(id);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogDivision, setDialogDivision] = useState<string | undefined>(undefined);

  // Surface gateway callback outcome (?payment=success|failed|error). Read from
  // window.location (client-only) to avoid the useSearchParams Suspense requirement.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const p = new URLSearchParams(window.location.search).get('payment');
    if (!p) return;
    if (p === 'success') toast.success('Payment received — entry marked paid.');
    else if (p === 'failed') toast.error('Payment failed or was cancelled.');
    else if (p === 'error') toast.error('Payment could not be verified.');
    router.replace(`/events/tournament/${id}`);
  }, [id, router]);

  const divisions = useMemo(() => tournament?.divisions ?? [], [tournament?.divisions]);
  const entriesByDivision = useMemo(() => {
    const m = new Map<string, TournamentEntry[]>();
    for (const e of entries) {
      const arr = m.get(e.division_id) ?? [];
      arr.push(e);
      m.set(e.division_id, arr);
    }
    return m;
  }, [entries]);
  const matchesByDivision = useMemo(() => {
    const m = new Map<string, TournamentMatch[]>();
    for (const x of matches) {
      const arr = m.get(x.division_id) ?? [];
      arr.push(x);
      m.set(x.division_id, arr);
    }
    return m;
  }, [matches]);

  // KPI + chart data — computed over ACTIVE (non-withdrawn) entries so the
  // headline numbers match who is actually competing.
  const stats = useMemo(() => {
    const active = entries.filter((e) => e.status !== 'withdrawn');
    const payment = { paid: 0, waived: 0, pending: 0, neutral: 0 } as Record<string, number>;
    for (const e of active) {
      if (e.payment_status === 'paid') payment.paid++;
      else if (e.payment_status === 'waived') payment.waived++;
      else if (e.payment_status === 'pending') payment.pending++;
      else payment.neutral++; // refunded / not_required / unknown
    }
    const decided: TournamentMatch['status'][] = ['completed', 'walkover', 'disqualified', 'bye'];
    const played = matches.filter((m) => decided.includes(m.status)).length;
    const divisionRows = divisions.map((d) => ({
      id: d.id,
      label: divisionLabel(d),
      count: (entriesByDivision.get(d.id) ?? []).filter((e) => e.status !== 'withdrawn').length,
    }));
    return { active: active.length, payment, played, totalMatches: matches.length, divisionRows };
  }, [entries, matches, divisions, entriesByDivision]);

  if (loadingT) {
    return (
      <ContentLayout title="Tournament">
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </ContentLayout>
    );
  }

  if (!tournament) {
    return (
      <ContentLayout title="Tournament">
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Tournament not found, or you don&apos;t have access to it.
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  const publicOn = !!(tournament.config as Record<string, unknown>)?.public_scoreboard;

  return (
    <ContentLayout title={tournament.name}>
      <PageBreadcrumb
        items={[
          { label: 'Events', href: '/events' },
          { label: 'Tournaments', href: '/events/tournament' },
          { label: tournament.name },
        ]}
      />

      {/* ── Identity header ─────────────────────────────────────────────── */}
      <Card className="mb-4 overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-500/40" />
        <CardContent className="p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="mt-0.5 shrink-0 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 p-2.5 shadow-sm">
                <Trophy className="h-6 w-6 text-white" />
              </div>
              <div className="min-w-0">
                <h2 className="text-xl font-bold leading-tight tracking-tight">
                  {tournament.name}
                </h2>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {tournament.start_date && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(tournament.start_date), 'd MMM yyyy')}
                      {tournament.end_date &&
                        tournament.end_date !== tournament.start_date &&
                        ` – ${format(new Date(tournament.end_date), 'd MMM yyyy')}`}
                    </span>
                  )}
                  {(tournament.venue || tournament.venue_text) && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {tournament.venue || tournament.venue_text}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    {tournament.scope === 'all_jkkn' ? (
                      <>
                        <Globe className="h-3 w-3" /> All JKKN
                      </>
                    ) : (
                      <>
                        <Building2 className="h-3 w-3" /> Institution
                      </>
                    )}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <TournamentStatusControl
                    eventId={id}
                    status={tournament.status as EventStatus}
                    canManage={canManage}
                  />
                  {access.isIncharge && (
                    <Badge
                      variant="outline"
                      className="gap-1 border-emerald-300 text-[10px] dark:border-emerald-800"
                    >
                      <ShieldCheck className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                      You are in-charge
                    </Badge>
                  )}
                  {access.isTaskOnly && (
                    <Badge variant="outline" className="text-[10px]">
                      Committee member — view only, tasks editable
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Actions: publish + share */}
            <div className="flex shrink-0 flex-col items-start gap-2 lg:items-end">
              <div className="flex items-center gap-2">
                <Label htmlFor="publish-toggle" className="text-xs text-muted-foreground">
                  Show to public
                </Label>
                <Switch
                  id="publish-toggle"
                  checked={publicOn}
                  disabled={!canManage || updateTournament.isPending}
                  onCheckedChange={(v) =>
                    updateTournament.mutate({
                      id,
                      dto: {
                        config: {
                          ...((tournament.config as Record<string, unknown>) ?? {}),
                          public_scoreboard: v,
                        },
                      },
                    })
                  }
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!canManage}
                  onClick={() => {
                    const url = `${window.location.origin}/p/tournament/${id}/register`;
                    if (navigator.clipboard?.writeText) {
                      navigator.clipboard.writeText(url).then(
                        () => toast.success('Registration link copied'),
                        () => toast.error('Could not copy — copy it manually: ' + url)
                      );
                    } else {
                      toast('Registration link: ' + url, { duration: 8000 });
                    }
                  }}
                  title="Copy the public self-service registration link to share"
                >
                  <Copy className="mr-1 h-3.5 w-3.5" /> Copy registration link
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!publicOn}
                  onClick={() => window.open(`/p/tournament/${id}`, '_blank', 'noopener')}
                  title={
                    publicOn
                      ? 'Open the public no-login scoreboard'
                      : 'Turn on "Show to public" first'
                  }
                >
                  <ExternalLink className="mr-1 h-3.5 w-3.5" /> Public scoreboard
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── In-charge assignment ────────────────────────────────────────── */}
      <InchargePanel
        eventId={id}
        tournament={tournament}
        canAssign={access.canAssignIncharge}
      />

      {/* ── KPI row ─────────────────────────────────────────────────────── */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={Layers} label="Divisions" value={String(divisions.length)} />
        <StatTile
          icon={Users}
          label="Active Entries"
          value={String(stats.active)}
          sub={
            entries.length > stats.active
              ? `${entries.length - stats.active} withdrawn`
              : undefined
          }
        />
        <StatTile
          icon={Wallet}
          label="Payments"
          value={`${stats.payment.paid} paid`}
          sub={stats.payment.pending > 0 ? `${stats.payment.pending} unpaid` : 'No dues pending'}
          subTone={stats.payment.pending > 0 ? 'critical' : 'good'}
        />
        <StatTile
          icon={Swords}
          label="Matches Decided"
          value={`${stats.played}/${stats.totalMatches}`}
          sub={
            stats.totalMatches > 0
              ? `${Math.round((stats.played / stats.totalMatches) * 100)}% complete`
              : 'No fixtures yet'
          }
        />
      </div>

      {/* ── Overview charts ─────────────────────────────────────────────── */}
      <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Entries by Division</CardTitle>
          </CardHeader>
          <CardContent>
            <DivisionEntriesChart rows={stats.divisionRows} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Payment Status</CardTitle>
          </CardHeader>
          <CardContent>
            <PaymentMixChart counts={stats.payment} />
          </CardContent>
        </Card>
      </div>

      {/* ── Divisions + entries ─────────────────────────────────────────── */}
      {divisions.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No divisions yet. Add divisions from the tournament edit screen, then register entries here.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {divisions.map((d) => {
            const isTeam = (TEAM_SPORTS as readonly string[]).includes(d.sport);
            const list = entriesByDivision.get(d.id) ?? [];
            return (
              <Card key={d.id}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="flex min-w-0 items-center gap-2 text-base">
                    <span className="rounded-md bg-emerald-50 p-1.5 dark:bg-emerald-950/50">
                      {isTeam ? (
                        <Users className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <User className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      )}
                    </span>
                    <span className="truncate">{divisionLabel(d)}</span>
                    <Badge variant="secondary" className="shrink-0 text-[10px] font-normal tabular-nums">
                      {list.length} {list.length === 1 ? 'entry' : 'entries'}
                    </Badge>
                    <Badge variant="outline" className="hidden shrink-0 text-[10px] uppercase sm:inline-flex">
                      {d.format.replace('_', ' ')}
                    </Badge>
                  </CardTitle>
                  {canManage && (
                    <Button
                      size="sm"
                      onClick={() => {
                        setDialogDivision(d.id);
                        setDialogOpen(true);
                      }}
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" /> Add Entry
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="pt-0">
                  {loadingE ? (
                    <div className="py-6 text-center">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : list.length === 0 ? (
                    <p className="py-4 text-sm text-muted-foreground">No entries yet.</p>
                  ) : (
                    <div className="divide-y">
                      {list.map((e) => (
                        <div key={e.id} className="flex flex-wrap items-center gap-2 py-2.5">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate font-medium">{e.entry_name}</span>
                              {e.is_external && (
                                <Badge variant="outline" className="text-[10px]">External</Badge>
                              )}
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              {e.institution_name && <span>{e.institution_name}</span>}
                              {typeof e.seed === 'number' && <span>Seed {e.seed}</span>}
                            </div>
                          </div>
                          <StatusBadge status={e.status} />
                          <PaymentBadge entry={e} />
                          <div className="flex items-center gap-1">
                            {canManage && e.payment_status === 'pending' && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => payLink.mutate(e.id)}
                                  disabled={payLink.isPending}
                                  title="Generate online payment link"
                                >
                                  <CreditCard className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => markPaid.mutate({ entryId: e.id })}
                                  disabled={markPaid.isPending}
                                  title="Mark paid (offline)"
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}
                            {canManage && e.status !== 'withdrawn' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => withdraw.mutate(e.id)}
                                disabled={withdraw.isPending}
                                title="Withdraw entry"
                              >
                                <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* PR3: fixtures/bracket for this division. Read-only for
                      committee members — the API rejects their writes anyway. */}
                  <DivisionFixtures
                    eventId={id}
                    divisionId={d.id}
                    matches={matchesByDivision.get(d.id) ?? []}
                    entryCount={list.filter((e) => e.status !== 'withdrawn').length}
                    divisionFormat={d.format}
                    canManage={canManage}
                  />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Shared event logistics (sponsors, …) — promoted from Marathon so tournaments inherit them.
          Committee members see every board read-only; task checkboxes stay live for them
          (CommitteesBoard keeps its own task controls behind canManage=false → read-only, and
          the committees API is the write path for tasks). */}
      <EventLogistics
        eventId={id}
        eventType="sports_tournament"
        canManage={canManage}
        canEditTasks={canManage || access.isTaskOnly}
      />

      <AddEntryDialog
        eventId={id}
        divisions={divisions}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        defaultDivisionId={dialogDivision}
      />
    </ContentLayout>
  );
}
