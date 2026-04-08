export const dynamic = 'force-dynamic';

// app/api/admission/analytics/counselor-funnel/route.ts
// GET /api/admission/analytics/counselor-funnel?institution_id=X
// Returns per-counselor lead conversion funnel: assigned → contacted → qualified → applied → enrolled

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, createServiceRoleClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/enhanced-logger';

// ============================================================================
// TYPES
// ============================================================================

export interface CounselorFunnelRow {
  counselor_id: string;
  name: string;
  /** Total leads with this counselor */
  assigned: number;
  /** Leads that have progressed past 'new' */
  contacted: number;
  /** Leads in a qualified/engaged/application stage */
  qualified: number;
  /** Leads that have started or submitted an application */
  applied: number;
  /** Leads that have enrolled or confirmed */
  enrolled: number;
  /** enrolled / assigned × 100, rounded to 1dp */
  conversion_rate: number;
}

export interface CounselorFunnelResponse {
  counselors: CounselorFunnelRow[];
}

// ============================================================================
// STAGE BUCKETS
// See types/admission.ts for the full FunnelStage union.
// ============================================================================

// Anything beyond 'new' counts as contacted
const CONTACTED_EXCLUDE = new Set(['new']);

// Stages where the lead is clearly progressing toward application
const QUALIFIED_STAGES = new Set([
  'interested',
  'follow_up_scheduled',
  'engaged',
  'qualified',
  'application_started',
  'application_submitted',
  'documents_pending',
  'documents_verified',
  'interview_scheduled',
  'interview_completed',
  'offer_sent',
  'offer_accepted',
  'token_paid',
  'applied',
  'interviewed',
  'offered',
  'enrolled',
  'confirmed',
]);

// Stages where the lead has submitted an application
const APPLIED_STAGES = new Set([
  'application_started',
  'application_submitted',
  'documents_pending',
  'documents_verified',
  'interview_scheduled',
  'interview_completed',
  'offer_sent',
  'offer_accepted',
  'token_paid',
  'applied',
  'interviewed',
  'offered',
  'enrolled',
  'confirmed',
]);

// Stages that count as enrolled / converted
const ENROLLED_STAGES = new Set(['enrolled', 'confirmed']);

// ============================================================================
// HANDLER
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    // Auth check
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

    // 1. Fetch active counselors
    let counselorQuery = supabase
      .from('admission_counselors')
      .select('id, name')
      .eq('is_active', true);
    if (institution_id) counselorQuery = counselorQuery.eq('institution_id', institution_id);

    const { data: counselors, error: counselorError } = await counselorQuery;
    if (counselorError) throw new Error(`Failed to fetch counselors: ${counselorError.message}`);
    if (!counselors || counselors.length === 0) {
      return NextResponse.json({ counselors: [] } satisfies CounselorFunnelResponse);
    }

    // 2. Fetch all leads that have a counselor assigned
    let leadsQuery = supabase
      .from('admission_leads')
      .select('counselor_id, funnel_stage')
      .not('counselor_id', 'is', null);
    if (institution_id) leadsQuery = leadsQuery.eq('institution_id', institution_id);

    const { data: leads, error: leadsError } = await leadsQuery;
    if (leadsError) throw new Error(`Failed to fetch leads: ${leadsError.message}`);

    const allLeads = leads || [];

    // 3. Aggregate counts per counselor
    const countsMap = new Map<string, {
      assigned: number;
      contacted: number;
      qualified: number;
      applied: number;
      enrolled: number;
    }>();

    // Initialise all counselors with zeros so we always return every counselor
    for (const c of counselors) {
      countsMap.set(c.id, { assigned: 0, contacted: 0, qualified: 0, applied: 0, enrolled: 0 });
    }

    for (const lead of allLeads) {
      const entry = countsMap.get(lead.counselor_id);
      if (!entry) continue; // lead assigned to inactive/other-institution counselor

      const stage: string = lead.funnel_stage ?? 'new';

      entry.assigned++;
      if (!CONTACTED_EXCLUDE.has(stage)) entry.contacted++;
      if (QUALIFIED_STAGES.has(stage)) entry.qualified++;
      if (APPLIED_STAGES.has(stage)) entry.applied++;
      if (ENROLLED_STAGES.has(stage)) entry.enrolled++;
    }

    // 4. Build response rows — sort by conversion rate descending (best first)
    const rows: CounselorFunnelRow[] = counselors.map((c) => {
      const counts = countsMap.get(c.id) ?? { assigned: 0, contacted: 0, qualified: 0, applied: 0, enrolled: 0 };
      const conversion_rate =
        counts.assigned > 0
          ? Math.round((counts.enrolled / counts.assigned) * 1000) / 10
          : 0;
      return {
        counselor_id: c.id,
        name: c.name || 'Unknown',
        ...counts,
        conversion_rate,
      };
    });

    rows.sort((a, b) => b.conversion_rate - a.conversion_rate);

    logger.info('admission/analytics/counselor-funnel', 'Funnel computed', {
      institution_id,
      counselor_count: rows.length,
    });

    return NextResponse.json({ counselors: rows } satisfies CounselorFunnelResponse);
  } catch (error) {
    logger.error('admission/analytics/counselor-funnel', 'Get counselor funnel error', error);
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
