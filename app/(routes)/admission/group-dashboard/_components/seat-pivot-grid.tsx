'use client';

// app/(routes)/admission/group-dashboard/_components/seat-pivot-grid.tsx
//
// Wide horizontal pivot grid for the Seat Analytics → Daily Pivot sub-tab.
// Mirrors the user's reference Google Sheet "ADMISSION REPORT YYYY-YY":
//
//   Left (sticky):  S NO | COURSE NAME | INTAKE | TOTAL | BALANCE | %
//   Right (scroll): one column per date that has ≥1 admission across the cohort
//
// Rows are grouped by `group_label` (e.g. "UG ENGINEERING - I YEAR"),
// with a group-header row, program rows, and a per-group subtotal row.
// A grand-total row caps the table.
//
// Visual pattern follows app/(routes)/academic/timetables/[id]/_components/timetable-grid.tsx
// (sticky-left columns + horizontal-scroll right columns).

import { useMemo } from 'react';
import type { SeatPivotRow } from '@/types/admission-workflow-config';

interface SeatPivotGridProps {
  rows: SeatPivotRow[];
  /** When true, show every date in the cohort even if some columns are empty. Default false (sparse). */
  showAllDates?: boolean;
}

// Format an ISO date string (YYYY-MM-DD) as DD/MM/YY for the column header.
function formatDateHeader(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y.slice(2)}`;
}

// Tints for fill % — green (≥90), amber (70-89), gray (50-69), red (<50).
function fillBadgeClass(pct: number): string {
  if (pct >= 90) return 'bg-emerald-100 text-emerald-800';
  if (pct >= 70) return 'bg-amber-100 text-amber-800';
  if (pct >= 50) return 'bg-slate-100 text-slate-700';
  return 'bg-rose-100 text-rose-800';
}

interface GroupBlock {
  group_label: string;
  group_sort_key: string;
  rows: SeatPivotRow[];
}

export function SeatPivotGrid({ rows, showAllDates = false }: SeatPivotGridProps) {
  // 1. Compute the union of dates across all rows (sparse mode).
  const dateColumns = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      for (const k of Object.keys(r.daily_counts)) set.add(k);
    }
    return Array.from(set).sort();
  }, [rows]);

  // 2. Group rows by group_label, preserving stable order via group_sort_key.
  const groups = useMemo<GroupBlock[]>(() => {
    const map = new Map<string, GroupBlock>();
    for (const r of rows) {
      const block = map.get(r.group_label);
      if (block) {
        block.rows.push(r);
      } else {
        map.set(r.group_label, {
          group_label: r.group_label,
          group_sort_key: r.group_sort_key,
          rows: [r],
        });
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      a.group_sort_key.localeCompare(b.group_sort_key)
    );
  }, [rows]);

  // 3. Per-group subtotal + grand totals.
  const groupTotals = useMemo(() => {
    return groups.map((g) => {
      const intake = g.rows.reduce((s, r) => s + r.intake, 0);
      const filled = g.rows.reduce((s, r) => s + r.filled, 0);
      const dailyTotals: Record<string, number> = {};
      for (const r of g.rows) {
        for (const [d, c] of Object.entries(r.daily_counts)) {
          dailyTotals[d] = (dailyTotals[d] ?? 0) + c;
        }
      }
      return {
        intake,
        filled,
        balance: Math.max(intake - filled, 0),
        pct: intake === 0 ? 0 : Math.round((filled / intake) * 10000) / 100,
        dailyTotals,
      };
    });
  }, [groups]);

  const grandTotal = useMemo(() => {
    const intake = rows.reduce((s, r) => s + r.intake, 0);
    const filled = rows.reduce((s, r) => s + r.filled, 0);
    const dailyTotals: Record<string, number> = {};
    for (const r of rows) {
      for (const [d, c] of Object.entries(r.daily_counts)) {
        dailyTotals[d] = (dailyTotals[d] ?? 0) + c;
      }
    }
    return {
      intake,
      filled,
      balance: Math.max(intake - filled, 0),
      pct: intake === 0 ? 0 : Math.round((filled / intake) * 10000) / 100,
      dailyTotals,
    };
  }, [rows]);

  if (rows.length === 0) {
    return (
      <div className="border rounded-md p-8 text-center text-sm text-muted-foreground">
        No admission data for the selected admission year.
      </div>
    );
  }

  // Shared sticky-left column widths so headers/cells/totals align.
  const stickyCellBg = 'bg-background';
  const stickyHeadBg = 'bg-muted';
  const TOTAL_BG = 'bg-amber-50';
  const GROUP_BG = 'bg-blue-50';

  let serialCounter = 0;

  return (
    <div className="border rounded-md overflow-auto" style={{ maxHeight: 640 }}>
      <table className="text-xs border-separate border-spacing-0 w-max">
        {/* Header */}
        <thead className="sticky top-0 z-30">
          <tr className={stickyHeadBg}>
            <th className={`sticky left-0 z-40 ${stickyHeadBg} border-b border-r px-2 py-2 text-center w-12`}>S NO</th>
            <th className={`sticky left-12 z-40 ${stickyHeadBg} border-b border-r px-2 py-2 text-left min-w-[180px]`}>COURSE NAME</th>
            <th className="border-b border-r px-2 py-2 text-right w-16">INTAKE</th>
            <th className="border-b border-r px-2 py-2 text-right w-16">TOTAL</th>
            <th className="border-b border-r px-2 py-2 text-right w-16">BALANCE</th>
            <th className="border-b border-r px-2 py-2 text-right w-16">%</th>
            {dateColumns.map((d) => (
              <th
                key={d}
                className="border-b border-r px-1 py-2 text-center w-14 font-normal whitespace-nowrap"
                title={d}
              >
                {formatDateHeader(d)}
              </th>
            ))}
          </tr>
        </thead>

        {/* Body */}
        <tbody>
          {groups.map((g, gi) => {
            const totals = groupTotals[gi];
            return (
              <>
                {/* Group header row */}
                <tr key={`grp-${g.group_sort_key}`} className={GROUP_BG}>
                  <td
                    className={`sticky left-0 z-20 ${GROUP_BG} border-b px-2 py-1 font-semibold`}
                    colSpan={6 + dateColumns.length}
                  >
                    {g.group_label}
                  </td>
                </tr>

                {/* Program rows */}
                {g.rows.map((r) => {
                  serialCounter += 1;
                  return (
                    <tr key={r.program_id} className="hover:bg-muted/40">
                      <td className={`sticky left-0 z-10 ${stickyCellBg} border-b border-r px-2 py-1 text-center text-muted-foreground`}>
                        {serialCounter}
                      </td>
                      <td className={`sticky left-12 z-10 ${stickyCellBg} border-b border-r px-2 py-1 font-medium`}>
                        {r.course_short}
                      </td>
                      <td className="border-b border-r px-2 py-1 text-right">{r.intake}</td>
                      <td className="border-b border-r px-2 py-1 text-right">{r.filled}</td>
                      <td className="border-b border-r px-2 py-1 text-right">{r.balance}</td>
                      <td className="border-b border-r px-2 py-1 text-right">
                        <span className={`inline-block px-1.5 py-0.5 rounded ${fillBadgeClass(r.fill_percentage)}`}>
                          {r.fill_percentage}%
                        </span>
                      </td>
                      {dateColumns.map((d) => {
                        const v = r.daily_counts[d];
                        return (
                          <td key={d} className="border-b border-r px-1 py-1 text-center">
                            {v && v > 0 ? v : ''}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}

                {/* Group subtotal */}
                <tr className={TOTAL_BG}>
                  <td className={`sticky left-0 z-20 ${TOTAL_BG} border-b border-r px-2 py-1`} />
                  <td className={`sticky left-12 z-20 ${TOTAL_BG} border-b border-r px-2 py-1 font-semibold`}>TOTAL</td>
                  <td className="border-b border-r px-2 py-1 text-right font-semibold">{totals.intake}</td>
                  <td className="border-b border-r px-2 py-1 text-right font-semibold">{totals.filled}</td>
                  <td className="border-b border-r px-2 py-1 text-right font-semibold">{totals.balance}</td>
                  <td className="border-b border-r px-2 py-1 text-right font-semibold">{totals.pct}%</td>
                  {dateColumns.map((d) => {
                    const v = totals.dailyTotals[d];
                    return (
                      <td key={d} className="border-b border-r px-1 py-1 text-center font-semibold">
                        {v && v > 0 ? v : ''}
                      </td>
                    );
                  })}
                </tr>
              </>
            );
          })}

          {/* Grand total */}
          <tr className="bg-amber-100 font-bold">
            <td className="sticky left-0 z-20 bg-amber-100 border-r px-2 py-1" />
            <td className="sticky left-12 z-20 bg-amber-100 border-r px-2 py-1">GRAND TOTAL</td>
            <td className="border-r px-2 py-1 text-right">{grandTotal.intake}</td>
            <td className="border-r px-2 py-1 text-right">{grandTotal.filled}</td>
            <td className="border-r px-2 py-1 text-right">{grandTotal.balance}</td>
            <td className="border-r px-2 py-1 text-right">{grandTotal.pct}%</td>
            {dateColumns.map((d) => {
              const v = grandTotal.dailyTotals[d];
              return (
                <td key={d} className="border-r px-1 py-1 text-center">
                  {v && v > 0 ? v : ''}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
