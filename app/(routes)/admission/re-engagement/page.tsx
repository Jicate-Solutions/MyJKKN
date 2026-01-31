'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useAuth } from '@/hooks/use-auth';
import {
  Flame,
  Snowflake,
  RefreshCw,
  Search,
  Filter,
  Send,
  Clock,
  CheckCircle,
  XCircle,
  TrendingUp,
  Users,
  Calendar,
  Mail,
  MessageCircle,
  Phone,
  Play,
  Pause,
  MoreHorizontal,
  Target,
  Zap,
  AlertCircle,
  ArrowRight,
  History,
  Loader2
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow, differenceInDays } from 'date-fns';
import { AdmissionErrorBoundary } from '@/components/admission';

// Types
interface ColdLead {
  id: string;
  name: string;
  email: string;
  phone: string;
  program: string;
  source: string;
  lastContactDate: string;
  daysSinceContact: number;
  previousStage: string;
  lostReason?: string;
  reengagementAttempts: number;
  lastReengagementDate?: string;
  score: number;
}

interface ReengagementCampaign {
  id: string;
  name: string;
  status: 'active' | 'paused' | 'completed' | 'draft';
  channel: 'email' | 'whatsapp' | 'sms' | 'multi';
  targetLeads: number;
  contacted: number;
  responded: number;
  converted: number;
  startDate: string;
  endDate?: string;
  message: string;
}

// Sample data
const SAMPLE_COLD_LEADS: ColdLead[] = [
  {
    id: '1',
    name: 'Vikram Singh',
    email: 'vikram@email.com',
    phone: '+91 98765 11111',
    program: 'B.Tech Computer Science',
    source: 'Website',
    lastContactDate: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(),
    daysSinceContact: 45,
    previousStage: 'interested',
    lostReason: 'No response',
    reengagementAttempts: 1,
    lastReengagementDate: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
    score: 65
  },
  {
    id: '2',
    name: 'Priya Nair',
    email: 'priya@email.com',
    phone: '+91 98765 22222',
    program: 'MBA Marketing',
    source: 'Social Media',
    lastContactDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    daysSinceContact: 30,
    previousStage: 'contacted',
    lostReason: 'Budget concerns',
    reengagementAttempts: 0,
    score: 75
  },
  {
    id: '3',
    name: 'Arjun Reddy',
    email: 'arjun@email.com',
    phone: '+91 98765 33333',
    program: 'B.Sc Nursing',
    source: 'Referral',
    lastContactDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
    daysSinceContact: 60,
    previousStage: 'interested',
    lostReason: 'Chose competitor',
    reengagementAttempts: 2,
    lastReengagementDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    score: 45
  },
  {
    id: '4',
    name: 'Deepa Kumar',
    email: 'deepa@email.com',
    phone: '+91 98765 44444',
    program: 'B.Pharm',
    source: 'Education Fair',
    lastContactDate: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
    daysSinceContact: 20,
    previousStage: 'new',
    reengagementAttempts: 0,
    score: 80
  },
  {
    id: '5',
    name: 'Karthik Menon',
    email: 'karthik@email.com',
    phone: '+91 98765 55555',
    program: 'M.Tech AI',
    source: 'Google Ads',
    lastContactDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
    daysSinceContact: 90,
    previousStage: 'applied',
    lostReason: 'Delayed decision',
    reengagementAttempts: 3,
    lastReengagementDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    score: 55
  }
];

const SAMPLE_CAMPAIGNS: ReengagementCampaign[] = [
  {
    id: '1',
    name: 'New Year Scholarship Offer',
    status: 'active',
    channel: 'email',
    targetLeads: 150,
    contacted: 120,
    responded: 35,
    converted: 12,
    startDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    message: 'Special scholarship offer for returning applicants'
  },
  {
    id: '2',
    name: 'Deadline Reminder',
    status: 'completed',
    channel: 'whatsapp',
    targetLeads: 80,
    contacted: 80,
    responded: 28,
    converted: 8,
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    endDate: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
    message: 'Final admission deadline approaching'
  },
  {
    id: '3',
    name: 'Campus Visit Invitation',
    status: 'draft',
    channel: 'multi',
    targetLeads: 50,
    contacted: 0,
    responded: 0,
    converted: 0,
    startDate: new Date().toISOString(),
    message: 'Invitation to visit our campus and meet faculty'
  }
];

function getScoreColor(score: number) {
  if (score >= 70) return 'text-green-600 bg-green-100 dark:bg-green-900/30';
  if (score >= 50) return 'text-amber-600 bg-amber-100 dark:bg-amber-900/30';
  return 'text-red-600 bg-red-100 dark:bg-red-900/30';
}

function getColdnessLevel(days: number) {
  if (days >= 60) return { label: 'Very Cold', color: 'bg-blue-600', icon: Snowflake };
  if (days >= 30) return { label: 'Cold', color: 'bg-blue-400', icon: Snowflake };
  return { label: 'Cooling', color: 'bg-cyan-400', icon: Clock };
}

function CampaignCard({ campaign }: { campaign: ReengagementCampaign }) {
  const [isLaunching, setIsLaunching] = useState(false);
  const responseRate = campaign.contacted > 0
    ? Math.round((campaign.responded / campaign.contacted) * 100)
    : 0;
  const conversionRate = campaign.responded > 0
    ? Math.round((campaign.converted / campaign.responded) * 100)
    : 0;
  const progress = campaign.targetLeads > 0
    ? Math.round((campaign.contacted / campaign.targetLeads) * 100)
    : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              "p-2 rounded-lg",
              campaign.status === 'active' && "bg-green-100 dark:bg-green-900/30",
              campaign.status === 'paused' && "bg-amber-100 dark:bg-amber-900/30",
              campaign.status === 'completed' && "bg-blue-100 dark:bg-blue-900/30",
              campaign.status === 'draft' && "bg-gray-100 dark:bg-gray-900/30"
            )}>
              {campaign.status === 'active' && <Play className="h-5 w-5 text-green-600" />}
              {campaign.status === 'paused' && <Pause className="h-5 w-5 text-amber-600" />}
              {campaign.status === 'completed' && <CheckCircle className="h-5 w-5 text-blue-600" />}
              {campaign.status === 'draft' && <Clock className="h-5 w-5 text-gray-600" />}
            </div>
            <div>
              <CardTitle className="text-lg">{campaign.name}</CardTitle>
              <CardDescription className="flex items-center gap-2 mt-1">
                {campaign.channel === 'email' && <Mail className="h-3 w-3" />}
                {campaign.channel === 'whatsapp' && <MessageCircle className="h-3 w-3" />}
                {campaign.channel === 'sms' && <Phone className="h-3 w-3" />}
                {campaign.channel === 'multi' && <Zap className="h-3 w-3" />}
                <span className="capitalize">{campaign.channel}</span>
                <span>•</span>
                <span>Started {formatDistanceToNow(new Date(campaign.startDate), { addSuffix: true })}</span>
              </CardDescription>
            </div>
          </div>
          <Badge variant={
            campaign.status === 'active' ? 'default' :
            campaign.status === 'completed' ? 'secondary' :
            'outline'
          }>
            {campaign.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-muted-foreground">Progress</span>
            <span>{campaign.contacted} / {campaign.targetLeads} contacted</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="text-2xl font-bold">{campaign.responded}</p>
            <p className="text-xs text-muted-foreground">Responded</p>
            <p className="text-xs text-green-600">{responseRate}% rate</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="text-2xl font-bold">{campaign.converted}</p>
            <p className="text-xs text-muted-foreground">Converted</p>
            <p className="text-xs text-green-600">{conversionRate}% rate</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="text-2xl font-bold">{campaign.targetLeads - campaign.contacted}</p>
            <p className="text-xs text-muted-foreground">Remaining</p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          {campaign.status === 'draft' && (
            <Button size="sm" disabled={isLaunching} onClick={async () => {
              setIsLaunching(true);
              try {
                await new Promise(r => setTimeout(r, 500));
                toast.success('Campaign launched successfully');
              } catch {
                toast.error('Failed to launch campaign');
              } finally {
                setIsLaunching(false);
              }
            }}>
              {isLaunching ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Launching...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-1" />
                  Launch
                </>
              )}
            </Button>
          )}
          {campaign.status === 'active' && (
            <>
              <Button size="sm" variant="outline" onClick={() => toast.success('Campaign paused')}>
                <Pause className="h-4 w-4 mr-1" />
                Pause
              </Button>
              <Button size="sm" variant="outline" onClick={() => toast.success('Opening campaign details')}>View Details</Button>
            </>
          )}
          {campaign.status === 'completed' && (
            <Button size="sm" variant="outline" onClick={() => toast.success('Generating report')}>View Report</Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function CreateCampaignDialog() {
  const [isLaunching, setIsLaunching] = useState(false);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>
          <Zap className="h-4 w-4 mr-2" />
          Create Campaign
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Create Re-engagement Campaign</DialogTitle>
          <DialogDescription>
            Set up a new campaign to re-engage cold leads
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Campaign Name</Label>
            <Input placeholder="e.g., Spring Admission Drive" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Channel</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select channel" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="multi">Multi-channel</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Target Audience</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select audience" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Cold Leads</SelectItem>
                  <SelectItem value="30days">30+ Days Inactive</SelectItem>
                  <SelectItem value="60days">60+ Days Inactive</SelectItem>
                  <SelectItem value="never_engaged">Never Re-engaged</SelectItem>
                  <SelectItem value="high_score">High Score Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Message Template</Label>
            <Select>
              <SelectTrigger>
                <SelectValue placeholder="Select template" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="scholarship">Scholarship Offer</SelectItem>
                <SelectItem value="deadline">Deadline Reminder</SelectItem>
                <SelectItem value="campus_visit">Campus Visit Invite</SelectItem>
                <SelectItem value="new_programs">New Programs Announcement</SelectItem>
                <SelectItem value="custom">Custom Message</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Message Preview</Label>
            <Textarea
              placeholder="Your message will appear here..."
              rows={4}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Schedule</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="When to send" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="now">Send Immediately</SelectItem>
                  <SelectItem value="scheduled">Schedule for Later</SelectItem>
                  <SelectItem value="batched">Batched Sending</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Estimated Reach</Label>
              <div className="p-3 rounded-lg bg-muted text-center">
                <p className="text-lg font-bold">5 leads</p>
                <p className="text-xs text-muted-foreground">match criteria</p>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => toast.success('Draft saved')}>Save as Draft</Button>
          <Button disabled={isLaunching} onClick={async () => {
            setIsLaunching(true);
            try {
              await new Promise(r => setTimeout(r, 500));
              toast.success('Campaign created successfully');
            } catch {
              toast.error('Failed to create campaign');
            } finally {
              setIsLaunching(false);
            }
          }}>
            {isLaunching ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Launching...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Launch Campaign
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ColdLeadReengagementPageContent() {
  const { profile, isLoading: accessLoading } = useAuth();
  const [coldLeads, setColdLeads] = useState<ColdLead[]>(SAMPLE_COLD_LEADS);
  const [campaigns, setCampaigns] = useState<ReengagementCampaign[]>(SAMPLE_CAMPAIGNS);
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [daysFilter, setDaysFilter] = useState<string>('all');
  const [isSendingMessage, setIsSendingMessage] = useState(false);

  const totalColdLeads = coldLeads.length;
  const veryColdLeads = coldLeads.filter(l => l.daysSinceContact >= 60).length;
  const neverEngaged = coldLeads.filter(l => l.reengagementAttempts === 0).length;
  const activeCampaigns = campaigns.filter(c => c.status === 'active').length;

  const filteredLeads = coldLeads.filter(lead => {
    const matchesSearch = !searchTerm ||
      lead.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.program.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesDays = daysFilter === 'all' ||
      (daysFilter === '30' && lead.daysSinceContact >= 30) ||
      (daysFilter === '60' && lead.daysSinceContact >= 60) ||
      (daysFilter === '90' && lead.daysSinceContact >= 90);

    return matchesSearch && matchesDays;
  });

  const toggleLeadSelection = (id: string) => {
    setSelectedLeads(prev =>
      prev.includes(id) ? prev.filter(l => l !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    if (selectedLeads.length === filteredLeads.length) {
      setSelectedLeads([]);
    } else {
      setSelectedLeads(filteredLeads.map(l => l.id));
    }
  };

  return (
    <PermissionGuard module="admission" action="view">
      <ContentLayout title="Cold Lead Re-engagement">
        <div className="space-y-6">
          {/* Breadcrumb */}
          <div className="flex items-center justify-between">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href="/admission/dashboard">Admission</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>Cold Lead Re-engagement</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => toast.success('Data refreshed')}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <CreateCampaignDialog />
            </div>
          </div>

          {/* Page Title */}
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Snowflake className="h-6 w-6 text-blue-500" />
              Cold Lead Re-engagement
            </h1>
            <p className="text-muted-foreground mt-1">
              Revive dormant leads with targeted re-engagement campaigns
            </p>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                    <Snowflake className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Cold Leads</p>
                    <p className="text-2xl font-bold">{totalColdLeads}</p>
                    <p className="text-xs text-muted-foreground">14+ days inactive</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                    <AlertCircle className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Very Cold</p>
                    <p className="text-2xl font-bold text-purple-600">{veryColdLeads}</p>
                    <p className="text-xs text-muted-foreground">60+ days inactive</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                    <Target className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Never Re-engaged</p>
                    <p className="text-2xl font-bold text-amber-600">{neverEngaged}</p>
                    <p className="text-xs text-muted-foreground">first contact opportunity</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                    <Zap className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Active Campaigns</p>
                    <p className="text-2xl font-bold text-green-600">{activeCampaigns}</p>
                    <p className="text-xs text-muted-foreground">running now</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="leads" className="space-y-6">
            <TabsList>
              <TabsTrigger value="leads">Cold Leads</TabsTrigger>
              <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
              <TabsTrigger value="analytics">Analytics</TabsTrigger>
            </TabsList>

            {/* Cold Leads Tab */}
            <TabsContent value="leads" className="space-y-4">
              <div className="flex flex-wrap gap-4 items-center justify-between">
                <div className="flex gap-2">
                  <Input
                    placeholder="Search leads..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-64"
                  />
                  <Select value={daysFilter} onValueChange={setDaysFilter}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Filter by days" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Cold Leads</SelectItem>
                      <SelectItem value="30">30+ Days</SelectItem>
                      <SelectItem value="60">60+ Days</SelectItem>
                      <SelectItem value="90">90+ Days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {selectedLeads.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{selectedLeads.length} selected</Badge>
                    <Button size="sm" disabled={isSendingMessage} onClick={async () => {
                      setIsSendingMessage(true);
                      try {
                        await new Promise(r => setTimeout(r, 500));
                        toast.success(`Message sent to ${selectedLeads.length} lead${selectedLeads.length > 1 ? 's' : ''}`);
                      } catch {
                        toast.error('Failed to send message');
                      } finally {
                        setIsSendingMessage(false);
                      }
                    }}>
                      {isSendingMessage ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4 mr-1" />
                          Send Message
                        </>
                      )}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => toast.success(`${selectedLeads.length} lead${selectedLeads.length > 1 ? 's' : ''} added to campaign`)}>
                      <Zap className="h-4 w-4 mr-1" />
                      Add to Campaign
                    </Button>
                  </div>
                )}
              </div>

              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={selectedLeads.length === filteredLeads.length && filteredLeads.length > 0}
                          onCheckedChange={selectAll}
                        />
                      </TableHead>
                      <TableHead>Lead</TableHead>
                      <TableHead>Program</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Contact</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Re-engagements</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLeads.map((lead) => {
                      const coldness = getColdnessLevel(lead.daysSinceContact);
                      return (
                        <TableRow key={lead.id}>
                          <TableCell>
                            <Checkbox
                              checked={selectedLeads.includes(lead.id)}
                              onCheckedChange={() => toggleLeadSelection(lead.id)}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="h-8 w-8">
                                <AvatarFallback>
                                  {lead.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-medium">{lead.name}</p>
                                <p className="text-xs text-muted-foreground">{lead.email}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>{lead.program}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className={cn("w-2 h-2 rounded-full", coldness.color)} />
                              <span className="text-sm">{coldness.label}</span>
                            </div>
                            {lead.lostReason && (
                              <p className="text-xs text-muted-foreground">{lead.lostReason}</p>
                            )}
                          </TableCell>
                          <TableCell>
                            <p>{lead.daysSinceContact} days ago</p>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(lead.lastContactDate), 'MMM d, yyyy')}
                            </p>
                          </TableCell>
                          <TableCell>
                            <Badge className={cn("text-xs", getScoreColor(lead.score))}>
                              {lead.score}%
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <p>{lead.reengagementAttempts} attempts</p>
                            {lead.lastReengagementDate && (
                              <p className="text-xs text-muted-foreground">
                                Last: {formatDistanceToNow(new Date(lead.lastReengagementDate), { addSuffix: true })}
                              </p>
                            )}
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem>
                                  <Phone className="h-4 w-4 mr-2" />
                                  Call
                                </DropdownMenuItem>
                                <DropdownMenuItem>
                                  <MessageCircle className="h-4 w-4 mr-2" />
                                  WhatsApp
                                </DropdownMenuItem>
                                <DropdownMenuItem>
                                  <Mail className="h-4 w-4 mr-2" />
                                  Email
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem>
                                  <History className="h-4 w-4 mr-2" />
                                  View History
                                </DropdownMenuItem>
                                <DropdownMenuItem>
                                  <Flame className="h-4 w-4 mr-2" />
                                  Mark as Hot
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Card>
            </TabsContent>

            {/* Campaigns Tab */}
            <TabsContent value="campaigns" className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {campaigns.map((campaign) => (
                  <CampaignCard key={campaign.id} campaign={campaign} />
                ))}
              </div>
            </TabsContent>

            {/* Analytics Tab */}
            <TabsContent value="analytics" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Re-engagement Success Rate</CardTitle>
                    <CardDescription>Performance over the last 30 days</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Response Rate</span>
                        <span className="font-bold">28%</span>
                      </div>
                      <Progress value={28} className="h-2" />
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Conversion Rate</span>
                        <span className="font-bold">12%</span>
                      </div>
                      <Progress value={12} className="h-2" />
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Re-activation Rate</span>
                        <span className="font-bold">8%</span>
                      </div>
                      <Progress value={8} className="h-2" />
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Best Performing Channels</CardTitle>
                    <CardDescription>By response rate</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                        <div className="flex items-center gap-2">
                          <MessageCircle className="h-4 w-4 text-green-600" />
                          <span>WhatsApp</span>
                        </div>
                        <Badge variant="default">35%</Badge>
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-blue-600" />
                          <span>Email</span>
                        </div>
                        <Badge variant="secondary">22%</Badge>
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-purple-600" />
                          <span>SMS</span>
                        </div>
                        <Badge variant="secondary">18%</Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

export default function ColdLeadReengagementPage() {
  return (
    <AdmissionErrorBoundary>
      <ColdLeadReengagementPageContent />
    </AdmissionErrorBoundary>
  );
}
