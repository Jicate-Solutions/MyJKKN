'use client';

/**
 * Per-pattern days-per-leave-type figures.
 *
 * A blank input means "no figure here" — the person falls back to the
 * institution's policy default (shown as the placeholder). Saving does NOT
 * rewrite balances already generated; that only happens when a member is
 * (re)assigned, which is why the note below points at the Members tab.
 */

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getErrorMessage } from '@/lib/utils';
import {
  useSaveWorkPatternEntitlements,
  useWorkPatternEntitlements,
  useWorkPatternLeaveTypes,
} from '@/hooks/hr/use-work-patterns';

interface Props {
  institutionId: string;
  patternId: string;
}

export function EntitlementsTab({ institutionId, patternId }: Props) {
  const { data: leaveTypes = [], isLoading: typesLoading } = useWorkPatternLeaveTypes(institutionId);
  const { data: entitlements = [], isLoading: entLoading } = useWorkPatternEntitlements(patternId);
  const save = useSaveWorkPatternEntitlements();

  // Keyed by leave_type_id -> the input's raw text, so a value can be blank
  // (no figure) without coercing to 0.
  const [values, setValues] = useState<Record<string, string>>({});

  const entByType = useMemo(
    () => new Map(entitlements.map((e) => [e.leave_type_id, e.entitled_days])),
    [entitlements],
  );

  // Hydrate once the figures for THIS pattern have loaded — during render,
  // not in an effect (react-hooks/set-state-in-effect), and keyed on
  // patternId so an unrelated background refetch cannot wipe an in-progress
  // edit. Same idiom as WeeklyTimingGrid's hydratedFor.
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);
  if (!entLoading && !typesLoading && hydratedFor !== patternId) {
    setHydratedFor(patternId);
    const next: Record<string, string> = {};
    for (const t of leaveTypes) {
      const figure = entByType.get(t.id);
      next[t.id] = figure === undefined ? '' : String(figure);
    }
    setValues(next);
  }

  const setValue = (leaveTypeId: string, v: string) =>
    setValues((prev) => ({ ...prev, [leaveTypeId]: v }));

  const handleSave = async () => {
    const rows = Object.entries(values)
      .filter(([, v]) => v.trim() !== '')
      .map(([leave_type_id, v]) => ({ leave_type_id, entitled_days: Number(v) }));

    if (rows.some((r) => !Number.isFinite(r.entitled_days) || r.entitled_days < 0)) {
      toast.error('Entitlement days must be zero or a positive number.');
      return;
    }

    try {
      await save.mutateAsync({ patternId, rows });
      toast.success('Leave entitlements saved');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  if (typesLoading || entLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (leaveTypes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        This institution has no day-based leave types configured.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Code</TableHead>
            <TableHead>Leave type</TableHead>
            <TableHead className="w-40">Entitled days</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {leaveTypes.map((t) => (
            <TableRow key={t.id}>
              <TableCell className="font-medium">{t.leave_type_code}</TableCell>
              <TableCell>{t.leave_type_name}</TableCell>
              <TableCell>
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  className="w-28"
                  value={values[t.id] ?? ''}
                  placeholder={String(t.default_entitled_days)}
                  onChange={(e) => setValue(t.id, e.target.value)}
                  aria-label={`${t.leave_type_name} entitled days`}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Blank = follow the institution policy (currently {t.default_entitled_days})
                </p>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <p className="text-xs text-muted-foreground">
        Changing a figure here does not rewrite existing balances. Re-assign
        the members from a date to apply it; the change list shows what moved.
      </p>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={save.isPending}>
          {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save entitlements
        </Button>
      </div>
    </div>
  );
}
