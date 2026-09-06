'use client';

// The celebratory no-login participant results experience: confetti on load,
// a player/team card with medal badges, the match journey, the standing, a
// shareable canvas card, and a link to the printable certificate.
// Section 3, Events/Tournament go-live. Learner terminology throughout.

import Link from 'next/link';
import { Award, Calendar, MapPin, Medal, Swords, Trophy, Share2, FileText } from 'lucide-react';
import ConfettiBurst from './confetti-burst';
import ShareCard from './share-card';
import type { ParticipantMatch, ParticipantResults } from '../types';

const MEDAL_META: Record<
  string,
  { label: string; ring: string; text: string; bg: string; emoji: string }
> = {
  gold: { label: 'Gold · Champions', ring: 'ring-yellow-400', text: 'text-yellow-700', bg: 'bg-yellow-50', emoji: '🥇' },
  silver: { label: 'Silver · Runners-up', ring: 'ring-gray-400', text: 'text-gray-700', bg: 'bg-gray-50', emoji: '🥈' },
  bronze: { label: 'Bronze · Third place', ring: 'ring-amber-500', text: 'text-amber-700', bg: 'bg-amber-50', emoji: '🥉' },
};

function fmtDate(d: string | null): string {
  return d
    ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';
}

function divisionTitle(d: ParticipantResults['division']): string {
  if (!d) return '';
  return [d.sport, d.age_band, d.gender && d.gender !== 'open' ? d.gender : null]
    .filter(Boolean)
    .join(' · ');
}

function MatchRow({ m }: { m: ParticipantMatch }) {
  const decided = m.status === 'completed' && m.my_score != null && m.opponent_score != null;
  const outcome = m.won ? 'W' : m.lost ? 'L' : null;
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          m.won
            ? 'bg-emerald-100 text-emerald-700'
            : m.lost
            ? 'bg-red-100 text-red-600'
            : 'bg-gray-100 text-gray-500'
        }`}
        aria-label={m.won ? 'Won' : m.lost ? 'Lost' : 'Upcoming'}
      >
        {outcome ?? '·'}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm">
          <span className="truncate font-medium">
            {m.opponent_name ? (
              <>vs {m.opponent_name}</>
            ) : (
              <span className="text-muted-foreground">Bye / to be decided</span>
            )}
          </span>
          {decided && (
            <span className="ml-auto shrink-0 font-mono text-sm font-semibold tabular-nums">
              {m.my_score}
              <span className="mx-0.5 text-muted-foreground">–</span>
              {m.opponent_score}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>{m.round_label || `Round ${m.round_no}`}</span>
          {m.pool && <span>· Pool {m.pool}</span>}
          {m.scheduled_at && (
            <span>
              ·{' '}
              {new Date(m.scheduled_at).toLocaleString('en-IN', {
                day: 'numeric',
                month: 'short',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </span>
          )}
          {!decided && m.status !== 'completed' && <span>· {m.status}</span>}
        </div>
      </div>
    </div>
  );
}

export default function ResultsExperience({
  data,
  code,
  eventId,
}: {
  data: ParticipantResults;
  code: string;
  eventId: string;
}) {
  const { entry, tournament, division, standing, matches } = data;
  const medal = entry.medal;
  const meta = medal ? MEDAL_META[medal] : null;
  const celebrate = !!medal || entry.final_rank != null;

  const certHref = `/p/tournament/${eventId}/results/certificate?code=${encodeURIComponent(code)}`;

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      {celebrate && <ConfettiBurst />}

      {/* Tournament header */}
      <header className="mb-5 rounded-xl border bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-emerald-50 p-2.5">
            <Trophy className="h-6 w-6 text-emerald-600" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold leading-tight">{tournament.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {tournament.start_date && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  {fmtDate(tournament.start_date)}
                  {tournament.end_date ? ` – ${fmtDate(tournament.end_date)}` : ''}
                </span>
              )}
              {(tournament.venue || tournament.venue_text) && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {tournament.venue || tournament.venue_text}
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Player / team card */}
      <section
        className={`mb-5 overflow-hidden rounded-2xl border shadow-sm ${
          meta ? `ring-2 ${meta.ring}` : ''
        }`}
      >
        <div className="bg-gradient-to-br from-emerald-700 to-emerald-900 px-6 py-7 text-center text-white">
          {meta ? (
            <>
              <div className="text-6xl" aria-hidden="true">
                {meta.emoji}
              </div>
              <div
                className={`mx-auto mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${meta.bg} ${meta.text}`}
              >
                <Medal className="h-3.5 w-3.5" />
                {meta.label}
              </div>
            </>
          ) : (
            <>
              <div className="text-5xl" aria-hidden="true">
                🏆
              </div>
              <div className="mx-auto mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                <Award className="h-3.5 w-3.5" />
                Participant
              </div>
            </>
          )}

          <h2 className="mt-3 text-2xl font-bold leading-tight">{entry.entry_name}</h2>
          {entry.institution_name && (
            <p className="mt-1 text-sm text-white/80">{entry.institution_name}</p>
          )}
          {division && (
            <p className="mt-1 text-sm font-medium text-yellow-300">{divisionTitle(division)}</p>
          )}
        </div>

        {/* Stat strip */}
        <div className="grid grid-cols-4 divide-x bg-white text-center">
          <div className="px-2 py-3">
            <div className="text-xl font-bold tabular-nums">
              {entry.final_rank ? `#${entry.final_rank}` : '—'}
            </div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Rank{data.division_entry_count > 0 ? ` / ${data.division_entry_count}` : ''}
            </div>
          </div>
          <div className="px-2 py-3">
            <div className="text-xl font-bold tabular-nums">{standing?.played ?? 0}</div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Played</div>
          </div>
          <div className="px-2 py-3">
            <div className="text-xl font-bold tabular-nums text-emerald-600">
              {standing?.won ?? 0}
            </div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Won</div>
          </div>
          <div className="px-2 py-3">
            <div className="text-xl font-bold tabular-nums">{standing?.points ?? 0}</div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Points</div>
          </div>
        </div>
      </section>

      {/* Certificate CTA */}
      <Link
        href={certHref}
        className="mb-5 flex items-center gap-3 rounded-xl border bg-white p-4 shadow-sm transition hover:border-emerald-300 hover:shadow"
      >
        <div className="rounded-lg bg-amber-50 p-2.5">
          <FileText className="h-5 w-5 text-amber-600" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {medal ? 'Get your winner certificate' : 'Get your participation certificate'}
          </p>
          <p className="text-sm text-muted-foreground">Printable · learner-ready · shareable</p>
        </div>
        <Award className="h-5 w-5 text-muted-foreground" />
      </Link>

      {/* The journey — matches */}
      <section className="mb-5 rounded-xl border bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b px-5 py-3">
          <Swords className="h-4 w-4 text-emerald-600" />
          <h3 className="font-semibold">The journey</h3>
          <span className="ml-auto text-xs text-muted-foreground">
            {matches.length} match{matches.length === 1 ? '' : 'es'}
          </span>
        </div>
        <div className="px-5 py-2">
          {matches.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              No matches recorded yet — check back once fixtures are played.
            </p>
          ) : (
            <div className="divide-y">
              {matches.map((m) => (
                <MatchRow key={m.id} m={m} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Shareable card */}
      <section className="mb-5">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-700">
          <Share2 className="h-4 w-4 text-emerald-600" />
          Celebrate it
        </div>
        <ShareCard data={data} />
      </section>

      <footer className="mt-8 text-center text-xs text-muted-foreground">
        JKKN Institutions · Personal tournament results
      </footer>
    </main>
  );
}
