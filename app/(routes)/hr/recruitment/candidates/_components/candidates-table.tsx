'use client';

// The All Candidates list: a table on md+ and stacked cards below it, both fed
// the same page of rows. Actions are links only — screening and approval stay
// in the job workspace, so there is one place where a candidate is acted on.

import Link from 'next/link';
import {
  AlertTriangle, ArrowUpRight, ChevronLeft, ChevronRight, Eye, FileText, Mail,
  MoreHorizontal, Phone, Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { ROLE_CATEGORY_LABELS } from '@/types/hr-recruitment';
import type { AlumniSignalPayload } from '@/lib/services/hr/alumni-signal-service';
import { AlumniSignalLine } from '../../_components/alumni-signal-line';
import { stageMeta } from '../../approvals/[jobId]/_components/stage-model';
import { PAGE_SIZES, SOURCE_LABELS, type PipelineRow } from '../_lib/pipeline-model';

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

export const fmtExperience = (months: number | null) => {
  if (months === null) return null;
  if (months <= 0) return 'Fresher';
  const yrs = Math.floor(months / 12);
  const rem = months % 12;
  if (yrs === 0) return `${rem} mo`;
  return rem === 0 ? `${yrs} yr` : `${yrs} yr ${rem} mo`;
};

function detailHref(r: PipelineRow): string {
  return r.applicationId
    ? `/hr/recruitment/applications/${r.applicationId}`
    : `/hr/recruitment/candidates/${r.candidateId}`;
}

/** The job workspace for approvers (pre-searched to this person), else the job page. */
function jobHref(r: PipelineRow, canApprove: boolean): string | null {
  if (!r.job) return null;
  return canApprove
    ? `/hr/recruitment/approvals/${r.job.id}?q=${encodeURIComponent(r.email)}`
    : `/hr/recruitment/jobs/${r.job.id}`;
}

function StageBadge({ row }: { row: PipelineRow }) {
  const meta = stageMeta(row.stage);
  return <Badge variant="outline" className={`whitespace-nowrap ${meta.badge}`}>{meta.label}</Badge>;
}

function RowActions({ row, canApprove }: { row: PipelineRow; canApprove: boolean }) {
  const job = jobHref(row, canApprove);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${row.name}`}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href={detailHref(row)}><Eye className="mr-2 h-4 w-4" /> View details</Link>
        </DropdownMenuItem>
        {job && (
          <DropdownMenuItem asChild>
            <Link href={job}><ArrowUpRight className="mr-2 h-4 w-4" /> Open in job</Link>
          </DropdownMenuItem>
        )}
        {row.resumeUrl && (
          <DropdownMenuItem asChild>
            <a href={row.resumeUrl} target="_blank" rel="noopener noreferrer">
              <FileText className="mr-2 h-4 w-4" /> Open résumé
            </a>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PersonCell({ row, alumni }: { row: PipelineRow; alumni: AlumniSignalPayload | null }) {
  return (
    <div className="min-w-0 space-y-0.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <Link href={detailHref(row)} className="font-medium hover:underline">{row.name}</Link>
        {row.isEmergency && (
          <Badge variant="outline" className="gap-1 border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/60 dark:text-red-300">
            <AlertTriangle className="h-3 w-3" /> Emergency
          </Badge>
        )}
        {row.applicationsByPerson > 1 && (
          <Badge variant="secondary" className="gap-1 font-normal">
            <Users className="h-3 w-3" /> {row.applicationsByPerson} jobs
          </Badge>
        )}
      </div>
      <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
        <span className="inline-flex min-w-0 items-center gap-1 break-all"><Mail className="h-3 w-3 shrink-0" />{row.email}</span>
        {row.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{row.phone}</span>}
      </div>
      <AlumniSignalLine signal={alumni} className="text-xs" />
    </div>
  );
}

export function CandidatesTable({
  rows, total, page, size, canApprove, alumni, onPage, onSize,
}: {
  /** The current page only. */
  rows: PipelineRow[];
  /** Filtered total across all pages. */
  total: number;
  page: number;
  size: number;
  canApprove: boolean;
  alumni: Record<string, AlumniSignalPayload | null> | undefined;
  onPage: (page: number) => void;
  onSize: (size: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  const first = total === 0 ? 0 : (page - 1) * size + 1;
  const last = Math.min(page * size, total);
  const signal = (r: PipelineRow) => alumni?.[r.email.toLowerCase().trim()] ?? null;

  return (
    <div className="space-y-3">
      {/* md+ : table */}
      <div className="hidden rounded-lg border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Candidate</TableHead>
              <TableHead>Applied For</TableHead>
              <TableHead>College / Department</TableHead>
              <TableHead>Profile</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead>Applied</TableHead>
              <TableHead className="w-10"><span className="sr-only">Actions</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.key}>
                <TableCell className="max-w-[260px] align-top"><PersonCell row={r} alumni={signal(r)} /></TableCell>
                <TableCell className="max-w-[220px] align-top">
                  <div className="font-medium">{r.jobTitle}</div>
                  <div className="text-xs text-muted-foreground">
                    {[r.job?.job_code, r.roleCategory ? ROLE_CATEGORY_LABELS[r.roleCategory] : null]
                      .filter(Boolean).join(' · ')}
                  </div>
                </TableCell>
                <TableCell className="max-w-[200px] align-top">
                  <div>{r.institutionName ?? '—'}</div>
                  {r.job?.department_name && (
                    <div className="text-xs text-muted-foreground">{r.job.department_name}</div>
                  )}
                </TableCell>
                <TableCell className="max-w-[180px] align-top">
                  <div className="break-words">{r.qualification ?? '—'}</div>
                  {fmtExperience(r.experienceMonths) && (
                    <div className="text-xs text-muted-foreground">{fmtExperience(r.experienceMonths)}</div>
                  )}
                </TableCell>
                <TableCell className="align-top text-sm">{SOURCE_LABELS[r.source]}</TableCell>
                <TableCell className="align-top"><StageBadge row={r} /></TableCell>
                <TableCell className="whitespace-nowrap align-top text-sm">{fmtDate(r.submittedAt)}</TableCell>
                <TableCell className="align-top"><RowActions row={r} canApprove={canApprove} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* < md : cards */}
      <div className="space-y-2 md:hidden">
        {rows.map((r) => (
          <div key={r.key} className="rounded-lg border bg-card p-3">
            <div className="flex items-start justify-between gap-2">
              <PersonCell row={r} alumni={signal(r)} />
              <RowActions row={r} canApprove={canApprove} />
            </div>
            <div className="mt-2 text-sm">
              <span className="font-medium">{r.jobTitle}</span>
              <span className="text-muted-foreground"> · {r.institutionName ?? '—'}</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <StageBadge row={r} />
              {r.roleCategory && <span>{ROLE_CATEGORY_LABELS[r.roleCategory]}</span>}
              {fmtExperience(r.experienceMonths) && <span>· {fmtExperience(r.experienceMonths)}</span>}
              <span>· {fmtDate(r.submittedAt)}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
        <span className="text-muted-foreground">
          Showing {first}–{last} of {total}
        </span>
        <div className="flex items-center gap-2">
          <Select value={String(size)} onValueChange={(v) => onSize(Number(v))}>
            <SelectTrigger className="h-8 w-[110px]" aria-label="Rows per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((n) => <SelectItem key={n} value={String(n)}>{n} / page</SelectItem>)}
            </SelectContent>
          </Select>
          <Button
            variant="outline" size="icon" className="h-8 w-8"
            disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="whitespace-nowrap">Page {page} of {pages}</span>
          <Button
            variant="outline" size="icon" className="h-8 w-8"
            disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
