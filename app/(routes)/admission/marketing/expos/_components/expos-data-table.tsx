'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { DataTable, type DataFetchParams } from '@/components/data-table/data-table';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { columns } from './columns';
import { useAuth } from '@/hooks/use-auth';
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

export function ExposDataTable() {
  const { profile } = useAuth();
  const router = useRouter();
  const institutionId = profile?.institution_id || '';
  const [refreshKey, setRefreshKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const handleRefresh = () => {
    setIsRefreshing(true);
    toast.success('Expos data refreshed');
    setTimeout(() => {
      setRefreshKey((k) => k + 1);
      setIsRefreshing(false);
    }, 300);
  };

  const fetchData = async (params: DataFetchParams) => {
    const result = await ExpoService.getExpoEvents({
      institution_id: institutionId,
      search: params.search || undefined,
      status: statusFilter !== 'all' ? (statusFilter as ExpoEventStatus) : undefined,
      page: params.page,
      limit: params.limit,
      sort_by: params.sort_by || 'start_date',
      sort_order: (params.sort_order as 'asc' | 'desc') || 'desc',
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
          <Button size="sm" onClick={() => router.push('/admission/marketing/expos/new')}>
            <Plus className="h-4 w-4 mr-1" />
            New Expo
          </Button>
        </div>
      </div>
      <DataTable
        key={refreshKey}
        fetchDataFn={fetchData as any}
        getColumns={() => columns as any}
        exportConfig={{ entityName: 'expos', columnMapping: {}, columnWidths: [], headers: [] }}
        idField="id"
        config={{ enableUrlState: false, enableDateFilter: false, enableExport: false }}
      />
    </div>
  );
}
