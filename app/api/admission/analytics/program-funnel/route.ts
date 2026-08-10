export const dynamic = 'force-dynamic';

// app/api/admission/analytics/program-funnel/route.ts
// GET /api/admission/analytics/program-funnel?institution_id=X
//
// Returns which programs/colleges attract inquiries vs convert to enrollment.
// Primary: unnests admission_leads.interested_programs (text[]) → joins programs + institutions.
// Fallback: groups by institution_id if no program-level data found.
//
// Auth: session-based via getAuthUser + service role for data access.
//
// FIX (2026-08-02): the aggregation now runs in SQL via the
// get_admission_program_funnel_agg RPC (SECURITY INVOKER, EXECUTE locked to
// service_role — see the migration of the same name). Previously this route
// fetched EVERY admission_leads row and aggregated in JS; PostgREST caps
// un-ranged selects at 10,000 rows with HTTP 200, and prod holds 21,876
// leads — the global view was silently computed over 46% of the data (3,780
// of 10,959 distinct lead-program pairs). Name resolution and the
// key = `${pid}::${institutionName}` merge semantics stay in JS, unchanged.
// Same disease and fix shape as PR #2762.

import { NextRequest, NextResponse, connection } from 'next/server';
import { getAuthUser, createServiceRoleClient } from '@/lib/supabase/server';

// ── Types (also imported by the React hook) ───────────────────────────────────

export interface ProgramFunnelRow {
  /** Program display name, or institution name for institution-level rows */
  name: string;
  /** College / institution name */
  institution: string;
  /** Total inquiries — any lead with this program in interested_programs */
  total: number;
  /** Leads that advanced past "new" stage */
  contacted: number;
  /** Leads that started or submitted an application */
  applied: number;
  /** Leads enrolled, confirmed, or token_paid */
  enrolled: number;
  /** enrolled / total × 100, rounded to 1 dp */
  conversion_rate: number;
}

export interface ProgramFunnelResponse {
  programs: ProgramFunnelRow[];
  /** 'program' when program-level data found, 'institution' as fallback */
  group_by: 'program' | 'institution';
}

// ── Stage classification ──────────────────────────────────────────────────────
// The contacted / applied / enrolled stage buckets are encoded inside the
// get_admission_program_funnel_agg RPC (see the migration of the same name);
// the SQL carries the exact stage lists this route previously applied in JS.

// ── Aggregation helper ────────────────────────────────────────────────────────

interface AggEntry {
  name: string;
  institution: string;
  total: number;
  contacted: number;
  applied: number;
  enrolled: number;
}

function toRow(e: AggEntry): ProgramFunnelRow {
  return {
    ...e,
    conversion_rate: e.total > 0 ? Math.round((e.enrolled / e.total) * 1000) / 10 : 0,
  };
}

// Pre-aggregated counts returned by get_admission_program_funnel_agg.
interface ProgramAggRpcRow {
  pid: string;
  group_institution_id: string | null;
  total: number;
  contacted: number;
  applied: number;
  enrolled: number;
}

interface InstitutionAggRpcRow {
  institution_id: string;
  total: number;
  contacted: number;
  applied: number;
  enrolled: number;
}

// Fold one RPC aggregate row into a display entry (rows merge when two pids
// resolve to the same display key).
function mergeCounts(entry: AggEntry, row: { total: number; contacted: number; applied: number; enrolled: number }): void {
  entry.total += row.total;
  entry.contacted += row.contacted;
  entry.applied += row.applied;
  entry.enrolled += row.enrolled;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  await connection();

  // 1. Authenticate
  const { user, error: authError } = await getAuthUser();
  if (authError || !user) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED', message: 'Authentication required' },
      { status: 401 }
    );
  }

  const { searchParams } = request.nextUrl;
  const institution_id = searchParams.get('institution_id') || undefined;

  const supabase = createServiceRoleClient();

  // 2. Fetch lookup tables in parallel
  const [programsResult, institutionsResult] = await Promise.all([
    supabase.from('programs').select('id, display_name, program_name, institution_id'),
    supabase.from('institutions').select('id, name'),
  ]);

  if (programsResult.error) console.error('Programs fetch error:', programsResult.error);
  if (institutionsResult.error) console.error('Institutions fetch error:', institutionsResult.error);

  const programMap = new Map<string, { displayName: string; institutionId: string }>(
    (programsResult.data ?? []).map((p) => [
      p.id as string,
      {
        displayName: ((p.display_name || p.program_name || 'Unknown Program') as string).trim(),
        institutionId: p.institution_id as string,
      },
    ])
  );

  const institutionMap = new Map<string, string>(
    (institutionsResult.data ?? []).map((i) => [i.id as string, i.name as string])
  );

  // 3. Aggregate in SQL — one round-trip over the FULL table. The previous
  //    row fetch was capped at 10,000 of 21,876 prod rows by PostgREST.
  const { data: agg, error: aggError } = await supabase.rpc(
    'get_admission_program_funnel_agg',
    { p_institution_id: institution_id ?? null }
  );

  if (aggError || !agg) {
    return NextResponse.json(
      { error: 'QUERY_FAILED', message: aggError?.message || 'Failed to aggregate leads' },
      { status: 500 }
    );
  }

  const programRows = (agg.programs || []) as ProgramAggRpcRow[];
  const institutionRows = (agg.institutions || []) as InstitutionAggRpcRow[];

  // 4. Map program-level aggregates to display rows (primary path).
  //    Merge by the same `${pid}::${institutionName}` key the JS aggregation
  //    used, so name-level semantics are unchanged.
  const programAgg = new Map<string, AggEntry>();

  for (const row of programRows) {
    const prog = programMap.get(row.pid);
    const progName = prog?.displayName ?? 'Not Specified';
    const instName = institutionMap.get(prog?.institutionId ?? row.group_institution_id ?? '') ?? 'Unknown Institution';
    const key = `${row.pid}::${instName}`;

    if (!programAgg.has(key)) {
      programAgg.set(key, {
        name: progName,
        institution: instName,
        total: 0,
        contacted: 0,
        applied: 0,
        enrolled: 0,
      });
    }
    mergeCounts(programAgg.get(key)!, row);
  }

  // 5. If program data exists, return it
  if (programAgg.size > 0) {
    const programs = Array.from(programAgg.values())
      .map(toRow)
      .sort((a, b) => b.total - a.total);

    return NextResponse.json({
      success: true,
      data: { programs, group_by: 'program' } satisfies ProgramFunnelResponse,
    });
  }

  // 6. Fallback: aggregate by institution
  const instAgg = new Map<string, AggEntry>();

  for (const row of institutionRows) {
    const instName = institutionMap.get(row.institution_id) ?? 'Unknown Institution';

    if (!instAgg.has(row.institution_id)) {
      instAgg.set(row.institution_id, {
        name: instName,
        institution: instName,
        total: 0,
        contacted: 0,
        applied: 0,
        enrolled: 0,
      });
    }
    mergeCounts(instAgg.get(row.institution_id)!, row);
  }

  const programs = Array.from(instAgg.values())
    .map(toRow)
    .sort((a, b) => b.total - a.total);

  return NextResponse.json({
    success: true,
    data: { programs, group_by: 'institution' } satisfies ProgramFunnelResponse,
  });
}
