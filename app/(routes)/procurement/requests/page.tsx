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
import { displayRequestNumber } from '@/lib/procurement/display-number';
import {
  PR_STATUS_CONFIG,
  type ProcurementPurchaseRequest,
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
import { Plus, Search } from 'lucide-react';
import { BeatLoader } from 'react-spinners';

/**
 * Where a request is, in words a requester uses. A request that has become a
 * quotation keeps the status 'converted' forever, so its real stage comes from
 * that quotation: still collecting, waiting for the Super Admin, or ordered.
 */
const STAGE_CONFIG: Record<string, { label: string; color: string }> = {
  ...PR_STATUS_CONFIG,
  with_super_admin: { label: 'Waiting for Super Admin', color: 'amber' },
  ordered: { label: 'Ordered', color: 'green' },
  received: { label: 'Received', color: 'green' },
};

function stageOf(req: ProcurementPurchaseRequest): string {
  if (req.status !== 'converted') return req.status;
  const orders = (req.order_statuses ?? []).filter((s) => s !== 'cancelled');
  if (orders.length && orders.every((s) => s === 'completed' || s === 'closed')) return 'received';
  const live = (req.quote_statuses ?? []).filter((s) => s !== 'cancelled');
  if (live.some((s) => s === 'awarded' || s === 'closed')) return 'ordered';
  if (live.includes('pending_award_approval')) return 'with_super_admin';
  return 'converted';
}

/** "Keyboard × 5" · "Keyboard × 5, Mouse × 2" · "Keyboard × 5 + 3 more" */
function whatIsNeeded(req: ProcurementPurchaseRequest): string {
  const items = req.item_preview ?? [];
  if (!items.length) return `${req.item_count ?? 0} item${req.item_count === 1 ? '' : 's'}`;
  const fmt = (i: { item_name: string; required_quantity: number }) => `${i.item_name} × ${Number(i.required_quantity)}`;
  if (items.length <= 2) return items.map(fmt).join(', ');
  return `${fmt(items[0])} + ${items.length - 1} more`;
}

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
    <ContentLayout title="Requests">
      <div className="space-y-4 sm:space-y-6">
        <PageHeader
          title="Requests"
          description="Everything people have asked to buy, and where each one is now."
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
                  <SelectItem value="all">All stages</SelectItem>
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
                <AlertBox type="error" message="Failed to load requests. Please try again." />
              </div>
            ) : requests.length === 0 ? (
              <EmptyState
                title="No requests found"
                description="Requests you create or that are routed to you will appear here."
              />
            ) : (
              <ResponsiveList
                rows={requests}
                getRowKey={(req) => req.id}
                onRowClick={(req) => router.push(`/procurement/requests/${req.id}`)}
                rowLabel={(req) => `View request ${displayRequestNumber(req.request_number)}`}
                columns={[
                  {
                    key: 'needed',
                    header: 'What is needed',
                    mobile: 'title',
                    cell: (req) => (
                      <div className="min-w-0">
                        <p className="truncate font-medium">{whatIsNeeded(req)}</p>
                        <p className="text-xs text-muted-foreground">
                          {displayRequestNumber(req.request_number)}
                          {req.request_type === 'new_item' ? ' · new item' : req.request_type === 'mixed' ? ' · includes new items' : ''}
                        </p>
                      </div>
                    ),
                  },
                  {
                    key: 'requested_by',
                    header: 'Asked by',
                    cell: (req) => req.requested_by_profile?.full_name || '-',
                  },
                  { key: 'date', header: 'Date', cell: (req) => formatDateDMY(req.created_at) },
                  {
                    key: 'stage',
                    header: 'Where it is',
                    mobile: 'badge',
                    cell: (req) => <StatusBadge status={stageOf(req)} config={STAGE_CONFIG} />,
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
