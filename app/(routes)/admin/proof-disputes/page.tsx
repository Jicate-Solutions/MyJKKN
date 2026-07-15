'use client';

// Admin — Verified Skills Record correction queue.
// Learners raise "this is wrong" reports on /my-proof; a HUMAN resolves them
// here (Director policy 3: disputes resolve BEFORE a record can be shared —
// open reports block the learner's share-link creation server-side).
//
// Reads vsr_disputes directly (RLS grants admins SELECT); resolution goes
// through fn_vsr_resolve_dispute (SECURITY DEFINER, admin-gated inside).

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ContentLayout } from '@/components/layout/content-layout';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

interface DisputeRow {
  id: string;
  learner_id: string;
  section: string;
  detail: string;
  status: 'open' | 'resolved' | 'dismissed';
  created_at: string;
  resolution_note: string | null;
  learners_profiles: {
    first_name: string | null;
    last_name: string | null;
    register_number: string | null;
  } | null;
}

function useDisputes() {
  return useQuery<DisputeRow[]>({
    queryKey: ['vsr-admin-disputes'],
    queryFn: async () => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase
        .from('vsr_disputes')
        .select(
          'id, learner_id, section, detail, status, created_at, resolution_note, learners_profiles(first_name, last_name, register_number)',
        )
        .order('status', { ascending: false }) // open > dismissed/resolved alphabetically — see sort below
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as unknown as DisputeRow[];
      // open first, then newest
      return rows.sort(
        (a, b) =>
          Number(b.status === 'open') - Number(a.status === 'open') ||
          b.created_at.localeCompare(a.created_at),
      );
    },
  });
}

export default function ProofDisputesAdminPage() {
  const { data: disputes = [], isLoading, error } = useDisputes();
  const [resolving, setResolving] = useState<{ row: DisputeRow; verdict: 'resolved' | 'dismissed' } | null>(null);

  const open = disputes.filter((d) => d.status === 'open');

  return (
    <ContentLayout title="Record corrections">
      <div className="mx-auto max-w-3xl space-y-4">
        <header>
          <h1 className="text-2xl font-bold">Verified Skills Record — corrections</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Reports learners raised against their own records. A learner cannot
            share their record while one of their reports is open — resolve
            promptly.
          </p>
        </header>

        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : error ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
            {String(error instanceof Error ? error.message : error)}
          </div>
        ) : disputes.length === 0 ? (
          <div className="rounded-lg border p-6 text-sm text-muted-foreground">
            No reports yet. When a learner presses &ldquo;This is wrong&rdquo;
            on their record, it lands here.
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {open.length} open · {disputes.length - open.length} handled
            </p>
            <ul className="space-y-3">
              {disputes.map((d) => (
                <li key={d.id} className="rounded-lg border bg-card p-4">
                  <div className="flex flex-wrap items-start gap-2">
                    <Badge
                      variant={d.status === 'open' ? 'default' : 'outline'}
                      className="capitalize"
                    >
                      {d.status}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {[d.learners_profiles?.first_name, d.learners_profiles?.last_name]
                          .filter(Boolean)
                          .join(' ') || 'Learner'}
                        {d.learners_profiles?.register_number ? (
                          <span className="ml-1 text-muted-foreground">
                            · {d.learners_profiles.register_number}
                          </span>
                        ) : null}
                      </p>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        {d.section} · {new Date(d.created_at).toLocaleString()}
                      </p>
                      <p className="mt-2 text-sm leading-relaxed">{d.detail}</p>
                      {d.resolution_note ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Outcome: {d.resolution_note}
                        </p>
                      ) : null}
                    </div>
                    {d.status === 'open' ? (
                      <div className="flex shrink-0 gap-2">
                        <Button size="sm" onClick={() => setResolving({ row: d, verdict: 'resolved' })}>
                          Resolve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setResolving({ row: d, verdict: 'dismissed' })}
                        >
                          Dismiss
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <ResolveDialog state={resolving} onClose={() => setResolving(null)} />
    </ContentLayout>
  );
}

function ResolveDialog({
  state,
  onClose,
}: {
  state: { row: DisputeRow; verdict: 'resolved' | 'dismissed' } | null;
  onClose: () => void;
}) {
  const [note, setNote] = useState('');
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: async () => {
      if (!state) return;
      const supabase = createClientSupabaseClient();
      const { data, error } = await supabase.rpc('fn_vsr_resolve_dispute', {
        p_dispute_id: state.row.id,
        p_status: state.verdict,
        p_note: note,
      });
      if (error) throw new Error(error.message);
      const result = data as { success: boolean; error?: string } | null;
      if (result && !result.success) throw new Error(result.error ?? 'Refused.');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vsr-admin-disputes'] });
      toast.success(state?.verdict === 'resolved' ? 'Marked resolved.' : 'Dismissed.');
      setNote('');
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not update the report.'),
  });

  return (
    <Dialog open={state !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {state?.verdict === 'resolved' ? 'Resolve report' : 'Dismiss report'}
          </DialogTitle>
          <DialogDescription>
            The note below is shown to the learner on their record page — write
            it to them, plainly. What was checked, and what was the outcome?
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Example: checked the session register for 3 July — the entry was corrected."
          rows={3}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
