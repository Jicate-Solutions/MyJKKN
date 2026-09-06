'use client';

/**
 * Status Report List — table of project status reports.
 *
 * Columns: period, RAG badge, summary (truncated), type, actions (edit/delete).
 *
 * Spec: specs/pm-projects-module-2026-05-26.md — Feature F8.
 */

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { TAP_TARGET_ICON } from '@/app/(routes)/projects/_lib/tap-targets';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { MoreHorizontal, Pencil, Plus, Trash2, FileText } from 'lucide-react';
import { StatusReportDialog } from './status-report-dialog';
import {
  useStatusReports,
  useDeleteStatusReport,
} from '@/hooks/projects/use-stakeholders';
import type { ProjectStatusReport } from '@/types/projects';

// ─── RAG badge ────────────────────────────────────────────────────────────────────

const RAG_STYLE: Record<string, string> = {
  red: 'bg-red-100 text-red-800 border-red-200',
  amber: 'bg-amber-100 text-amber-800 border-amber-200',
  green: 'bg-green-100 text-green-800 border-green-200',
};

const RAG_LABEL: Record<string, string> = {
  red: 'Red',
  amber: 'Amber',
  green: 'Green',
};

function RagBadge({ rag }: { rag: string | null }) {
  if (!rag) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <Badge
      variant="outline"
      className={RAG_STYLE[rag] ?? 'bg-muted text-muted-foreground'}
    >
      {RAG_LABEL[rag] ?? rag}
    </Badge>
  );
}

function formatPeriod(
  start: string | null,
  end: string | null
): string {
  if (!start && !end) return '—';
  if (start && end) return `${start} → ${end}`;
  return start ?? end ?? '—';
}

interface StatusReportListProps {
  projectId: string;
}

export function StatusReportList({ projectId }: StatusReportListProps) {
  const {
    data: reports,
    isLoading,
    isError,
    error,
  } = useStatusReports(projectId);
  const deleteReport = useDeleteStatusReport(projectId);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectStatusReport | null>(null);
  const [deleting, setDeleting] = useState<ProjectStatusReport | null>(null);

  function handleEdit(r: ProjectStatusReport) {
    setEditing(r);
    setDialogOpen(true);
  }

  function handleDialogChange(open: boolean) {
    setDialogOpen(open);
    if (!open) setEditing(null);
  }

  function confirmDelete() {
    if (!deleting) return;
    deleteReport.mutate(deleting.id, {
      onSuccess: () => {
        toast.success('Status report deleted.');
        setDeleting(null);
      },
      onError: (err) => {
        toast.error(`Failed to delete: ${(err as Error).message}`);
        setDeleting(null);
      },
    });
  }

  if (isError) {
    return (
      <p className="text-sm text-destructive">
        Failed to load status reports:{' '}
        {error instanceof Error ? error.message : 'Unknown error'}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">
          {isLoading
            ? 'Loading…'
            : `${reports?.length ?? 0} report${
                (reports?.length ?? 0) !== 1 ? 's' : ''
              }`}
        </h3>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          New report
        </Button>
      </div>

      {!isLoading && (!reports || reports.length === 0) ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
          <FileText className="mb-3 h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm font-medium">No status reports yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Create weekly status reports to keep stakeholders informed.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="mt-4"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Create first report
          </Button>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead className="w-[100px]">RAG</TableHead>
                <TableHead>Summary</TableHead>
                <TableHead className="w-[90px]">Type</TableHead>
                <TableHead className="w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(reports ?? []).map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-sm whitespace-nowrap">
                    {formatPeriod(r.report_period_start, r.report_period_end)}
                  </TableCell>
                  <TableCell>
                    <RagBadge rag={r.rag_status ?? null} />
                  </TableCell>
                  <TableCell className="max-w-[320px]">
                    <p className="text-sm line-clamp-2 text-muted-foreground">
                      {r.summary ?? '—'}
                    </p>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs capitalize">
                      {r.generated_type ?? 'manual'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`h-8 w-8 ${TAP_TARGET_ICON}`}
                          aria-label="Report actions"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEdit(r)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => setDeleting(r)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create / edit dialog */}
      <StatusReportDialog
        open={dialogOpen}
        onOpenChange={handleDialogChange}
        projectId={projectId}
        report={editing}
      />

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete status report?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting
                ? `Delete the report for period "${formatPeriod(
                    deleting.report_period_start,
                    deleting.report_period_end
                  )}"? This cannot be undone.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteReport.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDelete}
              disabled={deleteReport.isPending}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
