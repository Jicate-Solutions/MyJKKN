'use client';

// Who approves this leave type.
//
// Writes hr_approval_flows (flow_for='leave_approval') with
// conditions={leave_type_id}, which is the key LeaveService.buildApprovalChain()
// already matches on — most-specific wins, falling back to the organization
// catch-all. The engine, the frozen-snapshot behaviour and the multi-step
// advance were all already implemented; this screen is the configuration
// surface that was never built.
//
// Two things this deliberately shows rather than hides:
//   * a role that does not grant hr.leave.approve, because such a step passes
//     trg_hla_approver_gate and is then refused by the hla_update RLS policy;
//   * the inherited catch-all, so "no flow of its own" never looks like "no
//     approval required".

import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, ArrowDown, ArrowUp, Building2, GitBranch, Plus, Trash2,
} from 'lucide-react';

import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  useClearLeaveApprovalFlow,
  useLeaveApprovalFlow,
  useLeaveApproverRoles,
  useSaveLeaveApprovalFlow,
} from '@/hooks/hr/use-leave-approval-flows';
import { useHrOrgMappings } from '@/hooks/hr/use-hr-org-mappings';
import type {
  HRLeaveType, LeaveApprovalFlowStep, LeaveApproverMode,
} from '@/types/hr-leave-types';
import { getErrorMessage } from '@/lib/utils';
import { toast } from 'sonner';
import { ApproverPersonPicker } from './approver-person-picker';

interface DraftStep {
  key: string;
  mode: LeaveApproverMode;
  approver_role: string;
  approver_user_id: string | null;
  approver_name: string | null;
  escalate_after_hours: number;
}

let seq = 0;
const newStep = (p?: Partial<DraftStep>): DraftStep => ({
  key: `s${++seq}`,
  mode: 'role',
  approver_role: '',
  approver_user_id: null,
  approver_name: null,
  escalate_after_hours: 48,
  ...p,
});

export function LeaveApprovalFlowDialog({
  leaveType,
  open,
  onOpenChange,
}: {
  leaveType: HRLeaveType | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const hrOrgId = leaveType?.hr_organization_id;
  const { data: resolved, isLoading } = useLeaveApprovalFlow(hrOrgId, leaveType?.id);
  const { data: roles } = useLeaveApproverRoles(open);

  // Leave types are keyed on hr_organization_id, which is meaningless on screen.
  // hr_organizations.name is maintained identical to institutions.name for every
  // mapped org, so this map is the institution label without a second join.
  const { orgNameById, isLoading: orgsLoading } = useHrOrgMappings();
  const institutionName = hrOrgId ? orgNameById.get(hrOrgId) : undefined;

  const save = useSaveLeaveApprovalFlow();
  const clear = useClearLeaveApprovalFlow();

  const [steps, setSteps] = useState<DraftStep[]>([]);
  const [seeded, setSeeded] = useState<string | null>(null);

  // Seeded from whichever flow currently applies — the type's own if it has one,
  // otherwise the inherited catch-all, so "Save" on an inheriting type starts
  // from what is actually in force rather than from an empty chain.
  useEffect(() => {
    if (!open || isLoading || !leaveType) return;
    if (seeded === leaveType.id) return;
    const src = resolved?.effective;
    setSteps(
      (src?.steps ?? []).length > 0
        ? src!.steps.map((s) =>
            newStep({
              mode: s.approver_user_id ? 'user' : 'role',
              approver_role: s.approver_user_id ? '' : (s.approver_role ?? ''),
              approver_user_id: s.approver_user_id ?? null,
              approver_name: s.approver_name ?? null,
              escalate_after_hours: s.escalate_after_hours ?? 48,
            })
          )
        : [newStep()]
    );
    setSeeded(leaveType.id);
  }, [open, isLoading, leaveType, resolved, seeded]);

  useEffect(() => {
    if (!open) setSeeded(null);
  }, [open]);

  const roleByKey = useMemo(
    () => new Map((roles ?? []).map((r) => [r.role_key, r] as const)),
    [roles]
  );

  const patch = (key: string, p: Partial<DraftStep>) =>
    setSteps((prev) => prev.map((s) => (s.key === key ? { ...s, ...p } : s)));

  const move = (idx: number, to: number) =>
    setSteps((prev) => {
      if (to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[to]] = [next[to], next[idx]];
      return next;
    });

  const stepValid = (s: DraftStep) =>
    s.mode === 'role' ? !!s.approver_role : !!s.approver_user_id;
  const allValid = steps.length > 0 && steps.every(stepValid);

  // A role step that cannot approve is configurable but non-functional; warn
  // instead of blocking, because granting the permission is a Role Management
  // decision this screen must not make silently.
  const deadEnds = steps.filter(
    (s) => s.mode === 'role' && s.approver_role && !roleByKey.get(s.approver_role)?.grants_approve
  );
  const emptyRoles = steps.filter(
    (s) => s.mode === 'role' && s.approver_role && (roleByKey.get(s.approver_role)?.user_count ?? 0) === 0
  );

  const handleSave = async () => {
    if (!leaveType || !hrOrgId) return;
    try {
      await save.mutateAsync({
        id: resolved?.own?.id,
        hrOrgId,
        leaveTypeId: leaveType.id,
        flowName: `${leaveType.leave_type_name} approval`,
        steps: steps.map<LeaveApprovalFlowStep>((s, i) => ({
          chain_order: i + 1,
          step_type: i === steps.length - 1 ? 'final' : 'review',
          approver_role: s.mode === 'role' ? s.approver_role : 'pinned_user',
          approver_user_id: s.mode === 'user' ? s.approver_user_id : null,
          approver_name: s.mode === 'user' ? s.approver_name : null,
          escalate_after_hours: s.escalate_after_hours,
        })),
      });
      toast.success(`Approval flow saved for ${leaveType.leave_type_name}`);
      onOpenChange(false);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const handleClear = async () => {
    if (!leaveType || !hrOrgId || !resolved?.own) return;
    try {
      await clear.mutateAsync({ flowId: resolved.own.id, hrOrgId, leaveTypeId: leaveType.id });
      toast.success('Reverted to the organization default');
      onOpenChange(false);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const inheriting = !resolved?.own && !!resolved?.fallback;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-primary" />
            Approval flow — {leaveType?.leave_type_name}
          </DialogTitle>
          <DialogDescription>
            Who signs off on this leave type. Each step is cleared in order; the last
            step grants approval. The chain is copied onto an application when it is
            submitted, so editing here never changes requests already in flight.
          </DialogDescription>
        </DialogHeader>

        {/* Which institution this flow belongs to. Every leave type is scoped to
            one organization and each organization maintains its own catalog, so
            several institutions can each have a "Casual Leave" whose approvers
            differ — the type name alone does not say which one is open. The list
            page can be filtered to one organization or left showing all, so the
            row that opened this dialog does not reliably carry that context. */}
        {leaveType && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border bg-muted/40 px-3 py-2 text-sm">
            <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className={institutionName ? 'font-medium' : 'text-muted-foreground'}>
              {institutionName ?? (orgsLoading ? 'Loading institution…' : 'Unmapped organization')}
            </span>
            <span className="text-muted-foreground">·</span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: leaveType.color_code }}
                aria-hidden
              />
              {leaveType.leave_type_name}
            </span>
            <Badge variant="outline" className="font-mono text-[10px]">
              {leaveType.leave_type_code}
            </Badge>
            {!leaveType.is_active && (
              <Badge variant="secondary" className="text-[10px]">inactive</Badge>
            )}
          </div>
        )}

        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-4">
            {inheriting && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  This leave type has no flow of its own and currently inherits
                  <strong> {resolved?.fallback?.flow_name}</strong>. Saving below creates
                  a flow just for {leaveType?.leave_type_name}.
                </AlertDescription>
              </Alert>
            )}

            {steps.map((s, idx) => {
              const role = roleByKey.get(s.approver_role);
              return (
                <div key={s.key} className="rounded-md border p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant={idx === steps.length - 1 ? 'default' : 'secondary'}>
                        Step {idx + 1} · {idx === steps.length - 1 ? 'final' : 'review'}
                      </Badge>
                      {!stepValid(s) && (
                        <span className="text-xs text-destructive">Pick an approver</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => move(idx, idx - 1)} disabled={idx === 0}
                        aria-label="Move step up">
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => move(idx, idx + 1)} disabled={idx === steps.length - 1}
                        aria-label="Move step down">
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => setSteps((p) => p.filter((x) => x.key !== s.key))}
                        disabled={steps.length === 1} aria-label="Remove step">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <Label>Approver is</Label>
                      <Select value={s.mode}
                        onValueChange={(v) =>
                          patch(s.key, {
                            mode: v as LeaveApproverMode,
                            approver_role: '',
                            approver_user_id: null,
                            approver_name: null,
                          })
                        }>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="role">Anyone holding a role</SelectItem>
                          <SelectItem value="user">One named person</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>Escalate after (hours)</Label>
                      <Input type="number" min={1} className="mt-1"
                        value={s.escalate_after_hours}
                        onChange={(e) =>
                          patch(s.key, { escalate_after_hours: Number(e.target.value) || 48 })
                        } />
                    </div>
                  </div>

                  {s.mode === 'role' ? (
                    <div className="mt-3">
                      <Label>Role</Label>
                      <Select value={s.approver_role}
                        onValueChange={(v) => patch(s.key, { approver_role: v })}>
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Select a role" />
                        </SelectTrigger>
                        <SelectContent>
                          {(roles ?? []).map((r) => (
                            <SelectItem key={r.role_key} value={r.role_key}>
                              {r.role_name}
                              <span className="ml-2 text-xs text-muted-foreground">
                                {r.user_count} {r.user_count === 1 ? 'person' : 'people'}
                                {r.grants_approve ? '' : ' · cannot approve leave'}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {role && !role.grants_approve && (
                        <p className="mt-1 text-xs text-destructive">
                          {role.role_name} does not have <code>hr.leave.approve</code>, so
                          nobody in it can complete this step. Grant it in Role Management
                          first.
                        </p>
                      )}
                      {role && role.user_count === 0 && (
                        <p className="mt-1 text-xs text-destructive">
                          Nobody currently holds {role.role_name}.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="mt-3">
                      <ApproverPersonPicker
                        hrOrgId={hrOrgId}
                        roles={roles}
                        selectedId={s.approver_user_id}
                        selectedName={s.approver_name}
                        onSelect={(picked) =>
                          patch(s.key, {
                            approver_user_id: picked?.id ?? null,
                            approver_name: picked?.name ?? null,
                          })
                        }
                        enabled={open}
                      />
                    </div>
                  )}
                </div>
              );
            })}

            <Button type="button" variant="outline" size="sm"
              onClick={() => setSteps((p) => [...p, newStep()])}>
              <Plus className="mr-2 h-4 w-4" /> Add step
            </Button>

            {(deadEnds.length > 0 || emptyRoles.length > 0) && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  This flow can be saved but not completed: {deadEnds.length > 0 && (
                    <>{deadEnds.length} step(s) route to a role without{' '}
                    <code>hr.leave.approve</code></>
                  )}
                  {deadEnds.length > 0 && emptyRoles.length > 0 && ', and '}
                  {emptyRoles.length > 0 && <>{emptyRoles.length} step(s) route to a role nobody holds</>}
                  .
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="ghost" onClick={handleClear}
            disabled={!resolved?.own || clear.isPending}
            title={resolved?.own
              ? 'Delete this type-specific flow and inherit the organization default'
              : 'This type already inherits the organization default'}>
            Use organization default
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={!allValid || save.isPending}>
              {save.isPending ? 'Saving…' : 'Save flow'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
