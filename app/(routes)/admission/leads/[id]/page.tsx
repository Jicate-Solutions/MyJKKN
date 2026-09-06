'use client';


import { useParams, useRouter } from 'next/navigation';
import { Suspense, useState, useEffect, useMemo } from 'react';
import { useTabParam } from '@/hooks/use-tab-param';
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
import { useSourceMappedCounselorIds } from '@/hooks/admission/use-source-mapped-counselor-ids';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { useDegrees } from '@/hooks/organization/use-degrees';
import { useDepartments } from '@/hooks/organization/use-departments';
import { usePrograms } from '@/hooks/organization/use-programs';
import { ConsultantAttributionCard } from './_components/consultant-attribution-card';
import { ActivityTab } from './_components/tabs/activity-tab';
import { CallsTab } from './_components/tabs/calls-tab';
import { CommunicationTab } from './_components/tabs/communication-tab';
import { AISuggestedResponses } from '@/components/admission/ai-suggested-responses';
import { DetailsTab } from './_components/tabs/details-tab';
import { JourneyTab } from './_components/tabs/journey-tab';
import { LogCallDialog } from '@/components/admission/log-call-dialog';
import { ShowStudentQRButton } from '@/components/admission/show-student-qr-button';
import { QuickActionsBar } from '@/components/admission/quick-actions-bar';
import { useExpoEvent } from '@/hooks/admission/use-expos';
import { useActiveLeadSources } from '@/hooks/admission/use-active-lead-sources';
import { useConsultantsForDropdown, useLeadAttributions } from '@/hooks/admission/use-consultants';
import { useStudentsForDropdown, useFacultyForDropdown } from '@/hooks/admission/use-referral-dropdowns';
import { ConsultantService } from '@/lib/services/admission/consultant-service';
import type { ReferralType } from '@/types/admission';
import { CounselorDailyViewService } from '@/lib/services/admission/counselor-daily-view-service';
import {
  ArrowLeft,
  Flame,
  Star,
  Phone,
  Calendar,
  Clock,
  MessageSquare,
  Activity,
  Send,
  User,
  Tag,
  MoreHorizontal,
  Edit,
  Trash2,
  Loader2,
  ExternalLink,
  UserPlus,
  X,
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
import toast from 'react-hot-toast';
import { AdmissionErrorBoundary } from '@/components/admission';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { indianStates, getDistrictsByState } from '@/lib/data/locations';
import { SMSCampaignService } from '@/lib/services/admission/sms-campaign-service';
import { WhatsAppCampaignService } from '@/lib/services/admission/whatsapp-campaign-service';
import { useQueryClient } from '@tanstack/react-query';
import type { FunnelStage } from '@/types/admission';
import { useAdmissionStatuses } from '@/hooks/admission/use-admission-statuses';
import { LeadStageBadge } from '../_components/columns';
import { SendPersonalMessageDialog } from '@/components/whatsapp/send-personal-message-dialog';
import { LeadInlineConnectionIndicator } from '@/components/whatsapp/lead-inline-connection-indicator';
import { showSendErrorToast } from '@/lib/whatsapp/show-send-error-toast';
import { usePersonalWhatsAppStatus } from '@/hooks/admission/use-whatsapp-personal';
import { HandoverBanner } from '@/components/admission/leads/handover-banner';
import { LeadHeader } from '@/components/admission/leads/lead-header';
import { LeadScoreCards } from '@/components/admission/leads/lead-score-cards';
import { useLeadCascadeHistory } from '@/hooks/admission/use-lead-cascade-history';
// BUG-003016: centralised DD/MM/YYYY formatter — replaces bare
// toLocaleDateString() calls that were rendering ambiguously depending
// on the runtime locale. Extended 2026-04-16 to also route the timeline,
// message, and follow-up dates on the detail page through the helpers.
import { formatDateDMY, formatDateTimeDMY } from '@/lib/utils/date-format';

// Source options now come from useActiveLeadSources() — admin-curated rows
// in admission_lead_sources_master replace this once-static list.

const GENDERS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' }
];

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

const LEAD_DETAIL_TABS = ['activity', 'calls', 'communication', 'details', 'journey'] as const;

function LeadDetailPageContent() {
  const { options: leadSources } = useActiveLeadSources();
  // Dynamic stage list from admission_statuses — used for the stage selector
  // dropdown and current-stage badge. Sorted by sort_order for consistent ordering.
  const { data: leadStatuses = [] } = useAdmissionStatuses('lead', { activeOnly: true });
  const sortedStages = [...leadStatuses].sort((a, b) => a.sort_order - b.sort_order);
  const params = useParams();
  const router = useRouter();
  const leadId = params.id as string;

  // Active detail tab — URL-synced via ?tab= through the shared useTabParam hook
  // so (a) inactive tabs are NOT mounted: Radix mounts every TabsContent's
  // children eagerly, firing each tab's data hooks on load (Calls + Journey both
  // call useLeadCallLogs, plus the heavy VoiceMemoPanel / journey aggregation),
  // (b) the chosen tab survives a tab-refocus / back-navigation instead of
  // snapping back to Activity, and (c) each tab is deep-linkable and favoritable
  // (the global navbar star reads ?tab=).
  const [activeTab, handleTabChange] = useTabParam('activity', LEAD_DETAIL_TABS);

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

  // --- Phase 6: Cascade history + readonly detection (spec decisions #13, #14) ---
  // Fetch the reassignment trail for this lead.
  const { history: cascadeHistory, latest: latestCascade } = useLeadCascadeHistory(
    isValidId ? leadId : undefined
  );
  // The current user is the FROM-counselor if their email matches the most-recent
  // cascade entry's from_counselor_email. We use email (from profile join) because
  // profiles.id → admission_counselors.user_id requires a second lookup.
  // Per spec #14: no auto-clawback — this is visual + interaction-disable only.
  const isReadonlyCascadedView =
    !!latestCascade &&
    !!profile?.email &&
    latestCascade.from_counselor_email?.toLowerCase() === profile.email.toLowerCase();
  const readonlyReassignedTo = isReadonlyCascadedView
    ? (latestCascade?.to_counselor_name ?? 'another counselor')
    : null;
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

  // Write computed scores back to DB for the list / work-kanban / AI score badges
  // — but ONLY when a value actually changed (dirty-check). Previously this fired
  // an admission_leads UPDATE through the heavy adm_leads_update RLS on EVERY
  // detail view, and again after every comment/activity add (a new timeline entry
  // recomputes the score), even when nothing changed. The dirty-check skips the
  // redundant write, removing a per-view / per-comment RLS round-trip (Bugs 2/3).
  useEffect(() => {
    if (!lead?.id || (computedScores.score === 0 && computedScores.engagement === 0 && computedScores.quality === 0)) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const l = lead as any;
    if (
      l.score === computedScores.score &&
      l.engagement_score === computedScores.engagement &&
      l.quality_score === computedScores.quality &&
      l.score_category === computedScores.category
    ) {
      return; // already current — no write needed
    }

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
        const mediaRes = await fetch('/api/whatsapp-personal/send-media', {
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
          showSendErrorToast({
            httpStatus: mediaRes.status,
            errorMsg: mediaResult.error,
            fallbackMsg: 'Failed to send media',
          });
          return;
        }
      } else {
        const res = await fetch('/api/whatsapp-personal/send', {
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
          showSendErrorToast({
            httpStatus: res.status,
            errorMsg: result.error,
            fallbackMsg: 'Failed to send message',
          });
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
          const mediaRes = await fetch('/api/whatsapp-personal/send-media', {
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
          const res = await fetch('/api/whatsapp-personal/send', {
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

      // Audit log — record WHO moved this lead. created_by + lead_id +
      // learner_profile_id are all already captured at the column / FK level
      // (ActivityService auto-sets created_by from auth.getUser(), the FK on
      // the lead row points at the new learner profile). The description
      // text is for HUMAN readers on the timeline, so we keep only the parts
      // that read naturally — name, email, role, timestamp — and omit UUIDs
      // that clutter the card without adding value. Fire-and-forget: if the
      // audit insert fails, the primary action (conversion + redirect) must
      // NOT be blocked, so we wrap in try/catch and only console.warn on
      // failure.
      try {
        const performerName =
          (profile as { full_name?: string } | null | undefined)?.full_name ??
          profile?.email ??
          'Unknown user';
        const performerEmail = profile?.email ?? 'no email on file';
        const performerRole =
          (profile as { role?: string } | null | undefined)?.role ?? 'unknown role';
        await createActivity.mutateAsync({
          lead_id: lead.id,
          activity_type: 'moved_to_counselor',
          title: 'Moved to Counselor',
          description: [
            `Moved by: ${performerName}`,
            `Email: ${performerEmail}`,
            `Role: ${performerRole}`,
          ].join(' · '),
        });
      } catch (logErr) {
        // Audit-only failure — conversion already succeeded, so we continue.
        console.warn(
          '[admission/leads] Failed to log Move-to-Counselor activity:',
          logErr,
        );
      }

      toast.success('Moved to counselor — redirecting…');
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

  // Resolve the profile name for whoever first logged this lead at the gate.
  // Stored as a UUID on lead.first_gate_entry_by; the Source & Timeline card
  // wants the human name. Falls back to email if no name is set.
  const [gateEntryByName, setGateEntryByName] = useState<string | null>(null);
  useEffect(() => {
    const byId = lead?.first_gate_entry_by;
    if (!byId) {
      setGateEntryByName(null);
      return;
    }
    let cancelled = false;
    const supabase = createClientSupabaseClient();
    (supabase as any)
      .from('profiles')
      .select('full_name, email')
      .eq('id', byId)
      .maybeSingle()
      .then(({ data, error }: { data: any; error: any }) => {
        if (cancelled || error || !data) return;
        setGateEntryByName(data.full_name || data.email || null);
      });
    return () => { cancelled = true; };
  }, [lead?.first_gate_entry_by]);

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

  // Counselors from profiles (role IN admission_counselor / expo_counselor) — global across all institutions
  const { data: counselorProfiles, isLoading: counselorsLoading } = useCounselorProfiles(null);
  const counselors = counselorProfiles || [];

  // Source-mapped counselor IDs for this lead's source. Used by the
  // Assign Counselor dialog to group source-appropriate counselors at
  // the top of the picker so admins can see who's already configured
  // to receive leads from this source.
  const { data: sourceMappedIds } = useSourceMappedCounselorIds({
    sourceEnum: (lead?.source as any) ?? null,
    institutionId: lead?.institution_id ?? null,
  });

  // Consultants / students / faculty for the referral dropdowns — only needed
  // inside the Edit dialog. Gated on showEditDialog by passing '' when closed,
  // which trips each hook's `enabled: institutionId !== ''` guard, so the two
  // 1000-row student/faculty fetches (and the consultants fetch) no longer fire
  // on every detail-page load (Bug 4 mount storm). They load when the dialog opens.
  const { data: consultantsDropdown = [] } = useConsultantsForDropdown(
    showEditDialog ? undefined : ''
  );
  const { data: studentsDropdown = [] } = useStudentsForDropdown(
    showEditDialog ? (lead?.institution_id || undefined) : ''
  );
  const { data: facultyDropdown = [] } = useFacultyForDropdown(
    showEditDialog ? (lead?.institution_id || undefined) : ''
  );

  // Consultant attributions for this lead (used in Details tab assignment section)
  const { attributions: leadAttributions } = useLeadAttributions(leadId);

  // Edit form: selected counselor / consultant (separate from editForm text fields)
  const [editCounselorProfileId, setEditCounselorProfileId] = useState('');
  const [editConsultantId, setEditConsultantId] = useState('');
  const [editReferralType, setEditReferralType] = useState<ReferralType | ''>('');
  const [editReferrerId, setEditReferrerId] = useState('');
  // A referrer with no record is stored as a name with a NULL referred_by_id.
  // Without this the dropdown lookup below returns undefined on save and the
  // name is silently erased — the edit form would quietly destroy the very
  // thing the create form was just taught to record.
  const [editManualReferrerName, setEditManualReferrerName] = useState('');

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

  // NOTE (2026-07-25): the effect that cleared admission_year_id whenever the
  // primary program changed is gone. It dated from when admission_years carried
  // a per-program dimension; that was dropped 2026-06-05 (admission years are
  // institution-wide now), so program had stopped invalidating the cohort.
  // Worse, openEditDialog() sets editForm.admission_year_id and
  // editPrimaryProgramId in the same batch — so the effect fired on every dialog
  // open and blanked the cohort it had just loaded, writing NULL back on save.
  // Institution changes still clear it, in handleEditChange below.

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
    setEditManualReferrerName(l.referred_by_id ? '' : l.referred_by_name || '');
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
    // Required since 2026-07-25 — mirrors the create form. The picker pre-fills
    // the institution's current cohort, so this only fires when the institution
    // has no admission years configured or the user cleared it.
    if (!editForm.admission_year_id) {
      toast.error('Admission year is required');
      return;
    }
    const selectedState = indianStates.find((s) => s.id === editForm.state);
    const selectedDistrict = editDistricts.find((d) => d.id === editForm.district);
    // The counselor dropdown is pre-seeded from assigned_counselor_id when the
    // dialog opens, so "has a value" does NOT mean "the admin changed it".
    // Compare against the seed to distinguish an intentional (re)assignment
    // from an untouched field — otherwise every unrelated edit (e.g. course
    // name) re-ran assignCounselor: overwrote assigned_at, inserted a
    // duplicate "Counselor Assigned" timeline activity, and could re-notify
    // the counselor.
    const counselorChanged =
      editCounselorProfileId !== (lead.assigned_counselor_id || '');
    // Explicit unassign: admin picked "No counselor" while one was assigned.
    // updateLead auto-clears assigned_counselor_id when counselor_id is sent
    // without it (see LeadService.updateLead), so counselor_id: null suffices.
    const shouldUnassignCounselor =
      editForm.source !== 'referral' &&
      editCounselorProfileId === '_none' &&
      Boolean(lead.assigned_counselor_id || lead.counselor_id);
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
            // Fall back to the typed name so a name-only referral survives a
            // save, and so an id the (active-only, capped) dropdown no longer
            // returns does not blank an otherwise-good name.
            const manual = editManualReferrerName.trim() || lead?.referred_by_name || null;
            if (editReferralType === 'student') {
              return studentsDropdown.find((s) => s.id === editReferrerId)?.name || manual;
            }
            if (editReferralType === 'faculty') {
              return facultyDropdown.find((f) => f.id === editReferrerId)?.name || manual;
            }
            return null;
          })(),
          ...(shouldUnassignCounselor ? { counselor_id: null } : {}),
        },
      },
      {
        onSuccess: async () => {
          // Best-effort: assign counselor or consultant based on source —
          // only when the admin actually changed the selection (see
          // counselorChanged above).
          if (
            editForm.source !== 'referral' &&
            counselorChanged &&
            editCounselorProfileId &&
            editCounselorProfileId !== '_none'
          ) {
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
          // Mirror assignCounselor's timeline logging for the unassign path so
          // the audit trail shows who removed the counselor and when.
          if (shouldUnassignCounselor) {
            try {
              const supabase = createClientSupabaseClient();
              const { data: { user } } = await supabase.auth.getUser();
              await (supabase as any).from('admission_lead_activities').insert({
                lead_id: lead.id,
                activity_type: 'note',
                subject: 'Counselor Unassigned',
                description: 'Counselor removed from this lead via lead edit',
                created_by: user?.id || null,
              });
            } catch (e) {
              console.warn('[admission/leads] Could not log counselor unassignment:', e);
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
          {/* Compact mobile-first header (PR-A 2026-05-10):
              Single breadcrumb showing lead's full_name (not UUID), h1 name on its
              own row, tappable phone/email, and Mark Hot / Mark Priority chips.
              Replaces 5-stacked-row legacy header. */}
          <LeadHeader
            lead={lead}
            isHot={!!lead.is_hot_lead}
            onMarkHot={() => toggleHotLead.mutate({ leadId, isHot: !lead.is_hot_lead })}
            isPriority={!!lead.is_priority}
            onMarkPriority={() => togglePriority.mutate({ leadId, isPriority: !lead.is_priority })}
            isReadonlyCascadedView={isReadonlyCascadedView}
            readonlyReassignedTo={readonlyReassignedTo}
          />

          {/* Phase 6: Handover history banner (spec #13, #14) — renders only when history exists */}
          <HandoverBanner leadId={leadId} />

          {/* Header — secondary action row (Move to Counselor, More dropdown).
              PR-B owns the action-hierarchy redesign of this region.
              Button label changed 2026-05-19 from 'Convert to Admitted' →
              'Move to Counselor' per product call. Underlying handler still
              creates the learner_profiles row (handleConvertToLearner) — only
              the user-facing copy changed. */}
          {/* Phase 6 spec #14: disable all write-actions for the cascaded-away FROM-counselor.
              pointer-events-none + opacity-50 communicate read-only visually.
              No data-level enforcement here — that lives in RLS. */}
          <div className={`flex flex-wrap items-center justify-end gap-2 ${isReadonlyCascadedView ? 'pointer-events-none opacity-50' : ''}`}>
              {/* Move to Counselor — shows "View Learner Profile" once moved */}
              {lead.learner_profile_id ? (
                <>
                  <Button variant="outline" size="sm" asChild>
                    <a href={`/learners/profiles/${lead.learner_profile_id}`}>
                      <ExternalLink className="h-4 w-4 mr-2" />
                      View Learner Profile
                    </a>
                  </Button>
                  <ShowStudentQRButton
                    learnerProfileId={lead.learner_profile_id}
                    alreadySubmitted={(lead as any).learner?.is_profile_complete === true}
                    size="sm"
                  />
                </>
              ) : (
                <PermissionGuard module="admission" action="leads.convert_to_admitted" fallback={null}>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleConvertToLearner}
                    disabled={isConverting}
                    className="bg-purple-600 hover:bg-purple-700"
                  >
                    <UserPlus className={`h-4 w-4 mr-2 ${isConverting ? 'animate-pulse' : ''}`} />
                    {isConverting ? 'Moving...' : 'Move to Counselor'}
                  </Button>
                </PermissionGuard>
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

          {/* Quick Actions Bar — Call, Log Call, WhatsApp, SMS, Note, Follow-up.
              Renders post-loading so Log Call is reachable on lead detail. */}
          <div className={isReadonlyCascadedView ? 'pointer-events-none opacity-50' : ''}>
            <QuickActionsBar
              lead={{
                phone: lead.phone || '',
                alternate_phone: lead.alternate_phone,
                parent_phone: lead.parent_phone,
                parent_name: lead.parent_name,
                email: lead.email,
              }}
              onLogCall={() => setShowLogCallDialog(true)}
              onWhatsApp={() => setPersonalMsgOpen(true)}
              onSMS={() => {/* TODO: wire to SMS dialog when added */}}
              onNote={() => setShowActivityDialog(true)}
              onFollowUp={() => setShowFollowupDialog(true)}
            />
          </div>

          {/* Stage Selector — disabled for cascaded-away FROM-counselor */}
          <Card className={isReadonlyCascadedView ? 'pointer-events-none opacity-60' : ''}>
            <CardContent className="py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium">Current Stage:</span>
                  <LeadStageBadge stage={lead.funnel_stage} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground shrink-0">Move to:</span>
                  <Select
                    value={lead.funnel_stage || 'new'}
                    onValueChange={handleStageChange}
                  >
                    <SelectTrigger className="w-full sm:w-[200px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {sortedStages.map((stage) => (
                        <SelectItem
                          key={stage.code}
                          value={stage.code}
                          disabled={stage.code === lead?.funnel_stage}
                        >
                          <span className="flex items-center gap-2">
                            <span
                              className="h-2 w-2 rounded-full shrink-0"
                              style={{ backgroundColor: stage.color }}
                            />
                            {stage.label}
                            {stage.is_terminal && (
                              <span className="text-xs text-muted-foreground">(Terminal)</span>
                            )}
                          </span>
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
              <LeadScoreCards
                scores={computedScores}
                hasActivities={(timeline?.filter((t: any) => t.type === 'activity').length ?? 0) > 0 || (communicationHistory?.length ?? 0) > 0}
                hasProfile={!!(lead?.full_name && lead?.phone)}
              />

              {/* Tabs */}
              <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
                <div className="overflow-x-auto">
                  <TabsList className="w-max min-w-full">
                    <TabsTrigger value="activity">Activity</TabsTrigger>
                    <TabsTrigger value="calls">Calls</TabsTrigger>
                    <TabsTrigger value="communication">Messages</TabsTrigger>
                    <TabsTrigger value="details">Details</TabsTrigger>
                    <TabsTrigger value="journey">Journey</TabsTrigger>
                  </TabsList>
                </div>

                {/* Render ONLY the active tab's children. Radix mounts every
                    TabsContent's children eagerly otherwise, so Calls + Journey
                    would each fire useLeadCallLogs and render VoiceMemoPanel /
                    the journey aggregation on first paint for tabs the user
                    never opened. The TabsContent wrappers stay mounted (Radix
                    handles visibility); only their data-bearing children are
                    deferred until the tab is active. */}
                <TabsContent value="activity" className="mt-4">
                  {activeTab === 'activity' && (
                    <ActivityTab timeline={timeline} timelineLoading={timelineLoading} />
                  )}
                </TabsContent>

                <TabsContent value="calls" className="mt-4">
                  {activeTab === 'calls' && (
                    <CallsTab
                      leadId={lead.id}
                      institutionId={lead.institution_id || userInstitutionId || ''}
                    />
                  )}
                </TabsContent>

                <TabsContent value="communication" className="mt-4">
                  {activeTab === 'communication' && (
                    <div className="space-y-4">
                      <CommunicationTab
                        leadFullName={lead?.full_name}
                        leadPhone={lead?.phone}
                        leadEmail={lead?.email}
                        leadFirstNamePart={lead?.full_name?.split(' ')[0] || ''}
                        leadLastNamePart={lead?.full_name?.split(' ').slice(1).join(' ') || ''}
                        leadProgramName={lead?.program?.program_name || ''}
                        waConnected={!!waStatus?.connected}
                        commLoading={commLoading}
                        communicationHistory={communicationHistory}
                        templateAttachment={templateAttachment}
                        setTemplateAttachment={setTemplateAttachment}
                        channelTemplates={channelTemplates}
                        selectedTemplateId={selectedTemplateId}
                        setSelectedTemplateId={setSelectedTemplateId}
                        setSendChannel={setSendChannel}
                        setSendMessage={setSendMessage}
                        sendMessage={sendMessage}
                        isSending={isSending}
                        handleSendPersonalWA={handleSendPersonalWA}
                        replaceVariables={replaceVariables}
                      />
                      {/* AI reply drafts (Max lane). "Use This" only fills the
                          compose box above — it never sends. */}
                      {lead && (
                        <AISuggestedResponses
                          lead={lead}
                          counselorName={lead.counselor?.name}
                          institutionName={institutionName}
                          defaultChannel="whatsapp"
                          onSelectResponse={(response) => {
                            setSendMessage(response.content);
                          }}
                        />
                      )}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="details" className="mt-4 space-y-4">
                  {activeTab === 'details' && (
                    <DetailsTab
                      lead={lead}
                      institutionName={institutionName}
                      primaryProgramName={primaryProgramName}
                      alternativeProgramNames={alternativeProgramNames}
                      programsLoading={programsLoading}
                      gateEntryByName={gateEntryByName}
                      leadAttributions={leadAttributions}
                      openEditDialog={openEditDialog}
                      setShowAssignCounselorDialog={setShowAssignCounselorDialog}
                    />
                  )}
                </TabsContent>

                <TabsContent value="journey" className="mt-4">
                  {activeTab === 'journey' && (
                    <JourneyTab
                      leadId={lead.id}
                      institutionId={lead.institution_id || userInstitutionId || ''}
                    />
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
                                ) : (() => {
                                  // Split into source-mapped vs other so admins can pick a
                                  // source-appropriate counselor without scanning the whole list.
                                  const mapped = sourceMappedIds ?? new Set<string>();
                                  const mappedList = counselors.filter((c) => mapped.has(c.profile_id));
                                  const otherList  = counselors.filter((c) => !mapped.has(c.profile_id));
                                  return (
                                    <>
                                      {mappedList.length > 0 && (
                                        <>
                                          <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                            Mapped to {lead.source ?? 'this source'} ({mappedList.length})
                                          </div>
                                          {mappedList.map((c) => (
                                            <SelectItem key={c.profile_id} value={c.profile_id}>
                                              <span className="inline-flex items-center gap-1.5">
                                                <span className="h-1.5 w-1.5 rounded-full bg-blue-500" aria-hidden="true" />
                                                {c.name}{c.designation ? ` (${c.designation})` : ''}
                                              </span>
                                            </SelectItem>
                                          ))}
                                        </>
                                      )}
                                      {otherList.length > 0 && (
                                        <>
                                          <div className="mt-1 border-t px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                            Other counselors ({otherList.length})
                                          </div>
                                          {otherList.map((c) => (
                                            <SelectItem key={c.profile_id} value={c.profile_id}>
                                              {c.name}{c.designation ? ` (${c.designation})` : ''}
                                            </SelectItem>
                                          ))}
                                        </>
                                      )}
                                    </>
                                  );
                                })()}
                              </SelectContent>
                            </Select>
                            {sourceMappedIds && sourceMappedIds.size > 0 && (
                              <p className="mt-1 text-[11px] text-muted-foreground">
                                The blue dot marks counselors mapped to <span className="font-medium">{lead.source}</span> via source configuration. You can still pick anyone from "Other counselors" if needed.
                              </p>
                            )}
                            {sourceMappedIds && sourceMappedIds.size === 0 && lead.source && (
                              <p className="mt-1 text-[11px] text-orange-700">
                                No counselors are currently mapped to <span className="font-medium">{lead.source}</span>. Configure mappings on the source detail page to enable auto-routing for this source.
                              </p>
                            )}
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <AdmissionYearSelect
                        institutionId={editProgramsInstitutionId}
                        value={editForm.admission_year_id}
                        onChange={(v) => handleEditChange('admission_year_id', v)}
                        id="edit-admission_year"
                        autoSelectCurrent
                        required
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
                        {leadSources.map((s) => (
                          <SelectItem key={s.masterId} value={s.value}>{s.label}</SelectItem>
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
                            setEditManualReferrerName('');
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

                        {/* Staff and learners are owned by HR / Admissions, so a
                          * referrer with no record is kept as a name with a NULL
                          * referred_by_id. Consultants are excluded: they are
                          * created in the Consultants module and always linked. */}
                        {(editReferralType === 'student' || editReferralType === 'faculty') && (
                          <div className="space-y-1.5 rounded-md border border-dashed p-3">
                            <Label htmlFor="edit-manual-referrer" className="text-xs">
                              Not in the list?{' '}
                              <span className="font-normal text-muted-foreground">
                                Type the name
                              </span>
                            </Label>
                            <Input
                              id="edit-manual-referrer"
                              placeholder="e.g. M.KRISHNAVENI / AP / Nursing"
                              value={editManualReferrerName}
                              onChange={(e) => {
                                setEditManualReferrerName(e.target.value);
                                if (e.target.value.trim()) setEditReferrerId('');
                              }}
                              disabled={!!editReferrerId && editReferrerId !== '_none'}
                            />
                            <p className="text-xs text-muted-foreground">
                              Saved as a name only — no linked record.
                            </p>
                          </div>
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

        {/* Log Call Dialog (with voice memo recorder from PR #795) */}
        <LogCallDialog
          open={showLogCallDialog}
          onOpenChange={setShowLogCallDialog}
          lead={lead ? { id: lead.id, full_name: lead.full_name, phone: lead.phone, funnel_stage: lead.funnel_stage, institution_id: lead.institution_id, is_hot_lead: lead.is_hot_lead, is_priority: lead.is_priority, tags: lead.tags } : null}
          onSendWhatsApp={() => { setShowLogCallDialog(false); setPersonalMsgOpen(true); }}
        />
      </ContentLayout>
    </PermissionGuard>
  );
}

export default function LeadDetailPage() {
  // Suspense boundary required: useTabParam() reads useSearchParams().
  return (
    <AdmissionErrorBoundary>
      <Suspense fallback={null}>
        <LeadDetailPageContent />
      </Suspense>
    </AdmissionErrorBoundary>
  );
}
