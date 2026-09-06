// hooks/events/use-open-tournaments.ts
// Student-facing feed of tournaments open to browse/register (2026-07-10).
//
// Reads the fn_open_tournaments() RPC — the ONLY tournament data source a
// student may touch. It is SECURITY DEFINER (tournament_divisions RLS requires
// sports.tournaments.view, which students deliberately do not hold), self-
// authorizing, and returns no entries, payments, budget or sponsor data.

'use client';

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';

export interface OpenTournamentDivision {
  id: string;
  sport: string;
  gender: string | null;
  age_band: string | null;
  format: string;
  level: string | null;
  max_teams: number | null;
  entry_fee: number;
}

export interface OpenTournament {
  id: string;
  name: string;
  description: string | null;
  venue: string | null;
  start_date: string | null;
  end_date: string | null;
  registration_open_date: string | null;
  registration_close_date: string | null;
  status: string;
  scope: string;
  is_registration_open: boolean;
  divisions: OpenTournamentDivision[];
}

export function useOpenTournaments() {
  return useQuery({
    queryKey: ['open-tournaments'],
    queryFn: async (): Promise<OpenTournament[]> => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await (supabase as any).rpc('fn_open_tournaments');
      if (error) throw error;
      return (data ?? []) as OpenTournament[];
    },
    staleTime: 60_000,
  });
}
