'use client';

/**
 * HR records an eligibility with no request behind it.
 * Created: 2026-09-19.
 *
 * The migration path: somebody already three years into a PhD should not have
 * to scan their enrolment certificate and wait for an approval to keep a leave
 * type they have been using. HR states the fact and the row is approved on the
 * spot, marked granted_directly so the list can tell it from one that went
 * through an approver.
 */

import { useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import toast from 'react-hot-toast';

import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useStaffSearch } from '@/hooks/hr/use-leave-assignments';
import { useGrantLeaveEligibility } from '@/hooks/hr/use-leave-eligibility';
import { useHRLeaveTypes } from '@/hooks/hr/use-hr-leave-types';
import { getErrorMessage } from '@/lib/utils';

export function GrantEligibilityDialog({
  open,
  onOpenChange,
  hrOrgId,
  institutionId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  hrOrgId: string;
  institutionId: string;
}) {
  const [term, setTerm] = useState('');
  const [staffId, setStaffId] = useState<string | null>(null);
  const [staffLabel, setStaffLabel] = useState<string | null>(null);
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [entitledDays, setEntitledDays] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [reason, setReason] = useState('');

  const { data: staff, isFetching } = useStaffSearch(institutionId || undefined, term);
  const { data: types } = useHRLeaveTypes({
    hr_organization_id: hrOrgId || undefined,
    is_active: true,
  });
  const grant = useGrantLeaveEligibility();

  // Only gated types can be granted — granting eligibility for a type everyone
  // already sees would write a row that changes nothing.
  const gated = (types ?? []).filter(
    (t) => (t as { requires_eligibility?: boolean }).requires_eligibility,
  );

  const close = () => {
    setTerm(''); setStaffId(null); setStaffLabel(null); setLeaveTypeId('');
    setEntitledDays(''); setValidUntil(''); setReason('');
    onOpenChange(false);
  };

  const submit = async () => {
    if (!staffId || !leaveTypeId) return;
    try {
      await grant.mutateAsync({
        employeeId: staffId,
        leaveTypeId,
        hrOrgId,
        // '' would reach Postgres as a numeric/date and raise 22P02, so both
        // optional fields normalise to null rather than to an empty string.
        entitledDays: entitledDays === '' ? null : Number(entitledDays),
        validUntil: validUntil === '' ? null : validUntil,
        reason: reason.trim() || null,
      });
      toast.success('Eligibility granted');
      close();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) close(); }}>
      <DialogContent className="flex max-h-[90vh] max-w-lg flex-col">
        <DialogHeader>
          <DialogTitle>Grant eligibility</DialogTitle>
          <DialogDescription>
            Records an approved eligibility directly, with no request and no document — for people
            already doing the thing the leave type is for.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          <div>
            <Label className="text-xs">Leave type</Label>
            <Select value={leaveTypeId} onValueChange={setLeaveTypeId}>
              <SelectTrigger className="mt-1">
                <SelectValue
                  placeholder={
                    gated.length === 0
                      ? 'No leave type requires eligibility yet'
                      : 'Pick the gated leave type'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {gated.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.leave_type_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {gated.length === 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                Tick <strong>Requires eligibility</strong> on a leave type first.
              </p>
            )}
          </div>

          <div>
            <Label className="text-xs">Team member</Label>
            {staffId ? (
              <div className="mt-1 flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-sm">
                <span className="min-w-0 flex-1 truncate">{staffLabel}</span>
                <Button
                  variant="ghost" size="sm" className="h-6"
                  onClick={() => { setStaffId(null); setStaffLabel(null); }}
                >
                  Change
                </Button>
              </div>
            ) : (
              <>
                <div className="relative mt-1">
                  <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-8"
                    placeholder="Search by name or team member ID"
                    value={term}
                    onChange={(e) => setTerm(e.target.value)}
                  />
                </div>
                <div className="mt-1 max-h-40 overflow-y-auto rounded-md border">
                  {isFetching && (staff ?? []).length === 0 ? (
                    <p className="p-3 text-xs text-muted-foreground">Searching…</p>
                  ) : (staff ?? []).length === 0 ? (
                    <p className="p-3 text-xs text-muted-foreground">
                      {term ? 'Nobody matches that.' : 'Type a name to search.'}
                    </p>
                  ) : (
                    // searchStaff() already maps the row to a StaffPickerOption —
                    // { id, name, staff_code, department_name }. Reading the raw
                    // first_name / staff_id columns off it (as this did until
                    // 2026-09-21) found nothing and labelled every person
                    // "Unnamed".
                    (staff ?? []).map((row) => (
                      <button
                        key={row.id}
                        type="button"
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs hover:bg-muted"
                        onClick={() => {
                          setStaffId(row.id);
                          setStaffLabel(`${row.name}${row.staff_code ? ` · ${row.staff_code}` : ''}`);
                        }}
                      >
                        <span className="min-w-0 truncate">
                          {row.name}
                          {row.department_name && (
                            <span className="ml-1.5 text-muted-foreground">· {row.department_name}</span>
                          )}
                        </span>
                        {row.staff_code && (
                          <span className="shrink-0 font-mono text-muted-foreground">
                            {row.staff_code}
                          </span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Days for this person (optional)</Label>
              <Input
                type="number" step="0.5" min="0" className="mt-1"
                placeholder="Leave blank for the type default"
                value={entitledDays}
                onChange={(e) => setEntitledDays(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">Expires on (optional)</Label>
              <Input
                type="date" className="mt-1"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label className="text-xs">Why (optional)</Label>
            <Textarea
              className="mt-1" rows={2}
              placeholder="e.g. Already enrolled for a PhD since 2024 — grandfathered."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close}>Cancel</Button>
          <Button onClick={submit} disabled={!staffId || !leaveTypeId || grant.isPending}>
            {grant.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Grant
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
