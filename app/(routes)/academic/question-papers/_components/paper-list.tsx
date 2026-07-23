'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { FileText, Loader2, ChevronRight, Download, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQuestionPapers, useApprovePapers } from '@/hooks/question-papers/use-question-papers';
import { IaPaperService } from '@/lib/services/question-papers/ia-paper-service';
import { PAPER_STATUS_META } from '@/types/ia-question-paper';
import { isPracticalCategory } from '@/lib/utils/question-papers/course-category';
import type { IaQuestionPaper } from '@/types/ia-question-paper';
import type { QuestionPaperFilterState } from './question-paper-filters';

/** Papers an approver may still act on (not yet approved/locked). */
function isApprovable(p: IaQuestionPaper): boolean {
  return p.status === 'draft' || p.status === 'submitted';
}

/**
 * Practical is decided by the CANONICAL COE `courses.course_category` (enriched by
 * the proxy) — never by title/code/course_type, which disagree with it in real data.
 * Exact-token match, so "Theory + Practical" stays visible in the Theory view.
 * Unknown category => shown (fail open, never hide a paper we can't classify).
 */
function isPracticalPaper(p: IaQuestionPaper): boolean {
  return isPracticalCategory(p.course_category);
}

interface Props {
  institutionId: string | undefined;
  filters: Partial<QuestionPaperFilterState>;
  /** Whether the user may export a paper PDF. */
  canExport: boolean;
  /** Whether the user may approve papers (HOD / principal / CoE / super_admin). */
  canApprove: boolean;
  onOpen: (paperId: string) => void;
}

export function PaperList({ institutionId, filters, canExport, canApprove, onOpen }: Props) {
  const [theoryOnly, setTheoryOnly] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const approve = useApprovePapers();
  const listFilters = {
    institutionId,
    examSessionId: filters.exam_session_id,
    ciaRound: filters.cia_round,
    programCode: filters.program_code || undefined,
    semester: filters.semester,
  };
  const { data: papers, isLoading, isFetching } = useQuestionPapers(
    listFilters,
    !!institutionId && !!filters.exam_session_id && !!filters.program_code
  );

  // Require a Program so the same course_code offered into multiple programs
  // (e.g. a shared generic elective) doesn't stack up as look-alike duplicates.
  if (!filters.exam_session_id || !filters.program_code) {
    return (
      <Card>
        <CardContent className='flex flex-col items-center justify-center py-12'>
          <FileText className='h-12 w-12 text-muted-foreground mb-4' />
          <p className='text-muted-foreground text-center'>
            Select Exam Session and Program to view question papers.
          </p>
        </CardContent>
      </Card>
    );
  }

  const allPapers = papers ?? [];
  const practicalCount = allPapers.filter(isPracticalPaper).length;
  const visiblePapers = theoryOnly ? allPapers.filter((p) => !isPracticalPaper(p)) : allPapers;

  // Approval selection (approvers only): draft/submitted papers can be approved.
  const approvablePapers = visiblePapers.filter(isApprovable);
  const selectedApprovable = approvablePapers.filter((p) => selected.has(p.id));
  const allApprovableSelected =
    approvablePapers.length > 0 && approvablePapers.every((p) => selected.has(p.id));
  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () =>
    setSelected(allApprovableSelected ? new Set() : new Set(approvablePapers.map((p) => p.id)));
  const doApprove = (list: IaQuestionPaper[]) =>
    approve.mutate(
      list.map((p) => ({ id: p.id, base_updated_at: p.updated_at })),
      { onSuccess: () => setSelected(new Set()) }
    );

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between gap-2'>
        <div className='flex items-center gap-2 text-sm text-muted-foreground'>
          {(isLoading || isFetching) && <Loader2 className='h-4 w-4 animate-spin' />}
          {papers != null && (
            <span>{visiblePapers.length} paper{visiblePapers.length === 1 ? '' : 's'}</span>
          )}
        </div>
        {/* Theory-only is the default; toggle to include practical/lab papers. */}
        <div className='inline-flex rounded-md border p-0.5'>
          <Button
            size='sm'
            variant={theoryOnly ? 'secondary' : 'ghost'}
            className='h-7 px-3 text-xs'
            onClick={() => setTheoryOnly(true)}
          >
            Theory
          </Button>
          <Button
            size='sm'
            variant={!theoryOnly ? 'secondary' : 'ghost'}
            className='h-7 px-3 text-xs'
            onClick={() => setTheoryOnly(false)}
          >
            All{practicalCount > 0 ? ` (+${practicalCount} practical)` : ''}
          </Button>
        </div>
      </div>

      {/* Bulk approve — approvers only. Select all / N, then Approve. */}
      {canApprove && approvablePapers.length > 0 && (
        <div className='flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2'>
          <label className='flex items-center gap-2 text-sm cursor-pointer select-none'>
            <Checkbox checked={allApprovableSelected} onCheckedChange={toggleAll} />
            Select all approvable ({approvablePapers.length})
          </label>
          <Button
            size='sm'
            disabled={selectedApprovable.length === 0 || approve.isPending}
            onClick={() => doApprove(selectedApprovable)}
          >
            {approve.isPending
              ? <Loader2 className='h-4 w-4 mr-1 animate-spin' />
              : <CheckCircle2 className='h-4 w-4 mr-1' />}
            Approve ({selectedApprovable.length})
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className='flex items-center justify-center py-12'>
          <Loader2 className='h-8 w-8 animate-spin text-muted-foreground' />
        </div>
      ) : visiblePapers.length === 0 ? (
        <Card>
          <CardContent className='flex flex-col items-center justify-center py-12 text-center'>
            <FileText className='h-10 w-10 text-muted-foreground mb-3' />
            <p className='text-muted-foreground'>
              {allPapers.length > 0 && theoryOnly
                ? 'No theory papers for this selection (only practical/lab papers exist).'
                : 'No question papers for this selection.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className='grid grid-cols-1 gap-2'>
          {visiblePapers.map((p) => {
            const meta = PAPER_STATUS_META[p.status];
            return (
              <div
                key={p.id}
                role='button'
                tabIndex={0}
                onClick={() => onOpen(p.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(p.id); }
                }}
                className='w-full text-left rounded-md border p-3 hover:bg-muted/50 transition-colors flex items-center gap-3 cursor-pointer'
              >
                {canApprove && isApprovable(p) && (
                  <span onClick={(e) => e.stopPropagation()} className='shrink-0 flex'>
                    <Checkbox
                      checked={selected.has(p.id)}
                      onCheckedChange={() => toggleOne(p.id)}
                      aria-label={`Select ${p.course_code}`}
                    />
                  </span>
                )}
                <FileText className='h-5 w-5 text-muted-foreground shrink-0' />
                <div className='min-w-0 flex-1'>
                  <div className='flex items-center gap-2'>
                    <span className='font-mono text-sm font-medium'>{p.course_code}</span>
                    {p.program_code && (
                      <span className='text-[11px] text-muted-foreground'>· {p.program_code}</span>
                    )}
                    {p.set_label && <Badge variant='outline' className='text-[10px]'>Set {p.set_label}</Badge>}
                    <Badge variant='outline' className={cn('text-[10px] border', meta.className)}>
                      {meta.label}
                    </Badge>
                  </div>
                  <p className='text-xs text-muted-foreground truncate'>{p.subject_title}</p>
                </div>
                <span className='text-xs text-muted-foreground shrink-0'>
                  {p.max_marks != null ? `${p.max_marks} marks` : ''}
                </span>
                {canExport && (
                  <Button
                    variant='ghost'
                    size='sm'
                    className='h-8 px-2 shrink-0'
                    title={p.authored ? 'Download PDF' : 'Author the paper before exporting'}
                    disabled={!p.authored}
                    onClick={(e) => { e.stopPropagation(); IaPaperService.downloadPaperPdf(p.id); }}
                  >
                    <Download className='h-4 w-4' />
                  </Button>
                )}
                {canApprove && isApprovable(p) && (
                  <Button
                    variant='ghost'
                    size='sm'
                    className='h-8 px-2 shrink-0 text-emerald-600'
                    title='Approve this paper'
                    disabled={approve.isPending}
                    onClick={(e) => { e.stopPropagation(); doApprove([p]); }}
                  >
                    <CheckCircle2 className='h-4 w-4' />
                  </Button>
                )}
                <ChevronRight className='h-4 w-4 text-muted-foreground shrink-0' />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
