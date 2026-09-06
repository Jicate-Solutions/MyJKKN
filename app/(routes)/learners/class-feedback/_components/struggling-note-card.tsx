'use client';

// A WARM, PRIVATE support note for a learner on a downward understanding trend (#2).
// The note is written server-side by the scf-learner-notes cron (real Claude, not a
// template) and surfaced here via fn_scf_my_struggling_note (self-scoped). It renders
// ONLY when a real note exists — otherwise NOTHING (Director decision: no template
// fallback). Mirrors the honest-empty pattern of LoopClosureCard / MyVoiceReceipt.
//
// ACTIONABLE (Director, 2026-07-09): the card now also
//   • names the learner's OWN senior peer mentor when they have one (a real person
//     to walk up to, not generic advice), and
//   • takes a one-tap "I've reached out / Not yet" follow-up — the note's own
//     outcome signal, so the loop can learn whether notes lead to conversations.
//
// PRIVACY: the note text is the learner's own. It is never shown to staff — leadership
// only ever sees that a note WAS sent (fn_scf_struggling_notes_sent), never the wording.

import { HeartHandshake, Users, CheckCircle, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useStrugglingNote, useMyMentor, useNoteReachedOut } from '@/hooks/use-learner-loop';

const BRAND = '#0b6d41';

export function StrugglingNoteCard() {
  const { data: note } = useStrugglingNote();
  const { data: mentor } = useMyMentor();
  const reachedOut = useNoteReachedOut();

  // Show nothing until a real AI note exists (no template fallback).
  if (!note) return null;

  const courseLabel = note.course_name || note.course_code;
  // Const local so the null-narrowing survives into the onClick closures
  // (property narrowing does not persist into closures in TS).
  const noteId = note.id;

  return (
    <Card className="border-[#0b6d41]/30 bg-[#fbfbee]/70 dark:bg-muted/40">
      <CardContent className="flex items-start gap-3 p-4">
        <HeartHandshake className="mt-0.5 h-5 w-5 shrink-0" style={{ color: BRAND }} aria-hidden />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm font-semibold" style={{ color: BRAND }}>
            A note for you{courseLabel ? <span className="font-normal text-muted-foreground"> · {courseLabel}</span> : null}
          </p>
          <p className="text-sm leading-relaxed text-foreground/90">{note.note}</p>

          {/* A real person, not generic advice — renders only when the learner has
              an assigned senior peer mentor (mentee side of the induction groups). */}
          {mentor && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Users className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Your senior peer mentor{' '}
              <span className="font-medium text-foreground">{mentor.mentor_name}</span> is also
              there for exactly this.
            </p>
          )}

          {/* One-tap follow-up — the note's own outcome. Changeable any time.
              Gated on note.id: during the deploy→migrate gap the old fn shape
              has no id, and a tap would silently fail — hide until it exists. */}
          {noteId == null ? null : note.reached_out == null ? (
            <div className="flex flex-wrap items-center gap-2 border-t pt-2">
              <span className="text-xs text-muted-foreground">Have you had that chat yet?</span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                disabled={reachedOut.isPending}
                onClick={() => reachedOut.mutate({ noteId, reachedOut: true })}
              >
                {reachedOut.isPending && reachedOut.variables?.reachedOut === true ? (
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                ) : null}
                I&apos;ve reached out
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                disabled={reachedOut.isPending}
                onClick={() => reachedOut.mutate({ noteId, reachedOut: false })}
              >
                {reachedOut.isPending && reachedOut.variables?.reachedOut === false ? (
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                ) : null}
                Not yet
              </Button>
            </div>
          ) : note.reached_out ? (
            <p className="flex flex-wrap items-center gap-1.5 border-t pt-2 text-xs text-muted-foreground">
              <CheckCircle className="h-3.5 w-3.5 text-green-600" aria-hidden />
              You said you&apos;ve reached out — that&apos;s exactly the right move.
              {/* Mistap escape (r2/r3): Undo CLEARS the answer back to
                  unanswered (null) — it must not silently flip it to "No". */}
              <button
                type="button"
                className="underline underline-offset-2 hover:text-foreground disabled:opacity-50"
                disabled={reachedOut.isPending}
                onClick={() => reachedOut.mutate({ noteId, reachedOut: null })}
              >
                Undo
              </button>
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-2 border-t pt-2">
              <span className="text-xs text-muted-foreground">
                Not yet — that&apos;s okay. Whenever you&apos;re ready:
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                disabled={reachedOut.isPending}
                onClick={() => reachedOut.mutate({ noteId, reachedOut: true })}
              >
                {reachedOut.isPending ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : null}
                I&apos;ve reached out now
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
