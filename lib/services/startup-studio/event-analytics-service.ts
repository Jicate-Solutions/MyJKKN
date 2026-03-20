// lib/services/startup-studio/event-analytics-service.ts

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { EventService } from './event-service';
import { EventVenueService } from './event-venue-service';
import { AudienceVoteService } from './audience-vote-service';
import { EventChecklistService } from './event-checklist-service';
import type { LearnerParticipationStats, EventVenueAssignment } from '@/types/startup-studio';

// ─── Exported Interfaces ──────────────────────────────────────────────────────

export interface DashboardKPIs {
  totalTeams: number;
  checkedInTeams: number;
  totalMembers: number;
  membersWithLaptops: number;
  institutionsCount: number;
  submissionsCount: number;
}

export interface TierDistribution {
  tier: number;
  label: string;
  count: number;
  color: string;
}

export interface AttendanceSummary {
  buildDay: { present: number; absent: number; late: number; unmarked: number; total: number };
  demoDay: { present: number; absent: number; late: number; unmarked: number; total: number };
  byVenue: Array<{
    venueName: string;
    dayType: string;
    present: number;
    absent: number;
    late: number;
  }>;
}

export interface VerificationSummary {
  pending: number;
  verified: number;
  flagged: number;
  disqualified: number;
  total: number;
}

export interface VotingOverview {
  isOpen: boolean;
  totalVotes: number;
  averageRating: number;
  topTeams: Array<{
    teamName: string;
    appName: string | null;
    totalVotes: number;
    averageRating: number;
  }>;
}

export interface SubmissionMetrics {
  teamsSubmitted: number;
  teamsWithLiveApp: number;
  teamsWithRevenue: number;
  tierDistribution: TierDistribution[];
  totalMrrClaimed: number;
  avgMrrClaimed: number;
}

export interface ChecklistProgress {
  phase: string;
  total: number;
  completed: number;
  percentage: number;
}

export interface InstitutionBreakdownItem {
  institution_name: string;
  participated: number;
}

// ─── Tier metadata ────────────────────────────────────────────────────────────

const TIER_LABELS = ['No Submission', 'Live App', '5+ Users', '10+ Users', 'Revenue', 'Strong Revenue'];
const TIER_COLORS = ['#94a3b8', '#3b82f6', '#22c55e', '#a855f7', '#f59e0b', '#ef4444'];

// ─── Service ──────────────────────────────────────────────────────────────────

export class EventAnalyticsService {
  private static get supabase(): any {
    return createClientSupabaseClient();
  }

  // ── 1. KPIs ────────────────────────────────────────────────────────────────
  static async getKPIs(eventId: string): Promise<DashboardKPIs> {
    const [stats, submissionsResult] = await Promise.all([
      EventService.getEventStats(eventId),
      EventAnalyticsService.supabase
        .from('event_submissions')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', eventId)
        .not('submitted_at', 'is', null),
    ]);

    const { count: submissionsCount, error: subErr } = submissionsResult;
    if (subErr) {
      console.error('[startup/analytics] getKPIs submissions count failed:', subErr);
      // Don't throw — return 0 gracefully so dashboard still loads
    }

    return {
      totalTeams: stats?.total_teams ?? 0,
      checkedInTeams: stats?.checked_in_teams ?? 0,
      totalMembers: stats?.total_members ?? 0,
      membersWithLaptops: stats?.members_with_laptops ?? 0,
      institutionsCount: stats?.institutions ?? 0,
      submissionsCount: submissionsCount ?? 0,
    };
  }

  // ── 2. Submission Metrics ─────────────────────────────────────────────────
  static async getSubmissionMetrics(eventId: string): Promise<SubmissionMetrics> {
    const { data, error } = await EventAnalyticsService.supabase
      .from('event_submissions')
      .select('tier_level, live_app_url, mrr_amount')
      .eq('event_id', eventId);

    if (error) {
      console.error('[startup/analytics] getSubmissionMetrics failed:', error);
      throw error;
    }

    const rows: Array<{ tier_level: number | null; live_app_url: string | null; mrr_amount: number | null }> =
      data ?? [];

    if (rows.length === 0) {
      return {
        teamsSubmitted: 0,
        teamsWithLiveApp: 0,
        teamsWithRevenue: 0,
        tierDistribution: TIER_LABELS.map((label, tier) => ({
          tier,
          label,
          count: 0,
          color: TIER_COLORS[tier],
        })),
        totalMrrClaimed: 0,
        avgMrrClaimed: 0,
      };
    }

    const tierCounts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let teamsWithLiveApp = 0;
    let teamsWithRevenue = 0;
    let totalMrr = 0;

    for (const row of rows) {
      const tier = row.tier_level ?? 0;
      if (tier >= 0 && tier <= 5) tierCounts[tier] = (tierCounts[tier] ?? 0) + 1;

      if (row.live_app_url && row.live_app_url.trim() !== '') teamsWithLiveApp++;

      const mrr = Number(row.mrr_amount ?? 0);
      if (mrr > 0) {
        teamsWithRevenue++;
        totalMrr += mrr;
      }
    }

    const tierDistribution: TierDistribution[] = TIER_LABELS.map((label, tier) => ({
      tier,
      label,
      count: tierCounts[tier] ?? 0,
      color: TIER_COLORS[tier],
    }));

    return {
      teamsSubmitted: rows.length,
      teamsWithLiveApp,
      teamsWithRevenue,
      tierDistribution,
      totalMrrClaimed: totalMrr,
      avgMrrClaimed: teamsWithRevenue > 0 ? totalMrr / teamsWithRevenue : 0,
    };
  }

  // ── 3. Attendance Summary ─────────────────────────────────────────────────
  static async getAttendanceSummary(eventId: string): Promise<AttendanceSummary> {
    // Fetch attendance maps for both day types, venue names, and total team count in parallel
    const [buildDayMap, demoDayMap, buildDayVenues, demoDayVenues, registrationsResult] =
      await Promise.all([
        EventVenueService.getEventAttendanceMap(eventId, 'build_day'),
        EventVenueService.getEventAttendanceMap(eventId, 'demo_day'),
        EventVenueService.getVenues(eventId, 'build_day'),
        EventVenueService.getVenues(eventId, 'demo_day'),
        EventAnalyticsService.supabase
          .from('event_registrations')
          .select('id', { count: 'exact', head: true })
          .eq('event_id', eventId),
      ]);

    const { count: regCount, error: regCountErr } = registrationsResult;
    if (regCountErr) {
      console.error('[startup/analytics] getAttendanceSummary team count failed:', regCountErr);
      // Continue with 0 unmarked rather than crashing
    }
    const totalTeams: number = regCount ?? 0;

    // Helper: resolve a human-readable venue name from EventVenueAssignment
    const resolveVenueName = (venue: EventVenueAssignment): string =>
      venue.manual_name ?? venue.institution?.name ?? 'Unknown Venue';

    // Aggregate totals for each day type
    const aggregate = (
      map: Record<string, { present: number; absent: number; late: number; excused: number; total: number }>
    ) => {
      let present = 0;
      let absent = 0;
      let late = 0;
      let marked = 0;

      for (const entry of Object.values(map)) {
        present += entry.present ?? 0;
        absent += entry.absent ?? 0;
        late += entry.late ?? 0;
        marked += entry.total ?? 0;
      }

      return { present, absent, late, marked };
    };

    const buildAgg = aggregate(buildDayMap);
    const demoAgg = aggregate(demoDayMap);

    // Build per-venue rows
    const byVenue: AttendanceSummary['byVenue'] = [];

    for (const venue of buildDayVenues) {
      const entry = buildDayMap[venue.id];
      if (!entry) continue;
      byVenue.push({
        venueName: resolveVenueName(venue),
        dayType: 'build_day',
        present: entry.present ?? 0,
        absent: entry.absent ?? 0,
        late: entry.late ?? 0,
      });
    }

    for (const venue of demoDayVenues) {
      const entry = demoDayMap[venue.id];
      if (!entry) continue;
      byVenue.push({
        venueName: resolveVenueName(venue),
        dayType: 'demo_day',
        present: entry.present ?? 0,
        absent: entry.absent ?? 0,
        late: entry.late ?? 0,
      });
    }

    return {
      buildDay: {
        present: buildAgg.present,
        absent: buildAgg.absent,
        late: buildAgg.late,
        unmarked: Math.max(0, totalTeams - buildAgg.marked),
        total: totalTeams,
      },
      demoDay: {
        present: demoAgg.present,
        absent: demoAgg.absent,
        late: demoAgg.late,
        unmarked: Math.max(0, totalTeams - demoAgg.marked),
        total: totalTeams,
      },
      byVenue,
    };
  }

  // ── 4. Verification Summary ───────────────────────────────────────────────
  static async getVerificationSummary(eventId: string): Promise<VerificationSummary> {
    const { data, error } = await EventAnalyticsService.supabase
      .from('appathon_verifications')
      .select('verification_status, event_submissions(event_id)')
      .eq('event_submissions.event_id', eventId);

    if (error) {
      console.error('[startup/analytics] getVerificationSummary failed:', error);
      throw error;
    }

    const rows: Array<{ verification_status: string }> = data ?? [];

    const counts = { pending: 0, verified: 0, flagged: 0, disqualified: 0 };
    for (const row of rows) {
      const status = row.verification_status as keyof typeof counts;
      if (status in counts) counts[status]++;
    }

    return {
      ...counts,
      total: rows.length,
    };
  }

  // ── 5. Voting Overview ────────────────────────────────────────────────────
  static async getVotingOverview(
    eventId: string,
    event: { voting_opened_at: string | null; voting_closed_at: string | null }
  ): Promise<VotingOverview> {
    const [summaries, regData] = await Promise.all([
      AudienceVoteService.getVoteSummaries(eventId),
      EventAnalyticsService.supabase
        .from('event_registrations')
        .select('id, team_name, event_submissions(id, app_name)')
        .eq('event_id', eventId),
    ]);

    if (regData.error) {
      console.error('[startup/analytics] getVotingOverview team name fetch failed:', regData.error);
      // Continue with empty map — votes will show without team names
    }

    // Build a map: submission_id → { teamName, appName }
    const submissionMeta = new Map<string, { teamName: string; appName: string | null }>();
    for (const reg of regData.data ?? []) {
      for (const sub of (reg.event_submissions ?? []) as Array<{ id: string; app_name: string | null }>) {
        submissionMeta.set(sub.id, {
          teamName: reg.team_name ?? 'Unknown',
          appName: sub.app_name ?? null,
        });
      }
    }

    const isOpen = !!event.voting_opened_at && !event.voting_closed_at;

    let totalVotes = 0;
    let ratingSum = 0;
    let ratingCount = 0;

    for (const s of summaries) {
      totalVotes += s.total_votes ?? 0;
      if ((s.total_votes ?? 0) > 0) {
        ratingSum += (s.average_rating ?? 0) * (s.total_votes ?? 0);
        ratingCount += s.total_votes ?? 0;
      }
    }

    const averageRating = ratingCount > 0 ? ratingSum / ratingCount : 0;

    const topTeams = summaries
      .filter(s => (s.total_votes ?? 0) > 0)
      .sort((a, b) => (b.average_rating ?? 0) - (a.average_rating ?? 0))
      .slice(0, 10)
      .map(s => {
        const meta = submissionMeta.get(s.submission_id);
        return {
          teamName: meta?.teamName ?? 'Unknown',
          appName: meta?.appName ?? null,
          totalVotes: s.total_votes ?? 0,
          averageRating: s.average_rating ?? 0,
        };
      });

    return { isOpen, totalVotes, averageRating, topTeams };
  }

  // ── 6. Checklist Progress ─────────────────────────────────────────────────
  static async getChecklistProgress(eventId: string): Promise<ChecklistProgress[]> {
    const checklists = await EventChecklistService.getChecklists(eventId);

    // Group by phase
    const phaseMap = new Map<string, { total: number; completed: number }>();

    for (const checklist of checklists) {
      const phase = checklist.phase ?? 'unknown';
      if (!phaseMap.has(phase)) phaseMap.set(phase, { total: 0, completed: 0 });

      const entry = phaseMap.get(phase)!;

      for (const item of checklist.items ?? []) {
        entry.total++;
        // An item is completed if it has at least one completion record
        const completionArr = Array.isArray(item.completion)
          ? item.completion
          : item.completion
          ? [item.completion]
          : [];
        if (completionArr.length > 0) entry.completed++;
      }
    }

    return Array.from(phaseMap.entries()).map(([phase, { total, completed }]) => ({
      phase,
      total,
      completed,
      percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
    }));
  }

  // ── 7. Institution Breakdown ──────────────────────────────────────────────
  static async getInstitutionBreakdown(eventId: string): Promise<InstitutionBreakdownItem[]> {
    const { data, error } = await this.supabase
      .from('event_registrations')
      .select('institution_id, institutions(name)')
      .eq('event_id', eventId);

    if (error) {
      console.error('[startup/analytics] getInstitutionBreakdown failed:', error);
      return [];
    }

    // Group by institution and count teams
    const countMap = new Map<string, { name: string; count: number }>();
    for (const row of data ?? []) {
      const institutionId = row.institution_id as string;
      const institutionName = (row.institutions as { name?: string } | null)?.name ?? 'Unknown';
      const existing = countMap.get(institutionId);
      if (existing) {
        existing.count++;
      } else {
        countMap.set(institutionId, { name: institutionName, count: 1 });
      }
    }

    return Array.from(countMap.values())
      .map(({ name, count }) => ({ institution_name: name, participated: count }))
      .sort((a, b) => b.participated - a.participated);
  }
}
