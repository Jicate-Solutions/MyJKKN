// app/api/ai-pulse/evidence/naac/route.ts
// ============================================================================
// GET /api/ai-pulse/evidence/naac
//
// Returns the IQAC NAAC Criterion 3.3.1 evidence preview as JSON.
//
// Query params:
//   from              ISO date YYYY-MM-DD (optional — defaults to last 90 days)
//   to                ISO date YYYY-MM-DD (optional — defaults to today)
//   institution_id    UUID (optional — when omitted, all institutions in scope)
//
// Auth: requires session. Permission gate is enforced at the page layer
// (`aiPulse:naac.evidence_export` OR super_admin OR IQAC role); RLS on
// `event_submissions` + `event_registrations` further scopes results so
// non-super-admin callers cannot exfiltrate cross-institution data even if
// they bypass the page.
//
// Response shape: { rows: NaacEvidenceRow[], summary: NaacEvidenceSummary }
// (see lib/services/ai-pulse/naac-evidence-service.ts).
// ============================================================================

export const dynamic = 'force-dynamic';

import { createServerClient } from '@supabase/ssr';
import type { CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, connection, type NextRequest } from 'next/server';

import {
  NaacEvidenceService,
  type NaacEvidenceFilters,
  defaultLastQuarter,
} from '@/lib/services/ai-pulse/naac-evidence-service';
import { BaseService } from '@/lib/services/base-service';

export async function GET(request: NextRequest) {
  await connection();
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: CookieOptions) {
            try {
              cookieStore.set(name, value, options);
            } catch {
              // route handler may run in a context that disallows cookie writes — ignore
            }
          },
          remove(name: string, options: CookieOptions) {
            try {
              cookieStore.set(name, '', { ...options, maxAge: 0 });
            } catch {
              // ignore
            }
          },
        },
      },
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse query params + apply defaults.
    const url = new URL(request.url);
    const defaults = defaultLastQuarter();
    const filters: NaacEvidenceFilters = {
      from: url.searchParams.get('from') ?? defaults.from,
      to: url.searchParams.get('to') ?? defaults.to,
      institution_id: url.searchParams.get('institution_id') ?? undefined,
    };

    // Service runs against the same (RLS-scoped) supabase client so cluster /
    // institution scope mirrors the page-level read.
    const response = await BaseService.runWithClient(supabase, () =>
      NaacEvidenceService.getEvidenceRows(filters),
    );

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[/api/ai-pulse/evidence/naac] failed:', message);
    return NextResponse.json(
      { error: 'Failed to load NAAC evidence preview', message },
      { status: 500 },
    );
  }
}
