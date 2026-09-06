'use client';

// Printable participation / winner certificate for a no-login tournament
// participant. Ports the marathon certificate pattern (public, PII-safe, keyed
// by a public credential). Learner terminology. Section 3, Events/Tournament
// go-live.

import { useCallback } from 'react';
import { Award, Printer, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import type { ParticipantResults } from '../../types';

const MEDAL_META: Record<
  string,
  { title: string; accent: string; ribbon: string; emoji: string }
> = {
  gold: { title: 'Certificate of Achievement', accent: '#b8860b', ribbon: '#eab308', emoji: '🥇' },
  silver: { title: 'Certificate of Achievement', accent: '#6b7280', ribbon: '#9ca3af', emoji: '🥈' },
  bronze: { title: 'Certificate of Achievement', accent: '#b45309', ribbon: '#d97706', emoji: '🥉' },
};

const PLACE_LABEL: Record<number, string> = {
  1: 'First Place · Champions',
  2: 'Second Place · Runners-up',
  3: 'Third Place',
};

function fmtDate(d: string | null): string {
  return d
    ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';
}

function divisionTitle(d: ParticipantResults['division']): string {
  if (!d) return '';
  return [d.sport, d.age_band, d.gender && d.gender !== 'open' ? d.gender : null]
    .filter(Boolean)
    .join(' · ');
}

export default function CertificateView({
  data,
  eventId,
  code,
}: {
  data: ParticipantResults;
  eventId: string;
  code: string;
}) {
  const { entry, tournament, division, standing } = data;
  const medal = entry.medal;
  const meta = medal ? MEDAL_META[medal] : null;
  const accent = meta?.accent ?? '#0b6d41';
  const ribbon = meta?.ribbon ?? '#ffde59';
  const isWinner = !!medal;
  const placeLabel = entry.final_rank ? PLACE_LABEL[entry.final_rank] : null;

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const dateLine = tournament.start_date
    ? `${fmtDate(tournament.start_date)}${tournament.end_date ? ` – ${fmtDate(tournament.end_date)}` : ''}`
    : '';
  const venue = tournament.venue || tournament.venue_text || '';

  return (
    <div className="min-h-screen bg-gray-100 py-8 print:bg-white print:py-0">
      {/* Print rules: hide chrome, fit the certificate to a landscape page. */}
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 12mm; }
          .no-print { display: none !important; }
          .cert-sheet { box-shadow: none !important; border: none !important; margin: 0 !important; }
          html, body { background: #fff !important; }
        }
      `}</style>

      {/* Controls */}
      <div className="no-print mx-auto mb-5 flex max-w-4xl items-center justify-between px-4">
        <Link
          href={`/p/tournament/${eventId}/results?code=${encodeURIComponent(code)}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to my results
        </Link>
        <button
          type="button"
          onClick={handlePrint}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
        >
          <Printer className="h-4 w-4" />
          Print / Save as PDF
        </button>
      </div>

      {/* Certificate sheet */}
      <div
        className="cert-sheet mx-auto max-w-4xl rounded-xl bg-white p-2 shadow-lg print:max-w-none print:shadow-none"
      >
        <div
          className="relative overflow-hidden rounded-lg px-8 py-12 text-center sm:px-14 sm:py-16"
          style={{ border: `3px solid ${accent}`, outline: `1px solid ${ribbon}`, outlineOffset: 6 }}
        >
          {/* Corner flourishes */}
          <span
            className="pointer-events-none absolute left-0 top-0 h-16 w-16"
            style={{ borderTop: `6px solid ${ribbon}`, borderLeft: `6px solid ${ribbon}` }}
            aria-hidden="true"
          />
          <span
            className="pointer-events-none absolute bottom-0 right-0 h-16 w-16"
            style={{ borderBottom: `6px solid ${ribbon}`, borderRight: `6px solid ${ribbon}` }}
            aria-hidden="true"
          />

          {/* Crest */}
          <div className="mb-2 text-5xl" aria-hidden="true">
            {meta ? meta.emoji : '🏅'}
          </div>

          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-700">
            JKKN Institutions
          </p>

          <h1
            className="mt-3 text-3xl font-bold sm:text-4xl"
            style={{ color: accent }}
          >
            {isWinner ? 'Certificate of Achievement' : 'Certificate of Participation'}
          </h1>

          <p className="mx-auto mt-5 max-w-xl text-sm text-gray-600">
            This is proudly presented to
          </p>

          <p className="mt-2 text-3xl font-bold text-gray-900 sm:text-4xl">{entry.entry_name}</p>
          {entry.institution_name && (
            <p className="mt-1 text-base text-gray-500">{entry.institution_name}</p>
          )}

          <p className="mx-auto mt-6 max-w-2xl text-sm leading-relaxed text-gray-700 sm:text-base">
            {isWinner ? (
              <>
                in recognition of an outstanding performance
                {placeLabel ? (
                  <>
                    {' '}securing{' '}
                    <span className="font-semibold" style={{ color: accent }}>
                      {placeLabel}
                    </span>
                  </>
                ) : null}{' '}
                in{' '}
              </>
            ) : (
              <>for wholehearted participation in </>
            )}
            {division && <span className="font-semibold">{divisionTitle(division)}</span>}
            {division ? ' at ' : ''}
            <span className="font-semibold">{tournament.name}</span>
            {dateLine ? ` held on ${dateLine}` : ''}
            {venue ? ` at ${venue}` : ''}.
          </p>

          {/* Result chips */}
          {(standing || entry.final_rank) && (
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3 text-sm">
              {entry.final_rank != null && (
                <span className="rounded-full bg-gray-50 px-3 py-1 font-medium text-gray-700">
                  Rank #{entry.final_rank}
                  {data.division_entry_count > 0 ? ` of ${data.division_entry_count}` : ''}
                </span>
              )}
              {standing && (
                <>
                  <span className="rounded-full bg-gray-50 px-3 py-1 font-medium text-gray-700">
                    Played {standing.played}
                  </span>
                  <span className="rounded-full bg-emerald-50 px-3 py-1 font-medium text-emerald-700">
                    Won {standing.won}
                  </span>
                </>
              )}
            </div>
          )}

          {/* Footer / signature line */}
          <div className="mt-10 flex flex-col items-center justify-between gap-6 sm:flex-row sm:items-end">
            <div className="text-center sm:text-left">
              <div className="mb-1 h-px w-40 bg-gray-300" />
              <p className="text-xs text-gray-500">Tournament Organizing Committee</p>
            </div>
            <div
              className="flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold"
              style={{ background: `${ribbon}22`, color: accent }}
            >
              <Award className="h-3.5 w-3.5" />
              {isWinner && placeLabel ? placeLabel : 'Participant'}
            </div>
            <div className="text-center sm:text-right">
              <div className="mb-1 h-px w-40 bg-gray-300" />
              <p className="text-xs text-gray-500">JKKN Sports · {dateLine || fmtDate(tournament.start_date)}</p>
            </div>
          </div>
        </div>
      </div>

      <p className="no-print mx-auto mt-4 max-w-4xl px-4 text-center text-xs text-muted-foreground">
        Tip: use Print → &ldquo;Save as PDF&rdquo; to keep a copy, or print it for your notice board.
      </p>
    </div>
  );
}
