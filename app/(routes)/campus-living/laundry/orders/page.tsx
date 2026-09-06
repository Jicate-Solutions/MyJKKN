'use client';

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
  Search,
  Loader2,
  CheckCircle2,
  Clock,
  PackageCheck,
  Droplets,
  AlertCircle,
  ArrowLeft,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useLaundryOrders } from '@/hooks/campus-living/use-hostel-laundry';
import { BlockSelector } from '@/components/campus-living/block-selector';

/**
 * navMeta — invoked from the parent laundry page via a "View all orders"
 * link/button. Required by `scripts/assert-nav-coverage.mjs` for
 * discoverability tracking. Matches parent-page convention.
 */
export const navMeta = {
  invokedFrom: '/campus-living/laundry',
} as const;

// Real prod schema (verified via Supabase Management API):
// hostel_laundry_orders.status → laundry_order_status_enum
const STATUS_OPTIONS = [
  { value: 'submitted', label: 'Submitted' },
  { value: 'collected', label: 'Collected' },
  { value: 'washing', label: 'Washing' },
  { value: 'ready', label: 'Ready' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'disputed', label: 'Disputed' },
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function LaundryOrdersPage() {
  const { profile } = useAuth();
  const institutionId = profile?.institution_id || '';
  const [searchQuery, setSearchQuery] = useState('');
  const [blockFilter, setBlockFilter] = useState<string>('all');
  const [learnerFilter, setLearnerFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  const filters = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const f: any = {};
    if (blockFilter !== 'all') f.block_id = blockFilter;
    if (statusFilter !== 'all') f.status = statusFilter;
    // Only push a learner filter to the server when it's a valid UUID — the
    // service does an `.eq()` lookup, so a partial string would zero out the
    // result. Free-text fragments stay client-side via searchQuery instead.
    if (learnerFilter && UUID_RE.test(learnerFilter.trim())) {
      f.learner_id = learnerFilter.trim();
    }
    if (dateFrom) f.date_from = new Date(dateFrom).toISOString();
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      f.date_to = end.toISOString();
    }
    return Object.keys(f).length ? f : undefined;
  }, [blockFilter, statusFilter, learnerFilter, dateFrom, dateTo]);

  const { data, isLoading } = useLaundryOrders(institutionId, filters);
  const orders = data?.data ?? [];

  const filteredOrders = orders.filter((o) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      String(o.order_number ?? '').toLowerCase().includes(q) ||
      String(o.id ?? '').toLowerCase().includes(q) ||
      String(o.learner_id ?? '').toLowerCase().includes(q) ||
      String(o.notes ?? '').toLowerCase().includes(q)
    );
  });

  const stats = useMemo(() => {
    const all = orders;
    const statusOf = (o: typeof all[number]) => String(o.status);
    return {
      total: all.length,
      pending: all.filter((o) => statusOf(o) === 'submitted' || statusOf(o) === 'collected').length,
      inProgress: all.filter((o) => statusOf(o) === 'washing').length,
      ready: all.filter((o) => statusOf(o) === 'ready').length,
      delivered: all.filter((o) => statusOf(o) === 'delivered').length,
    };
  }, [orders]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'submitted':
        return <Badge variant="outline"><Clock className="mr-1 h-3 w-3" />Submitted</Badge>;
      case 'collected':
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100"><PackageCheck className="mr-1 h-3 w-3" />Collected</Badge>;
      case 'washing':
        return <Badge className="bg-cyan-100 text-cyan-800 hover:bg-cyan-100"><Droplets className="mr-1 h-3 w-3" />Washing</Badge>;
      case 'ready':
        return <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100"><PackageCheck className="mr-1 h-3 w-3" />Ready</Badge>;
      case 'delivered':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100"><CheckCircle2 className="mr-1 h-3 w-3" />Delivered</Badge>;
      case 'disputed':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100"><AlertCircle className="mr-1 h-3 w-3" />Disputed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const resetFilters = () => {
    setSearchQuery('');
    setBlockFilter('all');
    setLearnerFilter('');
    setStatusFilter('all');
    setDateFrom('');
    setDateTo('');
  };

  const learnerHelp =
    learnerFilter && !UUID_RE.test(learnerFilter.trim())
      ? 'Showing client-side fragment match. Paste a full UUID for a precise server filter.'
      : null;

  return (
    <ContentLayout title="Laundry Orders">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Laundry', href: '/campus-living/laundry' },
          { label: 'Orders' },
        ]}
      />

      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Shirt className="h-6 w-6 text-primary" />
              All Laundry Orders
            </h1>
            <p className="text-muted-foreground">
              Filterable view of every laundry order across pickup, processing
              and delivery.
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/campus-living/laundry">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Laundry
            </Link>
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
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by order number, notes or order ID…"
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
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 items-end">
              <div className="flex-1">
                <label
                  htmlFor="orders-learner-filter"
                  className="text-xs text-muted-foreground block mb-1"
                >
                  Learner UUID
                </label>
                <Input
                  id="orders-learner-filter"
                  placeholder="00000000-0000-0000-0000-000000000000"
                  value={learnerFilter}
                  onChange={(e) => setLearnerFilter(e.target.value)}
                />
                {learnerHelp ? (
                  <p className="text-xs text-amber-600 mt-1">{learnerHelp}</p>
                ) : null}
              </div>
              <div className="flex-1">
                <label
                  htmlFor="orders-date-from"
                  className="text-xs text-muted-foreground block mb-1"
                >
                  Created from
                </label>
                <Input
                  id="orders-date-from"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>
              <div className="flex-1">
                <label
                  htmlFor="orders-date-to"
                  className="text-xs text-muted-foreground block mb-1"
                >
                  Created to
                </label>
                <Input
                  id="orders-date-to"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
              <Button variant="outline" onClick={resetFilters} className="sm:w-auto w-full">
                Reset filters
              </Button>
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
                <h3 className="font-medium">No orders match the filters</h3>
                <p className="text-sm text-muted-foreground">
                  Adjust filters or create a new order from the laundry page.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order #</TableHead>
                    <TableHead>Learner</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Collected</TableHead>
                    <TableHead>Ready</TableHead>
                    <TableHead>Delivered</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-mono text-xs">
                        {String(o.order_number ?? o.id.slice(0, 8))}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {o.learner_id
                          ? String(o.learner_id).slice(0, 8) + '…'
                          : '—'}
                      </TableCell>
                      <TableCell>{String(o.total_items ?? o.garment_count ?? '—')}</TableCell>
                      <TableCell>{getStatusBadge(String(o.status))}</TableCell>
                      <TableCell>
                        {o.collected_at
                          ? new Date(o.collected_at as string).toLocaleDateString()
                          : '—'}
                      </TableCell>
                      <TableCell>
                        {o.ready_at ? new Date(o.ready_at as string).toLocaleDateString() : '—'}
                      </TableCell>
                      <TableCell>
                        {o.delivered_at
                          ? new Date(o.delivered_at as string).toLocaleDateString()
                          : '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {o.created_at
                          ? new Date(o.created_at).toLocaleDateString()
                          : '—'}
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
