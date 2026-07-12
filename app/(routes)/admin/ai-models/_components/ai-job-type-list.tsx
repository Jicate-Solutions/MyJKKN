'use client';

// ============================================================================
// AI Job Type list — the registry table.
// Created: 2026-07-13. Table conventions mirror ai-models-data-table.tsx.
//
// One row per job type: title/key, lane, allow_rule, schedulable, an enabled
// toggle (PATCH /api/admin/ai-job-types/[job_type] { enabled }), plus Run /
// Edit / Delete actions. Parent (AiStudioPanel) owns the data + dialogs.
// ============================================================================

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Pencil, Trash2, Play, Loader2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { AiJobType } from './ai-job-types';

interface AiJobTypeListProps {
  jobTypes: AiJobType[];
  selectedForRun: string | null;
  onRun: (jt: AiJobType) => void;
  onEdit: (jt: AiJobType) => void;
  onChanged: () => void;
}

function laneBadge(lane: string) {
  if (lane === 'max')
    return <Badge variant="outline" className="border-[#0b6d41]/40 text-[#0b6d41]">Max</Badge>;
  if (lane === 'api')
    return <Badge variant="outline" className="text-muted-foreground">API</Badge>;
  return <Badge variant="outline">Either</Badge>;
}

export function AiJobTypeList({
  jobTypes,
  selectedForRun,
  onRun,
  onEdit,
  onChanged,
}: AiJobTypeListProps) {
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const toggleEnabled = async (jt: AiJobType, next: boolean) => {
    setBusyKey(jt.job_type);
    try {
      const res = await fetch(`/api/admin/ai-job-types/${encodeURIComponent(jt.job_type)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error ?? `HTTP ${res.status}`);
      }
      toast.success(next ? `${jt.title} enabled.` : `${jt.title} disabled.`);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update.');
    } finally {
      setBusyKey(null);
    }
  };

  const handleDelete = async (jt: AiJobType) => {
    if (!window.confirm(`Delete job type "${jt.title}" (${jt.job_type})? This can't be undone.`)) {
      return;
    }
    setBusyKey(jt.job_type);
    try {
      const res = await fetch(`/api/admin/ai-job-types/${encodeURIComponent(jt.job_type)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error ?? `HTTP ${res.status}`);
      }
      toast.success(`${jt.title} deleted.`);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete.');
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[300px]">Job type</TableHead>
            <TableHead>Lane</TableHead>
            <TableHead>Who can run</TableHead>
            <TableHead className="text-center">Scheduled</TableHead>
            <TableHead className="text-center">Enabled</TableHead>
            <TableHead className="w-[160px] text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobTypes.map((jt) => {
            const busy = busyKey === jt.job_type;
            const isSelected = selectedForRun === jt.job_type;
            return (
              <TableRow key={jt.job_type} className={isSelected ? 'bg-muted/40' : undefined}>
                <TableCell>
                  <div className="space-y-0.5">
                    <div className="font-medium">{jt.title}</div>
                    {jt.description && (
                      <div className="text-xs text-muted-foreground">{jt.description}</div>
                    )}
                    <div className="font-mono text-xs text-muted-foreground/70">{jt.job_type}</div>
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {jt.interactive && (
                        <Badge variant="outline" className="text-[10px] font-normal">
                          Interactive
                        </Badge>
                      )}
                      {Array.isArray(jt.input_schema) && jt.input_schema.length > 0 && (
                        <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">
                          {jt.input_schema.length} field{jt.input_schema.length === 1 ? '' : 's'}
                        </Badge>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell>{laneBadge(jt.lane)}</TableCell>
                <TableCell>
                  <span className="font-mono text-xs text-muted-foreground">{jt.allow_rule}</span>
                </TableCell>
                <TableCell className="text-center">
                  {jt.schedulable ? (
                    <Badge variant="outline" className="text-[10px] font-normal">Yes</Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  <div className="flex items-center justify-center">
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                      <Switch
                        checked={jt.enabled}
                        onCheckedChange={(next) => void toggleEnabled(jt, next)}
                        aria-label={`${jt.enabled ? 'Disable' : 'Enable'} ${jt.title}`}
                      />
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant={isSelected ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => onRun(jt)}
                      disabled={!jt.enabled}
                      aria-label={`Run ${jt.title}`}
                      title={jt.enabled ? 'Run this job' : 'Enable the job to run it'}
                    >
                      <Play className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEdit(jt)}
                      aria-label={`Edit ${jt.title}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void handleDelete(jt)}
                      disabled={busy}
                      aria-label={`Delete ${jt.title}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
