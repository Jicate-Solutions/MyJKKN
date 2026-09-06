/**
 * CEO Rounds Log — server entry.
 * Loads the rounds the viewer may see (RLS-scoped) with attendance rollups and
 * hands them to the client. Empty-state renders in the client so an eligible
 * facilitator still sees the "Log a round" affordance on an empty log.
 */

import { createClient } from '@/lib/supabase/server';
import { CeoRoundsClient } from './_components/ceo-rounds-client';
import {
  PARTICIPATION_WEIGHT,
  type CeoRoundEnriched,
  type CeoRoundParticipation
} from '@/lib/services/ceo-rounds/ceo-rounds-service';

export const dynamic = 'force-dynamic';

function SignInPrompt() {
  return (
    <div className="flex items-center justify-center py-20">
      <p className="text-muted-foreground">Please sign in to access the CEO Rounds log.</p>
    </div>
  );
}

export default async function CeoRoundsPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return <SignInPrompt />;

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, institution_id')
    .eq('id', user.id)
    .single();
  if (!profile) return <SignInPrompt />;

  const { data: rawRounds } = await supabase
    .from('ceo_rounds')
    .select('*')
    .order('round_date', { ascending: false });
  const rounds = (rawRounds || []) as any[];

  const roundIds = rounds.map((r) => r.id);
  const countByRound = new Map<string, number>();
  const scoreByRound = new Map<string, number>();
  if (roundIds.length > 0) {
    const { data: att } = await supabase
      .from('ceo_round_attendance')
      .select('round_id, participation')
      .in('round_id', roundIds);
    for (const a of (att || []) as { round_id: string; participation: CeoRoundParticipation }[]) {
      countByRound.set(a.round_id, (countByRound.get(a.round_id) || 0) + 1);
      scoreByRound.set(
        a.round_id,
        (scoreByRound.get(a.round_id) || 0) + (PARTICIPATION_WEIGHT[a.participation] || 0)
      );
    }
  }

  const nameIds = new Set<string>();
  for (const r of rounds) {
    if (r.facilitator_id) nameIds.add(r.facilitator_id);
    if (r.summary_author_id) nameIds.add(r.summary_author_id);
  }
  const nameById = new Map<string, string | null>();
  if (nameIds.size > 0) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', [...nameIds]);
    for (const p of (profs || []) as { id: string; full_name: string | null }[]) {
      nameById.set(p.id, p.full_name);
    }
  }

  const initialRounds: CeoRoundEnriched[] = rounds.map((r) => ({
    ...r,
    facilitator_name: r.facilitator_id ? nameById.get(r.facilitator_id) ?? null : null,
    summary_author_name: r.summary_author_id ? nameById.get(r.summary_author_id) ?? null : null,
    attendee_count: countByRound.get(r.id) || 0,
    participation_total: scoreByRound.get(r.id) || 0
  }));

  return (
    <CeoRoundsClient
      userId={profile.id}
      institutionId={profile.institution_id || ''}
      initialRounds={initialRounds}
    />
  );
}
