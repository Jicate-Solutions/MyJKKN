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
