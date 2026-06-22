'use client';

// Sports Tournament — detail / manage page (Sports Tournament PR2).
// Shows the tournament header + divisions, and per division the registered
// entries with organizer actions (mark paid, payment link, withdraw) and an
// "Add Entry" dialog. Reachable from the tournament list (dynamic [id] route —
// reachability-exempt by design).
// Created: 2026-06-22 (Sports Tournament PR2).

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
  ExternalLink,
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { useTournament, useUpdateTournament } from '@/hooks/events/use-tournaments';
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

export default function TournamentManagePage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id ?? '');

  const { data: tournament, isLoading: loadingT } = useTournament(id);
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

  const divisions = tournament?.divisions ?? [];
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

  return (
    <ContentLayout title={tournament.name}>
      <PageBreadcrumb
        items={[
          { label: 'Events', href: '/events' },
          { label: 'Tournaments', href: '/events/tournament' },
          { label: tournament.name },
        ]}
      />

      {/* Header */}
      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-lg bg-emerald-50 p-2">
              <Trophy className="h-5 w-5 text-emerald-600" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold leading-tight">{tournament.name}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {tournament.start_date && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {format(new Date(tournament.start_date), 'd MMM yyyy')}
                  </span>
                )}
                {(tournament.venue || tournament.venue_text) && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {tournament.venue || tournament.venue_text}
                  </span>
                )}
                {tournament.scope === 'all_jkkn' && (
                  <span className="flex items-center gap-1">
                    <Globe className="h-3 w-3" /> All JKKN
                  </span>
                )}
                <Badge variant="outline" className="text-[10px] uppercase">
                  {tournament.status}
                </Badge>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="publish-toggle" className="text-xs text-muted-foreground">
                  Show to public
                </Label>
                <Switch
                  id="publish-toggle"
                  checked={!!(tournament.config as Record<string, unknown>)?.public_scoreboard}
                  disabled={updateTournament.isPending}
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
              <Button
                size="sm"
                variant="outline"
                disabled={!(tournament.config as Record<string, unknown>)?.public_scoreboard}
                onClick={() => window.open(`/p/tournament/${id}`, '_blank', 'noopener')}
                title={
                  (tournament.config as Record<string, unknown>)?.public_scoreboard
                    ? 'Open the public no-login scoreboard'
                    : 'Turn on "Show to public" first'
                }
              >
                <ExternalLink className="mr-1 h-3.5 w-3.5" /> Public scoreboard
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Divisions + entries */}
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
                  <CardTitle className="flex items-center gap-2 text-base">
                    {isTeam ? <Users className="h-4 w-4" /> : <User className="h-4 w-4" />}
                    {divisionLabel(d)}
                    <span className="text-xs font-normal text-muted-foreground">
                      ({list.length} {list.length === 1 ? 'entry' : 'entries'})
                    </span>
                  </CardTitle>
                  <Button
                    size="sm"
                    onClick={() => {
                      setDialogDivision(d.id);
                      setDialogOpen(true);
                    }}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" /> Add Entry
                  </Button>
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
                            {e.payment_status === 'pending' && (
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
                            {e.status !== 'withdrawn' && (
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

                  {/* PR3: fixtures/bracket for this division */}
                  <DivisionFixtures
                    eventId={id}
                    divisionId={d.id}
                    matches={matchesByDivision.get(d.id) ?? []}
                    entryCount={list.filter((e) => e.status !== 'withdrawn').length}
                  />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

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
