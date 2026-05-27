'use client';

import { useEffect, useState, useCallback } from 'react';
import { Loader2, Clock, CheckCircle2, XCircle, Calendar } from 'lucide-react';
import RestoreQueueTable from './_components/restore-queue-table';
import {
  RestoreQueueDashboardService,
  type QueueStatus,
} from '@/lib/services/restore-queue-dashboard-service';

function StatCard({
  label,
  value,
  icon,
  colorClass,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  colorClass: string;
}) {
  return (
    <div className={`rounded-lg border p-4 flex items-center gap-4 ${colorClass}`}>
      <div className="shrink-0">{icon}</div>
      <div>
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-sm text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

export default function RestoreQueuePage() {
  const [status, setStatus] = useState<QueueStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);

  const fetchStatus = useCallback(async () => {
    try {
      const s = await RestoreQueueDashboardService.getQueueStatus();
      setStatus(s);
    } catch (err) {
      console.error('Failed to load queue status:', err);
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Auto-refresh status every 30 seconds
  useEffect(() => {
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Restore Queue Monitor
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          View and monitor scheduled restore operations for school K-12 Programs
          and departments.
        </p>
      </div>

      {/* Status cards */}
      {loadingStatus ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading status...
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Pending"
            value={status?.pendingCount ?? 0}
            icon={<Clock className="h-6 w-6 text-yellow-600" />}
            colorClass="bg-yellow-50 border-yellow-200"
          />
          <StatCard
            label="Completed"
            value={status?.completedCount ?? 0}
            icon={<CheckCircle2 className="h-6 w-6 text-green-600" />}
            colorClass="bg-green-50 border-green-200"
          />
          <StatCard
            label="Failed"
            value={status?.failedCount ?? 0}
            icon={<XCircle className="h-6 w-6 text-red-600" />}
            colorClass="bg-red-50 border-red-200"
          />
          <StatCard
            label="Next Execution"
            value={
              status?.nextExecutionAt
                ? new Date(status.nextExecutionAt).toLocaleTimeString()
                : 'None pending'
            }
            icon={<Calendar className="h-6 w-6 text-blue-600" />}
            colorClass="bg-blue-50 border-blue-200"
          />
        </div>
      )}

      {/* Queue table */}
      <div>
        <h2 className="text-lg font-medium mb-4">Queue Items</h2>
        <RestoreQueueTable />
      </div>
    </div>
  );
}
