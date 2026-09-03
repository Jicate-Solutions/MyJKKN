'use client';

// Correct one staff member's balance for one leave type.
//
// Two levers, deliberately kept apart because they mean different things and
// are gated by different keys:
//
//   * "Used days" writes hr_leave_balances.used — a factual correction ("she
//     actually took 1.5, not 2"). Needs hr.leave.policies.write (2 roles).
//   * "Entitlement" writes hr_leave_entitlement_overrides — a policy decision
//     for this one person ("mid-year joiner, pro-rate to 7"). Needs
//     hr.leave.balance.manage (7 roles).
//
// The RPC enforces both separately, mirroring each table's own RLS, so this
// screen widens nobody's access. It hides the lever the caller cannot use
// rather than letting them fill in a form the server will refuse.
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
import { usePermissions } from '@/hooks/use-permissions';
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
      <DialogContent className="sm:max-w-lg">
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

  const { can, isLoading: permsLoading } = usePermissions([
    'hr.leave.policies.write',
    'hr.leave.balance.manage',
  ]);
  const canSetUsed = can('hr.leave.policies.write');
  const canSetEntitlement = can('hr.leave.balance.manage');

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
  const [tab, setTab] = useState<'used' | 'entitlement'>(
    canSetUsed ? 'used' : 'entitlement'
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
      <div className="grid grid-cols-4 gap-3 rounded-md border bg-muted/30 p-3 text-sm">
        <Figure label="Entitled" value={cell.entitled} />
        <Figure label="Carried" value={cell.carried} />
        <Figure label="Used" value={cell.used} />
        <Figure label="Available" value={cell.available} />
        <div className="col-span-4 flex flex-wrap items-center gap-2 border-t pt-2">
          <Badge variant="outline" className={`font-normal ${sourceMeta.tone}`}>
            {sourceMeta.label}
          </Badge>
          <span className="text-xs text-muted-foreground">{sourceMeta.hint}</span>
        </div>
        {!cell.has_row && (
          <div className="col-span-4">
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

      {noLever ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            You can view balances but not change them. Correcting used days needs
            <strong> hr.leave.policies.write</strong>; changing an entitlement needs
            <strong> hr.leave.balance.manage</strong>.
          </AlertDescription>
        </Alert>
      ) : (
        <Tabs value={tab} onValueChange={(v) => setTab(v as 'used' | 'entitlement')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="used" disabled={!canSetUsed}>
              Used days
            </TabsTrigger>
            <TabsTrigger value="entitlement" disabled={!canSetEntitlement}>
              Entitlement
            </TabsTrigger>
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
        </Tabs>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={onDone} disabled={busy}>
          Cancel
        </Button>
        {!noLever && (
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

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium tabular-nums">{value}</p>
    </div>
  );
}
