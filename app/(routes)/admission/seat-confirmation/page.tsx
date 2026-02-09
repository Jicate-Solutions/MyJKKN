'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Wallet,
  CreditCard,
  CheckCircle2,
  XCircle,
  Clock,
  Users,
  Download,
  Mail,
  Eye,
  RefreshCw,
  Calendar,
  AlertTriangle,
  Timer,
  IndianRupee,
  Search,
  Filter,
  TrendingUp,
  BarChart3,
  FileCheck,
  UserCheck,
  Building2,
  GraduationCap,
  Receipt,
  Ban,
  ArrowRightLeft,
  Percent,
  Bell,
  Send,
  History,
  Printer,
  Loader2
} from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { AdmissionErrorBoundary } from '@/components/admission';

// Mock data for seat confirmations
const mockConfirmations = [
  {
    id: 'SEAT-2026-001',
    offerId: 'OFF-2026-001',
    candidateName: 'Priya Sharma',
    email: 'priya.sharma@email.com',
    phone: '+91 98765 43210',
    program: 'B.Tech Computer Science',
    status: 'confirmed',
    tokenAmount: 25000,
    tokenPaidDate: '2026-01-22',
    paymentMethod: 'Online',
    transactionId: 'TXN123456789',
    documentsVerified: true,
    seatAllotted: 'A-123',
    deadline: '2026-01-25',
    category: 'General'
  },
  {
    id: 'SEAT-2026-002',
    offerId: 'OFF-2026-002',
    candidateName: 'Rahul Kumar',
    email: 'rahul.kumar@email.com',
    phone: '+91 98765 43211',
    program: 'B.Tech Computer Science',
    status: 'pending_payment',
    tokenAmount: 25000,
    tokenPaidDate: null,
    paymentMethod: null,
    transactionId: null,
    documentsVerified: true,
    seatAllotted: null,
    deadline: '2026-01-28',
    category: 'OBC'
  },
  {
    id: 'SEAT-2026-003',
    offerId: 'OFF-2026-003',
    candidateName: 'Ananya Patel',
    email: 'ananya.patel@email.com',
    phone: '+91 98765 43212',
    program: 'B.Tech Computer Science',
    status: 'pending_docs',
    tokenAmount: 25000,
    tokenPaidDate: '2026-01-23',
    paymentMethod: 'DD',
    transactionId: 'DD987654',
    documentsVerified: false,
    seatAllotted: null,
    deadline: '2026-01-29',
    category: 'General'
  },
  {
    id: 'SEAT-2026-004',
    offerId: 'OFF-2026-004',
    candidateName: 'Mohammed Arif',
    email: 'mohammed.arif@email.com',
    phone: '+91 98765 43213',
    program: 'B.Tech Electronics',
    status: 'cancelled',
    tokenAmount: 25000,
    tokenPaidDate: null,
    paymentMethod: null,
    transactionId: null,
    documentsVerified: false,
    seatAllotted: null,
    deadline: '2026-01-27',
    cancelReason: 'Offer declined',
    category: 'Minority'
  },
  {
    id: 'SEAT-2026-005',
    offerId: 'OFF-2026-005',
    candidateName: 'Sneha Reddy',
    email: 'sneha.reddy@email.com',
    phone: '+91 98765 43214',
    program: 'MBA',
    status: 'expired',
    tokenAmount: 50000,
    tokenPaidDate: null,
    paymentMethod: null,
    transactionId: null,
    documentsVerified: false,
    seatAllotted: null,
    deadline: '2026-01-20',
    category: 'SC'
  },
  {
    id: 'SEAT-2026-006',
    offerId: 'OFF-2026-006',
    candidateName: 'Vikram Singh',
    email: 'vikram.singh@email.com',
    phone: '+91 98765 43215',
    program: 'B.Tech Mechanical',
    status: 'refund_pending',
    tokenAmount: 25000,
    tokenPaidDate: '2026-01-18',
    paymentMethod: 'Online',
    transactionId: 'TXN111222333',
    documentsVerified: true,
    seatAllotted: 'M-045',
    deadline: '2026-01-25',
    refundReason: 'Withdrew admission',
    category: 'EWS'
  }
];

// Seat capacity by program
const seatCapacity = [
  { program: 'B.Tech Computer Science', total: 120, filled: 78, reserved: 15 },
  { program: 'B.Tech Electronics', total: 60, filled: 42, reserved: 8 },
  { program: 'B.Tech Mechanical', total: 60, filled: 35, reserved: 5 },
  { program: 'MBA', total: 60, filled: 28, reserved: 12 }
];

function SeatConfirmationPageContent() {
  const [activeTab, setActiveTab] = useState('confirmations');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [programFilter, setProgramFilter] = useState('all');
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [isRefundDialogOpen, setIsRefundDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<typeof mockConfirmations[0] | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSendingReminders, setIsSendingReminders] = useState(false);
  const [isSendingBulkReminders, setIsSendingBulkReminders] = useState(false);
  const [isSendingBulkEmails, setIsSendingBulkEmails] = useState(false);
  const [isRecordingPayment, setIsRecordingPayment] = useState(false);
  const [isProcessingRefund, setIsProcessingRefund] = useState(false);

  // Stats
  const totalSeats = seatCapacity.reduce((acc, p) => acc + p.total, 0);
  const filledSeats = seatCapacity.reduce((acc, p) => acc + p.filled, 0);
  const reservedSeats = seatCapacity.reduce((acc, p) => acc + p.reserved, 0);
  const confirmedCount = mockConfirmations.filter(c => c.status === 'confirmed').length;
  const pendingPaymentCount = mockConfirmations.filter(c => c.status === 'pending_payment').length;
  const pendingDocsCount = mockConfirmations.filter(c => c.status === 'pending_docs').length;
  const totalCollected = mockConfirmations
    .filter(c => c.tokenPaidDate && c.status !== 'refund_pending')
    .reduce((acc, c) => acc + c.tokenAmount, 0);

  // Filter confirmations
  const filteredConfirmations = mockConfirmations.filter(conf => {
    const matchesSearch = conf.candidateName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          conf.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          conf.offerId.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || conf.status === statusFilter;
    const matchesProgram = programFilter === 'all' || conf.program === programFilter;
    return matchesSearch && matchesStatus && matchesProgram;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed':
        return <Badge className="bg-green-100 text-green-700 border-green-200">Confirmed</Badge>;
      case 'pending_payment':
        return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">Payment Pending</Badge>;
      case 'pending_docs':
        return <Badge className="bg-blue-100 text-blue-700 border-blue-200">Docs Pending</Badge>;
      case 'cancelled':
        return <Badge className="bg-gray-100 text-gray-700 border-gray-200">Cancelled</Badge>;
      case 'expired':
        return <Badge className="bg-red-100 text-red-700 border-red-200">Expired</Badge>;
      case 'refund_pending':
        return <Badge className="bg-orange-100 text-orange-700 border-orange-200">Refund Pending</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getDaysRemaining = (deadline: string) => {
    const days = differenceInDays(new Date(deadline), new Date());
    if (days < 0) return <span className="text-red-600 font-medium">Expired</span>;
    if (days === 0) return <span className="text-red-600 font-medium">Today</span>;
    if (days <= 3) return <span className="text-yellow-600 font-medium">{days} days</span>;
    return <span className="text-muted-foreground">{days} days</span>;
  };

  const handleSelectAll = () => {
    if (selectedItems.length === filteredConfirmations.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems(filteredConfirmations.map(c => c.id));
    }
  };

  const handleSelectItem = (id: string) => {
    if (selectedItems.includes(id)) {
      setSelectedItems(selectedItems.filter(i => i !== id));
    } else {
      setSelectedItems([...selectedItems, id]);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wallet className="h-7 w-7 text-primary" />
            Seat Confirmation & Token Fee
          </h1>
          <p className="text-muted-foreground mt-1">
            Track token payments, seat reservations, and enrollment confirmations
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            disabled={isSyncing}
            onClick={async () => {
              setIsSyncing(true);
              await new Promise(resolve => setTimeout(resolve, 1000));
              toast.success('Payment data synced successfully');
              setIsSyncing(false);
            }}
          >
            {isSyncing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Sync Payments
          </Button>
          <Button onClick={() => toast.success('Payment recording form opened')}>
            <Receipt className="mr-2 h-4 w-4" />
            Record Payment
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Seats</p>
                <p className="text-2xl font-bold">{totalSeats}</p>
              </div>
              <Building2 className="h-8 w-8 text-blue-500 opacity-80" />
            </div>
            <Progress value={totalSeats > 0 ? (filledSeats / totalSeats) * 100 : 0} className="mt-2 h-1.5" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Confirmed</p>
                <p className="text-2xl font-bold text-green-600">{confirmedCount}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-500 opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending Payment</p>
                <p className="text-2xl font-bold text-yellow-600">{pendingPaymentCount}</p>
              </div>
              <Clock className="h-8 w-8 text-yellow-500 opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending Docs</p>
                <p className="text-2xl font-bold text-blue-600">{pendingDocsCount}</p>
              </div>
              <FileCheck className="h-8 w-8 text-blue-500 opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Collected</p>
                <p className="text-2xl font-bold text-primary">₹{(totalCollected / 100000).toFixed(1)}L</p>
              </div>
              <IndianRupee className="h-8 w-8 text-primary opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Fill Rate</p>
                <p className="text-2xl font-bold text-purple-600">{totalSeats > 0 ? ((filledSeats / totalSeats) * 100).toFixed(0) : '0'}%</p>
              </div>
              <TrendingUp className="h-8 w-8 text-purple-500 opacity-80" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-flex">
          <TabsTrigger value="confirmations">
            <UserCheck className="mr-2 h-4 w-4" />
            Confirmations
          </TabsTrigger>
          <TabsTrigger value="seats">
            <GraduationCap className="mr-2 h-4 w-4" />
            Seat Matrix
          </TabsTrigger>
          <TabsTrigger value="payments">
            <CreditCard className="mr-2 h-4 w-4" />
            Payments
          </TabsTrigger>
          <TabsTrigger value="analytics">
            <BarChart3 className="mr-2 h-4 w-4" />
            Analytics
          </TabsTrigger>
        </TabsList>

        {/* Confirmations Tab */}
        <TabsContent value="confirmations" className="mt-6">
          <Card>
            <CardHeader className="pb-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <CardTitle>Seat Confirmations</CardTitle>
                  <CardDescription>Track payment and document status</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => toast.success('Exporting seat confirmation data...')}>
                    <Download className="mr-2 h-4 w-4" />
                    Export
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isSendingReminders}
                    onClick={async () => {
                      setIsSendingReminders(true);
                      await new Promise(resolve => setTimeout(resolve, 1500));
                      toast.success('Reminders sent successfully');
                      setIsSendingReminders(false);
                    }}
                  >
                    {isSendingReminders ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Bell className="mr-2 h-4 w-4" />
                    )}
                    Send Reminders
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Filters */}
              <div className="flex flex-col md:flex-row gap-4 mb-6">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name or ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="confirmed">Confirmed</SelectItem>
                    <SelectItem value="pending_payment">Payment Pending</SelectItem>
                    <SelectItem value="pending_docs">Docs Pending</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                    <SelectItem value="refund_pending">Refund Pending</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={programFilter} onValueChange={setProgramFilter}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Program" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Programs</SelectItem>
                    <SelectItem value="B.Tech Computer Science">B.Tech CS</SelectItem>
                    <SelectItem value="B.Tech Electronics">B.Tech ECE</SelectItem>
                    <SelectItem value="MBA">MBA</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Bulk Actions */}
              {selectedItems.length > 0 && (
                <div className="flex items-center gap-4 p-3 bg-blue-50 rounded-lg mb-4">
                  <span className="text-sm font-medium text-blue-700">
                    {selectedItems.length} selected
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isSendingBulkReminders}
                    onClick={async () => {
                      setIsSendingBulkReminders(true);
                      await new Promise(resolve => setTimeout(resolve, 1500));
                      toast.success(`Reminders sent to ${selectedItems.length} candidates`);
                      setIsSendingBulkReminders(false);
                    }}
                  >
                    {isSendingBulkReminders ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Bell className="mr-2 h-4 w-4" />
                    )}
                    Remind
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isSendingBulkEmails}
                    onClick={async () => {
                      setIsSendingBulkEmails(true);
                      await new Promise(resolve => setTimeout(resolve, 1500));
                      toast.success(`Emails sent to ${selectedItems.length} candidates`);
                      setIsSendingBulkEmails(false);
                    }}
                  >
                    {isSendingBulkEmails ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Mail className="mr-2 h-4 w-4" />
                    )}
                    Email
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setSelectedItems([])}>
                    Clear
                  </Button>
                </div>
              )}

              {/* Table */}
              <div className="border rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="p-3 text-left">
                          <Checkbox
                            checked={selectedItems.length === filteredConfirmations.length && filteredConfirmations.length > 0}
                            onCheckedChange={handleSelectAll}
                          />
                        </th>
                        <th className="p-3 text-left text-sm font-medium">Candidate</th>
                        <th className="p-3 text-left text-sm font-medium">Program</th>
                        <th className="p-3 text-center text-sm font-medium">Status</th>
                        <th className="p-3 text-center text-sm font-medium">Token Fee</th>
                        <th className="p-3 text-center text-sm font-medium">Payment</th>
                        <th className="p-3 text-center text-sm font-medium">Docs</th>
                        <th className="p-3 text-center text-sm font-medium">Seat</th>
                        <th className="p-3 text-center text-sm font-medium">Deadline</th>
                        <th className="p-3 text-center text-sm font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredConfirmations.map((conf) => (
                        <tr key={conf.id} className="border-t hover:bg-muted/30">
                          <td className="p-3">
                            <Checkbox
                              checked={selectedItems.includes(conf.id)}
                              onCheckedChange={() => handleSelectItem(conf.id)}
                            />
                          </td>
                          <td className="p-3">
                            <div>
                              <p className="font-medium">{conf.candidateName}</p>
                              <p className="text-xs text-muted-foreground">{conf.id}</p>
                            </div>
                          </td>
                          <td className="p-3">
                            <span className="text-sm">{conf.program}</span>
                          </td>
                          <td className="p-3 text-center">{getStatusBadge(conf.status)}</td>
                          <td className="p-3 text-center">
                            <span className="font-medium">₹{conf.tokenAmount.toLocaleString()}</span>
                          </td>
                          <td className="p-3 text-center">
                            {conf.tokenPaidDate ? (
                              <div>
                                <CheckCircle2 className="h-5 w-5 text-green-500 mx-auto" />
                                <p className="text-xs text-muted-foreground mt-1">
                                  {format(new Date(conf.tokenPaidDate), 'MMM dd')}
                                </p>
                              </div>
                            ) : (
                              <XCircle className="h-5 w-5 text-gray-300 mx-auto" />
                            )}
                          </td>
                          <td className="p-3 text-center">
                            {conf.documentsVerified ? (
                              <CheckCircle2 className="h-5 w-5 text-green-500 mx-auto" />
                            ) : (
                              <XCircle className="h-5 w-5 text-gray-300 mx-auto" />
                            )}
                          </td>
                          <td className="p-3 text-center">
                            {conf.seatAllotted ? (
                              <Badge variant="outline">{conf.seatAllotted}</Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            {getDaysRemaining(conf.deadline)}
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <Eye className="h-4 w-4" />
                              </Button>
                              {conf.status === 'pending_payment' && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => {
                                    setSelectedItem(conf);
                                    setIsPaymentDialogOpen(true);
                                  }}
                                >
                                  <CreditCard className="h-4 w-4" />
                                </Button>
                              )}
                              {(conf.status === 'confirmed' || conf.status === 'refund_pending') && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => {
                                    setSelectedItem(conf);
                                    setIsRefundDialogOpen(true);
                                  }}
                                >
                                  <ArrowRightLeft className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Seat Matrix Tab */}
        <TabsContent value="seats" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Overall Summary */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Seat Availability Overview</CardTitle>
                <CardDescription>Current seat status across all programs</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-4">
                  <div className="text-center p-4 bg-blue-50 rounded-lg">
                    <p className="text-3xl font-bold text-blue-600">{totalSeats}</p>
                    <p className="text-sm text-blue-700">Total Seats</p>
                  </div>
                  <div className="text-center p-4 bg-green-50 rounded-lg">
                    <p className="text-3xl font-bold text-green-600">{filledSeats}</p>
                    <p className="text-sm text-green-700">Filled</p>
                  </div>
                  <div className="text-center p-4 bg-yellow-50 rounded-lg">
                    <p className="text-3xl font-bold text-yellow-600">{reservedSeats}</p>
                    <p className="text-sm text-yellow-700">Reserved</p>
                  </div>
                  <div className="text-center p-4 bg-gray-50 rounded-lg">
                    <p className="text-3xl font-bold text-gray-600">{totalSeats - filledSeats - reservedSeats}</p>
                    <p className="text-sm text-gray-700">Available</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Program-wise Seats */}
            {seatCapacity.map((program) => (
              <Card key={program.program}>
                <CardHeader>
                  <CardTitle className="text-lg">{program.program}</CardTitle>
                  <CardDescription>
                    {program.filled + program.reserved}/{program.total} seats allocated
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Fill Progress</span>
                      <span className="font-medium">{program.total > 0 ? ((program.filled / program.total) * 100).toFixed(0) : '0'}%</span>
                    </div>
                    <div className="h-4 bg-muted rounded overflow-hidden flex">
                      <div
                        className="bg-green-500 h-full"
                        style={{ width: `${program.total > 0 ? (program.filled / program.total) * 100 : 0}%` }}
                      />
                      <div
                        className="bg-yellow-500 h-full"
                        style={{ width: `${program.total > 0 ? (program.reserved / program.total) * 100 : 0}%` }}
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center text-sm">
                      <div className="p-2 bg-green-50 rounded">
                        <p className="font-bold text-green-600">{program.filled}</p>
                        <p className="text-xs text-green-700">Filled</p>
                      </div>
                      <div className="p-2 bg-yellow-50 rounded">
                        <p className="font-bold text-yellow-600">{program.reserved}</p>
                        <p className="text-xs text-yellow-700">Reserved</p>
                      </div>
                      <div className="p-2 bg-gray-50 rounded">
                        <p className="font-bold text-gray-600">{program.total - program.filled - program.reserved}</p>
                        <p className="text-xs text-gray-700">Available</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Payments Tab */}
        <TabsContent value="payments" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Payment Summary */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Payment Transactions</CardTitle>
                <CardDescription>Recent token fee payments</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px]">
                  <div className="space-y-3">
                    {mockConfirmations
                      .filter(c => c.tokenPaidDate)
                      .sort((a, b) => new Date(b.tokenPaidDate!).getTime() - new Date(a.tokenPaidDate!).getTime())
                      .map((conf) => (
                        <div key={conf.id} className="p-4 border rounded-lg">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className={`p-2 rounded-full ${
                                conf.status === 'refund_pending' ? 'bg-orange-100' : 'bg-green-100'
                              }`}>
                                {conf.status === 'refund_pending' ? (
                                  <ArrowRightLeft className="h-4 w-4 text-orange-600" />
                                ) : (
                                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                                )}
                              </div>
                              <div>
                                <p className="font-medium">{conf.candidateName}</p>
                                <p className="text-xs text-muted-foreground">{conf.transactionId}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className={`font-bold ${
                                conf.status === 'refund_pending' ? 'text-orange-600' : 'text-green-600'
                              }`}>
                                {conf.status === 'refund_pending' ? '-' : '+'}₹{conf.tokenAmount.toLocaleString()}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {format(new Date(conf.tokenPaidDate!), 'MMM dd, yyyy')}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 mt-2">
                            <Badge variant="outline">{conf.paymentMethod}</Badge>
                            <Badge variant="outline">{conf.program}</Badge>
                          </div>
                        </div>
                      ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Payment Stats */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Collection Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="p-4 bg-green-50 rounded-lg text-center">
                      <p className="text-sm text-green-700">Total Collected</p>
                      <p className="text-3xl font-bold text-green-600">₹{totalCollected.toLocaleString()}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 border rounded-lg text-center">
                        <p className="text-sm text-muted-foreground">Online</p>
                        <p className="font-bold">₹50,000</p>
                      </div>
                      <div className="p-3 border rounded-lg text-center">
                        <p className="text-sm text-muted-foreground">DD/Cheque</p>
                        <p className="font-bold">₹25,000</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Pending Collections</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="p-4 bg-yellow-50 rounded-lg text-center">
                    <p className="text-sm text-yellow-700">Expected from Pending</p>
                    <p className="text-2xl font-bold text-yellow-600">₹25,000</p>
                    <p className="text-xs text-yellow-600 mt-1">{pendingPaymentCount} candidates</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Refunds</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="p-4 bg-orange-50 rounded-lg text-center">
                    <p className="text-sm text-orange-700">Pending Refunds</p>
                    <p className="text-2xl font-bold text-orange-600">₹25,000</p>
                    <p className="text-xs text-orange-600 mt-1">1 request</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Conversion Funnel */}
            <Card>
              <CardHeader>
                <CardTitle>Enrollment Funnel</CardTitle>
                <CardDescription>From offer to enrollment conversion</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[
                    { stage: 'Offers Accepted', count: 28, percent: 100, color: 'bg-blue-500' },
                    { stage: 'Token Paid', count: 22, percent: 79, color: 'bg-purple-500' },
                    { stage: 'Documents Verified', count: 20, percent: 71, color: 'bg-teal-500' },
                    { stage: 'Seat Confirmed', count: 18, percent: 64, color: 'bg-green-500' }
                  ].map((stage) => (
                    <div key={stage.stage} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span>{stage.stage}</span>
                        <span className="font-medium">{stage.count} ({stage.percent}%)</span>
                      </div>
                      <div className="h-8 bg-muted rounded overflow-hidden">
                        <div
                          className={`h-full ${stage.color}`}
                          style={{ width: `${stage.percent}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Category-wise Fill */}
            <Card>
              <CardHeader>
                <CardTitle>Category-wise Seat Fill</CardTitle>
                <CardDescription>Seats filled by reservation category</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[
                    { category: 'General', filled: 45, total: 60, color: 'bg-blue-500' },
                    { category: 'OBC', filled: 28, total: 32, color: 'bg-purple-500' },
                    { category: 'SC', filled: 12, total: 18, color: 'bg-orange-500' },
                    { category: 'ST', filled: 5, total: 9, color: 'bg-teal-500' },
                    { category: 'EWS', filled: 8, total: 12, color: 'bg-pink-500' }
                  ].map((cat) => (
                    <div key={cat.category} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{cat.category}</span>
                        <span className="text-sm">{cat.filled}/{cat.total} ({((cat.filled / cat.total) * 100).toFixed(0)}%)</span>
                      </div>
                      <Progress value={(cat.filled / cat.total) * 100} className="h-2" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Daily Collections */}
            <Card>
              <CardHeader>
                <CardTitle>Daily Collections (Last 7 Days)</CardTitle>
                <CardDescription>Token fee collection trend</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[
                    { date: 'Jan 16', amount: 25000 },
                    { date: 'Jan 17', amount: 0 },
                    { date: 'Jan 18', amount: 50000 },
                    { date: 'Jan 19', amount: 25000 },
                    { date: 'Jan 20', amount: 75000 },
                    { date: 'Jan 21', amount: 25000 },
                    { date: 'Jan 22', amount: 50000 }
                  ].map((day) => (
                    <div key={day.date} className="flex items-center gap-4">
                      <span className="w-16 text-sm">{day.date}</span>
                      <div className="flex-1 h-6 bg-muted rounded overflow-hidden">
                        <div
                          className="h-full bg-green-500"
                          style={{ width: `${(day.amount / 75000) * 100}%` }}
                        />
                      </div>
                      <span className="w-20 text-sm text-right font-medium">₹{(day.amount / 1000).toFixed(0)}K</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Drop-off Analysis */}
            <Card>
              <CardHeader>
                <CardTitle>Drop-off Analysis</CardTitle>
                <CardDescription>Reasons for non-confirmation</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[
                    { reason: 'Payment deadline expired', count: 5, percent: 45 },
                    { reason: 'Offer declined', count: 3, percent: 27 },
                    { reason: 'Documents not submitted', count: 2, percent: 18 },
                    { reason: 'Withdrew application', count: 1, percent: 9 }
                  ].map((item) => (
                    <div key={item.reason} className="flex items-center justify-between p-3 border rounded-lg">
                      <span className="text-sm">{item.reason}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">{item.count}</span>
                        <Badge variant="outline">{item.percent}%</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Record Payment Dialog */}
      <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              {selectedItem?.candidateName} - Token Fee: ₹{selectedItem?.tokenAmount.toLocaleString()}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <Select defaultValue="online">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="online">Online Payment</SelectItem>
                  <SelectItem value="dd">Demand Draft</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Transaction ID / DD Number</Label>
              <Input placeholder="Enter transaction reference" />
            </div>
            <div className="space-y-2">
              <Label>Payment Date</Label>
              <Input type="date" defaultValue={format(new Date(), 'yyyy-MM-dd')} />
            </div>
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input type="number" defaultValue={selectedItem?.tokenAmount} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPaymentDialogOpen(false)} disabled={isRecordingPayment}>
              Cancel
            </Button>
            <Button
              disabled={isRecordingPayment}
              onClick={async () => {
                setIsRecordingPayment(true);
                await new Promise(resolve => setTimeout(resolve, 1500));
                toast.success('Payment recorded successfully');
                setIsRecordingPayment(false);
                setIsPaymentDialogOpen(false);
              }}
            >
              {isRecordingPayment ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              Record Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Refund Dialog */}
      <Dialog open={isRefundDialogOpen} onOpenChange={setIsRefundDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Process Refund</DialogTitle>
            <DialogDescription>
              {selectedItem?.candidateName} - Amount: ₹{selectedItem?.tokenAmount.toLocaleString()}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Refund Reason</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select reason" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="withdrawal">Withdrawal of admission</SelectItem>
                  <SelectItem value="duplicate">Duplicate payment</SelectItem>
                  <SelectItem value="error">Payment error</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Refund Amount</Label>
              <Input type="number" defaultValue={selectedItem?.tokenAmount} />
            </div>
            <div className="space-y-2">
              <Label>Bank Account Details</Label>
              <Input placeholder="Account number" />
            </div>
            <div className="space-y-2">
              <Input placeholder="IFSC Code" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRefundDialogOpen(false)} disabled={isProcessingRefund}>
              Cancel
            </Button>
            <Button
              disabled={isProcessingRefund}
              onClick={async () => {
                setIsProcessingRefund(true);
                await new Promise(resolve => setTimeout(resolve, 1500));
                toast.success('Refund request initiated successfully');
                setIsProcessingRefund(false);
                setIsRefundDialogOpen(false);
              }}
            >
              {isProcessingRefund ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ArrowRightLeft className="mr-2 h-4 w-4" />
              )}
              Process Refund
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function SeatConfirmationPage() {
  return (
    <AdmissionErrorBoundary>
      <SeatConfirmationPageContent />
    </AdmissionErrorBoundary>
  );
}
