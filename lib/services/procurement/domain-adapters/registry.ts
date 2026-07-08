// lib/services/procurement/domain-adapters/registry.ts
//
// The single place procurement resolves a domain -> adapter. Registering a new
// consuming module (e.g. Resource Management) is a ONE-LINE change here plus its
// adapter file — no procurement_* schema change, no edits to the spine services.

import type { ProcurementDomain, ProcurementDomainAdapter } from './types';
import { imsAdapter } from './ims-adapter';

const ADAPTERS: Partial<Record<ProcurementDomain, ProcurementDomainAdapter>> = {
  ims: imsAdapter,
  // resource_mgmt: resourceMgmtAdapter,  // <- Phase 5: register here to plug RM in.
};

/**
 * Resolve the adapter for a domain. Throws if the domain has no registered adapter
 * (e.g. a procurement doc created against a module whose adapter isn't wired yet) —
 * a loud failure is correct here: silently skipping would drop goods on the floor
 * (accepted stock never posted to inventory).
 */
export function getAdapter(domain: ProcurementDomain): ProcurementDomainAdapter {
  const adapter = ADAPTERS[domain];
  if (!adapter) {
    throw new Error(
      `[procurement] No inventory adapter registered for domain "${domain}". ` +
        `Register it in lib/services/procurement/domain-adapters/registry.ts.`
    );
  }
  return adapter;
}

/** Domains that currently have a working adapter (for UI domain pickers). */
export function registeredDomains(): ProcurementDomain[] {
  return Object.keys(ADAPTERS) as ProcurementDomain[];
}
