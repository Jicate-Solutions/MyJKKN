'use client';

import { useState, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { differenceInDays, format } from 'date-fns';
import {
  Package,
  AlertTriangle,
  DollarSign,
} from 'lucide-react';
import { BeatLoader } from 'react-spinners';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  useImsStockBatches,
  useImsExpiringBatches,
} from '@/hooks/ims/use-ims-stock';
import { useImsStoreContext } from '@/hooks/ims/use-ims-store-context';
import type { ImsStockBatch, ImsLocationType } from '@/types/ims';

function getExpiryBadge(expiryDate: string | null): {
  label: string;
  className: string;
  daysLeft: number | null;
} {
  if (!expiryDate) {
    return { label: 'N/A', className: 'bg-gray-100 text-gray-600', daysLeft: null };
  }
  const days = differenceInDays(new Date(expiryDate), new Date());
  if (days < 0) {
    return {
      label: 'Expired',
      className: 'bg-red-100 text-red-800 border-red-200',
      daysLeft: days,
    };
  }
  if (days <= 7) {
    return {
      label: 'Expiring Soon',
      className: 'bg-red-100 text-red-800 border-red-200',
      daysLeft: days,
    };
  }
  if (days <= 30) {
    return {
      label: 'Expiring',
      className: 'bg-orange-100 text-orange-800 border-orange-200',
      daysLeft: days,
    };
  }
  return {
    label: 'Good',
    className: 'bg-green-100 text-green-800 border-green-200',
    daysLeft: days,
  };
}

function BatchTable({ batches }: { batches: ImsStockBatch[] }) {
  if (batches.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No batches found.
      </div>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Item</TableHead>
          <TableHead>Batch #</TableHead>
          <TableHead className="text-right">Quantity</TableHead>
          <TableHead className="text-right">Cost Price</TableHead>
          <TableHead className="text-right">Value</TableHead>
          <TableHead>Expiry Date</TableHead>
          <TableHead className="text-right">Days Left</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {batches.map((batch) => {
          const expiry = getExpiryBadge(batch.expiry_date);
          return (
            <TableRow key={batch.id}>
              <TableCell>
                <div className="font-medium">{batch.item?.name ?? '—'}</div>
                <div className="text-sm text-muted-foreground">
                  {batch.item?.code ?? ''}
                </div>
              </TableCell>
              <TableCell>{batch.batch_number ?? '—'}</TableCell>
              <TableCell className="text-right">{batch.quantity}</TableCell>
              <TableCell className="text-right">
                {batch.cost_price.toLocaleString('en-IN', {
                  style: 'currency',
                  currency: 'INR',
                  maximumFractionDigits: 2,
                })}
              </TableCell>
              <TableCell className="text-right">
                {batch.total_value.toLocaleString('en-IN', {
                  style: 'currency',
                  currency: 'INR',
                  maximumFractionDigits: 2,
                })}
              </TableCell>
              <TableCell>
                {batch.expiry_date
                  ? format(new Date(batch.expiry_date), 'dd MMM yyyy')
                  : '—'}
              </TableCell>
              <TableCell className="text-right">
                {expiry.daysLeft != null ? expiry.daysLeft : '—'}
              </TableCell>
              <TableCell>
                <Badge variant="outline" className={expiry.className}>
                  {expiry.label}
                </Badge>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export default function BatchesPage() {
  const { storeId, institutionId } = useImsStoreContext();
  const searchParams = useSearchParams();
  const preFilterItem = searchParams.get('item') ?? undefined;

  const [locationFilter, setLocationFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState('all');

  const { data: allBatchData, isLoading: allLoading } = useImsStockBatches({
    item_id: preFilterItem,
    location_type:
      locationFilter !== 'all' ? (locationFilter as ImsLocationType) : undefined,
    store_id: storeId || '',
    institution_id: institutionId,
  });

  const { data: expiringData, isLoading: expiringLoading } =
    useImsExpiringBatches(30, storeId || '', institutionId);

  const allBatches: ImsStockBatch[] = Array.isArray(allBatchData)
    ? allBatchData
    : [];
  const expiringBatches: ImsStockBatch[] = Array.isArray(expiringData)
    ? expiringData
    : [];

  const summaryStats = useMemo(() => {
    const totalBatches = allBatches.length;
    const expiringSoonCount = expiringBatches.length;
    const totalValue = allBatches.reduce(
      (sum, b) => sum + (b.total_value ?? 0),
      0
    );
    return { totalBatches, expiringSoonCount, totalValue };
  }, [allBatches, expiringBatches]);

  const isLoading = activeTab === 'all' ? allLoading : expiringLoading;

  return (
    <ContentLayout title="Stock Batches">
      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total Batches
              </CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {summaryStats.totalBatches}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Expiring Soon (30 days)
              </CardTitle>
              <AlertTriangle className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">
                {summaryStats.expiringSoonCount}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total Value
              </CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {summaryStats.totalValue.toLocaleString('en-IN', {
                  style: 'currency',
                  currency: 'INR',
                  maximumFractionDigits: 0,
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Location Filter */}
        <div className="flex items-center gap-4">
          <Select value={locationFilter} onValueChange={setLocationFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All Locations" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Locations</SelectItem>
              <SelectItem value="central_store">Central Store</SelectItem>
              <SelectItem value="department">Department</SelectItem>
            </SelectContent>
          </Select>
          {preFilterItem && (
            <Badge variant="secondary" className="text-sm">
              Filtered by item
            </Badge>
          )}
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="all">All Batches</TabsTrigger>
            <TabsTrigger value="expiring">Expiring Soon</TabsTrigger>
          </TabsList>

          <TabsContent value="all">
            <Card>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <BeatLoader color="#6366f1" size={12} />
                  </div>
                ) : (
                  <BatchTable batches={allBatches} />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="expiring">
            <Card>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <BeatLoader color="#6366f1" size={12} />
                  </div>
                ) : (
                  <BatchTable batches={expiringBatches} />
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </ContentLayout>
  );
}
