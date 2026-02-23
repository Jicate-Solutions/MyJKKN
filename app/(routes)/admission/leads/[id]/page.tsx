'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect, useMemo } from 'react';
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
  useActivityMutations,
  useApplicationMutations,
  useCounselorProfiles
} from '@/hooks/admission';
import { ConsultantAttributionCard } from './_components/consultant-attribution-card';
import { CounselorDailyViewService } from '@/lib/services/admission/counselor-daily-view-service';
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
  Loader2,
  ExternalLink
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
import { indianStates, getDistrictsByState } from '@/lib/data/locations';
import { SMSCampaignService } from '@/lib/services/admission/sms-campaign-service';
import { WhatsAppCampaignService } from '@/lib/services/admission/whatsapp-campaign-service';
import { useQueryClient } from '@tanstack/react-query';
import type { FunnelStage } from '@/types/admission';

const FUNNEL_STAGES = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'not_reachable', label: 'Not Reachable' },
  { value: 'interested', label: 'Interested' },
  { value: 'follow_up_scheduled', label: 'Follow-up Scheduled' },
  { value: 'engaged', label: 'Engaged' },
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
  { value: 'applied', label: 'Applied' },
  { value: 'interviewed', label: 'Interviewed' },
  { value: 'offered', label: 'Offered' },
  { value: 'enrolled', label: 'Enrolled' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'declined', label: 'Declined' },
  { value: 'withdrew', label: 'Withdrew' },
  { value: 'expired', label: 'Expired' },
  { value: 'lost', label: 'Lost' },
  { value: 'dormant', label: 'Dormant' },
];

const LEAD_SOURCES = [
  { value: 'website', label: 'Website' },
  { value: 'walk_in', label: 'Walk-in' },
  { value: 'referral', label: 'Referral' },
  { value: 'social_media', label: 'Social Media' },
  { value: 'newspaper', label: 'Newspaper' },
  { value: 'education_fair', label: 'Education Fair' },
  { value: 'agent', label: 'Agent/Partner' },
  { value: 'publisher', label: 'Publisher' },
  { value: 'google_ads', label: 'Google Ads' },
  { value: 'facebook_ads', label: 'Facebook Ads' },
  { value: 'other', label: 'Other' }
];

const GENDERS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' }
];

function getStageColor(stage: string | null): string {
  const colors: Record<string, string> = {
    new: 'bg-blue-100 text-blue-800 border-blue-200',
    contacted: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    not_reachable: 'bg-red-100 text-red-800 border-red-200',
    interested: 'bg-sky-100 text-sky-800 border-sky-200',
    follow_up_scheduled: 'bg-violet-100 text-violet-800 border-violet-200',
    engaged: 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200',
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
    applied: 'bg-pink-100 text-pink-800 border-pink-200',
    interviewed: 'bg-lime-100 text-lime-800 border-lime-200',
    offered: 'bg-green-100 text-green-800 border-green-200',
    enrolled: 'bg-cyan-100 text-cyan-800 border-cyan-200',
    confirmed: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    declined: 'bg-red-100 text-red-800 border-red-200',
    withdrew: 'bg-slate-100 text-slate-800 border-slate-200',
    expired: 'bg-neutral-100 text-neutral-800 border-neutral-200',
    lost: 'bg-gray-100 text-gray-800 border-gray-200',
    dormant: 'bg-stone-100 text-stone-800 border-stone-200',
  };
  return colors[stage || 'new'] || 'bg-gray-100 text-gray-800 border-gray-200';
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
    sentAt?: string | null;
    sent_at?: string | null;
    createdAt?: string | null;
    channel?: string | { channel_name: string; channel_type: string } | null;
    phone?: string | null;
  };
}) {
  const channelLabel = typeof message.channel === 'string'
    ? (message.channel === 'whatsapp' ? 'WhatsApp' : message.channel.toUpperCase())
    : message.channel?.channel_name || 'Message';
  const isWhatsApp = typeof message.channel === 'string'
    ? message.channel === 'whatsapp'
    : false;

  const statusColor: Record<string, string> = {
    delivered: 'bg-green-50 text-green-700 border-green-200',
    sent: 'bg-blue-50 text-blue-700 border-blue-200',
    read: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    failed: 'bg-red-50 text-red-700 border-red-200',
    pending: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  };

  return (
    <div className="flex gap-3 pb-4 border-b last:border-0 last:pb-0">
      <div className="flex-shrink-0">
        <div className={`h-8 w-8 rounded-full flex items-center justify-center ${isWhatsApp ? 'bg-green-100' : 'bg-blue-100'}`}>
          <MessageSquare className={`h-4 w-4 ${isWhatsApp ? 'text-green-600' : 'text-blue-600'}`} />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">{channelLabel}</p>
          {message.phone && (
            <span className="text-xs text-muted-foreground">{message.phone}</span>
          )}
          <Badge variant="outline" className={`text-xs ${statusColor[message.status || 'sent'] || ''}`}>
            {message.status || 'sent'}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{message.content}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {(message.sentAt || message.sent_at)
            ? new Date((message.sentAt || message.sent_at)!).toLocaleString()
            : message.createdAt
              ? new Date(message.createdAt).toLocaleString()
              : '-'}
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

  // Counselor assignment form state
  const [showAssignCounselorDialog, setShowAssignCounselorDialog] = useState(false);
  const [selectedCounselorId, setSelectedCounselorId] = useState('');

  // Create application form state
  const [selectedProgramId, setSelectedProgramId] = useState('');

  // Validate UUID to handle Next.js PPR/DRP placeholders during prerender
  const isValidId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(leadId);

  const { lead, isLoading: leadLoading, refetch } = useAdmissionLead(leadId);
  const { timeline, isLoading: timelineLoading } = useEnhancedTimeline(leadId);
  const { history: communicationHistory, isLoading: commLoading } = useLeadCommunicationHistory(leadId);
  const queryClient = useQueryClient();

  // Send message dialog state
  const [showSendMsg, setShowSendMsg] = useState(false);
  const [sendChannel, setSendChannel] = useState<'sms' | 'whatsapp'>('sms');
  const [sendMessage, setSendMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  const handleSendMessage = async () => {
    if (!lead || !sendMessage.trim()) return;

    if (sendChannel === 'whatsapp') {
      // Open WhatsApp Web with the lead's phone and pre-filled message.
      // Phone must be international format without '+': strip non-digits, prepend 91 for India.
      const digits = lead.phone.replace(/\D/g, '');
      const intlPhone = digits.startsWith('91') && digits.length === 12 ? digits : `91${digits}`;
      const waUrl = `https://wa.me/${intlPhone}?text=${encodeURIComponent(sendMessage.trim())}`;
      const popW = 1100, popH = 700;
      const popLeft = window.screenX + (window.outerWidth - popW) / 2;
      const popTop = window.screenY + (window.outerHeight - popH) / 2;
      window.open(waUrl, 'WhatsApp', `width=${popW},height=${popH},left=${popLeft},top=${popTop}`);

      // Log as activity (best-effort — don't block or show error to user)
      try {
        await createActivity({
          lead_id: lead.id,
          institution_id: lead.institution_id,
          activity_type: 'whatsapp',
          title: 'WhatsApp message',
          description: sendMessage.trim(),
        });
        queryClient.invalidateQueries({ queryKey: ['lead-communication-history', leadId] });
      } catch (_) { /* best-effort */ }

      toast.success('WhatsApp opened — send the message from your account');
      setSendMessage('');
      setShowSendMsg(false);
      return;
    }

    // SMS — send via service
    setIsSending(true);
    try {
      await SMSCampaignService.sendCampaignSMS({
        institutionId: lead.institution_id,
        leadId: lead.id,
        phoneNumber: lead.phone,
        messageContent: sendMessage.trim(),
      });
      toast.success('SMS sent successfully');
      setSendMessage('');
      setShowSendMsg(false);
      queryClient.invalidateQueries({ queryKey: ['lead-communication-history', leadId] });
    } catch (err: any) {
      toast.error(err?.message || 'Failed to send SMS');
    } finally {
      setIsSending(false);
    }
  };

  const { updateLead, updateStage, toggleHotLead, togglePriority, addTag, removeTag, scheduleFollowup, assignCounselor, deleteLead } = useLeadMutations();
  const { createActivity } = useActivityMutations(leadId);
  const { createApplication } = useApplicationMutations();

  // Edit lead dialog state
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editForm, setEditForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    alternate_phone: '',
    date_of_birth: '',
    gender: '',
    address_line1: '',
    state: '',
    district: '',
    city: '',
    pincode: '',
    parent_name: '',
    parent_phone: '',
    parent_email: '',
    source: '',
  });

  // Fetch institution name and programs for details display & Create Application dialog
  const [institutionName, setInstitutionName] = useState<string>('');
  const [programs, setPrograms] = useState<{ id: string; program_name: string }[]>([]);
  const [programsLoading, setProgramsLoading] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (lead?.institution_id) {
      setProgramsLoading(true);
      const supabase = createClientSupabaseClient();

      // Fetch institution name
      (supabase as any)
        .from('institutions')
        .select('name')
        .eq('id', lead.institution_id)
        .single()
        .then(({ data, error }: { data: any; error: any }) => {
          if (!error && data) {
            setInstitutionName(data.name);
          }
        });

      // Fetch programs
      supabase
        .from('programs')
        .select('id, program_name')
        .eq('institution_id', lead.institution_id)
        .eq('is_active', true)
        .order('program_name')
        .then(({ data, error }: { data: any; error: any }) => {
          if (cancelled) return;
          if (error) {
            console.error('[admission/leads] Failed to fetch programs:', error.message);
          } else {
            setPrograms(data || []);
          }
          setProgramsLoading(false);
        });
    }
    return () => { cancelled = true; };
  }, [lead?.institution_id]);

  // Counselors from profiles (role='counselor') — institution-scoped
  const { data: counselorProfiles, isLoading: counselorsLoading } = useCounselorProfiles(
    lead?.institution_id ?? undefined
  );
  const counselors = counselorProfiles || [];

  // Map interested program IDs to names
  const interestedProgramNames = useMemo(() => {
    const ids = lead?.interested_programs || [];
    if (!ids.length || !programs.length) return [];
    return ids
      .map((id: string) => programs.find((p) => p.id === id)?.program_name)
      .filter(Boolean);
  }, [lead, programs]);

  // Edit form: cascading districts
  const editDistricts = useMemo(() => {
    return editForm.state ? getDistrictsByState(editForm.state) : [];
  }, [editForm.state]);

  // Populate edit form when dialog opens
  const openEditDialog = () => {
    if (!lead) return;
    const l = lead;
    // Reverse-map state name to state ID for dropdown
    const stateId = indianStates.find((s) => s.name === l.state)?.id || '';
    const districts = stateId ? getDistrictsByState(stateId) : [];
    const districtId = districts.find((d) => d.name === l.district)?.id || '';
    setEditForm({
      full_name: l.full_name || '',
      email: l.email || '',
      phone: l.phone || '',
      alternate_phone: l.alternate_phone || '',
      date_of_birth: l.date_of_birth ? l.date_of_birth.split('T')[0] : '',
      gender: l.gender || '',
      address_line1: l.address_line1 || '',
      state: stateId,
      district: districtId,
      city: l.city || '',
      pincode: l.pincode || '',
      parent_name: l.parent_name || '',
      parent_phone: l.parent_phone || '',
      parent_email: l.parent_email || '',
      source: l.source || '',
    });
    setShowEditDialog(true);
  };

  const handleEditChange = (field: string, value: string) => {
    setEditForm((prev) => {
      if (field === 'state') return { ...prev, state: value, district: '' };
      return { ...prev, [field]: value };
    });
  };

  const handleEditSubmit = () => {
    if (!lead || !editForm.full_name.trim() || !editForm.phone.trim()) {
      toast.error('Full name and phone are required');
      return;
    }
    const selectedState = indianStates.find((s) => s.id === editForm.state);
    const selectedDistrict = editDistricts.find((d) => d.id === editForm.district);
    updateLead.mutate(
      {
        id: lead.id,
        data: {
          full_name: editForm.full_name.trim(),
          email: editForm.email?.trim() || null,
          phone: editForm.phone.trim(),
          alternate_phone: editForm.alternate_phone?.trim() || null,
          date_of_birth: editForm.date_of_birth || null,
          gender: editForm.gender || null,
          address_line1: editForm.address_line1?.trim() || null,
          state: selectedState?.name || null,
          district: selectedDistrict?.name || null,
          city: editForm.city?.trim() || null,
          pincode: editForm.pincode?.trim() || null,
          parent_name: editForm.parent_name?.trim() || null,
          parent_phone: editForm.parent_phone?.trim() || null,
          parent_email: editForm.parent_email?.trim() || null,
          source: editForm.source as any,
        },
      },
      {
        onSuccess: () => {
          setShowEditDialog(false);
          refetch();
        },
      }
    );
  };

  // Show loading skeleton only when actually fetching (valid UUID + query in flight)
  const isLoading = isValidId && leadLoading;

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
    updateStage.mutate({ leadId, stage: newStage as FunnelStage });
  };

  const handleAddTag = () => {
    if (newTag.trim()) {
      addTag.mutate(
        { leadId, tag: newTag.trim() },
        {
          onSuccess: () => {
            setNewTag('');
            setShowTagDialog(false);
          },
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
        institution_id: lead?.institution_id,
        activity_type: activityType as any,
        title: activitySubject.trim(),
        description: activityDescription.trim() || undefined,
        outcome: activityOutcome.trim() || undefined,
      },
      {
        onSuccess: () => {
          setActivityType('note');
          setActivitySubject('');
          setActivityDescription('');
          setActivityOutcome('');
          setShowActivityDialog(false);
        },
      }
    );
  };

  const handleScheduleFollowup = () => {
    if (!followupDate) {
      toast.error('Please select a follow-up date');
      return;
    }
    scheduleFollowup.mutate(
      { leadId, followupDate, notes: followupNotes.trim() || undefined },
      {
        onSuccess: () => {
          setFollowupDate('');
          setFollowupNotes('');
          setShowFollowupDialog(false);
          refetch();
        },
      }
    );
  };

  const handleAssignCounselor = async () => {
    if (!selectedCounselorId) {
      toast.error('Please select a counselor');
      return;
    }
    let counselorId: string;
    try {
      counselorId = await CounselorDailyViewService.resolveOrCreateCounselor(
        selectedCounselorId,
        lead?.institution_id ?? undefined
      );
    } catch {
      toast.error('Failed to resolve counselor. Please try again.');
      return;
    }
    assignCounselor.mutate(
      { leadId, counselorId, profileId: selectedCounselorId },
      {
        onSuccess: () => {
          setSelectedCounselorId('');
          setShowAssignCounselorDialog(false);
          refetch();
        },
      }
    );
  };

  const handleCreateApplication = () => {
    if (!lead || !selectedProgramId) {
      toast.error('Please select a program');
      return;
    }
    createApplication.mutate(
      {
        institution_id: lead.institution_id,
        lead_id: leadId,
        program_id: selectedProgramId,
        full_name: lead.full_name || '',
        email: lead.email || '',
        phone: lead.phone || '',
      },
      {
        onSuccess: () => {
          setSelectedProgramId('');
          setShowCreateAppDialog(false);
        },
      }
    );
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
                <BreadcrumbPage>{lead.full_name || 'Unknown'}</BreadcrumbPage>
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
                  <h1 className="text-2xl font-bold">{lead.full_name || 'Unknown'}</h1>
                  <div className="flex gap-1">
                    {lead.is_hot_lead && (
                      <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                        <Flame className="h-3 w-3 mr-1" />
                        Hot
                      </Badge>
                    )}
                    {lead.is_priority && !lead.is_hot_lead && (
                      <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                        <Star className="h-3 w-3 mr-1 fill-current" />
                        Priority
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                  {lead.email && (
                    <span className="flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      {lead.email}
                    </span>
                  )}
                  {lead.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {lead.phone}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant={lead.is_hot_lead ? 'default' : 'outline'}
                size="sm"
                onClick={() => toggleHotLead.mutate({ leadId, isHot: !lead.is_hot_lead })}
              >
                <Flame className="h-4 w-4 mr-1" />
                {lead.is_hot_lead ? 'Hot' : 'Mark Hot'}
              </Button>
              <Button
                variant={lead.is_priority ? 'default' : 'outline'}
                size="sm"
                onClick={() => togglePriority.mutate({ leadId, isPriority: !lead.is_priority })}
              >
                <Star className="h-4 w-4 mr-1" />
                {lead.is_priority ? 'Priority' : 'Mark Priority'}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={openEditDialog}>
                    <Edit className="h-4 w-4 mr-2" />
                    Edit Lead
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => {
                      if (window.confirm('Are you sure you want to delete this lead? This action cannot be undone.')) {
                        deleteLead.mutate(leadId, {
                          onSuccess: () => router.push('/admission/leads'),
                        });
                      }
                    }}
                  >
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
              <div className="grid grid-cols-4 gap-4">
                <Card>
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground">Score</p>
                        <p className="text-2xl font-bold">{lead.score != null ? lead.score : 'Not scored'}</p>
                      </div>
                      <Target className="h-8 w-8 text-primary opacity-50" />
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground">Category</p>
                        <p className={`text-2xl font-bold capitalize ${
                          lead.score_category === 'hot' ? 'text-red-600' :
                          lead.score_category === 'warm' ? 'text-orange-600' :
                          lead.score_category === 'cold' ? 'text-blue-600' : 'text-muted-foreground'
                        }`}>
                          {lead.score_category || 'Not scored'}
                        </p>
                      </div>
                      <Flame className="h-8 w-8 text-orange-500 opacity-50" />
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
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="text-base">Communication History</CardTitle>
                          <CardDescription>SMS &amp; WhatsApp messages sent to this lead</CardDescription>
                        </div>
                        <Dialog open={showSendMsg} onOpenChange={setShowSendMsg}>
                          <DialogTrigger asChild>
                            <Button size="sm" variant="outline">
                              <Send className="h-3.5 w-3.5 mr-1.5" />
                              Send Message
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="sm:max-w-md">
                            <DialogHeader>
                              <DialogTitle>Send Message</DialogTitle>
                              <DialogDescription>
                                {sendChannel === 'whatsapp'
                                  ? `Opens WhatsApp Web with a pre-filled message to ${lead?.full_name}. You send it from your own WhatsApp account.`
                                  : `Send a direct SMS to ${lead?.full_name}`}
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-2">
                              <div className="space-y-2">
                                <Label>Channel</Label>
                                <Select value={sendChannel} onValueChange={(v) => setSendChannel(v as 'sms' | 'whatsapp')}>
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="sms">SMS</SelectItem>
                                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-2">
                                <Label>To</Label>
                                <Input value={lead?.phone || ''} disabled className="bg-muted" />
                              </div>
                              <div className="space-y-2">
                                <Label>Message</Label>
                                <Textarea
                                  value={sendMessage}
                                  onChange={(e) => setSendMessage(e.target.value)}
                                  placeholder="Type your message..."
                                  rows={4}
                                />
                              </div>
                            </div>
                            <DialogFooter>
                              <Button variant="outline" onClick={() => setShowSendMsg(false)}>
                                Cancel
                              </Button>
                              <Button
                                onClick={handleSendMessage}
                                disabled={isSending || !sendMessage.trim()}
                              >
                                {sendChannel === 'whatsapp' ? (
                                  <><ExternalLink className="h-4 w-4 mr-2" />Open WhatsApp</>
                                ) : isSending ? (
                                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending...</>
                                ) : (
                                  <><Send className="h-4 w-4 mr-2" />Send SMS</>
                                )}
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </div>
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
                          <p className="font-medium">No messages sent yet</p>
                          <p className="text-sm mt-1">
                            SMS and WhatsApp messages sent to this lead via campaigns or direct messaging will appear here.
                          </p>
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

                <TabsContent value="details" className="mt-4 space-y-4">
                  {/* Personal Information */}
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">Personal Information</CardTitle>
                        <Button variant="outline" size="sm" onClick={openEditDialog}>
                          <Edit className="h-3.5 w-3.5 mr-1.5" />
                          Edit
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <dl className="grid grid-cols-2 gap-4">
                        <div>
                          <dt className="text-sm text-muted-foreground">Full Name</dt>
                          <dd className="font-medium">{lead.full_name || '-'}</dd>
                        </div>
                        <div>
                          <dt className="text-sm text-muted-foreground">Email</dt>
                          <dd className="font-medium">{lead.email || '-'}</dd>
                        </div>
                        <div>
                          <dt className="text-sm text-muted-foreground">Phone</dt>
                          <dd className="font-medium">{lead.phone || '-'}</dd>
                        </div>
                        <div>
                          <dt className="text-sm text-muted-foreground">Alternate Phone</dt>
                          <dd className="font-medium">{lead.alternate_phone || '-'}</dd>
                        </div>
                        <div>
                          <dt className="text-sm text-muted-foreground">Date of Birth</dt>
                          <dd className="font-medium">
                            {lead.date_of_birth
                              ? new Date(lead.date_of_birth).toLocaleDateString()
                              : '-'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-sm text-muted-foreground">Gender</dt>
                          <dd className="font-medium capitalize">{lead.gender || '-'}</dd>
                        </div>
                      </dl>
                    </CardContent>
                  </Card>

                  {/* Academic Details */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Academic Details</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <dl className="grid grid-cols-2 gap-4">
                        <div>
                          <dt className="text-sm text-muted-foreground">Institution</dt>
                          <dd className="font-medium">{institutionName || '-'}</dd>
                        </div>
                        <div>
                          <dt className="text-sm text-muted-foreground">Entry Date</dt>
                          <dd className="font-medium">
                            {lead.entry_date
                              ? new Date(lead.entry_date).toLocaleDateString()
                              : lead.created_at
                                ? new Date(lead.created_at).toLocaleDateString()
                                : '-'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-sm text-muted-foreground">Academic Year</dt>
                          <dd className="font-medium">{lead.academic_year || '-'}</dd>
                        </div>
                       
                        <div>
                          <dt className="text-sm text-muted-foreground">Student Interest Level</dt>
                          <dd className="font-medium capitalize">{(lead.student_interest_level || '-').replace(/_/g, ' ')}</dd>
                        </div>
                        <div>
                          <dt className="text-sm text-muted-foreground">Parent Decision Status</dt>
                          <dd className="font-medium capitalize">{(lead.parent_decision_status || '-').replace(/_/g, ' ')}</dd>
                        </div>
                        <div className="col-span-2">
                          <dt className="text-sm text-muted-foreground">Interested Programs</dt>
                          <dd className="font-medium">
                            {programsLoading ? (
                              <span className="text-muted-foreground text-sm">Loading...</span>
                            ) : interestedProgramNames.length > 0 ? (
                              <div className="flex flex-wrap gap-1.5 mt-1">
                                {interestedProgramNames.map((name: string, i: number) => (
                                  <Badge key={i} variant="secondary">{name}</Badge>
                                ))}
                              </div>
                            ) : '-'}
                          </dd>
                        </div>
                      </dl>
                    </CardContent>
                  </Card>

                  {/* Address */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Address</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <dl className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                          <dt className="text-sm text-muted-foreground">Address Line</dt>
                          <dd className="font-medium">{lead.address_line1 || '-'}</dd>
                        </div>
                        <div>
                          <dt className="text-sm text-muted-foreground">State</dt>
                          <dd className="font-medium">{lead.state || '-'}</dd>
                        </div>
                        <div>
                          <dt className="text-sm text-muted-foreground">District</dt>
                          <dd className="font-medium">{lead.district || '-'}</dd>
                        </div>
                        <div>
                          <dt className="text-sm text-muted-foreground">City / Town</dt>
                          <dd className="font-medium">{lead.city || '-'}</dd>
                        </div>
                        <div>
                          <dt className="text-sm text-muted-foreground">Pincode</dt>
                          <dd className="font-medium">{lead.pincode || '-'}</dd>
                        </div>
                      </dl>
                    </CardContent>
                  </Card>

                  {/* Parent / Guardian */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Parent / Guardian</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <dl className="grid grid-cols-2 gap-4">
                        <div>
                          <dt className="text-sm text-muted-foreground">Parent Name</dt>
                          <dd className="font-medium">{lead.parent_name || '-'}</dd>
                        </div>
                        <div>
                          <dt className="text-sm text-muted-foreground">Parent Phone</dt>
                          <dd className="font-medium">{lead.parent_phone || '-'}</dd>
                        </div>
                        <div>
                          <dt className="text-sm text-muted-foreground">Parent Email</dt>
                          <dd className="font-medium">{lead.parent_email || '-'}</dd>
                        </div>
                      </dl>
                    </CardContent>
                  </Card>

                  {/* Source & Timestamps */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Source & Timeline</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <dl className="grid grid-cols-2 gap-4">
                        <div>
                          <dt className="text-sm text-muted-foreground">Lead Source</dt>
                          <dd className="font-medium capitalize">{(lead.source || '-').replace(/_/g, ' ')}</dd>
                        </div>
                        <div>
                          <dt className="text-sm text-muted-foreground">Preferred Channel</dt>
                          <dd className="font-medium capitalize">{(lead.preferred_channel || '-').replace(/_/g, ' ')}</dd>
                        </div>
                        <div>
                          <dt className="text-sm text-muted-foreground">Created</dt>
                          <dd className="font-medium">
                            {lead.created_at ? new Date(lead.created_at).toLocaleString() : '-'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-sm text-muted-foreground">Last Activity</dt>
                          <dd className="font-medium">
                            {lead.last_contact_at ? new Date(lead.last_contact_at).toLocaleString() : '-'}
                          </dd>
                        </div>
                      </dl>
                    </CardContent>
                  </Card>

                  {/* Notes */}
                  {lead.notes && (
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">Notes</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm whitespace-pre-wrap">{lead.notes}</p>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>
              </Tabs>
            </div>

            {/* Right Column - Tags & Quick Info */}
            <div className="space-y-6">
              {/* Consultant Attribution */}
              <ConsultantAttributionCard
                leadId={leadId}
                institutionId={lead.institution_id}
              />

              {/* Tags */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Tag className="h-4 w-4" />
                      Tags
                    </CardTitle>
                    <Dialog open={showTagDialog} onOpenChange={(open) => { setShowTagDialog(open); if (!open) setNewTag(''); }}>
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
                          onClick={() => removeTag.mutate({ leadId, tag })}
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
                  <Dialog open={showActivityDialog} onOpenChange={(open) => { setShowActivityDialog(open); if (!open) { setActivityType('note'); setActivitySubject(''); setActivityDescription(''); setActivityOutcome(''); } }}>
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
                  <Dialog open={showFollowupDialog} onOpenChange={(open) => { setShowFollowupDialog(open); if (!open) { setFollowupDate(''); setFollowupNotes(''); } }}>
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

                  {/* Assign Counselor Dialog */}
                  <Dialog open={showAssignCounselorDialog} onOpenChange={(open) => { setShowAssignCounselorDialog(open); if (!open) setSelectedCounselorId(''); }}>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="w-full justify-start" size="sm">
                        <User className="h-4 w-4 mr-2" />
                        Assign Counselor
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Assign Counselor</DialogTitle>
                        <DialogDescription>
                          {lead.counselor?.name
                            ? `Currently assigned to ${lead.counselor.name}. Select a new counselor.`
                            : 'Select a counselor to assign to this lead.'}
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div>
                          <Label htmlFor="counselor-select">Counselor *</Label>
                          <Select value={selectedCounselorId} onValueChange={setSelectedCounselorId}>
                            <SelectTrigger className="mt-2">
                              <SelectValue placeholder="Select a counselor" />
                            </SelectTrigger>
                            <SelectContent>
                              {counselorsLoading ? (
                                <SelectItem value="_loading" disabled>Loading counselors...</SelectItem>
                              ) : counselors.length === 0 ? (
                                <SelectItem value="_none" disabled>No counselors found</SelectItem>
                              ) : (
                                counselors.map((c) => (
                                  <SelectItem key={c.profile_id} value={c.profile_id}>
                                    {c.name}{c.designation ? ` (${c.designation})` : ''}
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => { setShowAssignCounselorDialog(false); setSelectedCounselorId(''); }}>Cancel</Button>
                        <Button onClick={handleAssignCounselor} disabled={assignCounselor.isPending || !selectedCounselorId}>
                          {assignCounselor.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                          Assign
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>

                  {/* Create Application Dialog */}
                  <Dialog open={showCreateAppDialog} onOpenChange={(open) => { setShowCreateAppDialog(open); if (!open) setSelectedProgramId(''); }}>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="w-full justify-start" size="sm">
                        <Send className="h-4 w-4 mr-2" />
                        Create Application
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Create Application</DialogTitle>
                        <DialogDescription>
                          Start an application for {lead.full_name || 'this lead'}
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div>
                          <Label htmlFor="app-program">Program *</Label>
                          <Select value={selectedProgramId} onValueChange={setSelectedProgramId}>
                            <SelectTrigger className="mt-2">
                              <SelectValue placeholder="Select a program" />
                            </SelectTrigger>
                            <SelectContent>
                              {programsLoading ? (
                                <SelectItem value="_loading" disabled>Loading programs...</SelectItem>
                              ) : programs.length === 0 ? (
                                <SelectItem value="_none" disabled>No programs found</SelectItem>
                              ) : (
                                programs.map((p) => (
                                  <SelectItem key={p.id} value={p.id}>{p.program_name}</SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="rounded-md bg-muted p-3 text-sm space-y-1">
                          <p><span className="text-muted-foreground">Name:</span> {lead.full_name || '-'}</p>
                          <p><span className="text-muted-foreground">Email:</span> {lead.email || '-'}</p>
                          <p><span className="text-muted-foreground">Phone:</span> {lead.phone || '-'}</p>
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => { setShowCreateAppDialog(false); setSelectedProgramId(''); }}>Cancel</Button>
                        <Button onClick={handleCreateApplication} disabled={createApplication.isPending || !selectedProgramId}>
                          {createApplication.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                          Create Application
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>

              {/* Next Follow-up */}
              {(lead as any).next_followup_at && (
                <Card className="border-primary/30 bg-primary/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-primary" />
                      Next Follow-up
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-lg font-semibold">
                      {new Date((lead as any).next_followup_at).toLocaleDateString(undefined, {
                        weekday: 'short',
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {new Date((lead as any).next_followup_at).toLocaleTimeString(undefined, {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                    {(() => {
                      const followupTime = new Date((lead as any).next_followup_at).getTime();
                      const now = Date.now();
                      const diffMs = followupTime - now;
                      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
                      if (diffDays < 0) {
                        return (
                          <Badge variant="destructive" className="mt-2">
                            Overdue by {Math.abs(diffDays)} day{Math.abs(diffDays) !== 1 ? 's' : ''}
                          </Badge>
                        );
                      } else if (diffDays === 0) {
                        return <Badge className="mt-2 bg-orange-500">Due Today</Badge>;
                      } else if (diffDays <= 3) {
                        return (
                          <Badge variant="outline" className="mt-2 border-orange-300 text-orange-700 bg-orange-50">
                            In {diffDays} day{diffDays !== 1 ? 's' : ''}
                          </Badge>
                        );
                      }
                      return (
                        <Badge variant="outline" className="mt-2">
                          In {diffDays} days
                        </Badge>
                      );
                    })()}
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full mt-3"
                      onClick={() => setShowFollowupDialog(true)}
                    >
                      Reschedule
                    </Button>
                  </CardContent>
                </Card>
              )}

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
                  {!(lead as any).next_followup_at && (
                    <div className="flex items-center gap-3">
                      <Calendar className="h-4 w-4 text-muted-foreground opacity-50" />
                      <div>
                        <p className="text-xs text-muted-foreground">Next Follow-up</p>
                        <p className="text-sm text-muted-foreground italic">Not scheduled</p>
                      </div>
                    </div>
                  )}
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
                  {lead.next_followup_at && (
                    <div className="flex items-center gap-3">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Next Follow-up</p>
                        <p className="text-sm font-medium">
                          {new Date(lead.next_followup_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  )}
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
          {/* Edit Lead Dialog */}
          <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Edit Lead</DialogTitle>
                <DialogDescription>Update lead information</DialogDescription>
              </DialogHeader>
              <div className="space-y-6 py-4">
                {/* Personal Info */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-muted-foreground">Personal Information</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="edit-full_name">Full Name *</Label>
                      <Input
                        id="edit-full_name"
                        value={editForm.full_name}
                        onChange={(e) => handleEditChange('full_name', e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-email">Email</Label>
                      <Input
                        id="edit-email"
                        type="email"
                        value={editForm.email}
                        onChange={(e) => handleEditChange('email', e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-phone">Phone *</Label>
                      <Input
                        id="edit-phone"
                        value={editForm.phone}
                        onChange={(e) => handleEditChange('phone', e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-alternate_phone">Alternate Phone</Label>
                      <Input
                        id="edit-alternate_phone"
                        value={editForm.alternate_phone}
                        onChange={(e) => handleEditChange('alternate_phone', e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-dob">Date of Birth</Label>
                      <Input
                        id="edit-dob"
                        type="date"
                        value={editForm.date_of_birth}
                        onChange={(e) => handleEditChange('date_of_birth', e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-gender">Gender</Label>
                      <Select value={editForm.gender} onValueChange={(v) => handleEditChange('gender', v)}>
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Select gender" />
                        </SelectTrigger>
                        <SelectContent>
                          {GENDERS.map((g) => (
                            <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Address */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-muted-foreground">Address</h4>
                  <div>
                    <Label htmlFor="edit-address">Address Line</Label>
                    <Input
                      id="edit-address"
                      value={editForm.address_line1}
                      onChange={(e) => handleEditChange('address_line1', e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>State</Label>
                      <Select value={editForm.state} onValueChange={(v) => handleEditChange('state', v)}>
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Select state" />
                        </SelectTrigger>
                        <SelectContent>
                          {indianStates.map((s) => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>District</Label>
                      <Select
                        value={editForm.district}
                        onValueChange={(v) => handleEditChange('district', v)}
                        disabled={!editForm.state}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder={editForm.state ? 'Select district' : 'Select state first'} />
                        </SelectTrigger>
                        <SelectContent>
                          {editDistricts.map((d) => (
                            <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="edit-city">City / Town</Label>
                      <Input
                        id="edit-city"
                        value={editForm.city}
                        onChange={(e) => handleEditChange('city', e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-pincode">Pincode</Label>
                      <Input
                        id="edit-pincode"
                        value={editForm.pincode}
                        onChange={(e) => handleEditChange('pincode', e.target.value)}
                        className="mt-1"
                      />
                    </div>
                  </div>
                </div>

                {/* Parent / Guardian */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-muted-foreground">Parent / Guardian</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="edit-parent_name">Parent Name</Label>
                      <Input
                        id="edit-parent_name"
                        value={editForm.parent_name}
                        onChange={(e) => handleEditChange('parent_name', e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-parent_phone">Parent Phone</Label>
                      <Input
                        id="edit-parent_phone"
                        value={editForm.parent_phone}
                        onChange={(e) => handleEditChange('parent_phone', e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-parent_email">Parent Email</Label>
                      <Input
                        id="edit-parent_email"
                        type="email"
                        value={editForm.parent_email}
                        onChange={(e) => handleEditChange('parent_email', e.target.value)}
                        className="mt-1"
                      />
                    </div>
                  </div>
                </div>

                {/* Source */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-muted-foreground">Lead Source</h4>
                  <div>
                    <Select value={editForm.source} onValueChange={(v) => handleEditChange('source', v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select source" />
                      </SelectTrigger>
                      <SelectContent>
                        {LEAD_SOURCES.map((s) => (
                          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowEditDialog(false)}>Cancel</Button>
                <Button onClick={handleEditSubmit} disabled={updateLead.isPending}>
                  {updateLead.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Save Changes
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
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
