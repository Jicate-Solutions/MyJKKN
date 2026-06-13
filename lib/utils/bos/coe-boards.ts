import { CoeRestClient } from '@/lib/services/coe/coe-rest-client';
import { resolveCoeInstitutionCode } from '@/lib/utils/bos/bos-access';

export interface CoeBoard {
  id: string;
  board_code: string;
  board_name: string;
  board_type?: string | null;
  institutions_id?: string;
  is_active?: boolean;
}

/**
 * Fetches all boards for a single MyJKKN institution UUID from the COE API.
 * Returns an empty map on any error (permission denied, unavailable, etc.).
 */
export async function fetchCoeBoardMap(
  myJkknInstitutionId: string
): Promise<Map<string, CoeBoard>> {
  try {
    const institutionCode = await resolveCoeInstitutionCode(myJkknInstitutionId);
    if (!institutionCode) {
      console.warn('[fetchCoeBoardMap] no COE institution_code resolved for myJkknId=%s', myJkknInstitutionId);
      return new Map();
    }
    const coe = CoeRestClient.create();
    const raw = await coe.get<unknown>('/api/public/boards', {
      institution_code: institutionCode,
    });
    const boards: CoeBoard[] = Array.isArray(raw)
      ? (raw as CoeBoard[])
      : (((raw as { data?: CoeBoard[] })?.data) ?? []);
    if (boards.length === 0) {
      console.warn('[fetchCoeBoardMap] COE returned 0 boards for institution_code=%s (myJkknId=%s, raw shape: %s)',
        institutionCode, myJkknInstitutionId, Array.isArray(raw) ? 'array' : typeof raw);
    }
    return new Map(boards.map((b) => [b.id, b]));
  } catch (err) {
    console.error('[fetchCoeBoardMap] failed for myJkknId=%s:', myJkknInstitutionId, err);
    return new Map();
  }
}

/**
 * Fetches and merges board maps for multiple MyJKKN institution UUIDs.
 * CAS institutions (same COE ID) deduplicate naturally since they map to
 * the same COE institution and return the same board set.
 */
export async function fetchCoeBoardMaps(
  myJkknInstitutionIds: string[]
): Promise<Map<string, CoeBoard>> {
  const unique = [...new Set(myJkknInstitutionIds.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const maps = await Promise.all(unique.map(fetchCoeBoardMap));
  const merged = new Map<string, CoeBoard>();
  for (const m of maps) {
    for (const [id, board] of m) merged.set(id, board);
  }
  return merged;
}
