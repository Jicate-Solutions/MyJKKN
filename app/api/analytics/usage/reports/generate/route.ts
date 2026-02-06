import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { UsageReportService } from '@/lib/services/analytics/usage-report-service';
import type { ReportConfig } from '@/types/usage-analytics';

/**
 * POST /api/analytics/usage/reports/generate
 * Generates a report and returns structured data for client-side export
 *
 * Body:
 * - type: ReportType (required)
 * - format: ReportFormat (required)
 * - date_from: ISO date (required)
 * - date_to: ISO date (required)
 * - institution_id: Optional UUID
 * - sections: Optional string[]
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_super_admin')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const allowedRoles = ['principal', 'hod', 'admin', 'accounts'];
    if (!profile.is_super_admin && !allowedRoles.includes(profile.role)) {
      return NextResponse.json(
        { error: 'Forbidden - insufficient permissions' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const config: ReportConfig = {
      type: body.type,
      format: body.format,
      date_from: body.date_from,
      date_to: body.date_to,
      institution_id: body.institution_id,
      sections: body.sections,
    };

    if (!config.type || !config.format || !config.date_from || !config.date_to) {
      return NextResponse.json(
        { error: 'type, format, date_from, and date_to are required' },
        { status: 400 }
      );
    }

    const data = await UsageReportService.generateReport(config, user.id);

    return NextResponse.json({ data });
  } catch (error: any) {
    console.error('[analytics/usage/reports/generate] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to generate report' },
      { status: 500 }
    );
  }
}
