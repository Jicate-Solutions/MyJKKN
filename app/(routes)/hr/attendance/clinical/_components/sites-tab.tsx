'use client';

import { useState } from 'react';
import { ExternalLink, Pencil, Plus, Trash2 } from 'lucide-react';

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/empty-state';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useClinicalSites, useDeleteClinicalSite } from '@/hooks/hr/use-clinical-duty';
import { usePermissions } from '@/hooks/use-permissions';
import type { ClinicalDutySite } from '@/types/hr-clinical-duty';
import { SiteDialog } from './site-dialog';
import { mapsUrl, type InstitutionOption } from './shared';

export function SitesTab({ institutions }: { institutions: InstitutionOption[] }) {
  const { data, isLoading } = useClinicalSites();
  const { can, isSuperAdmin } = usePermissions();
  const canDelete = isSuperAdmin || can('hr.attendance.clinical.delete');
  const remove = useDeleteClinicalSite();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ClinicalDutySite | null>(null);
  const [deleting, setDeleting] = useState<ClinicalDutySite | null>(null);

  const names = new Map(institutions.map((i) => [i.id, i.name]));
  const rows = data ?? [];

  const openDialog = (site: ClinicalDutySite | null) => {
    setEditing(site);
    setOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => openDialog(null)}>
          <Plus className="mr-2 h-4 w-4" />
          Add site
        </Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading duty sites…</div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No duty sites yet"
          description="Add the off-campus locations where staff may mark attendance."
        />
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Institution</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Radius</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {names.get(s.institution_id) ?? '—'}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <a
                      href={mapsUrl(s.lat, s.lng)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      {s.lat.toFixed(5)}, {s.lng.toFixed(5)}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </TableCell>
                  <TableCell>{s.radius_m} m</TableCell>
                  <TableCell>
                    <Badge variant={s.is_active ? 'default' : 'outline'}>
                      {s.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Edit ${s.name}`}
                      onClick={() => openDialog(s)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {canDelete && (
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Delete ${s.name}`}
                        onClick={() => setDeleting(s)}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog open={Boolean(deleting)} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the duty site for good. Staff granted only this site will not be able
              to punch until HR grants them another one. A site that already has recorded punches
              cannot be deleted — deactivate it instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
              onClick={() =>
                deleting && remove.mutate(deleting.id, { onSettled: () => setDeleting(null) })
              }
            >
              {remove.isPending ? 'Deleting…' : 'Delete site'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SiteDialog
        open={open}
        onOpenChange={setOpen}
        site={editing}
        institutions={institutions}
        defaultInstitutionId={institutions.length === 1 ? institutions[0].id : ''}
      />
    </div>
  );
}
