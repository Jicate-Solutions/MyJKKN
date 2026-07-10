'use client';

import { useQuery } from '@tanstack/react-query';
import { getAdapter } from '@/lib/services/procurement/domain-adapters/registry';
import type {
  ProcurementDomain,
  DomainCtx,
  CatalogItem,
} from '@/lib/services/procurement/domain-adapters/types';

/**
 * Search a procurement domain's catalog (IMS, later Resource Mgmt, …) for items to
 * put on a Purchase Request / PO line. Delegates to the registered adapter's
 * searchItems — so the picker UI stays domain-agnostic and never touches ims_* itself.
 * An empty query returns the domain's first slice of items (adapter-defined), which
 * makes the combobox browsable before the user types.
 */
export function useProcurementItemSearch(
  domain: ProcurementDomain,
  query: string,
  ctx: DomainCtx,
  enabled = true
) {
  return useQuery<CatalogItem[]>({
    queryKey: ['procurement-item-search', domain, ctx.institutionId, query],
    queryFn: () => getAdapter(domain).searchItems(query, ctx),
    enabled: enabled && !!ctx.institutionId,
    staleTime: 60 * 1000,
  });
}
