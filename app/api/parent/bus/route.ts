import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { resolveParentScope, assertLearnerAccess, parentErrorResponse } from '@/lib/utils/parent-access';
import type { BusInfo } from '@/types/parent-portal';

export const runtime = 'nodejs';

/** GET /api/parent/bus?learnerId=… — the learner's assigned route (static). */
export async function GET(req: NextRequest) {
  try {
    const scope = await resolveParentScope(req);
    if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const learnerId = new URL(req.url).searchParams.get('learnerId') ?? '';
    assertLearnerAccess(scope, learnerId);

    const db = createServiceRoleClient();
    const { data: assignment } = await db
      .from('pp_bus_assignments')
      .select('stop_name, route:pp_bus_routes(route_name, bus_number, driver_name, driver_contact, stops)')
      .eq('learner_profile_id', learnerId)
      .maybeSingle();

    if (!assignment) return NextResponse.json({ data: null });

    const route = (Array.isArray(assignment.route) ? assignment.route[0] : assignment.route) as
      | { route_name: string; bus_number?: string; driver_name?: string; driver_contact?: string; stops?: unknown }
      | null;
    if (!route) return NextResponse.json({ data: null });

    const data: BusInfo = {
      routeName: route.route_name,
      busNumber: route.bus_number ?? undefined,
      driverName: route.driver_name ?? undefined,
      driverContact: route.driver_contact ?? undefined,
      stopName: assignment.stop_name ?? undefined,
      stops: Array.isArray(route.stops) ? (route.stops as BusInfo['stops']) : [],
    };
    return NextResponse.json({ data });
  } catch (err) {
    return parentErrorResponse(err);
  }
}
