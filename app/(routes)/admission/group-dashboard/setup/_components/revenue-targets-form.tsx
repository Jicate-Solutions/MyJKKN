'use client';

/**
 * ARPS Phase 2B — Revenue Targets Form
 *
 * Grid: institution rows × 3 cycle year groups. Each (institution, year)
 * cell has inputs for target_admits + target_yield_per_seat; derived
 * target_revenue auto-computes on the server (generated column).
 *
 * Save mechanism: explicit per-row Save button (avoids accidental save on
 * input blur during navigation). Toast on success/error via console for
 * now — Phase 2C can wire to the toast system if needed.
 */

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Save, Check } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  type ArpsCycleSetupRow,
  useUpsertRevenueTarget,
} from '@/hooks/admission/use-arps-cycle-setup';

interface Props {
  rows: ArpsCycleSetupRow[];
}

interface PendingEdit {
  target_admits: string;
  target_yield_per_seat: string;
}

function rowKey(institutionId: string, year: number) {
  return `${institutionId}::${year}`;
}

function toShortName(name: string) {
  return name.replace(/^JKKN College of /, '').replace(/^JKKN /, '');
}

function formatInr(value: number | null | undefined) {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
}

export function RevenueTargetsForm({ rows }: Props) {
  const upsert = useUpsertRevenueTarget();
  const [edits, setEdits] = useState<Record<string, PendingEdit>>({});
  const [recentlySaved, setRecentlySaved] = useState<Set<string>>(new Set());

  // Seed edits from server values on first render or when rows refresh
  useEffect(() => {
    const seed: Record<string, PendingEdit> = {};
    rows.forEach((r) => {
      seed[rowKey(r.institution_id, r.cycle_year)] = {
        target_admits: r.target_admits?.toString() ?? '',
        target_yield_per_seat: r.target_yield_per_seat?.toString() ?? '',
      };
    });
    setEdits(seed);
  }, [rows]);

  const handleChange = (
    institutionId: string,
    year: number,
    field: keyof PendingEdit,
    value: string,
  ) => {
    const key = rowKey(institutionId, year);
    setEdits((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }));
  };

  const handleSave = async (institutionId: string, year: number) => {
    const key = rowKey(institutionId, year);
    const e = edits[key];
    if (!e) return;
    const target_admits = e.target_admits === '' ? null : Number(e.target_admits);
    const target_yield_per_seat =
      e.target_yield_per_seat === '' ? null : Number(e.target_yield_per_seat);

    if (target_admits !== null && (!Number.isFinite(target_admits) || target_admits < 0)) {
      console.error('Invalid target_admits — must be a non-negative number');
      return;
    }
    if (
      target_yield_per_seat !== null &&
      (!Number.isFinite(target_yield_per_seat) || target_yield_per_seat < 0)
    ) {
      console.error('Invalid target_yield_per_seat — must be a non-negative number');
      return;
    }

    try {
      await upsert.mutateAsync({
        institution_id: institutionId,
        cycle_year: year,
        target_admits,
        target_yield_per_seat,
      });
      setRecentlySaved((prev) => new Set(prev).add(key));
      setTimeout(() => {
        setRecentlySaved((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }, 2500);
    } catch (err) {
      console.error('Save failed:', err);
    }
  };

  const groupedRows = useMemo(() => {
    const byInstitution = new Map<
      string,
      { name: string; years: ArpsCycleSetupRow[] }
    >();
    rows.forEach((r) => {
      const existing = byInstitution.get(r.institution_id);
      if (existing) {
        existing.years.push(r);
      } else {
        byInstitution.set(r.institution_id, {
          name: r.institution_name,
          years: [r],
        });
      }
    });
    return Array.from(byInstitution.entries()).map(([id, v]) => ({
      institution_id: id,
      institution_name: v.name,
      years: v.years.sort((a, b) => a.cycle_year - b.cycle_year),
    }));
  }, [rows]);

  return (
    <div className="space-y-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[200px]">Institution</TableHead>
            <TableHead className="w-[80px]">Year</TableHead>
            <TableHead className="w-[140px]">Target admits</TableHead>
            <TableHead className="w-[180px]">Target yield / seat (₹)</TableHead>
            <TableHead className="w-[180px]">Derived target (₹)</TableHead>
            <TableHead className="w-[100px]">Save</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groupedRows.flatMap((group) =>
            group.years.map((row, yearIdx) => {
              const key = rowKey(row.institution_id, row.cycle_year);
              const e = edits[key] ?? { target_admits: '', target_yield_per_seat: '' };
              const justSaved = recentlySaved.has(key);
              const isSaving =
                upsert.isPending &&
                upsert.variables?.institution_id === row.institution_id &&
                upsert.variables?.cycle_year === row.cycle_year;
              return (
                <TableRow key={key}>
                  {yearIdx === 0 ? (
                    <TableCell
                      rowSpan={group.years.length}
                      className="font-medium align-top border-r"
                    >
                      {toShortName(group.institution_name)}
                    </TableCell>
                  ) : null}
                  <TableCell className="font-mono text-sm">{row.cycle_year}</TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min="0"
                      placeholder="—"
                      value={e.target_admits}
                      onChange={(ev) =>
                        handleChange(
                          row.institution_id,
                          row.cycle_year,
                          'target_admits',
                          ev.target.value,
                        )
                      }
                      className="h-8"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min="0"
                      step="100"
                      placeholder="—"
                      value={e.target_yield_per_seat}
                      onChange={(ev) =>
                        handleChange(
                          row.institution_id,
                          row.cycle_year,
                          'target_yield_per_seat',
                          ev.target.value,
                        )
                      }
                      className="h-8"
                    />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {(() => {
                      const ta = e.target_admits === '' ? null : Number(e.target_admits);
                      const ty =
                        e.target_yield_per_seat === ''
                          ? null
                          : Number(e.target_yield_per_seat);
                      if (ta !== null && ty !== null && Number.isFinite(ta) && Number.isFinite(ty)) {
                        return formatInr(ta * ty);
                      }
                      return formatInr(row.derived_target_revenue);
                    })()}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant={justSaved ? 'default' : 'outline'}
                      onClick={() => handleSave(row.institution_id, row.cycle_year)}
                      disabled={isSaving}
                      className="h-8"
                    >
                      {isSaving ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : justSaved ? (
                        <>
                          <Check className="h-3.5 w-3.5" /> Saved
                        </>
                      ) : (
                        <>
                          <Save className="h-3.5 w-3.5" /> Save
                        </>
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            }),
          )}
        </TableBody>
      </Table>
    </div>
  );
}
