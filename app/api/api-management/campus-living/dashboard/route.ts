import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '@/lib/api-keys/cors';
import { withApiKeyAuth } from '@/lib/api-keys/with-api-key-auth';
import { errorResponse, successApiResponse } from '@/lib/api-keys/response-helpers';

export const OPTIONS = () => new NextResponse(null, { headers: corsHeaders });

/**
 * GET /api/api-management/campus-living/dashboard
 * Get a summary dashboard of campus living data.
 * Returns counts and key metrics across all hostel subsystems.
 */
export const GET = withApiKeyAuth(async (request, auth) => {
  const institutionId = auth.institutionId;
  if (!institutionId) return errorResponse('API key must be associated with an organization', 400);

  const supabase = auth.supabase as any;
  const today = new Date().toISOString().split('T')[0];

  // Run all summary queries in parallel
  const [
    blocksResult,
    allocationsResult,
    leaveResult,
    gatePassResult,
    incidentsResult,
    maintenanceResult,
    visitorsResult,
    cleaningResult,
    laundryResult,
  ] = await Promise.all([
    supabase.from('hostel_blocks').select('id, total_capacity', { count: 'exact' })
      .eq('institution_id', institutionId),
    supabase.from('hostel_allocations').select('*', { count: 'exact', head: true })
      .eq('institution_id', institutionId).eq('status', 'active'),
    supabase.from('hostel_leave_requests').select('*', { count: 'exact', head: true })
      .eq('institution_id', institutionId).eq('status', 'pending'),
    supabase.from('hostel_gate_passes').select('*', { count: 'exact', head: true })
      .eq('institution_id', institutionId).eq('status', 'pending'),
    supabase.from('hostel_incidents').select('*', { count: 'exact', head: true })
      .eq('institution_id', institutionId).in('status', ['reported', 'investigating']),
    supabase.from('hostel_maintenance_requests').select('*', { count: 'exact', head: true })
      .eq('institution_id', institutionId).in('status', ['pending', 'in_progress']),
    supabase.from('hostel_visitors').select('*', { count: 'exact', head: true })
      .eq('institution_id', institutionId).eq('status', 'checked_in'),
    supabase.from('hostel_cleaning_tasks').select('*', { count: 'exact', head: true })
      .eq('institution_id', institutionId).eq('date', today).eq('status', 'pending'),
    supabase.from('hostel_laundry_orders').select('*', { count: 'exact', head: true })
      .eq('institution_id', institutionId).in('status', ['collected', 'washing', 'ready']),
  ]);

  // Fail fast if any critical query errored (prevents silently reporting 0s)
  const firstError = [blocksResult, allocationsResult, leaveResult, gatePassResult,
    incidentsResult, maintenanceResult, visitorsResult, cleaningResult, laundryResult]
    .find(r => r.error);
  if (firstError?.error) throw firstError.error;

  const totalBeds = (blocksResult.data ?? []).reduce((sum: number, b: any) => sum + (b.total_beds || 0), 0);
  const occupiedBeds = allocationsResult.count ?? 0;

  return successApiResponse({
    occupancy: {
      total_blocks: blocksResult.count ?? 0,
      total_beds: totalBeds,
      occupied: occupiedBeds,
      vacant: totalBeds - occupiedBeds,
      rate_percent: totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0,
    },
    pending_actions: {
      leave_requests: leaveResult.count ?? 0,
      gate_passes: gatePassResult.count ?? 0,
      open_incidents: incidentsResult.count ?? 0,
      maintenance_requests: maintenanceResult.count ?? 0,
      cleaning_tasks_today: cleaningResult.count ?? 0,
    },
    active: {
      visitors_checked_in: visitorsResult.count ?? 0,
      laundry_in_progress: laundryResult.count ?? 0,
    },
    generated_at: new Date().toISOString(),
  });
}, { permission: 'read' });
