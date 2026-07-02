'use client';
// Learner-facing live poll for induction sessions — coordinator-driven flow.
// The coordinator controls which ONE question is live (server-enforced: the RPC
// only ever returns the current question). The learner answers it (confetti on
// every submit), then watches that question's live counts (hidden until 3
// responses) while waiting for the coordinator to reveal the next question.
// Polls the server every 5s to pick up question changes. Mirrors
// induction-pulse-banner.tsx for discovery; no full-questionnaire access.
import { useEffect, useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import confetti from 'canvas-confetti';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { BarChart3, CheckCircle2, Hourglass, Pencil } from 'lucide-react';
import {
  InductionPollService,
  type OpenPollForLearner,
  type PollForAnswering,
  type LearnerQuestionTotals,
} from '@/lib/services/induction/induction-poll-service';

function celebrate() {
  const opts = { disableForReducedMotion: true, ticks: 150 };
  confetti({ ...opts, particleCount: 70, spread: 70, origin: { x: 0.2, y: 0.7 } });
  confetti({ ...opts, particleCount: 70, spread: 70, origin: { x: 0.8, y: 0.7 } });
  setTimeout(() => confetti({ ...opts, particleCount: 90, spread: 110, origin: { x: 0.5, y: 0.4 }, scalar: 1.1 }), 250);
}

export function SessionPollBanner() {
  const [polls, setPolls] = useState<OpenPollForLearner[]>([]);
  const [active, setActive] = useState<PollForAnswering | null>(null);
  const [picks, setPicks] = useState<string[]>([]);
  const [answered, setAnswered] = useState(false);   // answered the CURRENT question
  const [changing, setChanging] = useState(false);   // re-opened the form to change
  const [liveTotals, setLiveTotals] = useState<LearnerQuestionTotals | null>(null);
  const [busy, setBusy] = useState(false);
  const activeRef = useRef<PollForAnswering | null>(null);
  activeRef.current = active;

  const load = useCallback(async () => {
    try { setPolls(await InductionPollService.getMyOpenPolls()); } catch { /* silent */ }
  }, []);
  // Poll discovery every 15s (mirrors induction-pulse-banner) so a fresher who has
  // the page open sees a poll appear when the host opens it, without a manual reload.
  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  const applyForm = (f: PollForAnswering | null) => {
    setActive(f);
    const q = f?.questions[0];
    const mine = q ? (f?.my_answers?.[q.id] ?? []) : [];
    setPicks(mine);
    setAnswered(mine.length > 0);
    setChanging(false);
    setLiveTotals(null);
  };

  const openForm = async (pollId: string) => {
    try { applyForm(await InductionPollService.getForAnswering(pollId)); }
    catch (e: any) { toast.error(e?.message ?? 'Could not load poll'); }
  };

  // While joined: every 5s pick up (a) the coordinator moving to the next question,
  // and (b) live counts for the current question once I've answered it.
  useEffect(() => {
    if (!active) return;
    const tick = async () => {
      const cur = activeRef.current;
      if (!cur) return;
      try {
        const f = await InductionPollService.getForAnswering(cur.poll_id);
        if (f && f.current_question_id !== cur.current_question_id) { applyForm(f); return; }
        setLiveTotals(await InductionPollService.getLearnerQuestionTotals(cur.poll_id));
      } catch {
        // Poll closed / no longer visible → leave the live view quietly.
        setActive(null); load();
      }
    };
    const t = setInterval(tick, 5000);
    return () => clearInterval(t);
  }, [active?.poll_id, active?.current_question_id, load]);

  const q = active?.questions[0] ?? null;

  const toggle = (oid: string, multi: boolean) =>
    setPicks((p) => (multi ? (p.includes(oid) ? p.filter((x) => x !== oid) : [...p, oid]) : [oid]));

  const submit = async () => {
    if (!active || !q) return;
    if (q.kind === 'single' && picks.length !== 1) { toast.error('Pick one option.'); return; }
    setBusy(true);
    try {
      await InductionPollService.submit(active.poll_id, [{ question_id: q.id, option_ids: picks }]);
      celebrate();
      toast.success('Answer submitted!');
      setAnswered(true); setChanging(false);
      try { setLiveTotals(await InductionPollService.getLearnerQuestionTotals(active.poll_id)); } catch { /* next tick */ }
    } catch (e: any) { toast.error(e?.message ?? 'Could not submit'); } finally { setBusy(false); }
  };

  if (!polls.length && !active) return null;

  if (active) {
    const showResults = answered && !changing;
    return (
      <div className="rounded-lg border p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium"><BarChart3 className="h-4 w-4" /> Live session poll</div>
          {q && active.question_index != null && (
            <span className="text-xs text-muted-foreground tabular-nums">Question {active.question_index} of {active.question_total}</span>
          )}
        </div>
        {q && active.question_index != null && (
          <div className="h-1.5 rounded bg-muted">
            <div className="h-1.5 rounded bg-emerald-500 transition-all" style={{ width: `${(active.question_index / Math.max(1, active.question_total)) * 100}%` }} />
          </div>
        )}

        {!q ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Hourglass className="h-4 w-4 animate-pulse" /> Waiting for the coordinator to start the poll…
          </div>
        ) : showResults ? (
          <div className="space-y-2">
            <div className="text-sm font-medium">{q.prompt}</div>
            {liveTotals && !liveTotals.suppressed ? (
              (() => {
                const tot = liveTotals.options.reduce((a, o) => a + (o.count ?? 0), 0) || 1;
                return liveTotals.options.map((o) => (
                  <div key={o.id} className="text-xs">
                    <div className="flex justify-between">
                      <span className={picks.includes(o.id) ? 'font-semibold' : ''}>{o.label}{picks.includes(o.id) ? ' ✓' : ''}</span>
                      <span className="tabular-nums">{o.count ?? 0} ({Math.round(((o.count ?? 0) / tot) * 100)}%)</span>
                    </div>
                    <div className="h-1.5 rounded bg-muted"><div className="h-1.5 rounded bg-emerald-500 transition-all" style={{ width: `${Math.round(((o.count ?? 0) / tot) * 100)}%` }} /></div>
                  </div>
                ));
              })()
            ) : (
              <p className="text-xs text-muted-foreground">
                {liveTotals ? `${liveTotals.response_count} answered — live results appear after 3 responses.` : 'Loading live results…'}
              </p>
            )}
            <div className="flex items-center justify-between pt-1">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Answered — waiting for the next question
              </span>
              <Button size="sm" variant="ghost" onClick={() => setChanging(true)}>
                <Pencil className="h-3.5 w-3.5 mr-1" /> Change answer
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-sm font-medium">{q.prompt}</div>
            {q.kind === 'single' ? (
              <RadioGroup value={picks[0] ?? ''} onValueChange={(v) => toggle(v, false)}>
                {q.options.map((o) => (
                  <div key={o.id} className="flex items-center gap-2 rounded-md border p-2 hover:bg-accent">
                    <RadioGroupItem value={o.id} id={`${q.id}-${o.id}`} />
                    <Label htmlFor={`${q.id}-${o.id}`} className="flex-1 cursor-pointer">{o.label}</Label>
                  </div>
                ))}
              </RadioGroup>
            ) : (
              q.options.map((o) => (
                <div key={o.id} className="flex items-center gap-2 rounded-md border p-2 hover:bg-accent">
                  <Checkbox id={`${q.id}-${o.id}`} checked={picks.includes(o.id)} onCheckedChange={() => toggle(o.id, true)} />
                  <Label htmlFor={`${q.id}-${o.id}`} className="flex-1 cursor-pointer">{o.label}</Label>
                </div>
              ))
            )}
            {q.kind === 'multi' && <p className="text-xs text-muted-foreground">Pick as many as apply.</p>}
            <div className="flex gap-2 pt-1">
              <Button size="sm" onClick={submit} disabled={busy || (q.kind === 'single' && picks.length !== 1)}>
                <CheckCircle2 className="h-4 w-4 mr-1" /> Submit
              </Button>
              {changing
                ? <Button size="sm" variant="ghost" onClick={() => setChanging(false)} disabled={busy}>Back to results</Button>
                : <Button size="sm" variant="ghost" onClick={() => setActive(null)} disabled={busy}>Leave</Button>}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {polls.map((p) => (
        <button key={p.poll_id} onClick={() => openForm(p.poll_id)}
          className="flex w-full items-center justify-between rounded-lg border p-3 text-left hover:bg-accent">
          <span className="flex items-center gap-2 text-sm"><BarChart3 className="h-4 w-4" /> {p.title ?? 'Session poll'} — tap to join</span>
          <span className="text-xs text-muted-foreground">{p.already_answered ? 'continue' : 'live'}</span>
        </button>
      ))}
    </div>
  );
}
