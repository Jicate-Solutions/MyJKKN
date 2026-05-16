'use client';

import { useState, useMemo, useCallback, useRef, useEffect, type KeyboardEvent } from 'react';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useCallMutations } from '@/hooks/admission/use-call-mutations';
import { useAuth } from '@/hooks/use-auth';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { getStageSuggestion } from '@/lib/utils/admission/stage-suggestions';
import { ALLOWED_STAGE_TRANSITIONS } from '@/lib/services/admission/lead-service';
import type { FunnelStage } from '@/types/admission';
import { toast } from 'sonner';
import { VoiceMemoRecorder, type VoiceMemoRecorderHandle } from '@/components/admission/voice-memo-recorder';
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
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { Phone, ArrowRight, Check, X, MessageCircle, Loader2, Flame, Star, Tag as TagIcon, Pencil } from 'lucide-react';

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
    // ── Phase 1 consolidation (2026-05-12) ── unified counselor modal
    is_hot_lead?: boolean | null;
    is_priority?: boolean | null;
    tags?: string[] | null;
  } | null;
  onSendWhatsApp?: () => void;
  // If true, the modal opens directly in "Update only" mode (no call section).
  // Phase 2 will use this when counselors click status/stage/note from the
  // detail sidebar — opens straight into the update form instead of call mode.
  defaultUpdateOnly?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// Main component — responsive dialog/sheet wrapper
// ═══════════════════════════════════════════════════════════════════════════

export function LogCallDialog({ open, onOpenChange, lead, onSendWhatsApp, defaultUpdateOnly = false }: LogCallDialogProps) {
  const isMobile = useMediaQuery('(max-width: 767px)');
  // Lift update-only into the wrapper so the title can react to mode switches
  // inside the form without prop-drilling a callback back up.
  const [isUpdateOnly, setIsUpdateOnly] = useState(defaultUpdateOnly);

  // Reset to the requested default whenever the modal re-opens.
  useEffect(() => {
    if (open) setIsUpdateOnly(defaultUpdateOnly);
  }, [open, defaultUpdateOnly]);

  if (!lead) return null;

  const formContent = (
    <LogCallForm
      lead={lead}
      onClose={() => onOpenChange(false)}
      onSendWhatsApp={onSendWhatsApp}
      isUpdateOnly={isUpdateOnly}
      onUpdateOnlyChange={setIsUpdateOnly}
    />
  );

  const title = (
    <span className="flex items-center gap-2">
      {isUpdateOnly ? <Pencil className="h-5 w-5" /> : <Phone className="h-5 w-5" />}
      {isUpdateOnly ? 'Update Lead' : 'Log Call'} — {lead.full_name || 'Unknown'}
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
  isUpdateOnly,
  onUpdateOnlyChange,
}: {
  lead: NonNullable<LogCallDialogProps['lead']>;
  onClose: () => void;
  onSendWhatsApp?: () => void;
  isUpdateOnly: boolean;
  onUpdateOnlyChange: (v: boolean) => void;
}) {
  const { profile } = useAuth();
  const { selectedInstitutionId } = useUserInstitutionAccess();
  const { logManualCall, isLoggingCall } = useCallMutations();

  // ── Call-mode form state (unchanged from pre-Phase-1) ──
  const [outcome, setOutcome] = useState<CallOutcome | ''>('');
  const [interest, setInterest] = useState<InterestLevel | ''>('');
  const [nextAction, setNextAction] = useState<NextAction | ''>('');
  const [notes, setNotes] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [followUpTime, setFollowUpTime] = useState('');
  const [acceptStage, setAcceptStage] = useState(false);
  const [isUploadingMemo, setIsUploadingMemo] = useState(false);
  const [hasMemo, setHasMemo] = useState(false);
  const memoRecorderRef = useRef<VoiceMemoRecorderHandle | null>(null);

  // ── Phase 1: unified counselor fields (work in BOTH call and update-only) ──
  const [manualStage, setManualStage] = useState<FunnelStage | ''>('');
  const [isHotLead, setIsHotLead] = useState<boolean>(!!lead.is_hot_lead);
  const [isPriority, setIsPriority] = useState<boolean>(!!lead.is_priority);
  const [tags, setTags] = useState<string[]>(Array.isArray(lead.tags) ? lead.tags : []);
  const [newTagInput, setNewTagInput] = useState('');

  // Track baselines so we can detect "did anything change?" for update-only save guard.
  const baseline = useMemo(() => ({
    is_hot_lead: !!lead.is_hot_lead,
    is_priority: !!lead.is_priority,
    tags: Array.isArray(lead.tags) ? [...lead.tags].sort() : [],
  }), [lead.is_hot_lead, lead.is_priority, lead.tags]);

  // Voice memo is REQUIRED when call was Connected — captures the conversation
  // for Whisper → sentiment → Lead Mood Digest. Other outcomes have no
  // conversation to record, so memo stays optional there.
  // In update-only mode there's no call → memo is never required.
  const memoRequired = !isUpdateOnly && outcome === 'connected';
  const memoBlocksSave = memoRequired && !hasMemo;
  const resolvedInstitutionId = lead.institution_id || selectedInstitutionId || '';

  // Allowed manual-stage transitions from the lead's current stage.
  // We include the current stage as a no-op option so the Select can render an
  // empty/placeholder state without surprising the counselor.
  const currentStageKey = (lead.funnel_stage || 'new') as FunnelStage;
  const allowedManualStages = useMemo(() => {
    return ALLOWED_STAGE_TRANSITIONS[currentStageKey] ?? [];
  }, [currentStageKey]);

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

  // ── Tag editor helpers ──
  const addTag = useCallback((raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    if (trimmed.length > 30) {
      toast.error('Tags must be 30 characters or fewer');
      return;
    }
    setTags((cur) => {
      if (cur.length >= 20) {
        toast.error('Maximum 20 tags');
        return cur;
      }
      const lower = trimmed.toLowerCase();
      if (cur.some((t) => t.toLowerCase() === lower)) return cur;
      return [...cur, trimmed];
    });
    setNewTagInput('');
  }, []);

  const removeTag = useCallback((tag: string) => {
    setTags((cur) => cur.filter((t) => t !== tag));
  }, []);

  const handleTagKey = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(newTagInput);
    } else if (e.key === 'Backspace' && !newTagInput && tags.length > 0) {
      // Quality-of-life: backspace on empty input pops the last tag
      setTags((cur) => cur.slice(0, -1));
    }
  }, [addTag, newTagInput, tags.length]);

  // ── Manual stage override resets the suggestion accept toggle ──
  const handleManualStageChange = useCallback((v: string) => {
    setManualStage((v as FunnelStage) || '');
    if (v) setAcceptStage(false); // manual wins; visually un-toggle Accept
  }, []);

  // ── Diff helpers — drive the "Save" disable state in update-only mode ──
  const hasLeadDiff = useMemo(() => {
    if (manualStage && manualStage !== currentStageKey) return true;
    if (isHotLead !== baseline.is_hot_lead) return true;
    if (isPriority !== baseline.is_priority) return true;
    const sortedTags = [...tags].sort();
    if (sortedTags.length !== baseline.tags.length ||
        sortedTags.some((t, i) => t !== baseline.tags[i])) return true;
    if (notes.trim()) return true;
    if (followUpDate) return true;
    return false;
  }, [manualStage, currentStageKey, isHotLead, isPriority, tags, baseline, notes, followUpDate]);

  // Save handler — also handles voice-memo upload + PATCH after the row is created.
  // Flow: insert call_log via existing mutation → use returned id to upload memo
  // to {institution_id}/{call_log_id}.webm → PATCH the row with memo_audio_url
  // + memo_audio_duration_seconds. Memo is OPTIONAL: form succeeds even if the
  // memo upload fails (we surface a toast but don't block the call log).
  //
  // In UPDATE-ONLY mode we skip the memo flow entirely (no call_log row created)
  // and post a single API call with update_only=true.
  const handleSave = useCallback((sendWhatsApp = false) => {
    if (isUpdateOnly) {
      if (!hasLeadDiff) {
        toast.error('No changes to save');
        return;
      }
    } else if (!outcome) {
      return;
    }

    // Build a unified payload. The API switches on update_only=true to choose
    // which branch of TelephonyService.logManualCall() runs.
    const input: LogCallInput = {
      lead_id: lead.id,
      institution_id: resolvedInstitutionId,
      counselor_id: profile?.id,
      phone_called: lead.phone,
      call_outcome: (isUpdateOnly ? 'connected' : outcome) as CallOutcome,
      interest_level: !isUpdateOnly && outcome === 'connected' ? interest || undefined : undefined,
      next_action: !isUpdateOnly && nextAction ? nextAction : undefined,
      call_notes: notes || undefined,
      follow_up_date: followUpDate || null,
      follow_up_time: followUpTime || null,
      suggested_stage: !isUpdateOnly ? (stageSuggestion?.suggestedStage || null) : null,
      accept_stage_change: !isUpdateOnly && !manualStage && acceptStage,
      // ── Phase 1 fields (apply in both modes) ──
      update_only: isUpdateOnly,
      manual_stage: manualStage || null,
      // Only forward toggles when the counselor changed them — avoids spurious
      // updates that would invalidate caches for no reason.
      is_hot_lead: isHotLead !== baseline.is_hot_lead ? isHotLead : undefined,
      is_priority: isPriority !== baseline.is_priority ? isPriority : undefined,
      tags: (() => {
        const sortedCur = [...tags].sort();
        const same = sortedCur.length === baseline.tags.length &&
                     sortedCur.every((t, i) => t === baseline.tags[i]);
        return same ? undefined : tags;
      })(),
    };

    logManualCall.mutate(input, {
      onSuccess: async (data: any) => {
        // Memo upload only applies in call mode — update-only has no call_log row.
        if (!isUpdateOnly) {
          const callLogId: string | undefined = data?.callLog?.id;
          const hasMemoNow = memoRecorderRef.current?.hasMemo() ?? false;
          if (callLogId && hasMemoNow) {
            setIsUploadingMemo(true);
            try {
              const result = await memoRecorderRef.current!.uploadMemo(callLogId);
              if (result) {
                const patchRes = await fetch(`/api/admission/calls/log/${callLogId}/memo`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    memo_audio_url: result.url,
                    memo_audio_duration_seconds: result.durationSec,
                  }),
                });
                if (!patchRes.ok) {
                  const err = await patchRes.json().catch(() => ({}));
                  toast.error(err?.message || 'Memo uploaded but could not be linked to the call log.');
                }
              }
            } catch (err: any) {
              toast.error(err?.message || 'Memo upload failed.');
            } finally {
              setIsUploadingMemo(false);
            }
          }
        }

        onClose();
        if (sendWhatsApp && onSendWhatsApp) {
          // Small delay so the dialog animation finishes
          setTimeout(() => onSendWhatsApp(), 200);
        }
      },
    });
  }, [
    isUpdateOnly, hasLeadDiff,
    outcome, interest, nextAction, notes, followUpDate, followUpTime,
    stageSuggestion, acceptStage,
    manualStage, isHotLead, isPriority, tags, baseline,
    lead, resolvedInstitutionId, profile,
    logManualCall, onClose, onSendWhatsApp,
  ]);

  const currentStageLabel = (lead.funnel_stage || 'new').replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());

  // ── Save-button enablement ──
  // Call mode: requires outcome (existing behavior) and respects memo-required gate.
  // Update mode: requires at least one diff vs the lead's current state.
  const saveDisabled =
    isLoggingCall || isUploadingMemo ||
    (isUpdateOnly ? !hasLeadDiff : (!outcome || memoBlocksSave));
  const saveTitle = !isUpdateOnly && memoBlocksSave
    ? 'Record a voice memo to save this connected call'
    : isUpdateOnly && !hasLeadDiff
    ? 'Change at least one field to save'
    : undefined;

  // In both modes the buttons row should be available whenever the form is
  // ready (outcome chosen in call mode, or modal opened in update mode).
  const formReady = isUpdateOnly || !!outcome;

  return (
    <div className="space-y-5 py-4">
      {/* ── Mode toggle (always shown at the top) ─────────────────────── */}
      <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2">
        <div className="flex flex-col">
          <Label htmlFor="log-call-update-only" className="text-sm font-medium cursor-pointer">
            Update only — no call to log
          </Label>
          <span className="text-xs text-muted-foreground">
            {isUpdateOnly
              ? 'Saving will update the lead without creating a call record.'
              : 'Toggle on to update status / notes / follow-up without logging a call.'}
          </span>
        </div>
        <Switch
          id="log-call-update-only"
          checked={isUpdateOnly}
          onCheckedChange={onUpdateOnlyChange}
        />
      </div>

      {/* ── CALL-MODE-ONLY SECTIONS ────────────────────────────────────── */}

      {!isUpdateOnly && (
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
      )}

      {!isUpdateOnly && outcome === 'connected' && (
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

      {!isUpdateOnly && outcome === 'connected' && interest && (
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

      {!isUpdateOnly && outcome && resolvedInstitutionId && (
        <div className={memoBlocksSave ? 'rounded-lg ring-1 ring-amber-300' : ''}>
          <VoiceMemoRecorder
            ref={memoRecorderRef}
            institutionId={resolvedInstitutionId}
            onError={(msg) => toast.error(msg)}
            onMemoStateChange={setHasMemo}
            disabled={isLoggingCall || isUploadingMemo}
          />
          {memoBlocksSave && (
            <p className="mt-1.5 text-xs text-amber-700">
              Voice memo is required for connected calls.
            </p>
          )}
        </div>
      )}

      {/* ── SHARED SECTIONS (visible in BOTH modes when form is ready) ──── */}

      {formReady && (
        <>
          {/* Notes */}
          <div>
            <Label className="text-sm font-medium">
              {isUpdateOnly ? 'Note' : 'Notes'}{' '}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea
              placeholder={isUpdateOnly ? 'What changed? (visible in the activity timeline)' : 'Quick notes about the call...'}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mt-1.5 resize-none text-sm"
            />
          </div>

          {/* Schedule Followup */}
          <div>
            <Label className="text-sm font-medium">
              Schedule Followup <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
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

          {/* Stage change — single unified control.
              The old design had TWO stage sections (Accept/Keep + manual override) which
              confused counselors per smoke-test on 2026-05-12. Consolidated into one
              dropdown. AI suggestion is preserved as a click-to-apply hint below — the
              counselor still gets the AI nudge but sees only one input. */}
          <div>
            <Label className="text-sm font-medium">
              Change stage <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <div className="flex items-center gap-2 mt-1.5">
              <Badge variant="outline" className="text-xs whitespace-nowrap">{currentStageLabel}</Badge>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <Select value={manualStage} onValueChange={handleManualStageChange}>
                <SelectTrigger className="flex-1 text-sm">
                  <SelectValue placeholder={allowedManualStages.length === 0 ? 'No transitions allowed' : 'Pick a stage…'} />
                </SelectTrigger>
                <SelectContent>
                  {allowedManualStages.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {manualStage && (
                <Button variant="ghost" size="sm" onClick={() => setManualStage('')} className="px-2">
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            {/* AI suggestion hint — call mode only, shown only when the suggestion
                differs from what the counselor has already picked. One click applies it. */}
            {!isUpdateOnly && stageSuggestion && manualStage !== stageSuggestion.suggestedStage && (
              <button
                type="button"
                onClick={() => handleManualStageChange(stageSuggestion.suggestedStage)}
                className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Check className="h-3 w-3" />
                <span>Suggested:</span>
                <span className="font-medium text-foreground">{stageSuggestion.label}</span>
                <span className="text-muted-foreground">
                  ({stageSuggestion.confidence === 'high' ? 'Recommended' : 'Optional'})
                </span>
                <span className="text-primary underline underline-offset-2">Apply</span>
              </button>
            )}
          </div>

          {/* Lead flags — Hot / Priority.
              Using <label htmlFor> as the row wrapper instead of <button> because
              Radix <Switch> renders an internal <button>; nesting <button> inside
              <button> is invalid HTML and triggers React hydration warnings.
              The native <label>+<input/control> association handles click + a11y. */}
          <div className="rounded-lg border p-3">
            <Label className="text-sm font-medium">Lead flags</Label>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <label
                htmlFor="log-call-hot-lead-switch"
                className={cn(
                  'flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm transition-all cursor-pointer select-none',
                  isHotLead
                    ? 'border-red-300 bg-red-50 text-red-700'
                    : 'border-border hover:bg-muted/50 text-muted-foreground'
                )}
              >
                <span className="flex items-center gap-1.5">
                  <Flame className={cn('h-4 w-4', isHotLead && 'fill-red-500 text-red-500')} />
                  Hot lead
                </span>
                <Switch
                  id="log-call-hot-lead-switch"
                  checked={isHotLead}
                  onCheckedChange={setIsHotLead}
                  aria-label="Toggle hot lead"
                />
              </label>
              <label
                htmlFor="log-call-priority-switch"
                className={cn(
                  'flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm transition-all cursor-pointer select-none',
                  isPriority
                    ? 'border-amber-300 bg-amber-50 text-amber-700'
                    : 'border-border hover:bg-muted/50 text-muted-foreground'
                )}
              >
                <span className="flex items-center gap-1.5">
                  <Star className={cn('h-4 w-4', isPriority && 'fill-amber-500 text-amber-500')} />
                  Priority
                </span>
                <Switch
                  id="log-call-priority-switch"
                  checked={isPriority}
                  onCheckedChange={setIsPriority}
                  aria-label="Toggle priority"
                />
              </label>
            </div>
          </div>

          {/* Tags chip editor */}
          <div>
            <Label className="text-sm font-medium flex items-center gap-1.5">
              <TagIcon className="h-3.5 w-3.5" />
              Tags <span className="text-muted-foreground font-normal">(max 20)</span>
            </Label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <Badge
                  key={t}
                  variant="secondary"
                  className="gap-1 pr-1 text-xs"
                >
                  {t}
                  <button
                    type="button"
                    onClick={() => removeTag(t)}
                    className="ml-1 rounded-sm hover:bg-muted-foreground/20"
                    aria-label={`Remove tag ${t}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              <Input
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                onKeyDown={handleTagKey}
                onBlur={() => newTagInput.trim() && addTag(newTagInput)}
                placeholder={tags.length === 0 ? 'Add tags (press Enter)…' : 'Add tag…'}
                className="h-8 flex-1 min-w-[8rem] text-sm"
                maxLength={30}
              />
            </div>
          </div>

          {/* ── Action buttons ── */}
          <div className="flex flex-col gap-2 pt-2 border-t">
            <Button
              onClick={() => handleSave(false)}
              disabled={saveDisabled}
              className="w-full"
              title={saveTitle}
            >
              {isLoggingCall || isUploadingMemo ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {isUploadingMemo ? 'Uploading memo...' : 'Saving...'}</>
              ) : (
                'Save & Close'
              )}
            </Button>
            {onSendWhatsApp && (
              <Button
                variant="outline"
                onClick={() => handleSave(true)}
                disabled={saveDisabled}
                className="w-full gap-2"
                title={saveTitle}
              >
                <MessageCircle className="h-4 w-4" />
                Save & Send WhatsApp
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
