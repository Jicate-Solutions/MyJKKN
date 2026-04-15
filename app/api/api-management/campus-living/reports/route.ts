import { NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/api-keys/cors';
import { withAuth } from '@/lib/auth/with-auth';
import { errorResponse, successApiResponse } from '@/lib/api-keys/response-helpers';
import { getStringParam } from '@/lib/api-keys/query-helpers';

export const OPTIONS = () => new NextResponse(null, { headers: corsHeaders });

/**
 * GET /api/api-management/campus-living/reports
 * Generate campus living reports.
 * Query params: report_type (occupancy|attendance|maintenance|mess_feedback|leave)
 */
export const GET = withAuth(async (request, auth) => {
  const url = new URL(request.url);
  const institutionId = auth.institutionId;
  if (!institutionId) return errorResponse('API key must be associated with an organization', 400);

  const reportType = getStringParam(url, 'report_type');
  if (!reportType) return errorResponse('report_type is required (occupancy|attendance|maintenance|mess_feedback|leave)', 400);

  const supabase = auth.supabase as any;

  switch (reportType) {
    case 'occupancy': {
      const { data: blocks, error: blocksError } = await supabase
        .from('hostel_blocks').select('id, name, hostel_type, total_rooms, total_capacity')
        .eq('institution_id', institutionId);
      if (blocksError) throw blocksError;

      const { count: totalAllocations, error: allocError } = await supabase
        .from('hostel_allocations').select('*', { count: 'exact', head: true })
        .eq('institution_id', institutionId).eq('status', 'active');
      if (allocError) throw allocError;

      const totalCapacity = (blocks ?? []).reduce((sum: number, b: any) => sum + (b.total_capacity || 0), 0);

      return successApiResponse({
        report_type: 'occupancy',
        total_blocks: blocks?.length ?? 0,
        total_capacity: totalCapacity,
        occupied_beds: totalAllocations ?? 0,
        vacant_beds: Math.max(0, totalCapacity - (totalAllocations ?? 0)),
        occupancy_rate: totalCapacity > 0 ? Math.round(((totalAllocations ?? 0) / totalCapacity) * 100) : 0,
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
          .eq('institution_id', institutionId).eq('evening_status', 'present')
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
      const statusValues = ['open', 'assigned', 'in_progress', 'pending_verification', 'resolved', 'closed', 'reopened'];
      const priorityValues = ['low', 'medium', 'high', 'urgent'];

      const [statusResults, priorityResults, slaBreachedResult, totalResult] = await Promise.all([
        Promise.all(statusValues.map(async (s) => {
          const { count } = await supabase.from('hostel_maintenance_requests')
            .select('*', { count: 'exact', head: true })
            .eq('institution_id', institutionId).eq('status', s);
          return [s, count ?? 0] as const;
        })),
        Promise.all(priorityValues.map(async (p) => {
          const { count } = await supabase.from('hostel_maintenance_requests')
            .select('*', { count: 'exact', head: true })
            .eq('institution_id', institutionId).eq('priority', p);
          return [p, count ?? 0] as const;
        })),
        supabase.from('hostel_maintenance_requests')
          .select('*', { count: 'exact', head: true })
          .eq('institution_id', institutionId).eq('sla_status', 'breached'),
        supabase.from('hostel_maintenance_requests')
          .select('*', { count: 'exact', head: true })
          .eq('institution_id', institutionId),
      ]);

      const byStatus = Object.fromEntries(statusResults);
      const byPriority = Object.fromEntries(priorityResults);
      const total = totalResult.count ?? 0;

      return successApiResponse({
        report_type: 'maintenance',
        total_requests: total,
        by_status: byStatus,
        by_priority: byPriority,
        sla_compliance: {
          breached: slaBreachedResult.count ?? 0,
          compliant: total - (slaBreachedResult.count ?? 0),
        },
      });
    }

    case 'mess_feedback': {
      const dateFrom = getStringParam(url, 'date_from') || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
      const dateTo = getStringParam(url, 'date_to') || new Date().toISOString().split('T')[0];

      const { data: feedbackItems, error: fbError, count: feedbackCount } = await supabase
        .from('mess_feedback').select('overall_rating, taste_rating, hygiene_rating, quantity_rating, variety_rating, is_complaint', { count: 'exact' })
        .eq('institution_id', institutionId)
        .gte('date', dateFrom).lte('date', dateTo)
        .limit(10000);
      if (fbError) throw fbError;

      const items = feedbackItems ?? [];
      const avg = (field: string) => {
        const vals = items.map((r: any) => r[field]).filter((v: any) => v != null);
        return vals.length > 0 ? Math.round((vals.reduce((s: number, v: number) => s + v, 0) / vals.length) * 10) / 10 : null;
      };

      return successApiResponse({
        report_type: 'mess_feedback',
        period: { from: dateFrom, to: dateTo },
        total_responses: feedbackCount ?? items.length,
        sample_size: items.length,
        complaints: items.filter((r: any) => r.is_complaint).length,
        avg_overall_rating: avg('overall_rating'),
        avg_taste_rating: avg('taste_rating'),
        avg_hygiene_rating: avg('hygiene_rating'),
        avg_quantity_rating: avg('quantity_rating'),
        avg_variety_rating: avg('variety_rating'),
      });
    }

    case 'leave': {
      const leaveStatuses = ['draft', 'pending_parent', 'pending_warden', 'pending_chief', 'approved', 'rejected', 'cancelled', 'expired'];

      const [statusResults, totalResult] = await Promise.all([
        Promise.all(leaveStatuses.map(async (s) => {
          const { count } = await supabase.from('hostel_leave_requests')
            .select('*', { count: 'exact', head: true })
            .eq('institution_id', institutionId).eq('status', s);
          return [s, count ?? 0] as const;
        })),
        supabase.from('hostel_leave_requests')
          .select('*', { count: 'exact', head: true })
          .eq('institution_id', institutionId),
      ]);

      const byStatus = Object.fromEntries(statusResults);
      const total = totalResult.count ?? 0;

      return successApiResponse({
        report_type: 'leave',
        total_requests: total,
        by_status: byStatus,
      });
    }

    default:
      return errorResponse('Unknown report_type. Valid values: occupancy, attendance, maintenance, mess_feedback, leave', 400);
  }
}, { allowApiKey: true, requiredPermission: 'read' });
