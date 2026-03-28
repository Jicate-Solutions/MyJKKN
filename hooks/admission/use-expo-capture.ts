import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { ExpoService } from '@/lib/services/admission/expo-service';
import { useExpoTeamMembers } from './use-expos';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';

// ═══════════════════════════════════════════════════════════════════════════
// QUERY KEY FACTORY
// ═══════════════════════════════════════════════════════════════════════════

export const expoCaptureKeys = {
  all: ['expo-capture'] as const,
  stats: (eventId: string) => [...expoCaptureKeys.all, 'stats', eventId] as const,
  myStats: (eventId: string, userId: string) =>
    [...expoCaptureKeys.all, 'my-stats', eventId, userId] as const,
  topCapturers: (eventId: string) => [...expoCaptureKeys.all, 'top-capturers', eventId] as const,
  actualCount: (eventId: string) => [...expoCaptureKeys.all, 'actual-count', eventId] as const,
};

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface ExpoCaptureStats {
  myCount: number;
  teamCount: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Polls capture stats for a specific expo event — personal count + team total.
 * Refreshes every 30 seconds for "live enough" updates without Supabase Realtime.
 */
export function useExpoCaptureStats(eventId: string, currentUserId: string) {
  return useQuery({
    queryKey: expoCaptureKeys.myStats(eventId, currentUserId),
    queryFn: async (): Promise<ExpoCaptureStats> => {
      const supabase = createClientSupabaseClient();

      // Team total: count leads linked to this expo event
      const { count: teamCount, error: teamError } = await (supabase as any)
        .from('admission_leads')
        .select('id', { count: 'exact', head: true })
        .eq('expo_event_id', eventId);

      if (teamError) {
        console.error('[expo-capture] Failed to fetch team stats:', teamError);
      }

      // Personal count: leads captured by current user for this event
      const { count: myCount, error: myError } = await (supabase as any)
        .from('admission_leads')
        .select('id', { count: 'exact', head: true })
        .eq('expo_event_id', eventId)
        .eq('captured_by', currentUserId);

      if (myError) {
        console.error('[expo-capture] Failed to fetch my stats:', myError);
      }

      return {
        myCount: myCount ?? 0,
        teamCount: teamCount ?? 0,
      };
    },
    enabled: !!eventId && !!currentUserId,
    refetchInterval: 30_000, // Poll every 30 seconds
    staleTime: 15_000,
  });
}

/**
 * Get top lead capturers for an expo event — ranked leaderboard data.
 */
export function useExpoTopCapturers(eventId: string) {
  return useQuery({
    queryKey: expoCaptureKeys.topCapturers(eventId),
    queryFn: () => ExpoService.getTopCapturers(eventId),
    enabled: !!eventId,
    staleTime: 30_000,
  });
}

/**
 * Get actual CRM lead count for an expo event (not the manual counter).
 */
export function useExpoActualLeadCount(eventId: string) {
  return useQuery({
    queryKey: expoCaptureKeys.actualCount(eventId),
    queryFn: () => ExpoService.getActualLeadCount(eventId),
    enabled: !!eventId,
    staleTime: 30_000,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPO TEAM ACCESS — Role-based access control for expo pages
// ═══════════════════════════════════════════════════════════════════════════

interface ExpoTeamAccess {
  isLoading: boolean;
  isTeamMember: boolean;
  isTeamLeader: boolean;
  isAdmin: boolean;           // super_admin or admission role
  canViewExpo: boolean;       // team member, team leader, or admin
  canCapture: boolean;        // team member, team leader, or admin
  canSubmitReport: boolean;   // team leader or admin only
  canEditExpo: boolean;       // admin only
  currentUserId: string | undefined;
}

/**
 * Determines user's access level for a specific expo event.
 *
 * Access matrix:
 * - Team Member:  view own expo ✅ | capture ✅ | daily report ❌
 * - Team Leader:  view own expo ✅ | capture ✅ | daily report ✅
 * - Admission:    view all ✅ | capture ✅ | daily report ✅
 * - Super Admin:  view all ✅ | capture ✅ | daily report ✅
 */
export function useExpoTeamAccess(eventId: string): ExpoTeamAccess {
  const { profile } = useAuth();
  const { isSuperAdmin, isAdmissionGlobalUser } = usePermissions();
  const { teamMembers, isLoading } = useExpoTeamMembers(eventId);

  const currentUserId = profile?.id;
  const isAdmin = isSuperAdmin || isAdmissionGlobalUser;

  const { isTeamMember, isTeamLeader } = useMemo(() => {
    if (!currentUserId || !teamMembers || teamMembers.length === 0) {
      return { isTeamMember: false, isTeamLeader: false };
    }

    const memberRecord = teamMembers.find(
      (m) => m.staff_id === currentUserId || m.student_id === currentUserId
    );

    return {
      isTeamMember: !!memberRecord,
      isTeamLeader: memberRecord?.role === 'team_leader',
    };
  }, [currentUserId, teamMembers]);

  return {
    isLoading,
    isTeamMember,
    isTeamLeader,
    isAdmin,
    canViewExpo: isTeamMember || isAdmin,
    canCapture: isTeamMember || isAdmin,
    canSubmitReport: isTeamLeader || isAdmin,
    canEditExpo: isAdmin,
    currentUserId,
  };
}
