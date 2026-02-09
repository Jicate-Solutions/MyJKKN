'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { PermissionGuard } from '@/components/auth/permission-guard';
import {
  useAdmissionLead,
  useEnhancedTimeline,
  useLeadCommunicationHistory,
  useLeadMutations,
  useCommunicationMutations,
  useActivityMutations,
  useApplicationMutations
} from '@/hooks/admission';
import type { TimelineEntry } from '@/lib/services/admission/activity-service';
import {
  ArrowLeft,
  Flame,
  Star,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Clock,
  MessageSquare,
  Activity,
  Send,
  User,
  Target,
  TrendingUp,
  Tag,
  MoreHorizontal,
  Edit,
  Trash2,
  Loader2
} from 'lucide-react';
import Link from 'next/link';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { AdmissionErrorBoundary } from '@/components/admission';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { FunnelStage } from '@/types/admission';
import { useAuth } from '@/hooks/use-auth';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { useQuery } from '@tanstack/react-query';

const FUNNEL_STAGES = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'application_started', label: 'Application Started' },
  { value: 'application_submitted', label: 'Application Submitted' },
  { value: 'documents_pending', label: 'Documents Pending' },
  { value: 'documents_verified', label: 'Documents Verified' },
  { value: 'interview_scheduled', label: 'Interview Scheduled' },
  { value: 'interview_completed', label: 'Interview Completed' },
  { value: 'offer_sent', label: 'Offer Sent' },
  { value: 'offer_accepted', label: 'Offer Accepted' },
  { value: 'token_paid', label: 'Token Paid' },
  { value: 'enrolled', label: 'Enrolled' },
  { value: 'lost', label: 'Lost' }
];

function getStageColor(stage: string | null): string {
  const colors: Record<string, string> = {
    new: 'bg-blue-100 text-blue-800 border-blue-200',
    contacted: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    qualified: 'bg-purple-100 text-purple-800 border-purple-200',
    application_started: 'bg-pink-100 text-pink-800 border-pink-200',
    application_submitted: 'bg-rose-100 text-rose-800 border-rose-200',
    documents_pending: 'bg-orange-100 text-orange-800 border-orange-200',
    documents_verified: 'bg-amber-100 text-amber-800 border-amber-200',
    interview_scheduled: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    interview_completed: 'bg-lime-100 text-lime-800 border-lime-200',
    offer_sent: 'bg-green-100 text-green-800 border-green-200',
    offer_accepted: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    token_paid: 'bg-teal-100 text-teal-800 border-teal-200',
    enrolled: 'bg-cyan-100 text-cyan-800 border-cyan-200',
    lost: 'bg-gray-100 text-gray-800 border-gray-200'
  };
  return colors[stage || 'new'] || 'bg-gray-100 text-gray-800 border-gray-200';
}

function formatActivityType(type: string): string {
  const labels: Record<string, string> = {
    stage_changed: 'Stage Changed',
    assigned: 'Assigned to Counselor',
    note_added: 'Note Added',
    email_sent: 'Email Sent',
    call_made: 'Call Made',
    meeting_scheduled: 'Meeting Scheduled',
    document_uploaded: 'Document Uploaded',
    score_updated: 'Score Updated'
  };
  return labels[type] || type.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}

function LeadDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <Skeleton className="h-5 w-24" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-20" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

const timelineIcons: Record<string, typeof Activity> = {
  phone: Phone,
  mail: Mail,
  calendar: Calendar,
  'file-text': Activity,
  'message-square': MessageSquare,
  'message-circle': MessageSquare,
  'git-branch': TrendingUp,
  'check-circle': Target,
  activity: Activity
};

const timelineColors: Record<string, string> = {
  green: 'bg-green-100 text-green-700',
  blue: 'bg-blue-100 text-blue-700',
  purple: 'bg-purple-100 text-purple-700',
  gray: 'bg-gray-100 text-gray-700',
  orange: 'bg-orange-100 text-orange-700',
  indigo: 'bg-indigo-100 text-indigo-700',
  emerald: 'bg-emerald-100 text-emerald-700'
};

function TimelineItem({ entry }: { entry: TimelineEntry }) {
  const IconComponent = timelineIcons[entry.icon || 'activity'] || Activity;
  const colorClass = timelineColors[entry.color || 'gray'] || timelineColors.gray;

  return (
    <div className="flex gap-3 pb-4 border-b last:border-0 last:pb-0">
      <div className="flex-shrink-0">
        <div className={`h-8 w-8 rounded-full flex items-center justify-center ${colorClass}`}>
          <IconComponent className="h-4 w-4" />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">{entry.title}</p>
          <Badge variant="outline" className="text-xs">
            {entry.type === 'stage_change' ? 'Stage' : 'Activity'}
          </Badge>
        </div>
        {entry.description && (
          <p className="text-sm text-muted-foreground mt-1">{entry.description}</p>
        )}
        <p className="text-xs text-muted-foreground mt-1">
          {new Date(entry.timestamp).toLocaleString()}
        </p>
      </div>
    </div>
  );
}

function CommunicationItem({
  message
}: {
  message: {
    id: string;
    content: string;
    status: string | null;
    sent_at: string | null;
    channel?: { channel_name: string; channel_type: string } | null;
  };
}) {
  return (
    <div className="flex gap-3 pb-4 border-b last:border-0 last:pb-0">
      <div className="flex-shrink-0">
        <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
          <MessageSquare className="h-4 w-4 text-blue-600" />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">
            {message.channel?.channel_name || 'Message'}
          </p>
          <Badge variant="outline" className="text-xs">
            {message.status || 'sent'}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{message.content}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {message.sent_at ? new Date(message.sent_at).toLocaleString() : '-'}
        </p>
      </div>
    </div>
  );
}

function LeadDetailPageContent() {
  const params = useParams();
  const router = useRouter();
  const leadId = params.id as string;

  const [newTag, setNewTag] = useState('');
  const [showTagDialog, setShowTagDialog] = useState(false);
  const [showActivityDialog, setShowActivityDialog] = useState(false);
  const [showFollowupDialog, setShowFollowupDialog] = useState(false);
  const [showCreateAppDialog, setShowCreateAppDialog] = useState(false);

  // Activity form state
  const [activityType, setActivityType] = useState<string>('note');
  const [activitySubject, setActivitySubject] = useState('');
  const [activityDescription, setActivityDescription] = useState('');
  const [activityOutcome, setActivityOutcome] = useState('');

  // Follow-up form state
  const [followupDate, setFollowupDate] = useState('');
  const [followupNotes, setFollowupNotes] = useState('');

  // Create application form state
  const [selectedProgramId, setSelectedProgramId] = useState('');

  const { lead, isLoading: leadLoading, refetch } = useAdmissionLead(leadId);
  const { timeline, isLoading: timelineLoading } = useEnhancedTimeline(leadId);
  const { history: communicationHistory, isLoading: commLoading } = useLeadCommunicationHistory(leadId);

  const { updateStage, toggleHotLead, togglePriority, addTag, removeTag, scheduleFollowup } = useLeadMutations();
  const { createActivity } = useActivityMutations(leadId);

  const isLoading = leadLoading;

  if (isLoading) {
    return (
      <PermissionGuard module="admission" action="view">
        <ContentLayout title="Lead Details">
          <LeadDetailSkeleton />
        </ContentLayout>
      </PermissionGuard>
    );
  }

  if (!lead) {
    return (
      <PermissionGuard module="admission" action="view">
        <ContentLayout title="Lead Not Found">
          <Card>
            <CardContent className="py-16 text-center">
              <User className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h2 className="text-xl font-semibold mb-2">Lead Not Found</h2>
              <p className="text-muted-foreground mb-4">
                The lead you&apos;re looking for doesn&apos;t exist or has been removed.
              </p>
              <Button asChild>
                <Link href="/admission/leads">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Leads
                </Link>
              </Button>
            </CardContent>
          </Card>
        </ContentLayout>
      </PermissionGuard>
    );
  }

  const handleStageChange = (newStage: string) => {
    updateStage.mutate(
      { leadId, stage: newStage as FunnelStage },
      {
        onSuccess: () => toast.success('Lead stage updated successfully'),
        onError: () => toast.error('Failed to update lead stage')
      }
    );
  };

  const handleAddTag = () => {
    if (newTag.trim()) {
      addTag.mutate(
        { leadId, tag: newTag.trim() },
        {
          onSuccess: () => {
            toast.success('Tag added successfully');
            setNewTag('');
            setShowTagDialog(false);
          },
          onError: () => toast.error('Failed to add tag')
        }
      );
    }
  };

  const handleLogActivity = () => {
    if (!activitySubject.trim()) {
      toast.error('Please enter a subject for the activity');
      return;
    }
    createActivity.mutate(
      {
        lead_id: leadId,
        activity_type: activityType as any,
        subject: activitySubject.trim(),
        description: activityDescription.trim() || undefined,
        outcome: activityOutcome.trim() || undefined,
        completed_at: new Date().toISOString(),
      },
      {
        onSuccess: () => {
          toast.success('Activity logged successfully');
          setActivityType('note');
          setActivitySubject('');
          setActivityDescription('');
          setActivityOutcome('');
          setShowActivityDialog(false);
        },
        onError: () => toast.error('Failed to log activity')
      }
    );
  };

  const handleScheduleFollowup = () => {
    if (!followupDate) {
      toast.error('Please select a follow-up date');
      return;
    }
    scheduleFollowup.mutate(
      { leadId, followupDate },
      {
        onSuccess: () => {
          toast.success('Follow-up scheduled successfully');
          setFollowupDate('');
          setFollowupNotes('');
          setShowFollowupDialog(false);
        },
        onError: () => toast.error('Failed to schedule follow-up')
      }
    );
  };

  const handleCreateApplication = () => {
    if (!lead) return;
    router.push(`/admission/applications/new?lead_id=${leadId}&name=${encodeURIComponent((lead as any).full_name || '')}&email=${encodeURIComponent((lead as any).email || '')}&phone=${encodeURIComponent((lead as any).phone || '')}&institution_id=${encodeURIComponent(lead.institution_id || '')}`);
  };

  return (
    <PermissionGuard module="admission" action="view">
      <ContentLayout title="Lead Details">
        <div className="space-y-6">
          {/* Breadcrumb */}
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="/admission/dashboard">Admission</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="/admission/leads">Leads</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{(lead as any).full_name || 'Unknown'}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <Button variant="outline" size="icon" asChild>
                <Link href="/admission/leads">
                  <ArrowLeft className="h-4 w-4" />
                </Link>
              </Button>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold">{(lead as any).full_name || 'Unknown'}</h1>
                  <div className="flex gap-1">
                    {lead.is_hot_lead && (
                      <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                        <Flame className="h-3 w-3 mr-1" />
                        Hot
                      </Badge>
                    )}
                    {(lead.is_hot_lead || lead.is_priority) && (
                      <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                        <Star className="h-3 w-3 mr-1 fill-current" />
                        Priority
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                  {(lead as any).email && (
                    <span className="flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      {(lead as any).email}
                    </span>
                  )}
                  {(lead as any).phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {(lead as any).phone}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant={lead.is_hot_lead ? 'default' : 'outline'}
                size="sm"
                onClick={() => toggleHotLead.mutate(
                  { leadId, isHot: !lead.is_hot_lead },
                  {
                    onSuccess: () => toast.success(lead.is_hot_lead ? 'Removed from hot leads' : 'Marked as hot lead'),
                    onError: () => toast.error('Failed to update hot lead status')
                  }
                )}
              >
                <Flame className="h-4 w-4 mr-1" />
                {lead.is_hot_lead ? 'Hot' : 'Mark Hot'}
              </Button>
              <Button
                variant={(lead.is_hot_lead || lead.is_priority) ? 'default' : 'outline'}
                size="sm"
                onClick={() => togglePriority.mutate(
                  { leadId, isPriority: (!lead.is_hot_lead && !lead.is_priority) },
                  {
                    onSuccess: () => toast.success((lead.is_hot_lead || lead.is_priority) ? 'Removed from priority' : 'Marked as priority'),
                    onError: () => toast.error('Failed to update priority status')
                  }
                )}
              >
                <Star className="h-4 w-4 mr-1" />
                {(lead.is_hot_lead || lead.is_priority) ? 'Priority' : 'Mark Priority'}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>
                    <Edit className="h-4 w-4 mr-2" />
                    Edit Lead
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Lead
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Stage Selector */}
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium">Current Stage:</span>
                  <Badge className={`${getStageColor(lead.funnel_stage)} border`} variant="outline">
                    {lead.funnel_stage?.replace(/_/g, ' ') || 'New'}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Move to:</span>
                  <Select
                    value={lead.funnel_stage || 'new'}
                    onValueChange={handleStageChange}
                  >
                    <SelectTrigger className="w-[200px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FUNNEL_STAGES.map((stage) => (
                        <SelectItem key={stage.value} value={stage.value}>
                          {stage.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Main Content */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column - Details & Tabs */}
            <div className="lg:col-span-2 space-y-6">
              {/* Score Cards */}
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground">Score</p>
                        <p className="text-2xl font-bold">{lead.score || 0}</p>
                      </div>
                      <Target className="h-8 w-8 text-primary opacity-50" />
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground">Engagement</p>
                        <p className="text-2xl font-bold">{lead.engagement_score || 0}</p>
                      </div>
                      <TrendingUp className="h-8 w-8 text-blue-500 opacity-50" />
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground">Quality</p>
                        <p className="text-2xl font-bold">{lead.quality_score || 0}</p>
                      </div>
                      <Star className="h-8 w-8 text-yellow-500 opacity-50" />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Tabs */}
              <Tabs defaultValue="activity" className="w-full">
                <TabsList>
                  <TabsTrigger value="activity">Activity</TabsTrigger>
                  <TabsTrigger value="communication">Communication</TabsTrigger>
                  <TabsTrigger value="details">Details</TabsTrigger>
                </TabsList>

                <TabsContent value="activity" className="mt-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Activity Timeline</CardTitle>
                      <CardDescription>Recent activities for this lead</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {timelineLoading ? (
                        <div className="space-y-4">
                          {[1, 2, 3].map((i) => (
                            <Skeleton key={i} className="h-16 w-full" />
                          ))}
                        </div>
                      ) : timeline.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p>No activity recorded yet</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {timeline.map((entry) => (
                            <TimelineItem key={entry.id} entry={entry} />
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="communication" className="mt-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Communication History</CardTitle>
                      <CardDescription>Messages sent to this lead</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {commLoading ? (
                        <div className="space-y-4">
                          {[1, 2, 3].map((i) => (
                            <Skeleton key={i} className="h-16 w-full" />
                          ))}
                        </div>
                      ) : communicationHistory.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p>No messages sent yet</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {communicationHistory.map((message) => (
                            <CommunicationItem key={message.id} message={message as any} />
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="details" className="mt-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Lead Details</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <dl className="grid grid-cols-2 gap-4">
                        <div>
                          <dt className="text-sm text-muted-foreground">Full Name</dt>
                          <dd className="font-medium">{(lead as any).full_name || '-'}</dd>
                        </div>
                        <div>
                          <dt className="text-sm text-muted-foreground">Email</dt>
                          <dd className="font-medium">{(lead as any).email || '-'}</dd>
                        </div>
                        <div>
                          <dt className="text-sm text-muted-foreground">Phone</dt>
                          <dd className="font-medium">{(lead as any).phone || '-'}</dd>
                        </div>
                        <div>
                          <dt className="text-sm text-muted-foreground">Alternate Phone</dt>
                          <dd className="font-medium">{(lead as any).alternate_phone || '-'}</dd>
                        </div>
                        <div>
                          <dt className="text-sm text-muted-foreground">Date of Birth</dt>
                          <dd className="font-medium">
                            {(lead as any).date_of_birth
                              ? new Date((lead as any).date_of_birth).toLocaleDateString()
                              : '-'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-sm text-muted-foreground">Gender</dt>
                          <dd className="font-medium">{(lead as any).gender || '-'}</dd>
                        </div>
                        <div className="col-span-2">
                          <dt className="text-sm text-muted-foreground">Address</dt>
                          <dd className="font-medium">
                            {[(lead as any).city, (lead as any).state, (lead as any).country, (lead as any).pincode]
                              .filter(Boolean)
                              .join(', ') || '-'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-sm text-muted-foreground">First Touch Source</dt>
                          <dd className="font-medium">{(lead as any).first_touch_source || '-'}</dd>
                        </div>
                        <div>
                          <dt className="text-sm text-muted-foreground">Last Touch Source</dt>
                          <dd className="font-medium">{(lead as any).last_touch_source || '-'}</dd>
                        </div>
                        <div>
                          <dt className="text-sm text-muted-foreground">Created</dt>
                          <dd className="font-medium">
                            {lead.created_at
                              ? new Date(lead.created_at).toLocaleString()
                              : '-'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-sm text-muted-foreground">Last Activity</dt>
                          <dd className="font-medium">
                            {lead.last_contact_at
                              ? new Date(lead.last_contact_at).toLocaleString()
                              : '-'}
                          </dd>
                        </div>
                      </dl>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>

            {/* Right Column - Tags & Quick Info */}
            <div className="space-y-6">
              {/* Tags */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Tag className="h-4 w-4" />
                      Tags
                    </CardTitle>
                    <Dialog open={showTagDialog} onOpenChange={setShowTagDialog}>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="sm">
                          + Add
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Add Tag</DialogTitle>
                          <DialogDescription>
                            Add a tag to help categorize this lead
                          </DialogDescription>
                        </DialogHeader>
                        <div className="py-4">
                          <Label htmlFor="tag">Tag Name</Label>
                          <Input
                            id="tag"
                            value={newTag}
                            onChange={(e) => setNewTag(e.target.value)}
                            placeholder="e.g., engineering, scholarship"
                            className="mt-2"
                          />
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setShowTagDialog(false)}>
                            Cancel
                          </Button>
                          <Button onClick={handleAddTag}>Add Tag</Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardHeader>
                <CardContent>
                  {lead.tags && lead.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {lead.tags.map((tag) => (
                        <Badge
                          key={tag}
                          variant="secondary"
                          className="cursor-pointer hover:bg-destructive hover:text-destructive-foreground"
                          onClick={() => removeTag.mutate(
                            { leadId, tag },
                            {
                              onSuccess: () => toast.success('Tag removed successfully'),
                              onError: () => toast.error('Failed to remove tag')
                            }
                          )}
                        >
                          {tag}
                          <span className="ml-1">×</span>
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No tags added</p>
                  )}
                </CardContent>
              </Card>

              {/* Quick Actions */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Quick Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {/* Log Activity Button + Dialog */}
                  <Dialog open={showActivityDialog} onOpenChange={setShowActivityDialog}>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="w-full justify-start" size="sm">
                        <Activity className="h-4 w-4 mr-2" />
                        Log Activity
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Log Activity</DialogTitle>
                        <DialogDescription>Record an interaction with this lead</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div>
                          <Label htmlFor="activity-type">Activity Type</Label>
                          <Select value={activityType} onValueChange={setActivityType}>
                            <SelectTrigger className="mt-2">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="call">Phone Call</SelectItem>
                              <SelectItem value="email">Email</SelectItem>
                              <SelectItem value="meeting">Meeting</SelectItem>
                              <SelectItem value="note">Note</SelectItem>
                              <SelectItem value="sms">SMS</SelectItem>
                              <SelectItem value="whatsapp">WhatsApp</SelectItem>
                              <SelectItem value="task">Task</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label htmlFor="activity-subject">Subject</Label>
                          <Input
                            id="activity-subject"
                            value={activitySubject}
                            onChange={(e) => setActivitySubject(e.target.value)}
                            placeholder="e.g., Discussed program options"
                            className="mt-2"
                          />
                        </div>
                        <div>
                          <Label htmlFor="activity-description">Description (optional)</Label>
                          <Textarea
                            id="activity-description"
                            value={activityDescription}
                            onChange={(e) => setActivityDescription(e.target.value)}
                            placeholder="Details about the interaction..."
                            className="mt-2"
                            rows={3}
                          />
                        </div>
                        <div>
                          <Label htmlFor="activity-outcome">Outcome (optional)</Label>
                          <Input
                            id="activity-outcome"
                            value={activityOutcome}
                            onChange={(e) => setActivityOutcome(e.target.value)}
                            placeholder="e.g., Interested in BSc Nursing"
                            className="mt-2"
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setShowActivityDialog(false)}>Cancel</Button>
                        <Button onClick={handleLogActivity} disabled={createActivity.isPending}>
                          {createActivity.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                          Log Activity
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>

                  {/* Schedule Follow-up Button + Dialog */}
                  <Dialog open={showFollowupDialog} onOpenChange={setShowFollowupDialog}>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="w-full justify-start" size="sm">
                        <Calendar className="h-4 w-4 mr-2" />
                        Schedule Follow-up
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Schedule Follow-up</DialogTitle>
                        <DialogDescription>Set a reminder to follow up with this lead</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div>
                          <Label htmlFor="followup-date">Follow-up Date</Label>
                          <Input
                            id="followup-date"
                            type="datetime-local"
                            value={followupDate}
                            onChange={(e) => setFollowupDate(e.target.value)}
                            className="mt-2"
                          />
                        </div>
                        <div>
                          <Label htmlFor="followup-notes">Notes (optional)</Label>
                          <Textarea
                            id="followup-notes"
                            value={followupNotes}
                            onChange={(e) => setFollowupNotes(e.target.value)}
                            placeholder="What should be discussed..."
                            className="mt-2"
                            rows={3}
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setShowFollowupDialog(false)}>Cancel</Button>
                        <Button onClick={handleScheduleFollowup} disabled={scheduleFollowup.isPending}>
                          {scheduleFollowup.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                          Schedule
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>

                  {/* Create Application Button */}
                  <Button variant="outline" className="w-full justify-start" size="sm" onClick={handleCreateApplication}>
                    <Send className="h-4 w-4 mr-2" />
                    Create Application
                  </Button>
                </CardContent>
              </Card>

              {/* Quick Info */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Quick Info</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Created</p>
                      <p className="text-sm font-medium">
                        {lead.created_at
                          ? new Date(lead.created_at).toLocaleDateString()
                          : '-'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Last Activity</p>
                      <p className="text-sm font-medium">
                        {lead.last_contact_at
                          ? new Date(lead.last_contact_at).toLocaleDateString()
                          : 'No activity'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Messages Sent</p>
                      <p className="text-sm font-medium">{communicationHistory.length || 0}</p>
                    </div>
                  </div>
                  {lead.counselor_id && (
                    <div className="flex items-center gap-3">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Assigned To</p>
                        <p className="text-sm font-medium">
                          {lead.counselor?.name || 'Unknown'}
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

export default function LeadDetailPage() {
  return (
    <AdmissionErrorBoundary>
      <LeadDetailPageContent />
    </AdmissionErrorBoundary>
  );
}
