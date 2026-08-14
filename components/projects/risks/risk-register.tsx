'use client';

/**
 * Risk Register — table of all risks for one project.
 *
 * Columns: title, category, severity (simple H/M/L or matrix L×I + RAG band),
 * status, escalation badge, actions. A row expands to reveal its mitigation
 * steps and an escalate button. Edit / delete / escalate open controlled
 * dialogs (AlertDialog open is explicit state — no onOpenChange race).
 *
 * Spec: specs/pm-projects-module-2026-05-26.md — Feature F3.
 */

import { Fragment, useState } from 'react';
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
import { TAP_TARGET, TAP_TARGET_ICON } from '@/app/(routes)/projects/_lib/tap-targets';
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
import {
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  AlertTriangle,
  ShieldAlert,
} from 'lucide-react';
import { RiskFormDialog } from './risk-form-dialog';
import { EscalationDialog } from './escalation-dialog';
import { MitigationStepList } from './mitigation-step-list';
import { SeverityCell, EscalationBadge } from './rag-badge';
import { useRisks, useDeleteRisk } from '@/hooks/projects/use-risks';
import { RISK_STATUS_OPTIONS } from '@/types/projects-risks';
import type { ProjectRisk } from '@/types/projects';

function statusLabel(key: string): string {
  return RISK_STATUS_OPTIONS.find((s) => s.key === key)?.label ?? key;
}

interface RiskRegisterProps {
  projectId: string;
}

export function RiskRegister({ projectId }: RiskRegisterProps) {
  const { data: risks, isLoading, isError, error } = useRisks(projectId);
  const deleteRisk = useDeleteRisk();

  const [formOpen, setFormOpen] = useState(false);
  const [editingRisk, setEditingRisk] = useState<ProjectRisk | null>(null);
  const [escalatingRisk, setEscalatingRisk] = useState<ProjectRisk | null>(null);
  const [deletingRisk, setDeletingRisk] = useState<ProjectRisk | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openCreate() {
    setEditingRisk(null);
    setFormOpen(true);
  }

  function openEdit(risk: ProjectRisk) {
    setEditingRisk(risk);
    setFormOpen(true);
  }

  async function confirmDelete() {
    if (!deletingRisk) return;
    try {
      await deleteRisk.mutateAsync(deletingRisk.id);
      toast.success('Risk deleted.');
      setDeletingRisk(null);
    } catch (err) {
      toast.error(`Failed to delete: ${(err as Error)?.message ?? 'error'}`);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {isLoading
            ? 'Loading risks…'
            : `${risks?.length ?? 0} risk${(risks?.length ?? 0) === 1 ? '' : 's'}`}
        </p>
        <Button size="sm" onClick={openCreate} className={`gap-1.5 ${TAP_TARGET}`}>
          <Plus className="h-4 w-4" />
          Add risk
        </Button>
      </div>

      {isError && (
        <p className="text-sm text-destructive">
          Failed to load risks: {(error as Error)?.message ?? 'unknown error'}
        </p>
      )}

      {!isLoading && !isError && (risks?.length ?? 0) === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-md border border-dashed py-10 text-center">
          <ShieldAlert className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">No risks logged yet</p>
          <p className="text-sm text-muted-foreground">
            Add the first risk to start the register.
          </p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Risk</TableHead>
                <TableHead className="w-28">Category</TableHead>
                <TableHead className="w-44">Severity</TableHead>
                <TableHead className="w-28">Status</TableHead>
                <TableHead className="w-28">Escalation</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(risks ?? []).map((risk) => {
                const isOpen = expanded.has(risk.id);
                return (
                  <Fragment key={risk.id}>
                    <TableRow className="align-top">
                      <TableCell className="py-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className={`h-6 w-6 p-0 ${TAP_TARGET_ICON}`}
                          onClick={() => toggleExpand(risk.id)}
                          aria-label={isOpen ? 'Collapse' : 'Expand'}
                        >
                          {isOpen ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell className="py-2">
                        <div className="font-medium">{risk.title}</div>
                        {risk.description && (
                          <div className="line-clamp-1 text-xs text-muted-foreground">
                            {risk.description}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="py-2 text-sm capitalize text-muted-foreground">
                        {risk.risk_category ?? '—'}
                      </TableCell>
                      <TableCell className="py-2">
                        <SeverityCell
                          severitySimple={risk.severity_simple}
                          likelihood={risk.likelihood}
                          impact={risk.impact}
                          rag={risk.rag_status}
                        />
                      </TableCell>
                      <TableCell className="py-2 text-sm">
                        {statusLabel(risk.status_key)}
                      </TableCell>
                      <TableCell className="py-2">
                        <EscalationBadge isEscalated={risk.is_escalated} />
                      </TableCell>
                      <TableCell className="py-2">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className={`h-7 w-7 p-0 ${TAP_TARGET_ICON}`}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(risk)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setEscalatingRisk(risk)}>
                              <AlertTriangle className="mr-2 h-4 w-4" />
                              Escalate
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setDeletingRisk(risk)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>

                    {isOpen && (
                      <TableRow>
                        <TableCell colSpan={7} className="bg-muted/30">
                          <div className="space-y-3 px-2 py-1">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-medium">Mitigation steps</p>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 gap-1.5 text-xs"
                                onClick={() => setEscalatingRisk(risk)}
                              >
                                <AlertTriangle className="h-3.5 w-3.5" />
                                {risk.is_escalated ? 'View / escalate' : 'Escalate'}
                              </Button>
                            </div>
                            <MitigationStepList
                              riskId={risk.id}
                              projectId={projectId}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create / edit dialog */}
      <RiskFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        projectId={projectId}
        risk={editingRisk}
      />

      {/* Escalation dialog (controlled by which risk is being escalated) */}
      {escalatingRisk && (
        <EscalationDialog
          open={!!escalatingRisk}
          onOpenChange={(o) => {
            if (!o) setEscalatingRisk(null);
          }}
          risk={escalatingRisk}
        />
      )}

      {/* Delete confirm — open is explicit state (no onOpenChange race) */}
      <AlertDialog
        open={!!deletingRisk}
        onOpenChange={(o) => {
          if (!o) setDeletingRisk(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this risk?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the risk and its mitigation steps from the register.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteRisk.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              disabled={deleteRisk.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
