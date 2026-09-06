'use client';

// ============================================================================
// Learner Notes Approval Queue — super-admin review of AI-drafted support notes.
// Created: 2026-07-03. Visual language mirrors /admin/ai-models (tables, badges).
//
// Every pending draft renders with its FULL note text (never truncated — the
// review must be real), the student it goes to, the course, and the week.
// Per-row Approve / Reject, plus a confirm-gated "Approve all (N)" that submits
// every currently listed draft id in ONE POST. Refetches after any action.
//
// 2026-07-11 (Director): SELECTIVE bulk triage. "Approve all" existed since
// day one but was all-or-nothing — with a 600+ draft queue nobody used it, and
// one-by-one was too slow, so notes piled up unreviewed (612 pending, 3 ever
// approved). Added: college / course / text filters, per-row checkboxes, a
// select-all-filtered header checkbox, and confirm-gated Approve/Reject
// selected — all reusing the existing bulk POST (ids[] + action), zero backend
// change beyond the college-name enrichment in the GET.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { format, parseISO } from 'date-fns';
import { Check, RefreshCw, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface PendingNote {
  id: string;
  learner_id: string;
  learner_name: string | null;
  register_number: string | null;
  institution_id: string | null;
  institution_name: string | null;
  course_code: string;
  course_name: string | null;
  note: string;
  model: string | null;
  week_of: string;
  generated_at: string;
  status: string;
}

/** Pending bulk action awaiting the confirm dialog. */
type ConfirmState = {
  action: 'approve' | 'reject';
  ids: string[];
  scope: 'all' | 'selected';
} | null;

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), 'd MMM yyyy');
  } catch {
    return iso;
  }
}

export function LearnerNotesApprovalQueue() {
  const [notes, setNotes] = useState<PendingNote[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [actingIds, setActingIds] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<ConfirmState>(null);

  // Selection + filters (all client-side over the fetched queue).
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [collegeFilter, setCollegeFilter] = useState<string>('all');
  const [courseFilter, setCourseFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const loadNotes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/learner-notes', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
      const next = (json.notes ?? []) as PendingNote[];
      setNotes(next);
      // Prune selections that no longer exist (approved/rejected elsewhere).
      setSelected((prev) => {
        const alive = new Set(next.map((n) => n.id));
        const kept = new Set([...prev].filter((id) => alive.has(id)));
        return kept.size === prev.size ? prev : kept;
      });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn't load the approval queue. Try refreshing.",
      );
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  const review = useCallback(
    async (ids: string[], action: 'approve' | 'reject') => {
      setActingIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.add(id));
        return next;
      });
      try {
        const res = await fetch('/api/admin/learner-notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids, action }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.error || `HTTP ${res.status}`);
        const count = typeof json.updated_count === 'number' ? json.updated_count : ids.length;
        toast.success(
          action === 'approve'
            ? `Approved ${count} note${count === 1 ? '' : 's'} — now visible to the student${count === 1 ? '' : 's'}.`
            : `Rejected ${count} note${count === 1 ? '' : 's'} — the student${count === 1 ? '' : 's'} will never see ${count === 1 ? 'it' : 'them'}.`,
        );
        // Reviewed ids leave the queue — drop them from the selection.
        setSelected((prev) => {
          const next = new Set(prev);
          ids.forEach((id) => next.delete(id));
          return next;
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Review failed. Try again.');
      } finally {
        setActingIds((prev) => {
          const next = new Set(prev);
          ids.forEach((id) => next.delete(id));
          return next;
        });
        // Refetch after ANY action (success or failure) so the queue reflects
        // the database truth, not optimistic local state.
        await loadNotes();
      }
    },
    [loadNotes],
  );

  // Filter options come from the loaded queue itself, so they always match
  // what is actually pending.
  const collegeOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of notes ?? []) {
      if (n.institution_id) m.set(n.institution_id, n.institution_name || 'Unnamed college');
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [notes]);

  const courseOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of notes ?? []) {
      if (collegeFilter !== 'all' && n.institution_id !== collegeFilter) continue;
      m.set(n.course_code, n.course_name || n.course_code);
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [notes, collegeFilter]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (notes ?? []).filter((n) => {
      if (collegeFilter !== 'all' && n.institution_id !== collegeFilter) return false;
      if (courseFilter !== 'all' && n.course_code !== courseFilter) return false;
      if (q) {
        const hay = [n.learner_name, n.register_number, n.course_code, n.course_name, n.note]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [notes, collegeFilter, courseFilter, search]);

  const pendingIds = useMemo(() => (notes ?? []).map((n) => n.id), [notes]);
  const pendingCount = pendingIds.length;
  const filteredIds = useMemo(() => filtered.map((n) => n.id), [filtered]);
  const selectedFilteredCount = useMemo(
    () => filteredIds.filter((id) => selected.has(id)).length,
    [filteredIds, selected],
  );
  const allFilteredSelected = filtered.length > 0 && selectedFilteredCount === filtered.length;
  const busy = actingIds.size > 0;

  const toggleAllFiltered = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (filteredIds.length > 0 && filteredIds.every((id) => next.has(id))) {
        filteredIds.forEach((id) => next.delete(id));
      } else {
        filteredIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }, [filteredIds]);

  const toggleOne = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const confirmCopy =
    confirm === null
      ? null
      : confirm.action === 'approve'
        ? {
            title:
              confirm.scope === 'all'
                ? 'Approve all pending notes?'
                : `Approve ${confirm.ids.length} selected note${confirm.ids.length === 1 ? '' : 's'}?`,
            body: `You are approving ${confirm.ids.length} note${confirm.ids.length === 1 ? '' : 's'} students will see. Each student gets their note on their Learning Studio Feedback page immediately. This cannot be undone from this screen.`,
            cta:
              confirm.scope === 'all'
                ? `Approve all (${confirm.ids.length})`
                : `Approve ${confirm.ids.length}`,
          }
        : {
            title: `Reject ${confirm.ids.length} selected note${confirm.ids.length === 1 ? '' : 's'}?`,
            body: `The student${confirm.ids.length === 1 ? '' : 's'} will never see ${confirm.ids.length === 1 ? 'this note' : 'these notes'}. Rejection cannot be undone from this screen.`,
            cta: `Reject ${confirm.ids.length}`,
          };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            AI-drafted support notes for struggling students. A student never sees a note
            until you approve it here. Read the full wording — approving publishes it to
            that student&apos;s Learning Studio Feedback page.
          </p>
          <p className="text-xs text-muted-foreground">
            Waiting for review:{' '}
            <span className="font-medium text-foreground">{notes === null ? '…' : pendingCount}</span>
            {notes !== null && filtered.length !== pendingCount ? (
              <>
                {' '}
                · showing <span className="font-medium text-foreground">{filtered.length}</span> after filters
              </>
            ) : null}
            {selected.size > 0 ? (
              <>
                {' '}
                · selected <span className="font-medium text-foreground">{selected.size}</span>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadNotes} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => setConfirm({ action: 'approve', ids: pendingIds, scope: 'all' })}
            disabled={loading || busy || pendingCount === 0}
          >
            <Check className="mr-2 h-4 w-4" />
            Approve all ({pendingCount})
          </Button>
        </div>
      </div>

      {/* Triage toolbar (2026-07-11): filters narrow the table; the header
          checkbox selects everything that passes the filters; the selected-N
          buttons act on that set. */}
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={collegeFilter}
          onValueChange={(v) => {
            setCollegeFilter(v);
            setCourseFilter('all');
          }}
        >
          <SelectTrigger className="h-8 w-[230px]" aria-label="Filter by college">
            <SelectValue placeholder="All colleges" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All colleges</SelectItem>
            {collegeOptions.map(([id, name]) => (
              <SelectItem key={id} value={id}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={courseFilter} onValueChange={setCourseFilter}>
          <SelectTrigger className="h-8 w-[230px]" aria-label="Filter by course">
            <SelectValue placeholder="All courses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All courses</SelectItem>
            {courseOptions.map(([code, name]) => (
              <SelectItem key={code} value={code}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search student, course, note text…"
          className="h-8 w-[240px]"
          aria-label="Search pending notes"
        />
        {selected.size > 0 ? (
          <div className="ml-auto flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => setConfirm({ action: 'approve', ids: [...selected], scope: 'selected' })}
              disabled={busy}
            >
              <Check className="mr-1 h-4 w-4" />
              Approve selected ({selected.size})
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => setConfirm({ action: 'reject', ids: [...selected], scope: 'selected' })}
              disabled={busy}
            >
              <X className="mr-1 h-4 w-4" />
              Reject selected ({selected.size})
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} disabled={busy}>
              Clear
            </Button>
          </div>
        ) : null}
      </div>

      {loading && !notes ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : !notes || notes.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          No notes waiting for approval.
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          No pending notes match the current filters.
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">
                  <Checkbox
                    checked={allFilteredSelected}
                    onCheckedChange={toggleAllFiltered}
                    aria-label={`Select all ${filtered.length} filtered notes`}
                    disabled={busy}
                  />
                </TableHead>
                <TableHead className="w-[220px]">Student</TableHead>
                <TableHead className="w-[200px]">Course</TableHead>
                <TableHead className="w-[120px]">Week</TableHead>
                <TableHead>Note (full text)</TableHead>
                <TableHead className="w-[190px] text-right">Review</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((n) => {
                const acting = actingIds.has(n.id);
                return (
                  <TableRow key={n.id} data-state={selected.has(n.id) ? 'selected' : undefined}>
                    <TableCell className="align-top">
                      <Checkbox
                        checked={selected.has(n.id)}
                        onCheckedChange={() => toggleOne(n.id)}
                        aria-label={`Select note for ${n.learner_name || n.learner_id}`}
                        disabled={acting || busy}
                      />
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="space-y-0.5">
                        <div className="font-medium">
                          {n.learner_name || 'Unknown learner'}
                        </div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {n.register_number || n.learner_id}
                        </div>
                        {n.institution_name ? (
                          <div className="text-xs text-muted-foreground">{n.institution_name}</div>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="space-y-0.5">
                        <div className="text-sm">{n.course_name || n.course_code}</div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {n.course_code}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="space-y-0.5">
                        <div className="text-sm">{formatDate(n.week_of)}</div>
                        <div className="text-xs text-muted-foreground">
                          drafted {formatDate(n.generated_at)}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      {/* FULL note text — never truncated: the review must be real. */}
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">{n.note}</p>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <Badge variant="outline" className="px-1 py-0 text-[10px] font-normal text-muted-foreground">
                          Draft
                        </Badge>
                        {n.model && (
                          <span className="text-[10px] text-muted-foreground/70 font-mono">{n.model}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="align-top text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          onClick={() => review([n.id], 'approve')}
                          disabled={acting || busy}
                          aria-label={`Approve note for ${n.learner_name || n.learner_id}`}
                        >
                          <Check className="mr-1 h-4 w-4" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive hover:text-destructive"
                          onClick={() => review([n.id], 'reject')}
                          disabled={acting || busy}
                          aria-label={`Reject note for ${n.learner_name || n.learner_id}`}
                        >
                          <X className="mr-1 h-4 w-4" />
                          Reject
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmCopy?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmCopy?.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const c = confirm;
                setConfirm(null);
                if (c && c.ids.length > 0) review(c.ids, c.action);
              }}
            >
              {confirmCopy?.cta}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
