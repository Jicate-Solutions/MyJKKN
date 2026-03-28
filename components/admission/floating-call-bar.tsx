'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Phone, ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLiveCallStatus } from '@/hooks/admission/use-live-call-status';
import { useCallMutations } from '@/hooks/admission/use-call-mutations';
import type { CallDisposition } from '@/lib/services/telephony/telephony-service';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DISPOSITIONS: { value: CallDisposition; label: string }[] = [
  { value: 'interested', label: 'Interested' },
  { value: 'not_interested', label: 'Not Interested' },
  { value: 'callback', label: 'Callback' },
  { value: 'not_reachable', label: 'Not Reachable' },
  { value: 'wrong_number', label: 'Wrong Number' },
  { value: 'busy', label: 'Busy' },
  { value: 'other', label: 'Other' },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FloatingCallBarProps {
  callLogId: string | null;
  prospectName?: string;
  leadId?: string;
  onDismiss: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FloatingCallBar({
  callLogId,
  prospectName,
  leadId,
  onDismiss,
}: FloatingCallBarProps) {
  const { status, duration, isActive, isRinging, isConnected, isTerminal } =
    useLiveCallStatus(callLogId);

  const { updateCallNotes, isUpdatingNotes } = useCallMutations();

  // Local state
  const [expanded, setExpanded] = useState(false);
  const [localTimer, setLocalTimer] = useState(0);
  const [notes, setNotes] = useState('');
  const [disposition, setDisposition] = useState<CallDisposition | ''>('');
  const [followUpDate, setFollowUpDate] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ---------------------------------------------------------------------------
  // Timer – ticks every second while connected
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (isConnected) {
      timerRef.current = setInterval(() => {
        setLocalTimer((prev) => prev + 1);
      }, 1000);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isConnected]);

  // Stop the timer when the call reaches a terminal state
  useEffect(() => {
    if (isTerminal && timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [isTerminal]);

  // Auto-expand the panel when the call ends
  useEffect(() => {
    if (isTerminal) {
      setExpanded(true);
    }
  }, [isTerminal]);

  // ---------------------------------------------------------------------------
  // Status helpers
  // ---------------------------------------------------------------------------

  const statusMessage = (() => {
    switch (status) {
      case 'initiated':
        return 'Connecting...';
      case 'ringing':
        return 'Your phone is ringing — pick up to connect';
      case 'in-progress':
        return `In Progress — ${formatTime(localTimer)}`;
      case 'completed':
        return `Call Ended — ${formatTime(duration || localTimer)}`;
      case 'busy':
        return 'Line Busy';
      case 'no-answer':
        return 'No Answer';
      case 'failed':
      case 'cancelled':
        return 'Call Failed';
      default:
        return 'Connecting...';
    }
  })();

  const dotColor = (() => {
    if (isConnected) return 'bg-green-500';
    if (isRinging) return 'bg-yellow-500';
    if (isTerminal) return 'bg-gray-400';
    return 'bg-blue-500';
  })();

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleSave = useCallback(() => {
    if (!callLogId) return;

    updateCallNotes.mutate(
      {
        call_id: callLogId,
        call_notes: notes || undefined,
        call_disposition: disposition || undefined,
        follow_up_date: followUpDate || null,
      },
      {
        onSuccess: () => {
          onDismiss();
        },
      }
    );
  }, [callLogId, notes, disposition, followUpDate, updateCallNotes, onDismiss]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (!callLogId) return null;

  return (
    <div
      className={cn(
        'fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-lg',
        'bg-card border rounded-lg shadow-lg'
      )}
    >
      {/* Always-visible status bar */}
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        {/* Pulse dot */}
        <span className="relative flex h-3 w-3 shrink-0">
          <span
            className={cn(
              'absolute inline-flex h-full w-full rounded-full opacity-75',
              dotColor,
              !isTerminal && 'animate-ping'
            )}
          />
          <span
            className={cn(
              'relative inline-flex h-3 w-3 rounded-full',
              dotColor
            )}
          />
        </span>

        {/* Phone icon + prospect name */}
        <Phone className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate font-medium text-sm">
          {prospectName || 'Unknown Prospect'}
        </span>

        {/* Status message */}
        <span className="ml-auto truncate text-xs text-muted-foreground">
          {statusMessage}
        </span>

        {/* Timer badge when connected */}
        {isConnected && (
          <Badge variant="secondary" className="ml-2 tabular-nums text-xs">
            {formatTime(localTimer)}
          </Badge>
        )}

        {/* Expand toggle */}
        {expanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>

      {/* Expanded panel */}
      {expanded && (
        <div className="border-t px-4 pb-4 pt-3 space-y-4">
          {/* Notes textarea – always available */}
          <div className="space-y-1.5">
            <Label htmlFor="call-notes" className="text-xs">
              Notes
            </Label>
            <Textarea
              id="call-notes"
              placeholder="Add notes during or after the call..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="resize-none text-sm"
            />
          </div>

          {/* Post-call disposition & follow-up – only after call ends */}
          {isTerminal && (
            <>
              {/* Disposition */}
              <div className="space-y-2">
                <Label className="text-xs">Disposition</Label>
                <RadioGroup
                  value={disposition}
                  onValueChange={(val) =>
                    setDisposition(val as CallDisposition)
                  }
                  className="grid grid-cols-2 gap-2"
                >
                  {DISPOSITIONS.map((d) => (
                    <div key={d.value} className="flex items-center gap-2">
                      <RadioGroupItem value={d.value} id={`disp-${d.value}`} />
                      <Label
                        htmlFor={`disp-${d.value}`}
                        className="text-sm font-normal cursor-pointer"
                      >
                        {d.label}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              {/* Follow-up date */}
              <div className="space-y-1.5">
                <Label htmlFor="follow-up-date" className="text-xs">
                  Follow-up Date
                </Label>
                <Input
                  id="follow-up-date"
                  type="date"
                  value={followUpDate}
                  onChange={(e) => setFollowUpDate(e.target.value)}
                  className="text-sm"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-1">
                <Button variant="ghost" size="sm" onClick={onDismiss}>
                  Skip
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={isUpdatingNotes}
                >
                  {isUpdatingNotes ? 'Saving...' : 'Save & Close'}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
