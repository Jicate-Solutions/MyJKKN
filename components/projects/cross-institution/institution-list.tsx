'use client';

/**
 * InstitutionList — table of institutions participating in a project.
 *
 * Shows: institution name, role badge (lead / participating), actions
 *   (change role ↔ lead/participating, remove — blocked for lead).
 *
 * Sourced from: useProjectInstitutions + useJkknInstitutions for name lookup.
 */

import { toast } from 'sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TAP_TARGET_ICON } from '@/app/(routes)/projects/_lib/tap-targets';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Loader2, Trash2, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import {
  useProjectInstitutions,
  useUpdateProjectInstitutionRole,
  useRemoveProjectInstitution,
} from '@/hooks/projects/use-project-institutions';
import { useJkknInstitutions } from '@/hooks/use-jkkn-institutions';
import type { ProjectInstitution } from '@/types/projects';

interface InstitutionListProps {
  projectId: string;
}

function RoleBadge({ role }: { role: string }) {
  if (role === 'lead') {
    return (
      <Badge className="bg-violet-100 text-violet-700 border-violet-200 border">
        Lead
      </Badge>
    );
  }
  return (
    <Badge variant="secondary">Participating</Badge>
  );
}

export function InstitutionList({ projectId }: InstitutionListProps) {
  const { data: memberships, isLoading } = useProjectInstitutions(projectId);
  const { data: instData } = useJkknInstitutions({ limit: 100 });

  const updateRole = useUpdateProjectInstitutionRole(projectId);
  const remove = useRemoveProjectInstitution(projectId);

  // Build a name lookup map from JKKN API institutions list.
  const nameMap = new Map<string, string>(
    (instData?.data ?? []).map((i) => [i.id, i.name])
  );

  function institutionName(row: ProjectInstitution): string {
    return nameMap.get(row.institution_id) ?? row.institution_id;
  }

  async function handleToggleRole(row: ProjectInstitution) {
    const newRole = row.role === 'lead' ? 'participating' : 'lead';
    try {
      await updateRole.mutateAsync({ id: row.id, update: { role: newRole } });
      toast.success(
        `Changed to ${newRole === 'lead' ? 'Lead' : 'Participating'}.`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update role.');
    }
  }

  async function handleRemove(row: ProjectInstitution) {
    try {
      await remove.mutateAsync(row.id);
      toast.success('Institution removed.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove institution.');
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading…
      </div>
    );
  }

  if (!memberships || memberships.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        No institutions linked yet. Use &quot;Add institution&quot; to get started.
      </p>
    );
  }

  return (
    <TooltipProvider>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Institution</TableHead>
            <TableHead>Role</TableHead>
            <TableHead className="w-28 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {memberships.map((row) => {
            const isLead = row.role === 'lead';
            const isBusy =
              (updateRole.isPending && updateRole.variables?.id === row.id) ||
              (remove.isPending && remove.variables === row.id);

            return (
              <TableRow key={row.id}>
                <TableCell className="font-medium">
                  {institutionName(row)}
                </TableCell>
                <TableCell>
                  <RoleBadge role={row.role} />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {/* Toggle role button */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`h-7 w-7 ${TAP_TARGET_ICON}`}
                          disabled={isBusy}
                          onClick={() => handleToggleRole(row)}
                          aria-label={
                            isLead
                              ? 'Demote to participating'
                              : 'Promote to lead'
                          }
                        >
                          {isBusy ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : isLead ? (
                            <ArrowDownCircle className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ArrowUpCircle className="h-4 w-4 text-muted-foreground" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {isLead ? 'Demote to participating' : 'Promote to lead'}
                      </TooltipContent>
                    </Tooltip>

                    {/* Remove button */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`h-7 w-7 ${TAP_TARGET_ICON}`}
                          disabled={isBusy || isLead}
                          onClick={() => handleRemove(row)}
                          aria-label="Remove institution"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {isLead
                          ? 'Demote to participating before removing'
                          : 'Remove institution'}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TooltipProvider>
  );
}
