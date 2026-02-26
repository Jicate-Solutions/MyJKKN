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
import { useAuth } from '@/hooks/use-auth';
import type {
  ImsDepartmentStock,
  ImsDepartmentStockMovement,
} from '@/types/ims';

// Placeholder department data -- in production this would come from a hook
// e.g. useImsDepartmentStock(filters) backed by aggregation of stock_issues
const PLACEHOLDER_DEPARTMENTS = [
  { id: 'dept-1', name: 'Science Lab', totalItems: 42, totalValue: 125000 },
  { id: 'dept-2', name: 'Computer Lab', totalItems: 28, totalValue: 89000 },
  { id: 'dept-3', name: 'Library', totalItems: 15, totalValue: 34000 },
  { id: 'dept-4', name: 'Sports', totalItems: 21, totalValue: 45000 },
];

const PLACEHOLDER_STOCK: ImsDepartmentStock[] = [
  {
    department_id: 'dept-1',
    department_name: 'Science Lab',
    item_id: 'item-1',
    item_name: 'Test Tubes',
    total_issued: 200,
    total_consumed: 150,
    total_returned: 10,
    balance: 60,
  },
  {
    department_id: 'dept-1',
    department_name: 'Science Lab',
    item_id: 'item-2',
    item_name: 'Beakers 250ml',
    total_issued: 50,
    total_consumed: 30,
    total_returned: 5,
    balance: 25,
  },
  {
    department_id: 'dept-2',
    department_name: 'Computer Lab',
    item_id: 'item-3',
    item_name: 'Printer Paper A4',
    total_issued: 100,
    total_consumed: 80,
    total_returned: 0,
    balance: 20,
  },
];

const PLACEHOLDER_MOVEMENTS: ImsDepartmentStockMovement[] = [
  {
    id: 'mov-1',
    type: 'received',
    quantity: 50,
    notes: 'Initial issue from central store',
    created_at: '2026-02-10T09:00:00Z',
    created_by: { full_name: 'Admin User' },
  },
  {
    id: 'mov-2',
    type: 'consumed',
    quantity: 20,
    notes: 'Used for practical class',
    created_at: '2026-02-12T14:30:00Z',
    created_by: { full_name: 'Lab Assistant' },
  },
  {
    id: 'mov-3',
    type: 'returned',
    quantity: 5,
    notes: 'Surplus return',
    created_at: '2026-02-15T11:00:00Z',
    created_by: { full_name: 'Lab Assistant' },
  },
];

const MOVEMENT_TYPE_BADGE: Record<string, string> = {
  received: 'bg-green-100 text-green-800',
  consumed: 'bg-blue-100 text-blue-800',
  returned: 'bg-orange-100 text-orange-800',
  adjusted: 'bg-purple-100 text-purple-800',
};

export default function DepartmentStockPage() {
  const { profile } = useAuth();

  const [departmentId, setDepartmentId] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ImsDepartmentStock | null>(null);

  // Filter stock data based on department and search
  const filteredStock = PLACEHOLDER_STOCK.filter((row) => {
    if (departmentId !== 'all' && row.department_id !== departmentId) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        row.item_name.toLowerCase().includes(q) ||
        row.department_name.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const openHistory = (item: ImsDepartmentStock) => {
    setSelectedItem(item);
    setHistoryDialogOpen(true);
  };

  return (
    <ContentLayout title="Department Stock">
      <div className="space-y-6">
        {/* Info Card */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Department Stock Tracking</AlertTitle>
          <AlertDescription>
            Department stock is tracked from stock issues. Select a department to
            view its inventory. Data shown below is representative of the stock
            movement workflow.
          </AlertDescription>
        </Alert>

        {/* Department Summary Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PLACEHOLDER_DEPARTMENTS.map((dept) => (
            <Card
              key={dept.id}
              className={`cursor-pointer transition-colors hover:border-primary ${
                departmentId === dept.id ? 'border-primary bg-primary/5' : ''
              }`}
              onClick={() =>
                setDepartmentId(departmentId === dept.id ? 'all' : dept.id)
              }
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {dept.name}
                </CardTitle>
                <Building2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-lg font-bold">{dept.totalItems} items</div>
                <p className="text-sm text-muted-foreground">
                  {dept.totalValue.toLocaleString('en-IN', {
                    style: 'currency',
                    currency: 'INR',
                    maximumFractionDigits: 0,
                  })}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

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
                  {PLACEHOLDER_DEPARTMENTS.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
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
            {filteredStock.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                No department stock found. Select a department or adjust filters.
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
                  {filteredStock.map((row) => (
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
              {PLACEHOLDER_MOVEMENTS.map((mov) => (
                <div
                  key={mov.id}
                  className="flex items-start justify-between border rounded-lg p-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={
                          MOVEMENT_TYPE_BADGE[mov.type] ?? 'bg-gray-100 text-gray-800'
                        }
                      >
                        {mov.type}
                      </Badge>
                      <span className="font-medium">
                        {mov.type === 'consumed' || mov.type === 'returned'
                          ? `-${mov.quantity}`
                          : `+${mov.quantity}`}
                      </span>
                    </div>
                    {mov.notes && (
                      <p className="text-sm text-muted-foreground">{mov.notes}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      by {mov.created_by?.full_name ?? 'Unknown'}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {format(new Date(mov.created_at), 'dd MMM yyyy HH:mm')}
                  </span>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </ContentLayout>
  );
}
