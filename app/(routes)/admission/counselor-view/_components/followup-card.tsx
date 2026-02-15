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
} from 'lucide-react';
import type { FollowupLead } from '@/lib/services/admission/counselor-daily-view-service';

// Complete stage order including new JKKN stages
const STAGE_ORDER = [
  'new', 'contacted', 'not_reachable', 'interested', 'follow_up_scheduled',
  'engaged', 'qualified', 'application_started', 'application_submitted',
  'documents_pending', 'documents_verified', 'interview_scheduled',
  'interview_completed', 'offer_sent', 'offer_accepted', 'token_paid',
  'applied', 'interviewed', 'offered', 'enrolled', 'lost', 'dormant',
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
  interview_scheduled: 'Interview Set',
  interview_completed: 'Interview Done',
  offer_sent: 'Offer Sent',
  offer_accepted: 'Offer Accepted',
  token_paid: 'Token Paid',
  applied: 'Applied',
  interviewed: 'Interviewed',
  offered: 'Offered',
  enrolled: 'Enrolled',
  lost: 'Lost',
  dormant: 'Dormant',
};

// Interest level badge config
const INTEREST_LEVEL_CONFIG: Record<string, { color: string; label: string }> = {
  very_high: { color: 'bg-green-100 text-green-700 border-green-200', label: 'Very High' },
  high: { color: 'bg-blue-100 text-blue-700 border-blue-200', label: 'High' },
  medium: { color: 'bg-yellow-100 text-yellow-700 border-yellow-200', label: 'Medium' },
  low: { color: 'bg-orange-100 text-orange-700 border-orange-200', label: 'Low' },
  none: { color: 'bg-gray-100 text-gray-500 border-gray-200', label: 'None' },
};

// Parent decision status config
const PARENT_STATUS_CONFIG: Record<string, { icon: typeof CheckCircle2; color: string; label: string }> = {
  supportive: { icon: CheckCircle2, color: 'text-green-600', label: 'Parent Supportive' },
  considering: { icon: Clock, color: 'text-yellow-600', label: 'Parent Considering' },
  against: { icon: XCircle, color: 'text-red-500', label: 'Parent Against' },
  not_involved: { icon: Minus, color: 'text-gray-400', label: 'Parent Not Involved' },
  unknown: { icon: HelpCircle, color: 'text-gray-400', label: 'Parent Status Unknown' },
};

interface FollowupCardProps {
  lead: FollowupLead;
  onCall: (leadId: string) => void;
  onAdvanceStage: (leadId: string, newStage: string) => void;
  onReschedule: (leadId: string, newDate: string) => void;
  onAddNote: (leadId: string, note: string) => void;
  isActioning?: boolean;
}

export function FollowupCard({
  lead,
  onCall,
  onAdvanceStage,
  onReschedule,
  onAddNote,
  isActioning,
}: FollowupCardProps) {
  const [noteText, setNoteText] = useState('');
  const [showNote, setShowNote] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState('');

  const currentStageIdx = STAGE_ORDER.indexOf(lead.funnel_stage);
  // Only show forward stages that aren't terminal (lost/dormant shown separately)
  const forwardStages = STAGE_ORDER.slice(currentStageIdx + 1);

  const urgencyConfig = {
    overdue: { color: 'text-red-600 bg-red-50', icon: AlertTriangle, label: 'Overdue' },
    today: { color: 'text-amber-600 bg-amber-50', icon: Clock, label: 'Due Today' },
    upcoming: { color: 'text-blue-600 bg-blue-50', icon: CalendarClock, label: 'Upcoming' },
  };

  const urgency = urgencyConfig[lead.urgency] || urgencyConfig.today;
  const UrgencyIcon = urgency.icon;

  const programDisplay = lead.interested_programs?.length
    ? lead.interested_programs.join(', ')
    : null;

  const lastActivityText = lead.last_activity
    ? `${lead.last_activity.description || lead.last_activity.type}`
    : null;

  const lastActivityDate = lead.last_activity
    ? new Date(lead.last_activity.created_at).toLocaleDateString('en-IN', {
        month: 'short',
        day: 'numeric',
      })
    : null;

  const interestConfig = lead.student_interest_level
    ? INTEREST_LEVEL_CONFIG[lead.student_interest_level]
    : null;

  const parentConfig = lead.parent_decision_status
    ? PARENT_STATUS_CONFIG[lead.parent_decision_status]
    : null;

  const handleSubmitNote = () => {
    if (noteText.trim()) {
      onAddNote(lead.id, noteText.trim());
      setNoteText('');
      setShowNote(false);
    }
  };

  const handleReschedule = () => {
    if (rescheduleDate) {
      onReschedule(lead.id, new Date(rescheduleDate).toISOString());
      setRescheduleDate('');
    }
  };

  return (
    <Card className={`transition-colors ${lead.urgency === 'overdue' ? 'border-red-200' : ''}`}>
      <CardContent className="p-4">
        {/* Top row: Name, indicators, stage */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {lead.is_hot_lead && <Flame className="h-4 w-4 text-orange-500 flex-shrink-0" />}
              {lead.is_priority && !lead.is_hot_lead && <Star className="h-4 w-4 text-yellow-500 flex-shrink-0" />}
              <span className="font-semibold text-sm truncate">{lead.full_name}</span>
              {/* Interest level badge */}
              {interestConfig && (
                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${interestConfig.color}`}>
                  {interestConfig.label}
                </Badge>
              )}
              {/* Parent decision indicator */}
              {parentConfig && (
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <parentConfig.icon className={`h-3.5 w-3.5 flex-shrink-0 ${parentConfig.color}`} />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      {parentConfig.label}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              {programDisplay && (
                <span className="text-xs text-muted-foreground truncate">{programDisplay}</span>
              )}
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                {STAGE_LABELS[lead.funnel_stage] || lead.funnel_stage}
              </Badge>
              {lead.source && (
                <span className="text-[10px] text-muted-foreground">via {lead.source}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${urgency.color}`}>
              <UrgencyIcon className="h-3 w-3 mr-0.5" />
              {urgency.label}
            </Badge>
            {lead.score != null && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                {lead.score}
              </Badge>
            )}
          </div>
        </div>

        {/* Phone + last activity */}
        <div className="flex items-center gap-4 mb-3 text-xs text-muted-foreground">
          <a href={`tel:${lead.phone}`} className="flex items-center gap-1 hover:text-foreground">
            <Phone className="h-3 w-3" />
            {lead.phone}
          </a>
          {lastActivityText && (
            <span className="truncate">
              Last: &quot;{lastActivityText}&quot; ({lastActivityDate})
            </span>
          )}
        </div>

        {/* Counselor name for manager view */}
        {lead.counselor_name && (
          <div className="text-xs text-muted-foreground mb-2">
            Counselor: {lead.counselor_name}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            variant="default"
            className="h-7 text-xs"
            onClick={() => {
              window.open(`tel:${lead.phone}`, '_self');
              onCall(lead.id);
            }}
            disabled={isActioning}
          >
            <Phone className="h-3 w-3 mr-1" />
            Call
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => {
              const phone = lead.phone.replace(/\D/g, '');
              const formattedPhone = phone.startsWith('91') ? phone : `91${phone}`;
              window.open(`https://wa.me/${formattedPhone}`, '_blank');
            }}
          >
            <MessageCircle className="h-3 w-3 mr-1" />
            WhatsApp
          </Button>

          {/* Stage advance dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-7 text-xs" disabled={isActioning}>
                Move Stage
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-[300px] overflow-y-auto">
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

          {/* Reschedule popover */}
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="ghost" className="h-7 text-xs">
                <CalendarClock className="h-3 w-3 mr-1" />
                Reschedule
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-3" align="start">
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

          {/* Quick note toggle */}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => setShowNote(!showNote)}
          >
            <StickyNote className="h-3 w-3 mr-1" />
            Note
          </Button>
        </div>

        {/* Quick note input */}
        {showNote && (
          <div className="mt-2 flex items-center gap-2">
            <Input
              placeholder="Add a quick note..."
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmitNote()}
              className="h-8 text-xs"
              autoFocus
            />
            <Button
              size="sm"
              className="h-8"
              onClick={handleSubmitNote}
              disabled={!noteText.trim() || isActioning}
            >
              Save
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
