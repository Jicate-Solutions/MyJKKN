/**
 * TMS Lookup Hooks (for Bus Pass Request form fields)
 *
 * Live route + cascade-stop dropdown data sourced from tms_route / tms_route_stop.
 * RLS already allows any authenticated user to SELECT these (read-only reference).
 *
 * @module hooks/service-requests/use-tms-lookups
 * @created 2026-06-02
 */

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';

export interface TmsRouteOption {
  id: string;
  route_number: string;
  route_name: string;
}

export interface TmsRouteStopOption {
  id: string;
  stop_name: string;
  sequence_order: number;
}

export const tmsLookupKeys = {
  all: ['tms-lookups'] as const,
  routes: () => [...tmsLookupKeys.all, 'routes'] as const,
  stops: (routeId: string) => [...tmsLookupKeys.all, 'stops', routeId] as const,
};

/** Active bus routes, ordered by route_number. */
export function useTmsRoutes() {
  return useQuery<TmsRouteOption[]>({
    queryKey: tmsLookupKeys.routes(),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('tms_route')
        .select('id, route_number, route_name')
        .eq('status', 'active')
        .order('route_number', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as TmsRouteOption[];
    },
  });
}

/** Stops for a route, ordered by sequence_order. Disabled until routeId is set. */
export function useTmsRouteStops(routeId: string | undefined) {
  return useQuery<TmsRouteStopOption[]>({
    queryKey: tmsLookupKeys.stops(routeId ?? ''),
    enabled: !!routeId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('tms_route_stop')
        .select('id, stop_name, sequence_order')
        .eq('route_id', routeId!)
        .order('sequence_order', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as TmsRouteStopOption[];
    },
  });
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface TmsResolvedLabels {
  routeLabel: string | null;
  stopLabel: string | null;
}

/**
 * Resolve a submitted Bus Pass request's stored route/stop IDs back into their
 * display labels (for the request detail view, which only has the raw UUIDs in
 * form_data).
 *
 * Unlike the dropdown hooks above, this looks rows up by primary key with NO
 * status filter — a request can reference a route that was later deactivated,
 * and we still want to show its name instead of a bare UUID. The IDs are
 * UUID-guarded so a legacy form_data value that isn't a UUID never reaches the
 * uuid `id` column (which would 22P02).
 */
export function useTmsLabels(routeId?: string | null, stopId?: string | null) {
  const validRoute = routeId && UUID_RE.test(routeId) ? routeId : null;
  const validStop = stopId && UUID_RE.test(stopId) ? stopId : null;

  return useQuery<TmsResolvedLabels>({
    queryKey: [...tmsLookupKeys.all, 'labels', validRoute ?? '', validStop ?? ''],
    enabled: !!(validRoute || validStop),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      const result: TmsResolvedLabels = { routeLabel: null, stopLabel: null };

      if (validRoute) {
        const { data, error } = await supabase
          .from('tms_route')
          .select('route_number, route_name')
          .eq('id', validRoute)
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (data) result.routeLabel = `${data.route_number} — ${data.route_name}`;
      }

      if (validStop) {
        const { data, error } = await supabase
          .from('tms_route_stop')
          .select('stop_name')
          .eq('id', validStop)
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (data) result.stopLabel = data.stop_name;
      }

      return result;
    },
  });
}
