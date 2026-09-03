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
// TWO INDEPENDENT SETTINGS decide the shape (2026-08-31): where the steps come
// from — a list set out here, or a ROLE LADDER resolved against the applicant —
// and whether they run one after another or all at once. A step holds a SET of
// approvers with a quorum, so "any one of the HODs" and "both the Principal and
// the CAO" are both expressible. See lib/hr/leave/approval-chain.ts.
//
// CORRECTED: this screen used to warn that a role without hr.leave.approve made
// a step unapprovable. It does not. fn_is_designated_leave_approver admits the
// holder of the step's role, so hla_update and trg_hla_approver_gate both let
// them decide — which is what lets a ladder route to HOD, Principal and CAO, all
// three of which have that key set to false. The only genuine dead end is a role
// nobody holds, and that is still shown.
//
// The inherited catch-all is also shown rather than hidden, so "no flow of its
// own" never looks like "no approval required".

import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, ArrowDown, ArrowUp, Building2, GitBranch, Plus, Trash2,
} from 'lucide-react';

import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle,
} from '@/components/ui/drawer';
import { useMediaQuery } from '@/hooks/use-media-query';
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
  HRLeaveType, LeaveApprovalFlowStep, LeaveFlowRunMode, LeaveFlowStepSource,
  LeaveStepQuorum,
} from '@/types/hr-leave-types';
import { getErrorMessage } from '@/lib/utils';
import { toast } from 'sonner';
import { ApprovalFlowControls } from './approval-flow-controls';
import { RoleLadderEditor } from './role-ladder-editor';
import {
  StepApproverList, approverValid, newApprover, type DraftApprover,
} from './step-approver-list';

interface DraftStep {
  key: string;
  /** A step is a SET of approvers now; one is just the common case. */
  approvers: DraftApprover[];
  quorum: LeaveStepQuorum;
  escalate_after_hours: number;
}

let seq = 0;
const newStep = (p?: Partial<DraftStep>): DraftStep => ({
  key: `s${++seq}`,
  approvers: [newApprover()],
  quorum: 'any',
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
  const [stepSource, setStepSource] = useState<LeaveFlowStepSource>('explicit');
  const [runMode, setRunMode] = useState<LeaveFlowRunMode>('sequential');
  const [ladder, setLadder] = useState<string[]>([]);
  const [fallbackRole, setFallbackRole] = useState('');
  const [fallbackUserId, setFallbackUserId] = useState<string | null>(null);
  const [fallbackName, setFallbackName] = useState<string | null>(null);
  const [seeded, setSeeded] = useState<string | null>(null);

  // Seeded from whichever flow currently applies — the type's own if it has one,
  // otherwise the inherited catch-all, so "Save" on an inheriting type starts
  // from what is actually in force rather than from an empty chain.
  //
  // A legacy flow carries its single approver in the step's own fields and no
  // `approvers` array, so each step seeds to a one-approver list — the editor
  // opens on exactly what is stored, not on a migrated approximation.
  useEffect(() => {
    if (!open || isLoading || !leaveType) return;
    if (seeded === leaveType.id) return;
    const src = resolved?.effective;

    setStepSource(src?.step_source ?? 'explicit');
    setRunMode(src?.run_mode ?? 'sequential');
    setLadder(Array.isArray(src?.role_ladder) ? src.role_ladder : []);
    setFallbackRole(src?.fallback_approver?.approver_role ?? '');
    setFallbackUserId(src?.fallback_approver?.approver_user_id ?? null);
    setFallbackName(src?.fallback_approver?.approver_name ?? null);

    setSteps(
      (src?.steps ?? []).length > 0
        ? src!.steps.map((s) =>
            newStep({
              approvers:
                (s.approvers ?? []).length > 0
                  ? s.approvers!.map((a) =>
                      newApprover({
                        mode: a.approver_user_id ? 'user' : 'role',
                        approver_role: a.approver_user_id ? '' : a.approver_role ?? '',
                        approver_user_id: a.approver_user_id ?? null,
                        approver_name: a.approver_name ?? null,
                      })
                    )
                  : [
                      newApprover({
                        mode: s.approver_user_id ? 'user' : 'role',
                        approver_role: s.approver_user_id ? '' : s.approver_role ?? '',
                        approver_user_id: s.approver_user_id ?? null,
                        approver_name: s.approver_name ?? null,
                      }),
                    ],
              quorum: s.quorum ?? 'any',
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
    s.approvers.length > 0 && s.approvers.every(approverValid);

  // A ladder flow has no steps of its own — its chain is derived per applicant —
  // so what it needs instead is at least one rung and somewhere to send the
  // person at the top.
  const allValid =
    stepSource === 'role_ladder'
      ? ladder.length > 0
      : steps.length > 0 && steps.every(stepValid);

  // Nobody holds the role is a genuine dead end. Whether the role grants
  // hr.leave.approve is NOT one, and the warning that used to say so was wrong:
  // fn_is_designated_leave_approver admits the holder of a step's role without
  // that key, which is exactly what lets a ladder route to HOD (94 holders),
  // Principal (13) and CAO (1) — all of which have hr.leave.approve = false.
  const allApprovers = [
    ...steps.flatMap((s) => s.approvers),
    ...ladder.map((r) => ({ mode: 'role' as const, approver_role: r })),
  ];
  const emptyRoles = allApprovers.filter(
    (a) =>
      a.mode === 'role' &&
      a.approver_role &&
      (roleByKey.get(a.approver_role)?.user_count ?? 0) === 0
  );
  const ladderNeedsFallback =
    stepSource === 'role_ladder' && ladder.length > 0 && !fallbackRole && !fallbackUserId;

  const handleSave = async () => {
    if (!leaveType || !hrOrgId) return;
    try {
      await save.mutateAsync({
        id: resolved?.own?.id,
        hrOrgId,
        leaveTypeId: leaveType.id,
        flowName: `${leaveType.leave_type_name} approval`,
        stepSource,
        runMode,
        roleLadder: ladder,
        fallbackApprover:
          fallbackRole || fallbackUserId
            ? {
                approver_role: fallbackRole || null,
                approver_user_id: fallbackUserId,
                approver_name: fallbackName,
              }
            : null,
        // A ladder flow saves no steps of its own; the service refuses an empty
        // steps array only for the explicit source.
        steps:
          stepSource === 'role_ladder'
            ? []
            : steps.map<LeaveApprovalFlowStep>((s, i) => ({
                chain_order: i + 1,
                step_type: i === steps.length - 1 ? 'final' : 'review',
                quorum: s.quorum,
                approvers: s.approvers.map((a) => ({
                  approver_role: a.mode === 'role' ? a.approver_role : null,
                  approver_user_id: a.mode === 'user' ? a.approver_user_id : null,
                  approver_name: a.mode === 'user' ? a.approver_name : null,
                })),
                // Mirrored from the first approver so a legacy reader still sees
                // a coherent step. The service writes these too; keeping them in
                // step here means the payload and the stored row agree.
                approver_role:
                  s.approvers[0]?.mode === 'role' ? s.approvers[0].approver_role : 'pinned_user',
                approver_user_id:
                  s.approvers[0]?.mode === 'user' ? s.approvers[0].approver_user_id : null,
                approver_name:
                  s.approvers[0]?.mode === 'user' ? s.approvers[0].approver_name : null,
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
  // Same breakpoint as leave-type-detail-dialog.tsx and the DataTable's
  // row/card swap, so the table and both its modals agree on "mobile".
  const isMobile = useMediaQuery('(max-width: 768px)');

  const title = (
    <span className="flex items-start gap-2 text-left">
      <GitBranch className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
      {/* min-w-0 lets a long leave type name wrap instead of forcing the
          header wider than the container. */}
      <span className="min-w-0 break-words">
        Approval flow — {leaveType?.leave_type_name}
      </span>
    </span>
  );

  const description =
    'Who signs off on this leave type. Each step is cleared in order; the last ' +
    'step grants approval. The chain is copied onto an application when it is ' +
    'submitted, so editing here never changes requests already in flight.';

  const body = (
    <>

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

            <ApprovalFlowControls
              stepSource={stepSource}
              runMode={runMode}
              fallbackRole={fallbackRole}
              fallbackUserId={fallbackUserId}
              fallbackName={fallbackName}
              roles={roles}
              hrOrgId={hrOrgId}
              enabled={open}
              onStepSourceChange={setStepSource}
              onRunModeChange={setRunMode}
              onFallbackChange={({ role, userId, name }) => {
                setFallbackRole(role);
                setFallbackUserId(userId);
                setFallbackName(name);
              }}
            />

            {stepSource === 'role_ladder' ? (
              <RoleLadderEditor
                ladder={ladder}
                roles={roles}
                runMode={runMode}
                onChange={setLadder}
              />
            ) : (
              <>
                {steps.map((s, idx) => (
                  <div key={s.key} className="rounded-md border p-3">
                    {/* wrap + gap: at 360px the badge, the "Pick an approver"
                        warning and three icon buttons do not fit on one line, and
                        justify-between alone pushed the buttons off the card. */}
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {/* In parallel mode the steps are collapsed into one at
                            apply time, so numbering them "Step 1 · review" would
                            promise an order that never happens. */}
                        <Badge variant={idx === steps.length - 1 ? 'default' : 'secondary'}>
                          {runMode === 'parallel'
                            ? `Group ${idx + 1}`
                            : `Step ${idx + 1} · ${idx === steps.length - 1 ? 'final' : 'review'}`}
                        </Badge>
                        {!stepValid(s) && (
                          <span className="text-xs text-destructive">Pick an approver</span>
                        )}
                      </div>
                      <div className="ml-auto flex shrink-0 items-center gap-1">
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => move(idx, idx - 1)}
                          disabled={idx === 0 || runMode === 'parallel'}
                          aria-label="Move step up">
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => move(idx, idx + 1)}
                          disabled={idx === steps.length - 1 || runMode === 'parallel'}
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

                    <div className="mb-3 sm:max-w-[220px]">
                      <Label className="text-xs">Escalate after (hours)</Label>
                      <Input type="number" min={1} className="mt-1"
                        value={s.escalate_after_hours}
                        onChange={(e) =>
                          patch(s.key, { escalate_after_hours: Number(e.target.value) || 48 })
                        } />
                    </div>

                    <StepApproverList
                      approvers={s.approvers}
                      quorum={s.quorum}
                      roles={roles}
                      hrOrgId={hrOrgId}
                      enabled={open}
                      onChange={(approvers) => patch(s.key, { approvers })}
                      onQuorumChange={(quorum) => patch(s.key, { quorum })}
                    />
                  </div>
                ))}

                <Button type="button" variant="outline" size="sm"
                  onClick={() => setSteps((p) => [...p, newStep()])}>
                  <Plus className="mr-2 h-4 w-4" /> Add step
                </Button>
              </>
            )}

            {/* Parallel collapses every group into ONE step at apply time. Saying
                so here stops the groups reading as an order they are not. */}
            {stepSource === 'explicit' && runMode === 'parallel' && steps.length > 1 && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Running all at once merges these {steps.length} groups into a single step
                  holding every approver. Set the quorum on the first group to decide whether one
                  approval is enough or all of them are needed.
                </AlertDescription>
              </Alert>
            )}

            {ladderNeedsFallback && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Nobody is above the highest rung, so the person holding it cannot submit this
                  leave type at all. Set a fallback approver above.
                </AlertDescription>
              </Alert>
            )}

            {emptyRoles.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  This flow can be saved but not completed: {emptyRoles.length}{' '}
                  {emptyRoles.length === 1 ? 'approver routes' : 'approvers route'} to a role
                  nobody currently holds.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

    </>
  );

  /*
   * DialogFooter is flex-col-reverse below sm and DrawerFooter stacks too, so
   * these buttons end up in a column on a phone. Made full-width there: a
   * left-aligned ghost button sitting under two others reads as a stray link
   * rather than the third action.
   */
  const footer = (
    <>
          <Button type="button" variant="ghost" className="w-full sm:w-auto" onClick={handleClear}
            disabled={!resolved?.own || clear.isPending}
            title={resolved?.own
              ? 'Delete this type-specific flow and inherit the organization default'
              : 'This type already inherits the organization default'}>
            Use organization default
          </Button>
          <div className="flex w-full gap-2 sm:w-auto">
            <Button type="button" variant="outline" className="flex-1 sm:flex-none"
              onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" className="flex-1 sm:flex-none"
              onClick={handleSave} disabled={!allValid || save.isPending}>
              {save.isPending ? 'Saving…' : 'Save flow'}
            </Button>
          </div>
    </>
  );

  /*
   * Drawer below 768px, Dialog above — the rule leave-type-detail-dialog.tsx
   * already follows, and the same breakpoint at which the DataTable swaps rows
   * for cards, so the table and both of its modals agree on what "mobile" means.
   *
   * It matters more here than on the read-only detail view: this is a form with
   * a per-step approver search, and a centred 90vh dialog on a phone leaves the
   * Save button hovering over a page you cannot see, with square edge-to-edge
   * corners (the base DialogContent is `w-full max-w-lg p-6` with no gutter and
   * `sm:rounded-lg`). A drawer is anchored, full-width by design, and keeps its
   * footer reachable.
   */
  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[90vh]">
          <DrawerHeader className="text-left">
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>{description}</DrawerDescription>
          </DrawerHeader>
          <div className="space-y-4 overflow-y-auto px-4 pb-2">{body}</div>
          <DrawerFooter className="gap-2">{footer}</DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {body}
        <DialogFooter className="gap-2 sm:justify-between">{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
