'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { usePurchaseOrders } from '@/hooks/procurement/use-purchase-orders';
import { useDebounceValue } from '@/hooks/use-debounce-value';
import { InstitutionFilter } from '@/components/procurement/institution-filter';
import { StatusBadge } from '@/components/procurement/status-badge';
import { ResponsiveList } from '@/components/procurement/responsive-list';
import { PageHeader, FilterBar } from '@/components/procurement/page-header';
import { EmptyState } from '@/components/empty-state';
import { AlertBox } from '@/components/ui/alert-box';
import { formatDateDMY } from '@/lib/utils/date-format';
import { PO_STATUS_CONFIG, type PoStatus, type PurchaseOrderFilters } from '@/types/procurement';
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
import { Eye, Search, Settings2 } from 'lucide-react';
import { BeatLoader } from 'react-spinners';

export default function PurchaseOrdersPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const { canAccess, isSuperAdmin } = usePermissions();
  const canManageFormats = isSuperAdmin || canAccess('procurement', 'po_create');

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounceValue(search, 300);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const searchParams = useSearchParams();
  const [institutionId, setInstitutionId] = useState<string | undefined>(
    () => searchParams.get('institution') ?? undefined
  );
  const effectiveInstitution = institutionId ?? profile?.institution_id ?? undefined;

  const filters: PurchaseOrderFilters = {
    search: debouncedSearch || undefined,
    status: statusFilter !== 'all' ? (statusFilter as PoStatus) : undefined,
    institution_id: effectiveInstitution,
  };

  const { data: response, isLoading, isError } = usePurchaseOrders(filters);
  const pos = response?.data ?? [];

  return (
    <ContentLayout title="Receive">
      <div className="space-y-4 sm:space-y-6">
        <div className="space-y-2">
          <PageHeader
            title="Receive"
            description="Created automatically when the Super Admin approves the chosen vendors. Download the PDF for the vendor, then record the delivery."
            actions={
              canManageFormats && (
                <Button
                  variant="outline"
                  onClick={() => router.push('/procurement/purchase-orders/formats')}
                >
                  <Settings2 className="mr-2 h-4 w-4" />
                  Order formats
                </Button>
              )
            }
          />
          <ReceiveSwitcher active="orders" />
        </div>

        <Card>
          <CardContent className="p-4 sm:p-6">
            <FilterBar>
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by order number..."
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
                  {Object.entries(PO_STATUS_CONFIG).map(([key, config]) => (
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
              <div className="p-6">
                <AlertBox type="error" message="Failed to load orders. Please try again." />
              </div>
            ) : pos.length === 0 ? (
              <EmptyState
                title="No orders found"
                description="Orders generated after a vendor is chosen will appear here."
              />
            ) : (
              <ResponsiveList
                rows={pos}
                getRowKey={(po) => po.id}
                onRowClick={(po) => router.push(`/procurement/purchase-orders/${po.id}`)}
                rowLabel={(po) => `View order ${po.po_number}`}
                columns={[
                  { key: 'po', header: 'Order #', mobile: 'title', className: 'font-medium', cell: (po) => po.po_number },
                  { key: 'date', header: 'Date', cell: (po) => formatDateDMY(po.created_at) },
                  { key: 'vendor', header: 'Vendor', cell: (po) => po.supplier?.name || '-' },
                  { key: 'items', header: 'Items', cell: (po) => po.item_count ?? '-' },
                  {
                    key: 'total',
                    header: 'Total',
                    className: 'md:text-right tabular-nums',
                    cell: (po) => `₹${Number(po.total_amount ?? 0).toLocaleString()}`,
                  },
                  {
                    key: 'status',
                    header: 'Status',
                    mobile: 'badge',
                    cell: (po) => <StatusBadge status={po.status} config={PO_STATUS_CONFIG} />,
                  },
                  {
                    key: 'actions',
                    header: 'Actions',
                    mobile: 'hidden',
                    className: 'text-right',
                    cell: (po) => (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`View order ${po.po_number}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/procurement/purchase-orders/${po.id}`);
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
