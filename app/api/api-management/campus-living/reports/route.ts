import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/api-keys/cors';
import { withApiKeyAuth } from '@/lib/api-keys/with-api-key-auth';
import { errorResponse, successApiResponse } from '@/lib/api-keys/response-helpers';
import { getStringParam } from '@/lib/api-keys/query-helpers';

export const OPTIONS = () => new NextResponse(null, { headers: corsHeaders });

/**
 * GET /api/api-management/campus-living/reports
 * Generate campus living reports.
 * Query params: report_type (occupancy|attendance|maintenance|mess_feedback|leave)
 */
export const GET = withApiKeyAuth(async (request, auth) => {
  const url = new URL(request.url);
  const institutionId = auth.institutionId;
  if (!institutionId) return errorResponse('API key must be associated with an organization', 400);

  const reportType = getStringParam(url, 'report_type');
  if (!reportType) return errorResponse('report_type is required (occupancy|attendance|maintenance|mess_feedback|leave)', 400);

  const supabase = auth.supabase as any;

  switch (reportType) {
    case 'occupancy': {
      const { data: blocks, error: blocksError } = await supabase
        .from('hostel_blocks').select('id, name, gender, total_rooms, total_beds')
        .eq('institution_id', institutionId);
      if (blocksError) throw blocksError;

      const { count: totalAllocations, error: allocError } = await supabase
        .from('hostel_allocations').select('*', { count: 'exact', head: true })
        .eq('institution_id', institutionId).eq('status', 'active');
      if (allocError) throw allocError;

      const totalBeds = (blocks ?? []).reduce((sum: number, b: any) => sum + (b.total_beds || 0), 0);

      return successApiResponse({
        report_type: 'occupancy',
        total_blocks: blocks?.length ?? 0,
        total_beds: totalBeds,
        occupied_beds: totalAllocations ?? 0,
        vacant_beds: totalBeds - (totalAllocations ?? 0),
        occupancy_rate: totalBeds > 0 ? Math.round(((totalAllocations ?? 0) / totalBeds) * 100) : 0,
        blocks: blocks ?? [],
      });
    }

    case 'attendance': {
      const dateFrom = getStringParam(url, 'date_from') || new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
      const dateTo = getStringParam(url, 'date_to') || new Date().toISOString().split('T')[0];

      // Use head-only count queries to avoid PostgREST 1000-row default limit
      const [totalResult, presentResult] = await Promise.all([
        supabase.from('hostel_attendance').select('*', { count: 'exact', head: true })
          .eq('institution_id', institutionId)
          .gte('date', dateFrom).lte('date', dateTo),
        supabase.from('hostel_attendance').select('*', { count: 'exact', head: true })
          .eq('institution_id', institutionId).eq('status', 'present')
          .gte('date', dateFrom).lte('date', dateTo),
      ]);
      if (totalResult.error) throw totalResult.error;
      if (presentResult.error) throw presentResult.error;

      const total = totalResult.count ?? 0;
      const present = presentResult.count ?? 0;

      return successApiResponse({
        report_type: 'attendance',
        period: { from: dateFrom, to: dateTo },
        total_records: total,
        present,
        absent: total - present,
        attendance_rate: total > 0 ? Math.round((present / total) * 100) : 0,
      });
    }

    case 'maintenance': {
      const { data, error: maintError } = await supabase
        .from('hostel_maintenance_requests').select('status, priority, sla_status')
        .eq('institution_id', institutionId)
        .limit(10000);
      if (maintError) throw maintError;

      const items = data ?? [];
      const byStatus: Record<string, number> = {};
      const byPriority: Record<string, number> = {};
      const bySla: Record<string, number> = {};
      items.forEach((r: any) => {
        byStatus[r.status] = (byStatus[r.status] || 0) + 1;
        if (r.priority) byPriority[r.priority] = (byPriority[r.priority] || 0) + 1;
        if (r.sla_status) bySla[r.sla_status] = (bySla[r.sla_status] || 0) + 1;
      });

      return successApiResponse({
        report_type: 'maintenance',
        total_requests: items.length,
        by_status: byStatus,
        by_priority: byPriority,
        by_sla_status: bySla,
      });
    }

    case 'mess_feedback': {
      const dateFrom = getStringParam(url, 'date_from') || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
      const dateTo = getStringParam(url, 'date_to') || new Date().toISOString().split('T')[0];

      const { data, error: fbError } = await supabase
        .from('mess_feedback').select('overall_rating, taste_rating, hygiene_rating, quantity_rating, variety_rating, is_complaint')
        .eq('institution_id', institutionId)
        .gte('date', dateFrom).lte('date', dateTo);
      if (fbError) throw fbError;

      const items = data ?? [];
      const avg = (field: string) => {
        const vals = items.map((r: any) => r[field]).filter((v: any) => v != null);
        return vals.length > 0 ? Math.round((vals.reduce((s: number, v: number) => s + v, 0) / vals.length) * 10) / 10 : null;
      };

      return successApiResponse({
        report_type: 'mess_feedback',
        period: { from: dateFrom, to: dateTo },
        total_entries: items.length,
        complaints: items.filter((r: any) => r.is_complaint).length,
        avg_overall_rating: avg('overall_rating'),
        avg_taste_rating: avg('taste_rating'),
        avg_hygiene_rating: avg('hygiene_rating'),
        avg_quantity_rating: avg('quantity_rating'),
        avg_variety_rating: avg('variety_rating'),
      });
    }

    case 'leave': {
      const { data, error: leaveError } = await supabase
        .from('hostel_leave_requests').select('status')
        .eq('institution_id', institutionId);
      if (leaveError) throw leaveError;

      const items = data ?? [];
      const byStatus: Record<string, number> = {};
      items.forEach((r: any) => { byStatus[r.status] = (byStatus[r.status] || 0) + 1; });

      return successApiResponse({
        report_type: 'leave',
        total_requests: items.length,
        by_status: byStatus,
      });
    }

    default:
      return errorResponse('Unknown report_type. Valid values: occupancy, attendance, maintenance, mess_feedback, leave', 400);
  }
}, { permission: 'read' });
