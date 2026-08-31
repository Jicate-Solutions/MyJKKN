'use client';

import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { Eye } from 'lucide-react';
import type { AllocationAuditRow } from '@/types/campus-living-allocation-audit';
import {
  VerdictBadge,
  BandBadge,
  RuleBadge,
  BillStateBadge,
  YearSourceBadge,
  VERDICT_META,
  inr,
} from './audit-badges';

const dash = <span className="text-muted-foreground">—</span>;

/**
 * Reshapes one audit row into the object shape the Allocations module's
 * `allocationMatchesCascade` / `AllocationCascadeFilters` already read.
 *
 * The point is that the audit page reuses that predicate VERBATIM rather than
 * reimplementing eight filters — so the two screens cannot drift, which is what
 * "the same advanced filters" has to mean to stay true a year from now.
 */
export function toCascadeRow(r: AllocationAuditRow) {
  return {
    room_id: r.room_id,
    hostel_blocks: { name: r.block_name, hostel_type: r.hostel_type },
    hostel_rooms: { room_number: r.room_number, floor: r.floor },
    learner: {
      full_name: r.full_name,
      email: r.email,
      academic: {
        gender: r.gender,
        institution_id: r.institution_id,
        institution: { name: r.institution_name },
        program_id: r.program_id,
        program: { program_name: r.program_name },
        semester_id: r.semester_id,
        semester: { semester_name: r.semester_name },
        room_category: r.occupied_room_category_name
          ? { name: r.occupied_room_category_name }
          : null,
        mess_category: r.current_mess_category_name
          ? { name: r.current_mess_category_name }
          : null,
      },
    },
  };
}

const bandWindow = (r: AllocationAuditRow): string => {
  if (r.matched_fee_min === null && r.matched_fee_max === null) return '—';
  const lo = r.matched_fee_min === null ? '0' : inr(r.matched_fee_min);
  const hi = r.matched_fee_max === null ? '∞' : inr(r.matched_fee_max);
  return `${lo} – ${hi}`;
};

export function getAuditColumns(
  onView: (row: AllocationAuditRow) => void
): ColumnDef<AllocationAuditRow>[] {
  return [
    {
      id: 'learner',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Learner" />,
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div className="flex flex-col">
            <span className="font-medium">{r.full_name || '—'}</span>
            <span className="text-xs text-muted-foreground">
              {[r.roll_number, r.email].filter(Boolean).join(' · ') || '—'}
            </span>
          </div>
        );
      },
      size: 230,
    },
    {
      id: 'cohort',
      header: 'Institution / Program',
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div className="flex flex-col">
            <span className="text-sm">{r.institution_name ?? '—'}</span>
            <span className="text-xs text-muted-foreground">
              {[r.program_name, r.semester_name].filter(Boolean).join(' · ') || '—'}
            </span>
          </div>
        );
      },
      enableSorting: false,
      size: 210,
    },
    {
      // Admitted year and band year in ONE cell. They were two columns; the
      // audit's core question is whether they AGREE, and a side-by-side pair in
      // one cell answers that at a glance where two columns made the reader
      // saccade across the table to compare them.
      id: 'year_basis',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Admitted → Band year" />
      ),
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div className="flex flex-col gap-1">
            <span className="text-sm">
              <span className="font-medium">{r.admission_year ?? '—'}</span>
              <span className="mx-1 text-muted-foreground">→</span>
              <span className="font-medium">{r.band_academic_year_name ?? '—'}</span>
            </span>
            <YearSourceBadge source={r.band_year_source} />
          </div>
        );
      },
      size: 195,
    },
    {
      id: 'band_bill',
      header: 'That year’s bill',
      cell: ({ row }) => {
        const r = row.original;
        if (r.band_fee === null) return dash;
        return (
          <div className="flex flex-col">
            <span className="font-medium tabular-nums">{inr(r.band_fee)}</span>
            <span className="text-xs text-muted-foreground">
              {r.band_year_bill_count} bill{r.band_year_bill_count === 1 ? '' : 's'} ·{' '}
              {inr(r.band_year_bill_paid)} paid
            </span>
          </div>
        );
      },
      enableSorting: false,
      size: 150,
    },
    {
      // The band window, what it entitles, and the verdict on it — one cell.
      // The verdict badge was its own column, which separated the judgement
      // from the evidence it is a judgement about.
      id: 'fee_band',
      header: 'Fee band → entitled',
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div className="flex flex-col gap-1">
            <span className="text-xs tabular-nums text-muted-foreground">{bandWindow(r)}</span>
            <span className="text-sm font-medium">
              {r.entitled_room_category_name ?? '—'}
            </span>
            <span className="text-xs text-muted-foreground">
              mess: {r.entitled_mess_category_name ?? '—'}
            </span>
            <BandBadge verdict={r.band_verdict} />
          </div>
        );
      },
      enableSorting: false,
      size: 215,
    },
    {
      id: 'placement',
      header: 'Room',
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div className="flex flex-col">
            <span className="text-sm">{r.block_name ?? '—'}</span>
            <span className="text-xs text-muted-foreground">
              {/* `??` not `||` — floor 0 is a real ground floor. */}
              Room {r.room_number ?? '—'} · Bed {r.bed_number ?? '—'} ·{' '}
              {r.floor === 0 ? 'Ground' : `Floor ${r.floor ?? '—'}`}
            </span>
          </div>
        );
      },
      enableSorting: false,
      size: 175,
    },
    {
      // First placement -> today. This is the "who was upgraded" story, read
      // off the append-only allocation history rather than a status column.
      id: 'category_path',
      header: 'Category: first → now',
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div className="flex flex-col">
            <span className="text-sm">
              {r.is_upgraded ? (
                <>
                  <span className="text-muted-foreground">
                    {r.first_room_category_name ?? '—'}
                  </span>
                  <span className="mx-1 text-muted-foreground">→</span>
                  <span className="font-medium">{r.occupied_room_category_name ?? '—'}</span>
                </>
              ) : (
                <span className="font-medium">{r.occupied_room_category_name ?? '—'}</span>
              )}
            </span>
            <span className="text-xs text-muted-foreground">
              mess: {r.current_mess_category_name ?? '—'}
              {!r.mess_in_band && ' · outside band'}
            </span>
          </div>
        );
      },
      enableSorting: false,
      size: 200,
    },
    {
      id: 'upgrade',
      header: 'Upgrade bill',
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div className="flex flex-col gap-1">
            <BillStateBadge state={r.upgrade_bill_state} />
            {r.upgrade_bill_count > 0 && (
              <span className="text-xs tabular-nums text-muted-foreground">
                {inr(r.upgrade_bill_total)} · {inr(r.upgrade_bill_balance)} due
              </span>
            )}
          </div>
        );
      },
      enableSorting: false,
      size: 145,
    },
    {
      id: 'room_rule',
      header: 'Room rule',
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div className="flex flex-col gap-1">
            <RuleBadge verdict={r.room_rule_verdict} />
            <span
              className="max-w-[150px] truncate text-xs text-muted-foreground"
              title={r.matched_rule_name ?? r.pinned_blocks ?? ''}
            >
              {r.room_rule_verdict === 'violation'
                ? r.pinned_blocks
                  ? `pinned to ${r.pinned_blocks}`
                  : 'no rule permits this room'
                : (r.matched_rule_name ?? '')}
            </span>
          </div>
        );
      },
      enableSorting: false,
      size: 160,
    },
    {
      id: 'verdict',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Verdict" />,
      cell: ({ row }) => <VerdictBadge verdict={row.original.verdict} />,
      size: 175,
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1 text-xs"
            onClick={() => onView(row.original)}
          >
            <Eye className="h-4 w-4" /> Why
          </Button>
          <Button variant="ghost" size="sm" className="h-8 text-xs" asChild>
            <Link href={`/campus-living/allocations/${row.original.allocation_id}`}>Open</Link>
          </Button>
        </div>
      ),
      enableSorting: false,
      enableHiding: false,
      size: 120,
    },
  ];
}

// ── Mobile card (< md) ──────────────────────────────────────────────────────
// Below md the DataTable swaps the table for this stack. A 1980px-wide
// forensic table on a phone is a horizontal-scroll maze, and this audit's
// verdict is the one thing that must be readable without scrolling at all —
// so the card leads with it and demotes the evidence to labelled pairs.

function CardField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="truncate text-xs">{value ?? '—'}</dd>
    </div>
  );
}

export function AuditMobileCard({
  row: r,
  onView,
}: {
  row: AllocationAuditRow;
  onView: (row: AllocationAuditRow) => void;
}) {
  return (
    <div className="space-y-2.5 rounded-lg border p-3">
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={() => onView(r)}
          className="min-w-0 text-left"
          title={`Why was ${r.full_name ?? 'this learner'} placed here?`}
        >
          <span className="block truncate text-sm font-medium underline-offset-4 hover:underline">
            {r.full_name || '—'}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {[r.roll_number, r.program_name].filter(Boolean).join(' · ') || '—'}
          </span>
        </button>
        <div className="shrink-0">
          <VerdictBadge verdict={r.verdict} />
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
        <CardField
          label="Admitted → Band year"
          value={
            <span className="flex items-center gap-1.5">
              <span>
                {r.admission_year ?? '—'} → {r.band_academic_year_name ?? '—'}
              </span>
              <YearSourceBadge source={r.band_year_source} />
            </span>
          }
        />
        <CardField
          label="That year’s bill"
          value={
            r.band_fee === null
              ? '—'
              : `${inr(r.band_fee)} · ${r.band_year_bill_count} bill${
                  r.band_year_bill_count === 1 ? '' : 's'
                }`
          }
        />
        <CardField
          label="Entitled"
          value={
            <span className="flex items-center gap-1.5">
              <span className="truncate">{r.entitled_room_category_name ?? '—'}</span>
              <BandBadge verdict={r.band_verdict} />
            </span>
          }
        />
        <CardField
          label="Occupied"
          value={
            r.is_upgraded
              ? `${r.first_room_category_name ?? '—'} → ${r.occupied_room_category_name ?? '—'}`
              : (r.occupied_room_category_name ?? '—')
          }
        />
        <CardField
          label="Room"
          value={`${r.block_name ?? '—'} · ${r.room_number ?? '—'} · Bed ${r.bed_number ?? '—'}`}
        />
        <CardField
          label="Upgrade bill"
          value={
            <span className="flex items-center gap-1.5">
              <BillStateBadge state={r.upgrade_bill_state} />
              {r.upgrade_bill_count > 0 && (
                <span className="tabular-nums">{inr(r.upgrade_bill_total)}</span>
              )}
            </span>
          }
        />
      </dl>

      <div className="flex items-center justify-between border-t pt-2">
        <RuleBadge verdict={r.room_rule_verdict} />
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => onView(r)}>
            <Eye className="h-3.5 w-3.5" /> Why
          </Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs" asChild>
            <Link href={`/campus-living/allocations/${r.allocation_id}`}>Open</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Export schema ───────────────────────────────────────────────────────────
// Explicit headers + mapping + widths, and export keys deliberately DISTINCT
// from the column ids above. Two live traps in the shared exporter, neither of
// which throws: `columnMapping: {}` is TRUTHY so the autogen fallback never
// fires and every cell resolves to row[undefined] (one column named
// "undefined"); and data-export.tsx drops any export header that matches a
// HIDDEN column id, while non-colliding keys are always emitted.
const AUDIT_EXPORT_COLUMNS: ReadonlyArray<{ key: string; label: string; width: number }> = [
  { key: 'x_learner', label: 'Learner', width: 26 },
  { key: 'x_roll', label: 'Roll No', width: 14 },
  { key: 'x_email', label: 'Email', width: 28 },
  { key: 'x_gender', label: 'Gender', width: 10 },
  { key: 'x_institution', label: 'Institution', width: 28 },
  { key: 'x_degree', label: 'Degree', width: 18 },
  { key: 'x_department', label: 'Department', width: 20 },
  { key: 'x_program', label: 'Program', width: 24 },
  { key: 'x_semester', label: 'Semester', width: 14 },
  { key: 'x_quota', label: 'Quota', width: 16 },
  { key: 'x_admission_year', label: 'Admitted Year', width: 13 },
  { key: 'x_admission_ay', label: 'Admission Academic Year', width: 20 },
  { key: 'x_band_ay', label: 'Band Read From (Academic Year)', width: 24 },
  { key: 'x_band_year_source', label: 'Same As Admission Year?', width: 20 },
  { key: 'x_band_fee', label: 'Academic Fee (That Year)', width: 18 },
  { key: 'x_band_bills', label: 'Bills In That Year', width: 14 },
  { key: 'x_band_paid', label: 'Paid (That Year)', width: 16 },
  { key: 'x_band_balance', label: 'Balance (That Year)', width: 16 },
  { key: 'x_fee_min', label: 'Band Fee Min', width: 14 },
  { key: 'x_fee_max', label: 'Band Fee Max', width: 14 },
  { key: 'x_entitled_room', label: 'Entitled Room Category', width: 20 },
  { key: 'x_entitled_mess', label: 'Entitled Mess Category', width: 20 },
  { key: 'x_band_verdict', label: 'Fee Band Verdict', width: 14 },
  { key: 'x_block', label: 'Block', width: 18 },
  { key: 'x_room', label: 'Room', width: 10 },
  { key: 'x_floor', label: 'Floor', width: 8 },
  { key: 'x_bed', label: 'Bed', width: 8 },
  { key: 'x_first_category', label: 'First Allocated Category', width: 20 },
  { key: 'x_current_category', label: 'Current Room Category', width: 20 },
  { key: 'x_current_mess', label: 'Current Mess Category', width: 20 },
  { key: 'x_mess_in_band', label: 'Mess In Band?', width: 13 },
  { key: 'x_is_upgraded', label: 'Upgraded?', width: 11 },
  { key: 'x_upgrade_state', label: 'Upgrade Bill State', width: 16 },
  { key: 'x_upgrade_count', label: 'Upgrade Bills', width: 13 },
  { key: 'x_upgrade_total', label: 'Upgrade Billed', width: 15 },
  { key: 'x_upgrade_paid', label: 'Upgrade Paid', width: 14 },
  { key: 'x_upgrade_balance', label: 'Upgrade Balance', width: 15 },
  { key: 'x_upgrade_desc', label: 'Upgrade Bill Details', width: 46 },
  { key: 'x_rule_verdict', label: 'Room Rule Verdict', width: 15 },
  { key: 'x_rule_name', label: 'Matched Rule', width: 24 },
  { key: 'x_pinned', label: 'Cohort Pinned To Blocks', width: 26 },
  { key: 'x_verdict', label: 'Overall Verdict', width: 24 },
  { key: 'x_verdict_reason', label: 'Verdict Meaning', width: 60 },
];

export const AUDIT_EXPORT_HEADERS = AUDIT_EXPORT_COLUMNS.map((c) => c.key);
export const AUDIT_EXPORT_MAPPING: Record<string, string> = Object.fromEntries(
  AUDIT_EXPORT_COLUMNS.map((c) => [c.key, c.label])
);
export const AUDIT_EXPORT_WIDTHS = AUDIT_EXPORT_COLUMNS.map((c) => ({ wch: c.width }));

const yn = (b: boolean) => (b ? 'Yes' : 'No');

export const auditToExportRow = (r: AllocationAuditRow) => ({
  x_learner: r.full_name ?? null,
  x_roll: r.roll_number ?? null,
  x_email: r.email ?? null,
  x_gender: r.gender ?? null,
  x_institution: r.institution_name ?? null,
  x_degree: r.degree_name ?? null,
  x_department: r.department_name ?? null,
  x_program: r.program_name ?? null,
  x_semester: r.semester_name ?? null,
  x_quota: r.quota_name ?? null,
  x_admission_year: r.admission_year ?? null,
  x_admission_ay: r.admission_academic_year_name ?? null,
  x_band_ay: r.band_academic_year_name ?? null,
  x_band_year_source: r.band_year_source,
  x_band_fee: r.band_fee ?? null,
  x_band_bills: r.band_year_bill_count,
  x_band_paid: r.band_year_bill_paid,
  x_band_balance: r.band_year_bill_balance,
  x_fee_min: r.matched_fee_min ?? null,
  x_fee_max: r.matched_fee_max ?? null,
  x_entitled_room: r.entitled_room_category_name ?? null,
  x_entitled_mess: r.entitled_mess_category_name ?? null,
  x_band_verdict: r.band_verdict,
  x_block: r.block_name ?? null,
  x_room: r.room_number ?? null,
  x_floor: r.floor ?? null,
  x_bed: r.bed_number ?? null,
  x_first_category: r.first_room_category_name ?? null,
  x_current_category: r.occupied_room_category_name ?? null,
  x_current_mess: r.current_mess_category_name ?? null,
  x_mess_in_band: yn(r.mess_in_band),
  x_is_upgraded: yn(r.is_upgraded),
  x_upgrade_state: r.upgrade_bill_state,
  x_upgrade_count: r.upgrade_bill_count,
  x_upgrade_total: r.upgrade_bill_total,
  x_upgrade_paid: r.upgrade_bill_paid,
  x_upgrade_balance: r.upgrade_bill_balance,
  x_upgrade_desc: r.upgrade_bill_descriptions ?? null,
  x_rule_verdict: r.room_rule_verdict,
  x_rule_name: r.matched_rule_name ?? null,
  x_pinned: r.pinned_blocks ?? null,
  x_verdict: VERDICT_META[r.verdict]?.label ?? r.verdict,
  x_verdict_reason: VERDICT_META[r.verdict]?.hint ?? null,
});
