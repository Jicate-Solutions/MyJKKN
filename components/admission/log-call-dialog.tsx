'use client';

import { useState, useMemo, useCallback } from 'react';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useCallMutations } from '@/hooks/admission/use-call-mutations';
import { useAuth } from '@/hooks/use-auth';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { getStageSuggestion } from '@/lib/utils/admission/stage-suggestions';
import type { CallOutcome, InterestLevel, NextAction, LogCallInput } from '@/lib/services/telephony/telephony-service';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Phone, ArrowRight, Check, X, MessageCircle, Loader2 } from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════

const OUTCOMES: { value: CallOutcome; label: string; icon: string }[] = [
  { value: 'connected', label: 'Connected', icon: '✅' },
  { value: 'not_answered', label: 'Not Answered', icon: '❌' },
  { value: 'busy', label: 'Busy', icon: '📵' },
  { value: 'wrong_number', label: 'Wrong Number', icon: '❓' },
  { value: 'voicemail', label: 'Voicemail', icon: '📞' },
];

const INTEREST_LEVELS: { value: InterestLevel; label: string; color: string }[] = [
  { value: 'hot', label: 'Hot', color: 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100' },
  { value: 'warm', label: 'Warm', color: 'border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100' },
  { value: 'cold', label: 'Cold', color: 'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100' },
  { value: 'not_interested', label: 'Not Interested', color: 'border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100' },
];

const NEXT_ACTIONS: { value: NextAction; label: string }[] = [
  { value: 'send_brochure', label: 'Send Brochure' },
  { value: 'schedule_visit', label: 'Schedule Campus Visit' },
  { value: 'refer_hod', label: 'Refer to HOD' },
  { value: 'follow_up', label: 'Follow Up Later' },
  { value: 'no_action', label: 'No Action Needed' },
];

// ═══════════════════════════════════════════════════════════════════════════
// Props
// ═══════════════════════════════════════════════════════════════════════════

interface LogCallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: {
    id: string;
    full_name: string | null;
    phone: string;
    funnel_stage: string | null;
    institution_id?: string;
  } | null;
  onSendWhatsApp?: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════
// Main component — responsive dialog/sheet wrapper
// ═══════════════════════════════════════════════════════════════════════════

export function LogCallDialog({ open, onOpenChange, lead, onSendWhatsApp }: LogCallDialogProps) {
  const isMobile = useMediaQuery('(max-width: 767px)');

  if (!lead) return null;

  const formContent = (
    <LogCallForm
      lead={lead}
      onClose={() => onOpenChange(false)}
      onSendWhatsApp={onSendWhatsApp}
    />
  );

  const title = (
    <span className="flex items-center gap-2">
      <Phone className="h-5 w-5" />
      Log Call — {lead.full_name || 'Unknown'}
    </span>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="h-[85vh] overflow-y-auto rounded-t-xl">
          <SheetHeader className="pb-2">
            <SheetTitle>{title}</SheetTitle>
          </SheetHeader>
          {formContent}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {formContent}
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Form — all the actual disposition logic
// ═══════════════════════════════════════════════════════════════════════════

function LogCallForm({
  lead,
  onClose,
  onSendWhatsApp,
}: {
  lead: NonNullable<LogCallDialogProps['lead']>;
  onClose: () => void;
  onSendWhatsApp?: () => void;
}) {
  const { profile } = useAuth();
  const { selectedInstitutionId } = useUserInstitutionAccess();
  const { logManualCall, isLoggingCall } = useCallMutations();

  // Form state
  const [outcome, setOutcome] = useState<CallOutcome | ''>('');
  const [interest, setInterest] = useState<InterestLevel | ''>('');
  const [nextAction, setNextAction] = useState<NextAction | ''>('');
  const [notes, setNotes] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [followUpTime, setFollowUpTime] = useState('');
  const [acceptStage, setAcceptStage] = useState(false);

  // Stage suggestion — recomputed when outcome/interest change
  const stageSuggestion = useMemo(() => {
    if (!outcome) return null;
    return getStageSuggestion(
      lead.funnel_stage,
      outcome,
      outcome === 'connected' ? interest || undefined : undefined
    );
  }, [lead.funnel_stage, outcome, interest]);

  // Auto-accept high-confidence suggestions
  const handleOutcomeChange = useCallback((value: CallOutcome) => {
    setOutcome(value);
    // Reset interest when outcome changes
    if (value !== 'connected') {
      setInterest('');
    }
    setAcceptStage(false);
  }, []);

  const handleInterestChange = useCallback((value: InterestLevel) => {
    setInterest(value);
    setAcceptStage(false);
  }, []);

  // Save handler
  const handleSave = useCallback((sendWhatsApp = false) => {
    if (!outcome) return;

    const input: LogCallInput = {
      lead_id: lead.id,
      institution_id: lead.institution_id || selectedInstitutionId || '',
      counselor_id: profile?.id,
      phone_called: lead.phone,
      call_outcome: outcome,
      interest_level: outcome === 'connected' ? interest || undefined : undefined,
      next_action: nextAction || undefined,
      call_notes: notes || undefined,
      follow_up_date: followUpDate || null,
      follow_up_time: followUpTime || null,
      suggested_stage: stageSuggestion?.suggestedStage || null,
      accept_stage_change: acceptStage,
    };

    logManualCall.mutate(input, {
      onSuccess: () => {
        onClose();
        if (sendWhatsApp && onSendWhatsApp) {
          // Small delay so the dialog animation finishes
          setTimeout(() => onSendWhatsApp(), 200);
        }
      },
    });
  }, [outcome, interest, nextAction, notes, followUpDate, followUpTime, stageSuggestion, acceptStage, lead, selectedInstitutionId, profile, logManualCall, onClose, onSendWhatsApp]);

  const currentStageLabel = (lead.funnel_stage || 'new').replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());

  return (
    <div className="space-y-5 py-4">
      {/* Section 1: Outcome */}
      <div>
        <Label className="text-sm font-medium">Did they pick up?</Label>
        <div className="grid grid-cols-2 gap-2 mt-2">
          {OUTCOMES.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => handleOutcomeChange(o.value)}
              className={cn(
                'flex items-center gap-2 rounded-lg border p-3 text-sm transition-all',
                outcome === o.value
                  ? 'border-primary bg-primary/5 ring-1 ring-primary font-medium'
                  : 'border-border hover:bg-muted/50'
              )}
            >
              <span className="text-base">{o.icon}</span>
              <span>{o.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Section 2: Interest level (only when connected) */}
      {outcome === 'connected' && (
        <div>
          <Label className="text-sm font-medium">Interest Level</Label>
          <div className="flex flex-wrap gap-2 mt-2">
            {INTEREST_LEVELS.map((il) => (
              <button
                key={il.value}
                type="button"
                onClick={() => handleInterestChange(il.value)}
                className={cn(
                  'rounded-full border px-4 py-1.5 text-sm font-medium transition-all',
                  interest === il.value
                    ? `${il.color} ring-1 ring-offset-1`
                    : 'border-border text-muted-foreground hover:bg-muted/50'
                )}
              >
                {il.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Section 3: Next action */}
      {outcome === 'connected' && interest && (
        <div>
          <Label className="text-sm font-medium">Next Step</Label>
          <Select
            value={nextAction}
            onValueChange={(v) => setNextAction(v as NextAction)}
          >
            <SelectTrigger className="mt-1.5">
              <SelectValue placeholder="What's the next step?" />
            </SelectTrigger>
            <SelectContent>
              {NEXT_ACTIONS.map((na) => (
                <SelectItem key={na.value} value={na.value}>
                  {na.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Section 4: Notes */}
      {outcome && (
        <div>
          <Label className="text-sm font-medium">Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
          <Textarea
            placeholder="Quick notes about the call..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="mt-1.5 resize-none text-sm"
          />
        </div>
      )}

      {/* Section 5: Follow-up */}
      {outcome && (
        <div>
          <Label className="text-sm font-medium">Follow-up <span className="text-muted-foreground font-normal">(optional)</span></Label>
          <div className="flex gap-2 mt-1.5">
            <Input
              type="date"
              value={followUpDate}
              onChange={(e) => setFollowUpDate(e.target.value)}
              className="flex-1 text-sm"
              min={new Date().toISOString().split('T')[0]}
            />
            <Input
              type="time"
              value={followUpTime}
              onChange={(e) => setFollowUpTime(e.target.value)}
              className="w-28 text-sm"
            />
          </div>
        </div>
      )}

      {/* Section 6: Stage suggestion */}
      {outcome && stageSuggestion && (
        <div className="rounded-lg border bg-muted/30 p-3">
          <div className="flex items-center gap-2 text-sm">
            <Badge variant="outline" className="text-xs">{currentStageLabel}</Badge>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
            <Badge variant="secondary" className="text-xs font-medium">
              {stageSuggestion.label}
            </Badge>
            <span className="text-xs text-muted-foreground ml-auto">
              {stageSuggestion.confidence === 'high' ? 'Recommended' : 'Suggested'}
            </span>
          </div>
          <div className="flex gap-2 mt-2">
            <Button
              variant={acceptStage ? 'default' : 'outline'}
              size="sm"
              className="gap-1 text-xs"
              onClick={() => setAcceptStage(true)}
            >
              <Check className="h-3 w-3" /> Accept
            </Button>
            <Button
              variant={!acceptStage ? 'default' : 'outline'}
              size="sm"
              className="gap-1 text-xs"
              onClick={() => setAcceptStage(false)}
            >
              <X className="h-3 w-3" /> Keep Current
            </Button>
          </div>
        </div>
      )}

      {/* Section 7: Action buttons */}
      {outcome && (
        <div className="flex flex-col gap-2 pt-2 border-t">
          <Button
            onClick={() => handleSave(false)}
            disabled={isLoggingCall}
            className="w-full"
          >
            {isLoggingCall ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
            ) : (
              'Save & Close'
            )}
          </Button>
          {onSendWhatsApp && (
            <Button
              variant="outline"
              onClick={() => handleSave(true)}
              disabled={isLoggingCall}
              className="w-full gap-2"
            >
              <MessageCircle className="h-4 w-4" />
              Save & Send WhatsApp
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
