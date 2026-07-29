'use client';

// Classroom Practice L2 — ONE sealed micro-item, shown only at the post-submit
// confirmation moment inside the FeedbackDialog, riding alongside the Lane C
// clarification touchpoint.
//
// RATIFIED INVARIANTS enforced here (substrate: 20260729184500):
//   • ONE item per submission — the server records the offer and refuses a
//     second for the same session, so this component cannot double-ask.
//   • ALWAYS SKIPPABLE — Skip is a first-class recorded answer.
//   • NEVER BLOCKING — nothing here can fail loudly. No toasts, no thrown
//     errors, no interference with closing the dialog. While loading, and on
//     any failure at all, this renders NOTHING: zero footprint.
//   • The 0-4 anchors match the CARRE participant scale used everywhere else.

import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useAnswerMicroItem, useMicroItem } from '@/hooks/use-classroom-practice-micro';

const BRAND = '#0b6d41';

// 0-4 with plain anchors. Same scale as the sealed participant lane.
const ANCHORS: { value: number; label: string }[] = [
  { value: 0, label: 'Never' },
  { value: 1, label: 'Rarely' },
  { value: 2, label: 'Sometimes' },
  { value: 3, label: 'Usually' },
  { value: 4, label: 'Always' },
];

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
  const [done, setDone] = useState(false);

  // Zero footprint while we do not yet know, and forever if there is nothing
  // to ask. No spinner: this must never look like something the learner is
  // waiting on.
  if (isLoading || !item) return null;

  if (done) {
    return (
      <div className="rounded-md border bg-muted/30 p-3">
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: BRAND }} />
          <span>Thank you — recorded and sealed.</span>
        </p>
      </div>
    );
  }

  // Every outcome lands in the same quiet thanks state. A failure to record is
  // deliberately indistinguishable to the learner (invariant: never blocking,
  // never alarming) — the miss is visible to leadership in fn_scf_micro_health.
  const send = (score: number | null, skip: boolean) => {
    setDone(true);
    answer.mutate({ impressionId: item.impression_id, score, skip });
  };

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
