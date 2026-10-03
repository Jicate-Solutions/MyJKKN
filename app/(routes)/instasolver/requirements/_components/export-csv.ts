// CSV export of the requirements list (CAO only — the button is hidden for
// everyone else, and RLS still limits which rows come back).

import { REQUIREMENT_STATUS_META } from '@/lib/instasolver/constants';
import type { Requirement } from '@/types/instasolver';

const HEADERS = [
  'Reference',
  'Item',
  'Category',
  'Institution',
  'Quantity',
  'Cost estimate (INR)',
  'Needed by',
  'Usage location',
  'Delivery location',
  'Requested by',
  'Status',
  'Review note',
  'Created'
];

function cell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  // Neutralise spreadsheet formula injection, then quote.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function requirementsToCsv(rows: Requirement[]): string {
  const lines = rows.map((r) =>
    [
      r.reference_no,
      r.item_requested,
      r.category?.name,
      r.institution?.name,
      r.quantity_needed,
      r.cost_estimate,
      r.needed_by,
      r.usage_location,
      r.delivery_location,
      r.requester?.full_name,
      REQUIREMENT_STATUS_META[r.status]?.label ?? r.status,
      r.review_notes,
      r.created_at
    ]
      .map(cell)
      .join(',')
  );
  return [HEADERS.map(cell).join(','), ...lines].join('\r\n');
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
