'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { usePurchaseOrders } from '@/hooks/procurement/use-purchase-orders';
import { useDebounceValue } from '@/hooks/use-debounce-value';
import { InstitutionFilter } from '@/components/procurement/institution-filter';
import { StatusBadge } from '@/components/procurement/status-badge';
import { EmptyState } from '@/components/empty-state';
import { AlertBox } from '@/components/ui/alert-box';
import { formatDateDMY } from '@/lib/utils/date-format';
import { PO_STATUS_CONFIG, type PoStatus, type PurchaseOrderFilters } from '@/types/procurement';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
  const [institutionId, setInstitutionId] = useState<string | undefined>(undefined);
  const effectiveInstitution = institutionId ?? profile?.institution_id ?? undefined;

  const filters: PurchaseOrderFilters = {
    search: debouncedSearch || undefined,
    status: statusFilter !== 'all' ? (statusFilter as PoStatus) : undefined,
    institution_id: effectiveInstitution,
  };

  const { data: response, isLoading, isError } = usePurchaseOrders(filters);
  const pos = response?.data ?? [];

  return (
    <ContentLayout title="Purchase Orders">
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Purchase Orders</h2>
            <p className="text-muted-foreground">
              Generated per awarded vendor. Approve, then send to the vendor.
            </p>
          </div>
          {canManageFormats && (
            <Button
              variant="outline"
              className="shrink-0"
              onClick={() => router.push('/procurement/purchase-orders/formats')}
            >
              <Settings2 className="mr-2 h-4 w-4" />
              Manage Formats
            </Button>
          )}
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by PO number..."
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
            </div>
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
                <AlertBox type="error" message="Failed to load purchase orders. Please try again." />
              </div>
            ) : pos.length === 0 ? (
              <EmptyState
                title="No purchase orders found"
                description="Purchase orders generated from awarded RFQs will appear here."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>PO #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pos.map((po) => (
                    <TableRow key={po.id}>
                      <TableCell className="font-medium">{po.po_number}</TableCell>
                      <TableCell>{formatDateDMY(po.created_at)}</TableCell>
                      <TableCell>{po.supplier?.name || '-'}</TableCell>
                      <TableCell>{po.item_count ?? '-'}</TableCell>
                      <TableCell className="text-right">
                        ₹{Number(po.total_amount ?? 0).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={po.status} config={PO_STATUS_CONFIG} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`View purchase order ${po.po_number}`}
                          onClick={() => router.push(`/procurement/purchase-orders/${po.id}`)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
