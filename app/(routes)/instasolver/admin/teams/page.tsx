'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { PageBreadcrumb } from '@/components/navigation';
import { PageHeader } from '@/components/page-header';
import { AccessGate } from '@/components/instasolver/access-gate';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useInstaSolverMutation, useTeamsWithMembers } from '@/hooks/instasolver/use-instasolver';
import { InstaSolverReferenceService } from '@/lib/services/instasolver/reference-service';
import type { MaintenanceTeam } from '@/types/instasolver';
import { TeamDialog } from '../_components/team-dialog';
import { TeamMembers } from '../_components/team-members';

function TeamsScreen() {
  const { data: teams, isLoading, error } = useTeamsWithMembers();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MaintenanceTeam | null>(null);
  const [removing, setRemoving] = useState<MaintenanceTeam | null>(null);

  // Remove = deactivate. Nothing is hard-deleted (spec §2): last year's issues
  // still reference the team that handled them and must still render its name.
  const toggle = useInstaSolverMutation(
    ({ team, active }: { team: MaintenanceTeam; active: boolean }) =>
      InstaSolverReferenceService.saveTeam(
        {
          name: team.name,
          description: team.description,
          institution_id: team.institution_id,
          category_id: team.category_id,
          email: team.email,
          is_active: active
        },
        team.id
      ),
    (_r, v) => (v.active ? `${v.team.name} restored` : `${v.team.name} removed`)
  );

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (t: MaintenanceTeam) => {
    setEditing(t);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <PageBreadcrumb
        items={[
          { label: 'InstaSolver', href: '/instasolver/dashboard' },
          { label: 'Admin', href: '/instasolver/admin' },
          { label: 'Teams', isCurrent: true }
        ]}
      />
      <PageHeader
        title="Maintenance teams"
        description="Being on a team is what makes someone a maintenance team member in InstaSolver."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/instasolver/admin">
                <ArrowLeft className="mr-1.5 h-4 w-4" /> Admin
              </Link>
            </Button>
            <Button onClick={openNew}>
              <Plus className="mr-1.5 h-4 w-4" /> New team
            </Button>
          </>
        }
      />

      {error ? (
        <Card>
          <CardContent className="p-4 text-sm text-destructive">
            The teams could not be loaded. Refresh the page to try again.
          </CardContent>
        </Card>
      ) : isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : !teams?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="font-medium">No teams yet</p>
            <p className="text-sm text-muted-foreground">Create a team, choose the category it covers, then add its team members.</p>
            <Button onClick={openNew}>
              <Plus className="mr-1.5 h-4 w-4" /> New team
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {/* Active teams first; removed (inactive) teams after, so they can be restored. */}
          {[...teams].sort((a, b) => Number(b.is_active) - Number(a.is_active)).map((t) => (
            <Card key={t.id} className={t.is_active ? undefined : 'opacity-70'}>
              <CardHeader className="space-y-2 pb-3">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{t.name}</CardTitle>
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(t)}>
                      <Pencil className="mr-1 h-4 w-4" /> Edit
                    </Button>
                    {t.is_active ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
                        onClick={() => setRemoving(t)}
                      >
                        <Trash2 className="mr-1 h-4 w-4" /> Remove
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" disabled={toggle.isPending} onClick={() => toggle.mutate({ team: t, active: true })}>
                        <RotateCcw className="mr-1 h-4 w-4" /> Restore
                      </Button>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {!t.is_active && <Badge variant="secondary">Inactive</Badge>}
                  <Badge variant="outline">{t.category?.name ?? 'No category'}</Badge>
                  <Badge variant="outline">{t.institution?.name ?? 'All institutions'}</Badge>
                </div>
                {t.description && <p className="text-sm text-muted-foreground">{t.description}</p>}
                {t.email && <p className="text-xs text-muted-foreground">{t.email}</p>}
              </CardHeader>
              <CardContent>
                <TeamMembers team={t} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <TeamDialog team={editing} open={dialogOpen} onOpenChange={setDialogOpen} />

      <AlertDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The team disappears from every assign list and its members stop receiving its work. Issues it already
              handled keep showing its name, so it is kept as an inactive team (shown at the bottom) and can be
              restored. Anything it is still working on stays with it — reassign those from the issue page.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep the team</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => {
                if (removing) toggle.mutate({ team: removing, active: false });
                setRemoving(null);
              }}
            >
              Remove team
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function AdminTeamsPage() {
  return (
    <AccessGate need="manager">
      <TeamsScreen />
    </AccessGate>
  );
}
