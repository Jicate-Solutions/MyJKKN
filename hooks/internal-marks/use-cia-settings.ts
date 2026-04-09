import { useQuery } from '@tanstack/react-query';
import { CiaSettingsService } from '@/lib/services/internal-marks/cia-settings-service';
import { academicKeys } from '@/lib/query-keys';
import { QUERY_CONFIG } from '@/lib/config/query-config';

/**
 * Fetches exam sessions for the user's MyJKKN institution.
 */
export function useExamSessions(institutionId: string | undefined) {
  return useQuery({
    queryKey: [...academicKeys.internalMarks.all, 'exam-sessions', institutionId],
    queryFn: () => CiaSettingsService.getExamSessions(institutionId!),
    enabled: !!institutionId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

/**
 * Fetches CIA settings for institution + exam session.
 */
export function useCiaSettings(
  institutionId: string | undefined,
  examSessionId: string | undefined,
  programCode?: string
) {
  return useQuery({
    queryKey: academicKeys.internalMarks.settings.detail(
      institutionId ?? '',
      examSessionId ?? ''
    ),
    queryFn: () =>
      CiaSettingsService.getCiaSettings({
        institutionId: institutionId!,
        examSessionId: examSessionId!,
        programCode,
      }),
    enabled: !!institutionId && !!examSessionId,
    placeholderData: (previousData) => previousData,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}
