'use client';

import { toast } from 'sonner';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import {
  Shirt,
  Plus,
  Search,
  Loader2,
  CheckCircle2,
  Clock,
  PackageCheck,
  Droplets,
  Wind,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useLaundryOrders } from '@/hooks/campus-living/use-hostel-laundry';
import { BlockSelector } from '@/components/campus-living/block-selector';

export default function LaundryPage() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id || '';
  const [searchQuery, setSearchQuery] = useState('');
  const [blockFilter, setBlockFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [serviceFilter, setServiceFilter] = useState<string>('all');

  const filters = useMemo(
    () => ({
      block_id: blockFilter !== 'all' ? blockFilter : undefined,
      status: statusFilter !== 'all' ? statusFilter : undefined,
      service_type: serviceFilter !== 'all' ? serviceFilter : undefined,
    }),
    [blockFilter, statusFilter, serviceFilter]
  );

  const { data, isLoading } = useLaundryOrders(institutionId, filters);
  const orders = data?.data ?? [];

  const filteredOrders = orders.filter((o) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (o.notes ?? '').toLowerCase().includes(q) ||
      (o.service_type ?? '').toLowerCase().includes(q) ||
      (o.id ?? '').toLowerCase().includes(q)
    );
  });

  const stats = useMemo(() => {
    const all = orders;
    return {
      total: all.length,
      pending: all.filter((o) => o.status === 'pending' || o.status === 'received').length,
      inProgress: all.filter((o) => o.status === 'washing' || o.status === 'drying').length,
      ready: all.filter((o) => o.status === 'ready').length,
      delivered: all.filter((o) => o.status === 'delivered').length,
    };
  }, [orders]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline"><Clock className="mr-1 h-3 w-3" />Pending</Badge>;
      case 'received':
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100"><PackageCheck className="mr-1 h-3 w-3" />Received</Badge>;
      case 'washing':
        return <Badge className="bg-cyan-100 text-cyan-800 hover:bg-cyan-100"><Droplets className="mr-1 h-3 w-3" />Washing</Badge>;
      case 'drying':
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100"><Wind className="mr-1 h-3 w-3" />Drying</Badge>;
      case 'ready':
        return <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100"><PackageCheck className="mr-1 h-3 w-3" />Ready</Badge>;
      case 'delivered':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100"><CheckCircle2 className="mr-1 h-3 w-3" />Delivered</Badge>;
      case 'cancelled':
        return <Badge variant="outline" className="text-muted-foreground">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <ContentLayout title="Laundry">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Laundry' },
        ]}
      />

      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Shirt className="h-6 w-6 text-primary" />
              Laundry Orders
            </h1>
            <p className="text-muted-foreground">
              Track laundry pickup, processing and delivery.
            </p>
          </div>
          <Button
            onClick={() =>
              toast.info('Inline new-order dialog ships next.', {
                description: 'Use the orders sub-page to create an order until the inline form is wired.',
              })
            }
          >
            <Plus className="mr-2 h-4 w-4" />
            New Order
          </Button>
        </div>

        {/* Stats */}
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-5">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Pending</p>
              <p className="text-2xl font-bold">{stats.pending}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">In Progress</p>
              <p className="text-2xl font-bold">{stats.inProgress}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Ready</p>
              <p className="text-2xl font-bold">{stats.ready}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Delivered</p>
              <p className="text-2xl font-bold">{stats.delivered}</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search orders…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <BlockSelector
                institutionId={institutionId}
                value={blockFilter}
                onValueChange={setBlockFilter}
              />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="received">Received</SelectItem>
                  <SelectItem value="washing">Washing</SelectItem>
                  <SelectItem value="drying">Drying</SelectItem>
                  <SelectItem value="ready">Ready</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <Select value={serviceFilter} onValueChange={setServiceFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Service Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Services</SelectItem>
                  <SelectItem value="wash">Wash</SelectItem>
                  <SelectItem value="wash_iron">Wash &amp; Iron</SelectItem>
                  <SelectItem value="dry_clean">Dry Clean</SelectItem>
                  <SelectItem value="ironing">Ironing</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="py-16 text-center">
                <Shirt className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                <h3 className="font-medium">No laundry orders yet</h3>
                <p className="text-sm text-muted-foreground">
                  New orders will appear here once they're submitted.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>Garments</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Received</TableHead>
                    <TableHead>Delivered</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-mono text-xs">{o.id.slice(0, 8)}</TableCell>
                      <TableCell className="capitalize">{o.service_type ?? '—'}</TableCell>
                      <TableCell>{o.garment_count ?? '—'}</TableCell>
                      <TableCell>{getStatusBadge(o.status)}</TableCell>
                      <TableCell>
                        {o.received_at ? new Date(o.received_at).toLocaleDateString() : '—'}
                      </TableCell>
                      <TableCell>
                        {o.delivered_at ? new Date(o.delivered_at).toLocaleDateString() : '—'}
                      </TableCell>
                      <TableCell className="max-w-[240px] truncate text-sm text-muted-foreground">
                        {o.notes ?? '—'}
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
