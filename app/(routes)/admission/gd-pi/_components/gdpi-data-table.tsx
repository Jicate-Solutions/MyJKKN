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
import { getGDPIColumns } from './columns';
import { apiClient, type PaginatedApiResponse } from '@/lib/api/client';
import type { GDPISession, GDPISessionStatus } from '@/types/admission';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const TYPE_OPTIONS = [
  { value: 'all', label: 'All Types' },
  { value: 'gd', label: 'Group Discussion' },
  { value: 'pi', label: 'Personal Interview' },
  { value: 'gd_pi', label: 'GD + PI' },
];

export function GDPIDataTable() {
  const router = useRouter();
  const { canPerformAny } = usePermissions();
  const canCreate = canPerformAny('admission', ['create']);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const triggerRefresh = () => setRefreshKey((k) => k + 1);

  const handleRefresh = () => {
    setIsRefreshing(true);
    toast.success('GD-PI data refreshed');
    setTimeout(() => {
      triggerRefresh();
      setIsRefreshing(false);
    }, 300);
  };

  const fetchData = async (params: DataFetchParams) => {
    const queryParams: Record<string, string | number | undefined> = {
      search: params.search || undefined,
      page: params.page,
      limit: params.limit,
    };

    if (statusFilter !== 'all') queryParams.status = statusFilter;
    if (typeFilter !== 'all') queryParams.session_type = typeFilter;

    const res = await apiClient.get<PaginatedApiResponse<GDPISession>>(
      '/api/admission/gd-pi',
      queryParams
    );

    return {
      success: true,
      data: res.data,
      pagination: {
        page: res.metadata.page,
        limit: res.metadata.limit,
        total_pages: res.metadata.totalPages,
        total_items: res.metadata.total,
      },
    };
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); triggerRefresh(); }}>
            <SelectTrigger className="w-[160px] h-9">
              <SelectValue placeholder="Filter status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); triggerRefresh(); }}>
            <SelectTrigger className="w-[180px] h-9">
              <SelectValue placeholder="Filter type" />
            </SelectTrigger>
            <SelectContent>
              {TYPE_OPTIONS.map((opt) => (
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
            <Button size="sm" onClick={() => router.push('/admission/gd-pi/new')}>
              <Plus className="h-4 w-4 mr-1" />
              New Session
            </Button>
          )}
        </div>
      </div>
      <DataTable
        key={refreshKey}
        fetchDataFn={fetchData as any}
        getColumns={() => getGDPIColumns(triggerRefresh) as any}
        exportConfig={{ entityName: 'gdpi-sessions', columnMapping: {}, columnWidths: [], headers: [] }}
        idField="id"
        config={{ enableUrlState: false, enableDateFilter: false, enableExport: true }}
      />
    </div>
  );
}
