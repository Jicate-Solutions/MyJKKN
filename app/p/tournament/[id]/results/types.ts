// Shape returned by fn_tournament_participant_results(p_code text).
// Local to the public results route — the RPC is not yet in generated types,
// so callers cast the client `as any`. Section 3, Events/Tournament go-live.

export type Medal = 'gold' | 'silver' | 'bronze' | null;

export interface ParticipantEntry {
  id: string;
  division_id: string | null;
  entry_type: string;
  entry_name: string;
  institution_name: string | null;
  is_external: boolean;
  seed: number | null;
  status: string;
  final_rank: number | null;
  medal: Medal;
}

export interface ParticipantDivision {
  id: string;
  sport: string;
  gender: string | null;
  age_band: string | null;
  format: string;
  level: string | null;
}

export interface ParticipantTournament {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  venue: string | null;
  venue_text: string | null;
  status: string;
}

export interface ParticipantStanding {
  played: number;
  won: number;
  lost: number;
  drawn: number;
  points: number;
}

export interface ParticipantMatch {
  id: string;
  division_id: string | null;
  round_no: number;
  round_label: string | null;
  match_no: number | null;
  pool: string | null;
  status: string;
  scheduled_at: string | null;
  sets: unknown;
  my_name: string | null;
  opponent_name: string | null;
  my_score: number | null;
  opponent_score: number | null;
  won: boolean;
  lost: boolean;
  winner_name: string | null;
}

export interface ParticipantResults {
  tournament: ParticipantTournament;
  division: ParticipantDivision | null;
  entry: ParticipantEntry;
  standing: ParticipantStanding | null;
  matches: ParticipantMatch[];
  division_entry_count: number;
}
