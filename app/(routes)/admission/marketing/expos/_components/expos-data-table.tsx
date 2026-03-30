'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { DataTable, type DataFetchParams } from '@/components/data-table/data-table';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/hooks/use-permissions';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getExpoColumns } from './columns';
import { ExpoService } from '@/lib/services/admission/expo-service';
import type { ExpoEventStatus } from '@/types/admission';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'planned', label: 'Planned' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

interface ExposDataTableProps {
  /** When true, shows only expos the user is assigned to as a team member */
  isTeamMemberView?: boolean;
}

export function ExposDataTable({ isTeamMemberView = false }: ExposDataTableProps) {
  const router = useRouter();
  const { canPerformAny } = usePermissions();
  const canCreate = canPerformAny('admission.marketing.expos', ['create']);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const triggerRefresh = () => setRefreshKey((k) => k + 1);

  const handleRefresh = () => {
    setIsRefreshing(true);
    toast.success('Expos data refreshed');
    setTimeout(() => {
      triggerRefresh();
      setIsRefreshing(false);
    }, 300);
  };

  const fetchData = async (params: DataFetchParams) => {
    // For team member view, first get the event IDs the user is assigned to
    let teamEventIds: string[] | undefined;
    if (isTeamMemberView) {
      teamEventIds = await ExpoService.getTeamMemberEventIds();
      if (teamEventIds.length === 0) {
        return {
          success: true,
          data: [],
          pagination: { page: 1, limit: params.limit, total_pages: 1, total_items: 0 },
        };
      }
    }

    const result = await ExpoService.getExpoEvents({
      search: params.search || undefined,
      status: statusFilter !== 'all' ? (statusFilter as ExpoEventStatus) : undefined,
      page: params.page,
      limit: params.limit,
      sort_by: params.sort_by || 'start_date',
      sort_order: (params.sort_order as 'asc' | 'desc') || 'desc',
      event_ids: teamEventIds,
    });

    return {
      success: true,
      data: result.data,
      pagination: {
        page: result.metadata.page,
        limit: result.metadata.limit,
        total_pages: result.metadata.totalPages || 1,
        total_items: result.metadata.total,
      },
    };
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setRefreshKey(k => k + 1); }}>
            <SelectTrigger className="w-[160px] h-9">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={handleRefresh} disabled={isRefreshing}>
            <RefreshCw className={`h-4 w-4 mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {canCreate && (
            <Button size="sm" onClick={() => router.push('/admission/marketing/expos/new')}>
              <Plus className="h-4 w-4 mr-1" />
              New Expo
            </Button>
          )}
        </div>
      </div>
      <DataTable
        key={refreshKey}
        fetchDataFn={fetchData as any}
        getColumns={() => getExpoColumns(triggerRefresh) as any}
        exportConfig={{ entityName: 'expos', columnMapping: {}, columnWidths: [], headers: [] }}
        idField="id"
        config={{ enableUrlState: false, enableDateFilter: false, enableExport: false }}
      />
    </div>
  );
}
