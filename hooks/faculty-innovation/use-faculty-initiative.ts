// hooks/faculty-innovation/use-faculty-initiative.ts
// Single-record hook for a faculty initiative (detail view).

import { useQuery } from '@tanstack/react-query';
import { FacultyInitiativeService } from '@/lib/services/faculty-innovation/faculty-initiative-service';
import { FacultyInitiativeAuditService } from '@/lib/services/faculty-innovation/faculty-initiative-audit-service';
import { facultyInitiativeKeys } from './use-faculty-initiatives';
import type {
  FacultyInitiative,
  FacultyInitiativeAuditEntry,
} from '@/types/faculty-innovation';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function useFacultyInitiative(id?: string) {
  const query = useQuery<FacultyInitiative | null>({
    queryKey: facultyInitiativeKeys.detail(id ?? ''),
    queryFn: () => FacultyInitiativeService.getById(id!),
    enabled: !!id && UUID_REGEX.test(id),
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  return {
    initiative: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as Error | null,
    refetch: query.refetch,
  };
}

export function useFacultyInitiativeAuditTrail(id?: string) {
  const query = useQuery<FacultyInitiativeAuditEntry[]>({
    queryKey: [...facultyInitiativeKeys.detail(id ?? ''), 'audit'],
    queryFn: () => FacultyInitiativeAuditService.getAuditTrail(id!),
    enabled: !!id && UUID_REGEX.test(id),
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });

  return {
    entries: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as Error | null,
    refetch: query.refetch,
  };
}

export function useFacultyInitiativeCoinventors(id?: string) {
  const query = useQuery({
    queryKey: [...facultyInitiativeKeys.detail(id ?? ''), 'coinventors'],
    queryFn: () => FacultyInitiativeService.listCoinventors(id!),
    enabled: !!id && UUID_REGEX.test(id),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  return {
    coinventors: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
