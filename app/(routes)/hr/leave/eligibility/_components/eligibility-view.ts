'use client';

// What the "Granted & decided" table is built from: the rows the page already
// holds, with each institution's NAME attached once (so sorting, searching and the
// export all read the same text instead of a uuid) and the options the filter bar
// offers. The filter / sort / page rules themselves are in eligibility-logic.ts.

import { useMemo } from 'react';

import { useAllHrOrgNames, useHrOrgMappings } from '@/hooks/hr/use-hr-org-mappings';
import type { LeaveEligibilityRow } from '@/types/hr-leave-types';
import { normalizeTypeName, type EligibilityTableRow } from './eligibility-status';

/**
 * Rows with the institution NAME attached, plus the options for the filter bar.
 *
 * Names come from the HR-scoped mapping first and fall back to a direct read of
 * hr_organizations (RLS-limited), so an organisation the mapping RPC does not list
 * for this caller still gets a name instead of a blank cell.
 */
export function useEligibilityView(rows: LeaveEligibilityRow[]) {
  const { orgNameById: mapped } = useHrOrgMappings();
  const { labelById } = useAllHrOrgNames();

  const names = useMemo(() => new Map([...labelById, ...mapped]), [labelById, mapped]);

  const viewRows = useMemo<EligibilityTableRow[]>(
    () => rows.map((r) => ({ ...r, institution_name: names.get(r.hr_organization_id) ?? null })),
    [rows, names],
  );

  const organizations = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of viewRows) {
      if (!seen.has(r.hr_organization_id)) {
        seen.set(r.hr_organization_id, r.institution_name ?? 'Unknown institution');
      }
    }
    return Array.from(seen, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [viewRows]);

  const leaveTypes = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of viewRows) {
      const key = normalizeTypeName(r.leave_type_name);
      if (key && !seen.has(key)) seen.set(key, (r.leave_type_name ?? '').trim());
    }
    return Array.from(seen, ([key, label]) => ({ key, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [viewRows]);

  return { viewRows, organizations, leaveTypes };
}
