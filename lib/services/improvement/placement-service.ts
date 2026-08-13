// =====================================================================
// Placement observations — data access
// =====================================================================
// The screen half of 20260816060000_placement_observation_record.sql.
//
// Every rule the database enforces is mirrored here so a person reads a
// sentence rather than a raw 500 — and the mirror NEVER replaces the server
// check. The partner gate in particular is a BEFORE trigger; this module only
// decides which options to offer, and if anything slips past it the database's
// own message is shown verbatim.
//
// THE ONE RULE WORTH RESTATING
// A partner may be named only once it has signed. Unsigned placements record a
// kind — "a district hospital" — and nothing else. That is why the partner
// picker below reads only signed partners: offering an unsigned one would be
// offering a button that always fails.
//
// Created: 2026-08-13.

import type { SupabaseClient } from '@supabase/supabase-js';

export const PARTNER_KINDS = [
  'hospital',
  'school',
  'pharmacy',
  'clinic',
  'laboratory',
  'workshop',
  'office',
  'other',
] as const;
export type PartnerKind = (typeof PARTNER_KINDS)[number];

export const PARTNER_KIND_LABEL: Record<PartnerKind, string> = {
  hospital: 'Hospital',
  school: 'School',
  pharmacy: 'Pharmacy',
  clinic: 'Clinic',
  laboratory: 'Laboratory',
  workshop: 'Workshop',
  office: 'Office',
  other: 'Somewhere else',
};

/** The four prompts, in the order they are asked. Exported so the dialog and
 *  the read-back list cannot drift apart. */
export const PLACEMENT_QUESTIONS = [
  {
    key: 'q_done_twice' as const,
    label: 'What did you watch someone do twice?',
    hint: 'Repeated work is a system telling you it forgot something — the same number written in two places, a form filled from another form.',
    placeholder:
      'e.g. At handover the outgoing nurse reads vitals from the bedside chart and the incoming nurse copies them into the station register. Six beds, about eleven minutes.',
  },
  {
    key: 'q_waiting_on_one' as const,
    label: "What waited on one person's signature or approval?",
    hint: 'Note who, how long, and what stopped while waiting.',
    placeholder:
      'e.g. Three discharges were ready by 11am and left at 4:40pm because only the consultant may sign, and he was in theatre.',
  },
  {
    key: 'q_workaround' as const,
    label: 'What is kept in a notebook, a spreadsheet or WhatsApp because the official system hurts?',
    hint: 'The private workaround is the real process. The official one is the story told to visitors.',
    placeholder:
      'e.g. Nil-stock items are kept in a spiral notebook because recording them needs a manager login the counter staff do not have.',
  },
  {
    key: 'q_quiet_failure' as const,
    label: 'What broke quietly, where nobody had noticed for weeks?',
    hint: 'The highest-yield question. Ask what produces output nobody reads.',
    placeholder:
      'e.g. The fridge logger prints a slip each morning into a folder nobody opens. Nine of the forty slips record a temperature excursion.',
  },
] as const;

export type PlacementAnswers = {
  q_done_twice: string;
  q_waiting_on_one: string;
  q_workaround: string;
  q_quiet_failure: string;
};

export interface SignedPartner {
  id: string;
  name: string;
  kind: PartnerKind;
}

export interface PlacementObservation {
  id: string;
  partner_id: string | null;
  partner_kind: PartnerKind;
  partner_name: string | null;
  observed_at: string;
  raised_idea_id: string | null;
  q_done_twice: string | null;
  q_waiting_on_one: string | null;
  q_workaround: string | null;
  q_quiet_failure: string | null;
}

export interface RecordPlacementInput {
  institutionId: string;
  partnerKind: PartnerKind;
  observedAt: string;
  answers: PlacementAnswers;
  partnerId?: string | null;
}

/**
 * The client-side mirror of the database's own rules. Returns a sentence, or
 * null when the input would be accepted.
 *
 * The content rule mirrors ck_placement_observation_has_content: at least one
 * of the four answered. "Nothing to report" is a real observation and is
 * recorded by answering one question with what you looked for and why you
 * concluded nothing — never by submitting four blanks, which would be a row
 * that says nothing at all.
 */
export function validatePlacement(input: RecordPlacementInput): string | null {
  const answered = Object.values(input.answers).some((v) => v.trim().length > 0);
  if (!answered) {
    return 'Answer at least one of the four. If you genuinely saw nothing, say what you looked for and why you concluded nothing — that is a real observation, four blanks are not.';
  }
  if (!input.partnerKind) return 'Choose what kind of place this was.';
  if (!input.observedAt) return 'Say when you went.';
  if (Number.isNaN(Date.parse(input.observedAt))) {
    return 'That date could not be read. Use the picker.';
  }
  if (Date.parse(input.observedAt) > Date.now() + 60_000) {
    return 'That is in the future. Record the visit after you have been.';
  }
  return null;
}

export class PlacementService {
  /**
   * Signed partners only — see the header. An officer who wants to name an
   * organisation that has not signed is being told, correctly, to go and get
   * the signature first.
   */
  static async listSignedPartners(
    supabase: SupabaseClient,
    institutionId: string
  ): Promise<SignedPartner[]> {
    const { data, error } = await supabase
      .from('placement_partners')
      .select('id, name, kind')
      .eq('institution_id', institutionId)
      .eq('consent_state', 'signed')
      .eq('is_active', true)
      .order('name');

    // A learner cannot read placement_partners at all — RLS restricts it to
    // officers. That is not an error state for them, it is an empty picker.
    if (error) return [];
    return (data ?? []) as SignedPartner[];
  }

  /** The signed-in person's own observations, newest first. */
  static async listMine(
    supabase: SupabaseClient,
    userId: string,
    limit = 50
  ): Promise<PlacementObservation[]> {
    const { data, error } = await supabase
      .from('placement_observations')
      .select(
        'id, partner_id, partner_kind, observed_at, raised_idea_id, q_done_twice, q_waiting_on_one, q_workaround, q_quiet_failure, placement_partners(name)'
      )
      .eq('observed_by', userId)
      .order('observed_at', { ascending: false })
      .limit(limit);

    if (error) throw new Error(error.message);

    return (data ?? []).map((r: Record<string, unknown>) => {
      const joined = r.placement_partners as { name?: string } | null;
      return {
        id: r.id as string,
        partner_id: (r.partner_id as string | null) ?? null,
        partner_kind: r.partner_kind as PartnerKind,
        // Null whenever the partner has not signed — the join returns nothing
        // because RLS hid the row, which is the gate doing its job.
        partner_name: joined?.name ?? null,
        observed_at: r.observed_at as string,
        raised_idea_id: (r.raised_idea_id as string | null) ?? null,
        q_done_twice: (r.q_done_twice as string | null) ?? null,
        q_waiting_on_one: (r.q_waiting_on_one as string | null) ?? null,
        q_workaround: (r.q_workaround as string | null) ?? null,
        q_quiet_failure: (r.q_quiet_failure as string | null) ?? null,
      };
    });
  }

  /** Record one. Returns the new observation id. */
  static async record(
    supabase: SupabaseClient,
    input: RecordPlacementInput
  ): Promise<string> {
    const { data, error } = await (supabase as never as {
      rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: string | null; error: { message: string } | null }>;
    }).rpc('fn_placement_observation_record', {
      p_institution_id: input.institutionId,
      p_partner_kind: input.partnerKind,
      p_observed_at: input.observedAt,
      p_q_done_twice: input.answers.q_done_twice || null,
      p_q_waiting_on_one: input.answers.q_waiting_on_one || null,
      p_q_workaround: input.answers.q_workaround || null,
      p_q_quiet_failure: input.answers.q_quiet_failure || null,
      p_partner_id: input.partnerId || null,
    });

    if (error) throw new Error(error.message);
    if (!data) throw new Error('The observation was not recorded and the database gave no reason.');
    return data;
  }

  /**
   * Promote an observation to an improvement idea. The database refuses unless
   * the partner has signed — an idea is read by staff, ranked, and may become a
   * published case study, so it may not describe an organisation that never
   * agreed to any of that.
   */
  static async raiseIdea(
    supabase: SupabaseClient,
    observationId: string,
    title: string,
    problem: string,
    proposedFix: string
  ): Promise<string> {
    const { data, error } = await (supabase as never as {
      rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: string | null; error: { message: string } | null }>;
    }).rpc('fn_placement_observation_raise_idea', {
      p_observation_id: observationId,
      p_title: title,
      p_problem: problem,
      p_proposed_fix: proposedFix,
    });

    if (error) throw new Error(error.message);
    if (!data) throw new Error('The idea was not created and the database gave no reason.');
    return data;
  }
}
