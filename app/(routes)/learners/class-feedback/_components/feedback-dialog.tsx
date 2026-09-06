'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { BeatLoader } from 'react-spinners';
import { CheckCircle2, EyeOff, ShieldCheck, History } from 'lucide-react';
import {
  useChecklistConfig,
  useSubmitFeedback,
  useCarryforward,
} from '@/hooks/use-session-feedback';
import { SessionFeedbackService } from '@/lib/services/session-feedback-service';
import type { PendingSession } from '@/types/session-feedback';
import {
  NOTEBOOKLM_FEATURES,
  NBLM_NONE_KEY,
} from '@/lib/session-feedback/notebooklm-features';
import { ClarificationTouchpoint } from './clarification-touchpoint';
import { ClarificationFollowupCard } from './clarification-followup-card';
import { ClassroomPracticeMicro } from './classroom-practice-micro';

const BRAND = '#0b6d41';

// Words for a 1..5 understanding rating, matching UNDERSTOOD_SCALE — so the personalised
// carry-forward re-ask shows the learner the SAME label they tapped last time.
const UNDERSTOOD_WORD: Record<number, string> = {
  1: 'Lost',
  2: 'Shaky',
  3: 'OK',
  4: 'Good',
  5: 'Clear',
};

/** Short, human date like "Tue 24 Jun" for the prior-session reference. */
function formatPriorDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

// 1–5 understanding scale. Lowest = "Lost", highest = "Crystal clear".
const UNDERSTOOD_SCALE: { value: number; label: string }[] = [
  { value: 1, label: 'Lost' },
  { value: 2, label: 'Shaky' },
  { value: 3, label: 'OK' },
  { value: 4, label: 'Good' },
  { value: 5, label: 'Clear' },
];

// 3-way answer to the carry-forward re-ask. Rides into p_free_text on submit.
const CARRYFORWARD_CHOICES = ['Yes', 'Partly', 'No'] as const;
type CarryforwardChoice = (typeof CARRYFORWARD_CHOICES)[number];

// ── Attention check (Director interview, 2026-07-09 07:15) ──────────────────
// Roughly 1 in 7 dialog opens ask "which class is this?" before the form shows:
// the real course plus two decoys drawn from the learner's OTHER pending course
// labels. Catches autopilot (blind-tapping 5/Clear down the pending list), and
// nothing more: NO storage, NO punishment — a wrong tap just lets you try
// again, and closing the dialog is never blocked. Purely client-side. The check
// is SKIPPED entirely when the learner has fewer than 3 distinct pending
// courses (fewer than 2 distinct decoys can't disguise the answer — the check
// would be theater).
const ATTENTION_CHECK_RATE = 1 / 7;

/** Unbiased in-place Fisher–Yates; returns a new array. */
function shuffle<T>(input: T[]): T[] {
  const a = [...input];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface FeedbackDialogProps {
  /** The pending session being confirmed; null = dialog closed. */
  session: PendingSession | null;
  onOpenChange: (open: boolean) => void;
  /** Capture channel — 'live_poll' when answering an in-class Live Pulse. Default 'async'. */
  source?: 'async' | 'live_poll';
  /**
   * The learner's full pending list — the decoy pool for the occasional
   * attention check. Optional: absent (e.g. live-poll opens) → no check.
   */
  pendingSessions?: PendingSession[];
}

export function FeedbackDialog({
  session,
  onOpenChange,
  source = 'async',
  pendingSessions,
}: FeedbackDialogProps) {
  const { data: checklistConfig, isLoading: loadingChecklist } = useChecklistConfig();
  const { data: carryforward } = useCarryforward();
  const submit = useSubmitFeedback();

  const [understood, setUnderstood] = useState<number | null>(null);
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [freeText, setFreeText] = useState('');
  const [cfChoice, setCfChoice] = useState<CarryforwardChoice | null>(null);
  // Free-text follow-ups (2026-07-19): per-concern Yes/Partly/No, keyed by
  // scf_freetext_carry id. Answering is optional — unanswered items simply
  // re-appear at the next check-in for this course (Director decision 3).
  const [concernAnswers, setConcernAnswers] = useState<Record<string, CarryforwardChoice>>({});

  // Attention check: shuffled options for THIS open (null = no check rolled),
  // whether it's been passed, and the last wrong tap (gentle inline feedback).
  const [attnOptions, setAttnOptions] = useState<string[] | null>(null);
  const [attnPassed, setAttnPassed] = useState(true);
  const [attnWrong, setAttnWrong] = useState<string | null>(null);

  // Post-feedback confirmation moment (Lane C): after a successful submit the
  // dialog swaps to a small "attendance confirmed" step carrying the
  // clarification-request touchpoint, instead of closing immediately.
  const [postSubmit, setPostSubmit] = useState(false);

  // Decoy pool via a latest-ref (skeptic review HIGH, 2026-07-09): the reset
  // effect below must fire ONLY on session identity. With pendingSessions in
  // its deps, a background refetch that changes the pending list (e.g. a
  // session expiring past its 48h window, or refetchOnWindowFocus after a
  // tab switch) would re-fire the reset MID-ENTRY — wiping the learner's
  // half-entered feedback and possibly re-injecting a fresh attention check.
  // The ref is updated in its own effect (declared before the reset effect,
  // so commit order keeps it current) without ever being a reactive dep.
  const pendingRef = useRef<PendingSession[] | undefined>(pendingSessions);
  useEffect(() => {
    pendingRef.current = pendingSessions;
  }, [pendingSessions]);

  // Reset the form whenever a new session is opened.
  useEffect(() => {
    if (session) {
      setUnderstood(null);
      setChecklist({});
      setFreeText('');
      setCfChoice(null);
      setConcernAnswers({});
      setPostSubmit(false);

      // Roll the occasional attention check for this open. Re-rolls on every
      // open by design — deliberately stateless (no storage, no punishment).
      const realLabel = session.course_name || session.course_code || '';
      const decoyPool = Array.from(
        new Set(
          (pendingRef.current ?? [])
            .map((p) => p.course_name || p.course_code || '')
            .filter((l) => l && l !== realLabel),
        ),
      );
      if (realLabel && decoyPool.length >= 2 && Math.random() < ATTENTION_CHECK_RATE) {
        setAttnOptions(shuffle([realLabel, ...shuffle(decoyPool).slice(0, 2)]));
        setAttnPassed(false);
      } else {
        setAttnOptions(null);
        setAttnPassed(true);
      }
      setAttnWrong(null);
    }
  }, [session]);

  // Rank 2 (2026-07-24): the saturated `notebooklm_used` yes/no is retired — hidden here
  // client-side (so it disappears even before the deactivation migration applies) and
  // replaced by the NotebookLM feature multi-select below. Historical rows keep the key.
  const items = useMemo(
    () => (checklistConfig ?? []).filter((i) => i.item_key !== 'notebooklm_used'),
    [checklistConfig],
  );

  // The carry-forward re-ask for THIS session: a prior same-course session the
  // learner flagged. Match by timetable_id + period_id + course_code.
  const carry = useMemo(() => {
    if (!session?.course_code) return null;
    return (
      (carryforward ?? []).find(
        (c) =>
          c.timetable_id === session.timetable_id &&
          c.period_id === session.period_id &&
          c.course_code === session.course_code,
      ) ?? null
    );
  }, [carryforward, session]);

  // Map prior unmet checklist item_keys to their human labels (fall back to key).
  // Drop `notebooklm_used` — it's retired (Rank 2). Until the deactivation migration
  // applies, the carry-forward RPC may still return it as "unmet"; we never show it.
  const carryItemLabels = useMemo(() => {
    if (!carry) return [];
    const byKey = new Map(items.map((i) => [i.item_key, i.label]));
    return carry.prior_unmet_items
      .filter((k) => k !== 'notebooklm_used')
      .map((k) => byKey.get(k) ?? k);
  }, [carry, items]);

  // The learner's OWN prior rating + when, for the personalised re-ask. (#2)
  const priorWord =
    carry && carry.prior_understood !== null
      ? (UNDERSTOOD_WORD[carry.prior_understood] ?? null)
      : null;
  const priorDate = formatPriorDate(carry?.prior_session_date);
  // A concerns-only carry row (decision 8: words carry even from a happy
  // check-in) has NO checklist/rating side — the legacy intro must not render
  // its "you said you were lost" fallback for it.
  const hasChecklistCarry = Boolean(carry && carry.prior_session_date !== null);
  const openConcerns = carry?.prior_concerns ?? [];

  const open = session !== null;

  const courseLabel =
    session?.course_name || session?.course_code || 'Class session';
  const periodLabel = session?.period_name || session?.start_time || null;

  // NotebookLM feature multi-select (Rank 2). "None" and the features are mutually
  // exclusive: ticking a feature clears "None"; ticking "None" clears every feature.
  // All ride in the existing `checklist` state under reserved `nblm:*` keys.
  function toggleNblmFeature(key: string, on: boolean) {
    setChecklist((prev) => ({
      ...prev,
      [key]: on,
      ...(on ? { [NBLM_NONE_KEY]: false } : {}),
    }));
  }
  function toggleNblmNone(on: boolean) {
    setChecklist((prev) => {
      const next: Record<string, boolean> = { ...prev, [NBLM_NONE_KEY]: on };
      if (on) for (const f of NOTEBOOKLM_FEATURES) next[f.key] = false;
      return next;
    });
  }

  async function handleSubmit() {
    if (!session) return;
    if (!attnPassed) return; // form is gated behind the attention check
    if (understood === null) {
      toast.error('Pick how well you understood the class.');
      return;
    }
    // Ride the carry-forward answer (if any) into p_free_text as a prefixed line —
    // keeps the fn_scf_submit_feedback signature unchanged.
    const trimmed = freeText.trim();
    let payloadText: string | null = trimmed ? trimmed : null;
    const prefixes: string[] = [];
    if (carry && hasChecklistCarry && cfChoice) {
      prefixes.push(`[carry-forward: ${cfChoice}]`);
    }
    // Free-text follow-up answers ride the same way (track-both: the marker
    // keeps the corpus readable, fn_scf_answer_freetext_carry below stores the
    // structured answer the counts card reads).
    const answeredConcerns = (carry?.prior_concerns ?? []).filter((c) => concernAnswers[c.id]);
    for (const c of answeredConcerns) {
      prefixes.push(`[freetext-carry "${c.summary.slice(0, 40)}": ${concernAnswers[c.id]}]`);
    }
    if (prefixes.length > 0) {
      const prefix = `${prefixes.join(' ')} `;
      payloadText = trimmed ? `${prefix}${trimmed}` : prefix.trim();
    }
    try {
      await submit.mutateAsync({
        attendanceDate: session.attendance_date,
        timetableId: session.timetable_id,
        periodId: session.period_id,
        understood,
        checklist,
        freeText: payloadText,
        source,
      });
      // Structured answers + praise ack — best-effort AFTER the main submit
      // (a failed stamp must never cost the learner their confirmation; the
      // item simply re-appears next time).
      const stamps: Array<Promise<void>> = answeredConcerns.map((c) =>
        SessionFeedbackService.answerFreetextCarry(c.id, concernAnswers[c.id]),
      );
      if (carry?.prior_praise) {
        stamps.push(SessionFeedbackService.answerFreetextCarry(carry.prior_praise.id, 'Seen'));
      }
      if (stamps.length > 0) {
        void Promise.allSettled(stamps).then((results) => {
          results.forEach((r) => {
            if (r.status === 'rejected') {
              console.warn('[class-feedback] follow-up stamp failed:', r.reason);
            }
          });
        });
      }
      toast.success('Thanks! Your attendance for this class is now confirmed.');
      // Stay open on the confirmation step (Lane C): the one moment the learner
      // can record "I asked for a re-explanation" + what happened. Done closes.
      setPostSubmit(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not submit feedback.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onOpenChange(false)}>
      <DialogContent className="flex max-h-[85dvh] w-[calc(100%-2rem)] flex-col rounded-lg sm:max-w-md">
        <DialogHeader className="shrink-0">
          <DialogTitle style={{ color: BRAND }}>{courseLabel}</DialogTitle>
          <DialogDescription>
            {[
              session?.course_code && session.course_name ? session.course_code : null,
              session?.faculty_name,
              periodLabel,
            ]
              .filter(Boolean)
              .join(' · ') || 'Quick feedback — takes about 10 seconds.'}
          </DialogDescription>
        </DialogHeader>

        {/* Scroll container: the dialog is height-capped (max-h above), so the
            body scrolls while header/footer stay pinned — critical on mobile
            where the full form is taller than the viewport. The -mx-1/px-1
            pair keeps focus rings from being clipped by overflow. */}
        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto overscroll-contain px-1">
        {/* Post-feedback confirmation moment (Lane C): attendance is confirmed;
            the ONLY extra affordance is the clarification-request touchpoint. */}
        {postSubmit && session ? (
          <div className="space-y-4 py-2">
            <p className="flex items-start gap-2 text-sm">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" style={{ color: BRAND }} />
              <span>
                <span className="font-medium">Feedback received</span> — your attendance for
                this class is confirmed.
              </span>
            </p>
            <ClarificationTouchpoint
              attendanceDate={session.attendance_date}
              timetableId={session.timetable_id}
              periodId={session.period_id}
            />
            {/* Two-sided close — the learner's own "did it help?" follow-up,
                due only when a lead recorded an act on one of THEIR pending
                asks. ⚠️ ONE-TAP INVARIANT AS AMENDED (Director, 2026-07-30,
                deliberate — do not "fix" back): when both this follow-up AND
                the practice question below are due, the learner sees BOTH,
                follow-up FIRST. The cap is one rotation question + (when due)
                the learner's own follow-up. */}
            <ClarificationFollowupCard />
            {/* Classroom Practice L2 — at most ONE sealed micro-item, and only
                when the server has one to give. Renders nothing otherwise, and
                cannot affect the submit or close flow above. */}
            <ClassroomPracticeMicro
              attendanceDate={session.attendance_date}
              timetableId={session.timetable_id}
              periodId={session.period_id}
            />
          </div>
        ) : !attnPassed && attnOptions ? (
          /* Attention check gate — the form stays hidden until the correct tap.
             Wrong taps only mark the option and invite another try; Cancel below
             always works (no punishment). */
          <div className="space-y-3 py-2">
            <p className="text-sm font-medium">
              Quick check — which class are you giving feedback for?
            </p>
            <p className="text-xs text-muted-foreground">
              Just making sure the right class gets your answer.
            </p>
            <div className="space-y-2">
              {attnOptions.map((opt) => {
                const isWrongTap = attnWrong === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      if (opt === courseLabel) {
                        setAttnPassed(true);
                        setAttnWrong(null);
                      } else {
                        setAttnWrong(opt);
                      }
                    }}
                    className={`w-full rounded-md border px-3 py-2.5 text-left text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b6d41]/40 ${
                      isWrongTap
                        ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400'
                        : 'border-input bg-background hover:bg-muted'
                    }`}
                  >
                    {opt}
                    {isWrongTap && (
                      <span className="mt-0.5 block text-xs font-normal">
                        Not this one — check the class name at the top, then try again.
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
        <div className="space-y-5 py-1">
          {/* Carry-forward re-ask: last time you took this course, you flagged X. */}
          {carry && (
            <div className="rounded-md border border-[#0b6d41]/30 bg-[#fbfbee]/60 dark:bg-muted/40 p-3 space-y-2.5">
              {hasChecklistCarry && (
                <>
                  <div className="flex items-start gap-2">
                    <History className="mt-0.5 h-4 w-4 shrink-0" style={{ color: BRAND }} />
                    <p className="text-sm leading-snug">
                      Last <span className="font-medium">{carry.course_name || carry.course_code}</span>
                      {priorDate ? (
                        <> on <span className="font-medium">{priorDate}</span></>
                      ) : null}
                      {priorWord ? (
                        <>
                          , you rated it{' '}
                          <span className="font-medium">
                            {carry.prior_understood}/5 · {priorWord}
                          </span>
                        </>
                      ) : null}
                      {carryItemLabels.length > 0 ? (
                        // The unmet labels are positively-phrased statements the
                        // learner did NOT tick — say "missing" or the banner
                        // reads backwards (Director-confirmed fix, 2026-07-19,
                        // off a live screenshot of the inverted reading).
                        <>
                          {priorWord ? ' and flagged these as missing: ' : ': you flagged these as missing: '}
                          <span className="font-medium">{carryItemLabels.join(', ')}</span>
                        </>
                      ) : !priorWord ? (
                        <> you said you were lost</>
                      ) : null}
                      {' '}— clearer for you this time?
                    </p>
                  </div>

                  <div className="flex gap-2">
                    {CARRYFORWARD_CHOICES.map((choice) => {
                      const selected = cfChoice === choice;
                      return (
                        <button
                          key={choice}
                          type="button"
                          onClick={() => setCfChoice(choice)}
                          aria-pressed={selected}
                          className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b6d41]/40 ${
                            selected
                              ? 'border-[#0b6d41] bg-[#0b6d41] text-white'
                              : 'border-input bg-background hover:bg-muted'
                          }`}
                        >
                          {choice}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {/* Free-text follow-ups (2026-07-19): the learner's OWN prior words,
                  AI-summarized, asked back privately — one 3-way answer each.
                  Answering is optional; unanswered items return next check-in. */}
              {openConcerns.map((concern) => (
                <div key={concern.id} className="space-y-1.5">
                  <p className="text-sm leading-snug">
                    You mentioned: <span className="font-medium">&ldquo;{concern.summary}&rdquo;</span>
                    {' '}— better this time?
                  </p>
                  <div className="flex gap-2">
                    {CARRYFORWARD_CHOICES.map((choice) => {
                      const selected = concernAnswers[concern.id] === choice;
                      return (
                        <button
                          key={choice}
                          type="button"
                          onClick={() =>
                            setConcernAnswers((prev) => ({ ...prev, [concern.id]: choice }))
                          }
                          aria-pressed={selected}
                          className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b6d41]/40 ${
                            selected
                              ? 'border-[#0b6d41] bg-[#0b6d41] text-white'
                              : 'border-input bg-background hover:bg-muted'
                          }`}
                        >
                          {choice}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              {carry.prior_praise && (
                <p className="text-sm leading-snug text-muted-foreground">
                  Last time you said: <span className="font-medium">&ldquo;{carry.prior_praise.summary}&rdquo;</span>
                  {' '}— glad that worked for you.
                </p>
              )}
            </div>
          )}

          {/* Anonymity — say it where the fear bites, right before the rating.
              (Director 2026-07-14: ratings cluster at 4; learners may fear
              being identified.) TRUE by construction: Senior Learners read
              aggregates via SECDEF fns only; raw rows are RLS'd to the learner
              + platform admin; free-text reaches staff without names attached.
              Terminology: "Senior Learners" is JKKN's term for the teaching
              role — Director ruling 2026-07-14 ("Senior Learners everywhere"),
              superseding the facilitators-in-writing encoding of Jun 29. */}
          <p className="flex items-start gap-1.5 rounded-md px-2.5 py-2 text-xs"
             style={{ backgroundColor: 'rgba(11,109,65,0.06)' }}>
            <EyeOff className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: BRAND }} />
            <span>
              <span className="font-semibold">Anonymous to your Senior Learners.</span>{' '}
              They see session totals only — never your name with your answer.
              Answer honestly; that is what improves the sessions.
            </span>
          </p>

          {/* Understanding 1–5 */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">How well did you understand?</Label>
            <div className="flex gap-2">
              {UNDERSTOOD_SCALE.map((opt) => {
                const selected = understood === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setUnderstood(opt.value)}
                    aria-pressed={selected}
                    className={`flex-1 flex flex-col items-center justify-center gap-0.5 rounded-md border px-1 py-2 text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0b6d41]/40 ${
                      selected
                        ? 'border-[#0b6d41] bg-[#0b6d41] text-white'
                        : 'border-input bg-background hover:bg-muted'
                    }`}
                  >
                    <span className="text-base font-semibold leading-none">{opt.value}</span>
                    <span className={selected ? 'text-white/90' : 'text-muted-foreground'}>
                      {opt.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Checklist */}
          {loadingChecklist ? (
            <div className="flex justify-center py-2">
              <BeatLoader color={BRAND} size={8} />
            </div>
          ) : items.length > 0 ? (
            <div className="space-y-3">
              <Label className="text-sm font-medium">In this class…</Label>
              <div className="space-y-2.5">
                {items.map((item) => {
                  const checked = !!checklist[item.item_key];
                  return (
                    <div key={item.id} className="flex items-start gap-2.5">
                      <Checkbox
                        id={`scf-${item.item_key}`}
                        checked={checked}
                        onCheckedChange={(v) =>
                          setChecklist((prev) => ({ ...prev, [item.item_key]: v === true }))
                        }
                        className="mt-0.5"
                      />
                      <Label
                        htmlFor={`scf-${item.item_key}`}
                        className="text-sm font-normal leading-snug cursor-pointer"
                      >
                        {item.label}
                      </Label>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* NotebookLM materials used (Rank 2) — replaces the saturated yes/no.
              Stored under reserved nblm:* checklist keys; never a config/unmet item. */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">
              Which NotebookLM materials did you use this session?{' '}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
              {NOTEBOOKLM_FEATURES.map((f) => {
                const checked = !!checklist[f.key];
                return (
                  <div key={f.key} className="flex items-start gap-2.5">
                    <Checkbox
                      id={`scf-${f.key}`}
                      checked={checked}
                      onCheckedChange={(v) => toggleNblmFeature(f.key, v === true)}
                      className="mt-0.5"
                    />
                    <Label
                      htmlFor={`scf-${f.key}`}
                      className="cursor-pointer text-sm font-normal leading-snug"
                    >
                      {f.label}
                    </Label>
                  </div>
                );
              })}
            </div>
            <div className="flex items-start gap-2.5 border-t pt-2.5">
              <Checkbox
                id="scf-nblm-none"
                checked={!!checklist[NBLM_NONE_KEY]}
                onCheckedChange={(v) => toggleNblmNone(v === true)}
                className="mt-0.5"
              />
              <Label
                htmlFor="scf-nblm-none"
                className="cursor-pointer text-sm font-normal leading-snug text-muted-foreground"
              >
                No NotebookLM this session
              </Label>
            </div>
          </div>

          {/* Free text */}
          <div className="space-y-2">
            <Label htmlFor="scf-free-text" className="text-sm font-medium">
              Anything to add? <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea
              id="scf-free-text"
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              placeholder="A doubt, a suggestion, anything…"
              rows={2}
              className="resize-none"
            />
          </div>

          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" style={{ color: BRAND }} />
            Submitting confirms your attendance for this class.
          </p>
        </div>
        )}
        </div>

        <DialogFooter className="shrink-0 gap-2 sm:gap-0">
          {postSubmit ? (
            <Button
              type="button"
              onClick={() => onOpenChange(false)}
              className="bg-[#0b6d41] hover:bg-[#0b6d41]/90"
            >
              Done
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submit.isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={submit.isPending || !attnPassed}
                className="bg-[#0b6d41] hover:bg-[#0b6d41]/90"
              >
                {submit.isPending ? (
                  <BeatLoader color="#ffffff" size={8} />
                ) : (
                  <>
                    <CheckCircle2 className="mr-1.5 h-4 w-4" />
                    Confirm & submit
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
