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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
  usePreviewLeaveChainDrift,
  useResyncPendingLeaveChains,
  useSaveLeaveApprovalFlow,
} from '@/hooks/hr/use-leave-approval-flows';
import { useHrOrgMappings } from '@/hooks/hr/use-hr-org-mappings';
import { LEAVE_STAFF_GROUP_LABELS } from '@/types/hr-leave-types';
import type {
  HRLeaveType, LeaveApprovalFlowStep, LeaveChainResyncResult, LeaveFlowFor, LeaveFlowRunMode,
  LeaveFlowSlot, LeaveFlowStepSource, LeaveStepQuorum,
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

/*
 * A MODULE-LEVEL COUNTER IS NOT AN IDENTITY. This was `let seq = 0` with
 * `s${++seq}`, which is monotonic only for as long as the module instance
 * lives. Turbopack re-evaluates the module on every Fast Refresh while React
 * keeps the `steps` state, so editing this file and then adding a step handed
 * out `s1` a second time — "Encountered two children with the same key, `s1`",
 * and React then reconciles two different steps onto one node.
 *
 * Mirrors lib/utils/question-papers/sub-questions.ts: randomUUID where the
 * context allows it, and a fallback for the http:// LAN origins where
 * crypto.randomUUID is simply undefined.
 */
const draftKey = (prefix: string): string => {
  const c: any = (globalThis as any).crypto;
  return `${prefix}${c?.randomUUID ? c.randomUUID() : `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`}`;
};

/** All staff first: it is the default, and the only slot most types ever use. */
const SLOTS: LeaveFlowSlot[] = [null, 'teaching', 'non_teaching'];

const newStep = (p?: Partial<DraftStep>): DraftStep => ({
  key: draftKey('s'),
  approvers: [newApprover()],
  quorum: 'any',
  escalate_after_hours: 48,
  ...p,
});

export function LeaveApprovalFlowDialog({
  leaveType,
  open,
  onOpenChange,
  flowFor = 'leave_approval',
}: {
  leaveType: HRLeaveType | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /**
   * 'leave_eligibility' turns this into "Who approves eligibility" (2026-09-21):
   * the same editor over the same table, minus the staff-group tabs (an
   * eligibility flow governs everyone who asks) and minus the re-route offer
   * (pending eligibility requests are few and short-lived). A gated type with
   * no eligibility flow routes its requests to its LEAVE flow, so the editor
   * seeds from that when there is nothing of its own to show.
   */
  flowFor?: LeaveFlowFor;
}) {
  const isEligibility = flowFor === 'leave_eligibility';
  const hrOrgId = leaveType?.hr_organization_id;
  const { data: resolved, isLoading } = useLeaveApprovalFlow(hrOrgId, leaveType?.id, flowFor);
  // The leave flow behind an eligibility flow — what a request falls back to
  // and what an empty editor seeds from. Fetched only in eligibility mode.
  const { data: leaveResolved, isLoading: leaveLoading } = useLeaveApprovalFlow(
    isEligibility ? hrOrgId : undefined,
    leaveType?.id,
    'leave_approval'
  );
  const { data: roles } = useLeaveApproverRoles(open);

  // Leave types are keyed on hr_organization_id, which is meaningless on screen.
  // hr_organizations.name is maintained identical to institutions.name for every
  // mapped org, so this map is the institution label without a second join.
  const { orgNameById, isLoading: orgsLoading } = useHrOrgMappings();
  const institutionName = hrOrgId ? orgNameById.get(hrOrgId) : undefined;

  const save = useSaveLeaveApprovalFlow();
  const clear = useClearLeaveApprovalFlow();
  const previewDrift = usePreviewLeaveChainDrift();
  const resync = useResyncPendingLeaveChains();

  /**
   * The re-route offer, raised after a save or a clear.
   *
   * A chain is FROZEN at apply time, so editing a flow does nothing for requests
   * already in flight — they keep routing to whoever the previous flow named. We
   * ask rather than act: an edit is often a typo fix nobody wants rippling out
   * across hundreds of live requests.
   *
   * `flowId` is the flow that GOVERNS the type after the change, which is not
   * always the one just written — clearing a per-type flow hands the type back to
   * the organisation catch-all, so that is the id we re-sync against.
   */
  const [reroute, setReroute] = useState<
    { flowId: string; drift: LeaveChainResyncResult } | null
  >(null);

  /**
   * WHICH STAFF THE FLOW ON SCREEN GOVERNS.
   *
   * `null` is the All staff slot — the only one that existed before
   * 2026-09-19, and still the default every dialog opens on. Picking Teaching
   * or Non-teaching edits a flow that OVERRIDES All staff for that group only;
   * a group with no flow of its own keeps using All staff, so nothing here has
   * to be filled in for the feature to stay off.
   */
  const [slot, setSlot] = useState<LeaveFlowSlot>(null);

  /** The saved flow for the slot on screen, or null when it inherits. */
  const slotOwnFlow =
    slot === 'teaching'
      ? resolved?.teaching ?? null
      : slot === 'non_teaching'
        ? resolved?.nonTeaching ?? null
        : resolved?.own ?? null;

  /**
   * What the slot resolves to TODAY, own flow or inherited. This is what the
   * editor seeds from, so opening a group tab that has no flow yet starts from
   * the chain those staff actually get rather than from an empty one.
   */
  const slotEffective =
    slot === 'teaching'
      ? resolved?.effectiveTeaching ?? null
      : slot === 'non_teaching'
        ? resolved?.effectiveNonTeaching ?? null
        : // An eligibility flow with nothing of its own falls back to the LEAVE
          // flow at request time, so that is what the editor opens on.
          resolved?.effective ?? (isEligibility ? leaveResolved?.effective ?? null : null);

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
    // In eligibility mode the seed may come from the leave flow, so wait for
    // it too — seeding once from `null` and never again is how the editor would
    // open empty on a type whose leave flow is perfectly good.
    if (isEligibility && leaveLoading) return;
    // Keyed on the SLOT as well as the type, so switching to the Non-teaching
    // tab re-seeds the editor from that group's flow instead of leaving the
    // All-staff chain on screen under a different heading.
    const seedKey = `${leaveType.id}|${slot ?? 'all'}`;
    if (seeded === seedKey) return;
    const src = slotEffective;

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
    setSeeded(seedKey);
  }, [open, isLoading, isEligibility, leaveLoading, leaveType, resolved, seeded, slot, slotEffective]);

  useEffect(() => {
    if (!open) {
      setSeeded(null);
      // Always reopen on All staff. A dialog that remembered the last tab would
      // put an administrator on a group slot without their having chosen it.
      setSlot(null);
    }
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

  /**
   * Offer to re-route the requests `flowId` now governs, if there are any.
   *
   * Failure here is deliberately non-fatal: the flow itself saved, and a drift
   * count that could not be read is a worse reason to show an error than no
   * reason at all. The admin can re-open and save again to be asked once more.
   */
  const offerReroute = async (flowId: string | undefined) => {
    if (!flowId) return;
    try {
      const drift = await previewDrift.mutateAsync(flowId);
      if ((drift.eligible ?? 0) > 0) setReroute({ flowId, drift });
    } catch {
      /* the save stands; the offer is the only thing lost */
    }
  };

  const handleReroute = async () => {
    if (!reroute) return;
    try {
      const r = await resync.mutateAsync(reroute.flowId);
      const parts = [`${r.resynced ?? 0} request${r.resynced === 1 ? '' : 's'} re-routed`];
      if (r.skipped_decided > 0) {
        parts.push(`${r.skipped_decided} skipped — already part-approved`);
      }
      // Its own sentence, because unlike a part-approved request this one needs
      // the attendance period unlocked rather than a second click.
      if (r.skipped_locked > 0) {
        parts.push(`${r.skipped_locked} skipped — the attendance period is closed`);
      }
      toast.success(`${parts.join('. ')}.`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setReroute(null);
    }
  };

  const handleSave = async () => {
    if (!leaveType || !hrOrgId) return;
    try {
      const saved = await save.mutateAsync({
        // The slot's OWN flow, never what it inherits: saving a group tab that
        // is currently inheriting must create a new flow, not overwrite the
        // All-staff one it was seeded from.
        id: slotOwnFlow?.id,
        hrOrgId,
        leaveTypeId: leaveType.id,
        flowFor,
        // An eligibility flow has no group slot; the tabs are hidden in that
        // mode and the service refuses one anyway.
        staffGroup: isEligibility ? undefined : slot ?? undefined,
        flowName: isEligibility
          ? `${leaveType.leave_type_name} eligibility approval`
          : slot
            ? `${leaveType.leave_type_name} approval — ${LEAVE_STAFF_GROUP_LABELS[slot]}`
            : `${leaveType.leave_type_name} approval`,
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
      toast.success(
        isEligibility
          ? `Eligibility approvers saved for ${leaveType.leave_type_name}`
          : `Approval flow saved for ${leaveType.leave_type_name}`
      );
      onOpenChange(false);
      // save() returns the row it wrote, which is the flow that governs this type
      // from now on — including on a first save, where there was no id to pass in.
      // The re-route RPCs read hr_leave_applications only, so there is nothing
      // to offer for an eligibility flow.
      if (!isEligibility) await offerReroute(saved?.id);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const handleClear = async () => {
    if (!leaveType || !hrOrgId || !slotOwnFlow) return;
    try {
      await clear.mutateAsync({ flowId: slotOwnFlow.id, hrOrgId, leaveTypeId: leaveType.id });
      toast.success(
        isEligibility
          ? resolved?.fallback
            ? 'Eligibility requests now use the institution eligibility flow'
            : 'Eligibility requests now go to the leave approvers'
          : slot
            ? `${LEAVE_STAFF_GROUP_LABELS[slot]} team members now use the All team members flow`
            : 'Reverted to the organization default'
      );
      onOpenChange(false);
      if (isEligibility) return;
      // WHAT GOVERNS THOSE STAFF NOW, which is not the same answer for the two
      // cases: removing a group flow hands that group back to All staff (or the
      // catch-all behind it), while removing the All staff flow hands the whole
      // type to the catch-all. If the organisation has neither, the type has no
      // flow at all and there is nothing to offer.
      await offerReroute(
        slot ? (resolved?.own?.id ?? resolved?.fallback?.id) : resolved?.fallback?.id
      );
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const inheriting = !resolved?.own && !!resolved?.fallback;
  // Eligibility only: nothing of its own AND no institution catch-all, so
  // requests go to the leave flow. Worth its own banner because the chain on
  // screen is that leave flow, and Save would copy it into a new flow.
  const fallsBackToLeave = isEligibility && !resolved?.own && !resolved?.fallback;
  // Same breakpoint as leave-type-detail-dialog.tsx and the DataTable's
  // row/card swap, so the table and both its modals agree on "mobile".
  const isMobile = useMediaQuery('(max-width: 768px)');

  const title = (
    <span className="flex items-start gap-2 text-left">
      <GitBranch className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
      {/* min-w-0 lets a long leave type name wrap instead of forcing the
          header wider than the container. */}
      <span className="min-w-0 break-words">
        {isEligibility ? 'Eligibility approvers' : 'Approval flow'} — {leaveType?.leave_type_name}
      </span>
    </span>
  );

  const description = isEligibility
    ? 'Who reads the supporting document and decides whether a team member may use ' +
      'this leave type at all. Decided once per person; the leave itself then follows ' +
      '"Who approves this". The chain is copied onto a request when it is filed, so ' +
      'editing here never changes requests already in flight.'
    : 'Who signs off on this leave type. Each step is cleared in order; the last ' +
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

        {/* WHICH STAFF THIS FLOW IS FOR.
            All staff is the default and the only slot most types ever use. A
            group tab exists so an institution can route, say, every
            non-teaching request to one named person while teaching staff keep
            the longer chain — without that, one leave type could only ever have
            one set of approvers.
            Not offered for an eligibility flow: it governs everyone who asks. */}
        {leaveType && !isEligibility && (
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs font-medium text-muted-foreground">Applies to</span>
              {SLOTS.map((s) => {
                const active = slot === s;
                const own =
                  s === null
                    ? Boolean(resolved?.own)
                    : s === 'teaching'
                      ? Boolean(resolved?.teaching)
                      : Boolean(resolved?.nonTeaching);
                return (
                  <button
                    key={s ?? 'all'}
                    type="button"
                    onClick={() => setSlot(s)}
                    className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                      active
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'bg-background hover:bg-muted'
                    }`}
                  >
                    {s === null ? 'All team members' : LEAVE_STAFF_GROUP_LABELS[s]}
                    {/* A group with no flow of its own is where you ADD one, so
                        it says so. Without this marker a configured tab and an
                        empty one look identical, and the only way to tell was
                        to open each in turn. */}
                    <span className={active ? 'ml-1.5 opacity-80' : 'ml-1.5 text-muted-foreground'}>
                      {own ? '•' : s === null ? '' : '+'}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              {slot === null
                ? 'The default for everyone. A group with no flow of its own uses this one.'
                : slotOwnFlow
                  ? `${LEAVE_STAFF_GROUP_LABELS[slot]} team members have their own flow for this leave type.`
                  : `${LEAVE_STAFF_GROUP_LABELS[slot]} team members currently use the All team members flow. Saving here creates a flow just for them.`}
            </p>
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
                  {isEligibility ? 'Eligibility for this' : 'This'} leave type has no flow of its
                  own and currently inherits
                  <strong> {resolved?.fallback?.flow_name}</strong>. Saving below creates
                  a flow just for {leaveType?.leave_type_name}.
                </AlertDescription>
              </Alert>
            )}

            {fallsBackToLeave && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  No eligibility approvers are set for this institution, so eligibility requests
                  for {leaveType?.leave_type_name} currently go to its <em>leave</em> approvers
                  {leaveResolved?.effective?.flow_name ? (
                    <> (<strong>{leaveResolved.effective.flow_name}</strong>)</>
                  ) : null}
                  . That chain is shown below as a starting point — change it and save to give
                  eligibility its own approvers.
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
                  Nobody is above the highest rung, so the person holding it cannot{' '}
                  {isEligibility ? 'request eligibility for' : 'submit'} this leave type at all.
                  Set a fallback approver above.
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
          {/* One button, two meanings, because the slot decides what "remove
              this flow" hands the team members back to. */}
          <Button type="button" variant="ghost" className="w-full sm:w-auto" onClick={handleClear}
            disabled={!slotOwnFlow || clear.isPending}
            title={
              isEligibility
                ? slotOwnFlow
                  ? 'Delete this eligibility flow; requests go to the institution eligibility flow, or to the leave approvers if there is none'
                  : 'This type has no eligibility flow of its own'
                : slot
                  ? slotOwnFlow
                    ? `Delete this ${LEAVE_STAFF_GROUP_LABELS[slot]} flow; those team members go back to the All team members flow`
                    : `${LEAVE_STAFF_GROUP_LABELS[slot]} team members already use the All team members flow`
                  : slotOwnFlow
                    ? 'Delete this type-specific flow and inherit the organization default'
                    : 'This type already inherits the organization default'
            }>
            {isEligibility
              ? 'Remove eligibility flow'
              : slot
                ? `Remove ${LEAVE_STAFF_GROUP_LABELS[slot]} flow`
                : 'Use organization default'}
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
  /*
   * Rendered beside BOTH the drawer and the dialog, and outside either, because
   * it outlives them: the flow editor closes on save, and this is what opens
   * next. Its own AlertDialog rather than a third state of the editor, so
   * "re-route 154 live requests" is a deliberate second decision.
   */
  const rerouteDialog = (
    <AlertDialog open={!!reroute} onOpenChange={(v) => { if (!v) setReroute(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Re-route pending requests?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                {reroute?.drift.eligible} pending request
                {reroute?.drift.eligible === 1 ? '' : 's'} still use the approvers this
                flow named before your change. Re-routing rebuilds them from the flow
                you just saved.
              </p>
              {!!reroute?.drift.skipped_decided && (
                <p>
                  {reroute.drift.skipped_decided} more{' '}
                  {reroute.drift.skipped_decided === 1 ? 'is' : 'are'} already
                  part-approved and will keep their current approvers — a decision
                  someone has recorded is never discarded.
                </p>
              )}
              {!!reroute?.drift.skipped_locked && (
                <p>
                  {reroute.drift.skipped_locked} cannot be changed at all: their dates
                  fall in a closed attendance period.
                </p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={resync.isPending}>Leave them</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); void handleReroute(); }}
            disabled={resync.isPending}
          >
            {resync.isPending ? 'Re-routing…' : 'Re-route'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  if (isMobile) {
    return (
      <>
        <Drawer open={open} onOpenChange={onOpenChange}>
          <DrawerContent className="max-h-[90vh]">
            <DrawerHeader className="text-left">
              <DrawerTitle>{title}</DrawerTitle>
              <DrawerDescription>{description}</DrawerDescription>
            </DrawerHeader>
            {/* min-h-0 flex-1 for the same reason as the dialog below: DrawerContent
                is `flex h-auto flex-col`, so without them this body grows to fit its
                content and pushes DrawerFooter — Save included — past the 90vh cap. */}
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-2">{body}</div>
            <DrawerFooter className="gap-2">{footer}</DrawerFooter>
          </DrawerContent>
        </Drawer>
        {rerouteDialog}
      </>
    );
  }

  /*
   * A FLEX SHELL, NOT A SCROLLING ROOT. The base DialogContent is `grid … p-6`
   * with no height cap, and the obvious fix — `max-h-[90vh] overflow-y-auto` on
   * the root — is wrong twice over. It scrolls the footer away with the body,
   * and it makes the dialog the nearest CLIPPING ancestor. RolePicker portals
   * its popover INTO this element on purpose (see role-picker.tsx: outside it
   * the focus trap eats keystrokes and react-remove-scroll eats wheel events),
   * so a clipping root cuts the role dropdown off at the dialog's bottom edge —
   * the list is rendered and focused, just invisible, which is what a step's
   * role field looked like once the flow grew past a couple of steps.
   *
   * Only the BODY scrolls. The root keeps `overflow: visible`, so the popover
   * can escape the dialog and Radix can flip it against the viewport.
   *
   * min-h-0 is load-bearing, not decoration: a flex child defaults to
   * `min-height: auto` and refuses to shrink below its content, so without it
   * the body never scrolls and max-h-[90vh] silently does nothing. The -mx-6/px-6
   * pair is what keeps the scrollbar on the dialog's edge while the content
   * keeps the p-6 gutter.
   */
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className="-mx-6 min-h-0 flex-1 space-y-4 overflow-y-auto px-6">{body}</div>
          <DialogFooter className="shrink-0 gap-2 sm:justify-between">{footer}</DialogFooter>
        </DialogContent>
      </Dialog>
      {rerouteDialog}
    </>
  );
}
