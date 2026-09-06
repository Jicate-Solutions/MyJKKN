// app/(routes)/audit/_components/redesign/param-status.ts
// Single source of truth for a parameter's live status within a cycle.
//
// Two product rules (Director decisions, 2026-07-14):
//  - WORST-CASE across institutions: if any in-scope institution has an open
//    finding on a parameter, the parameter reads as a finding. Nothing hides.
//  - CLEARED only when fully signed: a parameter is "cleared" only when it has
//    zero open findings anywhere AND every in-scope institution has attested it.
//    (An attestation in one college does not clear the parameter cycle-wide.)

import type { AuditAttestation, AuditFindingView } from '@/lib/types/audit';

export type ParamStatus = 'cleared' | 'p1' | 'p2' | 'observation' | 'todo';

const OPEN_EXCLUDED = new Set(['closed', 'rejected', 'cancelled']);

export function isOpenFinding(f: AuditFindingView): boolean {
  return !f.closed_at && !OPEN_EXCLUDED.has((f.status ?? '').toLowerCase());
}

/**
 * Build a resolver `(code) => ParamStatus` for one cycle.
 *
 * @param findings       this cycle's findings (service_requests of type audit_finding)
 * @param attestations   this cycle's attestation rows
 * @param institutionIds in-scope institutions for the cycle. When empty/omitted,
 *                       "cleared" falls back to "≥1 attestation signed and no open
 *                       findings" (best available signal without a denominator).
 */
export function buildParamStatusResolver(
  findings: AuditFindingView[],
  attestations: AuditAttestation[],
  institutionIds: string[] = [],
): (code: string) => ParamStatus {
  const openByCode = new Map<string, AuditFindingView[]>();
  for (const f of findings) {
    if (!isOpenFinding(f)) continue;
    const arr = openByCode.get(f.parameter_code) ?? [];
    arr.push(f);
    openByCode.set(f.parameter_code, arr);
  }

  // code -> set of institution_ids with a signed attestation
  const signedInstByCode = new Map<string, Set<string>>();
  for (const a of attestations) {
    if (!a.attested_at) continue;
    const set = signedInstByCode.get(a.parameter_code) ?? new Set<string>();
    set.add(a.institution_id);
    signedInstByCode.set(a.parameter_code, set);
  }

  const scope = institutionIds.filter(Boolean);

  return (code: string): ParamStatus => {
    const open = openByCode.get(code);
    if (open && open.length) {
      if (open.some((f) => f.severity === 'red')) return 'p1';
      if (open.some((f) => f.severity === 'yellow')) return 'p2';
      return 'observation';
    }
    const signed = signedInstByCode.get(code);
    if (!signed || signed.size === 0) return 'todo';
    if (scope.length > 0) {
      // Cleared only when every in-scope institution has signed.
      return scope.every((id) => signed.has(id)) ? 'cleared' : 'todo';
    }
    // No denominator available: any signed + no open findings reads as cleared.
    return 'cleared';
  };
}
