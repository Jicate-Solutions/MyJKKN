'use client';

import { useEffect, useMemo } from 'react';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  useInstitutionContext,
  useAllInstitutionContexts,
  type InstitutionContext,
} from '@/hooks/use-institution-context';

export interface InstitutionOption {
  id: string;
  name: string;
  institution_code: string;
  /** All related MyJKKN UUIDs — more than one for CAS (Aided + Self-Financed). */
  myjkkn_institution_ids: string[];
}

const ALL_SENTINEL = '__all__';

function toOption(ctx: InstitutionContext): InstitutionOption {
  return {
    id: ctx.myjkkn_id,
    name: ctx.display_name || ctx.name,
    institution_code: ctx.institution_code,
    myjkkn_institution_ids: ctx.myjkkn_institution_ids,
  };
}

/**
 * Picks an institution for BoS tabs.
 *
 * Data source: /api/institutions/resolve (cached server-side for 10 min).
 * Replaces the legacy /api/bos/institutions COE proxy that was prone to
 * intermittent 404s when the upstream /api/v1/institutions response was
 * unstable; the new path absorbs that flakiness via the resolver cache.
 *
 * Non-admin (useInstitutionContext): resolves only the caller's own
 * institution. Auto-selects on load so the dropdown is never empty.
 *
 * Super-admin (useAllInstitutionContexts): returns the full deduplicated
 * list (CAS Aided + SF collapse to one row). When showAllOption=true the
 * picker prepends an "All Institutions" entry that clears the selection.
 *
 * onSelect fires with the full InstitutionOption so callers can fan out
 * to all related UUIDs (e.g. CAS pair filtering).
 */
export function InstitutionPicker({
  value,
  onChange,
  onSelect,
  showAllOption = false,
  allowAllInstitutions = false,
  hideLabel = false,
  className,
}: {
  value: string | undefined;
  onChange: (institutionId: string | undefined) => void;
  onSelect?: (option: InstitutionOption) => void;
  showAllOption?: boolean;
  /**
   * When true, fetch the FULL institution list even for non-super-admins.
   * Pass for BoS read-all observers (view-grant holders) — the
   * /api/institutions/resolve list mode authorizes them server-side.
   */
  allowAllInstitutions?: boolean;
  /** When true, render bare select without the "Institution" label — for compact filter rows. */
  hideLabel?: boolean;
  /** Override the trigger width (default `w-[220px]`). */
  className?: string;
}) {
  const ownCtx = useInstitutionContext();
  const allCtx = useAllInstitutionContexts({ enabled: allowAllInstitutions });

  const institutions = useMemo<InstitutionOption[]>(() => {
    if (allCtx.data && allCtx.data.length > 0) {
      return allCtx.data.map(toOption);
    }
    if (ownCtx.data) {
      return [toOption(ownCtx.data)];
    }
    return [];
  }, [allCtx.data, ownCtx.data]);

  const isLoading = ownCtx.isLoading || allCtx.isLoading;

  useEffect(() => {
    if (!value && institutions.length > 0 && !showAllOption) {
      onChange(institutions[0].id);
      onSelect?.(institutions[0]);
    }
  }, [institutions, value, onChange, onSelect, showAllOption]);

  const selectValue = value ?? (showAllOption ? ALL_SENTINEL : '');

  const options = [
    ...(showAllOption ? [{ value: ALL_SENTINEL, label: 'All Institutions' }] : []),
    ...institutions.map((i) => ({ value: i.id, label: `${i.institution_code} — ${i.name}` })),
  ];

  const select = (
    <SearchableSelect
      value={selectValue}
      onValueChange={(picked) => {
        if (picked === ALL_SENTINEL) {
          onChange(undefined);
        } else {
          onChange(picked);
          const opt = institutions.find((i) => i.id === picked);
          if (opt) onSelect?.(opt);
        }
      }}
      options={options}
      loading={isLoading}
      disabled={institutions.length === 0 && !isLoading}
      placeholder='Select institution'
      searchPlaceholder='Search institution…'
      className={className ?? 'w-[220px]'}
    />
  );

  if (hideLabel) return select;

  return (
    <div className='space-y-1'>
      <Label className='text-xs'>Institution</Label>
      {select}
    </div>
  );
}
