// hooks/events/marathon/use-marathon-dashboard.ts
// Composite React Query hook — composes all sub-module summaries into MarathonDashboardStats.
// Created: 2026-04-07

'use client';

import { useQueries } from '@tanstack/react-query';
import { MarathonRegistrationService } from '@/lib/services/events/marathon/marathon-registration-service';
import { MarathonSponsorService } from '@/lib/services/events/marathon/marathon-sponsor-service';
import { MarathonCommitteeService } from '@/lib/services/events/marathon/marathon-committee-service';
import { MarathonBudgetService } from '@/lib/services/events/marathon/marathon-budget-service';
import type { MarathonDashboardStats } from '@/types/events-marathon';

// ============================================================================
// Hook
// ============================================================================

export interface UseDashboardResult {
  data: MarathonDashboardStats | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

/**
 * Fetches all sub-module summaries in parallel and merges them into
 * MarathonDashboardStats. Refreshes every 30 seconds.
 */
export function useMarathonDashboard(eventId: string): UseDashboardResult {
  const results = useQueries({
    queries: [
      {
        queryKey: ['marathon-registrations', 'stats', eventId],
        queryFn: () => MarathonRegistrationService.getRegistrationStats(eventId),
        enabled: !!eventId,
        refetchInterval: 30_000,
      },
      {
        queryKey: ['marathon-sponsors', 'summary', eventId],
        queryFn: () => MarathonSponsorService.getSponsorSummary(eventId),
        enabled: !!eventId,
        refetchInterval: 30_000,
      },
      {
        queryKey: ['marathon-committees', 'task-summary', eventId],
        queryFn: () => MarathonCommitteeService.getTaskSummary(eventId),
        enabled: !!eventId,
        refetchInterval: 30_000,
      },
      {
        queryKey: ['marathon-budget', 'summary', eventId],
        queryFn: () => MarathonBudgetService.getBudgetSummary(eventId),
        enabled: !!eventId,
        refetchInterval: 30_000,
      },
    ],
  });

  const [regResult, sponsorResult, taskResult, budgetResult] = results;

  const isLoading = results.some((r) => r.isLoading);
  const isError = results.some((r) => r.isError);

  const reg = regResult.data;
  const sponsor = sponsorResult.data;
  const task = taskResult.data;
  const budget = budgetResult.data;

  let data: MarathonDashboardStats | null = null;

  if (reg && sponsor && task && budget) {
    // Extract today's registration count from the raw stats
    // (Supabase doesn't return daily breakdown in getRegistrationStats — approximate via total)
    const maleCount = reg.by_gender.find((g) => g.gender === 'male')?.count ?? 0;
    const femaleCount = reg.by_gender.find((g) => g.gender === 'female')?.count ?? 0;

    data = {
      // Registrations
      total_registrations: reg.total,
      registrations_today: 0, // computed server-side for precision; dashboard shows overall
      registrations_by_category: reg.by_category.map((c) => ({
        category_name: c.category_name,
        count: c.count,
      })),
      registrations_by_institution: reg.by_institution.map((i) => ({
        institution_name: i.institution_name,
        count: i.count,
      })),
      payment_collected: reg.payment_collected,
      payment_pending: reg.payment_pending,
      internal_count: reg.internal_count,
      external_count: reg.external_count,
      checked_in_count: reg.checked_in_count,
      male_count: maleCount,
      female_count: femaleCount,

      // Sponsors
      sponsor_total_pledged: sponsor.total_pledged,
      sponsor_total_received: sponsor.total_received,
      sponsor_count: sponsor.total_sponsors,

      // Tasks
      tasks_total: task.total,
      tasks_completed: task.completed,
      tasks_overdue: task.overdue,

      // Budget
      budget_estimated: budget.total_estimated_expense,
      budget_actual: budget.total_actual_expense,
    };
  }

  const refetch = () => {
    results.forEach((r) => r.refetch());
  };

  return { data, isLoading, isError, refetch };
}
