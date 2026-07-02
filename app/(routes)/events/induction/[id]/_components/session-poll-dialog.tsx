'use client';
// Host poll manager for ONE induction session: build questions, open/close the
// live poll, and watch anonymized live tallies (k>=3 floor). Mirrors the
// SessionPulseControl polling pattern and the resource-links repeater UX.
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart3, Plus, X, Radio, Square, Users, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Presentation } from 'lucide-react';
import { InductionPollService, type PollQuestionDraft, type PollTotals, type PollResponder } from '@/lib/services/induction/induction-poll-service';
import { SessionPollPresenter } from './session-poll-presenter';

export function SessionPollDialog({ sessionId, sessionTitle }: { sessionId: string; sessionTitle: string }) {
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
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = () => { if (timer.current) { clearInterval(timer.current); timer.current = null; } };
  useEffect(() => stop, []);

  const load = useCallback(async () => {
    try {
      const p = await InductionPollService.getPoll(sessionId);
      if (p) {
        setPollId(p.id); setStatus(p.status); setHasVotes(p.has_votes); setAutoCloseAt(p.auto_close_at);
        setCurrentQid(p.current_question_id);
        setQuestions(p.questions.map((q) => ({ id: q.id, prompt: q.prompt, kind: q.kind, position: q.position,
          options: q.options.map((o) => ({ id: o.id, label: o.label, position: o.position })) })));
        if (p.status === 'open') { await refresh(p.id); startPoll(p.id); }
      } else { setQuestions([]); setPollId(null); setStatus('draft'); setHasVotes(false); }
    } catch (e: any) { toast.error(e?.message ?? 'Could not load poll'); }
  }, [sessionId]);

  async function refresh(pid: string) {
    try { const t = await InductionPollService.getTotals(pid); setTotals(t);
      // Lock destructive edits the moment the first vote lands (don't wait for a
      // dialog re-open): response_count > 0 means votes exist.
      if (t && t.response_count > 0) {
        setHasVotes(true);
        // Live "who answered" roster (identity only, never ballots) behind the count.
        try { setResponders(await InductionPollService.getResponders(pid)); } catch { /* keep last */ }
      }
      if (t) setAutoCloseAt(t.auto_close_at);
      if (t && t.status !== 'open') { stop(); setStatus(t.status); } } catch { /* keep last */ }
  }
  function startPoll(pid: string) { stop(); timer.current = setInterval(() => refresh(pid), 8000); }

  useEffect(() => { if (open) load(); else { stop(); setTotals(null); setResponders([]); setShowResponders(false); } }, [open, load]);

  // builder mutations
  const addQuestion = () => setQuestions((qs) => [...qs, { prompt: '', kind: 'single', position: qs.length, options: [{ label: '', position: 0 }] }]);
  const setQ = (i: number, patch: Partial<PollQuestionDraft>) => setQuestions((qs) => qs.map((q, j) => j === i ? { ...q, ...patch } : q));
  const removeQ = (i: number) => setQuestions((qs) => qs.filter((_, j) => j !== i));
  const addOpt = (i: number) => setQuestions((qs) => qs.map((q, j) => j === i ? { ...q, options: [...q.options, { label: '', position: q.options.length }] } : q));
  const setOpt = (i: number, k: number, label: string) => setQuestions((qs) => qs.map((q, j) => j === i ? { ...q, options: q.options.map((o, m) => m === k ? { ...o, label } : o) } : q));
  const removeOpt = (i: number, k: number) => setQuestions((qs) => qs.map((q, j) => j === i ? { ...q, options: q.options.filter((_, m) => m !== k) } : q));

  const savePoll = async () => {
    // normalize positions; drop empty options/questions
    const payload = questions
      .map((q, i) => ({ ...q, position: i, options: q.options.filter((o) => o.label.trim()).map((o, k) => ({ ...o, position: k })) }))
      .filter((q) => q.prompt.trim() && q.options.length >= 2);
    if (!payload.length) { toast.error('Add at least one question with two options.'); return; }
    setBusy(true);
    try { const id = await InductionPollService.upsertPoll(sessionId, payload); setPollId(id); toast.success('Poll saved.'); await load(); }
    catch (e: any) { toast.error(e?.message ?? 'Could not save poll'); } finally { setBusy(false); }
  };
  const openLive = async () => { setBusy(true); try { await InductionPollService.openPoll(sessionId); toast.success('Poll is live.'); await load(); } catch (e: any) { toast.error(e?.message ?? 'Could not open'); } finally { setBusy(false); } };
  // Coordinator flow: move the ONE question learners can see (also extends auto-close).
  const moveQuestion = async (dir: 1 | -1) => {
    if (!pollId) return;
    const ids = questions.map((q) => q.id).filter((id): id is string => !!id);
    const next = ids[ids.indexOf(currentQid ?? '') + dir];
    if (!next) return;
    setBusy(true);
    try { await InductionPollService.setCurrentQuestion(pollId, next); setCurrentQid(next); await refresh(pollId); }
    catch (e: any) { toast.error(e?.message ?? 'Could not change question'); } finally { setBusy(false); }
  };
  const closeLive = async () => { if (!pollId) return; setBusy(true); try { await InductionPollService.closePoll(pollId); stop(); setStatus('closed'); toast.success('Poll closed.'); } catch (e: any) { toast.error(e?.message ?? 'Could not close'); } finally { setBusy(false); } };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" title="Poll"><BarChart3 className="h-4 w-4" /></Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">Poll — {sessionTitle}
            <Badge variant={status === 'open' ? 'default' : 'secondary'}>{status}</Badge></DialogTitle>
          <DialogDescription>Build questions, open it live, and watch anonymized results (hidden until 3 answers).</DialogDescription>
          {/* Surface the lazy auto-close: an open poll silently disappears for learners
              after this time even though the status here still reads "open". */}
          {status === 'open' && autoCloseAt && (
            <p className="text-xs text-amber-600 dark:text-amber-500">
              Auto-closes at {new Date(autoCloseAt).toLocaleString(undefined, { hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' })} — reopen with &quot;Open live&quot; to extend.
            </p>
          )}
        </DialogHeader>

        {/* live results when open */}
        {status === 'open' && totals && (
          <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3 space-y-3">
            {/* Full-screen projector view — presenter drives the same current question */}
            <Button className="w-full" variant="default" onClick={() => setPresenting(true)} disabled={!pollId}>
              <Presentation className="h-4 w-4 mr-2" /> Present full screen
            </Button>
            {/* Coordinator flow: learners only see the LIVE question; move it here. */}
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
                onClick={() => moveQuestion(1)}>
                Next question <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
            <div className="text-xs text-muted-foreground">{totals.response_count}{totals.enrolled_count ? ` / ${totals.enrolled_count}` : ''} answered{totals.suppressed ? ' · results hidden until 3' : ''}</div>
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

            {/* Who answered — identity only (register no + name), never ballots */}
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

        {/* builder */}
        <div className="space-y-3">
          {questions.map((q, i) => (
            <div key={q.id ?? i} className="rounded-md border p-2 space-y-2">
              <div className="flex gap-2">
                <Input placeholder="Question" value={q.prompt} onChange={(e) => setQ(i, { prompt: e.target.value })} />
                <Select value={q.kind} onValueChange={(v) => setQ(i, { kind: v as 'single' | 'multi' })}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="single">Pick one</SelectItem><SelectItem value="multi">Pick many</SelectItem></SelectContent>
                </Select>
                <Button size="icon" variant="ghost" disabled={hasVotes} onClick={() => removeQ(i)}><X className="h-4 w-4" /></Button>
              </div>
              {q.options.map((o, k) => (
                <div key={o.id ?? k} className="flex gap-2 pl-3">
                  <Input placeholder={`Option ${k + 1}`} value={o.label} onChange={(e) => setOpt(i, k, e.target.value)} />
                  <Button size="icon" variant="ghost" disabled={hasVotes} onClick={() => removeOpt(i, k)}><X className="h-4 w-4" /></Button>
                </div>
              ))}
              <Button size="sm" variant="ghost" onClick={() => addOpt(i)}><Plus className="h-3.5 w-3.5 mr-1" /> Option</Button>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={addQuestion}><Plus className="h-4 w-4 mr-1" /> Add question</Button>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={savePoll} disabled={busy}>Save poll</Button>
          {status !== 'open'
            ? <Button onClick={openLive} disabled={busy || !pollId}><Radio className="h-4 w-4 mr-1" /> Open live</Button>
            : <Button variant="secondary" onClick={closeLive} disabled={busy}><Square className="h-4 w-4 mr-1" /> Close</Button>}
        </DialogFooter>

        {presenting && pollId && (
          <SessionPollPresenter
            pollId={pollId}
            sessionTitle={sessionTitle}
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
