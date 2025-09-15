'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import {
  Receipt,
  Search,
  Filter,
  Eye,
  CreditCard,
  Calendar,
  DollarSign,
  Clock,
  AlertTriangle,
  CheckCircle,
  FileText,
  Download,
  ArrowUpDown,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { BillRecord } from '@/types/learner-billing';

interface BillingBillsListProps {
  bills: BillRecord[];
  loading?: boolean;
  onPayBill?: (amount?: number) => void;
  selectedBills: string[];
  onSelectionChange: (billIds: string[]) => void;
}

export function BillingBillsList({
  bills,
  loading = false,
  onPayBill,
  selectedBills,
  onSelectionChange
}: BillingBillsListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<keyof BillRecord>('created_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [selectedBill, setSelectedBill] = useState<BillRecord | null>(null);
  const [showBillDetails, setShowBillDetails] = useState(false);

  const filteredAndSortedBills = useMemo(() => {
    let filtered = bills;

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(bill =>
        bill.bill_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        bill.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        bill.category_name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Filter by status
    if (statusFilter !== 'all') {
      filtered = filtered.filter(bill => bill.status === statusFilter);
    }

    // Sort bills
    filtered.sort((a, b) => {
      const aValue = a[sortField];
      const bValue = b[sortField];

      if (aValue && bValue) {
        if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      }
      return 0;
    });

    return filtered;
  }, [bills, searchTerm, statusFilter, sortField, sortDirection]);

  const handleSort = (field: keyof BillRecord) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const payableBills = filteredAndSortedBills
        .filter(bill => bill.status === 'unpaid' || bill.status === 'overdue')
        .map(bill => bill.id);
      onSelectionChange([...new Set([...selectedBills, ...payableBills])]);
    } else {
      onSelectionChange([]);
    }
  };

  const handleBillSelect = (billId: string, checked: boolean) => {
    if (checked) {
      onSelectionChange([...selectedBills, billId]);
    } else {
      onSelectionChange(selectedBills.filter(id => id !== billId));
    }
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      paid: 'default',
      unpaid: 'secondary',
      overdue: 'destructive',
      partially_paid: 'outline'
    };

    const colors = {
      paid: 'bg-green-100 text-[#0b6d41]',
      unpaid: 'bg-[#ffde59]/30 text-black',
      overdue: 'bg-red-100 text-red-800',
      partially_paid: 'bg-gray-100 text-gray-800'
    };

    return (
      <Badge
        variant={variants[status as keyof typeof variants] as any}
        className={colors[status as keyof typeof colors]}
      >
        {status.replace('_', ' ').toUpperCase()}
      </Badge>
    );
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'paid':
        return <CheckCircle className="h-4 w-4 text-[#0b6d41]" />;
      case 'unpaid':
        return <Clock className="h-4 w-4 text-yellow-600" />;
      case 'overdue':
        return <AlertTriangle className="h-4 w-4 text-red-600" />;
      case 'partially_paid':
        return <DollarSign className="h-4 w-4 text-gray-600" />;
      default:
        return <Receipt className="h-4 w-4 text-gray-600" />;
    }
  };

  const selectedAmount = useMemo(() => {
    return selectedBills.reduce((total, billId) => {
      const bill = bills.find(b => b.id === billId);
      return total + (bill?.remaining_amount || 0);
    }, 0);
  }, [selectedBills, bills]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Bills & Invoices
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="h-16 bg-gray-200 rounded"></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-[#0b6d41]" />
            Bills & Invoices
            <Badge variant="outline" className="ml-2">
              {filteredAndSortedBills.length} bills
            </Badge>
          </CardTitle>

          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            {selectedBills.length > 0 && (
              <Button
                onClick={() => onPayBill?.(selectedAmount)}
                className="whitespace-nowrap"
              >
                <CreditCard className="h-4 w-4 mr-2" />
                Pay Selected ({formatCurrency(selectedAmount)})
              </Button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 pt-4 border-t">
          <div className="relative flex-1">
            <Search className="h-4 w-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Search bills by number, description, or category..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="unpaid">Unpaid</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
              <SelectItem value="partially_paid">Partially Paid</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {filteredAndSortedBills.length === 0 ? (
          <div className="text-center py-12">
            <Receipt className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Bills Found</h3>
            <p className="text-gray-600">
              {searchTerm || statusFilter !== 'all'
                ? 'No bills match your current filters.'
                : 'No bills have been generated yet.'
              }
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={selectedBills.length > 0}
                      onCheckedChange={handleSelectAll}
                    />
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => handleSort('bill_number')}
                  >
                    <div className="flex items-center gap-2">
                      Bill Number
                      <ArrowUpDown className="h-4 w-4" />
                    </div>
                  </TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => handleSort('due_date')}
                  >
                    <div className="flex items-center gap-2">
                      Due Date
                      <ArrowUpDown className="h-4 w-4" />
                    </div>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-gray-50 text-right"
                    onClick={() => handleSort('final_amount')}
                  >
                    <div className="flex items-center gap-2 justify-end">
                      Amount
                      <ArrowUpDown className="h-4 w-4" />
                    </div>
                  </TableHead>
                  <TableHead className="text-right">Remaining</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAndSortedBills.map((bill) => {
                  const isPayable = bill.status === 'unpaid' || bill.status === 'overdue';
                  const isSelected = selectedBills.includes(bill.id);

                  return (
                    <TableRow
                      key={bill.id}
                      className={`hover:bg-gray-50 ${isSelected ? 'bg-blue-50' : ''}`}
                    >
                      <TableCell>
                        {isPayable && (
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={(checked) => handleBillSelect(bill.id, checked as boolean)}
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getStatusIcon(bill.status)}
                          <div>
                            <div className="font-medium">{bill.bill_number}</div>
                            <div className="text-sm text-gray-600">
                              {formatDate(bill.created_at)}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{bill.category_name}</div>
                          {bill.description && (
                            <div className="text-sm text-gray-600 truncate max-w-[200px]">
                              {bill.description}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-gray-400" />
                          <span className={bill.status === 'overdue' ? 'text-red-600 font-medium' : ''}>
                            {formatDate(bill.due_date)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="font-medium">
                          {formatCurrency(bill.final_amount)}
                        </div>
                        {bill.discount_amount > 0 && (
                          <div className="text-sm text-[#0b6d41]">
                            -{formatCurrency(bill.discount_amount)} discount
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className={`font-medium ${
                          bill.remaining_amount > 0 ? 'text-red-600' : 'text-[#0b6d41]'
                        }`}>
                          {formatCurrency(bill.remaining_amount)}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {getStatusBadge(bill.status)}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center gap-2 justify-center">
                          <Dialog open={showBillDetails && selectedBill?.id === bill.id} onOpenChange={setShowBillDetails}>
                            <DialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedBill(bill)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl">
                              <DialogHeader>
                                <DialogTitle>Bill Details - {bill.bill_number}</DialogTitle>
                              </DialogHeader>
                              {selectedBill && (
                                <BillDetailsView bill={selectedBill} />
                              )}
                            </DialogContent>
                          </Dialog>

                          {isPayable && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => onPayBill?.(bill.remaining_amount)}
                            >
                              <CreditCard className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BillDetailsView({ bill }: { bill: BillRecord }) {
  return (
    <div className="space-y-6">
      {/* Bill Header */}
      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
        <div>
          <h3 className="text-lg font-semibold">{bill.bill_number}</h3>
          <p className="text-gray-600">{bill.category_name}</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-[#0b6d41]">
            {formatCurrency(bill.final_amount)}
          </div>
          <Badge variant="outline">{bill.status.replace('_', ' ').toUpperCase()}</Badge>
        </div>
      </div>

      {/* Bill Details Grid */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium text-gray-600">Bill Date</label>
          <p className="font-medium">{formatDate(bill.created_at)}</p>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-600">Due Date</label>
          <p className="font-medium">{formatDate(bill.due_date)}</p>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-600">Base Amount</label>
          <p className="font-medium">{formatCurrency(bill.base_amount)}</p>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-600">Additional Charges</label>
          <p className="font-medium">{formatCurrency(bill.additional_charges)}</p>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-600">Discount</label>
          <p className="font-medium text-[#0b6d41]">-{formatCurrency(bill.discount_amount)}</p>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-600">Final Amount</label>
          <p className="font-medium text-[#0b6d41]">{formatCurrency(bill.final_amount)}</p>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-600">Amount Paid</label>
          <p className="font-medium text-[#0b6d41]">{formatCurrency(bill.amount_paid)}</p>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-600">Remaining</label>
          <p className={`font-medium ${bill.remaining_amount > 0 ? 'text-red-600' : 'text-[#0b6d41]'}`}>
            {formatCurrency(bill.remaining_amount)}
          </p>
        </div>
      </div>

      {/* Description */}
      {bill.description && (
        <div>
          <label className="text-sm font-medium text-gray-600">Description</label>
          <p className="mt-1 p-3 bg-gray-50 rounded-lg">{bill.description}</p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2 pt-4 border-t">
        <Button variant="outline" className="flex-1">
          <Download className="h-4 w-4 mr-2" />
          Download PDF
        </Button>
        {(bill.status === 'unpaid' || bill.status === 'overdue') && (
          <Button className="flex-1">
            <CreditCard className="h-4 w-4 mr-2" />
            Pay Now
          </Button>
        )}
      </div>
    </div>
  );
}