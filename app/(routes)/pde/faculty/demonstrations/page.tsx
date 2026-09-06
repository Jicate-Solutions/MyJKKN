'use client';

// =============================================================================
// Faculty Demonstration Reviews — durable-value taxonomy (Option A).
//
// Rebuilt 2026-06-15 from a mock shell into a real review queue. Reads the
// institution-scoped queue via `fn_pde_review_queue` and records decisions via
// `fn_pde_validate_demonstration` (faculty RLS is SELECT-only, so the write
// goes through the locked RPC). Categories are the 7 durable-value categories
// learners actually submit under — the page no longer speaks the legacy
// capability vocabulary, so a learner's "Embodied Practice" submission lines up
// with what the reviewer filters and sees.
// =============================================================================

import { useMemo, useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { BeatLoader } from 'react-spinners';
import { CheckCircle, XCircle, Eye, Sparkles, ExternalLink, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { useReviewQueue, useValidateDemonstration } from '@/hooks/pde/use-pde';
import {
  PDE_CATEGORY_KEYS,
  PDE_CATEGORY_LABELS,
  type PDECategoryKey,
} from '@/lib/services/pde-cohort-types';
import type {
  PDEReviewQueueRow,
  PDEDemonstrationStatus,
} from '@/lib/types/pde-demonstrations';

// The real pde_demonstrations status machine (no mock "approved/reviewed").
const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  submitted: { label: 'Awaiting Review', color: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300' },
  under_review: { label: 'Under Review', color: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300' },
  validated: { label: 'Validated', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' },
  scored: { label: 'Scored', color: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300' },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300' },
};

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'All Statuses' },
  { value: 'submitted', label: 'Awaiting Review' },
  { value: 'under_review', label: 'Under Review' },
  { value: 'validated', label: 'Validated' },
  { value: 'scored', label: 'Scored' },
  { value: 'rejected', label: 'Rejected' },
];

const isReviewable = (status: string) =>
  status === 'submitted' || status === 'under_review';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function categoryLabel(key: string): string {
  return PDE_CATEGORY_LABELS[key as PDECategoryKey] ?? key;
}

export default function FacultyDemonstrationsPage() {
  const [categoryFilter, setCategoryFilter] = useState<'all' | PDECategoryKey>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const {
    data: rows = [],
    isLoading,
    isError,
    error,
  } = useReviewQueue(
    categoryFilter === 'all' ? undefined : categoryFilter,
    statusFilter === 'all' ? undefined : (statusFilter as PDEDemonstrationStatus)
  );

  const pendingCount = useMemo(
    () => rows.filter((r) => r.status === 'submitted').length,
    [rows]
  );

  // Review dialog state
  const [active, setActive] = useState<PDEReviewQueueRow | null>(null);
  const [score, setScore] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const validate = useValidateDemonstration();

  function openReview(row: PDEReviewQueueRow) {
    setActive(row);
    setScore(row.raw_score != null ? String(row.raw_score) : '');
    setNotes('');
  }

  function resetDialog() {
    setActive(null);
    setScore('');
    setNotes('');
  }

  async function submitDecision(decision: 'validated' | 'rejected' | 'changes_requested') {
    if (!active) return;
    if (decision === 'validated') {
      const n = Number(score);
      if (score.trim() === '' || Number.isNaN(n) || n < 0 || n > 100) {
        toast.error('Enter a score between 0 and 100 to validate.');
        return;
      }
    }
    // "Request changes" must tell the learner what to fix — a note is required.
    if (decision === 'changes_requested' && notes.trim() === '') {
      toast.error('Add a note telling the learner what to change before requesting changes.');
      return;
    }
    try {
      await validate.mutateAsync({
        demonstrationId: active.id,
        decision,
        rawScore: decision === 'validated' ? Number(score) : null,
        notes: notes.trim() || null,
      });
      toast.success(
        decision === 'validated'
          ? 'Demonstration validated — it now moves to scoring.'
          : decision === 'changes_requested'
            ? 'Sent back for changes. The learner can edit and resubmit with your note.'
            : 'Demonstration rejected. The learner will see your note.'
      );
      resetDialog();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not record your decision.');
    }
  }

  const activeEvidence = (active?.evidence ?? {}) as {
    url?: string;
    notes?: string;
    type?: string;
  };

  return (
    <ContentLayout title="Demonstration Reviews">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Faculty', href: '/faculty' },
          { label: 'PDE', href: '/pde/faculty/dashboard' },
          { label: 'Reviews' },
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div>
            <h1 className="text-2xl font-bold py-1" style={{ color: '#0b6d41' }}>
              Demonstration Reviews
            </h1>
            <p className="text-sm text-muted-foreground">
              Review learner demonstrations across the seven durable-value categories — validate with a score, or return with feedback.
            </p>
          </div>
          {pendingCount > 0 && (
            <button
              type="button"
              onClick={() => setStatusFilter('submitted')}
              title="Show only demonstrations awaiting review"
              className="focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded-full"
            >
              <Badge className="bg-[#ffde59] text-amber-900 border-amber-300 text-sm px-3 py-1 cursor-pointer hover:brightness-95">
                {pendingCount} awaiting review
              </Badge>
            </button>
          )}
        </div>

        {/* Filters */}
        <Card className="bg-[#fbfbee]/30 dark:bg-card">
          <CardContent className="p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <span className="text-sm font-medium text-muted-foreground">Category:</span>
                <Select
                  value={categoryFilter}
                  onValueChange={(v) => setCategoryFilter(v as 'all' | PDECategoryKey)}
                >
                  <SelectTrigger className="w-full sm:w-[240px]">
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {PDE_CATEGORY_KEYS.map((key) => (
                      <SelectItem key={key} value={key}>
                        {PDE_CATEGORY_LABELS[key]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <span className="text-sm font-medium text-muted-foreground">Status:</span>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full sm:w-[200px]">
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_FILTERS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Queue */}
        <Card className="bg-[#fbfbee]/30 dark:bg-card">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex justify-center p-8">
                <BeatLoader color="#0b6d41" />
              </div>
            ) : isError ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <XCircle className="h-12 w-12 text-red-400 mb-4" />
                <h3 className="text-lg font-medium mb-1">Couldn&apos;t load the review queue</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  {error instanceof Error ? error.message : 'Please try again.'}
                </p>
              </div>
            ) : rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Sparkles className="h-12 w-12 text-muted-foreground/40 mb-4" />
                <h3 className="text-lg font-medium mb-1">Nothing to review</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  When learners submit demonstrations in your institution, they appear here. Validate them with a score, or return them with feedback.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Learner</TableHead>
                    <TableHead>Skill</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-center">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const statusConf = STATUS_CONFIG[row.status] ?? {
                      label: row.status,
                      color: 'bg-muted text-muted-foreground',
                    };
                    return (
                      <TableRow key={row.id} className="hover:bg-muted/50">
                        <TableCell className="font-medium">{row.learner_name}</TableCell>
                        <TableCell>{row.skill_name || <span className="text-muted-foreground">—</span>}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {categoryLabel(row.category_key)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(row.submitted_at)}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className={`text-xs ${statusConf.color}`}>
                            {statusConf.label}
                            {row.status === 'scored' && row.passed != null
                              ? row.passed ? ' · Pass' : ' · Fail'
                              : ''}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            size="sm"
                            variant={isReviewable(row.status) ? 'default' : 'outline'}
                            className={
                              isReviewable(row.status)
                                ? 'text-xs h-7 bg-[#0b6d41] hover:bg-[#0b6d41]/90'
                                : 'text-xs h-7'
                            }
                            onClick={() => openReview(row)}
                          >
                            {isReviewable(row.status) ? (
                              <>
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Review
                              </>
                            ) : (
                              <>
                                <Eye className="h-3 w-3 mr-1" />
                                View
                              </>
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Review / detail dialog */}
      <Dialog open={!!active} onOpenChange={(open) => { if (!open && !validate.isPending) resetDialog(); }}>
        <DialogContent className="sm:max-w-lg">
          {active && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {isReviewable(active.status) ? 'Review demonstration' : 'Demonstration detail'}
                </DialogTitle>
                <DialogDescription>
                  {active.learner_name} · {categoryLabel(active.category_key)}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 text-sm">
                <div>
                  <span className="font-medium">Skill: </span>
                  {active.skill_name || <span className="text-muted-foreground">Not specified</span>}
                </div>

                {/* Evidence */}
                <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Evidence
                  </div>
                  {active.evidence_type && (
                    <Badge variant="outline" className="text-xs capitalize">
                      {active.evidence_type.replace(/_/g, ' ')}
                    </Badge>
                  )}
                  {activeEvidence.url && (
                    <a
                      href={activeEvidence.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-[#0b6d41] hover:underline break-all"
                    >
                      <ExternalLink className="h-3 w-3 shrink-0" />
                      {activeEvidence.url}
                    </a>
                  )}
                  {activeEvidence.notes && (
                    <p className="text-muted-foreground whitespace-pre-wrap">{activeEvidence.notes}</p>
                  )}
                  {!active.evidence_type && !activeEvidence.url && !activeEvidence.notes && (
                    <p className="text-muted-foreground">No structured evidence attached.</p>
                  )}
                </div>

                {isReviewable(active.status) ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="raw-score">Score (0–100)</Label>
                      <Input
                        id="raw-score"
                        type="number"
                        min={0}
                        max={100}
                        value={score}
                        onChange={(e) => setScore(e.target.value)}
                        placeholder="e.g. 82"
                        disabled={validate.isPending}
                      />
                      <p className="text-xs text-muted-foreground">
                        Required to validate. Final weighted score &amp; pass/fail are computed downstream from policy weights.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="review-notes">Feedback / notes</Label>
                      <Textarea
                        id="review-notes"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="What was strong, what to improve. Shown to the learner on a rejection or when you request changes (required to request changes)."
                        rows={3}
                        disabled={validate.isPending}
                      />
                    </div>
                  </>
                ) : (
                  <div className="rounded-md border p-3 space-y-1">
                    <div>
                      <span className="font-medium">Outcome: </span>
                      {STATUS_CONFIG[active.status]?.label ?? active.status}
                    </div>
                    {active.raw_score != null && (
                      <div>
                        <span className="font-medium">Raw score: </span>
                        {active.raw_score}
                      </div>
                    )}
                    {active.status === 'scored' && active.weighted_score != null && (
                      <div>
                        <span className="font-medium">Weighted score: </span>
                        {active.weighted_score}
                        {active.passed != null ? (active.passed ? ' · Pass' : ' · Fail') : ''}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <DialogFooter className="gap-2 sm:gap-2 sm:flex-wrap">
                {isReviewable(active.status) ? (
                  <>
                    <Button
                      variant="destructive"
                      onClick={() => submitDecision('rejected')}
                      disabled={validate.isPending}
                    >
                      <XCircle className="h-4 w-4 mr-1" />
                      Reject
                    </Button>
                    <Button
                      className="bg-[#ffde59] text-amber-900 hover:bg-[#ffde59]/90 border border-amber-300"
                      onClick={() => submitDecision('changes_requested')}
                      disabled={validate.isPending}
                      title="Send back to the learner with feedback so they can edit and resubmit"
                    >
                      <RotateCcw className="h-4 w-4 mr-1" />
                      Request changes
                    </Button>
                    <Button
                      className="bg-[#0b6d41] hover:bg-[#0b6d41]/90"
                      onClick={() => submitDecision('validated')}
                      disabled={validate.isPending}
                    >
                      <CheckCircle className="h-4 w-4 mr-1" />
                      {validate.isPending ? 'Saving…' : 'Validate'}
                    </Button>
                  </>
                ) : (
                  <Button variant="outline" onClick={resetDialog}>
                    Close
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </ContentLayout>
  );
}
