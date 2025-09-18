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
import type { LearnerBillRecord } from '@/types/learner-billing';

// Transform LearnerBillRecord to BillRecord format for UI compatibility
function transformBillRecord(learnerBill: LearnerBillRecord): BillRecord {
  // Map status values to match BillRecord type
  let mappedStatus: 'paid' | 'unpaid' | 'overdue' | 'partially_paid' = 'unpaid';
  switch (learnerBill.status) {
    case 'paid':
      mappedStatus = 'paid';
      break;
    case 'unpaid':
      mappedStatus = 'unpaid';
      break;
    case 'overdue':
      mappedStatus = 'overdue';
      break;
    case 'partially_paid':
      mappedStatus = 'partially_paid';
      break;
    case 'cancelled':
    case 'refunded':
      mappedStatus = 'unpaid'; // Map cancelled/refunded to unpaid
      break;
  }

  return {
    id: learnerBill.id,
    bill_number: `BILL-${learnerBill.id.substring(0, 8).toUpperCase()}`,
    student_id: '', // Not needed for display
    category_id: learnerBill.item_category?.id || '',
    category_name: learnerBill.item_category?.item_category_name || 'Unknown Category',
    description: learnerBill.bill_description,
    base_amount: learnerBill.total_amount || 0,
    additional_charges: learnerBill.tax_amount || 0,
    discount_amount: learnerBill.discounts?.reduce((sum, discount) => sum + (discount.discount_amount || 0), 0) || 0,
    final_amount: learnerBill.final_amount || 0,
    amount_paid: (learnerBill.final_amount || 0) - (learnerBill.balance_amount || 0),
    remaining_amount: learnerBill.balance_amount || 0,
    due_date: learnerBill.due_date,
    status: mappedStatus,
    created_at: learnerBill.created_at,
    updated_at: learnerBill.updated_at
  };
}

interface BillRecord {
  id: string;
  bill_number: string;
  student_id: string;
  category_id: string;
  category_name: string;
  description?: string;
  base_amount: number;
  additional_charges: number;
  discount_amount: number;
  final_amount: number;
  amount_paid: number;
  remaining_amount: number;
  due_date: string;
  status: 'paid' | 'unpaid' | 'overdue' | 'partially_paid';
  created_at: string;
  updated_at: string;
}

interface BillingBillsListProps {
  bills: LearnerBillRecord[];
  loading?: boolean;
  selectedBills: string[];
  onSelectionChange: (billIds: string[]) => void;
}

export function BillingBillsList({
  bills,
  loading = false,
  selectedBills,
  onSelectionChange
}: BillingBillsListProps) {
  // Transform LearnerBillRecord to BillRecord for UI compatibility
  const transformedBills = bills.map(transformBillRecord);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<keyof BillRecord>('created_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [selectedBill, setSelectedBill] = useState<BillRecord | null>(null);
  const [showBillDetails, setShowBillDetails] = useState(false);

  const filteredAndSortedBills = useMemo(() => {
    let filtered = transformedBills;

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
  }, [transformedBills, searchTerm, statusFilter, sortField, sortDirection]);

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
      const bill = transformedBills.find(b => b.id === billId);
      return total + (bill?.remaining_amount || 0);
    }, 0);
  }, [selectedBills, transformedBills]);

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
    <Card className="bg-white shadow-xl border-0 rounded-2xl overflow-hidden">
      <CardHeader className="pb-4 bg-gradient-to-r from-[#0b6d41] to-green-600 text-white">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-white">
            <Receipt className="h-5 w-5 text-white" />
            Bills & Invoices
            <Badge variant="secondary" className="ml-2 bg-white/20 text-white border-white/30">
              {filteredAndSortedBills.length} bills
            </Badge>
          </CardTitle>

          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            {selectedBills.length > 0 && (
              <div className="text-sm text-gray-600 whitespace-nowrap">
                Selected: {selectedBills.length} bills ({formatCurrency(selectedAmount)})
              </div>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 pt-4 border-t border-white/20">
          <div className="relative flex-1">
            <Search className="h-4 w-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Search bills by number, description, or category..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-white/10 border-white/20 text-white placeholder:text-white/70 focus:bg-white focus:text-gray-900 focus:placeholder:text-gray-500 transition-all"
            />
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-40 bg-white/10 border-white/20 text-white focus:bg-white focus:text-gray-900">
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
          <div className="text-center py-12 bg-gradient-to-br from-gray-50 to-blue-50 rounded-xl mx-4 mb-4">
            <Receipt className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-gray-800 mb-2">No Bills Found</h3>
            <p className="text-gray-600 max-w-sm mx-auto">
              {searchTerm || statusFilter !== 'all'
                ? 'No bills match your current filters. Try adjusting your search criteria.'
                : 'No bills have been generated yet. Check back later for updates.'
              }
            </p>
          </div>
        ) : (
          <>
            {/* Mobile Card View */}
            <div className="block sm:hidden space-y-4 p-4">
              {filteredAndSortedBills.map((bill) => {
                const isPayable = bill.status === 'unpaid' || bill.status === 'overdue';
                const isSelected = selectedBills.includes(bill.id);

                return (
                  <Card key={bill.id} className={`transition-all duration-200 hover:shadow-lg ${
                    isSelected ? 'ring-2 ring-blue-500 bg-blue-50' : ''
                  } ${
                    bill.status === 'overdue' ? 'ring-2 ring-red-300 bg-red-50' : ''
                  }`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(bill.status)}
                          <div>
                            <div className="font-semibold text-sm">{bill.bill_number}</div>
                            <div className="text-xs text-gray-500">{formatDate(bill.created_at)}</div>
                          </div>
                        </div>
                        {getStatusBadge(bill.status)}
                      </div>

                      <div className="space-y-2 mb-4">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Category:</span>
                          <span className="font-medium">{bill.category_name}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Due Date:</span>
                          <span className={bill.status === 'overdue' ? 'text-red-600 font-medium' : 'font-medium'}>
                            {formatDate(bill.due_date)}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Amount:</span>
                          <span className="font-bold text-[#0b6d41]">{formatCurrency(bill.final_amount)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Remaining:</span>
                          <span className={`font-bold ${
                            bill.remaining_amount > 0 ? 'text-red-600' : 'text-[#0b6d41]'
                          }`}>
                            {formatCurrency(bill.remaining_amount)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t">
                        <div className="flex items-center gap-2">
                          {isPayable && (
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={(checked) => handleBillSelect(bill.id, checked as boolean)}
                            />
                          )}
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="ghost" size="sm" onClick={() => setSelectedBill(bill)}>
                                <Eye className="h-4 w-4 mr-1" />
                                View
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
                        </div>

                        <div className="text-xs text-gray-500">
                          {isPayable ? 'Action Required' : 'Completed'}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Desktop Table View */}
            <div className="hidden sm:block overflow-x-auto">
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

                          <div className="text-sm text-gray-500">
                            {isPayable ? 'Action Required' : 'Completed'}
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            </div>
          </>
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
        <div className="text-sm text-gray-600">
          Payment will be available in the main application
        </div>
      </div>
    </div>
  );
}