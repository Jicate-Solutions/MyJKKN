'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ContentLayout } from '@/components/layout/content-layout';
import { useImsSales, useImsDailySalesSummary } from '@/hooks/ims/use-ims-sales';
import { useImsStoreContext } from '@/hooks/ims/use-ims-store-context';
import type {
  ImsSaleFilters,
  ImsSaleStatus,
  ImsPaymentMethod,
  ImsCustomerType,
  ImsSale,
} from '@/types/ims';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import {
  Search,
  Eye,
  ShoppingCart,
  DollarSign,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { BeatLoader } from 'react-spinners';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(value);

const STATUS_CONFIG: Record<
  ImsSaleStatus,
  { label: string; variant: 'default' | 'destructive' | 'secondary' | 'outline' }
> = {
  completed: { label: 'Completed', variant: 'default' },
  cancelled: { label: 'Cancelled', variant: 'destructive' },
  refunded: { label: 'Refunded', variant: 'secondary' },
};

const PAYMENT_LABELS: Record<ImsPaymentMethod, string> = {
  cash: 'Cash',
  gpay: 'GPay',
  card: 'Card',
  upi_qr: 'UPI QR',
  mixed: 'Mixed',
};

const CUSTOMER_TYPE_LABELS: Record<ImsCustomerType, string> = {
  student: 'Student',
  staff: 'Staff',
  patient: 'Patient',
  walk_in: 'Walk-in',
};

export default function SalesHistoryPage() {
  const router = useRouter();
  const { storeId, institutionId } = useImsStoreContext();

  // Filter state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const limit = 20;

  const today = useMemo(() => new Date().toISOString().split('T')[0], []);

  // Build filters
  const filters: ImsSaleFilters = {
    institution_id: institutionId,
    store_id: storeId || undefined,
    search: search || undefined,
    status: statusFilter !== 'all' ? (statusFilter as ImsSaleStatus) : undefined,
    payment_method:
      paymentFilter !== 'all' ? (paymentFilter as ImsPaymentMethod) : undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo ? `${dateTo}T23:59:59.999Z` : undefined,
    page,
    limit,
  };

  const { data: salesData, isLoading } = useImsSales(filters);
  const { data: dailySummary } = useImsDailySalesSummary(storeId || '', today, institutionId);

  const sales = salesData?.data || [];
  const metadata = salesData?.metadata || {
    total: 0,
    page: 1,
    limit,
    totalPages: 0,
  };

  // Filtered results summary
  const filteredTotal = useMemo(() => {
    return sales.reduce((sum: number, s: ImsSale) => {
      if (s.status === 'completed') return sum + s.total_amount;
      return sum;
    }, 0);
  }, [sales]);

  return (
    <ContentLayout title="Sales History">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Sales History</h2>
          <p className="text-muted-foreground">
            Browse and manage all past sales transactions
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/30">
                  <ShoppingCart className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    Today&apos;s Sales
                  </p>
                  <p className="text-2xl font-bold">
                    {dailySummary?.total_sales ?? 0}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-50 dark:bg-green-950/30">
                  <DollarSign className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    Today&apos;s Revenue
                  </p>
                  <p className="text-2xl font-bold">
                    {formatCurrency(dailySummary?.total_revenue ?? 0)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-50 dark:bg-purple-950/30">
                  <TrendingUp className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    Current Page Total
                  </p>
                  <p className="text-2xl font-bold">
                    {formatCurrency(filteredTotal)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by sale # or customer..."
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                    className="pl-9"
                  />
                </div>
                <Select
                  value={statusFilter}
                  onValueChange={(val) => {
                    setStatusFilter(val);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-full sm:w-[160px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                    <SelectItem value="refunded">Refunded</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={paymentFilter}
                  onValueChange={(val) => {
                    setPaymentFilter(val);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-full sm:w-[160px]">
                    <SelectValue placeholder="Payment" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Payments</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="gpay">GPay</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="mixed">Mixed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col sm:flex-row gap-4 items-end">
                <div className="flex items-center gap-2 flex-1">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">From</label>
                    <Input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => {
                        setDateFrom(e.target.value);
                        setPage(1);
                      }}
                      className="w-40"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">To</label>
                    <Input
                      type="date"
                      value={dateTo}
                      onChange={(e) => {
                        setDateTo(e.target.value);
                        setPage(1);
                      }}
                      className="w-40"
                    />
                  </div>
                </div>
                {(search || statusFilter !== 'all' || paymentFilter !== 'all' || dateFrom || dateTo) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSearch('');
                      setStatusFilter('all');
                      setPaymentFilter('all');
                      setDateFrom('');
                      setDateTo('');
                      setPage(1);
                    }}
                  >
                    Clear filters
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Sales Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <BeatLoader color="hsl(var(--primary))" size={10} />
              </div>
            ) : sales.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <ShoppingCart className="h-12 w-12 mb-4 opacity-30" />
                <p className="text-lg font-medium">No sales found</p>
                <p className="text-sm">
                  {search || statusFilter !== 'all' || paymentFilter !== 'all'
                    ? 'Try adjusting your filters'
                    : 'No sales recorded yet'}
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Sale #</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Payment</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sales.map((sale: ImsSale) => {
                        const statusConf = STATUS_CONFIG[sale.status];
                        return (
                          <TableRow key={sale.id}>
                            <TableCell>
                              <button
                                className="font-medium text-primary hover:underline"
                                onClick={() =>
                                  router.push(`/ims/sales/${sale.id}`)
                                }
                              >
                                {sale.sale_number}
                              </button>
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              {format(new Date(sale.created_at), 'dd MMM yyyy, hh:mm a')}
                            </TableCell>
                            <TableCell>
                              {sale.customer_name || '-'}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {CUSTOMER_TYPE_LABELS[sale.customer_type]}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="text-xs">
                                {PAYMENT_LABELS[sale.payment_method]}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-mono font-medium">
                              {formatCurrency(sale.total_amount)}
                            </TableCell>
                            <TableCell>
                              <Badge variant={statusConf.variant}>
                                {statusConf.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  router.push(`/ims/sales/${sale.id}`)
                                }
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                {metadata.totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t">
                    <p className="text-sm text-muted-foreground">
                      Showing {(metadata.page - 1) * metadata.limit + 1} to{' '}
                      {Math.min(metadata.page * metadata.limit, metadata.total)}{' '}
                      of {metadata.total} sales
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page <= 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Previous
                      </Button>
                      <span className="text-sm text-muted-foreground px-2">
                        Page {metadata.page} of {metadata.totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setPage((p) =>
                            Math.min(metadata.totalPages, p + 1)
                          )
                        }
                        disabled={page >= metadata.totalPages}
                      >
                        Next
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
