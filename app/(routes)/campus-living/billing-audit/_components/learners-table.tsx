'use client';

import React from 'react';
import { DataTable, type DataFetchParams } from '@/components/data-table/data-table';
import { BillingAuditService } from '@/lib/services/campus-living/billing-audit-service';
import {
  BAND_STATUS_LABELS,
  FINDING_LABELS,
  type BillingAuditFilters,
  type BillingAuditRow
} from '@/types/campus-living-billing-audit';
import { columns } from './learners-columns';

const STATUS_LABEL: Record<string, string> = {
  paid: 'Paid',
  partially_paid: 'Partly paid',
  unpaid: 'Unpaid'
};

// The shared DataTable export resolves each cell via a FLAT key lookup on the
// transformed row, so every header below must be a top-level key emitted here.
function transformForExport(r: BillingAuditRow): Record<string, string | number> {
  return {
    rollNumber: r.roll_number ?? '',
    registerNumber: r.register_number ?? '',
    learnerName: r.full_name || '',
    gender: r.gender ?? '',
    institution: r.institution_name ?? '',
    programme: r.program_name ?? '',
    yearOfStudy: r.year_of_study ?? '',
    lifecycleStatus: r.lifecycle_status,
    allocated: r.is_allocated ? 'Yes' : 'No',
    block: r.block_name ?? '',
    room: r.room_number ?? '',
    bed: r.bed_number ?? '',
    bedCategory: r.seated_category_name ?? '',
    billedCategory: r.tagged_category_name ?? '',
    messCategory: r.mess_category_name ?? '',
    bandFee: r.band_fee ?? '',
    entitledCategory: r.entitled_category_name ?? '',
    bandStatus: BAND_STATUS_LABELS[r.band_status] ?? r.band_status,
    expectedRoom: r.expected_room_fee ?? '',
    expectedMess: r.expected_mess_fee ?? '',
    expectedUpgrade: r.expected_upgrade_fee ?? '',
    categoryRoomRate: r.category_room_rate ?? '',
    categoryMessRate: r.category_mess_rate ?? '',
    roomBilled: r.room_billed ?? '',
    roomPaid: r.room_paid ?? '',
    roomStatus: r.room_status ? (STATUS_LABEL[r.room_status] ?? r.room_status) : '',
    roomDue: r.room_due_date ?? '',
    messBilled: r.mess_billed ?? '',
    messPaid: r.mess_paid ?? '',
    messStatus: r.mess_status ? (STATUS_LABEL[r.mess_status] ?? r.mess_status) : '',
    messDue: r.mess_due_date ?? '',
    upgradeBilled: r.upgrade_billed ?? '',
    upgradePaid: r.upgrade_paid ?? '',
    upgradeStatus: r.upgrade_status ? (STATUS_LABEL[r.upgrade_status] ?? r.upgrade_status) : '',
    upgradeDue: r.upgrade_due_date ?? '',
    totalBilled: r.total_billed,
    totalPaid: r.total_paid,
    totalOutstanding: r.total_outstanding,
    overdueAmount: r.overdue_amount,
    findings: r.findings.map((f) => FINDING_LABELS[f] ?? f).join('; '),
    measuredFor: r.target_academic_year_name ?? ''
  };
}

// One entry per header, in the same order — the widths are applied by INDEX,
// so inserting a header without inserting its width here shifts every column
// after it.
const EXPORT_HEADERS = [
  'rollNumber', 'registerNumber', 'learnerName', 'gender', 'institution', 'programme', 'yearOfStudy',
  'lifecycleStatus', 'allocated', 'block', 'room', 'bed', 'bedCategory', 'billedCategory', 'messCategory',
  'bandFee', 'entitledCategory', 'bandStatus',
  'expectedRoom', 'expectedMess', 'expectedUpgrade', 'categoryRoomRate', 'categoryMessRate',
  'roomBilled', 'roomPaid', 'roomStatus', 'roomDue',
  'messBilled', 'messPaid', 'messStatus', 'messDue',
  'upgradeBilled', 'upgradePaid', 'upgradeStatus', 'upgradeDue',
  'totalBilled', 'totalPaid', 'totalOutstanding', 'overdueAmount', 'findings', 'measuredFor'
] as const;

const EXPORT_LABELS: Record<(typeof EXPORT_HEADERS)[number], string> = {
  rollNumber: 'Roll Number',
  registerNumber: 'Register Number',
  learnerName: 'Learner',
  gender: 'Gender',
  institution: 'Institution',
  programme: 'Programme',
  yearOfStudy: 'Year of Study',
  lifecycleStatus: 'Lifecycle Status',
  allocated: 'Allocated',
  block: 'Block',
  room: 'Room',
  bed: 'Bed',
  bedCategory: 'Bed Category',
  billedCategory: 'Billed Category',
  messCategory: 'Mess Category',
  bandFee: 'Band Fee (Academic)',
  entitledCategory: 'Entitled Category',
  bandStatus: 'Band Status',
  expectedRoom: 'Structure Room Fee',
  expectedMess: 'Structure Mess Fee',
  expectedUpgrade: 'Expected Upgrade Fee',
  categoryRoomRate: 'Category Room Rate',
  categoryMessRate: 'Category Mess Rate',
  roomBilled: 'Room Billed',
  roomPaid: 'Room Paid',
  roomStatus: 'Room Status',
  roomDue: 'Room Due',
  messBilled: 'Mess Billed',
  messPaid: 'Mess Paid',
  messStatus: 'Mess Status',
  messDue: 'Mess Due',
  upgradeBilled: 'Upgrade Billed',
  upgradePaid: 'Upgrade Paid',
  upgradeStatus: 'Upgrade Status',
  upgradeDue: 'Upgrade Due',
  totalBilled: 'Total Billed',
  totalPaid: 'Total Paid',
  totalOutstanding: 'Outstanding',
  overdueAmount: 'Overdue',
  findings: 'Findings',
  measuredFor: 'Measured For (AY)'
};

const EXPORT_WIDTHS = EXPORT_HEADERS.map((h) => ({
  wch: h === 'learnerName' || h === 'institution' || h === 'programme' || h === 'findings' ? 28 : 14
}));

interface LearnersTableProps {
  filters: BillingAuditFilters;
  canExport: boolean;
}

export function LearnersTable({ filters, canExport }: LearnersTableProps) {
  // Re-key the table whenever a scope or finding filter changes so it resets
  // to page 1. A narrowed result set would otherwise leave the user on a page
  // that no longer exists — an empty grid, which on an audit screen reads as
  // "no problems", the opposite of the truth.
  const filterKey = React.useMemo(
    () =>
      JSON.stringify([
        filters.institution_ids ?? null,
        filters.academic_year_id ?? null,
        filters.block_id ?? null,
        filters.room_category_id ?? null,
        filters.program_id ?? null,
        filters.gender ?? null,
        filters.allocated_only ?? false,
        filters.finding ?? 'all'
      ]),
    [
      filters.institution_ids,
      filters.academic_year_id,
      filters.block_id,
      filters.room_category_id,
      filters.program_id,
      filters.gender,
      filters.allocated_only,
      filters.finding
    ]
  );

  const fetchData = React.useCallback(
    async (params: DataFetchParams) => {
      const { rows, total } = await BillingAuditService.getLearners({
        ...filters,
        search: params.search || null,
        page: params.page,
        page_size: params.limit,
        sort_by: params.sort_by || null,
        sort_dir: (params.sort_order as 'asc' | 'desc') || 'asc'
      });
      return {
        success: true,
        data: rows,
        pagination: {
          page: params.page,
          limit: params.limit,
          total_pages: Math.max(1, Math.ceil(total / Math.max(params.limit, 1))),
          total_items: total
        }
      };
    },
    [filters]
  );

  return (
    <DataTable<BillingAuditRow, unknown>
      key={filterKey}
      fetchDataFn={fetchData}
      getColumns={() => columns as any}
      idField='learner_id'
      exportConfig={{
        entityName: 'hostel-billing-audit',
        columnMapping: EXPORT_LABELS,
        columnWidths: EXPORT_WIDTHS,
        headers: [...EXPORT_HEADERS],
        transformFunction: transformForExport
      }}
      config={{
        enableUrlState: true,
        enableDateFilter: false,
        // campus_living.billing_audit.export is granted separately from .view —
        // a role may read the audit without taking learner data off-platform.
        enableExport: canExport,
        enableRowSelection: true,
        enableSearch: true,
        enableColumnFilters: false,
        enableColumnVisibility: true,
        enableColumnResizing: true,
        columnResizingTableId: 'cl-billing-audit-table'
      }}
    />
  );
}
