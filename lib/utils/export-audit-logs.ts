import * as XLSX from 'xlsx';
import type { FilterState } from '@/app/(routes)/organizations/school-defaults/audit/_components/audit-log-filters';

interface AuditLog {
  id: string;
  action: 'create' | 'update' | 'delete' | 'restore';
  school_id: string;
  school_name: string;
  resource_type: 'degree' | 'department';
  changes: Record<string, any>;
  user_id: string;
  created_at: string;
  profile?: {
    email: string;
    full_name?: string;
  };
}

function applyFiltersBeforeExport(logs: AuditLog[], filters: FilterState): AuditLog[] {
  return logs.filter((log) => {
    if (filters.actionType !== 'all' && log.action !== filters.actionType) return false;
    if (filters.resourceType && filters.resourceType !== 'all' && log.resource_type !== filters.resourceType) return false;
    if (filters.school && log.school_id !== filters.school) return false;
    if (filters.searchText) {
      const searchLower = filters.searchText.toLowerCase();
      const matchesSearch =
        log.school_name.toLowerCase().includes(searchLower) ||
        log.user_id.toLowerCase().includes(searchLower);
      if (!matchesSearch) return false;
    }
    if (filters.dateRange?.from || filters.dateRange?.to) {
      const logDate = new Date(log.created_at);
      if (filters.dateRange.from && logDate < filters.dateRange.from) return false;
      if (filters.dateRange.to && logDate > filters.dateRange.to) return false;
    }
    return true;
  });
}

export function exportAuditLogsToCSV(logs: AuditLog[], filename: string = 'audit-logs.csv', filters?: FilterState) {
  const logsToExport = filters ? applyFiltersBeforeExport(logs, filters) : logs;

  if (!logsToExport.length) {
    alert('No audit logs to export');
    return;
  }

  const headers = ['Timestamp', 'Action', 'School', 'Resource Type', 'User', 'Changes'];

  const rows = logsToExport.map(log => {
    const profile = log.profile as any;
    const user = profile?.full_name || profile?.email || 'Unknown';
    return [
      log.created_at,
      log.action,
      log.school_name,
      log.resource_type,
      user,
      JSON.stringify(log.changes),
    ];
  });

  const csvContent = [
    headers.join(','),
    ...rows.map(row =>
      row.map(cell => {
        // Escape quotes and wrap in quotes if contains comma or newline
        const str = String(cell).replace(/"/g, '""');
        return str.includes(',') || str.includes('\n') ? `"${str}"` : str;
      }).join(',')
    ),
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function exportAuditLogsToJSON(logs: AuditLog[], filename: string = 'audit-logs.json', filters?: FilterState) {
  const logsToExport = filters ? applyFiltersBeforeExport(logs, filters) : logs;

  if (!logsToExport.length) {
    alert('No audit logs to export');
    return;
  }

  const jsonContent = JSON.stringify(logsToExport, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function exportAuditLogsToXLSX(logs: AuditLog[], filename: string = 'audit-logs.xlsx', filters?: FilterState) {
  const logsToExport = filters ? applyFiltersBeforeExport(logs, filters) : logs;

  if (!logsToExport.length) {
    alert('No audit logs to export');
    return;
  }

  // Create worksheet data
  const data = [
    ['Timestamp', 'Action', 'School', 'Resource Type', 'User', 'Changes'],
    ...logsToExport.map(log => {
      const profile = log.profile as any;
      const user = profile?.full_name || profile?.email || 'Unknown';
      return [
        log.created_at,
        log.action,
        log.school_name,
        log.resource_type,
        user,
        JSON.stringify(log.changes),
      ];
    }),
  ];

  // Create worksheet and workbook
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Audit Log');

  XLSX.writeFile(wb, filename);
}
