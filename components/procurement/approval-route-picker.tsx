'use client';

/**
 * Request form: "Category" (and "For which department?" when a step is its HOD),
 * then who the request will go to. The requester chooses the category only — the
 * steps themselves are the Super Admin's (Procurement → Approval flows).
 *
 * Only categories that HAVE steps are offered. Until the Super Admin sets any, the
 * picker stays hidden and requests follow the old single-approver rule.
 */

import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Loader2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useChainPreview, useProcurementCategories } from '@/hooks/procurement/use-approval-chains';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import type { ProcurementCategory } from '@/types/procurement';

export function useDepartments(institutionId: string | undefined) {
  return useQuery({
    queryKey: ['departments-of-institution', institutionId],
    queryFn: async () => {
      const { data, error } = await createClientSupabaseClient()
        .from('departments')
        .select('id, department_name, display_name')
        .eq('institution_id', institutionId!)
        .eq('is_active', true)
        .order('department_name');
      if (error) throw error;
      return (data ?? []) as { id: string; department_name: string; display_name: string | null }[];
    },
    enabled: !!institutionId,
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * The request-approval steps that apply to a college: its own steps first, then the common
 * ones. Mirrors procurement_chain_steps() in the database.
 */
const requestSteps = (c: ProcurementCategory, institutionId?: string) => {
  const all = (c.steps ?? []).filter((s) => (s.stage ?? 'request') === 'request');
  const own = institutionId ? all.filter((s) => s.institution_id === institutionId) : [];
  return [...own, ...all.filter((s) => !s.institution_id)];
};

/** Categories a requester may pick: active and with at least one request approver for their college. */
export function useRequestableCategories(institutionId?: string) {
  const q = useProcurementCategories(false);
  return { ...q, data: (q.data ?? []).filter((c) => requestSteps(c, institutionId).length > 0) };
}

/**
 * Whether the chosen route can be submitted: a category is chosen (when any exist),
 * a department is chosen when needed, and every step resolves to someone.
 */
export function useApprovalRouteReady(
  institutionId: string | undefined,
  categoryId: string | null,
  departmentId: string | null
): { required: boolean; ready: boolean; problem: string | null } {
  const { data: categories, isLoading } = useRequestableCategories(institutionId);
  const { data: preview, isFetching } = useChainPreview(categoryId ?? undefined, institutionId, departmentId);
  const required = !isLoading && categories.length > 0;
  if (!required) return { required: false, ready: true, problem: null };
  if (!categoryId) return { required, ready: false, problem: 'Choose a category.' };
  if (isFetching || !preview) return { required, ready: false, problem: null };
  const bad = preview.find((s) => !s.ok);
  return { required, ready: !bad, problem: bad ? `${bad.label}: ${bad.problem}` : null };
}

export function ApprovalRoutePicker({
  institutionId,
  categoryId,
  departmentId,
  onChange,
}: {
  institutionId: string | undefined;
  categoryId: string | null;
  departmentId: string | null;
  onChange: (v: { categoryId: string | null; departmentId: string | null }) => void;
}) {
  const { data: categories, isLoading } = useRequestableCategories(institutionId);
  const { data: departments = [] } = useDepartments(institutionId);
  const category = categories.find((c) => c.id === categoryId);
  const needsDepartment = !!category && requestSteps(category, institutionId).some((s) => s.approver_kind === 'hod');
  const { data: preview, isFetching } = useChainPreview(categoryId ?? undefined, institutionId, departmentId);

  if (isLoading || categories.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <div className="w-full space-y-1 sm:w-64">
          <Label className="text-xs font-semibold">Category</Label>
          <Select
            value={categoryId ?? ''}
            onValueChange={(v) => onChange({ categoryId: v, departmentId })}
          >
            <SelectTrigger className="h-10 sm:h-9" aria-label="Category">
              <SelectValue placeholder="Choose the category…" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {needsDepartment && (
          <div className="w-full space-y-1 sm:w-64">
            <Label className="text-xs font-semibold">For which department?</Label>
            <Select value={departmentId ?? ''} onValueChange={(v) => onChange({ categoryId, departmentId: v })}>
              <SelectTrigger className="h-10 sm:h-9" aria-label="Department">
                <SelectValue placeholder="Choose the department…" />
              </SelectTrigger>
              <SelectContent>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.display_name || d.department_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {categoryId && (
        <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
          <span className="mr-1 text-xs font-semibold text-muted-foreground">Goes to:</span>
          {isFetching && !preview ? (
            <Loader2 className="inline h-3.5 w-3.5 animate-spin" />
          ) : (
            <span className="inline-flex flex-wrap items-center gap-y-1">
              {(preview ?? []).map((s, i) => (
                <span key={s.step_order} className="inline-flex items-center">
                  {i > 0 && <ChevronRight className="mx-0.5 h-3.5 w-3.5 text-muted-foreground" />}
                  <span className={cn(!s.ok && 'font-medium text-amber-700 dark:text-amber-400')}>
                    {s.ok ? `${s.approver_names} (${s.label})` : `${s.label} — ${s.problem}`}
                  </span>
                </span>
              ))}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
