

// app/api/admission/analytics/program-funnel/route.ts
// GET /api/admission/analytics/program-funnel?institution_id=X
//
// Returns which programs/colleges attract inquiries vs convert to enrollment.
// Primary: unnests admission_leads.interested_programs (UUID[]) → joins programs + institutions.
// Fallback: groups by institution_id if no program-level data found.
//
// Auth: session-based via getAuthUser + service role for data access.

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

// ── Stage classification sets ─────────────────────────────────────────────────

// Stages that count as "contacted" (lead was actively worked)
const CONTACTED_STAGES = new Set([
  'contacted', 'not_reachable', 'interested',
  'follow_up_scheduled', 'engaged', 'qualified',
  'application_started', 'application_submitted',
  'documents_pending', 'documents_verified',
  'interview_scheduled', 'interview_completed',
  'offer_sent', 'offer_accepted', 'token_paid',
  'applied', 'interviewed', 'offered', 'enrolled', 'confirmed',
]);

// Stages that count as "applied"
const APPLIED_STAGES = new Set([
  'application_started', 'application_submitted',
  'documents_pending', 'documents_verified',
  'interview_scheduled', 'interview_completed',
  'offer_sent', 'offer_accepted', 'token_paid',
  'applied', 'interviewed', 'offered', 'enrolled', 'confirmed',
]);

// Stages that count as "enrolled"
const ENROLLED_STAGES = new Set([
  'enrolled', 'confirmed', 'token_paid', 'offer_accepted',
]);

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

function applyStage(entry: AggEntry, stage: string): void {
  entry.total += 1;
  if (CONTACTED_STAGES.has(stage)) entry.contacted += 1;
  if (APPLIED_STAGES.has(stage)) entry.applied += 1;
  if (ENROLLED_STAGES.has(stage)) entry.enrolled += 1;
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

  // 3. Fetch leads — select only needed columns
  //    id is needed for deduplication (a lead with 3 interested_programs
  //    should only count once per program, not inflate totals)
  let leadsQuery = supabase
    .from('admission_leads')
    .select('id, interested_programs, funnel_stage, institution_id');

  if (institution_id) {
    leadsQuery = leadsQuery.eq('institution_id', institution_id);
  }

  const { data: leads, error: leadsError } = await leadsQuery;

  if (leadsError || !leads) {
    return NextResponse.json(
      { error: 'QUERY_FAILED', message: leadsError?.message || 'Failed to fetch leads' },
      { status: 500 }
    );
  }

  // 4. Aggregate by program (primary path)
  //    Use a Set per program key to deduplicate leads — a lead with multiple
  //    interested_programs should count once per program, not inflate totals.
  const programAgg = new Map<string, AggEntry>();
  const programLeadSeen = new Map<string, Set<string>>();
  let hasAnyPrograms = false;

  for (const lead of leads) {
    const leadId = lead.id as string;
    const programs = lead.interested_programs as string[] | null;
    const stage = (lead.funnel_stage as string) ?? 'new';
    const instId = lead.institution_id as string;

    if (programs && programs.length > 0) {
      hasAnyPrograms = true;
      for (const pid of programs) {
        const prog = programMap.get(pid);
        const progName = prog?.displayName ?? 'Not Specified';
        const instName = institutionMap.get(prog?.institutionId ?? instId ?? '') ?? 'Unknown Institution';
        const key = `${pid}::${instName}`;

        // Deduplicate: skip if this lead was already counted for this program
        if (!programLeadSeen.has(key)) {
          programLeadSeen.set(key, new Set());
        }
        if (programLeadSeen.get(key)!.has(leadId)) continue;
        programLeadSeen.get(key)!.add(leadId);

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
        applyStage(programAgg.get(key)!, stage);
      }
    }
  }

  // 5. If program data exists, return it
  if (hasAnyPrograms && programAgg.size > 0) {
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

  for (const lead of leads) {
    const instId = lead.institution_id as string;
    if (!instId) continue;
    const stage = (lead.funnel_stage as string) ?? 'new';
    const instName = institutionMap.get(instId) ?? 'Unknown Institution';

    if (!instAgg.has(instId)) {
      instAgg.set(instId, {
        name: instName,
        institution: instName,
        total: 0,
        contacted: 0,
        applied: 0,
        enrolled: 0,
      });
    }
    applyStage(instAgg.get(instId)!, stage);
  }

  const programs = Array.from(instAgg.values())
    .map(toRow)
    .sort((a, b) => b.total - a.total);

  return NextResponse.json({
    success: true,
    data: { programs, group_by: 'institution' } satisfies ProgramFunnelResponse,
  });
}
