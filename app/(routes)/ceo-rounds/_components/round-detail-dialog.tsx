'use client';

/**
 * Round detail — attendance (participation-graded), follow-up tasks (optionally
 * linked to an Improvement Board idea), and the rotating-Associate summary with
 * the facilitator approval gate. All writes re-fetch the round for a truthful view.
 */

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { CheckCircle2, Circle, Link2, Trash2, UserPlus } from 'lucide-react';
import {
  CeoRoundsService,
  type CeoRoundDetail,
  type CeoRoundParticipation
} from '@/lib/services/ceo-rounds/ceo-rounds-service';

const PARTICIPATION_OPTIONS: { value: CeoRoundParticipation; label: string }[] = [
  { value: 'absent', label: 'Absent' },
  { value: 'present', label: 'Present' },
  { value: 'contributed', label: 'Contributed' },
  { value: 'led', label: 'Led' }
];

interface RoundDetailDialogProps {
  roundId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canLog: boolean;
  currentUserId: string;
  institutionId: string;
  onChanged: () => void;
}

export function RoundDetailDialog({
  roundId,
  open,
  onOpenChange,
  canLog,
  currentUserId,
  institutionId,
  onChanged
}: RoundDetailDialogProps) {
  const [detail, setDetail] = useState<CeoRoundDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<{ id: string; full_name: string | null }[]>([]);
  const [ideas, setIdeas] = useState<{ id: string; title: string }[]>([]);

  const [newAttendee, setNewAttendee] = useState('');
  const [taskText, setTaskText] = useState('');
  const [taskOwner, setTaskOwner] = useState('');
  const [taskDue, setTaskDue] = useState('');
  const [taskIdea, setTaskIdea] = useState('');
  const [summaryDraft, setSummaryDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!roundId) return;
    setLoading(true);
    const d = await CeoRoundsService.getRound(roundId);
    setDetail(d);
    setSummaryDraft(d?.round.summary ?? '');
    setLoading(false);
  }, [roundId]);

  useEffect(() => {
    if (open && roundId) {
      load();
      CeoRoundsService.listCandidates(institutionId).then(setCandidates);
      CeoRoundsService.listLinkableIdeas().then(setIdeas);
    } else if (!open) {
      setDetail(null);
      setNewAttendee('');
      setTaskText('');
      setTaskOwner('');
      setTaskDue('');
      setTaskIdea('');
    }
  }, [open, roundId, institutionId, load]);

  const run = async (fn: () => Promise<void>, okMsg?: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      if (okMsg) toast.success(okMsg);
      await load();
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const round = detail?.round;
  const attendedIds = new Set((detail?.attendance ?? []).map((a) => a.participant_id));
  const addableCandidates = candidates.filter((c) => !attendedIds.has(c.id));
  const isAssignedAssociate = !!round && round.summary_author_id === currentUserId;
  const canWriteSummary =
    !!round && round.summary_status !== 'approved' && (isAssignedAssociate || canLog);
  const canApprove = !!round && canLog && round.summary_status === 'submitted';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        {loading || !round ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            {loading ? 'Loading round…' : 'Round not found or not visible to you.'}
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="pr-6">{round.theme}</DialogTitle>
              <DialogDescription>
                {round.round_date}
                {round.facilitator_name ? ` · facilitated by ${round.facilitator_name}` : ''}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 py-2">
              {round.decision && (
                <section className="rounded-md border bg-muted/40 p-3">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Decision</p>
                  <p className="mt-1 text-sm">{round.decision}</p>
                </section>
              )}

              {/* Attendance — participation graded */}
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">
                    Participation ({detail?.attendance.length ?? 0})
                  </h3>
                  <span className="text-xs text-muted-foreground">
                    {round.participation_total} pts
                  </span>
                </div>

                {(detail?.attendance ?? []).map((a) => (
                  <div key={a.id} className="flex items-center gap-2">
                    <span className="flex-1 truncate text-sm">
                      {a.participant_name || 'Unnamed'}
                    </span>
                    {canLog ? (
                      <Select
                        value={a.participation}
                        onValueChange={(v) =>
                          run(() =>
                            CeoRoundsService.gradeAttendance(a.id, v as CeoRoundParticipation)
                          )
                        }
                      >
                        <SelectTrigger className="h-8 w-36 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PARTICIPATION_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant="outline" className="text-xs capitalize">
                        {a.participation}
                      </Badge>
                    )}
                    {canLog && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        disabled={busy}
                        onClick={() => run(() => CeoRoundsService.removeAttendee(a.id))}
                        aria-label="Remove attendee"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                ))}

                {canLog && addableCandidates.length > 0 && (
                  <div className="flex items-center gap-2 pt-1">
                    <UserPlus className="h-4 w-4 text-muted-foreground" />
                    <Select
                      value={newAttendee}
                      onValueChange={(v) => {
                        setNewAttendee('');
                        run(() => CeoRoundsService.addAttendees(round.id, [v]));
                      }}
                    >
                      <SelectTrigger className="h-8 flex-1 text-xs">
                        <SelectValue placeholder="Add someone who took part…" />
                      </SelectTrigger>
                      <SelectContent>
                        {addableCandidates.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.full_name || 'Unnamed'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </section>

              {/* Tasks */}
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">
                  Follow-up tasks ({detail?.tasks.length ?? 0})
                </h3>
                {(detail?.tasks ?? []).map((t) => (
                  <div key={t.id} className="flex items-start gap-2 rounded-md border p-2">
                    <button
                      type="button"
                      disabled={!canLog || busy}
                      onClick={() =>
                        run(() =>
                          CeoRoundsService.updateTask(t.id, {
                            status: t.status === 'done' ? 'open' : 'done'
                          })
                        )
                      }
                      className="mt-0.5 disabled:cursor-default"
                      aria-label={t.status === 'done' ? 'Mark open' : 'Mark done'}
                    >
                      {t.status === 'done' ? (
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                      ) : (
                        <Circle className="h-4 w-4 text-muted-foreground" />
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-sm ${t.status === 'done' ? 'text-muted-foreground line-through' : ''}`}
                      >
                        {t.action_text}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {(t.owner_name || t.owner_label) && (
                          <span>owner: {t.owner_name || t.owner_label}</span>
                        )}
                        {t.due_date && <span>due {t.due_date}</span>}
                        {t.linked_idea_title && (
                          <span className="flex items-center gap-1 text-primary">
                            <Link2 className="h-3 w-3" />
                            {t.linked_idea_title}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {canLog && (
                  <div className="space-y-2 rounded-md border border-dashed p-2">
                    <Input
                      placeholder="Add a follow-up task…"
                      value={taskText}
                      onChange={(e) => setTaskText(e.target.value)}
                    />
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <Select
                        value={taskOwner || 'none'}
                        onValueChange={(v) => setTaskOwner(v === 'none' ? '' : v)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Owner…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No owner</SelectItem>
                          {candidates.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.full_name || 'Unnamed'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="date"
                        className="h-8 text-xs"
                        value={taskDue}
                        onChange={(e) => setTaskDue(e.target.value)}
                      />
                      <Select
                        value={taskIdea || 'none'}
                        onValueChange={(v) => setTaskIdea(v === 'none' ? '' : v)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Link a Board idea…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No link</SelectItem>
                          {ideas.map((i) => (
                            <SelectItem key={i.id} value={i.id}>
                              {i.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      size="sm"
                      disabled={!taskText.trim() || busy}
                      onClick={() =>
                        run(async () => {
                          await CeoRoundsService.addTask(round.id, {
                            action_text: taskText,
                            owner_profile_id: taskOwner || null,
                            due_date: taskDue || null,
                            linked_idea_id: taskIdea || null
                          });
                          setTaskText('');
                          setTaskOwner('');
                          setTaskDue('');
                          setTaskIdea('');
                        }, 'Task added.')
                      }
                    >
                      Add task
                    </Button>
                  </div>
                )}
              </section>

              {/* Summary — rotating associate writes, facilitator approves */}
              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Round summary</h3>
                  <Badge
                    variant="outline"
                    className={
                      round.summary_status === 'approved'
                        ? 'bg-primary/10 text-primary text-xs'
                        : round.summary_status === 'submitted'
                          ? 'bg-amber-100 text-xs text-amber-800'
                          : 'text-muted-foreground text-xs'
                    }
                  >
                    {round.summary_status}
                  </Badge>
                </div>

                {canWriteSummary ? (
                  <>
                    <Textarea
                      placeholder={
                        isAssignedAssociate
                          ? 'Write the round summary for Senior Learner approval…'
                          : 'Write or revise the round summary…'
                      }
                      value={summaryDraft}
                      onChange={(e) => setSummaryDraft(e.target.value)}
                      rows={4}
                    />
                    <Button
                      size="sm"
                      disabled={!summaryDraft.trim() || busy}
                      onClick={() =>
                        run(
                          () => CeoRoundsService.writeSummary(round.id, summaryDraft),
                          'Summary submitted.'
                        )
                      }
                    >
                      Submit summary
                    </Button>
                  </>
                ) : round.summary ? (
                  <p className="whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-sm">
                    {round.summary}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No summary yet
                    {round.summary_author_name
                      ? ` — assigned to ${round.summary_author_name}.`
                      : '.'}
                  </p>
                )}

                {canApprove && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      run(() => CeoRoundsService.approveSummary(round.id), 'Summary approved.')
                    }
                  >
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Approve summary
                  </Button>
                )}
                {round.summary_status === 'approved' && round.summary && (
                  <p className="whitespace-pre-wrap rounded-md border border-primary/20 bg-primary/5 p-3 text-sm">
                    {round.summary}
                  </p>
                )}
              </section>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
