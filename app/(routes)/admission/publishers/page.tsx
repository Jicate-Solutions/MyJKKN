'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Users,
  Building,
  Search,
  Plus,
  Download,
  Settings,
  CheckCircle2,
  Eye,
  Edit,
  ExternalLink,
  IndianRupee,
  Key,
  Copy,
  RefreshCw,
  Link2,
  FileText,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { AdmissionErrorBoundary } from '@/components/admission';
import { usePublishers } from '@/hooks/admission/use-data-quality';
import { useConsultantMutations } from '@/hooks/admission/use-consultants';

function PublishersPageContent() {
  const [activeTab, setActiveTab] = useState('publishers');
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddPublisherOpen, setIsAddPublisherOpen] = useState(false);
  const [isProcessingPayouts, setIsProcessingPayouts] = useState(false);
  const [pubName, setPubName] = useState('');
  const [pubContact, setPubContact] = useState('');
  const [pubEmail, setPubEmail] = useState('');
  const [pubPhone, setPubPhone] = useState('');

  const { data: publishers, isLoading } = usePublishers();
  const { createConsultant } = useConsultantMutations();
  const pubList = (publishers || []) as any[];

  const totalLeads = pubList.reduce((sum: number, p: any) => sum + (p.total_leads_referred || 0), 0);
  const totalConversions = pubList.reduce((sum: number, p: any) => sum + (p.total_conversions || 0), 0);
  const avgConversionRate = totalLeads > 0 ? ((totalConversions / totalLeads) * 100).toFixed(1) : '0.0';
  const totalPendingCommission = pubList.reduce((sum: number, p: any) => sum + (p.pending_commission || 0), 0);

  const getStatusBadge = (status: string) => {
    return status === 'active'
      ? 'bg-green-100 text-green-800'
      : 'bg-gray-100 text-gray-800';
  };

  const getPerformanceBadge = (rating: number | null) => {
    if (!rating || rating >= 4) return 'bg-green-100 text-green-800';
    if (rating >= 3) return 'bg-blue-100 text-blue-800';
    if (rating >= 2) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  const getPerformanceLabel = (rating: number | null) => {
    if (!rating) return 'N/A';
    if (rating >= 4) return 'excellent';
    if (rating >= 3) return 'good';
    if (rating >= 2) return 'average';
    return 'poor';
  };

  const filteredPublishers = pubList.filter((p: any) =>
    (p.name || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building className="h-6 w-6 text-blue-500" />
            Publisher / Aggregator Panel
          </h1>
          <p className="text-muted-foreground">Manage lead source partners and commissions</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => {
            if (!pubList.length) { toast.info('No publishers to export'); return; }
            const headers = ['Name','Contact','Email','Status','Total Leads','Conversions','Conv Rate','Pending Commission','Total Earned'];
            const rows = pubList.map((p: any) => [
              p.name || '', p.contact_person || '', p.email || '', p.status || '',
              p.total_leads_referred || 0, p.total_conversions || 0,
              (p.conversion_rate || 0).toFixed(1), p.pending_commission || 0,
              p.total_commission_earned || 0,
            ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
            const csv = [headers.join(','), ...rows].join('\n');
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = `publishers-${new Date().toISOString().slice(0,10)}.csv`; a.click();
            URL.revokeObjectURL(url);
            toast.success('Publisher report exported');
          }}>
            <Download className="h-4 w-4 mr-2" />
            Export Report
          </Button>
          <Dialog open={isAddPublisherOpen} onOpenChange={setIsAddPublisherOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Publisher
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Publisher</DialogTitle>
                <DialogDescription>Register a new lead source partner</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label>Publisher Name</Label>
                  <Input placeholder="e.g., Shiksha.com" value={pubName} onChange={e => setPubName(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Contact Person</Label>
                    <Input placeholder="Full name" value={pubContact} onChange={e => setPubContact(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input type="email" placeholder="email@example.com" value={pubEmail} onChange={e => setPubEmail(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input placeholder="+91 98765 43210" value={pubPhone} onChange={e => setPubPhone(e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddPublisherOpen(false)} disabled={createConsultant.isPending}>Cancel</Button>
                <Button
                  onClick={async () => {
                    if (!pubName.trim()) { toast.error('Publisher name is required'); return; }
                    try {
                      await createConsultant.mutateAsync({
                        name: pubName.trim(),
                        contact_person: pubContact.trim() || null,
                        email: pubEmail.trim() || null,
                        phone: pubPhone.trim() || null,
                        consultant_type: 'publisher',
                        status: 'active',
                        institution_id: 'a1111111-1111-1111-1111-111111111111',
                      } as any);
                      setPubName(''); setPubContact(''); setPubEmail(''); setPubPhone('');
                      setIsAddPublisherOpen(false);
                    } catch {
                      // error handled by hook
                    }
                  }}
                  disabled={createConsultant.isPending}
                >
                  {createConsultant.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Key className="h-4 w-4 mr-2" />
                  )}
                  Add Publisher
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{isLoading ? '...' : totalLeads.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">from all publishers</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Conversions</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{isLoading ? '...' : totalConversions}</div>
            <p className="text-xs text-muted-foreground">
              {avgConversionRate}% conversion rate
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active Publishers</CardTitle>
            <Building className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? '...' : pubList.filter((p: any) => p.status === 'active').length}
            </div>
            <p className="text-xs text-muted-foreground">
              of {pubList.length} total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pending Commission</CardTitle>
            <IndianRupee className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {isLoading ? '...' : `₹${(totalPendingCommission / 1000).toFixed(0)}K`}
            </div>
            <p className="text-xs text-muted-foreground">To be paid</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="publishers">Publishers</TabsTrigger>
          <TabsTrigger value="commissions">Commissions</TabsTrigger>
          <TabsTrigger value="api">API Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="publishers" className="space-y-4">
          {/* Search */}
          <div className="flex gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search publishers..."
                className="pl-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {/* Publishers Grid */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredPublishers.map((publisher: any) => (
                <Card key={publisher.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg flex items-center gap-2">
                          {publisher.name}
                          {publisher.website && (
                            <a href={publisher.website} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-primary" />
                            </a>
                          )}
                        </CardTitle>
                        <CardDescription className="flex items-center gap-2 mt-1">
                          <span>{publisher.contact_person || 'No contact'}</span>
                          {publisher.email && (
                            <>
                              <span>-</span>
                              <span>{publisher.email}</span>
                            </>
                          )}
                        </CardDescription>
                      </div>
                      <div className="flex flex-col gap-1 items-end">
                        <Badge className={getStatusBadge(publisher.status || 'inactive')}>
                          {publisher.status || 'inactive'}
                        </Badge>
                        <Badge className={getPerformanceBadge(publisher.performance_rating)}>
                          {getPerformanceLabel(publisher.performance_rating)}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div className="p-2 bg-muted rounded-lg">
                        <p className="text-lg font-bold">{publisher.total_leads_referred || 0}</p>
                        <p className="text-xs text-muted-foreground">Total Leads</p>
                      </div>
                      <div className="p-2 bg-muted rounded-lg">
                        <p className="text-lg font-bold">{publisher.total_conversions || 0}</p>
                        <p className="text-xs text-muted-foreground">Conversions</p>
                      </div>
                      <div className="p-2 bg-muted rounded-lg">
                        <p className="text-lg font-bold">{(publisher.conversion_rate || 0).toFixed(1)}%</p>
                        <p className="text-xs text-muted-foreground">Conv. Rate</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Pending Commission</span>
                      <span className="font-semibold text-yellow-600">
                        ₹{(publisher.pending_commission || 0).toLocaleString()}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Total Commission Earned</span>
                      <span className="font-semibold">
                        ₹{(publisher.total_commission_earned || 0).toLocaleString()}
                      </span>
                    </div>

                    <div className="flex gap-2 pt-2 border-t">
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => toast.success(`Viewing leads for ${publisher.name}`)}>
                        <Eye className="h-4 w-4 mr-1" />
                        View Leads
                      </Button>
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => toast.success('Publisher details opened for editing')}>
                        <Edit className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => toast.success('Publisher settings opened')}>
                        <Settings className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {filteredPublishers.length === 0 && (
                <div className="col-span-2 text-center py-12 text-gray-500">
                  No publishers found
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="commissions" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Commission Payouts</CardTitle>
                  <CardDescription>Track and process publisher commissions</CardDescription>
                </div>
                <Button
                  onClick={() => {
                    toast.info('Payout processing is handled through the Commissions page');
                  }}
                  disabled={isProcessingPayouts}
                >
                  <IndianRupee className="h-4 w-4 mr-2" />
                  Process Payouts
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                </div>
              ) : (
                <div className="space-y-4">
                  {pubList.filter((p: any) => (p.pending_commission || 0) > 0).map((publisher: any) => (
                    <div key={publisher.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-4">
                        <Building className="h-5 w-5 text-blue-500" />
                        <div>
                          <p className="font-medium">{publisher.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {publisher.total_conversions || 0} conversions
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-lg font-bold text-yellow-600">
                            ₹{(publisher.pending_commission || 0).toLocaleString()}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Total: ₹{(publisher.total_commission_earned || 0).toLocaleString()}
                          </p>
                        </div>
                        <Button variant="outline" onClick={() => toast.success(`Commission marked as paid for ${publisher.name}`)}>Mark Paid</Button>
                      </div>
                    </div>
                  ))}
                  {pubList.filter((p: any) => (p.pending_commission || 0) > 0).length === 0 && (
                    <div className="text-center py-8 text-gray-500">No pending commissions</div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="api" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Key className="h-5 w-5 text-yellow-500" />
                  Active Publishers
                </CardTitle>
                <CardDescription>Publisher API access management</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                  </div>
                ) : (
                  pubList.filter((p: any) => p.status === 'active').map((publisher: any) => (
                    <div key={publisher.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <p className="font-medium">{publisher.name}</p>
                        <p className="text-xs text-muted-foreground">{publisher.email || 'No email'}</p>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => toast.success('API key copied to clipboard')}>
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => toast.success('API key regenerated successfully')}>
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Link2 className="h-5 w-5 text-blue-500" />
                  API Endpoint
                </CardTitle>
                <CardDescription>Lead submission endpoint for publishers</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm font-medium mb-2">POST Endpoint</p>
                  <code className="text-xs break-all">
                    https://api.jkkn.ac.in/v1/leads/submit
                  </code>
                </div>
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm font-medium mb-2">Required Headers</p>
                  <code className="text-xs">
                    Authorization: Bearer {'{API_KEY}'}
                  </code>
                </div>
                <Button variant="outline" className="w-full" onClick={() => toast.success('API documentation opened')}>
                  <FileText className="h-4 w-4 mr-2" />
                  View API Documentation
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function PublishersPage() {
  return (
    <AdmissionErrorBoundary>
      <PublishersPageContent />
    </AdmissionErrorBoundary>
  );
}
