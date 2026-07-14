/**
 * Exam IA Audit — shared access + scope resolution for the audit API routes.
 *
 * The single authority is the SECURITY DEFINER RPC fn_exam_audit_access()
 * (migration 20260713130000): it answers "may this caller see the audit at
 * all, and which MyJKKN institutions may they see" from Role Management
 * (key academic.internal_marks.exam_audit.view — super_admin, administrator,
 * principal, ceo, executive_admin_officer, registrar). The Registrar is the
 * in-person auditor (Director, 2026-07-13) — scope='all', every college.
 *
 * COE reads stay server-side (service creds); everything fetched from COE is
 * keyed strictly to the institutions this scope returns.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface ExamAuditScope {
  allowed: boolean;
  isSuper: boolean;
  /** null = super admin (all institutions). */
  institutionIds: string[] | null;
}

export async function resolveExamAuditScope(
  supabase: SupabaseClient,
): Promise<ExamAuditScope> {
  const { data, error } = await supabase.rpc('fn_exam_audit_access');
  if (error) throw new Error(`fn_exam_audit_access failed: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.allowed) return { allowed: false, isSuper: false, institutionIds: [] };
  return {
    allowed: true,
    isSuper: row.is_super === true,
    institutionIds: row.institution_ids ?? null,
  };
}

/** May this scope see the given MyJKKN institution? */
export function scopeAllowsInstitution(scope: ExamAuditScope, institutionId: string): boolean {
  if (!scope.allowed) return false;
  if (scope.isSuper || scope.institutionIds === null) return true;
  return scope.institutionIds.includes(institutionId);
}

/**
 * The semester window a session's attendance should be audited over.
 * ODD semesters run Jun–Dec of the exam year; EVEN run Dec(prev)–May.
 * Falls back to exam_start_date − 180d when semester_type is absent.
 */
export function sessionSemesterWindow(session: {
  semester_type: string | null;
  exam_start_date: string | null;
  exam_end_date: string | null;
}): { from: string; to: string } {
  const start = session.exam_start_date ?? new Date().toISOString().slice(0, 10);
  const year = Number(start.slice(0, 4));
  const type = (session.semester_type ?? '').toUpperCase();
  if (type === 'ODD') {
    return { from: `${year}-06-01`, to: session.exam_end_date ?? `${year}-12-31` };
  }
  if (type === 'EVEN') {
    return { from: `${year - 1}-12-01`, to: session.exam_end_date ?? `${year}-05-31` };
  }
  const d = new Date(start);
  d.setDate(d.getDate() - 180);
  return { from: d.toISOString().slice(0, 10), to: session.exam_end_date ?? start };
}
