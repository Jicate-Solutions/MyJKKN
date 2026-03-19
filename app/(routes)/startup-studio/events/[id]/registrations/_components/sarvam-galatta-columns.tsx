'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Database, ExternalLink,
  Github, MoreHorizontal, Rocket, ShieldCheck, ShieldX,
} from 'lucide-react';
import type { PermissionColumnDef } from '@/components/ui/data-table';
import type { SarvamGalattaRegistration } from '@/types/sarvam-galatta';
import Link from 'next/link';

// ── helpers ─────────────────────────────────────────────────────

function LinkCell({ url }: { url: string | null | undefined }) {
  if (!url) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <Link
      href={url ?? ''}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
    >
      View <ExternalLink className="h-3 w-3" />
    </Link>
  );
}


function ApprovalBadge({ status }: { status: string }) {
  if (status === 'shortlisted') {
    return (
      <Badge variant="outline" className="gap-1 border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/20 text-xs whitespace-nowrap">
        <ShieldCheck className="h-3 w-3" /> Shortlisted
      </Badge>
    );
  }
  if (status === 'rejected') {
    return (
      <Badge variant="outline" className="gap-1 border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/20 text-xs whitespace-nowrap">
        <ShieldX className="h-3 w-3" /> Rejected
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/20 text-xs whitespace-nowrap">
      Waitlisted
    </Badge>
  );
}

// ── column factory ───────────────────────────────────────────────

export interface SarvamGalattaColumnOptions {
  onViewDetails: (row: SarvamGalattaRegistration) => void;
  onApprove: (id: string, status: 'shortlisted' | 'rejected') => void;
  approvePending: boolean;
}

export function getSarvamGalattaColumns(
  options: SarvamGalattaColumnOptions
): PermissionColumnDef<SarvamGalattaRegistration>[] {
  const { onViewDetails, onApprove, approvePending } = options;

  return [
    // ── Student ──────────────────────────────────────────────────
    {
      id: 'student',
      accessorFn: (row) => `${row.snap_first_name} ${row.snap_last_name ?? ''}`.trim(),
      header: 'Student',
      enableHiding: false,
      cell: ({ row }) => {
        const r = row.original;
        const name = `${r.snap_first_name} ${r.snap_last_name ?? ''}`.trim();
        return (
          <div
            className="min-w-[140px] cursor-pointer"
            onClick={() => onViewDetails(r)}
          >
            <p className="font-medium text-sm text-primary hover:underline">{name}</p>
            {r.owner_email && (
              <p className="text-xs text-muted-foreground">{r.owner_email}</p>
            )}
          </div>
        );
      },
    },

    // ── Institution ──────────────────────────────────────────────
    {
      id: 'institution',
      accessorFn: (row) => row.institution_name ?? '',
      header: 'Institution',
      cell: ({ row }) => (
        <span className="text-sm">{row.original.institution_name ?? '—'}</span>
      ),
    },

    // ── Program · Semester ───────────────────────────────────────
    {
      id: 'program',
      accessorFn: (row) => `${row.program_name ?? ''} ${row.semester_name ?? ''}`,
      header: 'Program · Semester',
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div className="min-w-[120px]">
            <p className="text-sm">{r.program_name ?? '—'}</p>
            {r.semester_name && (
              <p className="text-xs text-muted-foreground">{r.semester_name}</p>
            )}
          </div>
        );
      },
    },

    // ── Project URL ──────────────────────────────────────────────
    {
      id: 'project_url',
      accessorKey: 'project_url',
      header: 'Project',
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Rocket className="h-3 w-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <LinkCell url={row.original.project_url} />
        </div>
      ),
    },

    // ── GitHub ───────────────────────────────────────────────────
    {
      id: 'github_url',
      accessorKey: 'github_url',
      header: 'GitHub',
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Github className="h-3 w-3 shrink-0" />
          <LinkCell url={row.original.github_url} />
        </div>
      ),
    },

    // ── Supabase URL ─────────────────────────────────────────────
    {
      id: 'supabase_project_url',
      accessorKey: 'supabase_project_url',
      header: 'Supabase',
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Database className="h-3 w-3 text-emerald-500 dark:text-emerald-400 shrink-0" />
          <LinkCell url={row.original.supabase_project_url} />
        </div>
      ),
    },



    // ── Team Code ────────────────────────────────────────────────
    {
      id: 'team_code',
      accessorKey: 'team_code',
      header: 'Code',
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.team_code ?? '—'}
        </span>
      ),
    },

    // ── Submitted ────────────────────────────────────────────────
    {
      id: 'submitted_at',
      accessorKey: 'submitted_at',
      header: 'Submitted',
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {new Date(row.original.submitted_at).toLocaleDateString('en-IN', {
            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
          })}
        </span>
      ),
    },

    // ── Approval ─────────────────────────────────────────────────
    {
      id: 'approval_status',
      accessorKey: 'approval_status',
      header: 'Approval',
      enableHiding: false,
      cell: ({ row }) => (
        <ApprovalBadge status={row.original.approval_status ?? 'waitlisted'} />
      ),
      meta: { className: 'text-center' },
    },

    // ── Actions ──────────────────────────────────────────────────
    {
      id: 'actions',
      header: '',
      enableHiding: false,
      enableSorting: false,
      cell: ({ row }) => {
        const r = row.original;
        const status = r.approval_status ?? 'waitlisted';
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="gap-2" onClick={() => onViewDetails(r)}>
                <ExternalLink className="h-4 w-4" />
                View Details
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="gap-2 text-green-700 dark:text-green-400 focus:text-green-700 dark:focus:text-green-400"
                disabled={status === 'shortlisted' || approvePending}
                onClick={() => onApprove(r.id, 'shortlisted')}
              >
                <ShieldCheck className="h-4 w-4" />
                Shortlist
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="gap-2 text-destructive dark:text-red-400 focus:text-destructive dark:focus:text-red-400"
                disabled={status === 'rejected' || approvePending}
                onClick={() => onApprove(r.id, 'rejected')}
              >
                <ShieldX className="h-4 w-4" />
                Reject
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
}
