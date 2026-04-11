// lib/services/startup-studio/analytics-service.ts
// Analytics and dashboard aggregation queries for the Startup Studio module

import { BaseService } from '../base-service';
import type {
  CycleStatus,
  ProblemTheme,
  NifStage,
} from '@/types/startup-studio';

// ============================================
// RESPONSE TYPES
// ============================================

export interface DashboardStats {
  totalCycles: number;
  activeCycles: number;
  completedCycles: number;
  totalProblems: number;
  nifCandidates: number;
  totalSubmissions: number;
  totalUsersReached: number;
  totalTimeSaved: number;
}

export interface ImpactSummary {
  totalUsersReached: number;
  totalTimeSaved: number;
  avgSatisfaction: number;
  avgNps: number;
  avgImpactScore: number;
}

export interface StepCompletionRate {
  step: number;
  count: number;
  percentage: number;
}

// ============================================
// SERVICE
// ============================================

export class AnalyticsService extends BaseService {
  /**
   * Aggregate dashboard stats across all key tables.
   * If eventId is provided, cycle-related counts are scoped to that event.
   */
  static async getDashboardStats(eventId?: string): Promise<DashboardStats> {
    try {
      // Build cycle queries (filtered by eventId when provided)
      let totalCyclesQuery = this.supabase
        .from('ss_cycles')
        .select('id', { count: 'exact', head: true });

      let activeCyclesQuery = this.supabase
        .from('ss_cycles')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active');

      let completedCyclesQuery = this.supabase
        .from('ss_cycles')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'completed');

      if (eventId) {
        totalCyclesQuery = totalCyclesQuery.eq('event_id', eventId);
        activeCyclesQuery = activeCyclesQuery.eq('event_id', eventId);
        completedCyclesQuery = completedCyclesQuery.eq('event_id', eventId);
      }

      // Non-cycle counts (not event-scoped)
      const problemsQuery = this.supabase
        .from('ss_problem_bank')
        .select('id', { count: 'exact', head: true });

      const nifQuery = this.supabase
        .from('ss_nif_candidates')
        .select('id', { count: 'exact', head: true });

      const submissionsQuery = this.supabase
        .from('ss_appathon_submissions')
        .select('id', { count: 'exact', head: true });

      // Impact aggregation — fetch all rows and sum in JS
      let impactQuery = this.supabase
        .from('ss_impacts')
        .select('users_reached, time_saved_minutes, cycle_id');

      // If eventId, join through cycles to filter
      if (eventId) {
        // Fetch cycle IDs for this event first, then filter impacts
        const { data: eventCycles } = await this.supabase
          .from('ss_cycles')
          .select('id')
          .eq('event_id', eventId);

        const cycleIds = (eventCycles || []).map((c: { id: string }) => c.id);

        if (cycleIds.length > 0) {
          impactQuery = impactQuery.in('cycle_id', cycleIds);
        } else {
          // No cycles for this event — impacts will be zero
          impactQuery = impactQuery.eq('cycle_id', '00000000-0000-0000-0000-000000000000');
        }
      }

      // Execute all queries in parallel
      const [
        totalCyclesResult,
        activeCyclesResult,
        completedCyclesResult,
        problemsResult,
        nifResult,
        submissionsResult,
        impactResult,
      ] = await Promise.all([
        totalCyclesQuery,
        activeCyclesQuery,
        completedCyclesQuery,
        problemsQuery,
        nifQuery,
        submissionsQuery,
        impactQuery,
      ]);

      // Check for errors
      if (totalCyclesResult.error) throw new Error(`Failed to count cycles: ${totalCyclesResult.error.message}`);
      if (activeCyclesResult.error) throw new Error(`Failed to count active cycles: ${activeCyclesResult.error.message}`);
      if (completedCyclesResult.error) throw new Error(`Failed to count completed cycles: ${completedCyclesResult.error.message}`);
      if (problemsResult.error) throw new Error(`Failed to count problems: ${problemsResult.error.message}`);
      if (nifResult.error) throw new Error(`Failed to count NIF candidates: ${nifResult.error.message}`);
      if (submissionsResult.error) throw new Error(`Failed to count submissions: ${submissionsResult.error.message}`);
      if (impactResult.error) throw new Error(`Failed to fetch impacts: ${impactResult.error.message}`);

      // Sum impact metrics in JS
      const impacts = (impactResult.data || []) as Array<{
        users_reached: number;
        time_saved_minutes: number;
      }>;

      const totalUsersReached = impacts.reduce(
        (sum, row) => sum + (row.users_reached || 0),
        0
      );
      const totalTimeSaved = impacts.reduce(
        (sum, row) => sum + (row.time_saved_minutes || 0),
        0
      );

      return {
        totalCycles: totalCyclesResult.count || 0,
        activeCycles: activeCyclesResult.count || 0,
        completedCycles: completedCyclesResult.count || 0,
        totalProblems: problemsResult.count || 0,
        nifCandidates: nifResult.count || 0,
        totalSubmissions: submissionsResult.count || 0,
        totalUsersReached,
        totalTimeSaved,
      };
    } catch (error) {
      console.error('[AnalyticsService] Error in getDashboardStats:', error);
      throw error;
    }
  }

  /**
   * Count cycles per status (active / completed / abandoned).
   * If eventId is provided, scoped to that event.
   */
  static async getCycleStatusDistribution(
    eventId?: string
  ): Promise<Record<CycleStatus, number>> {
    try {
      const statuses: CycleStatus[] = ['active', 'completed', 'abandoned'];

      const queries = statuses.map((status) => {
        let q = this.supabase
          .from('ss_cycles')
          .select('id', { count: 'exact', head: true })
          .eq('status', status);

        if (eventId) {
          q = q.eq('event_id', eventId);
        }
        return q;
      });

      const results = await Promise.all(queries);

      const distribution: Record<string, number> = {};

      for (let i = 0; i < statuses.length; i++) {
        if (results[i].error) {
          throw new Error(
            `Failed to count ${statuses[i]} cycles: ${results[i].error.message}`
          );
        }
        distribution[statuses[i]] = results[i].count || 0;
      }

      return distribution as Record<CycleStatus, number>;
    } catch (error) {
      console.error('[AnalyticsService] Error in getCycleStatusDistribution:', error);
      throw error;
    }
  }

  /**
   * Count problems per theme from ss_problem_bank.
   */
  static async getProblemThemeDistribution(): Promise<
    Record<ProblemTheme, number>
  > {
    try {
      const themes: ProblemTheme[] = [
        'healthcare',
        'education',
        'agriculture',
        'environment',
        'community',
        'operations',
        'productivity',
        'other',
      ];

      const queries = themes.map((theme) =>
        this.supabase
          .from('ss_problem_bank')
          .select('id', { count: 'exact', head: true })
          .eq('theme', theme)
      );

      const results = await Promise.all(queries);

      const distribution: Record<string, number> = {};

      for (let i = 0; i < themes.length; i++) {
        if (results[i].error) {
          throw new Error(
            `Failed to count ${themes[i]} problems: ${results[i].error.message}`
          );
        }
        distribution[themes[i]] = results[i].count || 0;
      }

      return distribution as Record<ProblemTheme, number>;
    } catch (error) {
      console.error('[AnalyticsService] Error in getProblemThemeDistribution:', error);
      throw error;
    }
  }

  /**
   * Count NIF candidates per pipeline stage.
   */
  static async getNifStageCounts(): Promise<Record<NifStage, number>> {
    try {
      const stages: NifStage[] = [
        'identified',
        'screened',
        'shortlisted',
        'incubating',
        'graduated',
        'rejected',
        'on_hold',
      ];

      const queries = stages.map((stage) =>
        this.supabase
          .from('ss_nif_candidates')
          .select('id', { count: 'exact', head: true })
          .eq('stage', stage)
      );

      const results = await Promise.all(queries);

      const counts: Record<string, number> = {};

      for (let i = 0; i < stages.length; i++) {
        if (results[i].error) {
          throw new Error(
            `Failed to count ${stages[i]} candidates: ${results[i].error.message}`
          );
        }
        counts[stages[i]] = results[i].count || 0;
      }

      return counts as Record<NifStage, number>;
    } catch (error) {
      console.error('[AnalyticsService] Error in getNifStageCounts:', error);
      throw error;
    }
  }

  /**
   * Aggregate impact metrics across all cycles (or cycles in a specific event).
   * Returns totals and averages for key impact fields.
   */
  static async getImpactSummary(eventId?: string): Promise<ImpactSummary> {
    try {
      let query = this.supabase
        .from('ss_impacts')
        .select(
          'users_reached, time_saved_minutes, satisfaction_score, nps_score, impact_score, cycle_id'
        );

      // If eventId, filter by cycle IDs belonging to that event
      if (eventId) {
        const { data: eventCycles, error: cycleError } = await this.supabase
          .from('ss_cycles')
          .select('id')
          .eq('event_id', eventId);

        if (cycleError) {
          throw new Error(`Failed to fetch event cycles: ${cycleError.message}`);
        }

        const cycleIds = (eventCycles || []).map((c: { id: string }) => c.id);

        if (cycleIds.length > 0) {
          query = query.in('cycle_id', cycleIds);
        } else {
          // No cycles — return zeroes
          return {
            totalUsersReached: 0,
            totalTimeSaved: 0,
            avgSatisfaction: 0,
            avgNps: 0,
            avgImpactScore: 0,
          };
        }
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(`Failed to fetch impact data: ${error.message}`);
      }

      const impacts = (data || []) as Array<{
        users_reached: number;
        time_saved_minutes: number;
        satisfaction_score: number | null;
        nps_score: number | null;
        impact_score: number | null;
      }>;

      if (impacts.length === 0) {
        return {
          totalUsersReached: 0,
          totalTimeSaved: 0,
          avgSatisfaction: 0,
          avgNps: 0,
          avgImpactScore: 0,
        };
      }

      const totalUsersReached = impacts.reduce(
        (sum, row) => sum + (row.users_reached || 0),
        0
      );
      const totalTimeSaved = impacts.reduce(
        (sum, row) => sum + (row.time_saved_minutes || 0),
        0
      );

      // Average only over rows that have non-null values
      const satisfactionValues = impacts
        .map((r) => r.satisfaction_score)
        .filter((v): v is number => v != null);
      const npsValues = impacts
        .map((r) => r.nps_score)
        .filter((v): v is number => v != null);
      const impactScoreValues = impacts
        .map((r) => r.impact_score)
        .filter((v): v is number => v != null);

      const avg = (arr: number[]): number =>
        arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

      return {
        totalUsersReached,
        totalTimeSaved,
        avgSatisfaction: Math.round(avg(satisfactionValues) * 100) / 100,
        avgNps: Math.round(avg(npsValues) * 100) / 100,
        avgImpactScore: Math.round(avg(impactScoreValues) * 100) / 100,
      };
    } catch (error) {
      console.error('[AnalyticsService] Error in getImpactSummary:', error);
      throw error;
    }
  }

  /**
   * For each flywheel step (1-8), count how many cycles have reached that step.
   * A cycle has reached step N if its current_step >= N.
   * Percentage is relative to total cycles.
   */
  static async getStepCompletionRates(
    eventId?: string
  ): Promise<StepCompletionRate[]> {
    try {
      // Get total cycle count for percentage calculation
      let totalQuery = this.supabase
        .from('ss_cycles')
        .select('id', { count: 'exact', head: true });

      if (eventId) {
        totalQuery = totalQuery.eq('event_id', eventId);
      }

      const { count: totalCount, error: totalError } = await totalQuery;

      if (totalError) {
        throw new Error(`Failed to count total cycles: ${totalError.message}`);
      }

      const total = totalCount || 0;

      if (total === 0) {
        return Array.from({ length: 8 }, (_, i) => ({
          step: i + 1,
          count: 0,
          percentage: 0,
        }));
      }

      // Count cycles that have reached each step (current_step >= step)
      const stepQueries = Array.from({ length: 8 }, (_, i) => {
        const step = i + 1;
        let q = this.supabase
          .from('ss_cycles')
          .select('id', { count: 'exact', head: true })
          .gte('current_step', step);

        if (eventId) {
          q = q.eq('event_id', eventId);
        }
        return q;
      });

      const results = await Promise.all(stepQueries);

      return results.map((result, i) => {
        if (result.error) {
          throw new Error(
            `Failed to count step ${i + 1} completions: ${result.error.message}`
          );
        }

        const count = result.count || 0;
        return {
          step: i + 1,
          count,
          percentage: Math.round((count / total) * 10000) / 100,
        };
      });
    } catch (error) {
      console.error('[AnalyticsService] Error in getStepCompletionRates:', error);
      throw error;
    }
  }
}

export const analyticsService = {
  getDashboardStats: AnalyticsService.getDashboardStats.bind(AnalyticsService),
  getCycleStatusDistribution: AnalyticsService.getCycleStatusDistribution.bind(AnalyticsService),
  getProblemThemeDistribution: AnalyticsService.getProblemThemeDistribution.bind(AnalyticsService),
  getNifStageCounts: AnalyticsService.getNifStageCounts.bind(AnalyticsService),
  getImpactSummary: AnalyticsService.getImpactSummary.bind(AnalyticsService),
  getStepCompletionRates: AnalyticsService.getStepCompletionRates.bind(AnalyticsService),
};
