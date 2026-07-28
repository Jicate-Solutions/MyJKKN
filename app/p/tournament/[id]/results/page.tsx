// app/p/tournament/[id]/results/page.tsx
// PUBLIC no-login PARTICIPANT RESULTS for outside schools and players.
// Lives OUTSIDE the (routes) auth group, so no login is required. Reads ONLY the
// PII-safe fn_tournament_participant_results RPC (explicitly GRANTed to anon)
// via the anon client — never touches events_registrations.
//
// Keyed by the participant's short 6-char access code, passed as ?code=. As a
// graceful fallback it also accepts a tournament_entries id in ?code= (or the
// route's [id] param) so it works BEFORE Section 1's access_code column exists.
// The RPC itself degrades: if the access_code column is missing it resolves by
// entry id only.
// Created: 2026-07-26 (Events/Tournament go-live, Section 3).

import type { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import { Trophy, KeyRound } from 'lucide-react';
import ResultsExperience from './_components/results-experience';
import type { ParticipantResults } from './types';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'My Tournament Results · JKKN',
    description: 'Your personal tournament journey, standing and certificate.',
    robots: { index: false, follow: false },
  };
}

async function loadResults(code: string): Promise<ParticipantResults | null> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  ) as any;
  const { data, error } = await supabase.rpc('fn_tournament_participant_results', {
    p_code: code,
  });
  if (error || !data) return null;
  return data as ParticipantResults;
}

export default async function ParticipantResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ code?: string }>;
}) {
  const { id } = await params;
  const { code: codeParam } = await searchParams;

  // Prefer the explicit ?code=; fall back to the route [id] when it looks like an
  // entry id (lets a bare /p/tournament/<entryId>/results deep-link work too).
  const code = (codeParam ?? '').trim() || (UUID_RE.test(id) ? id : '');

  const data = code ? await loadResults(code) : null;

  if (!data) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
          {code ? (
            <Trophy className="h-7 w-7 text-muted-foreground" />
          ) : (
            <KeyRound className="h-7 w-7 text-emerald-600" />
          )}
        </div>
        <h1 className="text-xl font-semibold">
          {code ? 'Results not found' : 'Enter your access code'}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {code
            ? "We couldn't find results for that code. Check the code from your registration confirmation, or ask the organizers."
            : 'Open the personal link from your registration confirmation, or add your 6-character access code to the address as ?code=YOURCODE.'}
        </p>
      </main>
    );
  }

  return <ResultsExperience data={data} code={code} eventId={id} />;
}
