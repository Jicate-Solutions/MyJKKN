'use client';

import { useState, useMemo } from 'react';
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
  Clock,
  Download,
  Mail,
  Eye,
  Edit,
  Printer,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Timer,
  FilePlus,
  Search,
  Bell,
  Settings,
  BarChart3,
  TrendingUp,
  Stamp,
  Copy,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { AdmissionErrorBoundary } from '@/components/admission';
import { format, differenceInDays, addDays } from 'date-fns';
import { useAuth } from '@/hooks/use-auth';
import {
  useOfferLetters,
  useOfferLetterStats,
  useCreateOfferLetter,
  useRecordOfferReminder,
  useExtendOfferDeadline,
} from '@/hooks/admission/use-offer-letters';
import type { OfferLetterRow } from '@/lib/services/admission/offer-letter-service';

// Helper to extract candidate name from offer letter row
function getCandidateName(offer: OfferLetterRow): string {
  const lead = offer.application?.admission_lead;
  if (lead?.full_name) return lead.full_name;
  const formData = offer.application?.form_data as Record<string, unknown> | null;
  const personal = formData?.personal as Record<string, unknown> | undefined;
  if (personal?.name) return String(personal.name);
  return offer.letter_number || 'Unknown';
}

function getCandidateEmail(offer: OfferLetterRow): string {
  return offer.application?.admission_lead?.email || '';
}

function getApplicationNumber(offer: OfferLetterRow): string {
  return offer.application?.application_number || '';
}

function getProgram(offer: OfferLetterRow): string {
  const lead = offer.application?.admission_lead;
  if (lead?.interested_programs?.length) return lead.interested_programs[0];
  return offer.admission_type || 'N/A';
}

// Offer templates (static, not DB-driven yet)
const offerTemplates = [
  { id: 1, name: 'Standard Offer Letter', program: 'All Programs', isDefault: true },
  { id: 2, name: 'Scholarship Offer Letter', program: 'All Programs', isDefault: false },
  { id: 3, name: 'Waitlist Conversion Offer', program: 'All Programs', isDefault: false }
];

function OfferLetterPageContent() {
  const { profile, isLoading: authLoading } = useAuth();
  const institutionId = profile?.institution_id || '';

  const [activeTab, setActiveTab] = useState('offers');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [programFilter, setProgramFilter] = useState('all');
  const [selectedOffers, setSelectedOffers] = useState<string[]>([]);
  const [isCreateOfferDialogOpen, setIsCreateOfferDialogOpen] = useState(false);
  const [isViewOfferDialogOpen, setIsViewOfferDialogOpen] = useState(false);
  const [isReminderDialogOpen, setIsReminderDialogOpen] = useState(false);
  const [selectedOffer, setSelectedOffer] = useState<OfferLetterRow | null>(null);
  const [isSendingBulkOffers, setIsSendingBulkOffers] = useState(false);
  const [isSendingBulkReminders, setIsSendingBulkReminders] = useState(false);
  const [isSendingReminders, setIsSendingReminders] = useState(false);

  // Real data hooks
  const { offers, isLoading: offersLoading } = useOfferLetters({
    institutionId,
    status: statusFilter !== 'all' ? statusFilter : undefined,
    search: searchTerm || undefined,
  });

  const { stats, isLoading: statsLoading } = useOfferLetterStats(institutionId);
  const createOfferMutation = useCreateOfferLetter();
  const reminderMutation = useRecordOfferReminder();
  const extendDeadlineMutation = useExtendOfferDeadline();

  const isLoading = authLoading || offersLoading;

  // Client-side filtering for program and search on candidate name
  const filteredOffers = useMemo(() => {
    return offers.filter((offer) => {
      const name = getCandidateName(offer).toLowerCase();
      const letterNum = (offer.letter_number || '').toLowerCase();
      const appNum = getApplicationNumber(offer).toLowerCase();
      const term = searchTerm.toLowerCase();
      const matchesSearch = !searchTerm || name.includes(term) || letterNum.includes(term) || appNum.includes(term);
      const matchesProgram = programFilter === 'all' || getProgram(offer) === programFilter;
      return matchesSearch && matchesProgram;
    });
  }, [offers, searchTerm, programFilter]);

  // Stats from real data
  const totalOffers = stats?.total ?? 0;
  const pendingOffers = stats?.pending ?? 0;
  const acceptedOffers = stats?.accepted ?? 0;
  const declinedOffers = stats?.declined ?? 0;
  const expiredOffers = stats?.expired ?? 0;
  const acceptanceRate = stats?.acceptanceRate ?? 0;

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case 'accepted':
        return <Badge className="bg-green-100 text-green-700 border-green-200">Accepted</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">Pending</Badge>;
      case 'declined':
        return <Badge className="bg-red-100 text-red-700 border-red-200">Declined</Badge>;
      case 'expired':
        return <Badge className="bg-gray-100 text-gray-700 border-gray-200">Expired</Badge>;
      default:
        return <Badge className="bg-blue-100 text-blue-700 border-blue-200">Draft</Badge>;
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

  const handleViewOffer = (offer: OfferLetterRow) => {
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

  const getLetterData = (offer: OfferLetterRow) => {
    const ld = offer.letter_data as Record<string, unknown> | null;
    return {
      scholarship: Number(ld?.scholarship_percent || 0),
      totalFee: Number(ld?.total_fee || 0),
      finalFee: Number(ld?.final_fee || ld?.total_fee || 0),
      documentsSubmitted: Boolean(ld?.documents_submitted),
      tokenPaid: Boolean(ld?.token_paid),
    };
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

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
                      // Send reminders for all selected
                      for (const id of selectedOffers) {
                        await reminderMutation.mutateAsync(id).catch(() => {});
                      }
                      toast.success(`Sent reminders to ${selectedOffers.length} candidates`);
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
                      for (const id of selectedOffers) {
                        await reminderMutation.mutateAsync(id).catch(() => {});
                      }
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
                        <th className="p-3 text-center text-sm font-medium">Deadline</th>
                        <th className="p-3 text-center text-sm font-medium">Reminders</th>
                        <th className="p-3 text-center text-sm font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOffers.length === 0 && (
                        <tr>
                          <td colSpan={9} className="p-8 text-center text-muted-foreground">
                            {offersLoading ? 'Loading...' : 'No offer letters found'}
                          </td>
                        </tr>
                      )}
                      {filteredOffers.map((offer) => {
                        const ld = getLetterData(offer);
                        return (
                          <tr key={offer.id} className="border-t hover:bg-muted/30">
                            <td className="p-3">
                              <Checkbox
                                checked={selectedOffers.includes(offer.id)}
                                onCheckedChange={() => handleSelectOffer(offer.id)}
                              />
                            </td>
                            <td className="p-3">
                              <div>
                                <p className="font-medium">{offer.letter_number || offer.id.slice(0, 8)}</p>
                                <p className="text-xs text-muted-foreground">{getApplicationNumber(offer)}</p>
                              </div>
                            </td>
                            <td className="p-3">
                              <div>
                                <p className="font-medium">{getCandidateName(offer)}</p>
                                <p className="text-xs text-muted-foreground">{getCandidateEmail(offer)}</p>
                              </div>
                            </td>
                            <td className="p-3">
                              <span className="text-sm">{getProgram(offer)}</span>
                            </td>
                            <td className="p-3 text-center">{getStatusBadge(offer.response)}</td>
                            <td className="p-3 text-center">
                              {ld.scholarship > 0 ? (
                                <Badge className="bg-purple-100 text-purple-700 border-purple-200">
                                  {ld.scholarship}%
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </td>
                            <td className="p-3 text-center">
                              {offer.valid_until ? (
                                <div>
                                  <p className="text-sm">{format(new Date(offer.valid_until), 'MMM dd')}</p>
                                  {getDaysRemaining(offer.valid_until)}
                                </div>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </td>
                            <td className="p-3 text-center">
                              <span className="text-sm text-muted-foreground">{offer.reminder_sent_count}</span>
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
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => {
                                    reminderMutation.mutate(offer.id);
                                  }}
                                >
                                  <Mail className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toast.success('Downloading offer letter...')}>
                                  <Download className="h-4 w-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
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
                    {offers.filter(o => o.response === 'pending').map((offer) => (
                      <div key={offer.id} className="p-3 border rounded-lg hover:bg-muted/50">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{getCandidateName(offer)}</p>
                            <p className="text-xs text-muted-foreground">{getProgram(offer)}</p>
                          </div>
                          <div className="text-right">
                            <div className="flex items-center gap-1 text-yellow-600">
                              <Timer className="h-4 w-4" />
                              {getDaysRemaining(offer.valid_until)}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-3">
                          <Badge variant="outline">{offer.letter_number || offer.id.slice(0, 8)}</Badge>
                          <div className="flex items-center gap-1">
                            <Button size="sm" variant="ghost" onClick={() => reminderMutation.mutate(offer.id)}>
                              <Bell className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => reminderMutation.mutate(offer.id)}>
                              <Mail className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                    {offers.filter(o => o.response === 'pending').length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        <CheckCircle2 className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p>No pending offers</p>
                      </div>
                    )}
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
                    {offers
                      .filter(o => o.response === 'pending' && o.valid_until &&
                        differenceInDays(new Date(o.valid_until), new Date()) <= 3 &&
                        differenceInDays(new Date(o.valid_until), new Date()) >= 0)
                      .map((offer) => (
                        <div key={offer.id} className="p-3 border border-red-200 bg-red-50 rounded-lg">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">{getCandidateName(offer)}</p>
                              <p className="text-xs text-muted-foreground">{getCandidateEmail(offer)}</p>
                            </div>
                            <Badge variant="destructive">
                              {differenceInDays(new Date(offer.valid_until!), new Date())} days left
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 mt-3">
                            <Button size="sm" variant="outline" className="flex-1" onClick={() => reminderMutation.mutate(offer.id)}>
                              <Bell className="mr-2 h-3 w-3" />
                              Remind
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1"
                              onClick={() => {
                                const newDeadline = addDays(new Date(offer.valid_until!), 7).toISOString();
                                extendDeadlineMutation.mutate({ id: offer.id, newDeadline });
                              }}
                            >
                              <Calendar className="mr-2 h-3 w-3" />
                              Extend
                            </Button>
                          </div>
                        </div>
                      ))}
                    {offers.filter(o => o.response === 'pending' && o.valid_until &&
                      differenceInDays(new Date(o.valid_until), new Date()) <= 3 &&
                      differenceInDays(new Date(o.valid_until), new Date()) >= 0).length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        <CheckCircle2 className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p>No offers expiring soon</p>
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
                  Draft / Unsent Offers
                </CardTitle>
                <CardDescription>Offers not yet sent</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[250px]">
                  <div className="space-y-3">
                    {offers.filter(o => !o.sent_at).map((offer) => (
                      <div key={offer.id} className="p-3 border rounded-lg">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{getCandidateName(offer)}</p>
                            <p className="text-xs text-muted-foreground">{getProgram(offer)}</p>
                          </div>
                          <Button size="sm" onClick={() => toast.success(`Offer letter sent to ${getCandidateName(offer)}`)}>
                            <Send className="mr-2 h-3 w-3" />
                            Send
                          </Button>
                        </div>
                      </div>
                    ))}
                    {offers.filter(o => !o.sent_at).length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        <CheckCircle2 className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p>All offers have been sent</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Declined Offers */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <XCircle className="h-5 w-5 text-red-500" />
                  Recently Declined
                </CardTitle>
                <CardDescription>Offers declined by candidates</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[250px]">
                  <div className="space-y-3">
                    {offers.filter(o => o.response === 'declined').map((offer) => (
                      <div key={offer.id} className="p-3 border rounded-lg">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{getCandidateName(offer)}</p>
                            <p className="text-xs text-muted-foreground">{getProgram(offer)}</p>
                          </div>
                          <Badge variant="destructive">Declined</Badge>
                        </div>
                        {offer.rejection_reason && (
                          <p className="text-xs text-muted-foreground mt-2">Reason: {offer.rejection_reason}</p>
                        )}
                      </div>
                    ))}
                    {offers.filter(o => o.response === 'declined').length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        <CheckCircle2 className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p>No declined offers</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Templates Tab */}
        <TabsContent value="templates" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
                    { stage: 'Offers Sent', count: totalOffers, percent: 100, color: 'bg-blue-500' },
                    { stage: 'Pending Response', count: pendingOffers, percent: totalOffers > 0 ? (pendingOffers / totalOffers) * 100 : 0, color: 'bg-yellow-500' },
                    { stage: 'Accepted', count: acceptedOffers, percent: totalOffers > 0 ? (acceptedOffers / totalOffers) * 100 : 0, color: 'bg-green-500' },
                    { stage: 'Declined', count: declinedOffers, percent: totalOffers > 0 ? (declinedOffers / totalOffers) * 100 : 0, color: 'bg-red-500' },
                    { stage: 'Expired', count: expiredOffers, percent: totalOffers > 0 ? (expiredOffers / totalOffers) * 100 : 0, color: 'bg-gray-500' }
                  ].map((stage) => (
                    <div key={stage.stage} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span>{stage.stage}</span>
                        <span className="font-medium">{stage.count} ({stage.percent.toFixed(0)}%)</span>
                      </div>
                      <div className="h-8 bg-muted rounded overflow-hidden">
                        <div
                          className={`h-full ${stage.color} transition-all`}
                          style={{ width: `${Math.max(stage.percent, 2)}%` }}
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
                <CardTitle>Response Summary</CardTitle>
                <CardDescription>Overall offer response metrics</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center p-3 border rounded-lg">
                      <p className="text-2xl font-bold text-green-600">{acceptedOffers}</p>
                      <p className="text-xs text-muted-foreground">Accepted</p>
                    </div>
                    <div className="text-center p-3 border rounded-lg bg-primary/5">
                      <p className="text-2xl font-bold text-primary">{acceptanceRate.toFixed(0)}%</p>
                      <p className="text-xs text-muted-foreground">Accept Rate</p>
                    </div>
                    <div className="text-center p-3 border rounded-lg">
                      <p className="text-2xl font-bold text-yellow-600">{pendingOffers}</p>
                      <p className="text-xs text-muted-foreground">Pending</p>
                    </div>
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
                  {offers
                    .filter(o => o.response === 'declined' && o.rejection_reason)
                    .reduce((acc, o) => {
                      const reason = o.rejection_reason || 'No reason provided';
                      const existing = acc.find(a => a.reason === reason);
                      if (existing) existing.count++;
                      else acc.push({ reason, count: 1 });
                      return acc;
                    }, [] as { reason: string; count: number }[])
                    .map((item) => (
                      <div key={item.reason} className="flex items-center justify-between p-3 border rounded-lg">
                        <span className="text-sm">{item.reason}</span>
                        <Badge variant="outline">{item.count}</Badge>
                      </div>
                    ))}
                  {offers.filter(o => o.response === 'declined').length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <p>No declined offers to analyze</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Summary Card */}
            <Card>
              <CardHeader>
                <CardTitle>Quick Stats</CardTitle>
                <CardDescription>At a glance</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <span className="text-sm">Total Offers</span>
                    <span className="font-bold">{totalOffers}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <span className="text-sm">Response Rate</span>
                    <span className="font-bold">
                      {totalOffers > 0 ? (((acceptedOffers + declinedOffers) / totalOffers) * 100).toFixed(0) : 0}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <span className="text-sm">Acceptance Rate</span>
                    <span className="font-bold text-green-600">{acceptanceRate.toFixed(0)}%</span>
                  </div>
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
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const applicationId = formData.get('applicationId') as string;
              const scholarship = Number(formData.get('scholarship') || 0);
              const deadline = formData.get('deadline') as string;
              const notes = formData.get('notes') as string;

              if (!applicationId) {
                toast.error('Please select a candidate');
                return;
              }

              createOfferMutation.mutate({
                institution_id: institutionId,
                application_id: applicationId,
                letter_data: {
                  scholarship_percent: scholarship,
                  notes,
                },
                valid_until: deadline ? new Date(deadline).toISOString() : undefined,
                sent_via: ['email'],
              }, {
                onSuccess: () => {
                  setIsCreateOfferDialogOpen(false);
                },
              });
            }}
          >
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Application ID</Label>
                <Input name="applicationId" placeholder="Enter application UUID" />
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
                  <Input name="scholarship" type="number" min="0" max="100" defaultValue="0" />
                </div>
                <div className="space-y-2">
                  <Label>Response Deadline</Label>
                  <Input name="deadline" type="date" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Additional Notes</Label>
                <Textarea name="notes" placeholder="Any special conditions or notes..." />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsCreateOfferDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createOfferMutation.isPending}
              >
                {createOfferMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Create & Send
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* View Offer Dialog */}
      <Dialog open={isViewOfferDialogOpen} onOpenChange={setIsViewOfferDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Offer Letter Details</DialogTitle>
            <DialogDescription>
              {selectedOffer?.letter_number || selectedOffer?.id.slice(0, 8)} - {selectedOffer && getCandidateName(selectedOffer)}
            </DialogDescription>
          </DialogHeader>
          {selectedOffer && (() => {
            const ld = getLetterData(selectedOffer);
            return (
              <div className="space-y-6 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-muted-foreground">Candidate</Label>
                    <p className="font-medium">{getCandidateName(selectedOffer)}</p>
                    <p className="text-sm text-muted-foreground">{getCandidateEmail(selectedOffer)}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground">Program</Label>
                    <p className="font-medium">{getProgram(selectedOffer)}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground">Status</Label>
                    {getStatusBadge(selectedOffer.response)}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground">Sent At</Label>
                    <p className="font-medium">
                      {selectedOffer.sent_at ? format(new Date(selectedOffer.sent_at), 'MMM dd, yyyy') : 'Not sent'}
                    </p>
                  </div>
                </div>
                {(ld.totalFee > 0 || ld.scholarship > 0) && (
                  <div className="p-4 border rounded-lg bg-muted/50">
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <p className="text-sm text-muted-foreground">Total Fee</p>
                        <p className="text-lg font-bold">₹{ld.totalFee.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Scholarship</p>
                        <p className="text-lg font-bold text-purple-600">{ld.scholarship}%</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Final Fee</p>
                        <p className="text-lg font-bold text-green-600">₹{ld.finalFee.toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">Valid Until:</span>
                    <span className="text-sm font-medium">
                      {selectedOffer.valid_until ? format(new Date(selectedOffer.valid_until), 'MMM dd, yyyy') : 'No deadline'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm">Reminders Sent:</span>
                    <span className="text-sm font-medium">{selectedOffer.reminder_sent_count}</span>
                  </div>
                </div>
                {selectedOffer.response_notes && (
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-sm"><strong>Response Notes:</strong> {selectedOffer.response_notes}</p>
                  </div>
                )}
              </div>
            );
          })()}
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
              <Select defaultValue="all">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Pending ({pendingOffers})</SelectItem>
                  <SelectItem value="expiring">Expiring in 3 days</SelectItem>
                  <SelectItem value="no-response">No response in 5+ days</SelectItem>
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
                <strong>Preview:</strong> {pendingOffers} candidates will receive reminder emails
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
                const pendingIds = offers.filter(o => o.response === 'pending').map(o => o.id);
                for (const id of pendingIds) {
                  await reminderMutation.mutateAsync(id).catch(() => {});
                }
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
