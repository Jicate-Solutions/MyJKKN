'use client';

/**
 * The approvers on ONE step, plus its quorum.
 *
 * Extracted from leave-approval-flow-dialog.tsx when a step stopped being one
 * approver. The dialog was already at 471 lines and the per-step block is the
 * part that grew, so it moves rather than the file growing past the ~400-line
 * rule.
 *
 * A step with two or more approvers is the only case where the quorum control
 * is shown at all — "any of one" and "all of one" are the same thing, and
 * offering the choice on a single-approver step invites someone to set 'all' and
 * wonder why nothing changed.
 */

import { Plus, Trash2, UserRound, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type {
  LeaveApproverMode,
  LeaveApproverRoleOption,
  LeaveStepQuorum,
} from '@/types/hr-leave-types';

import { ApproverPersonPicker } from './approver-person-picker';
import { RolePicker } from './role-picker';

export interface DraftApprover {
  key: string;
  mode: LeaveApproverMode;
  approver_role: string;
  approver_user_id: string | null;
  approver_name: string | null;
}

let seq = 0;
export const newApprover = (p?: Partial<DraftApprover>): DraftApprover => ({
  key: `a${++seq}`,
  mode: 'role',
  approver_role: '',
  approver_user_id: null,
  approver_name: null,
  ...p,
});

export const approverValid = (a: DraftApprover) =>
  a.mode === 'role' ? !!a.approver_role : !!a.approver_user_id;

interface Props {
  approvers: DraftApprover[];
  quorum: LeaveStepQuorum;
  roles: LeaveApproverRoleOption[] | undefined;
  hrOrgId: string | undefined;
  enabled: boolean;
  onChange: (approvers: DraftApprover[]) => void;
  onQuorumChange: (q: LeaveStepQuorum) => void;
}

export function StepApproverList({
  approvers,
  quorum,
  roles,
  hrOrgId,
  enabled,
  onChange,
  onQuorumChange,
}: Props) {
  const patch = (key: string, p: Partial<DraftApprover>) =>
    onChange(approvers.map((a) => (a.key === key ? { ...a, ...p } : a)));

  const roleByKey = new Map((roles ?? []).map((r) => [r.role_key, r] as const));

  return (
    <div className="space-y-3">
      {approvers.map((a, i) => {
        const role = roleByKey.get(a.approver_role);
        return (
          <div key={a.key} className="rounded-md border border-dashed p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                {a.mode === 'role' ? (
                  <Users className="h-3.5 w-3.5" />
                ) : (
                  <UserRound className="h-3.5 w-3.5" />
                )}
                Approver {i + 1}
              </span>
              {!approverValid(a) && (
                <span className="text-xs text-destructive">Pick an approver</span>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="ml-auto h-7 w-7 text-destructive"
                onClick={() => onChange(approvers.filter((x) => x.key !== a.key))}
                disabled={approvers.length === 1}
                aria-label={`Remove approver ${i + 1}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label className="text-xs">Approver is</Label>
                <Select
                  value={a.mode}
                  onValueChange={(v) =>
                    patch(a.key, {
                      mode: v as LeaveApproverMode,
                      approver_role: '',
                      approver_user_id: null,
                      approver_name: null,
                    })
                  }
                >
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="role">Anyone holding a role</SelectItem>
                    <SelectItem value="user">One named person</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                {a.mode === 'role' ? (
                  <>
                    <Label className="text-xs">Role</Label>
                    <RolePicker
                      roles={roles}
                      value={a.approver_role}
                      onChange={(v) => patch(a.key, { approver_role: v })}
                      placeholder="Select a role"
                      className="mt-1"
                      aria-label={`Role for approver ${i + 1}`}
                    />
                  </>
                ) : (
                  <>
                    <Label className="text-xs">Person</Label>
                    <div className="mt-1">
                      <ApproverPersonPicker
                        hrOrgId={hrOrgId}
                        roles={roles}
                        selectedId={a.approver_user_id}
                        selectedName={a.approver_name}
                        onSelect={(picked) =>
                          patch(a.key, {
                            approver_user_id: picked?.id ?? null,
                            approver_name: picked?.name ?? null,
                          })
                        }
                        enabled={enabled}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Nobody holds the role is a real dead end and worth saying. Whether
                the role grants hr.leave.approve is NOT — a step routed to a role
                is approvable by its holders through fn_is_designated_leave_approver
                regardless of that key. */}
            {role && role.user_count === 0 && (
              <p className="mt-2 text-xs text-destructive">
                Nobody currently holds {role.role_name}, so this step would have no approver.
              </p>
            )}
          </div>
        );
      })}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...approvers, newApprover()])}
        >
          <Plus className="mr-2 h-4 w-4" /> Add approver
        </Button>

        {approvers.length > 1 && (
          <div className="min-w-[220px]">
            <Label className="text-xs">This step is cleared when</Label>
            <Select value={quorum} onValueChange={(v) => onQuorumChange(v as LeaveStepQuorum)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any one of them approves</SelectItem>
                <SelectItem value="all">All of them approve</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    </div>
  );
}
