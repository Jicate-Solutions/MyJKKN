'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Package,
  AlertTriangle,
  DollarSign,
  Search,
  Eye,
} from 'lucide-react';
import { BeatLoader } from 'react-spinners';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
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
import { useImsStockSummary } from '@/hooks/ims/use-ims-stock';
import { useImsCategoriesForSelect } from '@/hooks/ims/use-ims-inventory';
import { useImsStoreContext } from '@/hooks/ims/use-ims-store-context';
import { getStockStatus } from '@/types/ims/stock';
import type { ImsStockSummary, ImsStockStatus } from '@/types/ims';

const STATUS_BADGE_MAP: Record<
  ImsStockStatus,
  { label: string; className: string }
> = {
  out_of_stock: {
    label: 'Out of Stock',
    className: 'bg-red-100 text-red-800 border-red-200',
  },
  low_stock: {
    label: 'Low Stock',
    className: 'bg-orange-100 text-orange-800 border-orange-200',
  },
  overstocked: {
    label: 'Overstocked',
    className: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  in_stock: {
    label: 'In Stock',
    className: 'bg-green-100 text-green-800 border-green-200',
  },
};

export default function StockLevelsPage() {
  const { storeId, institutionId } = useImsStoreContext();

  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string>('all');
  const [lowStockOnly, setLowStockOnly] = useState(false);

  const { data: stockData, isLoading } = useImsStockSummary({
    search: search || undefined,
    category_id: categoryId !== 'all' ? categoryId : undefined,
    low_stock_only: lowStockOnly || undefined,
    store_id: storeId || '',
    institution_id: institutionId,
  });

  const { data: categories } = useImsCategoriesForSelect(storeId || undefined);

  const items: ImsStockSummary[] = Array.isArray(stockData) ? stockData : [];

  const summaryStats = useMemo(() => {
    const totalItems = items.length;
    const lowStockCount = items.filter((item) => {
      const reorder = item.item?.reorder_level ?? 0;
      return item.current_quantity > 0 && item.current_quantity <= reorder;
    }).length;
    const totalValue = items.reduce((sum, item) => sum + (item.total_value ?? 0), 0);
    return { totalItems, lowStockCount, totalValue };
  }, [items]);

  return (
    <ContentLayout title="Stock Levels">
      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Items</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summaryStats.totalItems}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Low Stock Count</CardTitle>
              <AlertTriangle className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">
                {summaryStats.lowStockCount}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Stock Value</CardTitle>
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

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search items..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className="w-full md:w-[200px]">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {(categories ?? []).map((cat: { id: string; name: string }) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center space-x-2">
                <Switch
                  id="low-stock"
                  checked={lowStockOnly}
                  onCheckedChange={setLowStockOnly}
                />
                <Label htmlFor="low-stock" className="text-sm whitespace-nowrap">
                  Low Stock Only
                </Label>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <BeatLoader color="#6366f1" size={12} />
              </div>
            ) : items.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                No stock items found.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item / Code</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Quantity / Unit</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead className="text-right">Reorder Level</TableHead>
                    <TableHead className="text-right">Max Level</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((row) => {
                    const reorder = row.item?.reorder_level ?? 0;
                    const maxLevel = row.item?.max_stock_level ?? 0;
                    const status = getStockStatus(row.current_quantity, reorder, maxLevel);
                    const badge = STATUS_BADGE_MAP[status];
                    return (
                      <TableRow key={row.id}>
                        <TableCell>
                          <div className="font-medium">{row.item?.name ?? '—'}</div>
                          <div className="text-sm text-muted-foreground">
                            {row.item?.code ?? '—'}
                          </div>
                        </TableCell>
                        <TableCell>{row.item?.category?.name ?? '—'}</TableCell>
                        <TableCell className="text-right">
                          {row.current_quantity}{' '}
                          <span className="text-muted-foreground text-sm">
                            {row.item?.base_unit?.abbreviation ?? ''}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          {row.total_value.toLocaleString('en-IN', {
                            style: 'currency',
                            currency: 'INR',
                            maximumFractionDigits: 0,
                          })}
                        </TableCell>
                        <TableCell className="text-right">{reorder}</TableCell>
                        <TableCell className="text-right">{maxLevel}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={badge.className}>
                            {badge.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/ims/stock/batches?item=${row.item_id}`}>
                              <Eye className="h-4 w-4 mr-1" />
                              View Batches
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
