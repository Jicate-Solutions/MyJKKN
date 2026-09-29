// Shared by the /api/hr/salary-revisions routes: one way to turn a refusal
// from the database into an HTTP answer, and one UUID test.
import 'server-only';
import { NextResponse } from 'next/server';
import { SalaryRevisionError } from '@/lib/services/hr/salary-revision/salary-revision-service';

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function errorResponse(err: unknown, label: string): NextResponse {
  if (err instanceof SalaryRevisionError) {
    return NextResponse.json(
      { error: err.message, ...(err.openRequestId ? { openRequestId: err.openRequestId } : {}) },
      { status: err.status },
    );
  }
  console.error(`[HR Salary Revisions] ${label}:`, err);
  return NextResponse.json(
    { error: err instanceof Error ? err.message : 'Something went wrong' },
    { status: 500 },
  );
}

/** Is the caller the Director (super admin, or the approve key)? Asked of the database. */
export async function callerIsApprover(supabase: { rpc: (fn: string) => PromiseLike<{ data: unknown }> }) {
  const { data } = await supabase.rpc('fn_hr_salary_revision_can_approve');
  return data === true;
}
