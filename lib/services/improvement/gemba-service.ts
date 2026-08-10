/**
 * Gemba visits — service layer (browser client, RLS-scoped).
 * ============================================================================
 *
 * The backend for this shipped in two migrations that are already applied:
 * `20260731043000_gemba_observation_record.sql` and
 * `20260731050000_gemba_corrections_posting_self_and_revoke.sql`. Nothing here
 * adds a table, a column or an RPC — `gemba_observations` held zero rows only
 * because there was no screen to record a visit from. This is that screen's
 * data layer.
 *
 * WRITE PATH — RPCs only, exactly as the migrations intend:
 *   • `fn_gemba_observation_record` — records the visit, derives
 *     `is_self_recorded`, raises an improvement idea on a mismatch, and sets or
 *     CLEARS the artifact's official badge.
 *   • `fn_gemba_observation_reply` — the department's answer. It never edits or
 *     hides the observation; both records stand.
 * There is no INSERT/UPDATE policy on either table, so a direct write would
 * match zero rows and appear to succeed. Everything writeable goes through the
 * two RPCs above.
 *
 * READ PATH — plain RLS-scoped selects. What comes back is already filtered:
 * an observer sees their own visits plus every visit to a department they are
 * posted to; officers and managers see more. This layer renders whatever the
 * query returns and never widens it.
 *
 * `v_gemba_area_summary` is deliberately NOT read here. It is the leadership
 * lens and is notes-free by construction; this screen is the department lens,
 * which reads notes. Keeping the two apart is the whole point of the split.
 *
 * These tables are live in prod but absent from the generated
 * `types/supabase.ts`, so queries cast through `(supabase as any)` — the same
 * pattern `improvement-service.ts` and `mba-analyst-service.ts` use. Row shapes
 * are typed here instead.
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import {
  ARTIFACT_LABEL,
  type ArtifactStatus,
  type ArtifactType,
} from '@/lib/services/mba-dept-artifacts/types';

const MODULE = 'improvement/gemba';

/** The only two things a visit can conclude. Mirrors the table's CHECK. */
export const GEMBA_FINDINGS = ['matches', 'differs'] as const;
export type GembaFinding = (typeof GEMBA_FINDINGS)[number];

/** A department the viewer may record a visit to. */
export interface GembaArea {
  id: string;
  key: string | null;
  label: string;
  /** Per-department override for how long official lasts. NULL = global default. */
  gemba_interval_days: number | null;
}

/** A playbook document, with the three columns that decide its badge. */
export interface GembaArtifact {
  id: string;
  area_id: string;
  artifact_type: ArtifactType;
  status: ArtifactStatus;
  version: number;
  updated_at: string | null;
  official_at: string | null;
  official_until: string | null;
  official_by: string | null;
}

/** A row of `gemba_observation_replies`, with the author's display name. */
export interface GembaReply {
  id: string;
  observation_id: string;
  author_id: string;
  body: string;
  created_at: string;
  author_name: string | null;
}

/** A row of `gemba_observations` decorated for display. */
export interface GembaObservation {
  id: string;
  area_id: string;
  artifact_id: string | null;
  observed_by: string;
  observed_at: string;
  finding: GembaFinding;
  is_self_recorded: boolean;
  notes: string | null;
  raised_idea_id: string | null;
  created_at: string;
  observer_name: string | null;
  area_label: string | null;
  artifact_label: string | null;
  replies: GembaReply[];
}

/** What a visit form sends. `observedAt` is when they WENT, not when they typed. */
export interface RecordVisitInput {
  areaId: string;
  artifactId?: string | null;
  finding: GembaFinding;
  notes?: string | null;
  observedAt?: Date | null;
}

// ---------------------------------------------------------------------------
// Official / proposed / lapsed — ONE shared helper.
// ---------------------------------------------------------------------------

/**
 * The three states a playbook document can be in.
 *
 *   proposed — nobody has been to look yet. All 42 existing "approved" drafts
 *              sit here: approval is a desk act, official is a visit.
 *   official — a recorded visit found it matched, and that has not expired.
 *   lapsed   — it was official, and the interval ran out. Not official any
 *              more, and saying "official" would be a lie the platform tells.
 */
export type OfficialState = 'official' | 'lapsed' | 'proposed';

/**
 * The single place officialdom is computed. Every badge on this screen calls
 * this, so an expiry can never read as official in one component and lapsed in
 * another.
 */
export function officialState(
  artifact: Pick<GembaArtifact, 'official_at' | 'official_until'>,
  now: Date = new Date()
): OfficialState {
  if (!artifact.official_at) return 'proposed';
  if (artifact.official_until && new Date(artifact.official_until) < now) {
    return 'lapsed';
  }
  return 'official';
}

/** Short label per state, in the words the screen should use. */
export const OFFICIAL_STATE_LABEL: Record<OfficialState, string> = {
  official: 'Official',
  lapsed: 'Lapsed — needs another visit',
  proposed: 'Proposed — not yet official',
};

/** Badge colours per state. Lapsed is amber: it is a prompt, not a failure. */
export const OFFICIAL_STATE_BADGE_CLASS: Record<OfficialState, string> = {
  official: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  lapsed: 'bg-amber-100 text-amber-800 border-amber-200',
  proposed: 'bg-slate-100 text-slate-700 border-slate-200',
};

/** Display name for a playbook document. */
export function artifactLabel(type: ArtifactType): string {
  return ARTIFACT_LABEL[type] ?? type;
}

// ---------------------------------------------------------------------------
// Client-side mirror of the four rules the RPC raises on.
// ---------------------------------------------------------------------------

/**
 * The same four refusals `fn_gemba_observation_record` raises, checked before
 * the round trip so the person reads a sentence instead of a 500.
 *
 * This is a MIRROR, never a replacement: the RPC still enforces all four
 * server-side, and its message is surfaced verbatim if anything slips past.
 *
 * @param postedAreaIds departments the viewer is actively posted to.
 * @param isOfficer     holds `improvement.area_role.assign` (officers may
 *                      record anywhere; that is the RPC's own second lane).
 */
export function validateVisit(
  input: RecordVisitInput,
  postedAreaIds: readonly string[],
  isOfficer: boolean
): string | null {
  if (!input.areaId) {
    return 'Choose the department you visited.';
  }
  if (!isOfficer && !postedAreaIds.includes(input.areaId)) {
    return 'You can only record a visit to a department you are posted to. A record of someone going to look is worth nothing if that someone was never there.';
  }
  if (!(GEMBA_FINDINGS as readonly string[]).includes(input.finding)) {
    return 'Say whether what you saw matched the playbook or differed from it.';
  }
  const notes = (input.notes ?? '').trim();
  if (input.finding === 'differs' && !notes) {
    return 'Say what differed — a finding nobody can act on is not a finding.';
  }
  if (input.observedAt && input.observedAt.getTime() > Date.now()) {
    return 'A visit cannot be recorded in the future. Pick when you actually went.';
  }
  return null;
}

/** Strip the `fn_...:` prefix Postgres RAISE messages carry. */
function humanise(message: string | null | undefined, fallback: string): string {
  const raw = (message ?? '').trim();
  if (!raw) return fallback;
  const stripped = raw.replace(/^fn_gemba_observation_(record|reply):\s*/i, '');
  return stripped || fallback;
}

type ProfileLite = { id: string; full_name: string | null };

export class GembaService {
  private static getSupabase() {
    return createClientSupabaseClient();
  }

  /** id -> display name, batched into one query. */
  private static async fetchProfiles(
    ids: (string | null)[]
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const unique = Array.from(new Set(ids.filter((v): v is string => !!v)));
    if (unique.length === 0) return map;

    const supabase = this.getSupabase();
    const { data, error } = (await (supabase as any)
      .from('profiles')
      .select('id, full_name')
      .in('id', unique)) as { data: ProfileLite[] | null; error: any };

    if (error) {
      logger.error(MODULE, 'Error fetching observer names', error);
      return map;
    }
    for (const row of data ?? []) {
      if (row.full_name) map.set(row.id, row.full_name);
    }
    return map;
  }

  /**
   * The departments the signed-in person is ACTIVELY posted to. This is the
   * picker source for recording a visit, because it is exactly the set the RPC
   * will accept from a posted associate.
   */
  static async myPostedAreas(): Promise<GembaArea[]> {
    const supabase = this.getSupabase();
    try {
      // RLS on mba_associate_postings is already self-scoped, but the filter is
      // written out anyway so the intent survives a future policy change.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const uid = session?.user?.id ?? null;
      if (!uid) return [];

      const { data, error } = (await (supabase as any)
        .from('mba_associate_postings')
        .select('area_id')
        .eq('associate_user_id', uid)
        .eq('is_active', true)) as { data: { area_id: string }[] | null; error: any };
      if (error) throw error;

      const ids = Array.from(new Set((data ?? []).map((r) => r.area_id)));
      if (ids.length === 0) return [];

      const { data: areas, error: areaError } = (await (supabase as any)
        .from('improvement_areas')
        .select('id, key, label, gemba_interval_days')
        .in('id', ids)
        .order('display_order', { ascending: true })) as {
        data: GembaArea[] | null;
        error: any;
      };
      if (areaError) throw areaError;
      return areas ?? [];
    } catch (error) {
      logger.error(MODULE, 'Error loading posted departments', error);
      return [];
    }
  }

  /**
   * Every active department. Only useful to an officer, who may record a visit
   * anywhere; a posted associate should be offered `myPostedAreas()` instead.
   */
  static async listAllAreas(): Promise<GembaArea[]> {
    const supabase = this.getSupabase();
    try {
      const { data, error } = (await (supabase as any)
        .from('improvement_areas')
        .select('id, key, label, gemba_interval_days')
        .eq('is_active', true)
        .order('display_order', { ascending: true })) as {
        data: GembaArea[] | null;
        error: any;
      };
      if (error) throw error;
      return data ?? [];
    } catch (error) {
      logger.error(MODULE, 'Error loading departments', error);
      return [];
    }
  }

  /** The playbook documents for one department, with their official columns. */
  static async listArtifacts(areaId: string): Promise<GembaArtifact[]> {
    const supabase = this.getSupabase();
    try {
      const { data, error } = (await (supabase as any)
        .from('mba_dept_artifacts')
        .select(
          'id, area_id, artifact_type, status, version, updated_at, official_at, official_until, official_by'
        )
        .eq('area_id', areaId)
        .order('artifact_type', { ascending: true })) as {
        data: GembaArtifact[] | null;
        error: any;
      };
      if (error) throw error;
      return data ?? [];
    } catch (error) {
      logger.error(MODULE, 'Error loading playbook documents', error);
      return [];
    }
  }

  /**
   * Visits to one department, newest first, with their reply threads. RLS has
   * already decided what is visible before this returns.
   */
  static async listObservations(areaId: string): Promise<GembaObservation[]> {
    const supabase = this.getSupabase();
    try {
      const { data, error } = (await (supabase as any)
        .from('gemba_observations')
        .select(
          'id, area_id, artifact_id, observed_by, observed_at, finding, is_self_recorded, notes, raised_idea_id, created_at'
        )
        .eq('area_id', areaId)
        .order('observed_at', { ascending: false })) as {
        data: any[] | null;
        error: any;
      };
      if (error) throw error;

      const rows = data ?? [];
      if (rows.length === 0) return [];

      const [replyRows, artifacts] = await Promise.all([
        this.fetchReplies(rows.map((r) => r.id)),
        this.listArtifacts(areaId),
      ]);

      const names = await this.fetchProfiles([
        ...rows.map((r) => r.observed_by),
        ...replyRows.map((r) => r.author_id),
      ]);

      const artifactById = new Map(artifacts.map((a) => [a.id, a]));
      const repliesByObservation = new Map<string, GembaReply[]>();
      for (const reply of replyRows) {
        const bucket = repliesByObservation.get(reply.observation_id) ?? [];
        bucket.push({ ...reply, author_name: names.get(reply.author_id) ?? null });
        repliesByObservation.set(reply.observation_id, bucket);
      }

      return rows.map((row) => {
        const artifact = row.artifact_id ? artifactById.get(row.artifact_id) : undefined;
        return {
          ...row,
          observer_name: names.get(row.observed_by) ?? null,
          area_label: null,
          artifact_label: artifact ? artifactLabel(artifact.artifact_type) : null,
          replies: repliesByObservation.get(row.id) ?? [],
        } as GembaObservation;
      });
    } catch (error) {
      logger.error(MODULE, 'Error loading visits', error);
      return [];
    }
  }

  /** Raw reply rows for a set of observations (names attached by the caller). */
  private static async fetchReplies(
    observationIds: string[]
  ): Promise<Omit<GembaReply, 'author_name'>[]> {
    if (observationIds.length === 0) return [];
    const supabase = this.getSupabase();
    const { data, error } = (await (supabase as any)
      .from('gemba_observation_replies')
      .select('id, observation_id, author_id, body, created_at')
      .in('observation_id', observationIds)
      .order('created_at', { ascending: true })) as {
      data: Omit<GembaReply, 'author_name'>[] | null;
      error: any;
    };
    if (error) {
      logger.error(MODULE, 'Error loading replies', error);
      return [];
    }
    return data ?? [];
  }

  /**
   * Record a visit. Returns the new observation id.
   *
   * `observed_at` is sent as an ISO string so the timestamptz the caller picked
   * survives the trip; omitting it lets the RPC default to now().
   */
  static async recordVisit(input: RecordVisitInput): Promise<string> {
    const supabase = this.getSupabase();
    const notes = (input.notes ?? '').trim();

    const { data, error } = (await (supabase as any).rpc(
      'fn_gemba_observation_record',
      {
        p_area_id: input.areaId,
        p_artifact_id: input.artifactId || null,
        p_finding: input.finding,
        p_notes: notes || null,
        p_observed_at: input.observedAt ? input.observedAt.toISOString() : null,
      }
    )) as { data: string | null; error: any };

    if (error) {
      logger.error(MODULE, 'Error recording visit', error);
      throw new Error(humanise(error.message, 'Could not record the visit.'));
    }
    if (!data) throw new Error('Could not record the visit — nothing came back.');
    return data;
  }

  /** Answer an observation. The observation itself is never touched. */
  static async reply(observationId: string, body: string): Promise<string> {
    const supabase = this.getSupabase();
    const { data, error } = (await (supabase as any).rpc(
      'fn_gemba_observation_reply',
      { p_observation_id: observationId, p_body: body.trim() }
    )) as { data: string | null; error: any };

    if (error) {
      logger.error(MODULE, 'Error replying to a visit', error);
      throw new Error(humanise(error.message, 'Could not post the reply.'));
    }
    if (!data) throw new Error('Could not post the reply — nothing came back.');
    return data;
  }
}
