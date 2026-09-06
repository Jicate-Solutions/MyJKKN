'use client';

// Correct one staff member's balance for one leave type.
//
// Three levers, kept apart because they mean different things:
//
//   * "Used days" writes hr_leave_balances.used for the whole year — a factual
//     correction ("she actually took 1.5, not 2").
//   * "Entitlement" writes hr_leave_entitlement_overrides — a policy decision
//     for this one person ("mid-year joiner, pro-rate to 7").
//   * "Month-wise" sets the total for ONE month, overriding the approved
//     requests dated in it.
//
// ALL THREE ARE SUPER-ADMIN ONLY as of 2026-09-06 (migrations 20260906130000
// and 20260906130100). They previously took hr.leave.policies.write and
// hr.leave.balance.manage respectively; that was widened away because these
// levers rewrite consumed days with no application and no approval chain behind
// them. Note the old key reached further than it looked: user_has_permission
// also grants through the user_roles multi-role table and Director handovers,
// so roles such as hr_head held it.
//
// The RPCs check is_super_admin() themselves, so this screen widens nobody's
// access. It hides the levers the caller cannot use rather than letting them
// fill in a form the server will refuse — but the month-wise BREAKDOWN stays
// readable, because that is what the dialog is most often opened to answer.
//
// What is NOT offered: writing hr_leave_balances.entitled. A literal there sets
// entitlement_source='frozen' and detaches the row from the leave type's
// default forever, so a later policy change silently skips that person. The
// overrides table is the supported way to say "this person is different", and
// it carries a mandatory reason.

import { useState } from 'react';
import { AlertCircle, Info, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LeaveMonthlyLedger } from '@/components/hr/leave-monthly-ledger';
import { useAuth } from '@/hooks/use-auth';
import { useAdjustLeaveBalance } from '@/hooks/hr/use-hr-leave-types';
import { getErrorMessage } from '@/lib/utils';
import type {
  HRBalanceAdjustAction,
  HRStaffBalanceCell,
  HRStaffBalanceLeaveType,
  HRStaffBalanceRow,
} from '@/types/hr-leave-staff-balances';

import { SOURCE_META } from './balance-flags';

export interface AdjustTarget {
  staff: HRStaffBalanceRow;
  leaveType: HRStaffBalanceLeaveType;
  cell: HRStaffBalanceCell;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Null while the dialog is closed. */
  target: AdjustTarget | null;
  hrAcademicYearId: string;
  yearName: string | null;
}

/**
 * Shell only. The form is a keyed child so switching to a different cell
 * remounts it with fresh initial state — React's own answer to "reset state
 * when a prop changes". Seeding the inputs from a useEffect instead trips the
 * React Compiler's set-state-in-effect rule and causes a cascading render.
 */
export function AdjustBalanceDialog({
  open, onOpenChange, target, hrAcademicYearId, yearName,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* DialogContent carries NO max-height and NO overflow of its own, so a
          twelve-row ledger would run off the bottom of the viewport with the
          footer painted over the page. The fix is a flex shell: cap the height
          here, and let the middle region scroll — `min-h-0` and
          `overflow-y-auto` must sit on the SAME element or the body scrolls
          instead and the footer goes under it. */}
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-3xl">
        {target && (
          <AdjustForm
            key={`${target.staff.employee_id}:${target.leaveType.id}`}
            target={target}
            hrAcademicYearId={hrAcademicYearId}
            yearName={yearName}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function AdjustForm({
  target, hrAcademicYearId, yearName, onDone,
}: {
  target: AdjustTarget;
  hrAcademicYearId: string;
  yearName: string | null;
  onDone: () => void;
}) {
  const { staff, leaveType, cell } = target;

  // SUPER ADMIN ONLY, for both levers and for the month-wise editor.
  //
  // Previously used days needed hr.leave.policies.write and entitlement needed
  // hr.leave.balance.manage. Both RPCs now check is_super_admin() instead
  // (20260906130000 / 20260906130100), so deriving the UI from those keys would
  // show controls the server refuses. Gate on isSuperAdmin, never on a key.
  // Mirrors the SERVER's check exactly. public.is_super_admin() reads ONLY
  // profiles.is_super_admin -- it does NOT accept role = 'super_admin', unlike
  // the `is_super_admin === true || role === 'super_admin'` pattern used
  // elsewhere in this app. The two agree in the data today (15 profiles each,
  // no divergence), but widening here would offer controls the RPC then refuses.
  const { profile, isLoading: permsLoading } = useAuth();
  const isSuperAdmin = profile?.is_super_admin === true;
  const canSetUsed = isSuperAdmin;
  const canSetEntitlement = isSuperAdmin;

  const mutation = useAdjustLeaveBalance();

  // Initialised straight from props — no effect, because this component is
  // remounted (via key) whenever the target cell changes.
  const [used, setUsed] = useState(String(cell.used));
  const [entitled, setEntitled] = useState(String(cell.entitled));
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Controlled so the footer's Save button knows which lever is showing. With
  // an uncontrolled Tabs it always submitted the first permitted action, so
  // opening Entitlement and pressing Save wrote `used`.
  //
  // 'ledger' is read-only and always available — a viewer who can change
  // nothing can still be shown where the days went, which is the question this
  // dialog is most often opened to answer. It is the landing tab when the
  // caller holds neither write key, so those users get content rather than an
  // error card.
  const [tab, setTab] = useState<'used' | 'entitlement' | 'ledger'>(
    canSetUsed ? 'used' : canSetEntitlement ? 'entitlement' : 'ledger'
  );

  const sourceMeta = SOURCE_META[cell.source];
  const busy = mutation.isPending;
  const noLever = !permsLoading && !canSetUsed && !canSetEntitlement;

  const submit = (action: HRBalanceAdjustAction) => {
    setError(null);

    const raw = action === 'set_used' ? used : entitled;
    const value = action === 'clear_entitlement' ? null : Number(raw);

    if (action !== 'clear_entitlement') {
      if (raw.trim() === '' || Number.isNaN(value as number) || (value as number) < 0) {
        setError('Enter a number of days that is zero or more.');
        return;
      }
    }
    if (reason.trim() === '') {
      setError('A reason is required — it is what makes this adjustment auditable.');
      return;
    }

    mutation.mutate(
      {
        employee_id: staff.employee_id,
        leave_type_id: leaveType.id,
        hr_academic_year_id: hrAcademicYearId,
        action,
        value,
        reason: reason.trim(),
      },
      {
        onSuccess: () => {
          toast.success(
            action === 'clear_entitlement'
              ? `${staff.name} is back on the ${leaveType.name} policy default.`
              : `${leaveType.name} updated for ${staff.name}.`
          );
          onDone();
        },
        // Supabase errors are plain objects, not Error instances — instanceof
        // would fall through and show "Unknown error" for every RLS denial.
        onError: (err) => setError(getErrorMessage(err)),
      }
    );
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Adjust {leaveType.name}</DialogTitle>
        <DialogDescription>
          {staff.name}
          {staff.staff_code ? ` · ${staff.staff_code}` : ''}
          {yearName ? ` · ${yearName}` : ''}
        </DialogDescription>
      </DialogHeader>

      {/* Current state first: an adjustment made without seeing where the
          number came from is how a policy-tracking row gets frozen. */}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
      <div className="grid grid-cols-3 gap-3 rounded-md border bg-muted/30 p-3 text-sm md:grid-cols-6">
        <Figure label="Entitled" value={cell.entitled} />
        {/* Accrued sits beside Entitled rather than replacing it because for an
            accruing type the two diverge all year — Casual Leave reads 12
            entitled and 4 accrued in September, and only the second is
            spendable. Showing entitled alone is what let this screen contradict
            the staff member's own apply drawer. */}
        <Figure
          label="Accrued"
          value={cell.accrued}
          hint={cell.accrued < cell.entitled ? 'earned so far' : undefined}
        />
        <Figure label="Carried" value={cell.carried} />
        <Figure label="Used" value={cell.used} />
        <Figure label="Pending" value={cell.pending} />
        <Figure label="Available" value={cell.available} />
        <div className="col-span-full flex flex-wrap items-center gap-2 border-t pt-2">
          <Badge variant="outline" className={`font-normal ${sourceMeta.tone}`}>
            {sourceMeta.label}
          </Badge>
          <span className="text-xs text-muted-foreground">{sourceMeta.hint}</span>
        </div>
        {!cell.has_row && (
          <div className="col-span-full">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-xs">
                No balance row exists yet. Saving here creates one — or run the
                Generate tab to provision the whole institution at once.
              </AlertDescription>
            </Alert>
          </div>
        )}
      </div>

      {noLever && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            You can view balances but not change them. Every adjustment here —
            used days, entitlement, and the month-wise totals — is restricted to
            <strong> super administrators</strong>. The month-wise breakdown below
            is read-only and stays available.
          </AlertDescription>
        </Alert>
      )}
      {(
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="used" disabled={!canSetUsed}>
              Used days
            </TabsTrigger>
            <TabsTrigger value="entitlement" disabled={!canSetEntitlement}>
              Entitlement
            </TabsTrigger>
            <TabsTrigger value="ledger">Month-wise</TabsTrigger>
          </TabsList>

          <TabsContent value="used" className="space-y-3 pt-3">
            <div>
              <Label htmlFor="adj-used">Days used this year</Label>
              <Input
                id="adj-used"
                type="number"
                min={0}
                step={0.5}
                value={used}
                onChange={(e) => setUsed(e.target.value)}
                className="mt-1"
                disabled={busy}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Replaces the consumed figure. Approved leave applications keep adding
                to it from here — they are counted incrementally, not recomputed.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="entitlement" className="space-y-3 pt-3">
            <div>
              <Label htmlFor="adj-entitled">Entitled days for this person</Label>
              <Input
                id="adj-entitled"
                type="number"
                min={0}
                step={0.5}
                value={entitled}
                onChange={(e) => setEntitled(e.target.value)}
                className="mt-1"
                disabled={busy}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Overrides the {leaveType.name} policy default of{' '}
                {leaveType.default_days} day{leaveType.default_days === 1 ? '' : 's'} for
                this person only. Everyone else keeps following policy.
              </p>
            </div>
            {cell.source === 'override' && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy || reason.trim() === ''}
                onClick={() => submit('clear_entitlement')}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Remove override — follow policy again
              </Button>
            )}
          </TabsContent>

          <TabsContent value="ledger" className="pt-3">
            {/* editable ONLY here. The Staff Balances row expander and the
                staff member's own leave page render the same table read-only —
                a staff member must never be able to record their own taken
                days, and the component itself re-checks
                hr.leave.policies.write before showing any control. */}
            <LeaveMonthlyLedger
              staffId={staff.employee_id}
              leaveTypeId={leaveType.id}
              hrAcademicYearId={hrAcademicYearId}
              leaveTypeName={leaveType.name}
              editable
            />
          </TabsContent>

          {/* The reason box belongs to the two write levers only. Rendering it
              under the read-only ledger would put a required field in front of
              somebody with nothing to submit. */}
          {tab !== 'ledger' && (
            <div className="pt-3">
              <Label htmlFor="adj-reason">Reason</Label>
              <Textarea
                id="adj-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Carried over from the legacy HR system for June 2026"
                className="mt-1"
                rows={2}
                disabled={busy}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Recorded with the before/after values and your name. Required.
              </p>
            </div>
          )}
        </Tabs>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onDone} disabled={busy}>
          {tab === 'ledger' ? 'Close' : 'Cancel'}
        </Button>
        {/* Hidden on the ledger tab: with only two write actions, a Save here
            would have fallen through to set_entitlement and written the
            entitlement box the user never opened. */}
        {!noLever && tab !== 'ledger' && (
          <Button
            onClick={() => submit(tab === 'used' ? 'set_used' : 'set_entitlement')}
            disabled={busy || reason.trim() === ''}
          >
            {busy ? 'Saving…' : 'Save adjustment'}
          </Button>
        )}
      </DialogFooter>
    </>
  );
}

function Figure({
  label, value, hint,
}: { label: string; value: number; hint?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium tabular-nums">{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
