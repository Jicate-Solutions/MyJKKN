'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { useAuth } from '@/hooks/use-auth';
import { usePurchaseOrders } from '@/hooks/procurement/use-purchase-orders';
import { PO_STATUS_CONFIG, type PoStatus, type PurchaseOrderFilters } from '@/types/procurement';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
import { Eye, Search } from 'lucide-react';
import { BeatLoader } from 'react-spinners';

export default function PurchaseOrdersPage() {
  const router = useRouter();
  const { profile } = useAuth();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filters: PurchaseOrderFilters = {
    search: search || undefined,
    status: statusFilter !== 'all' ? (statusFilter as PoStatus) : undefined,
    institution_id: profile?.institution_id || undefined,
  };

  const { data: response, isLoading } = usePurchaseOrders(filters);
  const pos = response?.data ?? [];

  return (
    <ContentLayout title="Purchase Orders">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Purchase Orders</h2>
          <p className="text-muted-foreground">
            Generated per awarded vendor. Approve, then send to the vendor.
          </p>
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
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <BeatLoader color="hsl(var(--primary))" size={10} />
              </div>
            ) : pos.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <p>No purchase orders found</p>
              </div>
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
                      <TableCell>{new Date(po.created_at).toLocaleDateString()}</TableCell>
                      <TableCell>{po.supplier?.name || '-'}</TableCell>
                      <TableCell>{po.item_count ?? '-'}</TableCell>
                      <TableCell className="text-right">
                        ₹{Number(po.total_amount ?? 0).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{PO_STATUS_CONFIG[po.status].label}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
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
