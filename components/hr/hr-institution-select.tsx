'use client';

import { useEffect, useMemo, useRef } from 'react';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { useHrOrgMappings } from '@/hooks/hr/use-hr-org-mappings';
import { useCurrentEmployee } from '@/hooks/hr/use-regularization';

interface HrInstitutionSelectProps {
  /** Selected institution id ('' = none yet). */
  value: string;
  /** Fires with both the institution id and its resolved shadow hr_organization_id. */
  onChange: (institutionId: string, hrOrgId: string) => void;
  label?: string;
  id?: string;
  disabled?: boolean;
}

/**
 * Institution dropdown for HR pages scoped by hr_organization_id (shadow tenant).
 *
 * Mirrors the recruitment job form's institution Select, but for pages that
 * FILTER by org rather than insert: the selected institution is resolved to its
 * hr_organization_id via useHrOrgMappings(), so callers never handle raw org
 * UUIDs. Only institutions that actually have an HR organization are listed —
 * across EVERY entity type (institution, school, company, admin_office),
 * because HR manages staff in all of them. See the entityType note below.
 * Auto-defaults to the logged-in employee's own institution (falls back to the
 * first accessible option for users without an HR employee record).
 */
export function HrInstitutionSelect({
  value,
  onChange,
  label = 'Institution',
  id = 'institution',
  disabled = false,
}: HrInstitutionSelectProps) {
  // entityType:'all' is REQUIRED here, not a widening.
  //
  // useInstitutionsWithAccess defaults to entityType:'institution' and only
  // super admins get promoted to 'all' (`isSuperAdmin ? 'all' : entityType`).
  // That default hid 5 of the 14 organisations — 2 company, 2 school and
  // 1 admin_office, holding 244 active staff between them — from every
  // non-super-admin, including HR Head, whose role already carries
  // institution_scope='all' at both the get_user_accessible_institutions RPC
  // and role_has_institution_access() RLS layers. HR manages staff in all four
  // entity types, so an HR org picker must not filter by entity type at all.
  //
  // Access is NOT widened: getInstitutions still intersects with the caller's
  // accessible ids, and the orgIdByInstitution filter below (fed by the
  // role_has_institution_access-gated fn_hr_orgs_for_institutions RPC) remains
  // the real gate — only institutions with an HR organization are listed.
  const { institutions, loading: institutionsLoading } = useInstitutionsWithAccess({
    entityType: 'all',
  });
  const { orgIdByInstitution, institutionIdByOrg, isLoading: mappingsLoading } = useHrOrgMappings();
  const { data: employee, isLoading: employeeLoading } = useCurrentEmployee();

  const options = useMemo(
    () => institutions.filter((i) => orgIdByInstitution.has(i.id)),
    [institutions, orgIdByInstitution],
  );

  const isLoading = institutionsLoading || mappingsLoading || employeeLoading;

  // Auto-default once: prefer the employee's own institution, else first option.
  const defaulted = useRef(false);
  useEffect(() => {
    if (defaulted.current || value || isLoading || options.length === 0) return;
    const ownInstitutionId = employee?.hr_organization_id
      ? institutionIdByOrg.get(employee.hr_organization_id)
      : undefined;
    const preferred =
      options.find((o) => o.id === ownInstitutionId) ?? options[0];
    defaulted.current = true;
    onChange(preferred.id, orgIdByInstitution.get(preferred.id) ?? '');
  }, [value, isLoading, options, employee, institutionIdByOrg, orgIdByInstitution, onChange]);

  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={value || undefined}
        onValueChange={(v) => onChange(v, orgIdByInstitution.get(v) ?? '')}
        disabled={disabled || isLoading || options.length === 0}
      >
        <SelectTrigger id={id} className="mt-1">
          <SelectValue
            placeholder={
              isLoading
                ? 'Loading institutions…'
                : options.length === 0
                  ? 'No accessible institutions'
                  : 'Select an institution'
            }
          />
        </SelectTrigger>
        <SelectContent className="max-h-60 overflow-y-auto">
          {options.map((i) => (
            <SelectItem key={i.id} value={i.id}>
              {i.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
