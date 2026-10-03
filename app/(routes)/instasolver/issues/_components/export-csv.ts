import { format } from 'date-fns';
import { ISSUE_STATUS_META, PRIORITY_META, SEVERITY_META } from '@/lib/instasolver/constants';
import type { Issue } from '@/types/instasolver';

function cell(value: string | number | null | undefined): string {
  let s = value === null || value === undefined ? '' : String(value);
  // A spreadsheet would run a cell that starts like a formula.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function issuesToCsv(rows: Issue[]): string {
  const header = [
    'Reference',
    'Title',
    'Location',
    'Institution',
    'Category',
    'Severity',
    'Priority',
    'Status',
    'Assigned to',
    'Team',
    'Reported by',
    'Reported on',
    'Completed on'
  ];
  const lines = rows.map((r) =>
    [
      r.reference_no,
      r.title,
      r.location,
      r.institution?.name,
      r.category?.name,
      SEVERITY_META[r.severity].label,
      r.priority ? PRIORITY_META[r.priority].label : '',
      ISSUE_STATUS_META[r.status].label,
      r.assignee?.full_name,
      r.team?.name,
      r.reporter?.full_name,
      format(new Date(r.created_at), 'yyyy-MM-dd HH:mm'),
      r.completed_at ? format(new Date(r.completed_at), 'yyyy-MM-dd HH:mm') : ''
    ]
      .map(cell)
      .join(',')
  );
  return [header.map(cell).join(','), ...lines].join('\r\n');
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
