import { useMemo } from 'react';
import { useParams, usePathname } from 'next/navigation';

/**
 * Checks if a string is a Next.js Dynamic Route Parameter (DRP) placeholder.
 *
 * Next.js generates these opaque placeholders (e.g., `%%drp:id:828af62bae025%%`)
 * in `next/dist/server/request/fallback-params.js` via `createOpaqueFallbackRouteParams()`.
 * They appear during cache/pre-rendering when the real dynamic param value is not yet available.
 *
 * With `cacheComponents: true`, client-side navigation via `use(params)` can temporarily
 * resolve to these placeholders before the actual URL param is available.
 */
function isDrpPlaceholder(value: string | undefined): boolean {
  return !!value && value.includes('%%drp:');
}

/**
 * UUID validation (strict format check)
 */
function isValidUUID(id: string): boolean {
  if (!id) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

interface ResolvedRouteId {
  /** The resolved route ID (UUID or empty string if unresolvable) */
  id: string;
  /** True if the ID is still resolving (DRP placeholder detected) */
  isResolving: boolean;
  /** True if the ID resolved but is not a valid UUID */
  isInvalid: boolean;
}

/**
 * Hook that safely resolves a dynamic route `[id]` parameter.
 *
 * Problem: In Next.js 16 with `cacheComponents: true`, the page prop `params` is a Promise.
 * When unwrapped via `use(params)`, it can temporarily resolve to a DRP (Dynamic Route Parameter)
 * placeholder like `%%drp:id:828af62bae025%%` during client-side navigation. This causes
 * UUID validation to fail, showing an error instead of loading the page.
 *
 * Solution: This hook resolves the ID through a fallback chain:
 * 1. `useParams()` — reads from Next.js router state (actual URL, not pre-rendered)
 * 2. `usePathname()` extraction — extracts from the browser's current pathname
 * 3. Falls back to the raw value, marking it as "resolving" if it's a DRP placeholder
 *
 * @param routePattern - Regex pattern to extract the ID from the pathname
 *                       (default: matches `/academic/timetables/[id]`)
 */
export function useResolvedRouteId(
  routePattern: RegExp = /\/academic\/timetables\/([^/]+)/
): ResolvedRouteId {
  const routerParams = useParams();
  const pathname = usePathname();

  return useMemo(() => {
    // Strategy 1: useParams() — reads from router state, not the PPR pipeline
    const fromParams = routerParams?.id as string | undefined;
    if (fromParams && !isDrpPlaceholder(fromParams)) {
      return {
        id: fromParams,
        isResolving: false,
        isInvalid: !isValidUUID(fromParams)
      };
    }

    // Strategy 2: Extract from pathname (always reflects the real browser URL)
    const match = pathname.match(routePattern);
    let fromPathname: string | undefined;
    try {
      fromPathname = match?.[1] ? decodeURIComponent(match[1]) : undefined;
    } catch {
      // decodeURIComponent can throw URIError for malformed sequences
      fromPathname = match?.[1];
    }
    if (fromPathname && !isDrpPlaceholder(fromPathname)) {
      return {
        id: fromPathname,
        isResolving: false,
        isInvalid: !isValidUUID(fromPathname)
      };
    }

    // Strategy 3: Still a DRP placeholder — mark as resolving (transient state)
    return {
      id: fromParams || '',
      isResolving: true,
      isInvalid: false
    };
  }, [routerParams?.id, pathname, routePattern]);
}
