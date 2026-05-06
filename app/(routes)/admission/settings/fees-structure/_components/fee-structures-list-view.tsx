'use client';

// fee-structures-list-view.tsx
//
// Heavyweight DataTable for /admission/settings/fees-structure (rewritten
// 2026-05-06 to match other admission modules — admission-years, leads).
// Supports URL state, server-side pagination, sortable columns, search,
// row selection, column visibility/resizing. Filters (institution, status)
// rendered via renderToolbarContent.

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DataTable } from '@/components/data-table/data-table';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, RotateCcw } from 'lucide-react';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { FeeStructureService } from '@/lib/services/admission/fee-structure-service';
import { columns, type FeeStructureRow } from './columns';

export function FeeStructuresListView() {
  const router = useRouter();
  const { institutions } = useInstitutionsWithAccess();

  const [institutionFilter, setInstitutionFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [refetchKey, setRefetchKey] = useState(0);

  const bumpRefetch = useCallback(() => setRefetchKey((k) => k + 1), []);

  const fetchData = async (params: {
    page: number;
    limit: number;
    search: string;
    sort_by: string;
    sort_order: string;
  }) => {
    try {
      const { data, metadata } = await FeeStructureService.listAllPaginated({
        page: params.page,
        limit: params.limit,
        search: params.search || undefined,
        sortBy: params.sort_by || undefined,
        sortOrder: (params.sort_order as 'asc' | 'desc') || undefined,
        institution_id: institutionFilter === 'all' ? undefined : institutionFilter,
        status:
          statusFilter === 'all'
            ? undefined
            : (statusFilter as 'draft' | 'active' | 'archived'),
      });

      return {
        success: true,
        data: data as FeeStructureRow[],
        pagination: {
          page: metadata.page,
          limit: metadata.limit,
          total_pages: metadata.totalPages,
          total_items: metadata.total,
        },
      };
    } catch (err) {
      console.error('Failed to fetch fee structures', err);
      throw err;
    }
  };

  const renderCustomToolbar = () => (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Institution filter */}
      <Select
        value={institutionFilter}
        onValueChange={(v) => {
          setInstitutionFilter(v);
          bumpRefetch();
        }}
      >
        <SelectTrigger className="w-44 h-8">
          <SelectValue placeholder="All institutions" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All institutions</SelectItem>
          {institutions.map((i) => (
            <SelectItem key={i.id} value={i.id}>
              {i.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Status filter */}
      <Select
        value={statusFilter}
        onValueChange={(v) => {
          setStatusFilter(v);
          bumpRefetch();
        }}
      >
        <SelectTrigger className="w-32 h-8">
          <SelectValue placeholder="All statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          <SelectItem value="draft">Draft</SelectItem>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="archived">Archived</SelectItem>
        </SelectContent>
      </Select>

      {(institutionFilter !== 'all' || statusFilter !== 'all') && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8"
          onClick={() => {
            setInstitutionFilter('all');
            setStatusFilter('all');
            bumpRefetch();
          }}
        >
          <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset
        </Button>
      )}

      <Button
        size="sm"
        className="h-8 ml-auto"
        onClick={() => router.push('/admission/settings/fees-structure/new')}
      >
        <Plus className="h-4 w-4 mr-1" />
        New Fee Structure
      </Button>
    </div>
  );

  return (
    <DataTable
      fetchDataFn={fetchData}
      getColumns={() => columns as any}
      refetchKey={refetchKey}
      idField="id"
      meta={{ onRefetch: bumpRefetch }}
      exportConfig={{
        entityName: 'fee-structures',
        columnMapping: {
          name: 'Name',
          institution_name: 'Institution',
          programme_name: 'Programme',
          admission_year_name: 'Admission Year',
          quota_name: 'Quota',
          community_name: 'Community',
          accommodation_name: 'Accommodation',
          item_count: 'Items',
          status: 'Status',
        },
        columnWidths: [],
        headers: [],
      }}
      config={{
        enableUrlState: true,
        enableDateFilter: false,
        enableExport: true,
        enableRowSelection: true,
        enableSearch: true,
        enableColumnFilters: false,
        enableColumnVisibility: true,
        enableColumnResizing: true,
        columnResizingTableId: 'fee-structures-table',
      }}
      renderToolbarContent={renderCustomToolbar}
    />
  );
}
