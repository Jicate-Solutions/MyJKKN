// File: lib/admission/status-helpers.ts
import type { AdmissionStatus, AdmissionStatusScope } from '@/types/admission-status';

// Fallback maps copied verbatim from the current hardcoded sites so the UI
// keeps working until the dynamic list loads or in case of API failure.
const LEAD_FALLBACK_COLORS: Record<string, string> = {
  new: '#3B82F6', contacted: '#0EA5E9', not_reachable: '#F59E0B',
  interested: '#10B981', enrolled: '#059669', lost: '#7F1D1D',
  // ...callers should treat unknown codes as #9CA3AF
};
const LEARNER_FALLBACK_COLORS: Record<string, string> = {
  admitted: '#3B82F6', pending: '#F59E0B', approved: '#10B981',
  account: '#8B5CF6', rejected: '#EF4444', waitlisted: '#F59E0B',
  active: '#22C55E', inactive: '#9CA3AF', exited: '#DC2626',
  graduated: '#0EA5E9', alumni: '#0369A1',
};

export function getStatusLabel(
  list: AdmissionStatus[] | undefined,
  scope: AdmissionStatusScope,
  code: string
): string {
  const found = list?.find((s) => s.scope === scope && s.code === code);
  return found?.label ?? prettify(code);
}

export function getStatusColor(
  list: AdmissionStatus[] | undefined,
  scope: AdmissionStatusScope,
  code: string
): string {
  const found = list?.find((s) => s.scope === scope && s.code === code);
  if (found) return found.color;
  const fallback = scope === 'lead' ? LEAD_FALLBACK_COLORS : LEARNER_FALLBACK_COLORS;
  return fallback[code] ?? '#9CA3AF';
}

export function findStatus(
  list: AdmissionStatus[] | undefined,
  scope: AdmissionStatusScope,
  code: string
): AdmissionStatus | undefined {
  return list?.find((s) => s.scope === scope && s.code === code);
}

function prettify(code: string): string {
  return code.split('_').map((p) => p[0]?.toUpperCase() + p.slice(1)).join(' ');
}
