'use client';

import { useState, useCallback, useMemo } from 'react';
import { Database, Upload, RefreshCw, Users, MapPin, School, FileUp } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  DataTable,
  type DataFetchParams,
} from '@/components/data-table/data-table';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { getColumns } from './columns';
import { ImportLeadsDialog } from './import-leads-dialog';
import { LeadDetailDialog } from './lead-detail-dialog';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { useMarketingLeadDistricts, useMarketingLeadStats } from '@/hooks/admission/use-marketing-leads-database';
import { MarketingLeadsDatabaseService } from '@/lib/services/admission/marketing-leads-database-service';
import type { MarketingLeadDatabase } from '@/types/admission';

export function LeadsDatabaseDataTable() {
  const { selectedInstitutionId, loading: institutionLoading } = useUserInstitutionAccess();
  const institutionId = selectedInstitutionId || '';

  // State
  const [refreshKey, setRefreshKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<MarketingLeadDatabase | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [districtFilter, setDistrictFilter] = useState<string>('all');
  const [genderFilter, setGenderFilter] = useState<string>('all');

  // Fetch distinct districts for filter + stats
  const { data: districts = [] } = useMarketingLeadDistricts(institutionId);
  const { data: stats } = useMarketingLeadStats(institutionId);

  // Handlers
  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    toast.success('Data refreshed');
    setTimeout(() => {
      setRefreshKey((k) => k + 1);
      setIsRefreshing(false);
    }, 300);
  }, []);

  const handleViewLead = useCallback((lead: MarketingLeadDatabase) => {
    setSelectedLead(lead);
    setDetailOpen(true);
  }, []);

  const handleImportSuccess = useCallback(() => {
    setImportOpen(false);
    setRefreshKey((k) => k + 1);
  }, []);

  // Column definitions
  const columns = useMemo(() => getColumns(handleViewLead), [handleViewLead]);

  // Data fetcher
  const fetchData = useCallback(
    async (params: DataFetchParams) => {
      const result = await MarketingLeadsDatabaseService.getLeads({
        institution_id: institutionId,
        search: params.search || undefined,
        district: districtFilter !== 'all' ? districtFilter : undefined,
        gender: genderFilter !== 'all' ? genderFilter : undefined,
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
    },
    [institutionId, districtFilter, genderFilter]
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Database className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Leads Database</h2>
            <p className="text-sm text-muted-foreground">
              Bulk uploaded marketing leads data
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw
              className={`h-4 w-4 mr-1 ${isRefreshing ? 'animate-spin' : ''}`}
            />
            Refresh
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => setImportOpen(true)}
          >
            <Upload className="h-4 w-4 mr-1" />
            Import Leads
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card>
            <CardContent className="py-3 px-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-100">
                  <Users className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total Leads</p>
                  <p className="text-lg font-bold">{stats.totalLeads.toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 px-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-green-100">
                  <MapPin className="h-4 w-4 text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Districts</p>
                  <p className="text-lg font-bold">{stats.totalDistricts}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 px-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-purple-100">
                  <School className="h-4 w-4 text-purple-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Schools</p>
                  <p className="text-lg font-bold">{stats.totalSchools}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 px-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-pink-100">
                  <Users className="h-4 w-4 text-pink-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Gender</p>
                  <div className="flex gap-2 text-xs font-medium">
                    <span className="text-blue-600">M:{stats.genderBreakdown.male}</span>
                    <span className="text-pink-600">F:{stats.genderBreakdown.female}</span>
                    {stats.genderBreakdown.other > 0 && (
                      <span className="text-purple-600">O:{stats.genderBreakdown.other}</span>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 px-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-orange-100">
                  <FileUp className="h-4 w-4 text-orange-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Uploads</p>
                  <p className="text-lg font-bold">{stats.totalUploads}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="py-3 px-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">
                District:
              </span>
              <Select
                value={districtFilter}
                onValueChange={(val) => {
                  setDistrictFilter(val);
                  setRefreshKey((k) => k + 1);
                }}
              >
                <SelectTrigger className="w-[180px] h-8">
                  <SelectValue placeholder="All Districts" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Districts</SelectItem>
                  {districts.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground">
                Gender:
              </span>
              <Select
                value={genderFilter}
                onValueChange={(val) => {
                  setGenderFilter(val);
                  setRefreshKey((k) => k + 1);
                }}
              >
                <SelectTrigger className="w-[130px] h-8">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="Male">Male</SelectItem>
                  <SelectItem value="Female">Female</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Data Table */}
      <DataTable
        key={`${refreshKey}-${districtFilter}-${genderFilter}`}
        fetchDataFn={fetchData as any}
        getColumns={() => columns as any}
        exportConfig={{
          entityName: 'marketing-leads',
          columnMapping: {
            student_name: "Student's Name",
            father_name: 'Father Name',
            gender: 'Gender',
            mobile_number: 'Mobile Number',
            district: 'District',
            sub_district: 'Sub District',
            community: 'Community',
            group_detail: 'Group Detail',
            school_name: 'School Name',
            address: 'Address',
            pincode: 'Pincode',
          },
          headers: [
            "Student's Name",
            'Father Name',
            'Gender',
            'Mobile Number',
            'District',
            'Sub District',
            'Community',
            'Group Detail',
            'School Name',
            'Address',
            'Pincode',
          ],
          columnWidths: [
            { wch: 30 }, { wch: 25 }, { wch: 12 }, { wch: 18 },
            { wch: 20 }, { wch: 20 }, { wch: 18 }, { wch: 20 },
            { wch: 30 }, { wch: 35 }, { wch: 12 },
          ],
        }}
        idField="id"
        config={{
          enableUrlState: false,
          enableDateFilter: false,
          enableExport: true,
        }}
      />

      {/* Import Dialog */}
      <ImportLeadsDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onSuccess={handleImportSuccess}
        institutionId={institutionId}
      />

      {/* Detail View Dialog */}
      <LeadDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        lead={selectedLead}
      />
    </div>
  );
}
