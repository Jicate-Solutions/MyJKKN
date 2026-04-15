export const dynamic = 'force-dynamic';

/**
 * POST /api/hr/dashboard/access-log
 *
 * Records one row per KPI rendered on a dashboard view (decision #18 —
 * granular KPI access logging, ~4-12 audit rows per page load). Server
 * stamps user_id from auth.uid() so the client can't spoof it; RLS policy
 * hdal_insert requires WITH CHECK (user_id = auth.uid()) anyway.
 *
 * Body shape:
 *   { entries: [
 *       { quadrant, kpi_name, scope, hr_organization_id?, institution_id? },
 *       ...
 *     ] }
 */

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import type { CookieOptions } from '@supabase/ssr';
import { HRDashboardService } from '@/lib/services/hr/dashboard-service';
import type { DashboardAccessLogEntry, DashboardScope } from '@/types/hr-dashboard';

async function getClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {}
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch {}
        },
      },
    }
  );
}

const VALID_SCOPES: DashboardScope[] = ['rolled-up', 'institution', 'hr-officer-own'];
const MAX_ENTRIES = 50; // Dashboard never renders more than ~12 KPIs; 50 is a generous ceiling

export async function POST(request: NextRequest) {
  await connection();
  try {
    const supabase = await getClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const entries = Array.isArray(body?.entries) ? body.entries : [];
    if (entries.length === 0) {
      return NextResponse.json({ inserted: 0 });
    }
    if (entries.length > MAX_ENTRIES) {
      return NextResponse.json(
        { error: `Too many entries (${entries.length} > ${MAX_ENTRIES})` },
        { status: 400 }
      );
    }

    // Validate each entry server-side — never trust client types.
    const cleaned: DashboardAccessLogEntry[] = [];
    for (const raw of entries) {
      const quadrant = typeof raw?.quadrant === 'string' ? raw.quadrant.slice(0, 50) : null;
      const kpi_name = typeof raw?.kpi_name === 'string' ? raw.kpi_name.slice(0, 100) : null;
      const scope = raw?.scope as DashboardScope;
      if (!quadrant || !kpi_name || !VALID_SCOPES.includes(scope)) {
        return NextResponse.json(
          { error: 'Invalid entry — quadrant, kpi_name, scope required' },
          { status: 400 }
        );
      }
      cleaned.push({
        quadrant,
        kpi_name,
        scope,
        hr_organization_id: typeof raw?.hr_organization_id === 'string' ? raw.hr_organization_id : null,
        institution_id: typeof raw?.institution_id === 'string' ? raw.institution_id : null,
      });
    }

    await HRDashboardService.logAccess(supabase, user.id, cleaned);
    return NextResponse.json({ inserted: cleaned.length });
  } catch (err) {
    console.error('[hr/dashboard/access-log] POST error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
