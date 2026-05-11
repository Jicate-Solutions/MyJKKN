'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, X, Trash2, AlertCircle, Lock } from 'lucide-react';
import {
  useBosTaxonomies,
  useDeleteBosTaxonomy,
  useBosTaxonomy,
} from '@/hooks/bos/use-bos-taxonomies';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { InstitutionPicker } from '@/app/(routes)/bos/_components/institution-picker';
import { toast } from 'react-hot-toast';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuth } from '@/hooks/use-auth';

export function TaxonomyMasterList() {
  const router = useRouter();
  const { profile } = useAuth();
  const isSuperAdmin = profile?.is_super_admin === true || profile?.role === 'super_admin';
  const { canAccess } = usePermissions();
  const canCreate = canAccess('academic.bos-taxonomy', 'create');
  const canDelete = isSuperAdmin || canAccess('academic.bos-taxonomy', 'delete');

  // Filter state — applied immediately on change.
  const [institutionsId, setInstitutionsId] = useState<string | undefined>(undefined);
  const [filterName, setFilterName] = useState('');

  const [previewId, setPreviewId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const { data, isLoading, isError, error } = useBosTaxonomies({
    institutionsId,
    sortBy: 'name',
    sortOrder: 'asc',
    limit: 100,
  });

  const rows = useMemo(() => data?.data ?? [], [data?.data]);

  // Deduplicate options by name so super-admin "All Institutions" view doesn't show duplicates.
  const taxonomyOptions = useMemo(() => {
    const seen = new Set<string>();
    const unique = rows.filter((r) => {
      if (seen.has(r.name)) return false;
      seen.add(r.name);
      return true;
    });
    return [
      { value: '', label: 'All Taxonomies' },
      ...unique.map((r) => ({ value: r.name, label: r.name })),
    ];
  }, [rows]);

  // Client-side filter by name (matches all institution copies of the same taxonomy).
  const displayedRows = useMemo(
    () => (filterName ? rows.filter((r) => r.name === filterName) : rows),
    [rows, filterName]
  );

  const hasActiveFilters = !!institutionsId || !!filterName;

  const handleReset = () => {
    setInstitutionsId(undefined);
    setFilterName('');
  };

  const deleteMutation = useDeleteBosTaxonomy();

  const handleConfirmDelete = async () => {
    if (!pendingDeleteId) return;
    try {
      await deleteMutation.mutateAsync(pendingDeleteId);
      toast.success('Taxonomy deleted');
      setPendingDeleteId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  if (isLoading) {
    return (
      <div className='space-y-4'>
        <div className='flex items-center justify-between'>
          <Skeleton className='h-9 w-72' />
          <Skeleton className='h-9 w-40' />
        </div>
        {isSuperAdmin && <Skeleton className='h-9 w-48' />}
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className='h-14 w-full' />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <Alert variant='destructive'>
        <AlertCircle className='h-4 w-4' />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>
          {error instanceof Error ? error.message : 'Failed to load taxonomies'}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className='space-y-4'>
      {/* Header row */}
      <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <h2 className='text-lg font-semibold'>Taxonomy List</h2>
          <p className='text-sm text-muted-foreground'>
            Frameworks (Bloom&apos;s, Fink&apos;s, custom) used to tag course outcomes and
            question items.
          </p>
        </div>
        <Button
          onClick={() => router.push('/bos/taxonomy/new')}
          disabled={!canCreate}
          title={canCreate ? '' : 'You do not have permission to create taxonomies'}
        >
          <Plus className='mr-2 h-4 w-4' />
          New Taxonomy
        </Button>
      </div>

      {/* Filter controls */}
      <div className='flex flex-wrap items-end gap-3'>
        {isSuperAdmin && (
          <InstitutionPicker
            value={institutionsId}
            onChange={(id) => {
              setInstitutionsId(id);
              setFilterName(''); // reset taxonomy when institution changes
            }}
            showAllOption
          />
        )}
        <div className='space-y-1'>
          <Label className='text-xs'>Taxonomy</Label>
          <SearchableSelect
            value={filterName}
            onValueChange={setFilterName}
            options={taxonomyOptions}
            placeholder='All Taxonomies'
            searchPlaceholder='Search by name…'
            emptyMessage='No taxonomies found.'
            className='w-[240px]'
          />
        </div>
        {hasActiveFilters && (
          <Button size='sm' variant='ghost' onClick={handleReset} className='mt-5'>
            <X className='mr-1 h-4 w-4' />
            Reset
          </Button>
        )}
      </div>

      {displayedRows.length === 0 ? (
        <div className='rounded-lg border py-10 text-center text-sm text-muted-foreground'>
          No taxonomies found.
        </div>
      ) : (
        <div className='rounded-lg border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className='w-[28%]'>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Levels</TableHead>
                <TableHead>Type</TableHead>
                {isSuperAdmin && <TableHead>Institution</TableHead>}
                <TableHead>Status</TableHead>
                <TableHead className='w-[1%] text-right'>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayedRows.map((row) => (
                <TableRow
                  key={row.id}
                  className='cursor-pointer'
                  onClick={() => setPreviewId(row.id)}
                >
                  <TableCell className='font-medium'>{row.name}</TableCell>
                  <TableCell>
                    <code className='rounded bg-muted px-1.5 py-0.5 text-xs'>{row.code}</code>
                  </TableCell>
                  <TableCell>{row.level_count}</TableCell>
                  <TableCell>
                    <Badge variant={row.is_hierarchical ? 'default' : 'secondary'}>
                      {row.is_hierarchical ? 'Hierarchical' : 'Non-hierarchical'}
                    </Badge>
                  </TableCell>
                  {isSuperAdmin && (
                    <TableCell className='text-xs text-muted-foreground'>
                      {row.institution_name ?? '—'}
                    </TableCell>
                  )}
                  <TableCell>
                    {row.is_system ? (
                      <span className='inline-flex items-center gap-1 text-xs text-muted-foreground'>
                        <Lock className='h-3 w-3' /> System
                      </span>
                    ) : row.is_active ? (
                      <Badge variant='outline'>Active</Badge>
                    ) : (
                      <Badge variant='outline' className='text-muted-foreground'>
                        Inactive
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell
                    className='text-right'
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Button
                      variant='ghost'
                      size='sm'
                      disabled={!canDelete || row.is_system}
                      title={
                        row.is_system
                          ? 'System taxonomies cannot be deleted'
                          : !canDelete
                            ? 'You do not have permission to delete'
                            : 'Delete taxonomy'
                      }
                      onClick={() => setPendingDeleteId(row.id)}
                    >
                      <Trash2 className='h-4 w-4' />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Detail dialog */}
      <TaxonomyDetailDialog id={previewId} onClose={() => setPreviewId(null)} />

      {/* Delete confirm dialog */}
      <Dialog
        open={!!pendingDeleteId}
        onOpenChange={(open) => !open && setPendingDeleteId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this taxonomy?</DialogTitle>
            <DialogDescription>
              This permanently removes the framework and all of its levels. Any regulation
              or course referencing it will lose the link.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant='outline' onClick={() => setPendingDeleteId(null)}>
              Cancel
            </Button>
            <Button
              variant='destructive'
              onClick={handleConfirmDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && (
                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Detail dialog ─────────────────────────────────────────────────────────────

function TaxonomyDetailDialog({
  id,
  onClose,
}: {
  id: string | null;
  onClose: () => void;
}) {
  const { data, isLoading } = useBosTaxonomy(id ?? undefined);

  return (
    <Dialog open={!!id} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className='max-w-2xl'>
        <DialogHeader>
          <DialogTitle>{data?.name ?? 'Taxonomy'}</DialogTitle>
          <DialogDescription>
            {data?.description ?? 'Levels defined for this framework.'}
          </DialogDescription>
        </DialogHeader>

        {isLoading || !data ? (
          <div className='space-y-2'>
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className='h-10 w-full' />
            ))}
          </div>
        ) : (
          <div className='rounded-lg border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className='w-20'>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Verb / Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.levels.map((lvl) => (
                  <TableRow key={lvl.id}>
                    <TableCell>
                      <code className='rounded bg-muted px-1.5 py-0.5 text-xs'>
                        {lvl.code}
                      </code>
                    </TableCell>
                    <TableCell className='font-medium'>{lvl.name}</TableCell>
                    <TableCell className='text-sm text-muted-foreground'>
                      {lvl.verb_examples.length > 0
                        ? lvl.verb_examples.join(', ')
                        : (lvl.description ?? '—')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
