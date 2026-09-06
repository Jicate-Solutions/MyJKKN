'use client';

// Sports Tournament — detail / manage page (Sports Tournament PR2; UI overhaul 2026-07).
// Data-dense dashboard layout: identity header (status lifecycle control, publish
// toggle, share actions), KPI stat-tile row, two small charts (entries per
// division — single-hue bars; payment mix — stacked status bar, palette
// CVD-validated for light+dark), then shared event logistics. Reachable from the
// tournament list (dynamic [id] route — reachability-exempt by design).
//
// 2026-07-28: the per-division cards were removed at the organizer's request.
// Entry rows and their actions (mark paid, payment link, withdraw) plus the entry
// fee moved to the Event Logistics "Registrations" tab. The FIXTURES/bracket UI
// went with the cards and now has no entry point — _components/fixtures-section
// .tsx and mobile-score-sheet.tsx are intact but unreferenced, so a future
// "Fixtures" tab can mount DivisionFixtures again without rewriting it.

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
  Trophy,
  Calendar,
  MapPin,
  Users,
  CheckCircle2,
  CreditCard,
  XCircle,
  Globe,
  Building2,
  ExternalLink,
  Copy,
  Pencil,
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
import {
  TOURNAMENT_ACTIVE_STATUS,
  isTournamentActive,
  tournamentStatusLabel,
} from '@/types/tournament';
import { useTournamentEntries } from '@/hooks/events/use-tournament-registrations';
import { useTournamentMatches } from '@/hooks/events/use-tournament-fixtures';
import type { TournamentDivision, TournamentEntry, TournamentMatch } from '@/types/tournament';
import { InchargePanel } from './_components/incharge-panel';
import { RegistrationFormCard } from './_components/registration-form-card';
import { EventFeedbackLinkCard } from '@/components/events/feedback/event-feedback-link-card';
// Reuses the list page's dialog — one editor, so the two entry points can't drift.
import { EditTournamentDialog } from '../_components/edit-tournament-dialog';
import { NaacCriteriaChips } from '@/components/events/shared/naac-criteria-field';
import { EventLogistics } from '@/components/events/shared/event-logistics';
import { useTournamentAccess } from '@/hooks/events/use-tournament-access';

function divisionLabel(d: TournamentDivision): string {
  return [d.sport, d.age_band, d.gender && d.gender !== 'open' ? d.gender : null]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Draft <-> Active. Tournaments run a 2-state model (see TOURNAMENT_STATUS_* in
 * types/tournament.ts): Draft closes public registration, Active opens it. The
 * shared 8-state event lifecycle is never offered here.
 */
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
  const active = isTournamentActive(status);
  const target: EventStatus = active ? 'draft' : TOURNAMENT_ACTIVE_STATUS;

  return (
    <div className="flex items-center gap-2">
      <Badge
        variant="outline"
        className={`text-[10px] uppercase ${
          active ? 'border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400' : ''
        }`}
      >
        {tournamentStatusLabel(status)}
        {active && (
          <span className="ml-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
        )}
      </Badge>
      {canManage && (
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          disabled={updateStatus.isPending}
          onClick={() => updateStatus.mutate({ id: eventId, status: target })}
          title={
            active
              ? 'Close public registration and hide this tournament from learners'
              : 'Open this tournament for public registration'
          }
        >
          {updateStatus.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
          {active ? 'Move to Draft' : 'Make Active'}
        </Button>
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
  // `entries` still feeds the per-division entry COUNT and the fixtures'
  // entryCount. The per-entry rows — and the mark-paid / payment-link / withdraw
  // actions that hung off them — moved to the Event Logistics Registrations tab,
  // which listed the same people from events_registrations.
  const { data: entries = [] } = useTournamentEntries(id);
  const { data: matches = [] } = useTournamentMatches(id);

  const [editOpen, setEditOpen] = useState(false);

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

  if (loadingT || access.isLoading) {
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

  // PER-EVENT authorization (2026-07-21). RoutePermissionGuard's fallbackCheck admits
  // anyone holding a role on ANY tournament (fn_has_any_tournament_role), so entering
  // the subtree does NOT imply access to THIS tournament. access.canView was computed
  // for exactly this but never enforced — so an in-charge of tournament A could open
  // tournament B and read its EventLogistics (sponsors ₹, budget, committees,
  // incidents) and every entrant's payment status, all rendered read-only but visible.
  // RLS does not cover this: event_sponsors / event_budget_items are readable far more
  // broadly than the tournament access model implies.
  if (!access.canView) {
    return (
      <ContentLayout title="Tournament">
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            You don&apos;t have access to this tournament. Ask a sports coordinator to add
            you as an in-charge or committee member.
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
                  {/* NAAC evidence tags (events.naac_criteria) — set via the
                      Edit dialog; the evidence emitter picks these up once the
                      tournament completes. */}
                  <NaacCriteriaChips codes={tournament.naac_criteria ?? []} />
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
                {canManage && (
                  <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
                    <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                  </Button>
                )}
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

      {/* ── Registration form (builder lives on its own page) ─────────────── */}
      <RegistrationFormCard eventId={id} canManage={canManage} />

      {/* ── Post-tournament feedback ──────────────────────────────────────
          Links to /events/<id>/feedback, the one feedback console shared by
          every event type — a tournament's feedback is not shaped differently
          from a seminar's, so it gets no console of its own. */}
      <div className="mb-4">
        <EventFeedbackLinkCard eventId={id} />
      </div>

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

      {/* onSaved is a no-op: useUpdateTournament/useUpdateDivision already
          invalidate this page's detail query. */}
      <EditTournamentDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        tournament={tournament}
        onSaved={() => {}}
      />
    </ContentLayout>
  );
}
