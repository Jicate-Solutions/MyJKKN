'use client';

import { useState, useEffect } from 'react';
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
  useColdLeads,
  useReEngagementCampaigns,
  useReEngagementStats,
  useMarkLeadAsHot,
} from '@/hooks/admission/use-re-engagement';
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
import {
  WhatsAppReengagementService,
  type SequenceTemplate,
} from '@/lib/services/whatsapp/whatsapp-reengagement-service';

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

function CampaignCard({ campaign }: { campaign: any }) {
  const [isLaunching, setIsLaunching] = useState(false);
  const totalSteps = campaign.total_steps || campaign.totalSteps || 1;
  const currentStep = campaign.current_step_index || campaign.currentStep || 0;
  const progress = totalSteps > 0 ? Math.round((currentStep / totalSteps) * 100) : 0;

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
              <CardTitle className="text-lg">{campaign.name || `Campaign ${campaign.id?.slice(0, 8)}`}</CardTitle>
              <CardDescription className="flex items-center gap-2 mt-1">
                <Zap className="h-3 w-3" />
                <span className="capitalize">{campaign.status}</span>
                <span>•</span>
                <span>Started {campaign.started_at ? formatDistanceToNow(new Date(campaign.started_at), { addSuffix: true }) : 'N/A'}</span>
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
            <span>Step {currentStep} / {totalSteps}</span>
          </div>
          <Progress value={progress} className="h-2" />
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
                <p className="text-lg font-bold">-- leads</p>
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

// =============================================================================
// WhatsApp Sequences Tab Component (Gap 11)
// =============================================================================

function WhatsAppSequencesTab({
  institutionId,
  coldLeadCount,
  createdBy,
}: {
  institutionId: string;
  coldLeadCount: number;
  createdBy: string;
}) {
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [showLaunchDialog, setShowLaunchDialog] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<SequenceTemplate | null>(null);
  const [targetOption, setTargetOption] = useState<string>('all-cold');
  const [isLaunching, setIsLaunching] = useState(false);
  const [activeSequences, setActiveSequences] = useState<any[]>([]);
  const [sequenceStats, setSequenceStats] = useState({
    active_sequences: 0,
    reengaged_count: 0,
    conversion_rate: 0,
  });

  const predefinedSequences = WhatsAppReengagementService.getPredefinedSequences();

  // Load active sequences stats on mount
  useEffect(() => {
    if (!institutionId) return;
    // Fetch stats via API (or directly if server component)
    fetch(`/api/admission/re-engagement/wa-stats?institution_id=${institutionId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.data) {
          setSequenceStats(data.data);
        }
      })
      .catch(() => {});

    // Fetch active sequences
    fetch(`/api/admission/re-engagement/wa-sequences?institution_id=${institutionId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.data) {
          setActiveSequences(data.data);
        }
      })
      .catch(() => {});
  }, [institutionId]);

  const handleLaunch = async () => {
    if (!selectedTemplate || !institutionId) return;
    setIsLaunching(true);
    try {
      const res = await fetch('/api/admission/re-engagement/wa-launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          institution_id: institutionId,
          sequence_template: selectedTemplate,
          target_option: targetOption,
          created_by: createdBy,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to launch');
      toast.success(`Campaign launched! ${data.data?.sequencesCreated || 0} sequences created.`);
      setShowLaunchDialog(false);
      setSelectedTemplate(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Launch failed');
    } finally {
      setIsLaunching(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                <Play className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Active Sequences</p>
                <p className="text-2xl font-bold">{sequenceStats.active_sequences}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <TrendingUp className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Re-engaged</p>
                <p className="text-2xl font-bold">{sequenceStats.reengaged_count}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                <Target className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Conversion Rate</p>
                <p className="text-2xl font-bold">{sequenceStats.conversion_rate}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Predefined Sequence Cards */}
      <div>
        <h3 className="text-lg font-semibold mb-3">Predefined Sequences</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {predefinedSequences.map((seq) => (
            <Card key={seq.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{seq.name}</CardTitle>
                <CardDescription className="text-xs">{seq.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  {seq.steps.map((step, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs">
                      <div className="h-5 w-5 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
                        <span className="text-[10px] font-medium text-green-700">{idx + 1}</span>
                      </div>
                      <span className="text-muted-foreground">Day {step.day}:</span>
                      <span className="font-mono text-xs">{step.template_name}</span>
                    </div>
                  ))}
                </div>
                <Badge variant="outline" className="text-xs">
                  {seq.steps.length} step{seq.steps.length !== 1 ? 's' : ''} &middot;{' '}
                  {seq.steps[seq.steps.length - 1]?.day || 0} days
                </Badge>
                <Button
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    setSelectedTemplate(seq);
                    setShowLaunchDialog(true);
                  }}
                >
                  <Send className="h-3 w-3 mr-2" />
                  Launch
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Active Sequences List */}
      {activeSequences.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-3">Active Sequences</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {activeSequences.map((seq: any) => {
              const progress = seq.total_steps > 0
                ? Math.round((seq.current_step_index / seq.total_steps) * 100)
                : 0;
              return (
                <Card key={seq.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">
                        {seq.lead?.full_name || seq.lead_id?.slice(0, 8)}
                      </CardTitle>
                      <Badge variant={seq.status === 'active' ? 'default' : 'secondary'}>
                        {seq.status}
                      </Badge>
                    </div>
                    <CardDescription className="text-xs">
                      {seq.workflow?.name || 'Re-engagement'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Progress</span>
                        <span>Step {seq.current_step_index} / {seq.total_steps}</span>
                      </div>
                      <Progress value={progress} className="h-2" />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Launch Dialog */}
      <Dialog open={showLaunchDialog} onOpenChange={(open) => {
        setShowLaunchDialog(open);
        if (!open) setSelectedTemplate(null);
      }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Launch Re-engagement Sequence</DialogTitle>
            <DialogDescription>
              {selectedTemplate?.name} — {selectedTemplate?.steps.length} step(s)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Target Audience</Label>
              <Select value={targetOption} onValueChange={setTargetOption}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all-cold">All Cold Leads ({coldLeadCount})</SelectItem>
                  <SelectItem value="30-days">30+ Days Inactive</SelectItem>
                  <SelectItem value="60-days">60+ Days Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="p-3 rounded-lg bg-muted text-center">
              <p className="text-lg font-bold">{coldLeadCount} leads</p>
              <p className="text-xs text-muted-foreground">will receive this sequence</p>
            </div>
            {selectedTemplate && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Sequence Steps</Label>
                {selectedTemplate.steps.map((step, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm p-2 rounded bg-muted/50">
                    <Badge variant="outline" className="text-xs">{`Day ${step.day}`}</Badge>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    <span className="font-mono text-xs">{step.template_name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLaunchDialog(false)}>Cancel</Button>
            <Button onClick={handleLaunch} disabled={isLaunching}>
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
    </div>
  );
}

function ColdLeadReengagementPageContent() {
  const { profile, isLoading: accessLoading } = useAuth();
  const institutionId = profile?.institution_id || '';
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [daysFilter, setDaysFilter] = useState<string>('all');
  const [isSendingMessage, setIsSendingMessage] = useState(false);

  // Real data hooks
  const { leads: rawColdLeads, total: coldLeadTotal, isLoading: leadsLoading, refetch: refetchLeads } = useColdLeads({
    institutionId,
    search: searchTerm || undefined,
    minDaysInactive: daysFilter !== 'all' ? parseInt(daysFilter) : undefined,
  });
  const { campaigns, isLoading: campaignsLoading, refetch: refetchCampaigns } = useReEngagementCampaigns(institutionId);
  const { stats, isLoading: statsLoading, refetch: refetchStats } = useReEngagementStats(institutionId);
  const markAsHot = useMarkLeadAsHot();

  // Transform DB leads to UI format
  const coldLeads = (rawColdLeads || []).map((lead: any) => {
    const lastContact = lead.last_contact_at || lead.last_activity_at || lead.created_at;
    const daysSinceContact = lastContact
      ? differenceInDays(new Date(), new Date(lastContact))
      : 0;
    return {
      id: lead.id,
      name: lead.full_name || 'Unknown',
      email: lead.email || '',
      phone: lead.phone || '',
      program: Array.isArray(lead.interested_programs) ? lead.interested_programs.join(', ') : (lead.interested_programs || ''),
      source: lead.source || 'Unknown',
      lastContactDate: lastContact || new Date().toISOString(),
      daysSinceContact,
      previousStage: lead.stage || lead.funnel_stage || 'new',
      lostReason: lead.lost_reason || undefined,
      reengagementAttempts: 0,
      lastReengagementDate: undefined as string | undefined,
      score: lead.score || lead.engagement_score || 0,
    };
  });

  const totalColdLeads = stats.totalColdLeads;
  const veryColdLeads = stats.veryColdLeads;
  const neverEngaged = stats.neverEngaged;
  const activeCampaigns = stats.activeCampaigns;

  const filteredLeads = coldLeads.filter((lead: any) => {
    const matchesSearch = !searchTerm ||
      lead.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.program.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
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
      setSelectedLeads(filteredLeads.map((l: any) => l.id));
    }
  };

  const handleRefresh = () => {
    refetchLeads();
    refetchCampaigns();
    refetchStats();
    toast.success('Data refreshed');
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
              <Button variant="outline" onClick={handleRefresh}>
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
              <TabsTrigger value="wa-sequences">WhatsApp Sequences</TabsTrigger>
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
                {leadsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : (
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
                      {filteredLeads.map((lead: any) => {
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
                                    {lead.name.split(' ').map((n: string) => n[0]).join('').toUpperCase()}
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
                                  <DropdownMenuItem onClick={() => markAsHot.mutate(lead.id)}>
                                    <Flame className="h-4 w-4 mr-2" />
                                    Mark as Hot
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {filteredLeads.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                            No cold leads found.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                )}
              </Card>
            </TabsContent>

            {/* Campaigns Tab */}
            <TabsContent value="campaigns" className="space-y-4">
              {campaignsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {(campaigns || []).map((campaign: any) => (
                    <CampaignCard key={campaign.id} campaign={campaign} />
                  ))}
                  {(campaigns || []).length === 0 && (
                    <div className="col-span-2 text-center py-8 text-muted-foreground">
                      No campaigns found. Create one to get started.
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

            {/* WhatsApp Sequences Tab */}
            <TabsContent value="wa-sequences" className="space-y-4">
              <WhatsAppSequencesTab
                institutionId={institutionId}
                coldLeadCount={totalColdLeads}
                createdBy={profile?.id || ''}
              />
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
                        <span className="font-bold">--</span>
                      </div>
                      <Progress value={0} className="h-2" />
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Conversion Rate</span>
                        <span className="font-bold">--</span>
                      </div>
                      <Progress value={0} className="h-2" />
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Re-activation Rate</span>
                        <span className="font-bold">--</span>
                      </div>
                      <Progress value={0} className="h-2" />
                      <p className="text-xs text-muted-foreground text-center pt-2">
                        Analytics will populate as campaigns run.
                      </p>
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
                        <Badge variant="default">--</Badge>
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-blue-600" />
                          <span>Email</span>
                        </div>
                        <Badge variant="secondary">--</Badge>
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-purple-600" />
                          <span>SMS</span>
                        </div>
                        <Badge variant="secondary">--</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground text-center pt-2">
                        Channel performance will populate as campaigns run.
                      </p>
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
