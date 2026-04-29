'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import {
  Building2,
  Search,
  History,
  Info,
} from 'lucide-react';
import { BeatLoader } from 'react-spinners';
import { ContentLayout } from '@/components/layout/content-layout';
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useImsStoreContext } from '@/hooks/ims/use-ims-store-context';
import {
  useImsDepartmentsForSelect,
  useImsDepartmentStock,
  useImsDepartmentSummaries,
  useImsDepartmentItemMovements,
} from '@/hooks/ims/use-ims-departments';
import type { ImsDepartmentStock } from '@/types/ims';

const formatCurrency = (value: number) =>
  value.toLocaleString('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  });

const MOVEMENT_TYPE_BADGE: Record<string, string> = {
  received: 'bg-green-100 text-green-800',
  consumed: 'bg-blue-100 text-blue-800',
  adjusted: 'bg-purple-100 text-purple-800',
};

export default function DepartmentStockPage() {
  const { storeId, institutionId } = useImsStoreContext();

  const [departmentId, setDepartmentId] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ImsDepartmentStock | null>(
    null
  );

  const { data: departmentOptions = [] } =
    useImsDepartmentsForSelect(institutionId);

  const { data: summaries = [], isLoading: summariesLoading } =
    useImsDepartmentSummaries({
      store_id: storeId,
      institution_id: institutionId,
    });

  const { data: stockRows = [], isLoading: stockLoading } =
    useImsDepartmentStock({
      store_id: storeId,
      institution_id: institutionId,
      department_id: departmentId,
      search,
    });

  const { data: movements = [], isLoading: movementsLoading } =
    useImsDepartmentItemMovements(
      selectedItem?.department_id ?? null,
      selectedItem?.item_id ?? null,
      { store_id: storeId, institution_id: institutionId }
    );

  const openHistory = (item: ImsDepartmentStock) => {
    setSelectedItem(item);
    setHistoryDialogOpen(true);
  };

  return (
    <ContentLayout title="Department Stock">
      <div className="space-y-6">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Department Stock Tracking</AlertTitle>
          <AlertDescription>
            Department stock is tracked from stock issues and consumption
            entries. Select a department below to filter its inventory.
          </AlertDescription>
        </Alert>

        {/* Department Summary Cards */}
        {summariesLoading ? (
          <div className="flex items-center justify-center py-8">
            <BeatLoader color="hsl(var(--primary))" size={10} />
          </div>
        ) : summaries.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <Building2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">
                No department stock recorded for this store yet.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {summaries.map((dept) => (
              <Card
                key={dept.department_id}
                className={`cursor-pointer transition-colors hover:border-primary ${
                  departmentId === dept.department_id
                    ? 'border-primary bg-primary/5'
                    : ''
                }`}
                onClick={() =>
                  setDepartmentId(
                    departmentId === dept.department_id
                      ? 'all'
                      : dept.department_id
                  )
                }
              >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    {dept.department_name}
                  </CardTitle>
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-lg font-bold">
                    {dept.total_items} {dept.total_items === 1 ? 'item' : 'items'}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {formatCurrency(dept.total_value)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search items or departments..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={departmentId} onValueChange={setDepartmentId}>
                <SelectTrigger className="w-full md:w-[200px]">
                  <SelectValue placeholder="All Departments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  {departmentOptions.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.department_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Stock Table */}
        <Card>
          <CardContent className="p-0">
            {stockLoading ? (
              <div className="flex items-center justify-center py-12">
                <BeatLoader color="hsl(var(--primary))" size={10} />
              </div>
            ) : stockRows.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                No department stock found. Try a different department or clear
                the search.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead className="text-right">Total Issued</TableHead>
                    <TableHead className="text-right">Total Consumed</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead className="text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stockRows.map((row) => (
                    <TableRow key={`${row.department_id}-${row.item_id}`}>
                      <TableCell className="font-medium">
                        {row.item_name}
                      </TableCell>
                      <TableCell>{row.department_name}</TableCell>
                      <TableCell className="text-right">
                        {row.total_issued}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.total_consumed}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {row.balance}
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openHistory(row)}
                        >
                          <History className="h-4 w-4 mr-1" />
                          View History
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* History Dialog */}
        <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                Stock Movement History
                {selectedItem && (
                  <span className="block text-sm font-normal text-muted-foreground mt-1">
                    {selectedItem.item_name} - {selectedItem.department_name}
                  </span>
                )}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {movementsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <BeatLoader color="hsl(var(--primary))" size={10} />
                </div>
              ) : movements.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">
                  No movements recorded for this item.
                </p>
              ) : (
                movements.map((mov) => (
                  <div
                    key={mov.id}
                    className="flex items-start justify-between border rounded-lg p-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={
                            MOVEMENT_TYPE_BADGE[mov.type] ??
                            'bg-gray-100 text-gray-800'
                          }
                        >
                          {mov.type}
                        </Badge>
                        <span className="font-medium">
                          {mov.type === 'consumed'
                            ? `-${mov.quantity}`
                            : `+${mov.quantity}`}
                        </span>
                      </div>
                      {mov.notes && (
                        <p className="text-sm text-muted-foreground">
                          {mov.notes}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        by {mov.created_by?.full_name ?? 'Unknown'}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(mov.created_at), 'dd MMM yyyy HH:mm')}
                    </span>
                  </div>
                ))
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </ContentLayout>
  );
}
