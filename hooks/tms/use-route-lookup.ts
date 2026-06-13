'use client';

// React Query hooks for the TMS route + stop dropdowns on the learner
// accommodation forms. Shared cache keys so every form instance subscribes to
// the same data. Stops are keyed by routeId and only fetched once a route is
// chosen.

import { useQuery } from '@tanstack/react-query';
import { RouteLookupService } from '@/lib/services/tms/route-lookup-service';

export const routeLookupKeys = {
  routes: ['tms', 'route-lookup', 'active-routes'] as const,
  stops: (routeId: string | null | undefined) =>
    ['tms', 'route-lookup', 'route-stops', routeId ?? null] as const,
};

/** Active routes for the route dropdown. */
export function useActiveRoutes() {
  const query = useQuery({
    queryKey: routeLookupKeys.routes,
    queryFn: () => RouteLookupService.getActiveRoutes(),
    // Routes change rarely; keep them warm across form opens.
    staleTime: 5 * 60 * 1000,
  });
  return { routes: query.data ?? [], loading: query.isLoading };
}

/** Stops for the selected route. Disabled until a routeId is provided. */
export function useRouteStops(routeId: string | null | undefined) {
  const query = useQuery({
    queryKey: routeLookupKeys.stops(routeId),
    queryFn: () => RouteLookupService.getRouteStops(routeId as string),
    enabled: !!routeId,
    staleTime: 5 * 60 * 1000,
  });
  return { stops: query.data ?? [], loading: query.isLoading };
}
