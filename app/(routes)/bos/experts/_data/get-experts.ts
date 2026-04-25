/**
 * Server-side data fetching for BoS External Expert Directory.
 *
 * NOTE: Unlike other academic _data files, this calls the MyJKKN proxy API
 * route (app/api/bos/experts/) rather than querying Supabase directly.
 * The BoS data lives in the COE database, which is only accessible via proxy.
 */

import { headers } from 'next/headers';
import { BosExpertFilters, BosListResponse, BosExternalExpert } from '@/types/bos';

export async function getExperts(
  filters: BosExpertFilters = {}
): Promise<BosListResponse<BosExternalExpert>> {
  const headersList = await headers();
  const host = headersList.get('host') ?? 'localhost:3000';
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';

  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  });

  const res = await fetch(
    `${protocol}://${host}/api/bos/experts?${params.toString()}`,
    {
      // No-store: server components should always get fresh data
      cache: 'no-store',
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to fetch experts' }));
    throw new Error(err.error ?? 'Failed to fetch experts');
  }

  return res.json();
}
