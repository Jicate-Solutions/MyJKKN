'use client';

import { useQuery } from '@tanstack/react-query';

export interface BosProgramOption {
  id: string;
  program_code: string;
  program_name: string;
}

export interface BosRegulationOption {
  id: string;
  regulation_code: string;
  title: string;
  regulation_year: number;
}

function toIds(ids: string | string[] | undefined): string[] {
  if (!ids) return [];
  return Array.isArray(ids) ? ids.filter(Boolean) : [ids];
}

function buildParams(ids: string[]): string {
  if (ids.length === 1) return `institutionId=${ids[0]}`;
  return `institutionIds=${ids.join(',')}`;
}

export function useBosProgramOptions(
  institutionIds: string | string[] | undefined,
  // When set, the API restricts results to programmes the user has BoS board
  // membership for at this COE-side institution. Omit (super-admin) to see all.
  boardScopeInstitutionId?: string,
) {
  const ids = toIds(institutionIds);
  return useQuery<{ data: BosProgramOption[]; count: number }>({
    queryKey: ['bos', 'programs', boardScopeInstitutionId ?? 'all', ...ids.slice().sort()],
    enabled: ids.length > 0,
    queryFn: async () => {
      const params = buildParams(ids);
      const url = boardScopeInstitutionId
        ? `/api/bos/programs?${params}&boardScopeInstitutionId=${boardScopeInstitutionId}`
        : `/api/bos/programs?${params}`;
      const r = await fetch(url);
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to load programs');
      }
      return r.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useBosRegulationOptions(institutionIds: string | string[] | undefined) {
  const ids = toIds(institutionIds);
  return useQuery<{ data: BosRegulationOption[]; count: number }>({
    queryKey: ['bos', 'regulations', ...ids.slice().sort()],
    enabled: ids.length > 0,
    queryFn: async () => {
      const r = await fetch(`/api/bos/regulations?${buildParams(ids)}`);
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to load regulations');
      }
      return r.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}
