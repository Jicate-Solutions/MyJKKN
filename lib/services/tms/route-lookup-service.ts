// Lightweight read-only lookups for the TMS route + stop dropdowns used by the
// learner accommodation forms (Day Scholar → bus required → route → stop).
//
// Reads go through the browser client. RLS opened SELECT on tms_route /
// tms_route_stop to authenticated users (see
// 20260529110000_add_learner_transport_route_stop.sql), so staff forms can
// populate these without the tms.routes.view permission. The public student
// form does NOT use this service — it reads via the token-gated course-options
// API (service-role) since anon has no read access.
//
// tms_route / tms_route_stop aren't in the generated Database type, so the
// client is cast to `any` (same pattern as learner-hostelite-service's view).

import { createClientSupabaseClient } from '@/lib/supabase/client';

export interface TmsRouteOption {
  id: string;
  route_number: string;
  route_name: string;
  fare: number | null;
}

export interface TmsStopOption {
  id: string;
  stop_name: string;
  sequence_order: number;
}

export class RouteLookupService {
  private static get supabase() {
    return createClientSupabaseClient();
  }

  /** Active routes, ordered by route_number. */
  static async getActiveRoutes(): Promise<TmsRouteOption[]> {
    const { data, error } = await (this.supabase as any)
      .from('tms_route')
      .select('id, route_number, route_name, fare')
      .eq('status', 'active')
      .order('route_number', { ascending: true });
    if (error) throw error;
    return (data ?? []) as TmsRouteOption[];
  }

  /** Stops for a route, ordered by sequence_order. Empty when no route. */
  static async getRouteStops(routeId: string): Promise<TmsStopOption[]> {
    if (!routeId) return [];
    const { data, error } = await (this.supabase as any)
      .from('tms_route_stop')
      .select('id, stop_name, sequence_order')
      .eq('route_id', routeId)
      .order('sequence_order', { ascending: true });
    if (error) throw error;
    return (data ?? []) as TmsStopOption[];
  }

  /**
   * A single route by id, with NO status filter — unlike getActiveRoutes()
   * (used to populate the dropdown), this resolves a route already stored on
   * a learner even if it was later deactivated, so profile/enquiry views show
   * its name instead of silently going blank.
   */
  static async getRouteById(routeId: string): Promise<TmsRouteOption | null> {
    if (!routeId) return null;
    const { data, error } = await (this.supabase as any)
      .from('tms_route')
      .select('id, route_number, route_name, fare')
      .eq('id', routeId)
      .maybeSingle();
    if (error) throw error;
    return (data ?? null) as TmsRouteOption | null;
  }
}
