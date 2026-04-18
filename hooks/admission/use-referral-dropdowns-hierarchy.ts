// ============================================
// REFERRAL DROPDOWN HIERARCHY HOOKS
// ============================================
// Calls /api/admission/referral-dropdowns which uses the service role to
// bypass RLS — lets admission_staff (own-scope role) see students/staff
// from any institution for referrer selection on lead creation.

import { useQuery } from '@tanstack/react-query';

export type ReferralDropdownType = 'institutions' | 'departments' | 'students' | 'staff';

export interface ReferralDropdownOption {
  id: string;
  name: string;
  role?: string;
  extra?: string;
}

interface FetchParams {
  type: ReferralDropdownType;
  institution_id?: string;
  department_id?: string;
}

async function fetchReferralDropdown({
  type,
  institution_id,
  department_id,
}: FetchParams): Promise<ReferralDropdownOption[]> {
  const params = new URLSearchParams({ type });
  if (institution_id) params.set('institution_id', institution_id);
  if (department_id) params.set('department_id', department_id);

  const res = await fetch(`/api/admission/referral-dropdowns?${params.toString()}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || `Failed: ${res.status}`);
  }
  const json = await res.json();
  return json.options || [];
}

export function useReferralInstitutions() {
  return useQuery<ReferralDropdownOption[]>({
    queryKey: ['referral-dropdowns', 'institutions'],
    queryFn: () => fetchReferralDropdown({ type: 'institutions' }),
    staleTime: 5 * 60 * 1000,
  });
}

export function useReferralDepartments(institutionId?: string) {
  return useQuery<ReferralDropdownOption[]>({
    queryKey: ['referral-dropdowns', 'departments', institutionId],
    queryFn: () =>
      fetchReferralDropdown({ type: 'departments', institution_id: institutionId }),
    enabled: !!institutionId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useReferralStudents(institutionId?: string, departmentId?: string) {
  return useQuery<ReferralDropdownOption[]>({
    queryKey: ['referral-dropdowns', 'students', institutionId, departmentId],
    queryFn: () =>
      fetchReferralDropdown({
        type: 'students',
        institution_id: institutionId,
        department_id: departmentId,
      }),
    enabled: !!institutionId,
    staleTime: 60 * 1000,
  });
}

export function useReferralStaff(institutionId?: string, departmentId?: string) {
  return useQuery<ReferralDropdownOption[]>({
    queryKey: ['referral-dropdowns', 'staff', institutionId, departmentId],
    queryFn: () =>
      fetchReferralDropdown({
        type: 'staff',
        institution_id: institutionId,
        department_id: departmentId,
      }),
    enabled: !!institutionId,
    staleTime: 60 * 1000,
  });
}
