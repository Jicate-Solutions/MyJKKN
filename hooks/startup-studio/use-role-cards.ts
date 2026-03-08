// hooks/startup-studio/use-role-cards.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RoleCardService } from '@/lib/services/startup-studio/role-card-service';
import type { CreateRoleCardDto } from '@/types/startup-studio';
import { useAuth } from '@/hooks/use-auth';

/** Fetch the current user's role card for a submission (null = not yet submitted). */
export function useMyRoleCard(submissionId: string | undefined) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['my-role-card', submissionId, profile?.id],
    queryFn: () => RoleCardService.getMyRoleCard(submissionId!, profile!.id),
    enabled: !!submissionId && !!profile?.id,
    staleTime: 30_000,
  });
}

/** Fetch all role cards for a team's submission — used for progress badge. */
export function useTeamRoleCards(submissionId: string | undefined) {
  return useQuery({
    queryKey: ['team-role-cards', submissionId],
    queryFn: () => RoleCardService.getTeamRoleCards(submissionId!),
    enabled: !!submissionId,
    staleTime: 15_000,
  });
}

/** Submit the current user's role card (one-time, no edit after submit). */
export function useSubmitRoleCard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateRoleCardDto) => RoleCardService.createRoleCard(dto),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['my-role-card', variables.submission_id] });
      queryClient.invalidateQueries({ queryKey: ['team-role-cards', variables.submission_id] });
    },
  });
}
