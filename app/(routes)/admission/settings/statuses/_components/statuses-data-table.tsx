'use client';

import { useState } from 'react';
import { useTabParam } from '@/hooks/use-tab-param';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Plus, Pencil, Archive, ArchiveRestore } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAdmissionStatuses, useArchiveAdmissionStatus, useRestoreAdmissionStatus } from '@/hooks/admission/use-admission-statuses';
import { THRESHOLD_BASIS_LABELS, type AdmissionStatus, type AdmissionStatusScope } from '@/types/admission-status';
import { StatusFormDialog } from './status-form-dialog';

const STATUS_SCOPE_TABS = ['lead', 'learner'] as const;

export function StatusesDataTable() {
  const [scope, setScope] = useTabParam('learner', STATUS_SCOPE_TABS);
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<AdmissionStatus | null>(null);
  const [creating, setCreating] = useState(false);

  const { data, isLoading } = useAdmissionStatuses(scope, { activeOnly: !showInactive });
  const archive = useArchiveAdmissionStatus();
  const restore = useRestoreAdmissionStatus();

  return (
    <Tabs value={scope} onValueChange={(v) => setScope(v as AdmissionStatusScope)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <TabsList>
          <TabsTrigger value="lead">Lead Stages</TabsTrigger>
          <TabsTrigger value="learner">Learner Statuses</TabsTrigger>
        </TabsList>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setShowInactive((v) => !v)}>
            {showInactive ? 'Hide archived' : 'Show archived'}
          </Button>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4 mr-1" /> {scope === 'lead' ? 'Add stage' : 'Add status'}
          </Button>
        </div>
      </div>

      <TabsContent value={scope} className="mt-4">
        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Order</TableHead>
                  <TableHead>{scope === 'lead' ? 'Stage' : 'Status'}</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Terminal</TableHead>
                  <TableHead>Seat Filled</TableHead>
                  <TableHead>Threshold %</TableHead>
                  <TableHead>Counted against</TableHead>
                  <TableHead>Gates Login</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="w-24 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data ?? []).length === 0 && (
                  <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground">
                    No statuses. Click <em>Add status</em> to create one.
                  </TableCell></TableRow>
                )}
                {(data ?? []).map((s) => (
                  <TableRow key={s.id} className={!s.is_active ? 'opacity-60' : ''}>
                    <TableCell className="font-mono">{s.sort_order}</TableCell>
                    <TableCell>
                      <Badge style={{ backgroundColor: s.color, color: '#fff', borderColor: s.color }}>
                        {s.label}
                      </Badge>
                    </TableCell>
                    <TableCell><code className="text-xs">{s.code}</code></TableCell>
                    <TableCell>{s.is_terminal ? 'Yes' : ''}</TableCell>
                    <TableCell>{s.is_seat_filled ? 'Yes' : ''}</TableCell>
                    <TableCell>{s.fee_paid_threshold_percent != null ? `${s.fee_paid_threshold_percent}%` : '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {s.fee_paid_threshold_percent != null
                        ? (THRESHOLD_BASIS_LABELS[s.threshold_basis ?? 'due_to_date'] ?? s.threshold_basis)
                        : '—'}
                    </TableCell>
                    <TableCell>{s.gates_login ? 'Yes' : ''}</TableCell>
                    <TableCell>{s.is_active ? 'Active' : 'Archived'}</TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button variant="ghost" size="icon" onClick={() => setEditing(s)} aria-label="Edit">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {s.is_active ? (
                        <Button variant="ghost" size="icon"
                          onClick={() => archive.mutate(s.id)} disabled={archive.isPending}
                          aria-label="Archive">
                          <Archive className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button variant="ghost" size="icon"
                          onClick={() => restore.mutate(s.id)} disabled={restore.isPending}
                          aria-label="Restore">
                          <ArchiveRestore className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {(creating || editing) && (
          <StatusFormDialog
            scope={scope}
            initial={editing ?? undefined}
            open
            onOpenChange={(o) => {
              if (!o) { setCreating(false); setEditing(null); }
            }}
          />
        )}
      </TabsContent>
    </Tabs>
  );
}
