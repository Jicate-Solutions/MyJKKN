'use client';

import { useEffect, useState } from 'react';
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
import { exportAuditLogsToCSV } from '@/lib/utils/export-audit-logs';

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
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const timestamp = new Date().toISOString().split('T')[0];
                exportAuditLogsToCSV(logs, `school-defaults-audit-${timestamp}.csv`);
              }}
            >
              <Download className="h-4 w-4 mr-1" />
              Export as CSV
            </Button>
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
              {logs.map(log => (
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
        Showing last 500 audit log entries. Total: {logs.length}
      </div>
    </div>
  );
}
