'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Phone,
  MessageCircle,
  ChevronDown,
  CalendarClock,
  StickyNote,
  Flame,
  Star,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Minus,
  ArrowRight,
  GraduationCap,
  Calendar,
  Loader2,
} from 'lucide-react';
import type { FollowupLead } from '@/lib/services/admission/counselor-daily-view-service';
import { SendPersonalMessageDialog } from '@/components/whatsapp/send-personal-message-dialog';
import { usePersonalWhatsAppStatus } from '@/hooks/admission/use-whatsapp-personal';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Detect raw UUID strings so we can show "N programs" instead of the ID. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUUID = (s: string) => UUID_RE.test(s);

// ── Constants ─────────────────────────────────────────────────────────────────

const STAGE_ORDER = [
  'new', 'contacted', 'not_reachable', 'interested', 'follow_up_scheduled',
  'engaged', 'qualified', 'application_started', 'application_submitted',
  'documents_pending', 'documents_verified', 'offer_sent', 'offer_accepted', 'token_paid',
  'applied', 'offered', 'enrolled',
  'confirmed', 'declined', 'withdrew', 'expired', 'lost', 'dormant',
];

const STAGE_LABELS: Record<string, string> = {
  new: 'New',
  contacted: 'Contacted',
  not_reachable: 'Not Reachable',
  interested: 'Interested',
  follow_up_scheduled: 'Follow-up Set',
  engaged: 'Engaged',
  qualified: 'Qualified',
  application_started: 'App Started',
  application_submitted: 'App Submitted',
  documents_pending: 'Docs Pending',
  documents_verified: 'Docs Verified',
  offer_sent: 'Offer Sent',
  offer_accepted: 'Offer Accepted',
  token_paid: 'Token Paid',
  applied: 'Applied',
  offered: 'Offered',
  enrolled: 'Enrolled',
  confirmed: 'Confirmed',
  declined: 'Declined',
  withdrew: 'Withdrew',
  expired: 'Expired',
  lost: 'Lost',
  dormant: 'Dormant',
};

const URGENCY_CONFIG = {
  overdue: {
    border: 'border-l-red-500',
    badge: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300',
    icon: AlertTriangle,
    label: 'Overdue',
  },
  today: {
    border: 'border-l-amber-500',
    badge: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300',
    icon: Clock,
    label: 'Due Today',
  },
  upcoming: {
    border: 'border-l-blue-400',
    badge: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300',
    icon: CalendarClock,
    label: 'Upcoming',
  },
} as const;

const INTEREST_LEVEL_CONFIG: Record<string, { color: string; label: string }> = {
  very_high: { color: 'bg-green-50 text-green-700 border-green-200', label: 'Very High' },
  high:      { color: 'bg-blue-50  text-blue-700  border-blue-200',  label: 'High' },
  medium:    { color: 'bg-yellow-50 text-yellow-700 border-yellow-200', label: 'Medium' },
  low:       { color: 'bg-orange-50 text-orange-700 border-orange-200', label: 'Low' },
  none:      { color: 'bg-gray-100 text-gray-500 border-gray-200',   label: 'None' },
};

const PARENT_STATUS_CONFIG: Record<string, { icon: typeof CheckCircle2; color: string; label: string }> = {
  supportive:   { icon: CheckCircle2, color: 'text-green-600',  label: 'Parent Supportive' },
  considering:  { icon: Clock,        color: 'text-yellow-600', label: 'Parent Considering' },
  neutral:      { icon: Minus,        color: 'text-gray-400',   label: 'Parent Neutral' },
  reluctant:    { icon: Clock,        color: 'text-orange-500', label: 'Parent Reluctant' },
  opposed:      { icon: XCircle,      color: 'text-red-500',    label: 'Parent Opposed' },
  against:      { icon: XCircle,      color: 'text-red-500',    label: 'Parent Against' },
  not_involved: { icon: Minus,        color: 'text-gray-400',   label: 'Parent Not Involved' },
  unknown:      { icon: HelpCircle,   color: 'text-gray-400',   label: 'Parent Status Unknown' },
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface FollowupCardProps {
  lead: FollowupLead;
  onCall: (leadId: string) => void;
  onAdvanceStage: (leadId: string, newStage: string) => void;
  onReschedule: (leadId: string, newDate: string) => void;
  onAddNote: (leadId: string, note: string) => void;
  /** True only for THIS card's in-flight mutation — not a global flag. */
  isActioning?: boolean;
  /** Institution ID for WhatsApp personal messaging. */
  institutionId?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function FollowupCard({
  lead,
  onCall,
  onAdvanceStage,
  onReschedule,
  onAddNote,
  isActioning,
  institutionId,
}: FollowupCardProps) {
  const [noteText, setNoteText] = useState('');
  const [showNote, setShowNote] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [personalMsgOpen, setPersonalMsgOpen] = useState(false);

  const { data: waStatus } = usePersonalWhatsAppStatus(institutionId, { pollWhileConnecting: false });

  // ── Derived values ──────────────────────────────────────────────────────────

  const urgency = URGENCY_CONFIG[lead.urgency] ?? URGENCY_CONFIG.today;
  const UrgencyIcon = urgency.icon;

  const currentStageIdx = STAGE_ORDER.indexOf(lead.funnel_stage);
  const forwardStages = currentStageIdx >= 0 ? STAGE_ORDER.slice(currentStageIdx + 1) : [];

  const interestConfig = lead.student_interest_level
    ? INTEREST_LEVEL_CONFIG[lead.student_interest_level]
    : null;

  const parentConfig = lead.parent_decision_status
    ? PARENT_STATUS_CONFIG[lead.parent_decision_status]
    : null;

  // Show "N programs" for UUID arrays; show actual names otherwise
  const programsDisplay = (() => {
    const progs = lead.interested_programs;
    if (!progs?.length) return null;
    if (isUUID(String(progs[0]))) {
      return `${progs.length} program${progs.length > 1 ? 's' : ''}`;
    }
    return progs.slice(0, 2).join(', ') + (progs.length > 2 ? ` +${progs.length - 2}` : '');
  })();

  const followupDate = lead.next_followup_at
    ? new Date(lead.next_followup_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
    : null;

  const lastActivityText = lead.last_activity
    ? (lead.last_activity.description || lead.last_activity.type || null)
    : null;

  const lastActivityDate = lead.last_activity
    ? new Date(lead.last_activity.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
    : null;

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleCall = () => {
    onCall(lead.id);
    setTimeout(() => window.open(`tel:${lead.phone}`, '_self'), 100);
  };

  const handleWhatsApp = () => {
    if (!lead.phone) return;
    const digits = lead.phone.replace(/\D/g, '');
    const intl = digits.startsWith('91') ? digits : `91${digits}`;
    window.open(`https://wa.me/${intl}`, '_blank');
  };

  const handleReschedule = () => {
    if (!rescheduleDate) return;
    const parsed = new Date(rescheduleDate);
    if (isNaN(parsed.getTime())) return;
    onReschedule(lead.id, parsed.toISOString());
    setRescheduleDate('');
  };

  const handleSubmitNote = () => {
    if (!noteText.trim()) return;
    onAddNote(lead.id, noteText.trim());
    setNoteText('');
    setShowNote(false);
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <Card className={`border-l-4 ${urgency.border} transition-colors`}>
      <CardContent className="p-3 space-y-2">

        {/* ── Row 1: Name · Urgency badge · Score ─────────────────────────── */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {lead.is_hot_lead && (
              <Flame className="h-3.5 w-3.5 text-orange-500 shrink-0" />
            )}
            {lead.is_priority && !lead.is_hot_lead && (
              <Star className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
            )}
            <span className="font-semibold text-sm leading-snug truncate">
              {lead.full_name}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Badge
              variant="outline"
              className={`text-[10px] px-1.5 py-0 font-medium whitespace-nowrap ${urgency.badge}`}
            >
              <UrgencyIcon className="h-3 w-3 mr-0.5" />
              {urgency.label}
              {followupDate && <span className="ml-1 opacity-80">· {followupDate}</span>}
            </Badge>
            {lead.score != null && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 tabular-nums">
                {lead.score}
              </Badge>
            )}
          </div>
        </div>

        {/* ── Row 2: Phone · Source · Academic Year ────────────────────────── */}
        <div className="flex items-center flex-wrap gap-x-2.5 gap-y-0.5 text-xs">
          <a
            href={`tel:${lead.phone}`}
            className="flex items-center gap-1 text-foreground/70 hover:text-foreground font-medium transition-colors"
          >
            <Phone className="h-3 w-3 shrink-0" />
            {lead.phone}
          </a>
          {lead.source && (
            <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded-full text-muted-foreground">
              via {lead.source}
            </span>
          )}
          {lead.academic_year && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Calendar className="h-3 w-3" />
              {lead.academic_year}
            </span>
          )}
        </div>

        {/* ── Row 3: Stage · Interest · Parent · Programs ───────────────────── */}
        <div className="flex items-center flex-wrap gap-1.5">
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-background font-normal">
            {STAGE_LABELS[lead.funnel_stage] || lead.funnel_stage}
          </Badge>

          {interestConfig && (
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${interestConfig.color}`}>
              {interestConfig.label}
            </Badge>
          )}

          {parentConfig && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className={`flex items-center cursor-default ${parentConfig.color}`}>
                    <parentConfig.icon className="h-3.5 w-3.5" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  {parentConfig.label}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {programsDisplay && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <GraduationCap className="h-3 w-3 shrink-0" />
              {programsDisplay}
            </span>
          )}
        </div>

        {/* ── Row 4: Last activity ─────────────────────────────────────────── */}
        {lastActivityText && (
          <div className="text-[10px] text-muted-foreground bg-muted/40 rounded px-2 py-1 truncate">
            <span className="font-medium">Last:</span>{' '}
            &quot;{lastActivityText}&quot;
            {lastActivityDate && (
              <span className="ml-1 opacity-70">· {lastActivityDate}</span>
            )}
          </div>
        )}

        {/* ── Row 5: Counselor name (manager view) ─────────────────────────── */}
        {lead.counselor_name && (
          <div className="text-[10px] text-muted-foreground">
            Counselor:{' '}
            <span className="font-medium text-foreground/70">{lead.counselor_name}</span>
          </div>
        )}

        {/* ── Actions ──────────────────────────────────────────────────────── */}
        <div className="pt-1.5 border-t border-border/50 space-y-2">
          <div className="flex items-center gap-1.5 flex-wrap">

            {/* Call */}
            <Button
              size="sm"
              variant="default"
              className="h-7 px-2.5 text-xs gap-1"
              onClick={handleCall}
              disabled={isActioning}
            >
              {isActioning ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Phone className="h-3 w-3" />
              )}
              Call
            </Button>

            {/* WhatsApp */}
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2.5 text-xs gap-1"
              onClick={handleWhatsApp}
              disabled={!lead.phone}
            >
              <MessageCircle className="h-3 w-3" />
              WhatsApp
            </Button>

            {/* Personal WhatsApp */}
            {waStatus?.connected && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50"
                onClick={() => setPersonalMsgOpen(true)}
                title="Send via Personal WhatsApp"
              >
                <MessageCircle className="h-4 w-4" />
              </Button>
            )}

            {/* Move Stage */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2.5 text-xs gap-1"
                  disabled={isActioning || forwardStages.length === 0}
                >
                  <ArrowRight className="h-3 w-3" />
                  Move
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-[280px] overflow-y-auto">
                {forwardStages.map((stage) => (
                  <DropdownMenuItem
                    key={stage}
                    onClick={() => onAdvanceStage(lead.id, stage)}
                  >
                    {STAGE_LABELS[stage] || stage}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Reschedule */}
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" variant="ghost" className="h-7 px-2.5 text-xs gap-1">
                  <CalendarClock className="h-3 w-3" />
                  Reschedule
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-3" align="start">
                <p className="text-xs font-medium mb-2">Set new follow-up time</p>
                <div className="flex items-center gap-2">
                  <Input
                    type="datetime-local"
                    value={rescheduleDate}
                    onChange={(e) => setRescheduleDate(e.target.value)}
                    className="h-8 text-xs"
                  />
                  <Button
                    size="sm"
                    className="h-8"
                    onClick={handleReschedule}
                    disabled={!rescheduleDate || isActioning}
                  >
                    Set
                  </Button>
                </div>
              </PopoverContent>
            </Popover>

            {/* Note toggle */}
            <Button
              size="sm"
              variant={showNote ? 'secondary' : 'ghost'}
              className="h-7 px-2.5 text-xs gap-1"
              onClick={() => setShowNote(!showNote)}
            >
              <StickyNote className="h-3 w-3" />
              Note
            </Button>
          </div>

          {/* Note input (inline) */}
          {showNote && (
            <div className="flex items-center gap-2">
              <Input
                placeholder="Add a quick note…"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmitNote()}
                className="h-8 text-xs flex-1"
                autoFocus
              />
              <Button
                size="sm"
                className="h-8 shrink-0"
                onClick={handleSubmitNote}
                disabled={!noteText.trim() || isActioning}
              >
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 shrink-0"
                onClick={() => { setShowNote(false); setNoteText(''); }}
              >
                Cancel
              </Button>
            </div>
          )}
        </div>
      </CardContent>

      {institutionId && (
        <SendPersonalMessageDialog
          institutionId={institutionId}
          open={personalMsgOpen}
          onOpenChange={setPersonalMsgOpen}
          defaultPhone={lead.phone || ''}
          leadId={lead.id}
          recipientName={lead.full_name || ''}
        />
      )}
    </Card>
  );
}
