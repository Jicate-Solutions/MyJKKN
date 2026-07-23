/**
 * Parent Portal — server-side display-label lookups.
 *
 * Resolves the human labels the portal shows (institution name + entity_type,
 * program/section/department names) for a set of ids, in batched queries. Each
 * lookup is defensive: a failure resolves to an empty map rather than throwing,
 * so a missing label degrades to "—" instead of breaking the whole response.
 *
 * Node runtime only (service-role client).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { EntityType } from '@/types/parent-portal';
import { institutionLogo } from '@/lib/utils/parent-institution-logo';

const uniq = (ids: Array<string | null | undefined>): string[] =>
  [...new Set(ids.filter((x): x is string => !!x))];

async function nameMap(
  db: SupabaseClient,
  table: string,
  nameCol: string,
  ids: Array<string | null | undefined>
): Promise<Map<string, string>> {
  const list = uniq(ids);
  const out = new Map<string, string>();
  if (!list.length) return out;
  const { data, error } = await db.from(table).select(`id, ${nameCol}`).in('id', list);
  if (error || !data) return out;
  for (const row of data as unknown as Array<Record<string, unknown>>) {
    const id = row.id as string;
    const name = row[nameCol] as string | null;
    if (id && name) out.set(id, name);
  }
  return out;
}

export const resolveProgramNames = (db: SupabaseClient, ids: Array<string | null | undefined>) =>
  nameMap(db, 'programs', 'program_name', ids);

export const resolveSectionNames = (db: SupabaseClient, ids: Array<string | null | undefined>) =>
  nameMap(db, 'sections', 'section_name', ids);

export const resolveDepartmentNames = (db: SupabaseClient, ids: Array<string | null | undefined>) =>
  nameMap(db, 'departments', 'department_name', ids);

export interface InstitutionInfo {
  name: string;
  entityType: EntityType;
  logoUrl?: string;
}

export async function resolveInstitutions(
  db: SupabaseClient,
  ids: Array<string | null | undefined>
): Promise<Map<string, InstitutionInfo>> {
  const list = uniq(ids);
  const out = new Map<string, InstitutionInfo>();
  if (!list.length) return out;
  const { data, error } = await db
    .from('institutions')
    .select('id, name, entity_type, logo_url, counselling_code')
    .in('id', list);
  if (error || !data) return out;
  for (const row of data as unknown as Array<{
    id: string;
    name: string | null;
    entity_type: string | null;
    logo_url: string | null;
    counselling_code: string | null;
  }>) {
    out.set(row.id, {
      name: row.name ?? '',
      // Anything that isn't explicitly 'school' renders with college labels.
      entityType: row.entity_type === 'school' ? 'school' : 'institution',
      // Local /public/logo asset by counselling_code, else DB logo_url.
      logoUrl: institutionLogo(row.counselling_code, row.logo_url),
    });
  }
  return out;
}
