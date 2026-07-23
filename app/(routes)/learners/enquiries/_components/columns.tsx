'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { format } from 'date-fns';
import type { LearnerProfile } from '@/types/learner-profile';
import { LifecycleStatusBadge } from '@/components/learners/lifecycle-status-badge';
import { DataTableRowActions } from './row-actions';
import type { FeeBackfillAnnotations } from '../_data/get-enquiries';

export type EnquiryRow = LearnerProfile & FeeBackfillAnnotations;

export const enquiryColumns: ColumnDef<LearnerProfile>[] = [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(value: boolean) =>
          table.toggleAllPageRowsSelected(!!value)
        }
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value: boolean) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
    enableResizing: false,
    size: 70,
    minSize: 70,
    maxSize: 70,
  },
  {
    accessorKey: 'application_id',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Application ID" />
    ),
    cell: ({ row }) => {
      return (
        <div className="font-mono text-sm">
          {row.original.application_id || 'N/A'}
        </div>
      );
    },
    size: 120,
    minSize: 120,
    maxSize: 150,
  },
  {
    accessorKey: 'first_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Name" />
    ),
    cell: ({ row }) => {
      const learner = row.original;
      const name = `${learner.first_name} ${learner.last_name || ''}`.trim();
      return (
        <Link
          href={`/learners/enquiries/${learner.id}`}
          className="font-medium text-primary hover:underline"
        >
          {name}
        </Link>
      );
    },
    size: 200,
    minSize: 150,
    maxSize: 250,
  },
  {
    accessorKey: 'student_mobile',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Mobile" />
    ),
    cell: ({ row }) => {
      return (
        <div className="text-sm">{row.original.student_mobile || 'N/A'}</div>
      );
    },
    size: 120,
  },
  {
    accessorKey: 'program.program_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Program" />
    ),
    cell: ({ row }) => {
      return (
        <div className="text-sm">
          {row.original.program?.program_name || 'Not specified'}
        </div>
      );
    },
    size: 150,
  },
  {
    accessorKey: 'institution.name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Institution" />
    ),
    cell: ({ row }) => {
      return (
        <div className="text-sm">
          {row.original.institution?.name || 'N/A'}
        </div>
      );
    },
    size: 180,
  },
  {
    // Admission cohort column. Renders ONLY the cohort name (no year-range
    // period) per 2026-05-19 product call — the table is dense and the period
    // adds clutter. Other surfaces (lead detail, learner detail, my-profile)
    // still use formatAdmissionYear() for the full "Name (year)" label.
    // Sort uses year from the FK join so the column stays meaningful after
    // Phase D drops the legacy admission_year integer column.
    id: 'admission_year',
    accessorFn: (row) =>
      (row as any).admission_year_obj?.year ?? row.admission_year ?? null,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Admission Year" />
    ),
    cell: ({ row }) => {
      const name =
        (row.original as any).admission_year_obj?.admission_year_name ??
        (row.original.admission_year != null
          ? String(row.original.admission_year)
          : null);
      return (
        <div className="text-sm">
          {name ?? <span className="text-muted-foreground italic">Not specified</span>}
        </div>
      );
    },
    size: 180,
    filterFn: (row, _id, value: string[]) => {
      if (!Array.isArray(value) || value.length === 0) return true;
      const fk = (row.original as any).admission_year_id;
      return fk ? value.includes(fk) : false;
    },
  },
  {
    accessorKey: 'lifecycle_status',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => {
      return <LifecycleStatusBadge status={row.original.lifecycle_status} />;
    },
    size: 120,
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id));
    },
  },
  {
    accessorKey: 'created_at',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Created" />
    ),
    cell: ({ row }) => {
      return (
        <div className="text-sm text-muted-foreground">
          {format(new Date(row.original.created_at), 'MMM dd, yyyy')}
        </div>
      );
    },
    size: 120,
  },
  {
    id: 'actions',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Actions" />
    ),
    cell: ({ row }) => <DataTableRowActions row={row} />,
    size: 50,
    minSize: 50,
    maxSize: 50,
  },
];

// ============================================================================
// Fee-backfill annotation columns (only shown on "Fees Setup Pending" tab)
// ============================================================================

const FEE_FIELD_LABELS: Record<string, string> = {
  program_id: 'Program',
  admission_year_id: 'Admission Year',
  degree_id: 'Degree',
  department_id: 'Department',
  quota_id: 'Quota',
  accommodation_type_id: 'Accommodation',
  community_category_id: 'Community',
  institution_id: 'Institution',
};

// Labels here must signal "needs user attention" — a green/solid "Ready"
// badge would mislead finance staff into thinking the row needs no action.
// Even tier2 (matches without quota) requires a manual decision because
// adopting it overrides the learner's recorded quota.
const RESOLUTION_STATUS_BADGES: Record<
  NonNullable<FeeBackfillAnnotations['_resolution_status']>,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; className?: string }
> = {
  // tier1_ready shouldn't normally appear in this tab — the bulk-adopt
  // migration drains it. If a row slips in (e.g. freshly created
  // admitted+legacy since the migration), surface it as "Auto-applying" so
  // it's obvious the user doesn't need to do anything — re-running the bulk
  // job clears it.
  tier1_ready: { label: 'Auto-applying', variant: 'outline', className: 'border-emerald-500 text-emerald-700' },
  tier2_ready: { label: 'Quota Mismatch', variant: 'outline', className: 'border-amber-500 text-amber-700' },
  missing_fields: { label: 'Missing Fields', variant: 'outline', className: 'border-amber-500 text-amber-700' },
  no_structure: { label: 'No Fee Structure', variant: 'outline', className: 'border-rose-500 text-rose-700' },
  ambiguous_strict: { label: 'Multiple Matches', variant: 'outline', className: 'border-orange-500 text-orange-700' },
  ambiguous_relaxed: { label: 'Multiple Matches', variant: 'outline', className: 'border-orange-500 text-orange-700' },
  unclassified: { label: 'Unclassified', variant: 'outline' },
};

const feeStatusColumn: ColumnDef<EnquiryRow> = {
  id: '_fee_resolution_status',
  header: ({ column }) => <DataTableColumnHeader column={column} title="Match Status" />,
  cell: ({ row }) => {
    const status = row.original._resolution_status;
    if (!status) return <span className="text-muted-foreground text-xs">—</span>;
    const badge = RESOLUTION_STATUS_BADGES[status];
    return (
      <Badge variant={badge.variant} className={badge.className}>
        {badge.label}
      </Badge>
    );
  },
  size: 170,
  minSize: 140,
  maxSize: 200,
};

const missingFieldsColumn: ColumnDef<EnquiryRow> = {
  id: '_fee_missing_fields',
  header: ({ column }) => <DataTableColumnHeader column={column} title="Missing Fields" />,
  cell: ({ row }) => {
    const missing = row.original._missing_fields;
    if (!missing || missing.length === 0) {
      return <span className="text-muted-foreground text-xs">—</span>;
    }
    return (
      <div className="flex flex-wrap gap-1">
        {missing.map(f => (
          <Badge key={f} variant="outline" className="border-amber-400 text-amber-700 text-xs">
            {FEE_FIELD_LABELS[f] ?? f}
          </Badge>
        ))}
      </div>
    );
  },
  size: 260,
  minSize: 200,
  maxSize: 320,
  enableSorting: false,
};

/**
 * Returns the column set for the enquiries table, optionally prepended with
 * the Match Status + Missing Fields columns (used on "Fees Setup Pending").
 * The fee columns slot after the select-checkbox column so row-selection
 * stays on the far left.
 */
export function buildEnquiryColumns(
  options: { showFeeStatus?: boolean } = {}
): ColumnDef<EnquiryRow>[] {
  if (!options.showFeeStatus) {
    return enquiryColumns as ColumnDef<EnquiryRow>[];
  }
  const [selectCol, ...rest] = enquiryColumns as ColumnDef<EnquiryRow>[];
  return [selectCol, feeStatusColumn, missingFieldsColumn, ...rest];
}
