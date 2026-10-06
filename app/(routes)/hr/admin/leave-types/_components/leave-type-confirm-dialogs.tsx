'use client';

// Archive and Delete confirmations for a leave type — OWNED BY THE PAGE.
//
// WHY THEY LIVE HERE AND NOT IN THE ROW ACTIONS
//
// They used to be rendered inside LeaveTypeRowActions, which is the `cell` of a
// TanStack column. Everything about that cell is rebuilt whenever the columns
// memo recomputes, and its deps include onCheckDelete/onDelete — callbacks whose
// identity changes the moment the delete mutation moves from idle to pending.
// Opening the dialog STARTS that mutation (the dry run), so opening it was the
// thing that tore it down: the confirmation appeared and vanished on its own,
// reported as "the modal was auto closed".
//
// Every other dialog on this page — detail, form, assignment, approval flow — is
// already page-level state for this reason. Archive and Delete were the only two
// left inside a row, and the only two that misbehaved. Page state survives any
// re-render of the table, so this is immune to the whole class rather than to
// one trigger.
//
// Both are presentational: the page owns the dry-run result and passes it in, so
// there is no effect here firing a request on mount and no setState-in-effect.

import { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { HRLeaveType } from '@/types/hr-leave-types';
import type {
  HRLeaveTypeDeleteResult,
  HRLeaveTypeSuperDeleteCounts,
  HRLeaveTypeSuperDeleteResult,
} from '@/lib/services/hr/leave-type-service';

/** Blocker key -> how to say it in a sentence about leave. */
const BLOCKER_LABELS: Record<string, [singular: string, plural: string]> = {
  applications: ['leave application', 'leave applications'],
  encashments: ['encashment', 'encashments'],
  consumed_balances: ['balance with leave taken', 'balances with leave taken'],
  overrides: ['per-staff entitlement override', 'per-staff entitlement overrides'],
  adjustments: ['balance adjustment', 'balance adjustments'],
  superseding_types: ['leave type superseded by it', 'leave types superseded by it'],
};

export function LeaveTypeArchiveDialog({
  leaveType,
  isArchiving,
  onOpenChange,
  onConfirm,
}: {
  leaveType: HRLeaveType | null;
  isArchiving: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={leaveType !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive this leave type?</AlertDialogTitle>
          <AlertDialogDescription>
            <strong>{leaveType?.leave_type_name}</strong> will stop being offered
            when staff apply for leave. Existing applications and balances are not
            affected, and you can put it back with <strong>Activate</strong> on the
            same menu.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isArchiving}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              // Keep the dialog mounted while the mutation runs — the default
              // action closes it immediately, unmounting the pending state.
              e.preventDefault();
              onConfirm();
            }}
            disabled={isArchiving}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isArchiving ? 'Archiving…' : 'Archive'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function LeaveTypeDeleteDialog({
  leaveType,
  impact,
  isDeleting,
  onOpenChange,
  onConfirm,
}: {
  leaveType: HRLeaveType | null;
  /** null while the page's dry run is still in flight. */
  impact: HRLeaveTypeDeleteResult | null;
  isDeleting: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const blockers = Object.entries(impact?.blockers ?? {}).filter(([, n]) => n > 0);
  const canDelete = impact?.ok === true && blockers.length === 0;

  return (
    <AlertDialog open={leaveType !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete {leaveType?.leave_type_name} permanently?
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              {impact === null && (
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Checking what depends on this leave type…
                </span>
              )}

              {/* Refused. The server names every reason, so the admin knows
                  what to look at instead of being told "cannot delete". */}
              {impact && !canDelete && (
                <>
                  <span className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-destructive">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      {blockers.length > 0
                        ? 'This leave type has history attached, so it cannot be deleted. It stays archived, which already hides it from staff.'
                        : impact.message ?? 'This leave type cannot be deleted right now.'}
                    </span>
                  </span>
                  {blockers.length > 0 && (
                    <ul className="list-disc space-y-0.5 pl-5">
                      {blockers.map(([key, n]) => {
                        const [one, many] = BLOCKER_LABELS[key] ?? [key, key];
                        return (
                          <li key={key}>
                            <strong>{n}</strong> {n === 1 ? one : many}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </>
              )}

              {/* Allowed. Say what goes, in the operator's units. */}
              {canDelete && (
                <>
                  <span>
                    Nothing depends on this leave type, so it can be removed for good.
                    This cannot be undone.
                  </span>
                  {impact?.will_remove && (
                    <ul className="list-disc space-y-0.5 pl-5">
                      <li>
                        <strong>{impact.will_remove.placeholder_balances}</strong> unused
                        balance row
                        {impact.will_remove.placeholder_balances === 1 ? '' : 's'} — generated
                        allowances nobody drew on
                      </li>
                      {impact.will_remove.assignments > 0 && (
                        <li>
                          <strong>{impact.will_remove.assignments}</strong> “who gets this”
                          assignment{impact.will_remove.assignments === 1 ? '' : 's'}
                        </li>
                      )}
                      {impact.will_remove.cadre_entitlements > 0 && (
                        <li>
                          <strong>{impact.will_remove.cadre_entitlements}</strong> cadre
                          entitlement{impact.will_remove.cadre_entitlements === 1 ? '' : 's'}
                        </li>
                      )}
                      {impact.will_remove.policies > 0 && (
                        <li>
                          <strong>{impact.will_remove.policies}</strong> leave polic
                          {impact.will_remove.policies === 1 ? 'y' : 'ies'}
                        </li>
                      )}
                    </ul>
                  )}
                </>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>
            {canDelete ? 'Cancel' : 'Close'}
          </AlertDialogCancel>
          {/* No button at all until the server has cleared it — a disabled
              Delete on a refused dialog just invites clicking. */}
          {canDelete && (
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                onConfirm();
              }}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting…' : 'Delete permanently'}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Counts the super-admin delete reports, in the order the dialog lists them.
 * Each row is [key, singular, plural].
 */
const SUPER_DELETE_LABELS: Array<
  [keyof HRLeaveTypeSuperDeleteCounts, singular: string, plural: string]
> = [
  ['balances_with_leave_taken', 'balance with leave already taken', 'balances with leave already taken'],
  ['balances_unused', 'unused balance row', 'unused balance rows'],
  ['adjustments', 'balance adjustment (audit trail)', 'balance adjustments (audit trail)'],
  ['overrides', 'per-staff entitlement override', 'per-staff entitlement overrides'],
  ['eligibilities', 'eligibility request or grant', 'eligibility requests and grants'],
  ['month_entries', 'month-wise leave entry', 'month-wise leave entries'],
  ['assignments', '“who gets this” assignment', '“who gets this” assignments'],
  ['cadre_entitlements', 'cadre entitlement', 'cadre entitlements'],
  ['policies', 'leave policy', 'leave policies'],
  ['work_pattern_entitlements', 'work-pattern entitlement', 'work-pattern entitlements'],
];

/**
 * Rows that record what people actually took, were granted or were corrected to,
 * as opposed to generated balances and configuration. If any exist, confirming
 * needs the leave type's name typed: a menu click is not enough to erase them.
 */
const SUPER_DELETE_HISTORY_KEYS: ReadonlyArray<keyof HRLeaveTypeSuperDeleteCounts> = [
  'balances_with_leave_taken',
  'adjustments',
  'overrides',
  'eligibilities',
  'month_entries',
];

/**
 * Super-admin delete confirmation. Presentational like the two above: the page
 * owns the dry run and passes the result in.
 *
 * The page MUST give this a `key` that changes with the target type, because the
 * typed-name box is local state and has to start empty for each type.
 */
export function LeaveTypeSuperDeleteDialog({
  leaveType,
  impact,
  isDeleting,
  onOpenChange,
  onConfirm,
}: {
  leaveType: HRLeaveType | null;
  /** null while the page's dry run is still in flight. */
  impact: HRLeaveTypeSuperDeleteResult | null;
  isDeleting: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const [typed, setTyped] = useState('');

  const blockers = Object.entries(impact?.blockers ?? {}).filter(([, n]) => n > 0);
  const canDelete = impact?.ok === true && blockers.length === 0;
  const willRemove = impact?.will_remove;
  const lines = willRemove
    ? SUPER_DELETE_LABELS.filter(([key]) => willRemove[key] > 0)
    : [];
  const historyRows = willRemove
    ? SUPER_DELETE_HISTORY_KEYS.reduce((sum, key) => sum + willRemove[key], 0)
    : 0;
  const name = leaveType?.leave_type_name ?? '';
  const needsTyping = canDelete && historyRows > 0;
  const typedOk = !needsTyping || typed.trim() === name.trim();

  return (
    <AlertDialog open={leaveType !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {name} permanently?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              {impact === null && (
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Checking what is attached to this leave type…
                </span>
              )}

              {impact && impact.organization_name && (
                <span className="block text-sm">
                  Organization: <strong>{impact.organization_name}</strong>
                </span>
              )}

              {/* Refused. Name the reason; a super admin is not told "no". */}
              {impact && !canDelete && (
                <>
                  <span className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-destructive">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      {impact.error === 'permission_denied'
                        ? 'Only a super admin can delete a leave type this way.'
                        : blockers.length > 0
                          ? 'Leave applications, encashments or a newer version are attached, and those are never deleted from here. It can only stay archived.'
                          : impact.message ?? impact.error ?? 'This leave type cannot be deleted right now.'}
                    </span>
                  </span>
                  {blockers.length > 0 && (
                    <ul className="list-disc space-y-0.5 pl-5">
                      {blockers.map(([key, n]) => {
                        const [one, many] = BLOCKER_LABELS[key] ?? [key, key];
                        return (
                          <li key={key}>
                            <strong>{n}</strong> {n === 1 ? one : many}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </>
              )}

              {canDelete && (
                <>
                  {impact?.was_active && (
                    <span className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-amber-900 dark:text-amber-200">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>
                        This leave type is <strong>active</strong>: staff can apply for it
                        right now. It disappears from Apply Leave the moment you confirm.
                      </span>
                    </span>
                  )}
                  <span>
                    This removes the leave type for good, together with everything below.
                    <strong> This cannot be undone.</strong>
                  </span>
                  {lines.length > 0 ? (
                    <ul className="list-disc space-y-0.5 pl-5">
                      {lines.map(([key, one, many]) => (
                        <li key={key}>
                          <strong>{willRemove![key]}</strong> {willRemove![key] === 1 ? one : many}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="block text-muted-foreground">
                      Nothing else is attached to it.
                    </span>
                  )}
                  {needsTyping && (
                    <span className="block space-y-1.5">
                      <Label htmlFor="super-delete-confirm" className="text-foreground">
                        Type <strong>{name}</strong> to confirm
                      </Label>
                      <Input
                        id="super-delete-confirm"
                        value={typed}
                        onChange={(e) => setTyped(e.target.value)}
                        autoComplete="off"
                        disabled={isDeleting}
                      />
                    </span>
                  )}
                </>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>
            {canDelete ? 'Cancel' : 'Close'}
          </AlertDialogCancel>
          {/* No button until the server has cleared it. */}
          {canDelete && (
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                onConfirm();
              }}
              disabled={isDeleting || !typedOk}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting…' : 'Delete permanently'}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
