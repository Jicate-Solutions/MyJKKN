// lib/services/startup-studio/pipeline-service.ts
// Startup Studio innovation pipeline: Appathon → Sarvam Galatta → Solve for 100 → NIF
// Aggregates teams across stages to produce live counts, conversion rates, and recent activity.

import { BaseService } from '../base-service';

export type PipelineStage = 'appathon' | 'sarvam_galatta' | 'solve_for_100' | 'nif';

export interface PipelineStageCount {
  stage: PipelineStage;
  label: string;
  count: number;
  event_name: string | null;
  event_id: string | null;
}

export interface PipelineTeam {
  id: string;
  team_name: string;
  problem_idea: string | null;
  institution_id: string | null;
  created_at: string;
  extra: string | null; // phase for sf100, stage for nif
}

export interface PipelineActivity {
  type: 'registration' | 'enrollment' | 'phase_change' | 'nif_candidate';
  title: string;
  description: string;
  timestamp: string;
  team_name: string | null;
}

export interface PipelineConversion {
  from: PipelineStage;
  to: PipelineStage;
  from_count: number;
  to_count: number;
  rate: number; // percentage
}

export interface PipelineSummary {
  stages: PipelineStageCount[];
  conversions: PipelineConversion[];
  total_teams: number;
}

const STAGE_LABELS: Record<PipelineStage, string> = {
  appathon: 'Appathon 2.0',
  sarvam_galatta: 'Sarvam Galatta',
  solve_for_100: 'Solve for 100',
  nif: 'NIF Candidates',
};

export class PipelineService extends BaseService {
  /**
   * Resolve the startup_events row IDs for Appathon and Sarvam Galatta.
   * Uses ILIKE matching on event name so hard-coded IDs aren't required.
   */
  private static async resolveEventIds(): Promise<{
    appathonId: string | null;
    appathonName: string | null;
    sarvamId: string | null;
    sarvamName: string | null;
  }> {
    const { data, error } = await this.supabase
      .from('startup_events')
      .select('id, name')
      .or('name.ilike.%appathon%,name.ilike.%sarvam%');

    if (error) {
      throw new Error('Failed to resolve pipeline events: ' + error.message);
    }

    let appathonId: string | null = null;
    let appathonName: string | null = null;
    let sarvamId: string | null = null;
    let sarvamName: string | null = null;

    // Pick the most-registered Appathon and Sarvam event if multiple exist.
    const appathons = (data || []).filter((e: any) =>
      /appathon/i.test(e.name) && !/staging/i.test(e.name)
    );
    const sarvams = (data || []).filter((e: any) => /sarvam/i.test(e.name));

    if (appathons.length) {
      appathonId = appathons[0].id;
      appathonName = appathons[0].name;
    }
    if (sarvams.length) {
      sarvamId = sarvams[0].id;
      sarvamName = sarvams[0].name;
    }

    return { appathonId, appathonName, sarvamId, sarvamName };
  }

  /**
   * Live counts for the 4 pipeline stages plus conversion rates.
   */
  static async getSummary(): Promise<PipelineSummary> {
    const { appathonId, appathonName, sarvamId, sarvamName } = await this.resolveEventIds();

    // Parallel count queries
    const appathonCountPromise = appathonId
      ? this.supabase
          .from('event_registrations')
          .select('id', { count: 'exact', head: true })
          .eq('event_id', appathonId)
      : Promise.resolve({ count: 0, error: null });

    const sarvamCountPromise = sarvamId
      ? this.supabase
          .from('event_registrations')
          .select('id', { count: 'exact', head: true })
          .eq('event_id', sarvamId)
      : Promise.resolve({ count: 0, error: null });

    const sf100CountPromise = this.supabase
      .from('sf100_enrollments')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active');

    const nifCountPromise = this.supabase
      .from('ss_nif_candidates')
      .select('id', { count: 'exact', head: true });

    const [appathon, sarvam, sf100, nif] = await Promise.all([
      appathonCountPromise,
      sarvamCountPromise,
      sf100CountPromise,
      nifCountPromise,
    ]);

    if ((appathon as any).error) throw new Error('Appathon count failed');
    if ((sarvam as any).error) throw new Error('Sarvam Galatta count failed');
    if ((sf100 as any).error) throw new Error('Solve for 100 count failed');
    if ((nif as any).error) throw new Error('NIF count failed');

    const appathonCount = (appathon as any).count || 0;
    const sarvamCount = (sarvam as any).count || 0;
    const sf100Count = (sf100 as any).count || 0;
    const nifCount = (nif as any).count || 0;

    const stages: PipelineStageCount[] = [
      { stage: 'appathon', label: STAGE_LABELS.appathon, count: appathonCount, event_name: appathonName, event_id: appathonId },
      { stage: 'sarvam_galatta', label: STAGE_LABELS.sarvam_galatta, count: sarvamCount, event_name: sarvamName, event_id: sarvamId },
      { stage: 'solve_for_100', label: STAGE_LABELS.solve_for_100, count: sf100Count, event_name: null, event_id: null },
      { stage: 'nif', label: STAGE_LABELS.nif, count: nifCount, event_name: null, event_id: null },
    ];

    const conversions: PipelineConversion[] = [
      {
        from: 'appathon',
        to: 'sarvam_galatta',
        from_count: appathonCount,
        to_count: sarvamCount,
        rate: appathonCount > 0 ? Math.round((sarvamCount / appathonCount) * 1000) / 10 : 0,
      },
      {
        from: 'sarvam_galatta',
        to: 'solve_for_100',
        from_count: sarvamCount,
        to_count: sf100Count,
        rate: sarvamCount > 0 ? Math.round((sf100Count / sarvamCount) * 1000) / 10 : 0,
      },
      {
        from: 'solve_for_100',
        to: 'nif',
        from_count: sf100Count,
        to_count: nifCount,
        rate: sf100Count > 0 ? Math.round((nifCount / sf100Count) * 1000) / 10 : 0,
      },
    ];

    return {
      stages,
      conversions,
      total_teams: appathonCount,
    };
  }

  /**
   * Fetch teams at a specific stage. Capped at 200 to prevent huge payloads.
   */
  static async getTeamsAtStage(stage: PipelineStage): Promise<PipelineTeam[]> {
    if (stage === 'appathon' || stage === 'sarvam_galatta') {
      const { appathonId, sarvamId } = await this.resolveEventIds();
      const eventId = stage === 'appathon' ? appathonId : sarvamId;
      if (!eventId) return [];

      const { data, error } = await this.supabase
        .from('event_registrations')
        .select('id, team_name, problem_idea, institution_id, created_at, status')
        .eq('event_id', eventId)
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw new Error('Failed to fetch teams: ' + error.message);

      return (data || []).map((r: any) => ({
        id: r.id,
        team_name: r.team_name || 'Unnamed Team',
        problem_idea: r.problem_idea,
        institution_id: r.institution_id,
        created_at: r.created_at,
        extra: r.status,
      }));
    }

    if (stage === 'solve_for_100') {
      const { data, error } = await this.supabase
        .from('sf100_enrollments')
        .select(`
          id,
          current_phase,
          enrolled_at,
          cumulative_paid_users,
          registration:event_registrations!registration_id(
            id,
            team_name,
            problem_idea,
            institution_id
          )
        `)
        .eq('status', 'active')
        .order('enrolled_at', { ascending: false })
        .limit(200);

      if (error) throw new Error('Failed to fetch SF100 teams: ' + error.message);

      return (data || []).map((e: any) => ({
        id: e.id,
        team_name: e.registration?.team_name || 'Unnamed Team',
        problem_idea: e.registration?.problem_idea || null,
        institution_id: e.registration?.institution_id || null,
        created_at: e.enrolled_at,
        extra: `${e.current_phase} · ${e.cumulative_paid_users || 0} paid users`,
      }));
    }

    if (stage === 'nif') {
      const { data, error } = await this.supabase
        .from('ss_nif_candidates')
        .select('id, startup_name, stage, created_at, team_size')
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw new Error('Failed to fetch NIF candidates: ' + error.message);

      return (data || []).map((n: any) => ({
        id: n.id,
        team_name: n.startup_name || 'Unnamed',
        problem_idea: null,
        institution_id: null,
        created_at: n.created_at,
        extra: n.stage,
      }));
    }

    return [];
  }

  /**
   * Recent activity across the pipeline (registrations, enrollments, phase changes).
   */
  static async getRecentActivity(limit: number = 20): Promise<PipelineActivity[]> {
    const { appathonId, sarvamId, appathonName, sarvamName } = await this.resolveEventIds();
    const relevantEventIds = [appathonId, sarvamId].filter(Boolean) as string[];

    // Recent registrations across relevant events
    const regsPromise = relevantEventIds.length
      ? this.supabase
          .from('event_registrations')
          .select('id, team_name, event_id, created_at')
          .in('event_id', relevantEventIds)
          .order('created_at', { ascending: false })
          .limit(limit)
      : Promise.resolve({ data: [], error: null });

    // Recent SF100 enrollments
    const enrollPromise = this.supabase
      .from('sf100_enrollments')
      .select(`
        id,
        enrolled_at,
        current_phase,
        registration:event_registrations!registration_id(team_name)
      `)
      .order('enrolled_at', { ascending: false })
      .limit(limit);

    // Recent phase transitions
    const phasePromise = this.supabase
      .from('sf100_phase_history')
      .select(`
        id,
        from_phase,
        to_phase,
        created_at,
        enrollment:sf100_enrollments!enrollment_id(
          registration:event_registrations!registration_id(team_name)
        )
      `)
      .order('created_at', { ascending: false })
      .limit(limit);

    // Recent NIF candidates
    const nifPromise = this.supabase
      .from('ss_nif_candidates')
      .select('id, startup_name, stage, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    const [regs, enrolls, phases, nifs] = await Promise.all([
      regsPromise,
      enrollPromise,
      phasePromise,
      nifPromise,
    ]);

    const activities: PipelineActivity[] = [];

    for (const r of ((regs as any).data || [])) {
      const eventLabel =
        r.event_id === appathonId ? (appathonName || 'Appathon 2.0') :
        r.event_id === sarvamId ? (sarvamName || 'Sarvam Galatta') :
        'event';
      activities.push({
        type: 'registration',
        title: `${r.team_name || 'Team'} joined ${eventLabel}`,
        description: 'New registration',
        timestamp: r.created_at,
        team_name: r.team_name || null,
      });
    }

    for (const e of ((enrolls as any).data || [])) {
      const teamName = (e as any).registration?.team_name || 'Team';
      activities.push({
        type: 'enrollment',
        title: `${teamName} enrolled in Solve for 100`,
        description: `Entered ${(e as any).current_phase} phase`,
        timestamp: (e as any).enrolled_at,
        team_name: teamName,
      });
    }

    for (const p of ((phases as any).data || [])) {
      const teamName = (p as any).enrollment?.registration?.team_name || 'Team';
      const from = (p as any).from_phase || 'start';
      const to = (p as any).to_phase;
      activities.push({
        type: 'phase_change',
        title: `${teamName} advanced to ${to}`,
        description: `From ${from}`,
        timestamp: (p as any).created_at,
        team_name: teamName,
      });
    }

    for (const n of ((nifs as any).data || [])) {
      activities.push({
        type: 'nif_candidate',
        title: `${(n as any).startup_name} entered NIF pipeline`,
        description: `Stage: ${(n as any).stage}`,
        timestamp: (n as any).created_at,
        team_name: (n as any).startup_name,
      });
    }

    // Sort by timestamp desc and take top N
    activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return activities.slice(0, limit);
  }
}
