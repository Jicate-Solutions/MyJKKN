'use client';

// Toolbar filter controls for the Comp Off Claims table (2026-09-11). The rules
// they drive live in comp-off-claims-filters.ts; the period filter sits above
// the table (PeriodFilter) and the search box is the DataTable's own.

import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { compOffClaimFiltersActive, type CompOffClaimFilterState } from './comp-off-claims-filters';

export function CompOffClaimFilterControls({
  filters,
  onChange,
  institutions,
  onReset,
}: {
  filters: CompOffClaimFilterState;
  onChange: <K extends keyof CompOffClaimFilterState>(k: K, v: CompOffClaimFilterState[K]) => void;
  /** [id, name] pairs from the loaded rows, so no option can only return nothing. */
  institutions: [string, string][];
  onReset: () => void;
}) {
  return (
    <>
      <Select
        value={filters.status}
        onValueChange={(v) => onChange('status', v as CompOffClaimFilterState['status'])}
      >
        <SelectTrigger className="h-8 w-full sm:w-[150px]" aria-label="Filter by status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="pending">Pending</SelectItem>
          <SelectItem value="approved">Approved</SelectItem>
          <SelectItem value="rejected">Rejected</SelectItem>
          <SelectItem value="withdrawn">Withdrawn</SelectItem>
          <SelectItem value="any">Any status</SelectItem>
        </SelectContent>
      </Select>

      {institutions.length > 1 && (
        <Select value={filters.institutionId} onValueChange={(v) => onChange('institutionId', v)}>
          <SelectTrigger className="h-8 w-full sm:w-[210px]" aria-label="Filter by institution">
            <SelectValue placeholder="All institutions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">All institutions</SelectItem>
            {institutions.map(([id, name]) => (
              <SelectItem key={id} value={id}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Select
        value={filters.location}
        onValueChange={(v) => onChange('location', v as CompOffClaimFilterState['location'])}
      >
        <SelectTrigger className="h-8 w-full sm:w-[170px]" aria-label="Filter by work location">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="any">Any location</SelectItem>
          <SelectItem value="inside_campus">Inside campus</SelectItem>
          <SelectItem value="outside_campus">Outside campus</SelectItem>
          <SelectItem value="not_recorded">Not recorded</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={filters.biometric}
        onValueChange={(v) => onChange('biometric', v as CompOffClaimFilterState['biometric'])}
      >
        <SelectTrigger className="h-8 w-full sm:w-[180px]" aria-label="Filter by biometric result">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="any">Any biometric</SelectItem>
          <SelectItem value="punched">Punch found</SelectItem>
          <SelectItem value="no_punch">No punch</SelectItem>
          <SelectItem value="not_uploaded">Not uploaded</SelectItem>
          <SelectItem value="no_device">No device</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={filters.expiry}
        onValueChange={(v) => onChange('expiry', v as CompOffClaimFilterState['expiry'])}
      >
        <SelectTrigger className="h-8 w-full sm:w-[170px]" aria-label="Filter by expiry">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="any">Any expiry</SelectItem>
          <SelectItem value="in_date">In date</SelectItem>
          <SelectItem value="expiring">Expiring in 7 days</SelectItem>
          <SelectItem value="expired">Expired</SelectItem>
        </SelectContent>
      </Select>

      {compOffClaimFiltersActive(filters) && (
        <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={onReset}>
          Reset filters
        </Button>
      )}
    </>
  );
}
