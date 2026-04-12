'use client';

// mood-checkin.tsx
// 3-tap mood check-in component — designed to complete in under 5 seconds
// Usage: <MoodCheckin learnerId={learnerId} onComplete={() => refetch()} />

import { useState } from 'react';
import { Check, Star, Square, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  MOOD_EMOJIS,
  MOOD_LABELS,
  MOOD_COLORS,
  type MoodScore,
} from '@/types/health';
import { useMoodCheckin } from '@/hooks/health/use-health';

// ─── Props ────────────────────────────────────────────────────────────────────

interface MoodCheckinProps {
  learnerId: string;
  onComplete?: () => void;
}

// ─── Success Burst ────────────────────────────────────────────────────────────

function SuccessBurst({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center z-10">
      <div className="flex gap-2 animate-bounce">
        {['🎉', '✨', '🌟', '💚', '🎊'].map((e, i) => (
          <span
            key={i}
            className="text-2xl"
            style={{
              animationDelay: `${i * 80}ms`,
              animation: 'pop-up 0.6s ease-out forwards',
            }}
          >
            {e}
          </span>
        ))}
      </div>
      <style>{`
        @keyframes pop-up {
          0%   { opacity: 0; transform: translateY(12px) scale(0.5); }
          60%  { opacity: 1; transform: translateY(-8px) scale(1.2); }
          100% { opacity: 0; transform: translateY(-20px) scale(0.9); }
        }
      `}</style>
    </div>
  );
}

// ─── Star / Block Row ─────────────────────────────────────────────────────────

interface RatingRowProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  variant: 'star' | 'block';
  max?: number;
}

function RatingRow({ label, value, onChange, variant, max = 5 }: RatingRowProps) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </span>
      <div className="flex gap-2">
        {Array.from({ length: max }, (_, i) => {
          const score = i + 1;
          const filled = score <= value;
          return (
            <button
              key={score}
              onClick={() => onChange(score)}
              className={cn(
                'w-12 h-12 flex items-center justify-center rounded-xl transition-all duration-150',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                filled
                  ? variant === 'star'
                    ? 'text-yellow-400 scale-110'
                    : 'text-blue-500 scale-110'
                  : 'text-muted-foreground/40 hover:text-muted-foreground',
              )}
              aria-label={`${label} ${score} of ${max}`}
            >
              {variant === 'star' ? (
                <Star
                  className={cn('w-7 h-7', filled && 'fill-yellow-400')}
                  strokeWidth={filled ? 0 : 1.5}
                />
              ) : (
                <Square
                  className={cn('w-6 h-6 rounded', filled && 'fill-blue-500')}
                  strokeWidth={filled ? 0 : 1.5}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MoodCheckin({ learnerId, onComplete }: MoodCheckinProps) {
  const [mood, setMood] = useState<MoodScore | null>(null);
  const [sleep, setSleep] = useState(0);
  const [stress, setStress] = useState(0);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);

  const mutation = useMoodCheckin();

  const canSubmit = mood !== null && sleep > 0 && stress > 0 && !mutation.isPending;

  function handleDone() {
    if (!canSubmit) return;
    mutation.mutate(
      {
        learnerId,
        data: {
          mood: mood as MoodScore,
          sleep_quality: sleep,
          stress_level: stress,
          mood_note: note.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          setShowSuccess(true);
          setTimeout(() => {
            setShowSuccess(false);
            onComplete?.();
          }, 1200);
        },
      },
    );
  }

  return (
    <div className="relative rounded-2xl border bg-card p-5 shadow-sm overflow-hidden">
      <SuccessBurst visible={showSuccess} />

      {/* Header */}
      <div className="mb-4">
        <h3 className="font-semibold text-base">How are you feeling?</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Tap an emoji to log your mood</p>
      </div>

      {/* Mood emojis */}
      <div className="flex justify-between mb-5" role="group" aria-label="Mood selection">
        {(Object.entries(MOOD_EMOJIS) as [string, string][]).map(([score, emoji]) => {
          const s = Number(score) as MoodScore;
          const selected = mood === s;
          return (
            <button
              key={s}
              onClick={() => setMood(s)}
              className={cn(
                'flex flex-col items-center gap-1 rounded-2xl p-2 transition-all duration-150',
                'min-w-[48px] min-h-[64px] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                selected
                  ? 'bg-primary/10 scale-110 ring-2 ring-primary/30'
                  : 'hover:bg-muted active:scale-95',
              )}
              aria-label={MOOD_LABELS[s]}
              aria-pressed={selected}
            >
              <span className="text-3xl leading-none">{emoji}</span>
              <span
                className={cn(
                  'text-[10px] font-medium transition-colors',
                  selected ? MOOD_COLORS[s] : 'text-muted-foreground',
                )}
              >
                {MOOD_LABELS[s]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Sleep + Stress */}
      <div className="space-y-4 mb-5">
        <RatingRow label="Sleep Quality" value={sleep} onChange={setSleep} variant="star" />
        <RatingRow label="Stress Level" value={stress} onChange={setStress} variant="block" />
      </div>

      {/* Collapsible note */}
      <div className="mb-5">
        <button
          onClick={() => setNoteOpen((o) => !o)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {noteOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          Add a note (optional)
        </button>
        <div
          className={cn(
            'overflow-hidden transition-all duration-200',
            noteOpen ? 'max-h-32 mt-2 opacity-100' : 'max-h-0 opacity-0',
          )}
        >
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What's on your mind today?"
            className="text-sm resize-none h-20"
            maxLength={280}
          />
        </div>
      </div>

      {/* Done button */}
      <Button
        onClick={handleDone}
        disabled={!canSubmit}
        className="w-full h-12 text-base font-semibold rounded-xl transition-all duration-150"
      >
        {mutation.isPending ? (
          <span className="flex items-center gap-2">
            <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            Saving...
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <Check className="w-5 h-5" />
            Done
          </span>
        )}
      </Button>
    </div>
  );
}
