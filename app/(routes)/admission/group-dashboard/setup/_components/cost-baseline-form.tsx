'use client';

/**
 * ARPS Phase 2B — Cost Baseline Form
 *
 * Same shape as RevenueTargetsForm but with fixed_operating_cost +
 * marketing_budget_allocated inputs. Bursar/Finance-owned in Phase 2E
 * (currently behind the same permission gate as Revenue Targets).
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
  useUpsertCostBaseline,
} from '@/hooks/admission/use-arps-cycle-setup';

interface Props {
  rows: ArpsCycleSetupRow[];
}

interface PendingEdit {
  fixed_operating_cost: string;
  marketing_budget_allocated: string;
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

export function CostBaselineForm({ rows }: Props) {
  const upsert = useUpsertCostBaseline();
  const [edits, setEdits] = useState<Record<string, PendingEdit>>({});
  const [recentlySaved, setRecentlySaved] = useState<Set<string>>(new Set());

  useEffect(() => {
    const seed: Record<string, PendingEdit> = {};
    rows.forEach((r) => {
      seed[rowKey(r.institution_id, r.cycle_year)] = {
        fixed_operating_cost: r.fixed_operating_cost?.toString() ?? '',
        marketing_budget_allocated: r.marketing_budget_allocated?.toString() ?? '',
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
    const fixed_operating_cost =
      e.fixed_operating_cost === '' ? null : Number(e.fixed_operating_cost);
    const marketing_budget_allocated =
      e.marketing_budget_allocated === ''
        ? null
        : Number(e.marketing_budget_allocated);

    if (
      fixed_operating_cost !== null &&
      (!Number.isFinite(fixed_operating_cost) || fixed_operating_cost < 0)
    ) {
      console.error('Invalid fixed_operating_cost — must be a non-negative number');
      return;
    }
    if (
      marketing_budget_allocated !== null &&
      (!Number.isFinite(marketing_budget_allocated) ||
        marketing_budget_allocated < 0)
    ) {
      console.error('Invalid marketing_budget — must be a non-negative number');
      return;
    }

    try {
      await upsert.mutateAsync({
        institution_id: institutionId,
        cycle_year: year,
        fixed_operating_cost,
        marketing_budget_allocated,
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
            <TableHead className="w-[200px]">Fixed operating cost (₹)</TableHead>
            <TableHead className="w-[200px]">Marketing budget (₹)</TableHead>
            <TableHead className="w-[180px]">Total baseline (₹)</TableHead>
            <TableHead className="w-[100px]">Save</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groupedRows.flatMap((group) =>
            group.years.map((row, yearIdx) => {
              const key = rowKey(row.institution_id, row.cycle_year);
              const e =
                edits[key] ?? {
                  fixed_operating_cost: '',
                  marketing_budget_allocated: '',
                };
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
                      step="10000"
                      placeholder="—"
                      value={e.fixed_operating_cost}
                      onChange={(ev) =>
                        handleChange(
                          row.institution_id,
                          row.cycle_year,
                          'fixed_operating_cost',
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
                      step="10000"
                      placeholder="—"
                      value={e.marketing_budget_allocated}
                      onChange={(ev) =>
                        handleChange(
                          row.institution_id,
                          row.cycle_year,
                          'marketing_budget_allocated',
                          ev.target.value,
                        )
                      }
                      className="h-8"
                    />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {(() => {
                      const fc =
                        e.fixed_operating_cost === ''
                          ? null
                          : Number(e.fixed_operating_cost);
                      const mb =
                        e.marketing_budget_allocated === ''
                          ? null
                          : Number(e.marketing_budget_allocated);
                      if (
                        fc !== null &&
                        mb !== null &&
                        Number.isFinite(fc) &&
                        Number.isFinite(mb)
                      ) {
                        return formatInr(fc + mb);
                      }
                      return formatInr(row.total_baseline_cost);
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
