'use client';

// Share ONE induction session with other colleges (Director decisions D2/D10).
//
// D2 — sharing is per SESSION, not per programme: each college keeps its own
// induction, and only the sessions actually co-conducted are linked here.
// D10 — the HOST college controls sharing, so this dialog is rendered only
// behind the same `canManage` gate as edit/delete. The joining college sees the
// result but has no control here (its own read path is the shares RPC).
//
// Deliberately narrow: sharing LABELS a session. It does not yet grant the
// joining college's freshers attendance or completion credit — that lands in a
// later step, because the completion denominator feeds both the attendance and
// feedback percentages and cannot be widened without re-checking every fresher
// who is already complete.
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Share2, X, Loader2, Building2 } from 'lucide-react';
import {
  InductionSharingService,
  type SessionShareRow,
  type ShareableInstitution,
} from '@/lib/services/induction/induction-sharing-service';

export function SessionShareDialog({
  sessionId,
  sessionTitle,
  shares,
  onChanged,
}: {
  sessionId: string;
  sessionTitle: string;
  /** Current shares for THIS session, supplied by the parent's one-shot event
   *  load so opening the dialog costs no extra round trip. */
  shares: SessionShareRow[];
  /** Ask the parent to re-read the event's shares after a change. */
  onChanged: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [available, setAvailable] = useState<ShareableInstitution[] | null>(null);

  // Load the picker only when the dialog opens — one RPC per open, not per row
  // render. The list already excludes the host and anything already shared, so
  // no client-side filtering is needed (and a stale list still cannot create a
  // bad row: the RPCs re-check server-side).
  useEffect(() => {
    if (!open) { setPick(''); return; }
    let active = true;
    setAvailable(null);
    InductionSharingService.listShareable(sessionId)
      .then((rows) => { if (active) setAvailable(rows); })
      .catch((e: any) => {
        if (active) { setAvailable([]); toast.error(e?.message ?? 'Could not load colleges.'); }
      });
    return () => { active = false; };
  }, [open, sessionId, shares.length]);

  const isLoading = available === null;

  async function add() {
    if (!pick) { toast.error('Choose a college first.'); return; }
    setBusy('add');
    try {
      await InductionSharingService.addShare(sessionId, pick);
      toast.success('Session shared.');
      setPick('');
      await onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? 'Could not share this session.');
    } finally { setBusy(null); }
  }

  async function remove(institutionId: string, name: string) {
    setBusy(institutionId);
    try {
      await InductionSharingService.removeShare(sessionId, institutionId);
      toast.success(`No longer shared with ${name}.`);
      await onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? 'Could not remove this college.');
    } finally { setBusy(null); }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" title="Share with another college">
          <Share2 className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Share this session</DialogTitle>
          <DialogDescription>
            {sessionTitle} — pick the colleges whose freshers attend this session with yours.
            Your college stays in charge of the time, hall and speakers.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Shared with</p>
            {shares.length === 0 ? (
              <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                Not shared yet — only your own freshers attend this session.
              </p>
            ) : (
              <div className="space-y-1.5">
                {shares.map((s) => (
                  <div key={s.institution_id}
                    className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{s.institution_name}</span>
                    </span>
                    <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0"
                      disabled={busy === s.institution_id}
                      onClick={() => remove(s.institution_id, s.institution_name)}>
                      {busy === s.institution_id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <X className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Add a college</p>
            <div className="flex gap-2">
              <Select value={pick} onValueChange={setPick} disabled={isLoading || busy === 'add'}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder={isLoading ? 'Loading colleges…' : 'Choose a college'} />
                </SelectTrigger>
                <SelectContent>
                  {(available ?? []).map((i) => (
                    <SelectItem key={i.institution_id} value={i.institution_id}>
                      {i.institution_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={add} disabled={!pick || busy === 'add'}>
                {busy === 'add' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Share'}
              </Button>
            </div>
          </div>

          <p className="rounded-md bg-muted/40 p-2 text-[11px] leading-relaxed text-muted-foreground">
            Sharing records that this session is co-conducted. It does not yet count towards the
            other college&apos;s induction completion — that comes in a later update, so no
            fresher&apos;s existing completion is disturbed.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
