'use client';
// Learner-facing open-poll prompt for induction sessions. Lists my open polls
// (enrolled + my batch, server-gated), opens an answer form (radio for single,
// checkboxes for multi), submits, and lets me change while open. No results
// shown to learners (host-only). Mirrors induction-pulse-banner.tsx.
import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { BarChart3 } from 'lucide-react';
import { InductionPollService, type OpenPollForLearner, type PollForAnswering } from '@/lib/services/induction/induction-poll-service';

export function SessionPollBanner() {
  const [polls, setPolls] = useState<OpenPollForLearner[]>([]);
  const [active, setActive] = useState<PollForAnswering | null>(null);
  const [picks, setPicks] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setPolls(await InductionPollService.getMyOpenPolls()); } catch { /* silent */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  const openForm = async (pollId: string) => {
    try { const f = await InductionPollService.getForAnswering(pollId); setActive(f); setPicks(f?.my_answers ?? {}); }
    catch (e: any) { toast.error(e?.message ?? 'Could not load poll'); }
  };
  const toggle = (qid: string, oid: string, multi: boolean) => setPicks((p) => {
    const cur = p[qid] ?? [];
    if (multi) return { ...p, [qid]: cur.includes(oid) ? cur.filter((x) => x !== oid) : [...cur, oid] };
    return { ...p, [qid]: [oid] };
  });
  const submit = async () => {
    if (!active) return;
    const answers = active.questions.map((q) => ({ question_id: q.id, option_ids: picks[q.id] ?? [] }))
      .filter((a) => a.option_ids.length);
    setBusy(true);
    try { await InductionPollService.submit(active.poll_id, answers); toast.success('Submitted — you can change your answers while the poll is open.'); setActive(null); await load(); }
    catch (e: any) { toast.error(e?.message ?? 'Could not submit'); } finally { setBusy(false); }
  };

  if (!polls.length && !active) return null;

  if (active) {
    return (
      <div className="rounded-lg border p-3 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium"><BarChart3 className="h-4 w-4" /> Session poll</div>
        {active.questions.map((q) => (
          <div key={q.id} className="space-y-1.5">
            <div className="text-sm">{q.prompt}</div>
            {q.kind === 'single' ? (
              <RadioGroup value={(picks[q.id] ?? [])[0] ?? ''} onValueChange={(v) => toggle(q.id, v, false)}>
                {q.options.map((o) => (
                  <div key={o.id} className="flex items-center gap-2">
                    <RadioGroupItem value={o.id} id={`${q.id}-${o.id}`} /><Label htmlFor={`${q.id}-${o.id}`}>{o.label}</Label>
                  </div>
                ))}
              </RadioGroup>
            ) : (
              q.options.map((o) => (
                <div key={o.id} className="flex items-center gap-2">
                  <Checkbox id={`${q.id}-${o.id}`} checked={(picks[q.id] ?? []).includes(o.id)} onCheckedChange={() => toggle(q.id, o.id, true)} />
                  <Label htmlFor={`${q.id}-${o.id}`}>{o.label}</Label>
                </div>
              ))
            )}
          </div>
        ))}
        <div className="flex gap-2">
          <Button size="sm" onClick={submit} disabled={busy}>Submit</Button>
          <Button size="sm" variant="ghost" onClick={() => setActive(null)} disabled={busy}>Cancel</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {polls.map((p) => (
        <button key={p.poll_id} onClick={() => openForm(p.poll_id)}
          className="flex w-full items-center justify-between rounded-lg border p-3 text-left hover:bg-accent">
          <span className="flex items-center gap-2 text-sm"><BarChart3 className="h-4 w-4" /> {p.title ?? 'Session poll'} — tap to answer</span>
          <span className="text-xs text-muted-foreground">{p.already_answered ? 'change answer' : 'new'}</span>
        </button>
      ))}
    </div>
  );
}
