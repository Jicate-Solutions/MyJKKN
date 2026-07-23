// app/p/tournament/[id]/page.tsx
// PUBLIC no-login tournament scoreboard (Sports Tournament PR4, Director decision #6).
// Lives OUTSIDE the (routes) auth group, so no login is required. Reads ONLY the
// safe, PII-free fn_tournament_public_scoreboard RPC (explicitly GRANTed to anon)
// via the anon client — never touches events_registrations.
// Created: 2026-06-22 (Sports Tournament PR4).

import type { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import { Trophy, Calendar, MapPin } from 'lucide-react';
import type { PublicScoreboard } from '@/types/tournament';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Tournament Scoreboard · JKKN',
    description: 'Live tournament fixtures, scores and standings.',
    robots: { index: false, follow: false },
  };
}

async function loadScoreboard(eventId: string): Promise<PublicScoreboard | null> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  const { data, error } = await supabase.rpc('fn_tournament_public_scoreboard', {
    p_event_id: eventId,
  });
  if (error || !data) return null;
  return data as PublicScoreboard;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function statusClass(s: string): string {
  return (
    {
      completed: 'bg-emerald-100 text-emerald-700',
      walkover: 'bg-amber-100 text-amber-700',
      disqualified: 'bg-red-100 text-red-700',
      scheduled: 'bg-blue-50 text-blue-700',
      bye: 'bg-violet-50 text-violet-700',
      pending: 'bg-gray-100 text-gray-500',
    }[s] ?? 'bg-gray-100 text-gray-500'
  );
}

function divisionTitle(d: PublicScoreboard['divisions'][number]): string {
  return [d.sport, d.age_band, d.gender && d.gender !== 'open' ? d.gender : null]
    .filter(Boolean)
    .join(' · ');
}

export default async function PublicScoreboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ payment?: string }>;
}) {
  const { id } = await params;
  const { payment } = await searchParams;
  const sb = UUID_RE.test(id) ? await loadScoreboard(id) : null;

  const paymentBanner = payment ? (
    payment === 'success' ? (
      <div className="mb-6 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
        Payment received — your registration is confirmed.
      </div>
    ) : payment === 'failed' ? (
      <div className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
        Payment failed or was cancelled. Please try registering again.
      </div>
    ) : (
      <div className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
        We could not verify your payment. Please contact the organizers if you were charged.
      </div>
    )
  ) : null;

  if (!sb) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 text-center">
        {paymentBanner}
        <Trophy className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
        <h1 className="text-xl font-semibold">
          {payment ? 'Registration received' : 'Scoreboard not available'}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {payment
            ? "The live scoreboard for this tournament isn't public yet — check back once fixtures are published."
            : 'This tournament is private or does not exist.'}
        </p>
      </main>
    );
  }

  const fmt = (d: string | null) =>
    d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      {paymentBanner}
      {/* Header */}
      <header className="mb-6 rounded-xl border bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-emerald-50 p-2.5">
            <Trophy className="h-6 w-6 text-emerald-600" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold leading-tight">{sb.tournament.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {sb.tournament.start_date && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  {fmt(sb.tournament.start_date)}
                  {sb.tournament.end_date ? ` – ${fmt(sb.tournament.end_date)}` : ''}
                </span>
              )}
              {(sb.tournament.venue || sb.tournament.venue_text) && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {sb.tournament.venue || sb.tournament.venue_text}
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Per division: standings + fixtures */}
      <div className="space-y-6">
        {sb.divisions.map((d) => {
          const matches = sb.matches.filter((m) => m.division_id === d.id);
          const standings = sb.standings
            .filter((s) => s.division_id === d.id)
            .sort((a, b) => b.points - a.points || b.won - a.won);
          const showStandings =
            d.format === 'round_robin' || d.format === 'league' || d.format === 'pools_ko';
          const byRound = new Map<number, typeof matches>();
          for (const m of matches) {
            const arr = byRound.get(m.round_no) ?? [];
            arr.push(m);
            byRound.set(m.round_no, arr);
          }
          return (
            <section key={d.id} className="rounded-xl border bg-white shadow-sm">
              <div className="border-b px-5 py-3">
                <h2 className="font-semibold">{divisionTitle(d)}</h2>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{d.format}</p>
              </div>

              <div className="p-5">
                {showStandings && standings.length > 0 && (
                  <div className="mb-4 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                          <th className="py-1.5 pr-2">#</th>
                          <th className="py-1.5 pr-2">Team</th>
                          <th className="py-1.5 px-2 text-center">P</th>
                          <th className="py-1.5 px-2 text-center">W</th>
                          <th className="py-1.5 px-2 text-center">L</th>
                          <th className="py-1.5 px-2 text-center">Pts</th>
                        </tr>
                      </thead>
                      <tbody>
                        {standings.map((s, i) => (
                          <tr key={s.entry_id} className="border-b last:border-0">
                            <td className="py-1.5 pr-2 text-muted-foreground">{i + 1}</td>
                            <td className="py-1.5 pr-2 font-medium">
                              {s.entry_name}
                              {s.institution_name && (
                                <span className="ml-1 text-xs font-normal text-muted-foreground">
                                  {s.institution_name}
                                </span>
                              )}
                            </td>
                            <td className="py-1.5 px-2 text-center">{s.played}</td>
                            <td className="py-1.5 px-2 text-center">{s.won}</td>
                            <td className="py-1.5 px-2 text-center">{s.lost}</td>
                            <td className="py-1.5 px-2 text-center font-semibold">{s.points}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {matches.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Fixtures not published yet.</p>
                ) : (
                  <div className="space-y-3">
                    {[...byRound.entries()]
                      .sort((a, b) => a[0] - b[0])
                      .map(([round, ms]) => (
                        <div key={round}>
                          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            {ms[0]?.round_label || `Round ${round}`}
                            {ms[0]?.pool ? ` · Pool ${ms[0].pool}` : ''}
                          </p>
                          <div className="divide-y">
                            {ms.map((m) => (
                              <div key={m.id} className="flex items-center gap-2 py-1.5 text-sm">
                                <span className="min-w-0 flex-1">
                                  <span className={m.winner_name === m.side_a_name ? 'font-semibold' : ''}>
                                    {m.side_a_name ?? <span className="text-muted-foreground">TBD / bye</span>}
                                  </span>
                                  {m.status === 'completed' && m.score_a != null && m.score_b != null && (
                                    <span className="px-1.5 font-mono text-xs">
                                      {m.score_a}–{m.score_b}
                                    </span>
                                  )}
                                  {!(m.status === 'completed' && m.score_a != null) && (
                                    <span className="px-1.5 text-xs text-muted-foreground">vs</span>
                                  )}
                                  <span className={m.winner_name === m.side_b_name ? 'font-semibold' : ''}>
                                    {m.side_b_name ?? <span className="text-muted-foreground">TBD / bye</span>}
                                  </span>
                                </span>
                                {m.scheduled_at && (
                                  <span className="text-[11px] text-muted-foreground">
                                    {new Date(m.scheduled_at).toLocaleString('en-IN', {
                                      day: 'numeric',
                                      month: 'short',
                                      hour: 'numeric',
                                      minute: '2-digit',
                                    })}
                                  </span>
                                )}
                                <span className={`rounded px-1.5 py-0.5 text-[10px] ${statusClass(m.status)}`}>
                                  {m.status}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <footer className="mt-8 text-center text-xs text-muted-foreground">
        JKKN Institutions · Live tournament scoreboard
      </footer>
    </main>
  );
}
