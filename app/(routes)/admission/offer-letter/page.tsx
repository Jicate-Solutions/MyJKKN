'use client';

import { useState } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import {
  FileText,
  Send,
  Check,
  X,
  Clock,
  Users,
  Download,
  Mail,
  Eye,
  Edit,
  Printer,
  RefreshCw,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Timer,
  FileCheck,
  FilePlus,
  Upload,
  Search,
  Filter,
  MoreVertical,
  Sparkles,
  Copy,
  ExternalLink,
  Bell,
  Settings,
  BarChart3,
  TrendingUp,
  Stamp,
  PenTool,
  History,
  MessageSquare,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { AdmissionErrorBoundary } from '@/components/admission';
import { format, differenceInDays, addDays } from 'date-fns';

// Mock data for offers
const mockOffers = [
  {
    id: 'OFF-2026-001',
    applicationId: 'APP-2026-001',
    candidateName: 'Priya Sharma',
    email: 'priya.sharma@email.com',
    phone: '+91 98765 43210',
    program: 'B.Tech Computer Science',
    status: 'accepted',
    offerDate: '2026-01-18',
    deadline: '2026-01-28',
    acceptedDate: '2026-01-20',
    scholarship: 25,
    totalFee: 150000,
    finalFee: 112500,
    documentsSubmitted: true,
    tokenPaid: true
  },
  {
    id: 'OFF-2026-002',
    applicationId: 'APP-2026-002',
    candidateName: 'Rahul Kumar',
    email: 'rahul.kumar@email.com',
    phone: '+91 98765 43211',
    program: 'B.Tech Computer Science',
    status: 'pending',
    offerDate: '2026-01-18',
    deadline: '2026-01-28',
    acceptedDate: null,
    scholarship: 15,
    totalFee: 150000,
    finalFee: 127500,
    documentsSubmitted: false,
    tokenPaid: false
  },
  {
    id: 'OFF-2026-003',
    applicationId: 'APP-2026-003',
    candidateName: 'Ananya Patel',
    email: 'ananya.patel@email.com',
    phone: '+91 98765 43212',
    program: 'B.Tech Computer Science',
    status: 'pending',
    offerDate: '2026-01-19',
    deadline: '2026-01-29',
    acceptedDate: null,
    scholarship: 0,
    totalFee: 150000,
    finalFee: 150000,
    documentsSubmitted: true,
    tokenPaid: false
  },
  {
    id: 'OFF-2026-004',
    applicationId: 'APP-2026-004',
    candidateName: 'Mohammed Arif',
    email: 'mohammed.arif@email.com',
    phone: '+91 98765 43213',
    program: 'B.Tech Electronics',
    status: 'declined',
    offerDate: '2026-01-17',
    deadline: '2026-01-27',
    acceptedDate: null,
    declinedDate: '2026-01-22',
    declineReason: 'Joined another institution',
    scholarship: 10,
    totalFee: 140000,
    finalFee: 126000,
    documentsSubmitted: false,
    tokenPaid: false
  },
  {
    id: 'OFF-2026-005',
    applicationId: 'APP-2026-005',
    candidateName: 'Sneha Reddy',
    email: 'sneha.reddy@email.com',
    phone: '+91 98765 43214',
    program: 'MBA',
    status: 'expired',
    offerDate: '2026-01-05',
    deadline: '2026-01-15',
    acceptedDate: null,
    scholarship: 20,
    totalFee: 250000,
    finalFee: 200000,
    documentsSubmitted: false,
    tokenPaid: false
  },
  {
    id: 'OFF-2026-006',
    applicationId: 'APP-2026-006',
    candidateName: 'Vikram Singh',
    email: 'vikram.singh@email.com',
    phone: '+91 98765 43215',
    program: 'B.Tech Mechanical',
    status: 'draft',
    offerDate: null,
    deadline: null,
    acceptedDate: null,
    scholarship: 0,
    totalFee: 130000,
    finalFee: 130000,
    documentsSubmitted: false,
    tokenPaid: false
  }
];

// Offer templates
const offerTemplates = [
  { id: 1, name: 'Standard Offer Letter', program: 'All Programs', isDefault: true },
  { id: 2, name: 'Scholarship Offer Letter', program: 'All Programs', isDefault: false },
  { id: 3, name: 'Waitlist Conversion Offer', program: 'All Programs', isDefault: false }
];

function OfferLetterPageContent() {
  const [activeTab, setActiveTab] = useState('offers');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [programFilter, setProgramFilter] = useState('all');
  const [selectedOffers, setSelectedOffers] = useState<string[]>([]);
  const [isCreateOfferDialogOpen, setIsCreateOfferDialogOpen] = useState(false);
  const [isViewOfferDialogOpen, setIsViewOfferDialogOpen] = useState(false);
  const [isReminderDialogOpen, setIsReminderDialogOpen] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState<typeof mockOffers[0] | null>(null);
  const [isCreatingOffer, setIsCreatingOffer] = useState(false);
  const [isSendingBulkOffers, setIsSendingBulkOffers] = useState(false);
  const [isSendingBulkReminders, setIsSendingBulkReminders] = useState(false);
  const [isSendingReminders, setIsSendingReminders] = useState(false);

  // Stats
  const totalOffers = mockOffers.length;
  const pendingOffers = mockOffers.filter(o => o.status === 'pending').length;
  const acceptedOffers = mockOffers.filter(o => o.status === 'accepted').length;
  const declinedOffers = mockOffers.filter(o => o.status === 'declined').length;
  const expiredOffers = mockOffers.filter(o => o.status === 'expired').length;
  const acceptanceRate = ((acceptedOffers / (acceptedOffers + declinedOffers + expiredOffers)) * 100) || 0;

  // Filter offers
  const filteredOffers = mockOffers.filter(offer => {
    const matchesSearch = offer.candidateName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          offer.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          offer.applicationId.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || offer.status === statusFilter;
    const matchesProgram = programFilter === 'all' || offer.program === programFilter;
    return matchesSearch && matchesStatus && matchesProgram;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'accepted':
        return <Badge className="bg-green-100 text-green-700 border-green-200">Accepted</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">Pending</Badge>;
      case 'declined':
        return <Badge className="bg-red-100 text-red-700 border-red-200">Declined</Badge>;
      case 'expired':
        return <Badge className="bg-gray-100 text-gray-700 border-gray-200">Expired</Badge>;
      case 'draft':
        return <Badge className="bg-blue-100 text-blue-700 border-blue-200">Draft</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getDaysRemaining = (deadline: string | null) => {
    if (!deadline) return null;
    const days = differenceInDays(new Date(deadline), new Date());
    if (days < 0) return <span className="text-red-600 font-medium">Expired</span>;
    if (days === 0) return <span className="text-red-600 font-medium">Today</span>;
    if (days <= 3) return <span className="text-yellow-600 font-medium">{days} days</span>;
    return <span className="text-muted-foreground">{days} days</span>;
  };

  const handleViewOffer = (offer: typeof mockOffers[0]) => {
    setSelectedOffer(offer);
    setIsViewOfferDialogOpen(true);
  };

  const handleSelectAll = () => {
    if (selectedOffers.length === filteredOffers.length) {
      setSelectedOffers([]);
    } else {
      setSelectedOffers(filteredOffers.map(o => o.id));
    }
  };

  const handleSelectOffer = (id: string) => {
    if (selectedOffers.includes(id)) {
      setSelectedOffers(selectedOffers.filter(o => o !== id));
    } else {
      setSelectedOffers([...selectedOffers, id]);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="h-7 w-7 text-primary" />
            Offer Letter Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Generate, send, and track offer letters and acceptances
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => toast.success('Opening template settings...')}>
            <Settings className="mr-2 h-4 w-4" />
            Templates
          </Button>
          <Button onClick={() => setIsCreateOfferDialogOpen(true)}>
            <FilePlus className="mr-2 h-4 w-4" />
            Create Offer
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Offers</p>
                <p className="text-2xl font-bold">{totalOffers}</p>
              </div>
              <FileText className="h-8 w-8 text-blue-500 opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending</p>
                <p className="text-2xl font-bold text-yellow-600">{pendingOffers}</p>
              </div>
              <Clock className="h-8 w-8 text-yellow-500 opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Accepted</p>
                <p className="text-2xl font-bold text-green-600">{acceptedOffers}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-500 opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Declined</p>
                <p className="text-2xl font-bold text-red-600">{declinedOffers}</p>
              </div>
              <XCircle className="h-8 w-8 text-red-500 opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Expired</p>
                <p className="text-2xl font-bold text-gray-600">{expiredOffers}</p>
              </div>
              <Timer className="h-8 w-8 text-gray-500 opacity-80" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Accept Rate</p>
                <p className="text-2xl font-bold text-primary">{acceptanceRate.toFixed(0)}%</p>
              </div>
              <TrendingUp className="h-8 w-8 text-primary opacity-80" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-flex">
          <TabsTrigger value="offers">
            <FileText className="mr-2 h-4 w-4" />
            All Offers
          </TabsTrigger>
          <TabsTrigger value="pending">
            <Clock className="mr-2 h-4 w-4" />
            Pending Actions
          </TabsTrigger>
          <TabsTrigger value="templates">
            <Stamp className="mr-2 h-4 w-4" />
            Templates
          </TabsTrigger>
          <TabsTrigger value="analytics">
            <BarChart3 className="mr-2 h-4 w-4" />
            Analytics
          </TabsTrigger>
        </TabsList>

        {/* All Offers Tab */}
        <TabsContent value="offers" className="mt-6">
          <Card>
            <CardHeader className="pb-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <CardTitle>Offer Letters</CardTitle>
                  <CardDescription>Manage all offer letters and track responses</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => toast.success('Exporting offer letters...')}>
                    <Download className="mr-2 h-4 w-4" />
                    Export
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setIsReminderDialogOpen(true)}>
                    <Bell className="mr-2 h-4 w-4" />
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
                    placeholder="Search by name, offer ID, or application ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="accepted">Accepted</SelectItem>
                    <SelectItem value="declined">Declined</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
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
              {selectedOffers.length > 0 && (
                <div className="flex items-center gap-4 p-3 bg-blue-50 rounded-lg mb-4">
                  <span className="text-sm font-medium text-blue-700">
                    {selectedOffers.length} selected
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isSendingBulkOffers}
                    onClick={async () => {
                      setIsSendingBulkOffers(true);
                      await new Promise(resolve => setTimeout(resolve, 1500));
                      toast.success(`Sending offer letters to ${selectedOffers.length} candidates`);
                      setIsSendingBulkOffers(false);
                    }}
                  >
                    {isSendingBulkOffers ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="mr-2 h-4 w-4" />
                    )}
                    Send Offers
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isSendingBulkReminders}
                    onClick={async () => {
                      setIsSendingBulkReminders(true);
                      await new Promise(resolve => setTimeout(resolve, 1500));
                      toast.success(`Sending reminders to ${selectedOffers.length} candidates`);
                      setIsSendingBulkReminders(false);
                    }}
                  >
                    {isSendingBulkReminders ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Bell className="mr-2 h-4 w-4" />
                    )}
                    Send Reminder
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => toast.success('Preparing print preview...')}>
                    <Printer className="mr-2 h-4 w-4" />
                    Print
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setSelectedOffers([])}>
                    Clear
                  </Button>
                </div>
              )}

              {/* Offers Table */}
              <div className="border rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="p-3 text-left">
                          <Checkbox
                            checked={selectedOffers.length === filteredOffers.length && filteredOffers.length > 0}
                            onCheckedChange={handleSelectAll}
                          />
                        </th>
                        <th className="p-3 text-left text-sm font-medium">Offer ID</th>
                        <th className="p-3 text-left text-sm font-medium">Candidate</th>
                        <th className="p-3 text-left text-sm font-medium">Program</th>
                        <th className="p-3 text-center text-sm font-medium">Status</th>
                        <th className="p-3 text-center text-sm font-medium">Scholarship</th>
                        <th className="p-3 text-center text-sm font-medium">Final Fee</th>
                        <th className="p-3 text-center text-sm font-medium">Deadline</th>
                        <th className="p-3 text-center text-sm font-medium">Docs</th>
                        <th className="p-3 text-center text-sm font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOffers.map((offer) => (
                        <tr key={offer.id} className="border-t hover:bg-muted/30">
                          <td className="p-3">
                            <Checkbox
                              checked={selectedOffers.includes(offer.id)}
                              onCheckedChange={() => handleSelectOffer(offer.id)}
                            />
                          </td>
                          <td className="p-3">
                            <div>
                              <p className="font-medium">{offer.id}</p>
                              <p className="text-xs text-muted-foreground">{offer.applicationId}</p>
                            </div>
                          </td>
                          <td className="p-3">
                            <div>
                              <p className="font-medium">{offer.candidateName}</p>
                              <p className="text-xs text-muted-foreground">{offer.email}</p>
                            </div>
                          </td>
                          <td className="p-3">
                            <span className="text-sm">{offer.program}</span>
                          </td>
                          <td className="p-3 text-center">{getStatusBadge(offer.status)}</td>
                          <td className="p-3 text-center">
                            {offer.scholarship > 0 ? (
                              <Badge className="bg-purple-100 text-purple-700 border-purple-200">
                                {offer.scholarship}%
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            <span className="font-medium">₹{offer.finalFee.toLocaleString()}</span>
                            {offer.scholarship > 0 && (
                              <p className="text-xs text-muted-foreground line-through">
                                ₹{offer.totalFee.toLocaleString()}
                              </p>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            {offer.deadline ? (
                              <div>
                                <p className="text-sm">{format(new Date(offer.deadline), 'MMM dd')}</p>
                                {getDaysRemaining(offer.deadline)}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            {offer.documentsSubmitted ? (
                              <CheckCircle2 className="h-5 w-5 text-green-500 mx-auto" />
                            ) : (
                              <XCircle className="h-5 w-5 text-gray-300 mx-auto" />
                            )}
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleViewOffer(offer)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toast.success(`Offer letter sent to ${offer.candidateName}`)}>
                                <Mail className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toast.success('Downloading offer letter...')}>
                                <Download className="h-4 w-4" />
                              </Button>
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

        {/* Pending Actions Tab */}
        <TabsContent value="pending" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Awaiting Response */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-yellow-500" />
                  Awaiting Response
                </CardTitle>
                <CardDescription>Offers pending candidate decision</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[350px]">
                  <div className="space-y-3">
                    {mockOffers.filter(o => o.status === 'pending').map((offer) => (
                      <div key={offer.id} className="p-3 border rounded-lg hover:bg-muted/50">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{offer.candidateName}</p>
                            <p className="text-xs text-muted-foreground">{offer.program}</p>
                          </div>
                          <div className="text-right">
                            <div className="flex items-center gap-1 text-yellow-600">
                              <Timer className="h-4 w-4" />
                              {getDaysRemaining(offer.deadline)}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-3">
                          <Badge variant="outline">₹{offer.finalFee.toLocaleString()}</Badge>
                          <div className="flex items-center gap-1">
                            <Button size="sm" variant="ghost" onClick={() => toast.success(`Reminder sent to ${offer.candidateName}`)}>
                              <Bell className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => toast.success(`Offer letter sent to ${offer.candidateName}`)}>
                              <Mail className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Expiring Soon */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                  Expiring Soon
                </CardTitle>
                <CardDescription>Offers expiring within 3 days</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[350px]">
                  <div className="space-y-3">
                    {mockOffers
                      .filter(o => o.status === 'pending' && o.deadline &&
                        differenceInDays(new Date(o.deadline), new Date()) <= 3)
                      .map((offer) => (
                        <div key={offer.id} className="p-3 border border-red-200 bg-red-50 rounded-lg">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">{offer.candidateName}</p>
                              <p className="text-xs text-muted-foreground">{offer.email}</p>
                            </div>
                            <Badge variant="destructive">
                              {differenceInDays(new Date(offer.deadline!), new Date())} days left
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 mt-3">
                            <Button size="sm" variant="outline" className="flex-1" onClick={() => toast.success(`Reminder sent to ${offer.candidateName}`)}>
                              <Bell className="mr-2 h-3 w-3" />
                              Remind
                            </Button>
                            <Button size="sm" variant="outline" className="flex-1" onClick={() => toast.success('Deadline extended by 7 days')}>
                              <Calendar className="mr-2 h-3 w-3" />
                              Extend
                            </Button>
                          </div>
                        </div>
                      ))}
                    {mockOffers.filter(o => o.status === 'pending' && o.deadline &&
                      differenceInDays(new Date(o.deadline), new Date()) <= 3).length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        <CheckCircle2 className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p>No offers expiring soon</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Documents Pending */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5 text-blue-500" />
                  Documents Pending
                </CardTitle>
                <CardDescription>Accepted offers awaiting document submission</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[250px]">
                  <div className="space-y-3">
                    {mockOffers
                      .filter(o => o.status === 'accepted' && !o.documentsSubmitted)
                      .map((offer) => (
                        <div key={offer.id} className="p-3 border rounded-lg">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">{offer.candidateName}</p>
                              <p className="text-xs text-muted-foreground">{offer.program}</p>
                            </div>
                            <Button size="sm" variant="outline" onClick={() => toast.success(`Document request sent to ${offer.candidateName}`)}>
                              <Mail className="mr-2 h-3 w-3" />
                              Request Docs
                            </Button>
                          </div>
                        </div>
                      ))}
                    {mockOffers.filter(o => o.status === 'accepted' && !o.documentsSubmitted).length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        <CheckCircle2 className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p>All documents submitted</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Draft Offers */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Edit className="h-5 w-5 text-gray-500" />
                  Draft Offers
                </CardTitle>
                <CardDescription>Offers ready to be sent</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[250px]">
                  <div className="space-y-3">
                    {mockOffers.filter(o => o.status === 'draft').map((offer) => (
                      <div key={offer.id} className="p-3 border rounded-lg">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{offer.candidateName}</p>
                            <p className="text-xs text-muted-foreground">{offer.program}</p>
                          </div>
                          <Button size="sm" onClick={() => toast.success(`Offer letter sent to ${offer.candidateName}`)}>
                            <Send className="mr-2 h-3 w-3" />
                            Send
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Templates Tab */}
        <TabsContent value="templates" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Template List */}
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Offer Letter Templates</CardTitle>
                      <CardDescription>Manage your offer letter templates</CardDescription>
                    </div>
                    <Button onClick={() => toast.success('Creating new template...')}>
                      <FilePlus className="mr-2 h-4 w-4" />
                      New Template
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {offerTemplates.map((template) => (
                      <div key={template.id} className="p-4 border rounded-lg hover:bg-muted/50">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <FileText className="h-8 w-8 text-muted-foreground" />
                            <div>
                              <div className="font-medium flex items-center gap-2">
                                {template.name}
                                {template.isDefault && (
                                  <Badge className="bg-primary/10 text-primary">Default</Badge>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground">{template.program}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button variant="ghost" size="sm" onClick={() => toast.success('Opening template preview...')}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => toast.success('Opening template editor...')}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => toast.success('Template duplicated')}>
                              <Copy className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Template Variables */}
            <Card>
              <CardHeader>
                <CardTitle>Available Variables</CardTitle>
                <CardDescription>Use these in your templates</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {[
                    { var: '{{candidate_name}}', desc: "Candidate's full name" },
                    { var: '{{program_name}}', desc: 'Program applied for' },
                    { var: '{{offer_date}}', desc: 'Date of offer' },
                    { var: '{{deadline_date}}', desc: 'Response deadline' },
                    { var: '{{total_fee}}', desc: 'Original fee amount' },
                    { var: '{{scholarship_percent}}', desc: 'Scholarship percentage' },
                    { var: '{{final_fee}}', desc: 'Fee after scholarship' },
                    { var: '{{token_amount}}', desc: 'Token fee amount' },
                    { var: '{{acceptance_link}}', desc: 'Online acceptance link' }
                  ].map((item) => (
                    <div key={item.var} className="p-2 border rounded text-sm">
                      <code className="text-primary">{item.var}</code>
                      <p className="text-xs text-muted-foreground mt-1">{item.desc}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Acceptance Funnel */}
            <Card>
              <CardHeader>
                <CardTitle>Acceptance Funnel</CardTitle>
                <CardDescription>Offer to enrollment conversion</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[
                    { stage: 'Offers Sent', count: 45, percent: 100, color: 'bg-blue-500' },
                    { stage: 'Viewed', count: 42, percent: 93, color: 'bg-purple-500' },
                    { stage: 'Accepted', count: 28, percent: 62, color: 'bg-green-500' },
                    { stage: 'Documents Submitted', count: 24, percent: 53, color: 'bg-teal-500' },
                    { stage: 'Token Paid', count: 22, percent: 49, color: 'bg-emerald-500' }
                  ].map((stage, index) => (
                    <div key={stage.stage} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span>{stage.stage}</span>
                        <span className="font-medium">{stage.count} ({stage.percent}%)</span>
                      </div>
                      <div className="h-8 bg-muted rounded overflow-hidden">
                        <div
                          className={`h-full ${stage.color} transition-all`}
                          style={{ width: `${stage.percent}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Response Time */}
            <Card>
              <CardHeader>
                <CardTitle>Response Time Analysis</CardTitle>
                <CardDescription>Average time to accept offers</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center p-3 border rounded-lg">
                      <p className="text-2xl font-bold text-green-600">2.3</p>
                      <p className="text-xs text-muted-foreground">days (fastest)</p>
                    </div>
                    <div className="text-center p-3 border rounded-lg bg-primary/5">
                      <p className="text-2xl font-bold text-primary">5.8</p>
                      <p className="text-xs text-muted-foreground">days (average)</p>
                    </div>
                    <div className="text-center p-3 border rounded-lg">
                      <p className="text-2xl font-bold text-yellow-600">9.2</p>
                      <p className="text-xs text-muted-foreground">days (slowest)</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {[
                      { range: 'Within 1 day', count: 5, percent: 18 },
                      { range: '2-3 days', count: 8, percent: 29 },
                      { range: '4-7 days', count: 10, percent: 36 },
                      { range: '7+ days', count: 5, percent: 18 }
                    ].map((bucket) => (
                      <div key={bucket.range} className="flex items-center gap-4">
                        <span className="w-24 text-sm">{bucket.range}</span>
                        <Progress value={bucket.percent} className="flex-1 h-2" />
                        <span className="w-12 text-sm text-right">{bucket.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Decline Reasons */}
            <Card>
              <CardHeader>
                <CardTitle>Decline Reasons</CardTitle>
                <CardDescription>Why candidates declined offers</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[
                    { reason: 'Joined another institution', count: 8, percent: 40 },
                    { reason: 'Financial constraints', count: 5, percent: 25 },
                    { reason: 'Location preference', count: 3, percent: 15 },
                    { reason: 'Program mismatch', count: 2, percent: 10 },
                    { reason: 'Other reasons', count: 2, percent: 10 }
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

            {/* Program-wise Acceptance */}
            <Card>
              <CardHeader>
                <CardTitle>Program-wise Acceptance</CardTitle>
                <CardDescription>Acceptance rates by program</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[
                    { program: 'B.Tech Computer Science', sent: 20, accepted: 15, rate: 75 },
                    { program: 'B.Tech Electronics', sent: 12, accepted: 8, rate: 67 },
                    { program: 'MBA', sent: 8, accepted: 3, rate: 38 },
                    { program: 'B.Tech Mechanical', sent: 5, accepted: 2, rate: 40 }
                  ].map((item) => (
                    <div key={item.program} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{item.program}</span>
                        <span className="text-sm">{item.accepted}/{item.sent} ({item.rate}%)</span>
                      </div>
                      <Progress value={item.rate} className="h-2" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Create Offer Dialog */}
      <Dialog open={isCreateOfferDialogOpen} onOpenChange={setIsCreateOfferDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create New Offer</DialogTitle>
            <DialogDescription>
              Generate an offer letter for a shortlisted candidate
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Select Candidate</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a candidate" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="app-001">Priya Sharma - B.Tech CS</SelectItem>
                  <SelectItem value="app-002">Rahul Kumar - B.Tech CS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Template</Label>
              <Select defaultValue="1">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {offerTemplates.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Scholarship (%)</Label>
                <Input type="number" min="0" max="100" defaultValue="0" />
              </div>
              <div className="space-y-2">
                <Label>Response Deadline</Label>
                <Input type="date" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Additional Notes</Label>
              <Textarea placeholder="Any special conditions or notes..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOfferDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="outline" onClick={() => toast.success('Opening preview...')}>
              <Eye className="mr-2 h-4 w-4" />
              Preview
            </Button>
            <Button
              disabled={isCreatingOffer}
              onClick={async () => {
                setIsCreatingOffer(true);
                await new Promise(resolve => setTimeout(resolve, 1500));
                toast.success('Offer letter created and sent');
                setIsCreatingOffer(false);
                setIsCreateOfferDialogOpen(false);
              }}
            >
              {isCreatingOffer ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Create & Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Offer Dialog */}
      <Dialog open={isViewOfferDialogOpen} onOpenChange={setIsViewOfferDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Offer Letter Details</DialogTitle>
            <DialogDescription>
              {selectedOffer?.id} - {selectedOffer?.candidateName}
            </DialogDescription>
          </DialogHeader>
          {selectedOffer && (
            <div className="space-y-6 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-muted-foreground">Candidate</Label>
                  <p className="font-medium">{selectedOffer.candidateName}</p>
                  <p className="text-sm text-muted-foreground">{selectedOffer.email}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground">Program</Label>
                  <p className="font-medium">{selectedOffer.program}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground">Status</Label>
                  {getStatusBadge(selectedOffer.status)}
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground">Offer Date</Label>
                  <p className="font-medium">
                    {selectedOffer.offerDate ? format(new Date(selectedOffer.offerDate), 'MMM dd, yyyy') : '-'}
                  </p>
                </div>
              </div>
              <div className="p-4 border rounded-lg bg-muted/50">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Fee</p>
                    <p className="text-lg font-bold">₹{selectedOffer.totalFee.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Scholarship</p>
                    <p className="text-lg font-bold text-purple-600">{selectedOffer.scholarship}%</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Final Fee</p>
                    <p className="text-lg font-bold text-green-600">₹{selectedOffer.finalFee.toLocaleString()}</p>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  {selectedOffer.documentsSubmitted ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  ) : (
                    <XCircle className="h-5 w-5 text-gray-300" />
                  )}
                  <span className="text-sm">Documents Submitted</span>
                </div>
                <div className="flex items-center gap-2">
                  {selectedOffer.tokenPaid ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  ) : (
                    <XCircle className="h-5 w-5 text-gray-300" />
                  )}
                  <span className="text-sm">Token Fee Paid</span>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => toast.success('Downloading offer letter PDF...')}>
              <Download className="mr-2 h-4 w-4" />
              Download PDF
            </Button>
            <Button variant="outline" onClick={() => toast.success('Preparing print preview...')}>
              <Printer className="mr-2 h-4 w-4" />
              Print
            </Button>
            <Button onClick={() => setIsViewOfferDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reminder Dialog */}
      <Dialog open={isReminderDialogOpen} onOpenChange={setIsReminderDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send Reminders</DialogTitle>
            <DialogDescription>
              Send reminder emails to pending candidates
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Target Group</Label>
              <Select defaultValue="expiring">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Pending ({pendingOffers})</SelectItem>
                  <SelectItem value="expiring">Expiring in 3 days (2)</SelectItem>
                  <SelectItem value="no-response">No response in 5+ days (1)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Message Template</Label>
              <Select defaultValue="default">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default Reminder</SelectItem>
                  <SelectItem value="urgent">Urgent - Last Chance</SelectItem>
                  <SelectItem value="friendly">Friendly Follow-up</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm">
                <strong>Preview:</strong> 2 candidates will receive reminder emails
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsReminderDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={isSendingReminders}
              onClick={async () => {
                setIsSendingReminders(true);
                await new Promise(resolve => setTimeout(resolve, 1500));
                toast.success('Reminders sent successfully');
                setIsSendingReminders(false);
                setIsReminderDialogOpen(false);
              }}
            >
              {isSendingReminders ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Send Reminders
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function OfferLetterPage() {
  return (
    <AdmissionErrorBoundary>
      <OfferLetterPageContent />
    </AdmissionErrorBoundary>
  );
}
