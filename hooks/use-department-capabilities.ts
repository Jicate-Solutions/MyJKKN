// hooks/use-department-capabilities.ts
// React hook for the solution department capability register.
//
// Sibling of hooks/use-department-tracker.ts and deliberately the same shape:
// plain state + the browser Supabase client, so RLS is what scopes the rows.
// No API route sits in front of this — a route would run as the server client
// and hide the per-institution scoping the policies exist to apply.

import { useCallback, useEffect, useState } from 'react';
import {
  CapabilityCatalogueMissingError,
  DepartmentCapabilityService,
  type DepartmentCapability,
  type DepartmentCapabilityRow,
} from '@/lib/services/solutions/department-capability-service';

export type { DepartmentCapability, DepartmentCapabilityRow };

interface CapabilityRegisterState {
  departments: DepartmentCapabilityRow[];
  catalogue: DepartmentCapability[];
  loading: boolean;
  error: string | null;
  /** True when the catalogue migration has not been applied yet. */
  catalogueMissing: boolean;
}

const INITIAL: CapabilityRegisterState = {
  departments: [],
  catalogue: [],
  loading: true,
  error: null,
  catalogueMissing: false,
};

export function useDepartmentCapabilities() {
  const [state, setState] = useState<CapabilityRegisterState>(INITIAL);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      // The register is still useful without the catalogue: it shows who has
      // declared nothing. So the two loads fail independently — a missing
      // catalogue table must not blank the department list.
      const departments = await DepartmentCapabilityService.listDepartments();
      try {
        const catalogue = await DepartmentCapabilityService.listCatalogue();
        setState({
          departments,
          catalogue,
          loading: false,
          error: null,
          catalogueMissing: false,
        });
      } catch (catalogueErr: unknown) {
        if (catalogueErr instanceof CapabilityCatalogueMissingError) {
          setState({
            departments,
            catalogue: [],
            loading: false,
            error: null,
            catalogueMissing: true,
          });
          return;
        }
        throw catalogueErr;
      }
    } catch (err: unknown) {
      setState({
        departments: [],
        catalogue: [],
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load the capability register',
        catalogueMissing: false,
      });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** Replace one department's declared capabilities. */
  const saveCapabilities = useCallback(
    async (row: DepartmentCapabilityRow, codes: string[]) => {
      setSaving(row.id);
      try {
        const stored = await DepartmentCapabilityService.setCapabilities(
          row.id,
          row.institution_id,
          codes
        );
        setState((prev) => ({
          ...prev,
          departments: prev.departments.map((d) =>
            d.id === row.id ? { ...d, capability_codes: stored } : d
          ),
        }));
        return stored;
      } finally {
        setSaving(null);
      }
    },
    []
  );

  /** Add a capability to one institution's list and keep local state in sync. */
  const addCatalogueEntry = useCallback(
    async (institutionId: string, capabilityName: string) => {
      const created = await DepartmentCapabilityService.addCatalogueEntry(
        institutionId,
        capabilityName
      );
      setState((prev) =>
        prev.catalogue.some((c) => c.id === created.id)
          ? prev
          : { ...prev, catalogue: [...prev.catalogue, created] }
      );
      return created;
    },
    []
  );

  return {
    departments: state.departments,
    catalogue: state.catalogue,
    loading: state.loading,
    error: state.error,
    catalogueMissing: state.catalogueMissing,
    savingId: saving,
    refresh: load,
    saveCapabilities,
    addCatalogueEntry,
  };
}
