'use client';

// A WARM, PRIVATE support note for a learner on a downward understanding trend (#2).
// The note is written server-side by the scf-learner-notes cron (real Claude, not a
// template) and surfaced here via fn_scf_my_struggling_note (self-scoped). It renders
// ONLY when a real note exists — otherwise NOTHING (Director decision: no template
// fallback). Mirrors the honest-empty pattern of LoopClosureCard / MyVoiceReceipt.
//
// PRIVACY: the note text is the learner's own. It is never shown to staff — leadership
// only ever sees that a note WAS sent (fn_scf_struggling_notes_sent), never the wording.

import { HeartHandshake } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useStrugglingNote } from '@/hooks/use-learner-loop';

const BRAND = '#0b6d41';

export function StrugglingNoteCard() {
  const { data: note } = useStrugglingNote();

  // Show nothing until a real AI note exists (no template fallback).
  if (!note) return null;

  const courseLabel = note.course_name || note.course_code;

  return (
    <Card className="border-[#0b6d41]/30 bg-[#fbfbee]/70 dark:bg-muted/40">
      <CardContent className="flex items-start gap-3 p-4">
        <HeartHandshake className="mt-0.5 h-5 w-5 shrink-0" style={{ color: BRAND }} aria-hidden />
        <div className="space-y-1">
          <p className="text-sm font-semibold" style={{ color: BRAND }}>
            A note for you{courseLabel ? <span className="font-normal text-muted-foreground"> · {courseLabel}</span> : null}
          </p>
          <p className="text-sm leading-relaxed text-foreground/90">{note.note}</p>
        </div>
      </CardContent>
    </Card>
  );
}
