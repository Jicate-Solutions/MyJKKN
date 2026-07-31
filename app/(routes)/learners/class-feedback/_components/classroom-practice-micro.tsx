'use client';

// Classroom Practice L2 — ONE sealed micro-item, shown only at the post-submit
// confirmation moment inside the FeedbackDialog, riding alongside the Lane C
// clarification touchpoint.
//
// RATIFIED INVARIANTS enforced here (substrate: 20260729184500):
//   • ONE item per submission — the server records the offer and refuses a
//     second for the same session, so this component cannot double-ask.
//     ⚠️ AS AMENDED BY THE DIRECTOR 2026-07-30 (deliberate — do not "fix"
//     back): the learner's OWN "did it help?" follow-up (clarification-
//     followup-card, mounted above this component) is EXEMPT from this cap.
//     On a day when both are due the learner sees BOTH, follow-up first —
//     the cap is one rotation question + (when due) their own follow-up.
//   • ALWAYS SKIPPABLE — Skip is a first-class recorded answer.
//   • NEVER BLOCKING — nothing here can fail loudly. No toasts, no thrown
//     errors, no interference with closing the dialog. While loading, and on
//     any failure at all, this renders NOTHING: zero footprint.
//   • The 0-4 anchors match the CARRE participant scale used everywhere else.
//   • OCCASIONAL SEALED COMMENT — after every Nth ANSWERED item about the same
//     person the SERVER (not this component) sets comment_invite, and an
//     optional one-line box appears. Never after a skip, never required, and
//     the thanks state is already on screen before it arrives, so a learner who
//     ignores it loses nothing.

import { useRef, useState } from 'react';
import { CheckCircle2, Lock } from 'lucide-react';
import {
  useAnswerMicroItem,
  useMicroItem,
  useSealedComment,
} from '@/hooks/use-classroom-practice-micro';
import { COMMENT_MAX_LENGTH } from '@/lib/services/classroom-practice-micro-service';

const BRAND = '#0b6d41';

// 0-4 with plain anchors. Same scale as the sealed participant lane.
const ANCHORS: { value: number; label: string }[] = [
  { value: 0, label: 'Never' },
  { value: 1, label: 'Rarely' },
  { value: 2, label: 'Sometimes' },
  { value: 3, label: 'Usually' },
  { value: 4, label: 'Always' },
];

type Phase = 'asking' | 'thanks' | 'comment';

interface ClassroomPracticeMicroProps {
  attendanceDate: string;
  timetableId: string;
  periodId: string;
}

export function ClassroomPracticeMicro({
  attendanceDate,
  timetableId,
  periodId,
}: ClassroomPracticeMicroProps) {
  const { data: item, isLoading } = useMicroItem(
    attendanceDate,
    timetableId,
    periodId,
    true,
  );
  const answer = useAnswerMicroItem();
  const sealedComment = useSealedComment();
  const [phase, setPhase] = useState<Phase>('asking');
  const [text, setText] = useState('');
  const sentRef = useRef(false);
  const commentSentRef = useRef(false);

  // Zero footprint while we do not yet know, and forever if there is nothing
  // to ask. No spinner: this must never look like something the learner is
  // waiting on.
  if (isLoading || !item) return null;

  // Every outcome lands in the thanks state IMMEDIATELY. A failure to record is
  // deliberately indistinguishable to the learner (invariant: never blocking,
  // never alarming) — the miss is visible to leadership in fn_scf_micro_health.
  // A comment invite, if the server grants one, arrives after the fact and
  // simply replaces the thanks line.
  const send = (score: number | null, skip: boolean) => {
    // In-flight guard. A rapid double-tap would otherwise fire twice on the same
    // impression; the second is refused server-side by answer-once, so it is
    // harmless, but it is a wasted round trip. A ref rather than isPending
    // because two taps in the same frame both read a stale isPending.
    if (sentRef.current) return;
    sentRef.current = true;
    setPhase('thanks');
    answer
      .mutateAsync({ impressionId: item.impression_id, score, skip })
      .then((res) => {
        if (res.commentInvite) setPhase('comment');
      })
      .catch(() => {
        /* never surfaces — the thanks state is already on screen */
      });
  };

  const sendComment = () => {
    if (commentSentRef.current) return;   // same double-tap guard as send()
    commentSentRef.current = true;
    const body = text.trim();
    setPhase('thanks');
    if (!body) return;
    sealedComment
      .mutateAsync({ impressionId: item.impression_id, comment: body })
      .catch(() => {
        /* silent by design */
      });
  };

  if (phase === 'comment') {
    return (
      <div className="rounded-md border bg-muted/30 p-3">
        <div className="space-y-2">
          <label htmlFor="cp-sealed-note" className="block text-sm font-medium">
            Anything you&apos;d like the Principal to know about these sessions?
          </label>
          <textarea
            id="cp-sealed-note"
            rows={2}
            maxLength={COMMENT_MAX_LENGTH}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Optional — one line is plenty"
            className="w-full resize-none rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b6d41]/40"
          />
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: BRAND }} />
            <span>
              Sealed — only the Principal and Director can read this. Never the person
              who takes these sessions, and never with your name.
            </span>
          </p>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setPhase('thanks')}
              className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b6d41]/40"
            >
              No thanks
            </button>
            <button
              type="button"
              onClick={sendComment}
              disabled={!text.trim()}
              className="rounded-md px-3 py-1 text-xs font-medium text-white transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b6d41]/40 disabled:opacity-40"
              style={{ backgroundColor: BRAND }}
            >
              Send
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'thanks') {
    return (
      <div className="rounded-md border bg-muted/30 p-3">
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: BRAND }} />
          <span>Thank you — recorded and sealed.</span>
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <div className="space-y-2">
        <p className="text-sm font-medium">{item.question}</p>

        <div className="grid grid-cols-5 gap-1">
          {ANCHORS.map((a) => (
            <button
              key={a.value}
              type="button"
              onClick={() => send(a.value, false)}
              className="flex flex-col items-center gap-0.5 rounded-md border border-input bg-background px-1 py-1.5 transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b6d41]/40"
            >
              <span className="text-sm font-semibold" style={{ color: BRAND }}>
                {a.value}
              </span>
              <span className="text-[10px] leading-tight text-muted-foreground">
                {a.label}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Sealed — at least 3 voices before anyone sees anything. Never affects you.
          </p>
          <button
            type="button"
            onClick={() => send(null, true)}
            className="shrink-0 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b6d41]/40"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
