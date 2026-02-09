'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Users,
  Building,
  TrendingUp,
  Search,
  Filter,
  Plus,
  Download,
  Settings,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  BarChart3,
  FileText,
  Eye,
  Edit,
  Trash2,
  ExternalLink,
  IndianRupee,
  Percent,
  ArrowUpRight,
  ArrowDownRight,
  Globe,
  Key,
  Copy,
  Mail,
  Phone,
  Link2,
  Shield,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { AdmissionErrorBoundary } from '@/components/admission';

// Mock data for publishers
const mockPublishers = [
  {
    id: 'PUB-001',
    name: 'Shiksha.com',
    website: 'https://shiksha.com',
    contactPerson: 'Rajesh Kumar',
    contactEmail: 'rajesh@shiksha.com',
    contactPhone: '+91 98765 43210',
    status: 'active',
    apiKey: 'sk_live_xxxxxxxxxxxxx',
    leadsThisMonth: 245,
    leadsTotal: 1850,
    conversions: 42,
    conversionRate: 17.1,
    commissionRate: 5,
    totalCommission: 126000,
    pendingCommission: 28000,
    lastLeadDate: '2026-01-16',
    performance: 'excellent'
  },
  {
    id: 'PUB-002',
    name: 'CollegeDekho',
    website: 'https://collegedekho.com',
    contactPerson: 'Priya Singh',
    contactEmail: 'priya@collegedekho.com',
    contactPhone: '+91 98765 43211',
    status: 'active',
    apiKey: 'sk_live_yyyyyyyyyyyyy',
    leadsThisMonth: 180,
    leadsTotal: 1420,
    conversions: 28,
    conversionRate: 15.5,
    commissionRate: 4.5,
    totalCommission: 94500,
    pendingCommission: 18000,
    lastLeadDate: '2026-01-15',
    performance: 'good'
  },
  {
    id: 'PUB-003',
    name: 'GetMyUni',
    website: 'https://getmyuni.com',
    contactPerson: 'Amit Patel',
    contactEmail: 'amit@getmyuni.com',
    contactPhone: '+91 98765 43212',
    status: 'active',
    apiKey: 'sk_live_zzzzzzzzzzzzz',
    leadsThisMonth: 95,
    leadsTotal: 780,
    conversions: 12,
    conversionRate: 12.6,
    commissionRate: 4,
    totalCommission: 48000,
    pendingCommission: 12000,
    lastLeadDate: '2026-01-14',
    performance: 'average'
  },
  {
    id: 'PUB-004',
    name: 'Careers360',
    website: 'https://careers360.com',
    contactPerson: 'Sneha Reddy',
    contactEmail: 'sneha@careers360.com',
    contactPhone: '+91 98765 43213',
    status: 'inactive',
    apiKey: 'sk_live_aaaaaaaaaaaaa',
    leadsThisMonth: 0,
    leadsTotal: 320,
    conversions: 8,
    conversionRate: 2.5,
    commissionRate: 3,
    totalCommission: 24000,
    pendingCommission: 0,
    lastLeadDate: '2025-12-20',
    performance: 'poor'
  }
];

const mockRecentLeads = [
  { id: 'LEAD-001', name: 'Rahul Kumar', program: 'B.Tech CSE', source: 'Shiksha.com', date: '2026-01-16', status: 'new' },
  { id: 'LEAD-002', name: 'Priya Sharma', program: 'MBA', source: 'CollegeDekho', date: '2026-01-16', status: 'contacted' },
  { id: 'LEAD-003', name: 'Amit Singh', program: 'B.Tech ECE', source: 'Shiksha.com', date: '2026-01-15', status: 'qualified' },
  { id: 'LEAD-004', name: 'Sneha Patel', program: 'M.Tech', source: 'GetMyUni', date: '2026-01-15', status: 'new' }
];

function PublishersPageContent() {
  const [activeTab, setActiveTab] = useState('publishers');
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddPublisherOpen, setIsAddPublisherOpen] = useState(false);
  const [isAddingPublisher, setIsAddingPublisher] = useState(false);
  const [isProcessingPayouts, setIsProcessingPayouts] = useState(false);

  const totalLeads = mockPublishers.reduce((sum, p) => sum + p.leadsThisMonth, 0);
  const totalConversions = mockPublishers.reduce((sum, p) => sum + p.conversions, 0);
  const avgConversionRate = totalLeads > 0 ? (totalConversions / totalLeads * 100).toFixed(1) : '0.0';
  const totalPendingCommission = mockPublishers.reduce((sum, p) => sum + p.pendingCommission, 0);

  const getStatusBadge = (status: string) => {
    return status === 'active'
      ? 'bg-green-100 text-green-800'
      : 'bg-gray-100 text-gray-800';
  };

  const getPerformanceBadge = (performance: string) => {
    const styles: Record<string, string> = {
      excellent: 'bg-green-100 text-green-800',
      good: 'bg-blue-100 text-blue-800',
      average: 'bg-yellow-100 text-yellow-800',
      poor: 'bg-red-100 text-red-800'
    };
    return styles[performance] || 'bg-gray-100 text-gray-800';
  };

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
          <Button variant="outline" size="sm" onClick={() => toast.success('Publisher report exported successfully')}>
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
                  <Input placeholder="e.g., Shiksha.com" />
                </div>
                <div className="space-y-2">
                  <Label>Website</Label>
                  <Input placeholder="https://example.com" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Contact Person</Label>
                    <Input placeholder="Full name" />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input type="email" placeholder="email@example.com" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Phone</Label>
                    <Input placeholder="+91 98765 43210" />
                  </div>
                  <div className="space-y-2">
                    <Label>Commission Rate (%)</Label>
                    <Input type="number" placeholder="5" />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddPublisherOpen(false)} disabled={isAddingPublisher}>Cancel</Button>
                <Button
                  onClick={async () => {
                    setIsAddingPublisher(true);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    toast.success('Publisher added successfully with API key generated');
                    setIsAddingPublisher(false);
                    setIsAddPublisherOpen(false);
                  }}
                  disabled={isAddingPublisher}
                >
                  {isAddingPublisher ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Key className="h-4 w-4 mr-2" />
                  )}
                  Generate API Key & Add
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
            <CardTitle className="text-sm font-medium">Leads This Month</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalLeads}</div>
            <p className="text-xs text-green-600 flex items-center gap-1">
              <ArrowUpRight className="h-3 w-3" />
              +12% from last month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Conversions</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalConversions}</div>
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
            <div className="text-2xl font-bold">{mockPublishers.filter(p => p.status === 'active').length}</div>
            <p className="text-xs text-muted-foreground">
              of {mockPublishers.length} total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pending Commission</CardTitle>
            <IndianRupee className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">₹{(totalPendingCommission / 1000).toFixed(0)}K</div>
            <p className="text-xs text-muted-foreground">
              To be paid
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="publishers">Publishers</TabsTrigger>
          <TabsTrigger value="leads">Recent Leads</TabsTrigger>
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {mockPublishers.map((publisher) => (
              <Card key={publisher.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        {publisher.name}
                        <a href={publisher.website} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4 text-muted-foreground hover:text-primary" />
                        </a>
                      </CardTitle>
                      <CardDescription className="flex items-center gap-2 mt-1">
                        <span>{publisher.contactPerson}</span>
                        <span>•</span>
                        <span>{publisher.contactEmail}</span>
                      </CardDescription>
                    </div>
                    <div className="flex flex-col gap-1 items-end">
                      <Badge className={getStatusBadge(publisher.status)}>
                        {publisher.status}
                      </Badge>
                      <Badge className={getPerformanceBadge(publisher.performance)}>
                        {publisher.performance}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="p-2 bg-muted rounded-lg">
                      <p className="text-lg font-bold">{publisher.leadsThisMonth}</p>
                      <p className="text-xs text-muted-foreground">Leads (Month)</p>
                    </div>
                    <div className="p-2 bg-muted rounded-lg">
                      <p className="text-lg font-bold">{publisher.conversions}</p>
                      <p className="text-xs text-muted-foreground">Conversions</p>
                    </div>
                    <div className="p-2 bg-muted rounded-lg">
                      <p className="text-lg font-bold">{publisher.conversionRate}%</p>
                      <p className="text-xs text-muted-foreground">Conv. Rate</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Commission Rate</span>
                    <span className="font-semibold">{publisher.commissionRate}%</span>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Pending Commission</span>
                    <span className="font-semibold text-yellow-600">₹{publisher.pendingCommission.toLocaleString()}</span>
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
          </div>
        </TabsContent>

        <TabsContent value="leads" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Leads from Publishers</CardTitle>
              <CardDescription>Latest leads received from all partners</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {mockRecentLeads.map((lead) => (
                  <div key={lead.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Users className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{lead.name}</p>
                        <p className="text-sm text-muted-foreground">{lead.program}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-sm font-medium">{lead.source}</p>
                        <p className="text-xs text-muted-foreground">{lead.date}</p>
                      </div>
                      <Badge className={
                        lead.status === 'qualified' ? 'bg-green-100 text-green-800' :
                        lead.status === 'contacted' ? 'bg-blue-100 text-blue-800' :
                        'bg-yellow-100 text-yellow-800'
                      }>
                        {lead.status}
                      </Badge>
                      <Button variant="ghost" size="sm" onClick={() => toast.success(`Viewing details for ${lead.name}`)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
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
                  onClick={async () => {
                    setIsProcessingPayouts(true);
                    await new Promise(resolve => setTimeout(resolve, 1500));
                    toast.success('Commission payouts processed successfully');
                    setIsProcessingPayouts(false);
                  }}
                  disabled={isProcessingPayouts}
                >
                  {isProcessingPayouts ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <IndianRupee className="h-4 w-4 mr-2" />
                  )}
                  Process Payouts
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {mockPublishers.filter(p => p.pendingCommission > 0).map((publisher) => (
                  <div key={publisher.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-4">
                      <Building className="h-5 w-5 text-blue-500" />
                      <div>
                        <p className="font-medium">{publisher.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {publisher.conversions} conversions @ {publisher.commissionRate}%
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-lg font-bold text-yellow-600">
                          ₹{publisher.pendingCommission.toLocaleString()}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Total: ₹{publisher.totalCommission.toLocaleString()}
                        </p>
                      </div>
                      <Button variant="outline" onClick={() => toast.success(`Commission marked as paid for ${publisher.name}`)}>Mark Paid</Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="api" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Key className="h-5 w-5 text-yellow-500" />
                  API Keys
                </CardTitle>
                <CardDescription>Manage publisher API access</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {mockPublishers.filter(p => p.status === 'active').map((publisher) => (
                  <div key={publisher.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium">{publisher.name}</p>
                      <code className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                        {publisher.apiKey.slice(0, 20)}...
                      </code>
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
                ))}
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
