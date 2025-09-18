'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  CreditCard,
  Search,
  Download,
  Eye,
  Receipt,
  CheckCircle,
  Clock,
  AlertCircle,
  Calendar,
  ArrowUpDown,
  Filter,
  Banknote,
  Building,
  Smartphone
} from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { LearnerPaymentRecord } from '@/types/learner-billing';

// Transform LearnerPaymentRecord to PaymentRecord format for UI compatibility
function transformPaymentRecord(learnerPayment: LearnerPaymentRecord): PaymentRecord {
  return {
    id: learnerPayment.id,
    receipt_number: learnerPayment.receipt_number,
    student_id: '', // Not needed for display
    payment_date: learnerPayment.receipt_date,
    payment_amount: learnerPayment.payment_amount,
    payment_mode: learnerPayment.payment_mode,
    transaction_id: learnerPayment.payment_reference_number,
    reference_number: learnerPayment.payment_reference_number,
    bank_name: undefined,
    gateway_name: undefined,
    gateway_response: undefined,
    charges: 0,
    status: 'completed', // Assume completed if in payment history
    remarks: learnerPayment.payment_remarks,
    created_at: learnerPayment.created_at,
    updated_at: learnerPayment.created_at
  };
}

interface PaymentRecord {
  id: string;
  receipt_number: string;
  student_id: string;
  payment_date: string;
  payment_amount: number;
  payment_mode: 'cash' | 'online' | 'bank_transfer' | 'dd' | 'cheque';
  transaction_id?: string;
  reference_number?: string;
  bank_name?: string;
  gateway_name?: string;
  gateway_response?: any;
  charges?: number;
  status: 'completed' | 'pending' | 'failed' | 'refunded';
  remarks?: string;
  created_at: string;
  updated_at: string;
}

interface BillingPaymentHistoryProps {
  payments: LearnerPaymentRecord[];
  loading?: boolean;
}

export function BillingPaymentHistory({
  payments,
  loading = false
}: BillingPaymentHistoryProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [paymentModeFilter, setPaymentModeFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<keyof PaymentRecord>('payment_date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [selectedPayment, setSelectedPayment] = useState<PaymentRecord | null>(null);
  const [showPaymentDetails, setShowPaymentDetails] = useState(false);

  // Transform LearnerPaymentRecord to PaymentRecord
  const transformedPayments = useMemo(() => {
    return payments.map(transformPaymentRecord);
  }, [payments]);

  const filteredAndSortedPayments = useMemo(() => {
    let filtered = transformedPayments;

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(payment =>
        payment.receipt_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        payment.transaction_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        payment.reference_number?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Filter by status
    if (statusFilter !== 'all') {
      filtered = filtered.filter(payment => payment.status === statusFilter);
    }

    // Filter by payment mode
    if (paymentModeFilter !== 'all') {
      filtered = filtered.filter(payment => payment.payment_mode === paymentModeFilter);
    }

    // Sort payments
    filtered.sort((a, b) => {
      const aValue = a[sortField];
      const bValue = b[sortField];

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [transformedPayments, searchTerm, statusFilter, paymentModeFilter, sortField, sortDirection]);

  const handleSort = (field: keyof PaymentRecord) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      completed: 'default',
      pending: 'secondary',
      failed: 'destructive',
      refunded: 'outline'
    };

    const colors = {
      completed: 'bg-green-100 text-[#0b6d41]',
      pending: 'bg-[#ffde59]/30 text-black',
      failed: 'bg-red-100 text-red-800',
      refunded: 'bg-gray-100 text-gray-800'
    };

    return (
      <Badge
        variant={variants[status as keyof typeof variants] as any}
        className={colors[status as keyof typeof colors]}
      >
        {status.toUpperCase()}
      </Badge>
    );
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-[#0b6d41]" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-600" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      case 'refunded':
        return <Receipt className="h-4 w-4 text-gray-600" />;
      default:
        return <CreditCard className="h-4 w-4 text-gray-600" />;
    }
  };

  const getPaymentModeIcon = (mode: string) => {
    switch (mode.toLowerCase()) {
      case 'cash':
        return <Banknote className="h-4 w-4 text-[#0b6d41]" />;
      case 'online':
        return <Smartphone className="h-4 w-4 text-[#0b6d41]" />;
      case 'bank_transfer':
        return <Building className="h-4 w-4 text-gray-600" />;
      case 'dd':
        return <Receipt className="h-4 w-4 text-yellow-600" />;
      case 'cheque':
        return <Receipt className="h-4 w-4 text-gray-600" />;
      default:
        return <CreditCard className="h-4 w-4 text-gray-600" />;
    }
  };

  const totalPaid = useMemo(() => {
    return filteredAndSortedPayments
      .filter(payment => payment.status === 'completed')
      .reduce((total, payment) => total + payment.payment_amount, 0);
  }, [filteredAndSortedPayments]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Payment History
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
            <CreditCard className="h-5 w-5 text-[#0b6d41]" />
            Payment History
            <Badge variant="outline" className="ml-2">
              {filteredAndSortedPayments.length} payments
            </Badge>
          </CardTitle>

          <div className="flex items-center gap-2">
            <div className="text-sm text-gray-600">
              Total Paid: <span className="font-semibold text-[#0b6d41]">{formatCurrency(totalPaid)}</span>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col lg:flex-row gap-4 pt-4 border-t">
          <div className="relative flex-1">
            <Search className="h-4 w-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Search by receipt number, transaction ID, or reference..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          <div className="flex gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="refunded">Refunded</SelectItem>
              </SelectContent>
            </Select>

            <Select value={paymentModeFilter} onValueChange={setPaymentModeFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Payment Mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Methods</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="online">Online</SelectItem>
                <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                <SelectItem value="dd">Demand Draft</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {filteredAndSortedPayments.length === 0 ? (
          <div className="text-center py-12">
            <CreditCard className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Payments Found</h3>
            <p className="text-gray-600">
              {searchTerm || statusFilter !== 'all' || paymentModeFilter !== 'all'
                ? 'No payments match your current filters.'
                : 'No payments have been made yet.'
              }
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => handleSort('receipt_number')}
                  >
                    <div className="flex items-center gap-2">
                      Receipt
                      <ArrowUpDown className="h-4 w-4" />
                    </div>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => handleSort('payment_date')}
                  >
                    <div className="flex items-center gap-2">
                      Date
                      <ArrowUpDown className="h-4 w-4" />
                    </div>
                  </TableHead>
                  <TableHead>Payment Method</TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-gray-50 text-right"
                    onClick={() => handleSort('payment_amount')}
                  >
                    <div className="flex items-center gap-2 justify-end">
                      Amount
                      <ArrowUpDown className="h-4 w-4" />
                    </div>
                  </TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAndSortedPayments.map((payment) => (
                  <TableRow key={payment.id} className="hover:bg-gray-50">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getStatusIcon(payment.status)}
                        <div>
                          <div className="font-medium">{payment.receipt_number}</div>
                          {payment.transaction_id && (
                            <div className="text-sm text-gray-600">
                              TXN: {payment.transaction_id}
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-gray-400" />
                        <div>
                          <div>{formatDate(payment.payment_date)}</div>
                          <div className="text-sm text-gray-600">
                            {new Date(payment.payment_date).toLocaleTimeString()}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getPaymentModeIcon(payment.payment_mode)}
                        <span className="capitalize">
                          {payment.payment_mode.replace('_', ' ')}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="font-medium text-[#0b6d41]">
                        {formatCurrency(payment.payment_amount)}
                      </div>
                      {payment.charges && payment.charges > 0 && (
                        <div className="text-sm text-gray-600">
                          +{formatCurrency(payment.charges)} fees
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {getStatusBadge(payment.status)}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {payment.reference_number && (
                          <div>Ref: {payment.reference_number}</div>
                        )}
                        {payment.bank_name && (
                          <div className="text-gray-600">{payment.bank_name}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center gap-2 justify-center">
                        <Dialog open={showPaymentDetails && selectedPayment?.id === payment.id} onOpenChange={setShowPaymentDetails}>
                          <DialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedPayment(payment)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-2xl">
                            <DialogHeader>
                              <DialogTitle>Payment Details - {payment.receipt_number}</DialogTitle>
                            </DialogHeader>
                            {selectedPayment && (
                              <PaymentDetailsView payment={selectedPayment} />
                            )}
                          </DialogContent>
                        </Dialog>

                        <Button variant="outline" size="sm">
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PaymentDetailsView({ payment }: { payment: PaymentRecord }) {
  return (
    <div className="space-y-6">
      {/* Payment Header */}
      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
        <div>
          <h3 className="text-lg font-semibold">{payment.receipt_number}</h3>
          <p className="text-gray-600 capitalize">
            {payment.payment_mode.replace('_', ' ')} Payment
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-[#0b6d41]">
            {formatCurrency(payment.payment_amount)}
          </div>
          <Badge variant="outline">
            {payment.status.toUpperCase()}
          </Badge>
        </div>
      </div>

      {/* Payment Details Grid */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium text-gray-600">Payment Date</label>
          <p className="font-medium">{formatDate(payment.payment_date)}</p>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-600">Payment Time</label>
          <p className="font-medium">
            {new Date(payment.payment_date).toLocaleTimeString()}
          </p>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-600">Payment Amount</label>
          <p className="font-medium text-[#0b6d41]">
            {formatCurrency(payment.payment_amount)}
          </p>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-600">Charges</label>
          <p className="font-medium">
            {payment.charges ? formatCurrency(payment.charges) : 'No charges'}
          </p>
        </div>
        {payment.transaction_id && (
          <div>
            <label className="text-sm font-medium text-gray-600">Transaction ID</label>
            <p className="font-medium font-mono text-sm">{payment.transaction_id}</p>
          </div>
        )}
        {payment.reference_number && (
          <div>
            <label className="text-sm font-medium text-gray-600">Reference Number</label>
            <p className="font-medium">{payment.reference_number}</p>
          </div>
        )}
        {payment.bank_name && (
          <div>
            <label className="text-sm font-medium text-gray-600">Bank</label>
            <p className="font-medium">{payment.bank_name}</p>
          </div>
        )}
        <div>
          <label className="text-sm font-medium text-gray-600">Payment Gateway</label>
          <p className="font-medium capitalize">
            {payment.gateway_name || 'Manual Payment'}
          </p>
        </div>
      </div>

      {/* Additional Information */}
      <div className="space-y-4">
        {payment.gateway_response && (
          <div>
            <label className="text-sm font-medium text-gray-600">Gateway Response</label>
            <div className="mt-1 p-3 bg-gray-50 rounded-lg">
              <pre className="text-sm overflow-auto">
                {JSON.stringify(payment.gateway_response, null, 2)}
              </pre>
            </div>
          </div>
        )}

        {payment.remarks && (
          <div>
            <label className="text-sm font-medium text-gray-600">Remarks</label>
            <p className="mt-1 p-3 bg-gray-50 rounded-lg">{payment.remarks}</p>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2 pt-4 border-t">
        <Button variant="outline" className="flex-1">
          <Download className="h-4 w-4 mr-2" />
          Download Receipt
        </Button>
        {payment.status === 'completed' && (
          <Button variant="outline" className="flex-1">
            <Receipt className="h-4 w-4 mr-2" />
            Print Receipt
          </Button>
        )}
      </div>
    </div>
  );
}