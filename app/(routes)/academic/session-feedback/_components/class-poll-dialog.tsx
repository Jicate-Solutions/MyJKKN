'use client';
// Host poll manager for ONE class (attendanceDate + timetableId + periodId): build
// questions, open/close the live poll, and watch anonymized live tallies (k>=3
// floor). Fork of events/induction/[id]/_components/session-poll-dialog.tsx for the
// class_session context (Live Poll Engine Phase B) — do NOT edit the induction
// original; this file carries the class-only differences:
//   · keyed by ClassKey (attendanceDate/timetableId/periodId), not sessionId
//   · uses ClassPollService (class-specific create/open + shared generic engine RPCs)
//   · seeds 3 LOOP questions on first open (understood scale / free-text wordcloud /
//     checklist multi) that bridge into session_feedback — see class-poll-service.ts
//     header comment and 20260704110000_live_poll_engine_phase_b_class_session.sql.
//     Those 3 questions are locked (kind + removal); the facilitator can still add
//     extra display-only questions below them.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Plus, X, Radio, Square, Users, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  Presentation, Sparkles, Lock, BookOpen,
} from 'lucide-react';
import {
  ClassPollService,
  type ClassKey,
  type PollQuestionDraft,
  type PollQuestionKind,
  type PollTotals,
  type PollResponder,
} from '@/lib/services/live-poll/class-poll-service';
import {
  CurriculumService, FINK_OPTIONS, finkLabel,
  type CurriculumSeed, type MyTopic, type FinkDimension,
} from '@/lib/services/curriculum/curriculum-service';
import { useInductionPollRealtime } from '@/hooks/induction/use-induction-poll-realtime';
import { useChecklistConfig } from '@/hooks/use-session-feedback';
import type { ChecklistConfigItem } from '@/types/session-feedback';
// eslint-disable-next-line no-restricted-imports -- deliberate reuse: generic, pollId-keyed, no fork needed (see task contract).
import { SessionPollPresenter } from '@/app/(routes)/events/induction/[id]/_components/session-poll-presenter';

const BRAND_GREEN = '#0b6d41';

// Generate the numeric option rows for a SCALE question (labels ARE the numbers),
// preserving existing option ids by number so re-saving never orphans a voted option.
const MAX_SCALE_POINTS = 10;
function genScaleOptions(min: number, max: number, existing: { id?: string; label: string }[]) {
  const byNum = new Map(existing.map((o) => [parseInt(o.label, 10), o.id]));
  const out: { id?: string; label: string; position: number }[] = [];
  const hi = Math.min(max, min + MAX_SCALE_POINTS - 1);   // defensive backstop
  for (let n = min, i = 0; n <= hi; n += 1, i += 1) out.push({ id: byNum.get(n), label: String(n), position: i });
  return out;
}
const clampInt = (v: string, fallback: number) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : fallback; };

// The 3 loop questions, seeded when a class poll has no questions yet (first open).
// Positions 0..2; any facilitator-added extra questions start at position 3+.
function buildDefaultLoopQuestions(checklist: ChecklistConfigItem[]): PollQuestionDraft[] {
  return [
    {
      prompt: 'How well did you understand this session?',
      kind: 'scale', position: 0, loop_role: 'understood',
      scale_min: 1, scale_max: 5,
      options: [1, 2, 3, 4, 5].map((n, i) => ({ label: String(n), position: i })),
    },
    {
      prompt: 'One word about today’s class',
      kind: 'wordcloud', position: 1, loop_role: 'free_text', options: [],
    },
    {
      prompt: 'What happened in this class?',
      kind: 'multi', position: 2, loop_role: 'checklist',
      options: checklist.map((c, i) => ({ label: c.label, position: i, option_key: c.item_key })),
    },
  ];
}

// Make the seeded question set curriculum-aware when a PUBLISHED topic is linked:
// rename the understood Q1 to name the topic, and ensure the rotating Fink Q2 is
// present right after it (locked, loop_role='fink'). No topic → return unchanged
// (the generic poll, spec #13). Re-applied on re-link so the poll tracks the topic
// (#29/#30 — votes are poll-keyed, so renaming Q1 never loses answers).
function applyCurriculumQuestions(seed: CurriculumSeed | null, base: PollQuestionDraft[]): PollQuestionDraft[] {
  if (!seed?.has_topic) return base;
  let out = base.map((q) => {
    if (q.loop_role === 'understood') return { ...q, prompt: seed.q1_prompt ?? q.prompt };
    if (q.loop_role === 'fink') return {
      ...q, prompt: seed.q2_prompt ?? q.prompt,
      scale_min_label: seed.q2_min_label ?? q.scale_min_label ?? null,
      scale_max_label: seed.q2_max_label ?? q.scale_max_label ?? null,
    };
    return q;
  });
  if (!out.some((q) => q.loop_role === 'fink')) {
    const finkQ: PollQuestionDraft = {
      prompt: seed.q2_prompt ?? 'How ready do you feel to apply this?',
      kind: 'scale', position: 0, loop_role: 'fink',
      scale_min: 1, scale_max: 5,
      scale_min_label: seed.q2_min_label ?? 'Not yet',
      scale_max_label: seed.q2_max_label ?? 'Fully',
      options: [1, 2, 3, 4, 5].map((n, i) => ({ label: String(n), position: i })),
    };
    const idx = out.findIndex((q) => q.loop_role === 'understood');
    out = idx >= 0 ? [...out.slice(0, idx + 1), finkQ, ...out.slice(idx + 1)] : [finkQ, ...out];
  }
  return out.map((q, i) => ({ ...q, position: i }));
}

function LoopBadge() {
  return (
    <Badge variant="outline" className="gap-1 shrink-0 border-emerald-500/50 px-1.5 py-0 text-[10px] text-emerald-700 dark:text-emerald-400">
      <Sparkles className="h-3 w-3" /> Feeds the feedback loop
    </Badge>
  );
}

export function ClassPollDialog({
  attendanceDate, timetableId, periodId, courseLabel, trigger,
}: {
  attendanceDate: string; timetableId: string; periodId: string; courseLabel: string;
  /** Custom trigger element (asChild). Defaults to a small "Class poll" button. */
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [questions, setQuestions] = useState<PollQuestionDraft[]>([]);
  const [pollId, setPollId] = useState<string | null>(null);
  const [status, setStatus] = useState<'draft' | 'open' | 'closed'>('draft');
  const [hasVotes, setHasVotes] = useState(false);
  const [totals, setTotals] = useState<PollTotals | null>(null);
  const [responders, setResponders] = useState<PollResponder[]>([]);
  const [showResponders, setShowResponders] = useState(false);
  const [autoCloseAt, setAutoCloseAt] = useState<string | null>(null);
  const [currentQid, setCurrentQid] = useState<string | null>(null);
  const [presenting, setPresenting] = useState(false);
  const [busy, setBusy] = useState(false);
  // curriculum-aware topic (Phase 1)
  const [seed, setSeed] = useState<CurriculumSeed | null>(null);
  const [myTopics, setMyTopics] = useState<MyTopic[]>([]);
  const [topicInput, setTopicInput] = useState('');
  const [finkInput, setFinkInput] = useState<FinkDimension>('foundational');
  const [changingTopic, setChangingTopic] = useState(false);
  const [settingTopic, setSettingTopic] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: checklistConfig, isSuccess: checklistReady } = useChecklistConfig();

  const classKey: ClassKey = useMemo(
    () => ({ attendanceDate, timetableId, periodId }),
    [attendanceDate, timetableId, periodId],
  );

  const stop = () => { if (timer.current) { clearInterval(timer.current); timer.current = null; } };
  useEffect(() => stop, []);

  const load = useCallback(async () => {
    // Curriculum topic (best-effort): if a published lesson is linked to this class,
    // the poll goes curriculum-aware; any failure falls back to the generic poll (#13).
    let curSeed: CurriculumSeed | null = null;
    try {
      curSeed = await CurriculumService.pollSeed(classKey);
      setSeed(curSeed);
      setChangingTopic(false);
      if (curSeed?.course_id) {
        try { setMyTopics(await CurriculumService.myTopics(curSeed.course_id)); } catch { /* non-fatal */ }
      }
    } catch { setSeed(null); }

    try {
      const p = await ClassPollService.getPoll(classKey);
      if (p && p.questions.length > 0) {
        setPollId(p.id); setStatus(p.status); setHasVotes(p.has_votes); setAutoCloseAt(p.auto_close_at);
        setCurrentQid(p.current_question_id);
        const mapped = p.questions.map((q) => {
          const opts = q.options.map((o) => ({ id: o.id, label: o.label, position: o.position, option_key: o.option_key ?? undefined }));
          // Re-hydrate the scale range from the numeric option labels so the builder
          // shows the same min..max on re-open.
          const nums = q.kind === 'scale' ? opts.map((o) => parseInt(o.label, 10)).filter((n) => Number.isFinite(n)) : [];
          return {
            id: q.id, prompt: q.prompt, kind: q.kind, position: q.position, options: opts,
            scale_min_label: q.scale_min_label ?? null, scale_max_label: q.scale_max_label ?? null,
            loop_role: q.loop_role,
            ...(q.kind === 'scale' && nums.length
              ? { scale_min: Math.min(...nums), scale_max: Math.max(...nums) }
              : {}),
          } as PollQuestionDraft;
        });
        // If a topic is linked, keep the DRAFT poll in sync with it (renames Q1, adds
        // the Fink Q2 if missing). Existing votes are untouched — they follow the topic.
        // Skip once the poll is OPEN: the saved question set is authoritative for the
        // live counter, and we don't mutate an open poll's local list under it.
        setQuestions(p.status === 'open' ? mapped : applyCurriculumQuestions(curSeed, mapped));
        if (p.status === 'open') { await refresh(p.id); startPoll(p.id); }
      } else {
        // No poll yet (or a poll anchor with no questions) — seed the 3 loop
        // questions, made curriculum-aware if a topic is linked. Nothing is saved
        // to the server until "Save poll".
        setPollId(p?.id ?? null); setStatus(p?.status ?? 'draft'); setHasVotes(p?.has_votes ?? false);
        setAutoCloseAt(p?.auto_close_at ?? null); setCurrentQid(p?.current_question_id ?? null);
        setQuestions(applyCurriculumQuestions(curSeed, buildDefaultLoopQuestions(checklistConfig ?? [])));
      }
    } catch (e: any) { toast.error(e?.message ?? 'Could not load poll'); }
  }, [classKey, checklistConfig]);

  async function refresh(pid: string) {
    try { const t = await ClassPollService.getTotals(pid); setTotals(t);
      // Lock destructive edits the moment the first vote lands (don't wait for a
      // dialog re-open): response_count > 0 means votes exist.
      if (t && t.response_count > 0) {
        setHasVotes(true);
        // Live "who answered" roster (identity only, never ballots) behind the count.
        try { setResponders(await ClassPollService.getResponders(pid)); } catch { /* keep last */ }
      }
      if (t) setAutoCloseAt(t.auto_close_at);
      if (t && t.status !== 'open') { stop(); setStatus(t.status); } } catch { /* keep last */ }
  }
  // Resilience fallback (realtime pushes immediate refreshes on top of this).
  function startPoll(pid: string) { stop(); timer.current = setInterval(() => refresh(pid), 10000); }

  // Realtime: any vote on this poll triggers an immediate totals refetch.
  useInductionPollRealtime(open && status === 'open' && pollId ? pollId : undefined, () => { if (pollId) refresh(pollId); });

  // Wait for the checklist config to load before the first seed so the checklist
  // loop question isn't seeded empty; re-runs (harmlessly) if the config changes.
  useEffect(() => {
    if (open && checklistReady) load();
    else if (!open) { stop(); setTotals(null); setResponders([]); setShowResponders(false); }
  }, [open, checklistReady, load]);

  // builder mutations — extra (non-loop) questions only; loop questions are seeded
  // above and locked (see JSX: kind select + remove hidden when loop_role is set).
  const addQuestion = () => setQuestions((qs) => [...qs, { prompt: '', kind: 'single', position: qs.length, options: [{ label: '', position: 0 }] }]);
  const setQ = (i: number, patch: Partial<PollQuestionDraft>) => setQuestions((qs) => qs.map((q, j) => j === i ? { ...q, ...patch } : q));
  const changeKind = (i: number, kind: PollQuestionKind) => setQuestions((qs) => qs.map((q, j) => {
    if (j !== i) return q;
    if (kind === 'scale') {
      const min = q.scale_min ?? 1; const max = q.scale_max ?? 5;
      return { ...q, kind, scale_min: min, scale_max: max, options: genScaleOptions(min, max, q.options) };
    }
    if (kind === 'wordcloud') return { ...q, kind, options: [] };
    return { ...q, kind, options: q.options.length ? q.options : [{ label: '', position: 0 }] };
  }));
  const setScaleRange = (i: number, next: { min?: number; max?: number }) => setQuestions((qs) => qs.map((q, j) => {
    if (j !== i) return q;
    const min = Math.max(1, next.min ?? q.scale_min ?? 1);
    const rawMax = next.max ?? q.scale_max ?? 5;
    const max = Math.min(Math.max(min + 1, rawMax), min + MAX_SCALE_POINTS - 1);
    return { ...q, scale_min: min, scale_max: max, options: genScaleOptions(min, max, q.options) };
  }));
  const removeQ = (i: number) => setQuestions((qs) => qs.filter((_, j) => j !== i));
  const addOpt = (i: number) => setQuestions((qs) => qs.map((q, j) => j === i ? { ...q, options: [...q.options, { label: '', position: q.options.length }] } : q));
  const setOpt = (i: number, k: number, label: string) => setQuestions((qs) => qs.map((q, j) => j === i ? { ...q, options: q.options.map((o, m) => m === k ? { ...o, label } : o) } : q));
  const removeOpt = (i: number, k: number) => setQuestions((qs) => qs.map((q, j) => j === i ? { ...q, options: q.options.filter((_, m) => m !== k) } : q));

  const savePoll = async () => {
    const payload = questions
      .map((q, i) => {
        if (q.kind === 'scale') {
          const min = q.scale_min ?? 1; const max = Math.max(min, q.scale_max ?? 5);
          return {
            ...q, position: i, options: genScaleOptions(min, max, q.options),
            scale_min_label: q.scale_min_label?.trim() || null,
            scale_max_label: q.scale_max_label?.trim() || null,
          } as PollQuestionDraft;
        }
        if (q.kind === 'wordcloud') return { ...q, position: i, options: [] } as PollQuestionDraft;
        return { ...q, position: i, options: q.options.filter((o) => o.label.trim()).map((o, k) => ({ ...o, position: k })) } as PollQuestionDraft;
      })
      // loop_role questions (understood/free_text/checklist) are locked system
      // questions that feed session_feedback — never drop them. The checklist (multi)
      // loop question can legitimately have <2 options when the institution checklist
      // config is small/empty; the >=2 filter must not silently discard it (which
      // permanently broke the checklist→feedback bridge). Author-created choice
      // questions still require >=2 options.
      .filter((q) => q.prompt.trim() && (q.kind === 'wordcloud' || !!q.loop_role || q.options.length >= 2));
    if (!payload.length) { toast.error('Add at least one question (options: two for a choice question, none for a word cloud).'); return; }
    setBusy(true);
    try { const id = await ClassPollService.upsertPoll(classKey, payload); setPollId(id); toast.success('Poll saved.'); await load(); }
    catch (e: any) { toast.error(e?.message ?? 'Could not save poll'); } finally { setBusy(false); }
  };
  const openLive = async () => {
    if (!pollId) { toast.error('Save the poll first.'); return; }
    setBusy(true);
    try { await ClassPollService.openPoll(pollId); toast.success('Poll is live.'); await load(); }
    catch (e: any) { toast.error(e?.message ?? 'Could not open'); } finally { setBusy(false); }
  };
  // Coordinator flow: move the ONE question learners can see (also extends auto-close).
  const moveQuestion = async (dir: 1 | -1) => {
    if (!pollId) return;
    const ids = questions.map((q) => q.id).filter((id): id is string => !!id);
    const next = ids[ids.indexOf(currentQid ?? '') + dir];
    if (!next) return;
    setBusy(true);
    try { await ClassPollService.setCurrentQuestion(pollId, next); setCurrentQid(next); await refresh(pollId); }
    catch (e: any) { toast.error(e?.message ?? 'Could not change question'); } finally { setBusy(false); }
  };
  const closeLive = async () => { if (!pollId) return; setBusy(true); try { await ClassPollService.closePoll(pollId); stop(); setStatus('closed'); toast.success('Poll closed.'); } catch (e: any) { toast.error(e?.message ?? 'Could not close'); } finally { setBusy(false); } };

  // ── curriculum topic (Phase 1) ──
  // Reuse an already-published lesson (a past typed topic, #32) for this class.
  const linkExisting = async (lessonId: string) => {
    if (!lessonId) return;
    setSettingTopic(true);
    try {
      await CurriculumService.linkLesson(classKey, lessonId);
      toast.success('Topic set for this class.');
      await load();   // re-seeds the poll curriculum-aware; existing votes are kept (#30)
    } catch (e: any) { toast.error(e?.message ?? 'Could not set topic'); }
    finally { setSettingTopic(false); }
  };
  // Type a new one-line topic → published faculty lesson (#31), remembered (#32), linked.
  const setNewTopic = async () => {
    const title = topicInput.trim();
    if (!title || !seed?.course_id) return;
    setSettingTopic(true);
    try {
      const lessonId = await CurriculumService.typeTopic(seed.course_id, title, finkInput);
      await CurriculumService.linkLesson(classKey, lessonId);
      setTopicInput('');
      toast.success('Topic set for this class.');
      await load();
    } catch (e: any) { toast.error(e?.message ?? 'Could not set topic'); }
    finally { setSettingTopic(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" className="shrink-0" style={{ backgroundColor: BRAND_GREEN }}>
            <Radio className="mr-1.5 h-3.5 w-3.5" /> Class poll
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" style={{ color: BRAND_GREEN }}>Poll — {courseLabel}
            <Badge variant={status === 'open' ? 'default' : 'secondary'}>{status}</Badge></DialogTitle>
          <DialogDescription>Name today’s topic, build questions, open it live, and watch anonymized results (hidden until enough students answer). The locked questions can&apos;t be removed — the feedback questions feed the live loop, while the topic check-in is recorded separately.</DialogDescription>
          {status === 'open' && autoCloseAt && (
            <p className="text-xs text-amber-600 dark:text-amber-500">
              Auto-closes at {new Date(autoCloseAt).toLocaleString(undefined, { hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' })} — reopen with &quot;Open live&quot; to extend.
            </p>
          )}
        </DialogHeader>

        {/* live results when open */}
        {status === 'open' && totals && (
          <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3 space-y-3">
            <Button className="w-full" variant="default" onClick={() => setPresenting(true)} disabled={!pollId} style={{ backgroundColor: BRAND_GREEN }}>
              <Presentation className="h-4 w-4 mr-2" /> Present full screen
            </Button>
            <div className="flex items-center justify-between gap-2 rounded-md border bg-background/60 p-2">
              <Button size="sm" variant="outline" disabled={busy || !currentQid || questions.findIndex((q) => q.id === currentQid) <= 0}
                onClick={() => moveQuestion(-1)}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Previous
              </Button>
              <span className="text-xs font-medium tabular-nums">
                {currentQid
                  ? `Live: question ${questions.findIndex((q) => q.id === currentQid) + 1} of ${questions.length}`
                  : 'No question live yet'}
              </span>
              <Button size="sm" disabled={busy || !currentQid || questions.findIndex((q) => q.id === currentQid) >= questions.length - 1}
                onClick={() => moveQuestion(1)} style={{ backgroundColor: BRAND_GREEN }}>
                Next question <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
            <div className="text-xs text-muted-foreground">{totals.response_count}{totals.enrolled_count ? ` / ${totals.enrolled_count}` : ''} answered{totals.suppressed ? ' · results hidden until enough answer' : ''}</div>
            {totals.questions.map((q) => {
              const tot = q.options.reduce((a, o) => a + (o.count ?? 0), 0) || 1;
              return (
                <div key={q.id} className={`space-y-1 rounded-md p-2 ${q.id === currentQid ? 'border border-emerald-500/60 bg-emerald-500/10' : 'opacity-70'}`}>
                  <div className="text-sm font-medium flex items-center gap-2">
                    {q.prompt}
                    {q.id === currentQid && <Badge className="shrink-0">LIVE</Badge>}
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">{q.response_count} answered</span>
                  </div>
                  {q.options.map((o) => (
                    <div key={o.id} className="text-xs">
                      <div className="flex justify-between"><span>{o.label}</span><span className="tabular-nums">{o.count ?? '–'}{o.count != null ? ` (${Math.round((o.count / tot) * 100)}%)` : ''}</span></div>
                      <div className="h-1.5 rounded bg-muted"><div className="h-1.5 rounded bg-emerald-500" style={{ width: `${o.count != null ? Math.round((o.count / tot) * 100) : 0}%` }} /></div>
                    </div>
                  ))}
                </div>
              );
            })}

            {responders.length > 0 && (
              <div className="border-t border-emerald-500/30 pt-2">
                <button type="button" onClick={() => setShowResponders((v) => !v)}
                  className="flex w-full items-center justify-between text-xs font-medium hover:opacity-80">
                  <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> Who answered ({responders.length})</span>
                  {showResponders ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
                {showResponders && (
                  <div className="mt-2 max-h-48 overflow-y-auto space-y-1">
                    {responders.map((r) => (
                      <div key={r.learner_id} className="flex items-center justify-between text-xs rounded bg-background/60 px-2 py-1">
                        <span className="truncate">
                          <span className="font-medium tabular-nums">{r.register_number || r.roll_number || '—'}</span>
                          <span className="text-muted-foreground"> · {r.learner_name || 'Unnamed'}</span>
                        </span>
                        <span className="text-muted-foreground shrink-0 pl-2 tabular-nums">
                          {r.questions_answered}q · {new Date(r.answered_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Today's topic (curriculum-aware, Phase 1) */}
        <div className="rounded-md border p-3 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium" style={{ color: BRAND_GREEN }}>
            <BookOpen className="h-4 w-4" /> Today’s topic
          </div>
          {status === 'open' && (
            <p className="text-[11px] text-amber-600 dark:text-amber-500">
              The poll is live: changing the topic updates what’s shown here, but the live poll question keeps its current wording until you close and reopen the poll.
            </p>
          )}
          {seed?.has_topic && !changingTopic ? (
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm">
                <span className="font-medium">{seed.lesson_title}</span>
                {seed.primary_fink_dimension && (
                  <Badge variant="outline" className="ml-2 text-[10px]">{finkLabel(seed.primary_fink_dimension)}</Badge>
                )}
              </div>
              <Button size="sm" variant="ghost" onClick={() => setChangingTopic(true)}>Change</Button>
            </div>
          ) : (
            <div className="space-y-2">
              {!seed?.course_id && (
                <p className="text-xs text-muted-foreground">This class isn’t linked to a course, so a topic can’t be set here.</p>
              )}
              {myTopics.length > 0 && (
                <Select disabled={settingTopic || !seed?.course_id} onValueChange={(id) => linkExisting(id)}>
                  <SelectTrigger><SelectValue placeholder="Reuse a past topic…" /></SelectTrigger>
                  <SelectContent>
                    {myTopics.map((t) => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              <div className="flex gap-2">
                <Input placeholder="Type today’s topic (e.g. Binary Trees)" value={topicInput}
                  onChange={(e) => setTopicInput(e.target.value)} disabled={settingTopic || !seed?.course_id} />
                <Select value={finkInput} disabled={settingTopic || !seed?.course_id}
                  onValueChange={(v) => setFinkInput(v as FinkDimension)}>
                  <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FINK_OPTIONS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="sm" onClick={setNewTopic} disabled={settingTopic || !topicInput.trim() || !seed?.course_id}
                  style={{ backgroundColor: BRAND_GREEN }}>Set</Button>
              </div>
              {seed?.has_topic && changingTopic && (
                <Button size="sm" variant="ghost" onClick={() => setChangingTopic(false)}>Cancel</Button>
              )}
              <p className="text-[11px] text-muted-foreground">
                Naming the topic makes the poll ask about today’s actual lesson. Confidential — students and classmates see only the class total.
              </p>
            </div>
          )}
        </div>

        {/* builder */}
        <div className="space-y-3">
          {questions.map((q, i) => {
            const locked = !!q.loop_role;
            return (
              <div key={q.id ?? i} className={`rounded-md border p-2 space-y-2 ${locked ? 'border-emerald-500/40 bg-emerald-500/5' : ''}`}>
                <div className="flex gap-2 items-center">
                  <Input placeholder="Question" value={q.prompt} onChange={(e) => setQ(i, { prompt: e.target.value })} />
                  {locked
                    ? <LoopBadge />
                    : (
                      <Select value={q.kind} onValueChange={(v) => changeKind(i, v as PollQuestionKind)} disabled={hasVotes}>
                        <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="single">Pick one</SelectItem>
                          <SelectItem value="multi">Pick many</SelectItem>
                          <SelectItem value="scale">Rating scale</SelectItem>
                          <SelectItem value="wordcloud">Word cloud</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  {!locked && (
                    <Button size="icon" variant="ghost" disabled={hasVotes} onClick={() => removeQ(i)}><X className="h-4 w-4" /></Button>
                  )}
                </div>

                {q.kind === 'wordcloud' ? (
                  <p className="pl-3 text-xs text-muted-foreground">Learners type one word or short phrase — the most-common answers grow largest. No options to set.</p>
                ) : q.kind === 'scale' ? (
                  (q.loop_role === 'understood' || q.loop_role === 'fink') ? (
                    <div className="space-y-2 pl-3">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Lock className="h-3.5 w-3.5" /> {q.loop_role === 'fink'
                          ? 'Curriculum check-in about today’s topic — scale locked at 1–5.'
                          : 'Scale locked at 1–5 so it maps cleanly into the feedback loop.'}
                      </div>
                      <div className="flex gap-2">
                        <Input placeholder="Low label (optional, e.g. Lost)" value={q.scale_min_label ?? ''}
                          onChange={(e) => setQ(i, { scale_min_label: e.target.value })} />
                        <Input placeholder="High label (optional, e.g. Clear)" value={q.scale_max_label ?? ''}
                          onChange={(e) => setQ(i, { scale_max_label: e.target.value })} />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2 pl-3">
                      <div className="flex items-center gap-2 text-sm">
                        <Label className="text-xs text-muted-foreground">From</Label>
                        <Input type="number" className="w-16" value={q.scale_min ?? 1} disabled={hasVotes}
                          onChange={(e) => setScaleRange(i, { min: clampInt(e.target.value, 1) })} />
                        <Label className="text-xs text-muted-foreground">to</Label>
                        <Input type="number" className="w-16" value={q.scale_max ?? 5} disabled={hasVotes}
                          onChange={(e) => setScaleRange(i, { max: clampInt(e.target.value, 5) })} />
                        <span className="text-xs text-muted-foreground">
                          {`${(q.scale_max ?? 5) - (q.scale_min ?? 1) + 1} points`}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <Input placeholder="Low label (optional, e.g. Strongly disagree)" value={q.scale_min_label ?? ''}
                          onChange={(e) => setQ(i, { scale_min_label: e.target.value })} />
                        <Input placeholder="High label (optional, e.g. Strongly agree)" value={q.scale_max_label ?? ''}
                          onChange={(e) => setQ(i, { scale_max_label: e.target.value })} />
                      </div>
                    </div>
                  )
                ) : q.loop_role === 'checklist' ? (
                  <>
                    <p className="pl-3 text-xs text-muted-foreground">Options come from the checklist configured for this institution.</p>
                    {q.options.map((o, k) => (
                      <div key={o.id ?? k} className="flex gap-2 pl-3">
                        <Input value={o.label} onChange={(e) => setOpt(i, k, e.target.value)} />
                      </div>
                    ))}
                  </>
                ) : (
                  <>
                    {q.options.map((o, k) => (
                      <div key={o.id ?? k} className="flex gap-2 pl-3">
                        <Input placeholder={`Option ${k + 1}`} value={o.label} onChange={(e) => setOpt(i, k, e.target.value)} />
                        <Button size="icon" variant="ghost" disabled={hasVotes} onClick={() => removeOpt(i, k)}><X className="h-4 w-4" /></Button>
                      </div>
                    ))}
                    <Button size="sm" variant="ghost" onClick={() => addOpt(i)}><Plus className="h-3.5 w-3.5 mr-1" /> Option</Button>
                  </>
                )}
              </div>
            );
          })}
          <Button size="sm" variant="outline" onClick={addQuestion}><Plus className="h-4 w-4 mr-1" /> Add question</Button>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={savePoll} disabled={busy}>Save poll</Button>
          {status !== 'open'
            ? <Button onClick={openLive} disabled={busy || !pollId} style={{ backgroundColor: BRAND_GREEN }}><Radio className="h-4 w-4 mr-1" /> Open live</Button>
            : <Button variant="secondary" onClick={closeLive} disabled={busy}><Square className="h-4 w-4 mr-1" /> Close</Button>}
        </DialogFooter>

        {presenting && pollId && (
          <SessionPollPresenter
            pollId={pollId}
            sessionTitle={courseLabel}
            questionOrder={questions.map((q) => q.id).filter((id): id is string => !!id)}
            initialQuestionId={currentQid}
            onQuestionChange={setCurrentQid}
            onClose={() => { setPresenting(false); if (pollId) refresh(pollId); }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
