'use client';

import { useState, useCallback } from 'react';
import { RefreshCw, Download, SlidersHorizontal, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import { DataTable, type DataFetchParams } from '@/components/data-table/data-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { WP_CATEGORIES, AdminPulseEntry } from '@/types/work-pulse';
import { getPulseColumns } from './columns';
import { PulseDetailSheet } from './pulse-detail-sheet';

interface AllPulseTableProps {
  institutions: Array<{ id: string; name: string }>;
  departments: Array<{ id: string; department_name: string }>;
}

const ROLES = [
  'super_admin', 'administrator', 'principal', 'hod',
  'faculty', 'staff', 'accountant', 'librarian',
];

export function AllPulseTable({ institutions, departments }: AllPulseTableProps) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<AdminPulseEntry | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Custom filters
  const [institutionFilter, setInstitutionFilter] = useState('all');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const handleView = useCallback((entry: AdminPulseEntry) => {
    setSelectedEntry(entry);
    setSheetOpen(true);
  }, []);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setRefreshKey((k) => k + 1);
      setIsRefreshing(false);
      toast.success('Data refreshed');
    }, 300);
  };

  const handleFilterChange = () => {
    setRefreshKey((k) => k + 1);
  };

  const resetFilters = () => {
    setInstitutionFilter('all');
    setDepartmentFilter('all');
    setRoleFilter('all');
    setCategoryFilter('all');
    setRefreshKey((k) => k + 1);
  };

  const activeFilterCount = [institutionFilter, departmentFilter, roleFilter, categoryFilter]
    .filter((v) => v !== 'all').length;

  const fetchData = async (params: DataFetchParams) => {
    const searchParams = new URLSearchParams({
      page: String(params.page),
      limit: String(params.limit),
    });

    if (params.search) searchParams.set('search', params.search);
    if (params.from_date) searchParams.set('date_from', params.from_date);
    if (params.to_date) searchParams.set('date_to', params.to_date);
    if (params.sort_by) searchParams.set('sort_by', params.sort_by);
    if (institutionFilter !== 'all') searchParams.set('institution_id', institutionFilter);
    if (departmentFilter !== 'all') searchParams.set('department_id', departmentFilter);
    if (roleFilter !== 'all') searchParams.set('role', roleFilter);
    if (categoryFilter !== 'all') searchParams.set('talent_waste_category', categoryFilter);

    const res = await fetch(`/api/work-pulse/admin?${searchParams}`);
    if (!res.ok) throw new Error('Failed to fetch');

    const json = await res.json();
    return {
      success: true,
      data: json.data || [],
      pagination: {
        page: params.page,
        limit: params.limit,
        total_pages: Math.ceil((json.total || 0) / params.limit),
        total_items: json.total || 0,
      },
    };
  };

  return (
    <div className="space-y-3">
      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={institutionFilter} onValueChange={(v) => { setInstitutionFilter(v); handleFilterChange(); }}>
          <SelectTrigger className="w-[180px] h-9">
            <SelectValue placeholder="Institution" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Institutions</SelectItem>
            {institutions.map((i) => (
              <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={departmentFilter} onValueChange={(v) => { setDepartmentFilter(v); handleFilterChange(); }}>
          <SelectTrigger className="w-[180px] h-9">
            <SelectValue placeholder="Department" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.department_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v); handleFilterChange(); }}>
          <SelectTrigger className="w-[140px] h-9">
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            {ROLES.map((r) => (
              <SelectItem key={r} value={r} className="capitalize">{r.replace(/_/g, ' ')}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); handleFilterChange(); }}>
          <SelectTrigger className="w-[200px] h-9">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {WP_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {activeFilterCount > 0 && (
          <Button variant="ghost" size="sm" onClick={resetFilters} className="h-9 gap-1.5 text-destructive hover:text-destructive">
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
            <Badge variant="secondary" className="h-5 min-w-[20px] px-1 text-[10px] rounded-full">
              {activeFilterCount}
            </Badge>
          </Button>
        )}

        <div className="ml-auto">
          <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={isRefreshing} className="h-9">
            <RefreshCw className={`h-4 w-4 mr-1.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* DataTable */}
      <DataTable
        key={refreshKey}
        fetchDataFn={fetchData as any}
        getColumns={() => getPulseColumns(handleView) as any}
        exportConfig={{
          entityName: 'work-pulse-submissions',
          columnMapping: {
            user: 'User',
            role: 'Role',
            department: 'Department',
            institution: 'Institution',
            week_of: 'Week Of',
            talent_waste_category: 'Talent Waste Category',
            talent_waste_description: 'Talent Waste Description',
            repetition_category: 'Repetition Category',
            repetition_description: 'Repetition Description',
          },
          columnWidths: [
            { wch: 20 }, { wch: 15 }, { wch: 20 }, { wch: 25 },
            { wch: 12 }, { wch: 25 }, { wch: 40 }, { wch: 25 }, { wch: 40 },
          ],
          headers: [
            'User', 'Role', 'Department', 'Institution', 'Week Of',
            'Talent Waste Category', 'Talent Waste Description',
            'Repetition Category', 'Repetition Description',
          ],
        }}
        idField="id"
        config={{
          enableUrlState: true,
          enableDateFilter: true,
          enableExport: true,
          enableColumnResizing: true,
        }}
        pageSizeOptions={[10, 15, 25, 50]}
      />

      {/* Detail Sheet */}
      <PulseDetailSheet
        entry={selectedEntry}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </div>
  );
}
