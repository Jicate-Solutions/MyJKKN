'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { usePurchaseOrders } from '@/hooks/procurement/use-purchase-orders';
import { useDebounceValue } from '@/hooks/use-debounce-value';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { displayRequestNumber } from '@/lib/procurement/display-number';
import { InstitutionFilter } from '@/components/procurement/institution-filter';
import { StatusBadge } from '@/components/procurement/status-badge';
import { ResponsiveList } from '@/components/procurement/responsive-list';
import { FilterBar } from '@/components/procurement/page-header';
import { EmptyState } from '@/components/empty-state';
import { AlertBox } from '@/components/ui/alert-box';
import { formatDateDMY } from '@/lib/utils/date-format';
import { PO_STATUS_CONFIG, type PoStatus, type PurchaseOrderFilters } from '@/types/procurement';
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
import { Search, Settings2 } from 'lucide-react';
import { BeatLoader } from 'react-spinners';

export default function PurchaseOrdersPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const { canAccess, isSuperAdmin } = usePermissions();
  const canManageFormats = isSuperAdmin || canAccess('procurement', 'po_create');

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounceValue(search, 300);
  const searchParams = useSearchParams();
  // The Overview status bars link here with ?institution=<id|all>&status=<status>.
  const [statusFilter, setStatusFilter] = useState<string>(() => searchParams.get('status') ?? 'all');
  const [institutionId, setInstitutionId] = useState<string | undefined>(
    // Opens on every college the viewer may see (RLS scopes the rows), as Requests
    // does: the store team often handles orders for a college other than their profile's.
    () => searchParams.get('institution') ?? 'all'
  );
  // 'all' = every college the viewer may see (RLS scopes the rows). effectiveInstitution
  // stays a concrete college for anything that creates a document.
  const allColleges = institutionId === 'all';
  const effectiveInstitution =
    (institutionId && !allColleges ? institutionId : undefined) ?? profile?.institution_id ?? undefined;

  const filters: PurchaseOrderFilters = {
    search: debouncedSearch || undefined,
    status: statusFilter !== 'all' ? (statusFilter as PoStatus) : undefined,
    institution_id: allColleges ? undefined : effectiveInstitution,
    all_institutions: allColleges,
  };

  const { data: response, isLoading, isError } = usePurchaseOrders(filters);
  const pos = response?.data ?? [];

  // Request numbers restart per college, so "All colleges" also names the college.
  const { institutions } = useUserInstitutionAccess();
  const collegeName = (id: string) =>
    institutions.find((i) => i.institution_id === id)?.institution_name ?? '-';

  return (
    <ContentLayout title="Deliveries">
      <div className="w-full space-y-5">
        {/* One toolbar row: which list · search · status · college · PO formats last. */}
        <FilterBar>
          <ReceiveSwitcher active="orders" />
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search purchase no. or PO number"
              aria-label="Search purchase orders"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-full sm:w-48" aria-label="Status">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {Object.entries(PO_STATUS_CONFIG).map(([key, config]) => (
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
            className="w-full sm:w-52"
          />
          {canManageFormats && (
            <Button
              variant="outline"
              className="h-9 w-full sm:w-auto"
              onClick={() => router.push('/procurement/purchase-orders/formats')}
            >
              <Settings2 className="mr-1.5 h-4 w-4" />
              PO formats
            </Button>
          )}
        </FilterBar>

        <section className="overflow-hidden rounded-xl border bg-background shadow">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <BeatLoader color="hsl(var(--primary))" size={10} />
              </div>
            ) : isError ? (
              <div className="p-6">
                <AlertBox type="error" message="Failed to load purchase orders. Please try again." />
              </div>
            ) : pos.length === 0 ? (
              <EmptyState
                title="No purchase orders found"
                description="Orders are created when the final approver approves the chosen vendors."
              />
            ) : (
              <ResponsiveList
                rows={pos}
                getRowKey={(po) => po.id}
                onRowClick={(po) => router.push(`/procurement/purchase-orders/${po.id}`)}
                rowLabel={(po) => `View order ${po.po_number}`}
                columns={[
                  {
                    key: 'purchase',
                    header: 'Purchase no.',
                    mobile: 'title',
                    cell: (po) => (
                      <div className="min-w-0">
                        <div className="font-medium">
                          {po.purchase_request
                            ? displayRequestNumber(po.purchase_request.request_number)
                            : po.po_number}
                        </div>
                        {po.purchase_request && (
                          <div className="text-xs font-normal text-muted-foreground">
                            Order {po.po_number}
                          </div>
                        )}
                      </div>
                    ),
                  },
                  ...(allColleges
                    ? [{ key: 'college', header: 'College', cell: (po: (typeof pos)[number]) => collegeName(po.institution_id) }]
                    : []),
                  { key: 'date', header: 'Date', cell: (po) => formatDateDMY(po.created_at) },
                  { key: 'vendor', header: 'Vendor', cell: (po) => po.supplier?.name || '-' },
                  { key: 'items', header: 'Items', cell: (po) => po.item_count ?? '-' },
                  {
                    key: 'total',
                    header: 'Total',
                    className: 'md:text-right tabular-nums',
                    cell: (po) => `₹${Number(po.total_amount ?? 0).toLocaleString('en-IN')}`,
                  },
                  {
                    key: 'status',
                    header: 'Status',
                    mobile: 'badge',
                    cell: (po) => <StatusBadge status={po.status} config={PO_STATUS_CONFIG} />,
                  },
                  // The whole row opens the order; this just says so.
                  {
                    key: 'open',
                    header: '',
                    mobile: 'hidden',
                    className: 'text-right',
                    cell: () => <span className="text-xs font-medium text-muted-foreground">Open ›</span>,
                  },
                ]}
              />
            )}
        </section>
      </div>
    </ContentLayout>
  );
}
