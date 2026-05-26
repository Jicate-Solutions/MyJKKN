'use client';

import { useEffect, useState, useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AlertBox } from '@/components/ui/alert-box';
import { Loader2, Download } from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import {
  exportAuditLogsToCSV,
  exportAuditLogsToJSON,
  exportAuditLogsToXLSX
} from '@/lib/utils/export-audit-logs';
import AuditLogFilters, { FilterState } from './audit-log-filters';

interface AuditLog {
  id: string;
  action: 'create' | 'update' | 'delete';
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

export default function AuditLogTable() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    searchText: '',
    actionType: 'all',
    school: '',
  });
  const [page, setPage] = useState(0);
  const itemsPerPage = 100;

  useEffect(() => {
    fetchAuditLogs();
  }, []);

  async function fetchAuditLogs() {
    try {
      setLoading(true);
      const supabase = createClientSupabaseClient();

      const { data, error: queryError } = await supabase
        .from('school_defaults_audit_logs')
        .select(
          `
          id,
          action,
          school_id,
          school_name,
          resource_type,
          changes,
          user_id,
          created_at,
          profiles:user_id (
            email,
            full_name
          )
        `
        )
        .order('created_at', { ascending: false })
        .limit(500);

      if (queryError) throw queryError;
      setLogs((data || []) as AuditLog[]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit logs');
      console.error('Error fetching audit logs:', err);
    } finally {
      setLoading(false);
    }
  }

  const getActionColor = (action: string) => {
    switch (action) {
      case 'create':
        return 'bg-green-50 border-green-300';
      case 'update':
        return 'bg-blue-50 border-blue-300';
      case 'delete':
        return 'bg-red-50 border-red-300';
      default:
        return 'bg-gray-50 border-gray-300';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getUserDisplay = (log: AuditLog) => {
    const profile = log.profile as any;
    return profile?.full_name || profile?.email || 'Unknown User';
  };

  function applyFilters(logs: AuditLog[], filters: FilterState): AuditLog[] {
    return logs.filter(log => {
      // Search text
      if (filters.searchText) {
        const searchLower = filters.searchText.toLowerCase();
        const matchesSearch =
          log.school_name.toLowerCase().includes(searchLower) ||
          getUserDisplay(log).toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }

      // Action type
      if (filters.actionType !== 'all' && log.action !== filters.actionType) {
        return false;
      }

      // School
      if (filters.school && log.school_id !== filters.school) {
        return false;
      }

      return true;
    });
  }

  const schoolOptions = useMemo(() => {
    const schools = new Map<string, string>();
    logs.forEach(log => {
      if (!schools.has(log.school_id)) {
        schools.set(log.school_id, log.school_name);
      }
    });
    return Array.from(schools.entries()).map(([id, name]) => ({
      value: id,
      label: name,
    }));
  }, [logs]);

  const filteredLogs = applyFilters(logs, filters);
  const startIndex = page * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedLogs = filteredLogs.slice(startIndex, endIndex);
  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [filters]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <AlertBox type="error" message={error} />}

      {logs.length === 0 ? (
        <AlertBox type="info" message="No audit logs found" />
      ) : (
        <>
          <AuditLogFilters
            filters={filters}
            onFilterChange={setFilters}
            schoolOptions={schoolOptions}
          />

          <div className="flex justify-end gap-2">
            <div className="relative group">
              <Button
                variant="outline"
                size="sm"
                className="flex items-center"
              >
                <Download className="h-4 w-4 mr-1" />
                Export
              </Button>
              <div className="absolute right-0 mt-1 w-40 bg-white border rounded shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto z-10">
                <button
                  onClick={() => {
                    const timestamp = new Date().toISOString().split('T')[0];
                    exportAuditLogsToCSV(filteredLogs, `audit-${timestamp}.csv`);
                  }}
                  className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-sm"
                >
                  CSV
                </button>
                <button
                  onClick={() => {
                    const timestamp = new Date().toISOString().split('T')[0];
                    exportAuditLogsToJSON(filteredLogs, `audit-${timestamp}.json`);
                  }}
                  className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-sm"
                >
                  JSON
                </button>
                <button
                  onClick={() => {
                    const timestamp = new Date().toISOString().split('T')[0];
                    exportAuditLogsToXLSX(filteredLogs, `audit-${timestamp}.xlsx`);
                  }}
                  className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-sm border-t"
                >
                  Excel
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between py-4">
            <div className="text-sm text-muted-foreground">
              Showing {startIndex + 1} to {Math.min(endIndex, filteredLogs.length)} of {filteredLogs.length} logs
            </div>
            <div className="flex gap-2 items-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
              >
                Previous
              </Button>
              <span className="text-sm flex items-center px-2">
                Page {page + 1} of {Math.max(1, totalPages)}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                disabled={page >= totalPages - 1}
              >
                Next
              </Button>
            </div>
          </div>

          <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Timestamp</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>School</TableHead>
                <TableHead>Resource</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedLogs.map(log => (
                <TableRow key={log.id}>
                  <TableCell className="text-sm">
                    {formatDate(log.created_at)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={getActionColor(log.action)}>
                      {log.action.charAt(0).toUpperCase() + log.action.slice(1)}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">{log.school_name}</TableCell>
                  <TableCell className="text-sm">
                    {log.resource_type === 'degree' ? 'K-12 Program' : 'Department'}
                  </TableCell>
                  <TableCell className="text-sm">{getUserDisplay(log)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    <details>
                      <summary className="cursor-pointer hover:underline">
                        View Changes
                      </summary>
                      <pre className="mt-2 bg-muted p-2 rounded text-xs overflow-auto max-w-sm">
                        {JSON.stringify(log.changes, null, 2)}
                      </pre>
                    </details>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        </>
      )}

      <div className="text-xs text-muted-foreground">
        Showing {filteredLogs.length} of {logs.length} audit log entries
      </div>
    </div>
  );
}
