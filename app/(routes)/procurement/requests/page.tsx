'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { usePurchaseRequests } from '@/hooks/procurement/use-purchase-requests';
import { useDebounceValue } from '@/hooks/use-debounce-value';
import { InstitutionFilter } from '@/components/procurement/institution-filter';
import { StatusBadge } from '@/components/procurement/status-badge';
import { ResponsiveList } from '@/components/procurement/responsive-list';
import { PageHeader, FilterBar } from '@/components/procurement/page-header';
import { EmptyState } from '@/components/empty-state';
import { AlertBox } from '@/components/ui/alert-box';
import { formatDateDMY } from '@/lib/utils/date-format';
import {
  PR_STATUS_CONFIG,
  type PurchaseRequestStatus,
  type PurchaseRequestFilters,
} from '@/types/procurement';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Eye, Search } from 'lucide-react';
import { BeatLoader } from 'react-spinners';

export default function PurchaseRequestsPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const { canAccess, isSuperAdmin } = usePermissions();
  const canCreate = isSuperAdmin || canAccess('procurement', 'request_create');

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounceValue(search, 300);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [institutionId, setInstitutionId] = useState<string | undefined>(undefined);
  const effectiveInstitution = institutionId ?? profile?.institution_id ?? undefined;

  const filters: PurchaseRequestFilters = {
    search: debouncedSearch || undefined,
    status: statusFilter !== 'all' ? (statusFilter as PurchaseRequestStatus) : undefined,
    institution_id: effectiveInstitution,
  };

  const { data: response, isLoading, isError } = usePurchaseRequests(filters);
  const requests = response?.data ?? [];

  return (
    <ContentLayout title="Purchase Requests">
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Purchase Requests"
          description="Restock and new-item requests routed for approval."
          actions={
            canCreate && (
              <Button
                onClick={() =>
                  router.push(
                    effectiveInstitution
                      ? `/procurement/requests/new?institution=${effectiveInstitution}`
                      : '/procurement/requests/new'
                  )
                }
              >
                <Plus className="mr-2 h-4 w-4" />
                New Request
              </Button>
            )
          }
        />

        <Card>
          <CardContent className="p-4 sm:p-6">
            <FilterBar>
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by request number..."
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
                  {Object.entries(PR_STATUS_CONFIG).map(([key, config]) => (
                    <SelectItem key={key} value={key}>
                      {config.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <InstitutionFilter
                value={effectiveInstitution}
                onChange={setInstitutionId}
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
              <div className="py-12 px-6">
                <AlertBox type="error" message="Failed to load purchase requests. Please try again." />
              </div>
            ) : requests.length === 0 ? (
              <EmptyState
                title="No purchase requests found"
                description="Requests you create or that are routed to you will appear here."
              />
            ) : (
              <ResponsiveList
                rows={requests}
                getRowKey={(req) => req.id}
                onRowClick={(req) => router.push(`/procurement/requests/${req.id}`)}
                rowLabel={(req) => `View request ${req.request_number}`}
                columns={[
                  {
                    key: 'request',
                    header: 'Request #',
                    mobile: 'title',
                    className: 'font-medium',
                    cell: (req) => req.request_number,
                  },
                  { key: 'date', header: 'Date', cell: (req) => formatDateDMY(req.created_at) },
                  {
                    key: 'type',
                    header: 'Type',
                    className: 'capitalize',
                    cell: (req) => req.request_type.replace('_', ' '),
                  },
                  {
                    key: 'requested_by',
                    header: 'Requested By',
                    cell: (req) => req.requested_by_profile?.full_name || '-',
                  },
                  { key: 'items', header: 'Items', cell: (req) => req.item_count ?? '-' },
                  {
                    key: 'status',
                    header: 'Status',
                    mobile: 'badge',
                    cell: (req) => <StatusBadge status={req.status} config={PR_STATUS_CONFIG} />,
                  },
                  {
                    key: 'actions',
                    header: 'Actions',
                    mobile: 'hidden',
                    className: 'text-right',
                    cell: (req) => (
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`View request ${req.request_number}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/procurement/requests/${req.id}`);
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
