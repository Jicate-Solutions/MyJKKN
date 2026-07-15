// lib/services/procurement/domain-adapters/registry.ts
//
// The single place procurement resolves a domain -> adapter. Registering a new
// consuming module (e.g. Resource Management) is a ONE-LINE change here plus its
// adapter file — no procurement_* schema change, no edits to the spine services.

import type { ProcurementDomain, ProcurementDomainAdapter } from './types';
import { imsAdapter } from './ims-adapter';
import { resourceMgmtAdapter } from './resource-mgmt-adapter';

const ADAPTERS: Partial<Record<ProcurementDomain, ProcurementDomainAdapter>> = {
  ims: imsAdapter,
  resource_mgmt: resourceMgmtAdapter, // Phase 5 — registered 2026-07-11.
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

/**
 * Human labels for the module chooser. Add a domain here when you register its
 * adapter above — the New Purchase Request form and any future domain selector read
 * from registeredDomainOptions(), so a newly-registered module (e.g. Resource
 * Management) appears in the UI automatically with no page edits.
 */
export const DOMAIN_LABELS: Record<ProcurementDomain, string> = {
  ims: 'Inventory (IMS)',
  resource_mgmt: 'Resource Management',
};

/** {value,label} pairs for only the domains that have a registered adapter. */
export function registeredDomainOptions(): { value: ProcurementDomain; label: string }[] {
  return registeredDomains().map((d) => ({ value: d, label: DOMAIN_LABELS[d] ?? d }));
}
