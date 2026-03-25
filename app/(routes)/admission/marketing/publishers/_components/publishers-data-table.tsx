'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { DataTable, type DataFetchParams, type DataFetchResult } from '@/components/data-table/data-table';
import { Button } from '@/components/ui/button';
import { columns } from './columns';
import { useAuth } from '@/hooks/use-auth';
import { ConsultantService } from '@/lib/services/admission/consultant-service';

export function PublishersDataTable() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id || '';
  const [refreshKey, setRefreshKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = () => {
    setIsRefreshing(true);
    toast.success('Publishers data refreshed');
    setTimeout(() => {
      setRefreshKey((k) => k + 1);
      setIsRefreshing(false);
    }, 300);
  };

  const fetchData = async (params: DataFetchParams) => {
    const result = await ConsultantService.getConsultants({
      institution_id: institutionId,
      search: params.search || undefined,
      page: params.page,
      limit: params.limit,
      sort_by: params.sort_by || 'created_at',
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
      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw className={`h-4 w-4 mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>
      <DataTable
        key={refreshKey}
        fetchDataFn={fetchData as any}
        getColumns={() => columns as any}
        exportConfig={{
          entityName: 'publishers',
          columnMapping: {},
          columnWidths: [],
          headers: [],
        }}
        idField="id"
        config={{
          enableUrlState: false,
          enableDateFilter: false,
          enableExport: false,
        }}
      />
    </div>
  );
}
