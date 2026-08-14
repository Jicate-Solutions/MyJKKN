/**
 * GET /api/solutions/digest — the Solutions Hub weekly-digest numbers, on demand.
 *
 * Same compute as the Monday cron notification (lib/solutions/digest.ts), run
 * under the CALLER's RLS client so the page shows exactly what this user may
 * see. Gated on the existing solutions.dashboard.view key (deliberately reused
 * — a freshly minted key would be true on almost no role, the trap hit three
 * times the week of 2026-08-13).
 */

import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/with-auth';
import { createClient } from '@/lib/supabase/server';
import { computeSolutionsDigest } from '@/lib/solutions/digest';
import { successApiResponse } from '@/lib/api/response';
import { corsHeaders } from '@/lib/api-keys/cors';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export const GET = withAuth(
  async () => {
    const supabase = await createClient();
    const digest = await computeSolutionsDigest(supabase);
    return successApiResponse(digest);
  },
  { requiredPermission: 'read', requirePermission: 'solutions.dashboard.view' },
);
