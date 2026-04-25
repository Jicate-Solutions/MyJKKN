'use client';


import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/use-auth';
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
import { AdmissionYearSelect } from '@/components/admission/admission-year-select';
import { Textarea } from '@/components/ui/textarea';
import { PermissionGuard } from '@/components/auth/permission-guard';
import {
  useAdmissionLead,
  useEnhancedTimeline,
  useLeadCommunicationHistory,
  useLeadMutations,
  useActivityMutations,
  useApplicationMutations,
  useCounselorProfiles,
  useActiveTemplates,
  useTemplateVariables
} from '@/hooks/admission';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { useDegrees } from '@/hooks/organization/use-degrees';
import { useDepartments } from '@/hooks/organization/use-departments';
import { usePrograms } from '@/hooks/organization/use-programs';
import { ConsultantAttributionCard } from './_components/consultant-attribution-card';
import { LogCallDialog } from '@/components/admission/log-call-dialog';
import { QuickActionsBar } from '@/components/admission/quick-actions-bar';
import { useExpoEvent } from '@/hooks/admission/use-expos';
import { useConsultantsForDropdown, useLeadAttributions } from '@/hooks/admission/use-consultants';
import { useStudentsForDropdown, useFacultyForDropdown } from '@/hooks/admission/use-referral-dropdowns';
import { ConsultantService } from '@/lib/services/admission/consultant-service';
import type { ReferralType } from '@/types/admission';
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
  ExternalLink,
  Info,
  UserPlus,
  Image as ImageIcon,
  Film,
  FileText as FileTextIcon,
  Paperclip,
  X,
  XCircle,
  MessageCircle,
  ScanLine,
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import toast from 'react-hot-toast';
import { AdmissionErrorBoundary } from '@/components/admission';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { indianStates, getDistrictsByState } from '@/lib/data/locations';
import { SMSCampaignService } from '@/lib/services/admission/sms-campaign-service';
import { WhatsAppCampaignService } from '@/lib/services/admission/whatsapp-campaign-service';
import { useQueryClient } from '@tanstack/react-query';
import type { FunnelStage } from '@/types/admission';
import { ALLOWED_STAGE_TRANSITIONS } from '@/lib/services/admission/lead-service';
import { SendPersonalMessageDialog } from '@/components/whatsapp/send-personal-message-dialog';
import { usePersonalWhatsAppStatus } from '@/hooks/admission/use-whatsapp-personal';
// BUG-003016: centralised DD/MM/YYYY formatter — replaces bare
// toLocaleDateString() calls that were rendering ambiguously depending
// on the runtime locale. Extended 2026-04-16 to also route the timeline,
// message, and follow-up dates on the detail page through the helpers.
import { formatDateDMY, formatDateShort, formatDateTimeDMY } from '@/lib/utils/date-format';

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
  { value: 'admission_form', label: 'Admission Form' },
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
          {formatDateTimeDMY(entry.timestamp)}
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
    direction?: 'inbound' | 'outbound';
    senderName?: string | null;
  };
}) {
  const channelLabel = typeof message.channel === 'string'
    ? (message.channel === 'personal_whatsapp' ? 'Personal WhatsApp'
      : message.channel === 'whatsapp' ? 'WhatsApp'
      : message.channel.toUpperCase())
    : message.channel?.channel_name || 'Message';
  const isWhatsApp = typeof message.channel === 'string'
    ? (message.channel === 'whatsapp' || message.channel === 'personal_whatsapp')
    : false;
  const isPersonalWA = typeof message.channel === 'string' && message.channel === 'personal_whatsapp';
  const isInbound = message.direction === 'inbound';

  const statusColor: Record<string, string> = {
    delivered: 'bg-green-50 text-green-700 border-green-200',
    sent: 'bg-blue-50 text-blue-700 border-blue-200',
    read: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    failed: 'bg-red-50 text-red-700 border-red-200',
    pending: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  };

  const timeStr = (message.sentAt || message.sent_at)
    ? formatDateTimeDMY(message.sentAt || message.sent_at)
    : message.createdAt
      ? formatDateTimeDMY(message.createdAt)
      : '-';

  // Chat bubble layout for Personal WhatsApp messages
  if (isPersonalWA) {
    return (
      <div className={`flex ${isInbound ? 'justify-start' : 'justify-end'} mb-2`}>
        <div className={`max-w-[75%] rounded-lg px-3 py-2 ${
          isInbound
            ? 'bg-muted text-foreground rounded-tl-none'
            : 'bg-[#25D366] text-white rounded-tr-none'
        }`}>
          {isInbound && message.senderName && (
            <p className={`text-xs font-medium mb-0.5 ${isInbound ? 'text-green-700' : 'text-green-100'}`}>
              {message.senderName}
            </p>
          )}
          <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
          <div className={`flex items-center justify-end gap-1.5 mt-1 ${isInbound ? 'text-muted-foreground' : 'text-green-100'}`}>
            <span className="text-[10px]">{timeStr}</span>
            {!isInbound && message.status && (
              <span className="text-[10px]">
                {message.status === 'read' ? '✓✓' : message.status === 'delivered' ? '✓✓' : message.status === 'sent' ? '✓' : message.status === 'failed' ? '!' : '⏳'}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Default flat layout for SMS and Business WhatsApp
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
        <p className="text-xs text-muted-foreground mt-1">{timeStr}</p>
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
  const [showLogCallDialog, setShowLogCallDialog] = useState(false);

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

  // Personal WhatsApp state
  const [personalMsgOpen, setPersonalMsgOpen] = useState(false);

  // Create application form state
  const [selectedInstitutionId, setSelectedInstitutionId] = useState('');
  const [selectedDegreeId, setSelectedDegreeId] = useState('');
  const [selectedDepartmentId, setSelectedDepartmentId] = useState('');
  const [selectedProgramId, setSelectedProgramId] = useState('');

  // Validate UUID to handle Next.js PPR/DRP placeholders during prerender
  const isValidId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(leadId);

  const { lead, isLoading: leadLoading, refetch } = useAdmissionLead(leadId);
  const { timeline, isLoading: timelineLoading } = useEnhancedTimeline(leadId);
  const { history: communicationHistory, isLoading: commLoading } = useLeadCommunicationHistory(leadId);
  // Expo attribution — only fetch if lead has expo_event_id
  const { event: expoEvent } = useExpoEvent(lead?.expo_event_id || '');
  const queryClient = useQueryClient();
  const { selectedInstitutionId: userInstitutionId } = useUserInstitutionAccess();
  const { profile } = useAuth();

  // Personal WhatsApp status — super admins (no department) use 'any' to find any ready connection
  const personalWaDepartmentId = profile?.department_id || 'any';
  const { data: waStatus } = usePersonalWhatsAppStatus(personalWaDepartmentId, { pollWhileConnecting: false });

  // Compute lead scores on-the-fly from available data
  const computedScores = useMemo(() => {
    if (!lead) return {
      score: 0, category: 'Not Scored', engagement: 0, quality: 0,
      engagementBreakdown: {} as Record<string, { count: number; points: number }>,
      qualityBreakdown: {} as Record<string, boolean>,
      qualityFilledCount: 0, qualityTotalFields: 14,
      messageCount: 0,
    };

    // --- Engagement Score (0-100) based on activities ---
    const activityEntries = timeline.filter((t: any) => t.type === 'activity');
    const activityTypes: Record<string, number> = {};
    activityEntries.forEach((t: any) => {
      const type = t.metadata?.activity_type || 'note';
      activityTypes[type] = (activityTypes[type] || 0) + 1;
    });

    // Weighted points per activity type (capped)
    const engConfig: Array<[string, string, number, number]> = [
      ['call', 'Calls', 15, 5],
      ['email', 'Emails', 5, 10],
      ['whatsapp', 'WhatsApp', 10, 10],
      ['sms', 'SMS', 5, 10],
      ['meeting', 'Meetings', 25, 3],
      ['task', 'Tasks', 10, 5],
      ['note', 'Notes', 3, 5],
    ];

    let engagementPoints = 0;
    const engagementBreakdown: Record<string, { count: number; points: number }> = {};
    for (const [key, label, pts, cap] of engConfig) {
      const count = activityTypes[key] || 0;
      const points = Math.min(count, cap) * pts;
      engagementPoints += points;
      if (count > 0) engagementBreakdown[label] = { count, points };
    }
    const msgPoints = Math.min(communicationHistory.length, 20) * 2;
    engagementPoints += msgPoints;
    if (communicationHistory.length > 0) {
      engagementBreakdown['Messages'] = { count: communicationHistory.length, points: msgPoints };
    }

    const engagement = Math.min(100, Math.round((engagementPoints / 455) * 100));

    // --- Quality Score (0-100) based on profile completeness ---
    const qualityChecks: Array<[string, boolean]> = [
      ['Full Name', !!lead.full_name],
      ['Email', !!lead.email],
      ['Phone', !!lead.phone],
      ['Date of Birth', !!lead.date_of_birth],
      ['Gender', !!lead.gender],
      ['Address', !!(lead.address_line1 || lead.city || lead.state)],
      ['Pincode', !!lead.pincode],
      ['Parent Name', !!lead.parent_name],
      ['Parent Phone', !!lead.parent_phone],
      ['Parent Email', !!lead.parent_email],
      // 2026-04-21 — primary program now lives on program_id (legacy interested_programs kept as fallback for pre-split rows)
      ['Interested Programs', !!(lead.program_id || lead.interested_programs?.length)],
      ['Source', !!lead.source],
      ['Preferred Channel', !!lead.preferred_channel],
    ];
    const qualityWeights: Record<string, number> = {
      'Full Name': 10, 'Email': 10, 'Phone': 10, 'Date of Birth': 5, 'Gender': 5,
      'Address': 10, 'Pincode': 5, 'Parent Name': 10, 'Parent Phone': 5,
      'Parent Email': 5, 'Interested Programs': 15, 'Source': 5, 'Preferred Channel': 5,
    };
    let qualityPoints = 0;
    const qualityBreakdown: Record<string, boolean> = {};
    let qualityFilledCount = 0;
    for (const [label, filled] of qualityChecks) {
      qualityBreakdown[label] = filled;
      if (filled) {
        qualityPoints += qualityWeights[label] || 0;
        qualityFilledCount++;
      }
    }
    const quality = Math.min(100, qualityPoints);

    // --- Overall Score (weighted: 50% engagement, 50% quality) ---
    const score = Math.round(engagement * 0.5 + quality * 0.5);

    // --- Category ---
    const category = score >= 75 ? 'hot' : score >= 50 ? 'warm' : score >= 25 ? 'cool' : 'cold';

    return {
      score, category, engagement, quality,
      engagementBreakdown, qualityBreakdown,
      qualityFilledCount, qualityTotalFields: qualityChecks.length,
      messageCount: communicationHistory.length,
    };
  }, [lead, timeline, communicationHistory]);

  // Write computed scores back to DB for list page display
  useEffect(() => {
    if (!lead?.id || computedScores.score === 0 && computedScores.engagement === 0 && computedScores.quality === 0) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase: any = createClientSupabaseClient();
    supabase
      .from('admission_leads')
      .update({
        score: computedScores.score,
        engagement_score: computedScores.engagement,
        quality_score: computedScores.quality,
        score_category: computedScores.category,
        combined_score: computedScores.score,
        score_updated_at: new Date().toISOString(),
      })
      .eq('id', lead.id)
      .then(({ error }) => {
        if (error) console.warn('[admission/leads] Failed to sync scores:', error.message);
      });
  }, [lead?.id, computedScores.score, computedScores.engagement, computedScores.quality]);

  // Send message dialog state
  const [showSendMsg, setShowSendMsg] = useState(false);
  const [sendChannel, setSendChannel] = useState<'sms' | 'whatsapp' | 'personal_whatsapp'>('personal_whatsapp');
  const [sendMessage, setSendMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [templateAttachment, setTemplateAttachment] = useState<{
    type: 'image' | 'video' | 'document';
    url: string;
  } | null>(null);

  // Fetch active templates filtered by the currently selected channel.
  // Use the logged-in user's institution (not the lead's) since templates belong to the counselor's institution.
  const templateChannel = sendChannel === 'personal_whatsapp' ? 'whatsapp' : sendChannel;
  const { templates: channelTemplates } = useActiveTemplates(userInstitutionId, templateChannel as 'sms' | 'email' | 'whatsapp');
  const { replaceVariables } = useTemplateVariables();

  // Dedicated handler for inline chat — always sends via Personal WhatsApp
  const handleSendPersonalWA = async () => {
    if (!lead || !sendMessage.trim()) return;
    setIsSending(true);
    try {
      const digits = lead.phone.replace(/\D/g, '');
      const intlDigits = digits.startsWith('91') && digits.length === 12 ? digits : `91${digits}`;
      const intlPhone = `${intlDigits}@c.us`; // Always use JID format for reliability
      const deptId = personalWaDepartmentId || profile?.department_id || 'any';

      if (templateAttachment?.url) {
        const mediaRes = await fetch('/api/admission/whatsapp-personal/send-media', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            department_id: deptId,
            to: intlPhone,
            media_url: templateAttachment.url,
            caption: sendMessage.trim(),
            media_type: templateAttachment.type || 'image',
            lead_id: lead.id,
            recipient_name: lead.full_name,
          }),
        });
        const mediaResult = await mediaRes.json();
        if (!mediaResult.success) {
          toast.error(mediaResult.error || 'Failed to send media');
          return;
        }
      } else {
        const res = await fetch('/api/admission/whatsapp-personal/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            department_id: deptId,
            to: intlPhone,
            message: sendMessage.trim(),
            lead_id: lead.id,
            recipient_name: lead.full_name,
          }),
        });
        const result = await res.json();
        if (!result.success) {
          toast.error(result.error || 'Failed to send message');
          return;
        }
      }

      toast.success('Message sent!');
      await createActivity.mutateAsync({
        lead_id: lead.id,
        activity_type: 'whatsapp',
        title: 'Personal WhatsApp message',
        description: sendMessage.trim(),
      });
      queryClient.invalidateQueries({ queryKey: ['lead-communication-history', leadId] });
    } catch (err) {
      toast.error('Failed to send message');
    } finally {
      setIsSending(false);
      setSendMessage('');
      setSelectedTemplateId('');
      setTemplateAttachment(null);
    }
  };

  const handleSendMessage = async () => {
    if (!lead || !sendMessage.trim()) return;

    // Personal WhatsApp — send via BYOW Railway service
    if (sendChannel === 'personal_whatsapp') {
      setIsSending(true);
      try {
        const digits = lead.phone.replace(/\D/g, '');
        const intlDigits = digits.startsWith('91') && digits.length === 12 ? digits : `91${digits}`;
        const intlPhone = `${intlDigits}@c.us`;
        const deptId = personalWaDepartmentId || profile?.department_id || 'any';

        // Send media attachment first (if template has one)
        if (templateAttachment?.url) {
          const mediaRes = await fetch('/api/admission/whatsapp-personal/send-media', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              department_id: deptId,
              to: intlPhone,
              media_url: templateAttachment.url,
              caption: sendMessage.trim(),
              media_type: templateAttachment.type || 'image',
              lead_id: lead.id,
              recipient_name: lead.full_name,
            }),
          });
          const mediaResult = await mediaRes.json();
          if (!mediaResult.success) {
            toast.error(mediaResult.error || 'Failed to send media');
            return;
          }
        } else {
          // Text only
          const res = await fetch('/api/admission/whatsapp-personal/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              department_id: deptId,
              to: intlPhone,
              message: sendMessage.trim(),
              lead_id: lead.id,
              recipient_name: lead.full_name,
            }),
          });
          const result = await res.json();
          if (!result.success) {
            toast.error(result.error || 'Failed to send message');
            return;
          }
        }

        toast.success('Message sent via Personal WhatsApp');
        await createActivity.mutateAsync({
          lead_id: lead.id,
          activity_type: 'whatsapp',
          title: 'Personal WhatsApp message',
          description: sendMessage.trim(),
        });
        queryClient.invalidateQueries({ queryKey: ['lead-communication-history', leadId] });
      } catch (err) {
        toast.error('Failed to send personal WhatsApp message');
      } finally {
        setIsSending(false);
        setSendMessage('');
        setSelectedTemplateId('');
        setTemplateAttachment(null);
        setShowSendMsg(false);
      }
      return;
    }

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

      // Log as activity + WhatsApp log (best-effort — don't block or show error to user)
      try {
        const supabase = createClientSupabaseClient();

        // Insert into admission_whatsapp_logs so the Communication tab shows it
        await (supabase as any)
          .from('admission_whatsapp_logs')
          .insert({
            institution_id: lead.institution_id,
            lead_id: lead.id,
            recipient_phone: intlPhone,
            message_content: sendMessage.trim(),
            delivery_status: 'sent',
            sent_at: new Date().toISOString(),
            metadata: {
                source: 'manual',
                sent_via: 'whatsapp_web',
                ...(selectedTemplateId && { template_id: selectedTemplateId }),
                ...(templateAttachment && { attachment: templateAttachment }),
              },
          });

        // Also log as activity for the timeline
        await createActivity.mutateAsync({
          lead_id: lead.id,
          activity_type: 'whatsapp',
          title: 'WhatsApp message',
          description: sendMessage.trim(),
        });

        queryClient.invalidateQueries({ queryKey: ['lead-communication-history', leadId] });
      } catch (_) { /* best-effort */ }

      toast.success('WhatsApp opened — send the message from your account');

      // Update message counters on the lead
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabaseClient: any = createClientSupabaseClient();
      supabaseClient
        .from('admission_leads')
        .update({
          total_messages_sent: (lead.total_messages_sent || 0) + 1,
          last_message_at: new Date().toISOString(),
        })
        .eq('id', lead.id)
        .then(({ error }) => {
          if (error) console.warn('[admission/leads] Failed to update message count:', error.message);
        });

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

      // Update message counters on the lead
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabaseClient: any = createClientSupabaseClient();
      supabaseClient
        .from('admission_leads')
        .update({
          total_messages_sent: (lead.total_messages_sent || 0) + 1,
          last_message_at: new Date().toISOString(),
        })
        .eq('id', lead.id)
        .then(({ error }) => {
          if (error) console.warn('[admission/leads] Failed to update message count:', error.message);
        });

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

  // Convert to learner state
  const [isConverting, setIsConverting] = useState(false);

  const handleConvertToLearner = async () => {
    if (!lead?.id || !lead.institution_id) return;
    setIsConverting(true);
    try {
      const res = await fetch('/api/admission/bridge/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId: lead.id, institutionId: lead.institution_id }),
      });
      const json = await res.json();
      if (!res.ok) {
        // If already converted (409), redirect to the existing profile
        if (res.status === 409 && json.profileId) {
          router.push(`/learners/enquiries/${json.profileId}/edit`);
          return;
        }
        throw new Error(json.error || 'Conversion failed');
      }
      toast.success('Admitted created — redirecting...');
      router.push(`/learners/enquiries/${json.profileId}/edit`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Conversion failed');
    } finally {
      setIsConverting(false);
    }
  };

  // Edit lead dialog state
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editForm, setEditForm] = useState({
    institution_id: '',
    first_name: '',
    last_name: '',
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
    admission_year_id: '',
    student_interest_level: '',
    parent_decision_status: '',
    notes: '',
  });
  // Edit form: primary program (single) + alternative programs (multi) — 2026-04-21
  const [editPrimaryProgramId, setEditPrimaryProgramId] = useState<string>('');
  const [editAlternativeProgramIds, setEditAlternativeProgramIds] = useState<
    string[]
  >([]);
  // Edit form: admission years cascade is now handled by <AdmissionYearSelect/>
  // (extracted 2026-04-23). State + fetch + JSX live inside the shared component.

  // Fetch institution name for details display
  const [institutionName, setInstitutionName] = useState<string>('');
  useEffect(() => {
    if (lead?.institution_id) {
      const supabase = createClientSupabaseClient();
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
    }
  }, [lead?.institution_id]);

  // Organization hierarchy for Create Application dialog
  const { institutions } = useInstitutionsWithAccess();
  const { data: degreesData, isLoading: loadingDegrees } = useDegrees({
    institution_id: selectedInstitutionId || undefined,
  });
  const { data: departmentsData, isLoading: loadingDepartments } = useDepartments({
    degree_id: selectedDegreeId || undefined,
  });
  const { data: programsData, isLoading: loadingPrograms } = usePrograms({
    department_id: selectedDepartmentId || undefined,
  });
  const filteredDegrees = degreesData?.data || [];
  const filteredDepartments = departmentsData?.data || [];
  const filteredPrograms = programsData?.data || [];

  // All programs for the lead's institution (used for Interested Programs display)
  const { data: allInstitutionProgramsData, isLoading: programsLoading } = usePrograms({
    institution_id: lead?.institution_id || undefined,
  });
  const programs = allInstitutionProgramsData?.data || [];

  // Pre-select institution from lead data
  useEffect(() => {
    if (lead?.institution_id && !selectedInstitutionId) {
      setSelectedInstitutionId(lead.institution_id);
    }
  }, [lead?.institution_id]);

  // Counselors from profiles (role='counselor') — global across all institutions
  const { data: counselorProfiles, isLoading: counselorsLoading } = useCounselorProfiles(null);
  const counselors = counselorProfiles || [];

  // Consultants for dropdown (referral leads) — global across all institutions
  const { data: consultantsDropdown = [] } = useConsultantsForDropdown();
  const { data: studentsDropdown = [] } = useStudentsForDropdown(lead?.institution_id || undefined);
  const { data: facultyDropdown = [] } = useFacultyForDropdown(lead?.institution_id || undefined);

  // Consultant attributions for this lead (used in Details tab assignment section)
  const { attributions: leadAttributions } = useLeadAttributions(leadId);

  // Edit form: selected counselor / consultant (separate from editForm text fields)
  const [editCounselorProfileId, setEditCounselorProfileId] = useState('');
  const [editConsultantId, setEditConsultantId] = useState('');
  const [editReferralType, setEditReferralType] = useState<ReferralType | ''>('');
  const [editReferrerId, setEditReferrerId] = useState('');

  // Primary program display name (from lead.program_id, with join fallback)
  const primaryProgramName = useMemo(() => {
    if (!lead) return '';
    if ((lead as any).program?.program_name) return (lead as any).program.program_name;
    if (!lead.program_id || !programs.length) return '';
    return programs.find((p) => p.id === lead.program_id)?.program_name || '';
  }, [lead, programs]);

  // Alternative program names (from lead.alternative_programs, with legacy
  // fallback to interested_programs for 350 historical rows).
  const alternativeProgramNames = useMemo(() => {
    const ids =
      (lead as any)?.alternative_programs ?? lead?.interested_programs ?? [];
    if (!ids.length || !programs.length) return [];
    return ids
      .map((id: string) => programs.find((p) => p.id === id)?.program_name)
      .filter(Boolean);
  }, [lead, programs]);

  // Edit form: cascading districts
  const editDistricts = useMemo(() => {
    return editForm.state ? getDistrictsByState(editForm.state) : [];
  }, [editForm.state]);

  // Edit form: programs driven by the editable institution (lets user change
  // institution mid-edit and immediately see the right program list).
  const editProgramsInstitutionId = editForm.institution_id || lead?.institution_id || undefined;
  const { data: editProgramsData, isLoading: editProgramsLoading } = usePrograms({
    institution_id: editProgramsInstitutionId,
  });
  const editPrograms = editProgramsData?.data || [];

  // (Edit-form admission-years fetch effect removed; lives inside <AdmissionYearSelect/>.)

  // Clear admission_year_id when primary program changes (old value stale)
  useEffect(() => {
    setEditForm((prev) =>
      prev.admission_year_id
        ? { ...prev, admission_year_id: '' }
        : prev
    );
  }, [editPrimaryProgramId]);

  // Toggle for alternative programs — excludes the chosen primary.
  const toggleEditAlternativeProgram = (programId: string) => {
    if (programId === editPrimaryProgramId) return;
    setEditAlternativeProgramIds((prev) =>
      prev.includes(programId)
        ? prev.filter((id) => id !== programId)
        : [...prev, programId]
    );
  };

  // Populate edit form when dialog opens
  const openEditDialog = () => {
    if (!lead) return;
    const l = lead;
    // Reverse-map state name to state ID for dropdown
    const stateId = indianStates.find((s) => s.name === l.state)?.id || '';
    const districts = stateId ? getDistrictsByState(stateId) : [];
    const districtId = districts.find((d) => d.name === l.district)?.id || '';
    setEditForm({
      institution_id: l.institution_id || '',
      first_name: l.first_name || '',
      last_name: l.last_name || '',
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
      admission_year_id: (l as any).admission_year_id || '',
      student_interest_level: (l as any).student_interest_level || '',
      parent_decision_status: (l as any).parent_decision_status || '',
      notes: (l as any).notes || '',
    });
    // 2026-04-21 — primary program from program_id; alternatives from new column
    // with legacy fallback to interested_programs for rows created before the split.
    setEditPrimaryProgramId(((l as any).program_id as string) || '');
    const altIds =
      ((l as any).alternative_programs as string[] | null) ??
      (Array.isArray(l.interested_programs) ? (l.interested_programs as string[]) : []);
    setEditAlternativeProgramIds(altIds ?? []);
    // Pre-populate counselor (from assigned_counselor_id which references profiles.id)
    setEditCounselorProfileId(l.assigned_counselor_id || '');
    // Pre-populate referral type and referrer
    setEditReferralType((l.referral_type as ReferralType) || '');
    setEditReferrerId(l.referred_by_id || '');
    // Pre-populate consultant from primary lead attribution (stored in consultant_lead_attributions, not on the lead row)
    const primaryAttribution = leadAttributions.find((a) => a.attribution_type === 'primary');
    setEditConsultantId(primaryAttribution?.consultant_id || l.referred_by_id || '');
    setShowEditDialog(true);
  };

  const handleEditChange = (field: string, value: string) => {
    setEditForm((prev) => {
      if (field === 'state') return { ...prev, state: value, district: '' };
      // Switching institution invalidates programs/academic year (both are per-institution)
      // and the counselor (counselors are per-institution too)
      if (field === 'institution_id') {
        setEditPrimaryProgramId('');
        setEditAlternativeProgramIds([]);
        setEditCounselorProfileId('');
        return { ...prev, institution_id: value, admission_year_id: '' };
      }
      // When source changes, clear the irrelevant assignment
      if (field === 'source') {
        if (value === 'referral') {
          setEditCounselorProfileId('');
        } else {
          setEditConsultantId('');
          setEditReferralType('');
          setEditReferrerId('');
        }
      }
      return { ...prev, [field]: value };
    });
  };

  const handleEditSubmit = async () => {
    if (!lead || !editForm.first_name.trim() || !editForm.phone.trim()) {
      toast.error('First name and phone are required');
      return;
    }
    const selectedState = indianStates.find((s) => s.id === editForm.state);
    const selectedDistrict = editDistricts.find((d) => d.id === editForm.district);
    updateLead.mutate(
      {
        id: lead.id,
        data: {
          institution_id: editForm.institution_id || lead.institution_id,
          first_name: editForm.first_name.trim(),
          last_name: editForm.last_name.trim() || null,
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
          admission_year_id: editForm.admission_year_id || null,
          student_interest_level: editForm.student_interest_level || null,
          parent_decision_status: editForm.parent_decision_status || null,
          notes: editForm.notes?.trim() || null,
          program_id: editPrimaryProgramId || null,
          alternative_programs:
            editAlternativeProgramIds.length > 0 ? editAlternativeProgramIds : null,
          referral_type: editForm.source === 'referral' && editReferralType ? editReferralType : null,
          referred_by_id: (() => {
            if (editForm.source !== 'referral' || !editReferralType) return null;
            if (editReferralType === 'consultant') {
              return editConsultantId && editConsultantId !== '_none' ? editConsultantId : null;
            }
            return editReferrerId && editReferrerId !== '_none' ? editReferrerId : null;
          })(),
          referred_by_name: (() => {
            if (editForm.source !== 'referral' || !editReferralType) return null;
            if (editReferralType === 'consultant') {
              return consultantsDropdown.find((c) => c.id === editConsultantId)?.name || null;
            }
            if (editReferralType === 'student') {
              return studentsDropdown.find((s) => s.id === editReferrerId)?.name || null;
            }
            if (editReferralType === 'faculty') {
              return facultyDropdown.find((f) => f.id === editReferrerId)?.name || null;
            }
            return null;
          })(),
        },
      },
      {
        onSuccess: async () => {
          // Best-effort: assign counselor or consultant based on source
          if (editForm.source !== 'referral' && editCounselorProfileId && editCounselorProfileId !== '_none') {
            try {
              // Resolve profile → admission_counselors row (creates if missing)
              const counselorId = await CounselorDailyViewService.resolveOrCreateCounselor(
                editCounselorProfileId,
                lead.institution_id ?? undefined
              );
              await assignCounselor.mutateAsync({
                leadId: lead.id,
                counselorId,
                profileId: editCounselorProfileId,
              });
            } catch (e) {
              console.warn('[admission/leads] Could not assign counselor during edit:', e);
            }
          }
          if (editForm.source === 'referral' && editReferralType === 'consultant' && editConsultantId && editConsultantId !== '_none' && lead.institution_id) {
            try {
              const existingAttribution = leadAttributions.find((a) => a.attribution_type === 'primary');
              if (existingAttribution) {
                // Update existing primary attribution to point to the (possibly new) consultant
                const supabase = createClientSupabaseClient();
                await (supabase as any)
                  .from('consultant_lead_attributions')
                  .update({ consultant_id: editConsultantId, updated_at: new Date().toISOString() })
                  .eq('id', existingAttribution.id);
              } else {
                await ConsultantService.createLeadAttribution({
                  institution_id: lead.institution_id,
                  lead_id: lead.id,
                  consultant_id: editConsultantId,
                  attribution_type: 'primary',
                  attribution_percentage: 100,
                });
              }
              queryClient.invalidateQueries({ queryKey: ['lead-attributions'] });
            } catch (e) {
              console.warn('[admission/leads] Could not update consultant attribution during edit:', e);
            }
          }
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
      <PermissionGuard module="admission" action="leads.view">
        <ContentLayout title="Lead Details">
          <LeadDetailSkeleton />
          <LogCallDialog
          open={showLogCallDialog}
          onOpenChange={setShowLogCallDialog}
          lead={lead ? { id: lead.id, full_name: lead.full_name, phone: lead.phone, funnel_stage: lead.funnel_stage, institution_id: lead.institution_id } : null}
          onSendWhatsApp={() => { setShowLogCallDialog(false); setPersonalMsgOpen(true); }}
        />
      </ContentLayout>
      </PermissionGuard>
    );
  }

  if (!lead) {
    return (
      <PermissionGuard module="admission" action="leads.view">
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
    if (!lead || !selectedProgramId || !selectedDegreeId || !selectedDepartmentId) {
      toast.error('Please select all academic fields');
      return;
    }
    createApplication.mutate(
      {
        institution_id: selectedInstitutionId,
        lead_id: leadId,
        degree_id: selectedDegreeId,
        department_id: selectedDepartmentId,
        program_id: selectedProgramId,
      },
      {
        onSuccess: () => {
          setShowCreateAppDialog(false);
          setSelectedDegreeId('');
          setSelectedDepartmentId('');
          setSelectedProgramId('');
          refetch();
        },
      }
    );
  };

  return (
    <PermissionGuard module="admission" action="leads.view">
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
              {/* Convert to Admitted — shows "View Learner Profile" once converted */}
              {lead.learner_profile_id ? (
                <Button variant="outline" size="sm" asChild>
                  <a href={`/learners/profiles/${lead.learner_profile_id}`}>
                    <ExternalLink className="h-4 w-4 mr-2" />
                    View Learner Profile
                  </a>
                </Button>
              ) : (
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleConvertToLearner}
                  disabled={isConverting}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  <UserPlus className={`h-4 w-4 mr-2 ${isConverting ? 'animate-pulse' : ''}`} />
                  {isConverting ? 'Converting...' : 'Convert to Admitted'}
                </Button>
              )}

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
                      // Use setTimeout to escape Radix dropdown's focus trap
                      // which blocks window.confirm() from working properly
                      setTimeout(() => {
                        if (window.confirm('Are you sure you want to delete this lead? This action cannot be undone.')) {
                          deleteLead.mutate(leadId, {
                            onSuccess: () => router.push('/admission/leads'),
                          });
                        }
                      }, 100);
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
                      {(() => {
                        const allowedNextStages = lead?.funnel_stage
                          ? ALLOWED_STAGE_TRANSITIONS[lead.funnel_stage as FunnelStage] ?? []
                          : FUNNEL_STAGES.map(s => s.value);
                        return FUNNEL_STAGES.filter(
                          s => allowedNextStages.includes(s.value as FunnelStage) || s.value === lead?.funnel_stage
                        ).map((stage) => (
                          <SelectItem key={stage.value} value={stage.value}>
                            {stage.label}
                          </SelectItem>
                        ));
                      })()}
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
              <TooltipProvider delayDuration={200}>
              <div className="grid grid-cols-4 gap-4">
                {/* Overall Score */}
                <Card>
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-1">
                          <p className="text-xs text-muted-foreground">Score</p>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-[260px] text-xs space-y-1.5 p-3">
                              <p className="font-semibold">Overall Lead Score</p>
                              <p>Weighted average of Engagement and Quality:</p>
                              <p className="font-mono text-[11px]">Score = (Engagement × 50%) + (Quality × 50%)</p>
                              <div className="border-t pt-1.5 mt-1.5 space-y-0.5">
                                <p>Engagement: <span className="font-medium">{computedScores.engagement}</span> pts</p>
                                <p>Quality: <span className="font-medium">{computedScores.quality}</span> pts</p>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <p className="text-2xl font-bold">{computedScores.score}</p>
                      </div>
                      <Target className="h-8 w-8 text-primary opacity-50" />
                    </div>
                  </CardContent>
                </Card>

                {/* Category */}
                <Card>
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-1">
                          <p className="text-xs text-muted-foreground">Category</p>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-[220px] text-xs space-y-1 p-3">
                              <p className="font-semibold">Score Category Thresholds</p>
                              <p className={`${computedScores.category === 'hot' ? 'font-bold' : 'opacity-70'} text-red-300`}>Hot: 75 – 100</p>
                              <p className={`${computedScores.category === 'warm' ? 'font-bold' : 'opacity-70'} text-orange-300`}>Warm: 50 – 74</p>
                              <p className={`${computedScores.category === 'cool' ? 'font-bold' : 'opacity-70'} text-cyan-300`}>Cool: 25 – 49</p>
                              <p className={`${computedScores.category === 'cold' ? 'font-bold' : 'opacity-70'} text-blue-300`}>Cold: 0 – 24</p>
                              <p className="border-t pt-1 mt-1">Current score: <span className="font-medium">{computedScores.score}</span></p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <p className={`text-2xl font-bold capitalize ${
                          computedScores.category === 'hot' ? 'text-red-600' :
                          computedScores.category === 'warm' ? 'text-orange-600' :
                          computedScores.category === 'cool' ? 'text-cyan-600' :
                          computedScores.category === 'cold' ? 'text-blue-600' : 'text-muted-foreground'
                        }`}>
                          {computedScores.category}
                        </p>
                      </div>
                      <Flame className="h-8 w-8 text-orange-500 opacity-50" />
                    </div>
                  </CardContent>
                </Card>

                {/* Engagement */}
                <Card>
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-1">
                          <p className="text-xs text-muted-foreground">Engagement</p>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-[260px] text-xs space-y-1.5 p-3">
                              <p className="font-semibold">Engagement Score</p>
                              <p>Based on activity interactions with this lead:</p>
                              {Object.keys(computedScores.engagementBreakdown).length > 0 ? (
                                <div className="border-t pt-1.5 mt-1.5 space-y-0.5">
                                  {Object.entries(computedScores.engagementBreakdown).map(([label, data]) => (
                                    <p key={label}>{label}: {data.count}× = <span className="font-medium">{data.points} pts</span></p>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-muted-foreground italic border-t pt-1.5 mt-1.5">No activities recorded yet</p>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <p className="text-2xl font-bold">{computedScores.engagement}</p>
                      </div>
                      <TrendingUp className="h-8 w-8 text-blue-500 opacity-50" />
                    </div>
                  </CardContent>
                </Card>

                {/* Quality */}
                <Card>
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-1">
                          <p className="text-xs text-muted-foreground">Quality</p>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-[240px] text-xs space-y-1.5 p-3">
                              <p className="font-semibold">Profile Quality ({computedScores.qualityFilledCount}/{computedScores.qualityTotalFields} fields)</p>
                              <div className="border-t pt-1.5 mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5">
                                {Object.entries(computedScores.qualityBreakdown).map(([field, filled]) => (
                                  <p key={field} className={filled ? 'text-green-300' : 'text-red-300/70'}>
                                    {filled ? '✓' : '✗'} {field}
                                  </p>
                                ))}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <p className="text-2xl font-bold">{computedScores.quality}</p>
                      </div>
                      <Star className="h-8 w-8 text-yellow-500 opacity-50" />
                    </div>
                  </CardContent>
                </Card>
              </div>
              </TooltipProvider>

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
                  <Card className="flex flex-col" style={{ height: 'calc(100vh - 320px)', minHeight: '500px' }}>
                    {/* Chat Header */}
                    <CardHeader className="shrink-0 pb-3 border-b">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-[#25D366] flex items-center justify-center">
                            <MessageCircle className="h-4.5 w-4.5 text-white" />
                          </div>
                          <div>
                            <CardTitle className="text-base">{lead?.full_name || 'Chat'}</CardTitle>
                            <CardDescription className="text-xs">{lead?.phone || ''}</CardDescription>
                          </div>
                        </div>
                        {waStatus?.connected && (
                          <Badge className="bg-[#25D366] text-white text-xs">Connected</Badge>
                        )}
                      </div>
                    </CardHeader>

                    {/* Chat Messages Area */}
                    <CardContent className="flex-1 overflow-y-auto p-4" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%239C92AC\' fill-opacity=\'0.03\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }}>
                      {commLoading ? (
                        <div className="space-y-4">
                          {[1, 2, 3].map((i) => (
                            <Skeleton key={i} className="h-12 w-3/4" />
                          ))}
                        </div>
                      ) : communicationHistory.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                          <MessageSquare className="h-12 w-12 mb-3 opacity-30" />
                          <p className="font-medium">No messages yet</p>
                          <p className="text-sm mt-1">Start a conversation below</p>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {[...communicationHistory].reverse().map((message) => (
                            <CommunicationItem key={message.id} message={message as any} />
                          ))}
                        </div>
                      )}
                    </CardContent>

                    {/* Attachment Preview */}
                    {templateAttachment && (
                      <div className="shrink-0 px-4 py-2 border-t bg-muted/30">
                        <div className="flex items-center gap-2">
                          {templateAttachment.type === 'image' ? (
                            <img src={templateAttachment.url} alt="Attachment" className="h-12 w-12 rounded object-cover" />
                          ) : (
                            <div className="h-12 w-12 rounded bg-muted flex items-center justify-center">
                              {templateAttachment.type === 'video' ? <Film className="h-5 w-5 text-purple-500" /> : <FileTextIcon className="h-5 w-5 text-orange-500" />}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium capitalize">{templateAttachment.type} attached</p>
                            <p className="text-xs text-muted-foreground truncate">{templateAttachment.url.split('/').pop()}</p>
                          </div>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setTemplateAttachment(null)}>
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Chat Input Bar — defaults to Personal WhatsApp */}
                    <div className="shrink-0 border-t p-3">
                      {/* Template selector row (only if templates available) */}
                      {channelTemplates.length > 0 && (
                        <div className="flex items-center gap-2 mb-2">
                          <Select
                            value={selectedTemplateId}
                            onValueChange={(id) => {
                              setSelectedTemplateId(id);
                              setSendChannel('personal_whatsapp');
                              const tmpl = channelTemplates.find((t) => t.id === id);
                              if (tmpl) {
                                setSendMessage(
                                  replaceVariables(tmpl.content, {
                                    first_name: lead?.full_name?.split(' ')[0] || '',
                                    last_name: lead?.full_name?.split(' ').slice(1).join(' ') || '',
                                    full_name: lead?.full_name || '',
                                    phone: lead?.phone || '',
                                    email: lead?.email || '',
                                    program: lead?.program?.program_name || '',
                                  })
                                );
                                setTemplateAttachment(
                                  tmpl.attachment_type && tmpl.attachment_url
                                    ? { type: tmpl.attachment_type, url: tmpl.attachment_url }
                                    : null
                                );
                              }
                            }}
                          >
                            <SelectTrigger className="h-8 text-xs w-auto max-w-[200px]">
                              <Paperclip className="h-3 w-3 mr-1.5" />
                              <SelectValue placeholder="Use template..." />
                            </SelectTrigger>
                            <SelectContent>
                              {channelTemplates.map((t) => (
                                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {/* Message input + send */}
                      <div className="flex items-end gap-2">
                        <Textarea
                          value={sendMessage}
                          onChange={(e) => setSendMessage(e.target.value)}
                          placeholder="Type a message..."
                          rows={1}
                          className="min-h-[40px] max-h-[120px] resize-none text-sm"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              if (sendMessage.trim() && !isSending) handleSendPersonalWA();
                            }
                          }}
                        />
                        <Button
                          size="icon"
                          className="shrink-0 h-10 w-10 bg-[#25D366] hover:bg-[#1da851] text-white rounded-full"
                          onClick={handleSendPersonalWA}
                          disabled={isSending || !sendMessage.trim()}
                        >
                          {isSending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Send className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
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
                            {formatDateDMY(lead.date_of_birth)}
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
                            {formatDateDMY(lead.entry_date ?? lead.created_at)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-sm text-muted-foreground">Admission Year</dt>
                          <dd className="font-medium">
                            {lead.admission_year?.admission_year_name
                              ? `${lead.admission_year.admission_year_name} (${lead.admission_year.program_start_year}–${lead.admission_year.program_end_year})`
                              : lead.academic_year /* legacy fallback for historical rows */
                                || '-'}
                          </dd>
                        </div>
                       
                        <div>
                          <dt className="text-sm text-muted-foreground">Student Interest Level</dt>
                          <dd className="font-medium capitalize">{(lead.student_interest_level || '-').replace(/_/g, ' ')}</dd>
                        </div>
                        <div>
                          <dt className="text-sm text-muted-foreground">Parent Decision Status</dt>
                          <dd className="font-medium capitalize">{(lead.parent_decision_status || '-').replace(/_/g, ' ')}</dd>
                        </div>
                        <div>
                          <dt className="text-sm text-muted-foreground">Interested Program</dt>
                          <dd className="font-medium">
                            {programsLoading ? (
                              <span className="text-muted-foreground text-sm">Loading...</span>
                            ) : primaryProgramName ? (
                              <Badge variant="default">{primaryProgramName}</Badge>
                            ) : '-'}
                          </dd>
                        </div>
                        <div className="col-span-2">
                          <dt className="text-sm text-muted-foreground">Alternative Programs</dt>
                          <dd className="font-medium">
                            {programsLoading ? (
                              <span className="text-muted-foreground text-sm">Loading...</span>
                            ) : alternativeProgramNames.length > 0 ? (
                              <div className="flex flex-wrap gap-1.5 mt-1">
                                {alternativeProgramNames.map((name: string, i: number) => (
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
                        {lead.source === 'referral' && lead.referral_type && (
                          <>
                            <div>
                              <dt className="text-sm text-muted-foreground">Referral Type</dt>
                              <dd className="font-medium capitalize">{lead.referral_type}</dd>
                            </div>
                            {lead.referred_by_name && (
                              <div>
                                <dt className="text-sm text-muted-foreground">Referred By</dt>
                                <dd className="font-medium">{lead.referred_by_name}</dd>
                              </div>
                            )}
                          </>
                        )}
                        <div>
                          <dt className="text-sm text-muted-foreground">Preferred Channel</dt>
                          <dd className="font-medium capitalize">{(lead.preferred_channel || '-').replace(/_/g, ' ')}</dd>
                        </div>
                        <div>
                          <dt className="text-sm text-muted-foreground">Created</dt>
                          <dd className="font-medium">
                            {formatDateTimeDMY(lead.created_at)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-sm text-muted-foreground">Last Activity</dt>
                          <dd className="font-medium">
                            {formatDateTimeDMY(lead.last_contact_at)}
                          </dd>
                        </div>
                      </dl>
                    </CardContent>
                  </Card>

                  {/* Assignment Details — source-based: referral → consultant, others → counselor */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <User className="h-4 w-4" />
                        {lead.source === 'referral' ? 'Consultant Details' : 'Assigned Counselor'}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {lead.source === 'referral' ? (
                        /* Consultant section for referral leads */
                        leadAttributions.length > 0 ? (
                          <div className="space-y-2">
                            {leadAttributions.map((attr: any) => (
                              <div key={attr.id} className="rounded-md border p-3">
                                <div className="flex items-center justify-between">
                                  <p className="font-medium">{attr.consultant?.name || 'Unknown'}</p>
                                  <div className="flex items-center gap-1.5">
                                    <Badge variant="outline" className="text-xs capitalize">
                                      {attr.attribution_type}
                                    </Badge>
                                    {attr.is_verified ? (
                                      <Badge className="text-xs bg-green-100 text-green-800">Verified</Badge>
                                    ) : (
                                      <Badge className="text-xs bg-yellow-100 text-yellow-800">Pending</Badge>
                                    )}
                                  </div>
                                </div>
                                {(attr.consultant?.email || attr.consultant?.phone || attr.attribution_percentage != null) && (
                                  <dl className="grid grid-cols-2 gap-2 text-sm mt-2">
                                    {attr.consultant?.email && (
                                      <div>
                                        <dt className="text-muted-foreground">Email</dt>
                                        <dd>{attr.consultant.email}</dd>
                                      </div>
                                    )}
                                    {attr.consultant?.phone && (
                                      <div>
                                        <dt className="text-muted-foreground">Phone</dt>
                                        <dd>{attr.consultant.phone}</dd>
                                      </div>
                                    )}
                                    {attr.attribution_percentage != null && (
                                      <div>
                                        <dt className="text-muted-foreground">Commission</dt>
                                        <dd>{attr.attribution_percentage}%</dd>
                                      </div>
                                    )}
                                  </dl>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-md border border-dashed p-3 text-center">
                            <p className="text-sm text-muted-foreground">No consultant linked</p>
                          </div>
                        )
                      ) : (
                        /* Counselor section for non-referral leads */
                        lead.counselor_id && lead.counselor ? (
                          <div className="rounded-md border p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <p className="font-medium">{lead.counselor.name}</p>
                              <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                                Active
                              </Badge>
                            </div>
                            <dl className="grid grid-cols-2 gap-2 text-sm">
                              {lead.counselor.email && (
                                <div>
                                  <dt className="text-muted-foreground">Email</dt>
                                  <dd>{lead.counselor.email}</dd>
                                </div>
                              )}
                              {lead.counselor.phone && (
                                <div>
                                  <dt className="text-muted-foreground">Phone</dt>
                                  <dd>{lead.counselor.phone}</dd>
                                </div>
                              )}
                              {lead.counselor.designation && (
                                <div>
                                  <dt className="text-muted-foreground">Designation</dt>
                                  <dd className="capitalize">{lead.counselor.designation}</dd>
                                </div>
                              )}
                              {lead.assigned_at && (
                                <div>
                                  <dt className="text-muted-foreground">Assigned On</dt>
                                  <dd>{formatDateShort(lead.assigned_at)}</dd>
                                </div>
                              )}
                            </dl>
                          </div>
                        ) : (
                          <div className="rounded-md border border-dashed p-3 text-center">
                            <p className="text-sm text-muted-foreground">No counselor assigned</p>
                            <Button
                              variant="outline"
                              size="sm"
                              className="mt-2"
                              onClick={() => setShowAssignCounselorDialog(true)}
                            >
                              Assign Counselor
                            </Button>
                          </div>
                        )
                      )}
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
              {/* Expo Bridge — show exhibition attribution when lead came from an expo */}
              {lead.expo_event_id && expoEvent && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <ScanLine className="h-4 w-4" />
                      Exhibition Capture
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div>
                      <p className="text-sm text-muted-foreground">Event</p>
                      <Link
                        href={`/admission/marketing/expos/${lead.expo_event_id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {expoEvent.event_name}
                      </Link>
                    </div>
                    {expoEvent.city && (
                      <div>
                        <p className="text-sm text-muted-foreground">Location</p>
                        <p className="font-medium">{expoEvent.city}{expoEvent.venue_name ? ` \u2022 ${expoEvent.venue_name}` : ''}</p>
                      </div>
                    )}
                    {lead.captured_by && (
                      <div>
                        <p className="text-sm text-muted-foreground">Captured By</p>
                        <p className="font-medium">{lead.referred_by_name || 'Team Member'}</p>
                      </div>
                    )}
                    {lead.tags?.includes('ai-zone') && (
                      <Badge variant="outline" className="text-xs">AI Experience Zone</Badge>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Source-based: show Consultant Attribution for referral leads, Counselor info for others */}
              {lead.source === 'referral' ? (
                <ConsultantAttributionCard
                  leadId={leadId}
                  institutionId={lead.institution_id}
                />
              ) : (
                lead.counselor_id && (
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base flex items-center gap-2">
                          <User className="h-4 w-4" />
                          Assigned Counselor
                        </CardTitle>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowAssignCounselorDialog(true)}
                        >
                          Change
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="font-medium">{lead.counselor?.name || 'Unknown'}</p>
                      {lead.assigned_at && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Assigned {formatDateDMY(lead.assigned_at)}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                )
              )}

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
                            placeholder="e.g., engineering, priority"
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

                  {/* Personal WhatsApp Button — always shown, dialog handles not-connected state */}
                  <Button
                    variant="outline"
                    className="w-full justify-start text-green-600 border-green-300 hover:bg-green-50"
                    size="sm"
                    onClick={() => setPersonalMsgOpen(true)}
                  >
                    <MessageCircle className="h-4 w-4 mr-2" />
                    Personal WhatsApp
                  </Button>

                  {/* Assign Counselor Dialog — only for non-referral leads (referral leads use consultant attribution) */}
                  {lead.source !== 'referral' && (
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
                  )}

                  {/* Create Application Dialog */}
                  <Dialog open={showCreateAppDialog} onOpenChange={(open) => { setShowCreateAppDialog(open); if (!open) { setSelectedDegreeId(''); setSelectedDepartmentId(''); setSelectedProgramId(''); } }}>
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
                        {/* Institution */}
                        <div>
                          <Label>Institution *</Label>
                          <Select value={selectedInstitutionId} onValueChange={(value) => {
                            setSelectedInstitutionId(value);
                            setSelectedDegreeId('');
                            setSelectedDepartmentId('');
                            setSelectedProgramId('');
                          }}>
                            <SelectTrigger className="mt-1.5">
                              <SelectValue placeholder="Select institution" />
                            </SelectTrigger>
                            <SelectContent>
                              {institutions.map((inst) => (
                                <SelectItem key={inst.id} value={inst.id}>{inst.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Degree */}
                        <div>
                          <Label>Degree *</Label>
                          <Select value={selectedDegreeId} onValueChange={(value) => {
                            setSelectedDegreeId(value);
                            setSelectedDepartmentId('');
                            setSelectedProgramId('');
                          }} disabled={!selectedInstitutionId || loadingDegrees}>
                            <SelectTrigger className="mt-1.5">
                              <SelectValue placeholder={loadingDegrees ? "Loading..." : "Select degree"} />
                            </SelectTrigger>
                            <SelectContent>
                              {filteredDegrees.map((deg: any) => (
                                <SelectItem key={deg.id} value={deg.id}>{deg.degree_name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Department */}
                        <div>
                          <Label>Department *</Label>
                          <Select value={selectedDepartmentId} onValueChange={(value) => {
                            setSelectedDepartmentId(value);
                            setSelectedProgramId('');
                          }} disabled={!selectedDegreeId || loadingDepartments}>
                            <SelectTrigger className="mt-1.5">
                              <SelectValue placeholder={loadingDepartments ? "Loading..." : "Select department"} />
                            </SelectTrigger>
                            <SelectContent>
                              {filteredDepartments.map((dept: any) => (
                                <SelectItem key={dept.id} value={dept.id}>{dept.department_name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Program */}
                        <div>
                          <Label>Program *</Label>
                          <Select value={selectedProgramId} onValueChange={setSelectedProgramId} disabled={!selectedDepartmentId || loadingPrograms}>
                            <SelectTrigger className="mt-1.5">
                              <SelectValue placeholder={loadingPrograms ? "Loading..." : "Select program"} />
                            </SelectTrigger>
                            <SelectContent>
                              {filteredPrograms.map((prog: any) => (
                                <SelectItem key={prog.id} value={prog.id}>{prog.program_name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Lead info preview */}
                        <div className="rounded-md bg-muted p-3 text-sm space-y-1">
                          <p><span className="text-muted-foreground">Name:</span> {lead.full_name || '-'}</p>
                          <p><span className="text-muted-foreground">Email:</span> {lead.email || '-'}</p>
                          <p><span className="text-muted-foreground">Phone:</span> {lead.phone || '-'}</p>
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => { setShowCreateAppDialog(false); setSelectedDegreeId(''); setSelectedDepartmentId(''); setSelectedProgramId(''); }}>Cancel</Button>
                        <Button onClick={handleCreateApplication} disabled={createApplication.isPending || !selectedProgramId || !selectedDegreeId || !selectedDepartmentId || !selectedInstitutionId}>
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
                      {new Date((lead as any).next_followup_at).toLocaleDateString('en-GB', {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
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
                        {formatDateDMY(lead.created_at)}
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
                          ? formatDateDMY(lead.last_contact_at)
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
                          {formatDateTimeDMY(lead.next_followup_at)}
                        </p>
                      </div>
                    </div>
                  )}
                  {lead.source !== 'referral' && lead.counselor_id && (
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
                {/* Institution */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-muted-foreground">Institution</h4>
                  <div>
                    <Label htmlFor="edit-institution">Institution *</Label>
                    {institutions.length > 1 ? (
                      <Select
                        value={editForm.institution_id}
                        onValueChange={(v) => handleEditChange('institution_id', v)}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Select institution" />
                        </SelectTrigger>
                        <SelectContent>
                          {institutions.map((inst) => (
                            <SelectItem key={inst.id} value={inst.id}>{inst.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        id="edit-institution"
                        value={
                          institutions.find((i) => i.id === editForm.institution_id)?.name ||
                          institutionName ||
                          ''
                        }
                        disabled
                        className="mt-1 bg-muted"
                      />
                    )}
                    {editForm.institution_id &&
                      lead?.institution_id &&
                      editForm.institution_id !== lead.institution_id && (
                        <p className="mt-1 text-xs text-amber-600">
                          Changing institution will clear programs, counselor, and academic year.
                        </p>
                      )}
                  </div>
                </div>

                {/* Personal Info */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-muted-foreground">Personal Information</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="edit-first_name">First Name *</Label>
                      <Input
                        id="edit-first_name"
                        value={editForm.first_name}
                        onChange={(e) => handleEditChange('first_name', e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-last_name">Last Name</Label>
                      <Input
                        id="edit-last_name"
                        value={editForm.last_name}
                        onChange={(e) => handleEditChange('last_name', e.target.value)}
                        className="mt-1"
                        placeholder="Optional"
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

                {/* Academic & Interest */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-muted-foreground">Academic & Interest</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <AdmissionYearSelect
                        institutionId={editProgramsInstitutionId}
                        programId={editPrimaryProgramId}
                        value={editForm.admission_year_id}
                        onChange={(v) => handleEditChange('admission_year_id', v)}
                        id="edit-admission_year"
                        placeholderNoProgram="Select the Interested Program first"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-interest_level">Student Interest Level</Label>
                      <Select
                        value={editForm.student_interest_level}
                        onValueChange={(v) => handleEditChange('student_interest_level', v)}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Select interest level" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="very_high">Very High</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="undecided">Undecided</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2">
                      <Label htmlFor="edit-parent_decision">Parent Decision Status</Label>
                      <Select
                        value={editForm.parent_decision_status}
                        onValueChange={(v) => handleEditChange('parent_decision_status', v)}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Select decision status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="supportive">Supportive</SelectItem>
                          <SelectItem value="considering">Considering</SelectItem>
                          <SelectItem value="neutral">Neutral</SelectItem>
                          <SelectItem value="reluctant">Reluctant</SelectItem>
                          <SelectItem value="opposed">Opposed</SelectItem>
                          <SelectItem value="unknown">Unknown</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Interested Program (single) + Alternative Programs (multi) — 2026-04-21 */}
                <div className="space-y-3">
                  <div>
                    <h4 className="text-sm font-semibold text-muted-foreground mb-2">
                      Interested Program
                    </h4>
                    {!editForm.institution_id ? (
                      <div className="text-sm text-muted-foreground">
                        Select an institution first to view programs
                      </div>
                    ) : editProgramsLoading ? (
                      <div className="text-sm text-muted-foreground">Loading programs...</div>
                    ) : editPrograms.length === 0 ? (
                      <div className="text-sm text-muted-foreground">
                        No programs available for this institution
                      </div>
                    ) : (
                      <Select
                        value={editPrimaryProgramId}
                        onValueChange={(v) => setEditPrimaryProgramId(v)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select the primary program" />
                        </SelectTrigger>
                        <SelectContent className="max-h-72">
                          {editPrograms.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.program_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-muted-foreground mb-2">
                      Alternative Programs{' '}
                      <span className="text-xs font-normal">(optional)</span>
                    </h4>
                    {!editPrimaryProgramId ? (
                      <div className="text-sm text-muted-foreground">
                        Pick an Interested Program first to add backup options.
                      </div>
                    ) : editPrograms.filter((p) => p.id !== editPrimaryProgramId).length === 0 ? (
                      <div className="text-sm text-muted-foreground">
                        No other programs available as alternatives.
                      </div>
                    ) : (
                      <>
                        <div className="max-h-40 overflow-y-auto rounded-md border p-2 space-y-1">
                          {editPrograms
                            .filter((p) => p.id !== editPrimaryProgramId)
                            .map((p) => {
                              const checked = editAlternativeProgramIds.includes(p.id);
                              return (
                                <button
                                  key={p.id}
                                  type="button"
                                  onClick={() => toggleEditAlternativeProgram(p.id)}
                                  className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-accent ${
                                    checked ? 'bg-accent' : ''
                                  }`}
                                >
                                  <span>{p.program_name}</span>
                                  {checked && <Badge variant="secondary">Selected</Badge>}
                                </button>
                              );
                            })}
                        </div>
                        {editAlternativeProgramIds.length > 0 && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {editAlternativeProgramIds.length} alternative
                            {editAlternativeProgramIds.length === 1 ? '' : 's'} selected
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Notes */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-muted-foreground">Notes</h4>
                  <Textarea
                    id="edit-notes"
                    value={editForm.notes}
                    onChange={(e) => handleEditChange('notes', e.target.value)}
                    placeholder="Additional notes about this lead"
                    rows={3}
                  />
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

                {/* Counselor / Referral assignment based on source */}
                {editForm.source && (
                  <div className="space-y-3">
                    {editForm.source === 'referral' ? (
                      <>
                        <h4 className="text-sm font-semibold text-muted-foreground">Referral Details</h4>
                        <Select
                          value={editReferralType}
                          onValueChange={(value) => {
                            setEditReferralType(value as ReferralType);
                            setEditConsultantId('');
                            setEditReferrerId('');
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select referral type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="consultant">Consultant</SelectItem>
                            <SelectItem value="student">Student</SelectItem>
                            <SelectItem value="faculty">Faculty</SelectItem>
                          </SelectContent>
                        </Select>

                        {editReferralType === 'consultant' && (
                          <Select value={editConsultantId} onValueChange={setEditConsultantId}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select consultant" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="_none">No consultant</SelectItem>
                              {consultantsDropdown.map((c) => (
                                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}

                        {editReferralType === 'student' && (
                          <Select value={editReferrerId} onValueChange={setEditReferrerId}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select student" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="_none">No student</SelectItem>
                              {studentsDropdown.map((s) => (
                                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}

                        {editReferralType === 'faculty' && (
                          <Select value={editReferrerId} onValueChange={setEditReferrerId}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select faculty" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="_none">No faculty</SelectItem>
                              {facultyDropdown.map((f) => (
                                <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </>
                    ) : (
                      <>
                        <h4 className="text-sm font-semibold text-muted-foreground">Assign Counselor</h4>
                        <Select value={editCounselorProfileId} onValueChange={setEditCounselorProfileId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select counselor" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="_none">No counselor</SelectItem>
                            {counselors.map((c) => (
                              <SelectItem key={c.profile_id} value={c.profile_id}>
                                {c.name}{c.designation ? ` (${c.designation})` : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </>
                    )}
                  </div>
                )}
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

        {/* Personal WhatsApp Dialog */}
        <SendPersonalMessageDialog
          departmentId={personalWaDepartmentId || profile?.department_id || ''}
          open={personalMsgOpen}
          onOpenChange={setPersonalMsgOpen}
          defaultPhone={lead?.phone || ''}
          leadId={lead?.id}
          recipientName={lead?.full_name || ''}
        />
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
