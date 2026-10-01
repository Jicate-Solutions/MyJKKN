'use client';

// Column definitions for the All Candidates DataTable, plus the mobile card.
// Actions are links only — screening and approval stay in the job workspace,
// so there is one place where a candidate is acted on.

import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertTriangle, ArrowUpRight, Eye, FileText, Mail, MoreHorizontal, Phone, Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DataTableColumnHeader } from '@/components/data-table/column-header';
import { JOB_TYPE_LABELS, ROLE_CATEGORY_LABELS } from '@/types/hr-recruitment';
import type { AlumniSignalPayload } from '@/lib/services/hr/alumni-signal-service';
import { AlumniSignalLine } from '../../_components/alumni-signal-line';
import { stageMeta } from '../../approvals/[jobId]/_components/stage-model';
import { SOURCE_LABELS, type PipelineRow } from '../_lib/pipeline-model';

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

export function detailHref(r: PipelineRow): string {
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
        <Link href={detailHref(row)} className="font-medium transition-colors hover:text-primary hover:underline">
          {row.name}
        </Link>
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
      <div className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
        <Mail className="h-3 w-3 shrink-0" /><span className="truncate">{row.email}</span>
      </div>
      <AlumniSignalLine signal={alumni} className="text-xs" />
    </div>
  );
}

const muted = (v: string | null | undefined) =>
  v ? <span className="text-sm">{v}</span> : <span className="text-muted-foreground">—</span>;

export function getCandidateColumns({
  canApprove, alumni,
}: {
  canApprove: boolean;
  alumni: Record<string, AlumniSignalPayload | null> | undefined;
}): ColumnDef<PipelineRow>[] {
  const signal = (r: PipelineRow) => alumni?.[r.email.toLowerCase().trim()] ?? null;
  return [
    {
      id: 'select',
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
      enableHiding: false,
      size: 40, minSize: 40, maxSize: 40,
    },
    {
      id: 'name',
      accessorKey: 'name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Candidate" />,
      cell: ({ row }) => <PersonCell row={row.original} alumni={signal(row.original)} />,
      enableHiding: false,
      size: 260, minSize: 200, maxSize: 400,
    },
    {
      id: 'phone',
      accessorKey: 'phone',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Phone" />,
      cell: ({ row }) =>
        row.original.phone ? (
          <span className="inline-flex items-center gap-1 whitespace-nowrap text-sm">
            <Phone className="h-3 w-3 text-muted-foreground" />{row.original.phone}
          </span>
        ) : muted(null),
      enableSorting: false,
      size: 140, minSize: 120, maxSize: 200,
    },
    {
      id: 'jobTitle',
      accessorKey: 'jobTitle',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Applied For" />,
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="font-medium">{row.original.jobTitle}</div>
          {row.original.job?.job_code && (
            <div className="text-xs text-muted-foreground">{row.original.job.job_code}</div>
          )}
        </div>
      ),
      size: 220, minSize: 160, maxSize: 360,
    },
    {
      id: 'institutionName',
      accessorKey: 'institutionName',
      header: ({ column }) => <DataTableColumnHeader column={column} title="College / Department" />,
      cell: ({ row }) => (
        <div className="min-w-0">
          <div className="text-sm">{row.original.institutionName ?? '—'}</div>
          {row.original.job?.department_name && (
            <div className="text-xs text-muted-foreground">{row.original.job.department_name}</div>
          )}
        </div>
      ),
      size: 210, minSize: 160, maxSize: 320,
    },
    {
      id: 'roleCategory',
      accessorKey: 'roleCategory',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Category" />,
      cell: ({ row }) => muted(row.original.roleCategory ? ROLE_CATEGORY_LABELS[row.original.roleCategory] : null),
      size: 150, minSize: 120, maxSize: 220,
    },
    {
      id: 'jobType',
      accessorFn: (r) => r.job?.job_type ?? null,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Job Type" />,
      cell: ({ row }) => muted(row.original.job?.job_type ? JOB_TYPE_LABELS[row.original.job.job_type] : null),
      enableSorting: false,
      size: 120, minSize: 100, maxSize: 180,
    },
    {
      id: 'qualification',
      accessorKey: 'qualification',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Qualification" />,
      cell: ({ row }) => <span className="break-words text-sm">{row.original.qualification ?? '—'}</span>,
      size: 180, minSize: 120, maxSize: 300,
    },
    {
      id: 'experienceMonths',
      accessorKey: 'experienceMonths',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Experience" />,
      cell: ({ row }) => muted(fmtExperience(row.original.experienceMonths)),
      size: 120, minSize: 100, maxSize: 160,
    },
    {
      id: 'currentCompany',
      accessorKey: 'currentCompany',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Current Role" />,
      cell: ({ row }) => (
        <div className="min-w-0 text-sm">
          <div>{row.original.currentTitle ?? '—'}</div>
          {row.original.currentCompany && (
            <div className="text-xs text-muted-foreground">{row.original.currentCompany}</div>
          )}
        </div>
      ),
      enableSorting: false,
      size: 180, minSize: 140, maxSize: 280,
    },
    {
      id: 'workedCities',
      accessorFn: (r) => r.workedCities.join(', '),
      header: ({ column }) => <DataTableColumnHeader column={column} title="Cities Worked" />,
      cell: ({ row }) => muted(row.original.workedCities.join(', ') || null),
      enableSorting: false,
      size: 160, minSize: 120, maxSize: 260,
    },
    {
      id: 'source',
      accessorKey: 'source',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Source" />,
      cell: ({ row }) => <span className="whitespace-nowrap text-sm">{SOURCE_LABELS[row.original.source]}</span>,
      size: 140, minSize: 110, maxSize: 200,
    },
    {
      id: 'stage',
      accessorKey: 'stage',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Stage" />,
      cell: ({ row }) => <StageBadge row={row.original} />,
      size: 140, minSize: 120, maxSize: 200,
    },
    {
      id: 'submittedAt',
      accessorKey: 'submittedAt',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Applied" />,
      cell: ({ row }) => <span className="whitespace-nowrap text-sm">{fmtDate(row.original.submittedAt)}</span>,
      size: 120, minSize: 100, maxSize: 160,
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => <RowActions row={row.original} canApprove={canApprove} />,
      enableSorting: false,
      enableHiding: false,
      size: 56, minSize: 56, maxSize: 56,
    },
  ];
}

/** Columns hidden on first load — available from the table's View menu. */
export const INITIAL_COLUMN_VISIBILITY: Record<string, boolean> = {
  phone: false,
  jobType: false,
  currentCompany: false,
  workedCities: false,
};

/** The card shown instead of a table row below md. */
export function CandidateMobileCard({
  row, canApprove, alumni,
}: {
  row: PipelineRow;
  canApprove: boolean;
  alumni: AlumniSignalPayload | null;
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <PersonCell row={row} alumni={alumni} />
        <RowActions row={row} canApprove={canApprove} />
      </div>
      <div className="mt-2 text-sm">
        <span className="font-medium">{row.jobTitle}</span>
        <span className="text-muted-foreground"> · {row.institutionName ?? '—'}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <StageBadge row={row} />
        {row.roleCategory && <span>{ROLE_CATEGORY_LABELS[row.roleCategory]}</span>}
        {fmtExperience(row.experienceMonths) && <span>· {fmtExperience(row.experienceMonths)}</span>}
        <span>· {fmtDate(row.submittedAt)}</span>
      </div>
    </div>
  );
}
