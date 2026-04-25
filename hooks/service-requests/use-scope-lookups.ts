'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';

/**
 * Fetches all organization entities that service-type scope arrays can reference,
 * and returns id→name lookup Maps. Subject to RLS — only entities the current
 * user can read will resolve; unknown ids should be displayed with a fallback.
 */
export function useScopeLookups() {
  const supabase = createClientSupabaseClient();

  const query = useQuery({
    queryKey: ['service-requests', 'scope-lookups'],
    staleTime: 5 * 60 * 1000, // 5 min — org data rarely changes
    queryFn: async () => {
      const [instRes, degRes, deptRes, progRes] = await Promise.all([
        supabase.from('institutions').select('id, name'),
        supabase.from('degrees').select('id, degree_name'),
        supabase.from('departments').select('id, department_name'),
        supabase.from('programs').select('id, program_name'),
      ]);

      return {
        institutions: (instRes.data ?? []) as Array<{ id: string; name: string }>,
        degrees: (degRes.data ?? []) as Array<{ id: string; degree_name: string }>,
        departments: (deptRes.data ?? []) as Array<{
          id: string;
          department_name: string;
        }>,
        programs: (progRes.data ?? []) as Array<{ id: string; program_name: string }>,
      };
    },
  });

  const maps = useMemo(() => {
    const institutions = new Map<string, string>();
    const degrees = new Map<string, string>();
    const departments = new Map<string, string>();
    const programs = new Map<string, string>();

    query.data?.institutions.forEach((i) => institutions.set(i.id, i.name));
    query.data?.degrees.forEach((d) => degrees.set(d.id, d.degree_name));
    query.data?.departments.forEach((d) =>
      departments.set(d.id, d.department_name)
    );
    query.data?.programs.forEach((p) => programs.set(p.id, p.program_name));

    return { institutions, degrees, departments, programs };
  }, [query.data]);

  return {
    ...maps,
    isLoading: query.isLoading,
    error: query.error,
  };
}

/**
 * Resolves the display names for a service type's scope arrays. Returns an
 * empty array for scope_level === 'common'. Unknown ids (e.g. RLS-hidden or
 * deleted) fall back to a short fingerprint so the row still communicates
 * "there's something here I can't resolve."
 */
export function resolveScopeNames(
  scopeLevel: string,
  ids: string[] | null | undefined,
  lookups: ReturnType<typeof useScopeLookups>
): string[] {
  if (!ids || ids.length === 0) return [];
  const map =
    scopeLevel === 'institution'
      ? lookups.institutions
      : scopeLevel === 'degree'
      ? lookups.degrees
      : scopeLevel === 'department'
      ? lookups.departments
      : scopeLevel === 'program'
      ? lookups.programs
      : null;
  if (!map) return [];
  return ids.map((id) => map.get(id) ?? `${id.slice(0, 8)}…`);
}
