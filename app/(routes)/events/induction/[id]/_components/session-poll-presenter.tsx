'use client';
// Full-screen presenter mode for a live induction session poll — the projector
// view. Deliberately a dark "stage" surface in BOTH app themes (high-contrast
// text on low-emission background for bright rooms). Shows ONE question at a
// time with live horizontal result bars (labels + counts always visible,
// authoring order kept stable while votes tick in), a big "answered" KPI, and
// a final overall-statistics summary after the last question. Prev/Next here
// IS the coordinator control: it moves current_question_id, so every learner
// screen follows. Learner identities are never shown on this surface — the
// "Who answered" roster stays in the small coordinator dialog only.
// Keyboard: ← / → navigate (clicker-friendly), Esc closes.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Users, BarChart3, Maximize, Minimize } from 'lucide-react';
import { InductionPollService, type PollTotals } from '@/lib/services/induction/induction-poll-service';
import { useInductionPollRealtime } from '@/hooks/induction/use-induction-poll-realtime';

const REFRESH_MS = 10000;                // fallback poll; realtime pushes immediate refreshes
const WORDCLOUD_MIN_FREQ = 3;            // k>=3 anonymity floor: only project words >=3 people typed
const WORDCLOUD_UNLOCK = 3;              // question-level "hidden until 3 responses" gate

type PollQuestion = PollTotals['questions'][number];

function pct(count: number, total: number) { return total > 0 ? Math.round((count / total) * 100) : 0; }

// SCALE: weighted average of the numeric option labels + a per-number distribution.
function ScaleResult({ q, big }: { q: PollQuestion; big: boolean }) {
  const rows = q.options.map((o) => ({ id: o.id, n: parseInt(o.label, 10), label: o.label, count: o.count ?? 0 }));
  const total = rows.reduce((a, r) => a + r.count, 0);
  const weighted = rows.reduce((a, r) => a + (Number.isFinite(r.n) ? r.n * r.count : 0), 0);
  const avg = total > 0 ? weighted / total : 0;
  const max = Math.max(...rows.map((r) => r.count), 0);
  return (
    <div className={big ? 'space-y-6' : 'space-y-3'}>
      <div className="flex items-end gap-3">
        <span className={`${big ? 'text-6xl md:text-8xl' : 'text-3xl'} font-bold tabular-nums text-emerald-300`}>
          {total > 0 ? avg.toFixed(1) : '–'}
        </span>
        <span className={`${big ? 'text-lg md:text-2xl' : 'text-sm'} pb-1 text-slate-400`}>avg</span>
        {(q.scale_min_label || q.scale_max_label) && (
          <span className={`${big ? 'text-sm md:text-base' : 'text-xs'} ml-auto pb-2 text-right text-slate-400`}>
            {q.scale_min_label ? <span>{rows[0]?.label} = {q.scale_min_label}</span> : null}
            {q.scale_min_label && q.scale_max_label ? <span className="mx-1">·</span> : null}
            {q.scale_max_label ? <span>{rows[rows.length - 1]?.label} = {q.scale_max_label}</span> : null}
          </span>
        )}
      </div>
      <div className={big ? 'space-y-2' : 'space-y-1.5'}>
        {rows.map((r) => {
          const leading = r.count > 0 && r.count === max;
          return (
            <div key={r.id} className={`relative overflow-hidden rounded-xl border ${leading ? 'border-emerald-400/60' : 'border-white/10'} bg-white/5`}>
              <div className={`absolute inset-y-0 left-0 ${leading ? 'bg-emerald-500/45' : 'bg-emerald-500/20'} transition-[width] duration-700 ease-out motion-reduce:transition-none`}
                style={{ width: `${pct(r.count, total)}%` }} />
              <div className={`relative flex items-center justify-between gap-4 ${big ? 'px-5 py-3' : 'px-3 py-1.5'}`}>
                <span className={`${big ? 'text-lg md:text-2xl' : 'text-sm'} font-semibold tabular-nums text-white`}>{r.label}</span>
                <span className={`${big ? 'text-lg md:text-2xl' : 'text-sm'} shrink-0 font-semibold tabular-nums text-emerald-200`}>
                  {r.count} <span className={`${big ? 'text-base md:text-lg' : 'text-xs'} text-slate-400`}>({pct(r.count, total)}%)</span>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// WORDCLOUD: font-size proportional to frequency. Respects the 3-response unlock
// gate; once unlocked shows only words answered by >=2 people.
function WordCloud({ q, big }: { q: PollQuestion; big: boolean }) {
  if (q.response_count < WORDCLOUD_UNLOCK) {
    return <div className="flex items-center justify-center py-8 text-slate-400">Collecting responses… (revealed after {WORDCLOUD_UNLOCK})</div>;
  }
  const words = q.options
    .map((o) => ({ id: o.id, label: o.label, count: o.count ?? 0 }))
    .filter((w) => w.count >= WORDCLOUD_MIN_FREQ)
    .sort((a, b) => b.count - a.count);
  if (!words.length) {
    return <div className="flex items-center justify-center py-8 text-slate-400">No repeated words yet.</div>;
  }
  const max = Math.max(...words.map((w) => w.count));
  const minPx = big ? 18 : 12; const maxPx = big ? 84 : 34;
  const sizeFor = (c: number) => (max <= 1 ? maxPx : Math.round(minPx + ((c - 1) / (max - 1)) * (maxPx - minPx)));
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 py-2">
      {words.map((w, i) => (
        <span key={w.id} title={`${w.count}`}
          className={`font-bold leading-none ${i % 3 === 0 ? 'text-emerald-300' : i % 3 === 1 ? 'text-white' : 'text-emerald-100'}`}
          style={{ fontSize: `${sizeFor(w.count)}px` }}>
          {w.label}
        </span>
      ))}
    </div>
  );
}

// Kind-aware result surface: scale / wordcloud / (single|multi via ResultBars).
function QuestionResult({ q, big }: { q: PollQuestion; big: boolean }) {
  if (q.kind === 'scale') return <ScaleResult q={q} big={big} />;
  if (q.kind === 'wordcloud') return <WordCloud q={q} big={big} />;
  return <ResultBars q={q} big={big} />;
}

function ResultBars({ q, big }: { q: PollQuestion; big: boolean }) {
  const total = q.options.reduce((a, o) => a + (o.count ?? 0), 0);
  const max = Math.max(...q.options.map((o) => o.count ?? 0), 0);
  return (
    <div className={big ? 'space-y-3' : 'space-y-1.5'}>
      {q.options.map((o) => {
        const c = o.count ?? 0;
        const leading = c > 0 && c === max;
        return (
          <div key={o.id} className={`relative overflow-hidden rounded-xl border ${leading ? 'border-emerald-400/60' : 'border-white/10'} bg-white/5`}>
            <div
              className={`absolute inset-y-0 left-0 ${leading ? 'bg-emerald-500/45' : 'bg-emerald-500/20'} transition-[width] duration-700 ease-out motion-reduce:transition-none`}
              style={{ width: `${pct(c, total)}%` }}
            />
            <div className={`relative flex items-center justify-between gap-4 ${big ? 'px-5 py-4' : 'px-3 py-2'}`}>
              <span className={`${big ? 'text-lg md:text-2xl' : 'text-sm'} font-medium text-white`}>{o.label}</span>
              <span className={`${big ? 'text-lg md:text-2xl' : 'text-sm'} shrink-0 font-semibold tabular-nums text-emerald-200`}>
                {c} <span className={`${big ? 'text-base md:text-lg' : 'text-xs'} text-slate-400`}>({pct(c, total)}%)</span>
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function SessionPollPresenter({ pollId, sessionTitle, questionOrder, initialQuestionId, onQuestionChange, onClose }: {
  pollId: string;
  sessionTitle: string;
  questionOrder: string[];               // question ids in position order
  initialQuestionId: string | null;
  onQuestionChange: (qid: string) => void;
  onClose: () => void;
}) {
  const [totals, setTotals] = useState<PollTotals | null>(null);
  const [currentQid, setCurrentQid] = useState<string | null>(initialQuestionId ?? questionOrder[0] ?? null);
  const [view, setView] = useState<'question' | 'summary'>('question');
  const [busy, setBusy] = useState(false);
  const enteredFullscreen = useRef(false);

  const idx = currentQid ? questionOrder.indexOf(currentQid) : -1;
  const total = questionOrder.length;
  const byId = useMemo(() => new Map((totals?.questions ?? []).map((q) => [q.id, q])), [totals]);
  const current = currentQid ? byId.get(currentQid) : undefined;
  // The learner RPCs drop a poll whose auto_close_at has passed, so a status of
  // 'open' alone doesn't mean the hall can answer. Never project "LIVE" over a poll
  // nobody can reach. No extra timer needed: the totals refetch below re-renders us
  // every REFRESH_MS, which is what flips this. Recovery lives in the coordinator
  // dialog ("Reopen live"), so this only has to stop lying.
  const paused = !!totals?.auto_close_at && new Date(totals.auto_close_at).getTime() <= Date.now();

  const refresh = useCallback(async () => {
    try { setTotals(await InductionPollService.getTotals(pollId)); } catch { /* keep last */ }
  }, [pollId]);
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, REFRESH_MS);   // resilience fallback
    return () => clearInterval(t);
  }, [refresh]);
  // Realtime: refetch the instant any vote lands.
  useInductionPollRealtime(pollId, refresh);

  const moveTo = useCallback(async (nextIdx: number) => {
    const qid = questionOrder[nextIdx];
    if (!qid || busy) return;
    setBusy(true);
    try { await InductionPollService.setCurrentQuestion(pollId, qid); setCurrentQid(qid); onQuestionChange(qid); setView('question'); }
    catch (e: any) { toast.error(e?.message ?? 'Could not change question'); }
    finally { setBusy(false); }
  }, [questionOrder, busy, pollId, onQuestionChange]);

  const next = useCallback(() => {
    if (view === 'summary') return;
    if (idx >= total - 1) setView('summary'); else moveTo(idx + 1);
  }, [view, idx, total, moveTo]);
  const prev = useCallback(() => {
    if (view === 'summary') { setView('question'); return; }
    if (idx > 0) moveTo(idx - 1);
  }, [view, idx, moveTo]);

  // Clicker/keyboard driving (Esc close comes free from Radix).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); next(); }
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); prev(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev]);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); enteredFullscreen.current = false; }
    else { document.documentElement.requestFullscreen?.().then(() => { enteredFullscreen.current = true; }).catch(() => {}); }
  };
  useEffect(() => () => { if (enteredFullscreen.current && document.fullscreenElement) document.exitFullscreen().catch(() => {}); }, []);

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="h-dvh w-screen max-w-none translate-x-0 translate-y-0 left-0 top-0 grid-rows-[auto_1fr_auto] rounded-none border-0 bg-[#0a0f1e] p-0 text-white sm:rounded-none">
        <DialogTitle className="sr-only">Live poll presenter — {sessionTitle}</DialogTitle>

        {/* header */}
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-3 pr-14">
          <span className="relative flex h-2.5 w-2.5">
            {!paused && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75 motion-reduce:animate-none" />
            )}
            <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${paused ? 'bg-amber-400' : 'bg-red-500'}`} />
          </span>
          <span className={`text-sm font-semibold uppercase tracking-widest ${paused ? 'text-amber-300' : 'text-red-300'}`}>
            {paused ? 'Paused' : 'Live'}
          </span>
          <span className="truncate text-sm text-slate-300">{sessionTitle}</span>
          {paused && (
            <span className="hidden truncate text-xs text-amber-200/80 sm:inline">
              Auto-closed — freshers can&apos;t answer until you reopen it
            </span>
          )}
          <div className="ml-auto flex items-center gap-4">
            {totals && (
              <span className="flex items-center gap-1.5 text-sm text-slate-300">
                <Users className="h-4 w-4" />
                <span className="tabular-nums font-semibold text-white">{totals.response_count}</span>
                {totals.enrolled_count ? <span className="tabular-nums">/ {totals.enrolled_count}</span> : null} answered
              </span>
            )}
            <Button size="icon" variant="ghost" className="text-slate-300 hover:bg-white/10 hover:text-white" onClick={toggleFullscreen}
              aria-label="Toggle fullscreen">
              {typeof document !== 'undefined' && document.fullscreenElement ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* stage */}
        <div className="overflow-y-auto px-5 py-6 md:px-12 md:py-10">
          {view === 'question' ? (
            !current ? (
              <div className="flex h-full items-center justify-center text-slate-400">Loading live results…</div>
            ) : (
              <div className="mx-auto flex h-full max-w-4xl flex-col justify-center gap-6 md:gap-10">
                <div>
                  <div className="mb-2 text-sm font-semibold uppercase tracking-widest text-emerald-400 tabular-nums">
                    Question {idx + 1} of {total}
                  </div>
                  <h2 className="text-2xl font-bold leading-snug md:text-4xl">{current.prompt}</h2>
                </div>
                <QuestionResult q={current} big />
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <Users className="h-4 w-4" />
                  <span className="tabular-nums text-lg font-semibold text-white">{current.response_count}</span> answered this question
                </div>
              </div>
            )
          ) : (
            <div className="mx-auto max-w-6xl space-y-8">
              <div>
                <div className="mb-2 text-sm font-semibold uppercase tracking-widest text-emerald-400">Overall results</div>
                <h2 className="text-2xl font-bold md:text-4xl">{sessionTitle} — poll summary</h2>
              </div>
              {totals && (
                <div className="grid grid-cols-3 gap-3 md:gap-4">
                  {[
                    { label: 'Responses', value: totals.response_count },
                    { label: 'Enrolled', value: totals.enrolled_count || '—' },
                    { label: 'Questions', value: total },
                  ].map((k) => (
                    <div key={k.label} className="rounded-xl border border-white/10 bg-white/5 p-4 md:p-6">
                      <div className="text-3xl font-bold tabular-nums md:text-5xl">{k.value}</div>
                      <div className="mt-1 text-xs uppercase tracking-widest text-slate-400 md:text-sm">{k.label}</div>
                    </div>
                  ))}
                </div>
              )}
              <div className="grid gap-4 md:grid-cols-2">
                {questionOrder.map((qid, i) => {
                  const q = byId.get(qid);
                  if (!q) return null;
                  return (
                    <div key={qid} className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <div className="mb-2 flex items-baseline justify-between gap-3">
                        <div className="text-sm font-semibold text-white">
                          <span className="mr-2 text-emerald-400 tabular-nums">Q{i + 1}</span>{q.prompt}
                        </div>
                        <span className="shrink-0 text-xs text-slate-400 tabular-nums">{q.response_count} answered</span>
                      </div>
                      <QuestionResult q={q} big={false} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* footer — progress + coordinator controls */}
        <div className="border-t border-white/10 px-5 py-4 md:px-12">
          <div className="mb-3 flex gap-1" aria-hidden="true">
            {questionOrder.map((qid, i) => (
              <div key={qid} className={`h-1.5 flex-1 rounded-full transition-colors ${view === 'summary' || i <= idx ? 'bg-emerald-500' : 'bg-white/15'}`} />
            ))}
          </div>
          <div className="flex items-center justify-between gap-3">
            <Button variant="outline" size="lg" disabled={busy || (view === 'question' && idx <= 0)} onClick={prev}
              className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white">
              <ChevronLeft className="mr-1 h-5 w-5" /> Previous
            </Button>
            <span className="hidden text-xs text-slate-500 sm:block">Learners see only the current question · ← → to navigate</span>
            {view === 'question' && idx >= total - 1 ? (
              <Button size="lg" disabled={busy} onClick={() => setView('summary')} className="bg-emerald-600 text-white hover:bg-emerald-500">
                <BarChart3 className="mr-1 h-5 w-5" /> Overall results
              </Button>
            ) : view === 'summary' ? (
              <Button size="lg" onClick={onClose} className="bg-emerald-600 text-white hover:bg-emerald-500">Done</Button>
            ) : (
              <Button size="lg" disabled={busy} onClick={next} className="bg-emerald-600 text-white hover:bg-emerald-500">
                Next question <ChevronRight className="ml-1 h-5 w-5" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
