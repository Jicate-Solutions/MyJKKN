'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { useAuth } from '@/hooks/use-auth';
import { useGrns } from '@/hooks/procurement/use-grns';
import { useDebounceValue } from '@/hooks/use-debounce-value';
import { InstitutionFilter } from '@/components/procurement/institution-filter';
import { StatusBadge } from '@/components/procurement/status-badge';
import { ResponsiveList } from '@/components/procurement/responsive-list';
import { PageHeader, FilterBar } from '@/components/procurement/page-header';
import { EmptyState } from '@/components/empty-state';
import { AlertBox } from '@/components/ui/alert-box';
import { formatDateDMY } from '@/lib/utils/date-format';
import { GRN_STATUS_CONFIG, type GrnStatus, type GrnFilters } from '@/types/procurement';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ReceiveSwitcher } from '@/components/procurement/receive-switcher';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Eye, Search } from 'lucide-react';
import { BeatLoader } from 'react-spinners';

export default function GrnListPage() {
  const router = useRouter();
  const { profile } = useAuth();

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounceValue(search, 300);
  const searchParams = useSearchParams();
  // The Overview status bars link here with ?institution=<id|all>&status=<status>.
  const [statusFilter, setStatusFilter] = useState<string>(() => searchParams.get('status') ?? 'all');
  const [institutionId, setInstitutionId] = useState<string | undefined>(
    () => searchParams.get('institution') ?? undefined
  );
  // 'all' = every college the viewer may see (RLS scopes the rows). effectiveInstitution
  // stays a concrete college for anything that creates a document.
  const allColleges = institutionId === 'all';
  const effectiveInstitution =
    (institutionId && !allColleges ? institutionId : undefined) ?? profile?.institution_id ?? undefined;

  const filters: GrnFilters = {
    search: debouncedSearch || undefined,
    status: statusFilter !== 'all' ? (statusFilter as GrnStatus) : undefined,
    institution_id: allColleges ? undefined : effectiveInstitution,
    all_institutions: allColleges,
  };

  const { data: response, isLoading, isError } = useGrns(filters);
  const grns = response?.data ?? [];

  return (
    <ContentLayout title="Deliveries">
      <div className="space-y-4 sm:space-y-6">
        <div className="space-y-2">
          <PageHeader
            title="Deliveries"
            description="Receive deliveries against a purchase order, check they match the PO and invoice, and add accepted stock to inventory once verified."
          />
          <ReceiveSwitcher active="receipts" />
        </div>

        <Card>
          <CardContent className="p-4 sm:p-6">
            <FilterBar>
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by delivery number..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  {Object.entries(GRN_STATUS_CONFIG).map(([key, config]) => (
                    <SelectItem key={key} value={key}>
                      {config.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <InstitutionFilter
                value={allColleges ? 'all' : effectiveInstitution}
                onChange={setInstitutionId}
                allLabel="All colleges"
                label={null}
                className="w-full sm:w-[200px]"
              />
            </FilterBar>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <BeatLoader color="hsl(var(--primary))" size={10} />
              </div>
            ) : isError ? (
              <div className="p-6">
                <AlertBox type="error" message="Failed to load delivery records. Please try again." />
              </div>
            ) : grns.length === 0 ? (
              <EmptyState
                title="No delivery records found"
                description="Open an approved purchase order to record a delivery."
              />
            ) : (
              <ResponsiveList
                rows={grns}
                getRowKey={(grn) => grn.id}
                onRowClick={(grn) => router.push(`/procurement/grn/${grn.id}`)}
                rowLabel={(grn) => `View ${grn.grn_number}`}
                columns={[
                  {
                    key: 'grn',
                    header: 'Delivery #',
                    mobile: 'title',
                    className: 'font-medium',
                    cell: (grn) => grn.grn_number,
                  },
                  { key: 'date', header: 'Date', cell: (grn) => formatDateDMY(grn.created_at) },
                  { key: 'po', header: 'PO #', cell: (grn) => grn.purchase_order?.po_number || '-' },
                  { key: 'vendor', header: 'Vendor', cell: (grn) => grn.supplier?.name || '-' },
                  { key: 'invoice', header: 'Invoice', cell: (grn) => grn.invoice_number || '-' },
                  { key: 'items', header: 'Items', cell: (grn) => grn.item_count ?? '-' },
                  {
                    key: 'status',
                    header: 'Status',
                    mobile: 'badge',
                    cell: (grn) => <StatusBadge status={grn.status} config={GRN_STATUS_CONFIG} />,
                  },
                  {
                    key: 'actions',
                    header: 'Actions',
                    mobile: 'hidden',
                    className: 'text-right',
                    cell: (grn) => (
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`View ${grn.grn_number}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/procurement/grn/${grn.id}`);
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    ),
                  },
                ]}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
