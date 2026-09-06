'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import {
  Building2,
  Search,
  History,
  Info,
  Plus,
  MinusCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { BeatLoader } from 'react-spinners';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { useImsStoreContext } from '@/hooks/ims/use-ims-store-context';
import {
  useImsDepartmentsForSelect,
  useImsDepartmentStock,
  useImsDepartmentSummaries,
  useImsDepartmentItemMovements,
  useImsIssuableItems,
  useIssueItemToDepartment,
  useRecordDepartmentConsumption,
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

interface IssueFormData {
  department_id: string;
  item_id: string;
  quantity: number;
  notes: string;
}

const emptyIssueForm: IssueFormData = {
  department_id: '',
  item_id: '',
  quantity: 0,
  notes: '',
};

export default function DepartmentStockPage() {
  const { storeId, institutionId } = useImsStoreContext();
  const { profile } = useAuth();
  const { canAccess, isSuperAdmin } = usePermissions();

  // Issuing to a department and recording usage both mutate stock levels, so
  // they need the same permission as Stock Adjustments. Gated at the action
  // level rather than the page level so read-only viewers keep their access.
  const canModifyStock = isSuperAdmin || canAccess('ims.stock', 'adjust');

  const [departmentId, setDepartmentId] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ImsDepartmentStock | null>(
    null
  );

  // Add Item (direct store → department issue)
  const [issueDialogOpen, setIssueDialogOpen] = useState(false);
  const [issueForm, setIssueForm] = useState<IssueFormData>(emptyIssueForm);

  // Record Usage (department consumption)
  const [usageDialogOpen, setUsageDialogOpen] = useState(false);
  const [usageRow, setUsageRow] = useState<ImsDepartmentStock | null>(null);
  const [usageQuantity, setUsageQuantity] = useState(0);
  const [usageNotes, setUsageNotes] = useState('');

  const { data: departmentOptions = [] } =
    useImsDepartmentsForSelect(institutionId);

  const { data: issuableItems = [] } = useImsIssuableItems({
    store_id: storeId,
    institution_id: institutionId,
  });

  const issueItem = useIssueItemToDepartment();
  const recordUsage = useRecordDepartmentConsumption();

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

  const openUsage = (row: ImsDepartmentStock) => {
    setUsageRow(row);
    setUsageQuantity(0);
    setUsageNotes('');
    setUsageDialogOpen(true);
  };

  const selectedIssueItem = issuableItems.find(
    (i) => i.item_id === issueForm.item_id
  );

  const handleIssueSubmit = async () => {
    if (!issueForm.department_id || !issueForm.item_id) {
      toast.error('Please select a department and an item');
      return;
    }
    if (issueForm.quantity <= 0) {
      toast.error('Please enter a valid quantity');
      return;
    }
    try {
      await issueItem.mutateAsync({
        data: {
          department_id: issueForm.department_id,
          item_id: issueForm.item_id,
          quantity: issueForm.quantity,
          notes: issueForm.notes,
          store_id: storeId,
          institution_id: institutionId,
        },
        userId: profile?.id || '',
      });
      toast.success('Item issued to department');
      setIssueDialogOpen(false);
      setIssueForm(emptyIssueForm);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to issue item'
      );
    }
  };

  const handleUsageSubmit = async () => {
    if (!usageRow) return;
    if (usageQuantity <= 0) {
      toast.error('Please enter a valid quantity');
      return;
    }
    try {
      await recordUsage.mutateAsync({
        data: {
          department_id: usageRow.department_id,
          item_id: usageRow.item_id,
          quantity: usageQuantity,
          notes: usageNotes,
          store_id: storeId,
          institution_id: institutionId,
        },
        userId: profile?.id || '',
      });
      toast.success('Usage recorded');
      setUsageDialogOpen(false);
      setUsageRow(null);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to record usage'
      );
    }
  };

  return (
    <ContentLayout title="Department Stock">
      <div className="space-y-6">
        {canModifyStock && (
          <div className="flex justify-end">
            <Button onClick={() => setIssueDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Item
            </Button>
          </div>
        )}

        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Department Stock Tracking</AlertTitle>
          <AlertDescription>
            Department stock is tracked from stock issues and consumption
            entries. Adding an item here issues it straight from store stock,
            without needing an indent. Select a department below to filter its
            inventory.
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
                        <div className="flex items-center justify-center gap-1">
                          {canModifyStock && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={Number(row.balance) <= 0}
                              onClick={() => openUsage(row)}
                            >
                              <MinusCircle className="h-4 w-4 mr-1" />
                              Record Usage
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openHistory(row)}
                          >
                            <History className="h-4 w-4 mr-1" />
                            View History
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Add Item Dialog — direct store → department issue */}
        <Dialog open={issueDialogOpen} onOpenChange={setIssueDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add Item to Department</DialogTitle>
              <DialogDescription>
                Issues the item straight from store stock. Store quantity goes
                down and the department&apos;s balance goes up.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="issue_department">Department</Label>
                <Select
                  value={issueForm.department_id}
                  onValueChange={(v) =>
                    setIssueForm((p) => ({ ...p, department_id: v }))
                  }
                >
                  <SelectTrigger id="issue_department">
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    {departmentOptions.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.department_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="issue_item">Item</Label>
                <Select
                  value={issueForm.item_id}
                  onValueChange={(v) =>
                    setIssueForm((p) => ({ ...p, item_id: v }))
                  }
                >
                  <SelectTrigger id="issue_item">
                    <SelectValue placeholder="Select item" />
                  </SelectTrigger>
                  <SelectContent>
                    {issuableItems.length === 0 ? (
                      <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                        No items with stock available in this store.
                      </div>
                    ) : (
                      issuableItems.map((item) => (
                        <SelectItem key={item.item_id} value={item.item_id}>
                          {item.item_name} ({item.item_code})
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {selectedIssueItem && (
                  <p className="text-sm text-muted-foreground">
                    Available in store: {selectedIssueItem.available_quantity}
                    {selectedIssueItem.unit_abbreviation
                      ? ` ${selectedIssueItem.unit_abbreviation}`
                      : ''}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="issue_quantity">Quantity</Label>
                <Input
                  id="issue_quantity"
                  type="number"
                  min={0}
                  step="0.01"
                  max={selectedIssueItem?.available_quantity}
                  value={issueForm.quantity}
                  onChange={(e) =>
                    setIssueForm((p) => ({
                      ...p,
                      quantity: parseFloat(e.target.value) || 0,
                    }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="issue_notes">Notes (optional)</Label>
                <Textarea
                  id="issue_notes"
                  placeholder="e.g. Issued for lab practical"
                  value={issueForm.notes}
                  onChange={(e) =>
                    setIssueForm((p) => ({ ...p, notes: e.target.value }))
                  }
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIssueDialogOpen(false)}
                disabled={issueItem.isPending}
              >
                Cancel
              </Button>
              <Button onClick={handleIssueSubmit} disabled={issueItem.isPending}>
                {issueItem.isPending ? 'Adding...' : 'Add Item'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Record Usage Dialog — department consumption */}
        <Dialog open={usageDialogOpen} onOpenChange={setUsageDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Record Usage</DialogTitle>
              <DialogDescription>
                {usageRow && (
                  <>
                    {usageRow.item_name} — {usageRow.department_name}. Current
                    balance: {usageRow.balance}
                  </>
                )}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="usage_quantity">Quantity Used</Label>
                <Input
                  id="usage_quantity"
                  type="number"
                  min={0}
                  step="0.01"
                  max={usageRow?.balance}
                  value={usageQuantity}
                  onChange={(e) =>
                    setUsageQuantity(parseFloat(e.target.value) || 0)
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="usage_notes">Notes (optional)</Label>
                <Textarea
                  id="usage_notes"
                  placeholder="e.g. Used in second-year practicals"
                  value={usageNotes}
                  onChange={(e) => setUsageNotes(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setUsageDialogOpen(false)}
                disabled={recordUsage.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={handleUsageSubmit}
                disabled={recordUsage.isPending}
              >
                {recordUsage.isPending ? 'Recording...' : 'Record Usage'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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
