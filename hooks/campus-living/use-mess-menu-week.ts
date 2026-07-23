'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { usePermissions } from '@/hooks/use-permissions';
import { MessMenuService } from '@/lib/services/campus-living/mess-menu-service';
import type { MealType, MenuStatus, TierKey } from '@/types/campus-living';
import { messMenuKeys } from './use-mess-menus';

/**
 * Tier-aware weekly menu hooks (PR 3).
 * Companion to the legacy `useMessMenus` / `useWeeklyMenu` in
 * `use-mess-menus.ts` which remain untouched for back-compat.
 *
 * 1hr staleTime — menu data changes a few times per week at most.
 */

const ONE_HOUR_MS = 60 * 60 * 1000;

export const messMenuWeekKeys = {
  all: ['mess-menus', 'week-tier'] as const,
  // catererId is appended (defaulting to 'any') so Boys and Girls grids — which
  // share an (institution, week, tier) but differ by caterer — cache separately.
  week: (institutionId: string, weekStartDate: string, tierKey: TierKey, catererId?: string) =>
    ['mess-menus', 'week-tier', institutionId, weekStartDate, tierKey, catererId ?? 'any'] as const,
  tiers: (institutionId: string) => ['mess-menus', 'active-tiers', institutionId] as const,
};

/**
 * 28 rows (7 days × 4 meal slots) for a single tier in a week.
 * When `catererId` is supplied the fetch is scoped to that caterer (gender),
 * so Boys and Girls menus stay separate. Omitting it preserves the legacy
 * tier-only fetch used by the resident menu view.
 */
export function useMessMenuWeek(
  institutionId: string | undefined,
  weekStartDate: string,
  tierKey: TierKey | undefined,
  catererId?: string,
) {
  const { isSuperAdmin } = usePermissions();
  const enabled = !!institutionId && !!weekStartDate && !!tierKey;
  return useQuery({
    queryKey: messMenuWeekKeys.week(
      institutionId ?? 'all',
      weekStartDate,
      (tierKey ?? 'classic') as TierKey,
      catererId,
    ),
    queryFn: () =>
      MessMenuService.getMenuForWeek(
        // Scoped fetch — super_admin still passes through but service requires an institution_id.
        institutionId!,
        weekStartDate,
        tierKey!,
        catererId,
      ),
    enabled: enabled && (isSuperAdmin || !!institutionId),
    staleTime: ONE_HOUR_MS,
  });
}

/**
 * Distinct tier_key values seeded for an institution. Drives the
 * admin tier-selector + the resident menu-view tier picker.
 *
 * 6hr staleTime — adding a new tier_key is a once-per-semester event.
 */
export function useActiveMessTiers(institutionId: string | undefined) {
  return useQuery({
    queryKey: messMenuWeekKeys.tiers(institutionId ?? 'all'),
    queryFn: () => MessMenuService.getActiveTiers(institutionId!),
    enabled: !!institutionId,
    staleTime: 6 * ONE_HOUR_MS,
  });
}

/**
 * Single-cell upsert mutation. Respects the
 * `mess.menu.edit_cutoff_minutes` policy (default 120) at the service
 * layer — UI will see a thrown Error with prefix "meal cutoff exceeded"
 * when the edit window has closed.
 *
 * On success, invalidates both the legacy menu keys (for older list views)
 * and the tier-aware week key (admin grid editor).
 */
export interface UpsertMenuCellInput {
  institution_id: string;
  caterer_id: string;
  week_start_date: string;
  day_of_week: number;
  meal_type: MealType;
  tier_key: TierKey;
  items_tamil?: string[] | null;
  items_english?: string[] | null;
  items?: string[];
  status?: MenuStatus;
  is_special_day?: boolean | null;
  special_day_name?: string | null;
  dietary_tags?: string[] | null;
}

export function useUpsertMessMenuCell() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertMenuCellInput) => MessMenuService.upsertMenuCell(input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: messMenuWeekKeys.week(
          variables.institution_id,
          variables.week_start_date,
          variables.tier_key,
          variables.caterer_id,
        ),
      });
      // Also invalidate the whole week-tier family so any non-caterer-scoped
      // grids (legacy resident view) refresh too.
      queryClient.invalidateQueries({ queryKey: messMenuWeekKeys.all });
      queryClient.invalidateQueries({ queryKey: messMenuKeys.all });
      toast.success('Menu cell saved');
    },
    onError: (error: Error) => {
      // Surface the cutoff message verbatim — service-layer formats it for end-user reading.
      toast.error(error.message);
    },
  });
}

/**
 * "Copy last week → this week" mutation. Seeds the target week from the most
 * recent prior week's cells (status 'planned', idempotent) so publishing a
 * weekly menu is two clicks instead of 28 cell edits — keeping the weekly menu
 * (and the Choose Your Menu loop's rating baseline) alive.
 *
 * On success, invalidates the target week key + the whole week-tier family so
 * the grid re-renders with the copied cells.
 */
export interface CopyMenuWeekInput {
  institutionId: string;
  catererId: string;
  tierKey: TierKey;
  targetWeekStart: string;
}

export function useCopyMessMenuWeek() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CopyMenuWeekInput) => MessMenuService.copyWeekForward(input),
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({
        queryKey: messMenuWeekKeys.week(
          variables.institutionId,
          variables.targetWeekStart,
          variables.tierKey,
          variables.catererId,
        ),
      });
      queryClient.invalidateQueries({ queryKey: messMenuWeekKeys.all });
      queryClient.invalidateQueries({ queryKey: messMenuKeys.all });

      if (!result.sourceWeek) {
        toast.info('No earlier week to copy from — fill the grid manually.');
      } else if (result.copied === 0) {
        toast.info(`Already filled from week of ${result.sourceWeek} — nothing to copy.`);
      } else {
        toast.success(
          `Copied ${result.copied} cell${result.copied === 1 ? '' : 's'} from week of ${result.sourceWeek}` +
            (result.skipped ? ` (${result.skipped} already filled, kept)` : '') +
            '. Review, edit, then publish.',
        );
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });
}
