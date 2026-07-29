'use client';

// =============================================================================
// RCLTP band-config console (Phase 4d)
// =============================================================================
// CRUD over rcltp_band_config via useRcltpBandConfigs + useCreate/Update/Delete.
// Each row maps (institution, dimension, band) -> [min_score, max_score]. Band
// config is per-institution (institution_id NOT NULL) — an institution must be
// picked before rows load or are created.
//
// SAFETY: these cutoffs are PROVISIONAL config, NOT MyJKKN-validated, and drive no
// live scoring yet. A persistent banner + <ValidationBanner> sit on the surface so
// a cutoff is never read as an authoritative psychometric value. No score is ever
// computed or shown here — this edits config rows only.
// =============================================================================

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { Plus, Pencil, Trash2, SlidersHorizontal, Lock } from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  useRcltpBandConfigs,
  useCreateRcltpBandConfig,
  useUpdateRcltpBandConfig,
  useDeleteRcltpBandConfig,
} from '@/hooks/rcltp/use-rcltp-results';
import { ValidationBanner } from '../../../_components/validation-banner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { RcltpBandConfig, RcltpDimension, RcltpBand } from '@/types/rcltp';

const DIMENSIONS: RcltpDimension[] = [
  'reading',
  'comprehension',
  'overall',
  'vocabulary',
];

const BANDS: RcltpBand[] = [
  'emergent',
  'transitional',
  'proficient',
  'super_proficient',
];

const BAND_LABEL: Record<RcltpBand, string> = {
  emergent: 'Emergent',
  transitional: 'Transitional',
  proficient: 'Proficient',
  super_proficient: 'Super proficient',
};

interface Institution {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Institutions (board) — copied from content-console (columns id/name on prod).
// ---------------------------------------------------------------------------
function useInstitutions() {
  return useQuery({
    queryKey: ['rcltp', 'institutions', 'active'],
    queryFn: async (): Promise<Institution[]> => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await (supabase as any)
        .from('institutions')
        .select('id, name')
        .eq('is_active', true)
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Institution[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ===========================================================================
// Band-config create/edit dialog
// ===========================================================================
function BandConfigDialog({
  open,
  onOpenChange,
  editing,
  institutionId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: RcltpBandConfig | null;
  institutionId: string;
}) {
  const createConfig = useCreateRcltpBandConfig();
  const updateConfig = useUpdateRcltpBandConfig();

  const [dimension, setDimension] = useState<RcltpDimension | ''>('');
  const [band, setBand] = useState<RcltpBand | ''>('');
  const [minScore, setMinScore] = useState('');
  const [maxScore, setMaxScore] = useState('');

  function seed() {
    setDimension(editing?.dimension ?? '');
    setBand(editing?.band ?? '');
    setMinScore(editing?.min_score != null ? String(editing.min_score) : '');
    setMaxScore(editing?.max_score != null ? String(editing.max_score) : '');
  }

  function handleOpenChange(v: boolean) {
    if (v) seed();
    onOpenChange(v);
  }

  async function handleSave() {
    if (!dimension || !band) {
      toast.error('Dimension and band are required');
      return;
    }
    if (minScore === '' || maxScore === '') {
      toast.error('Both min and max cutoff are required');
      return;
    }
    const min = Number(minScore);
    const max = Number(maxScore);
    if (Number.isNaN(min) || Number.isNaN(max)) {
      toast.error('Cutoffs must be numbers');
      return;
    }
    if (min > max) {
      toast.error('Min cutoff cannot be greater than max cutoff');
      return;
    }

    try {
      if (editing) {
        // institution_id is fixed on a band-config row (UpdateRcltpBandConfigDto
        // omits it) — only dimension/band/cutoffs change.
        await updateConfig.mutateAsync({
          id: editing.id,
          input: { dimension, band, min_score: min, max_score: max },
        });
      } else {
        await createConfig.mutateAsync({
          institution_id: institutionId,
          dimension,
          band,
          min_score: min,
          max_score: max,
        });
      }
      onOpenChange(false);
    } catch {
      /* hook surfaces the toast */
    }
  }

  const saving = createConfig.isPending || updateConfig.isPending;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className='max-w-lg'>
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit band cutoff' : 'New band cutoff'}</DialogTitle>
          <DialogDescription>
            Maps a score range to a proficiency band for this school. Cutoffs are{' '}
            <strong>provisional</strong> and do not drive any live scoring yet.
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4'>
          <ValidationBanner draftCount={1} />

          <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
            <div>
              <Label>Dimension</Label>
              <Select
                value={dimension}
                onValueChange={(v) => setDimension(v as RcltpDimension)}
              >
                <SelectTrigger>
                  <SelectValue placeholder='Select dimension' />
                </SelectTrigger>
                <SelectContent>
                  {DIMENSIONS.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Band</Label>
              <Select value={band} onValueChange={(v) => setBand(v as RcltpBand)}>
                <SelectTrigger>
                  <SelectValue placeholder='Select band' />
                </SelectTrigger>
                <SelectContent>
                  {BANDS.map((b) => (
                    <SelectItem key={b} value={b}>
                      {BAND_LABEL[b]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor='bc-min'>Min cutoff (provisional)</Label>
              <Input
                id='bc-min'
                type='number'
                value={minScore}
                onChange={(e) => setMinScore(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor='bc-max'>Max cutoff (provisional)</Label>
              <Input
                id='bc-max'
                type='number'
                value={maxScore}
                onChange={(e) => setMaxScore(e.target.value)}
              />
            </div>
          </div>

          <Alert>
            <AlertDescription className='text-xs'>
              These cutoffs are <strong>provisional — pending MyJKKN validation</strong>. They
              are configuration values, not validated psychometric thresholds, and do not
              drive any live scoring yet.
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Save' : 'Create cutoff'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===========================================================================
// Delete confirm dialog
// ===========================================================================
function DeleteBandConfigDialog({
  row,
  onOpenChange,
}: {
  row: RcltpBandConfig | null;
  onOpenChange: (v: boolean) => void;
}) {
  const deleteConfig = useDeleteRcltpBandConfig();

  async function confirm() {
    if (!row) return;
    try {
      await deleteConfig.mutateAsync(row.id);
      onOpenChange(false);
    } catch {
      /* hook surfaces the toast */
    }
  }

  return (
    <Dialog open={!!row} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete band cutoff</DialogTitle>
          <DialogDescription>
            Delete the{' '}
            <strong>
              {row?.dimension} · {row ? BAND_LABEL[row.band] : ''}
            </strong>{' '}
            cutoff? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className='gap-2 sm:gap-0'>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant='destructive'
            onClick={confirm}
            disabled={deleteConfig.isPending}
          >
            {deleteConfig.isPending ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===========================================================================
// Main console
// ===========================================================================
export function BandConfigConsole() {
  const { data: institutions = [] } = useInstitutions();
  const [instId, setInstId] = useState<string>('');

  // Band config is per-institution; only query once a school is chosen.
  const configsQuery = useRcltpBandConfigs(
    instId ? { institution_id: instId } : {}
  );
  const rows = instId ? configsQuery.data?.data ?? [] : [];

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RcltpBandConfig | null>(null);
  const [deleting, setDeleting] = useState<RcltpBandConfig | null>(null);

  const instName = useMemo(() => {
    const m = new Map(institutions.map((i) => [i.id, i.name]));
    return (id: string) => m.get(id) ?? 'Institution';
  }, [institutions]);

  function openNew() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(r: RcltpBandConfig) {
    setEditing(r);
    setDialogOpen(true);
  }

  return (
    <div className='space-y-4'>
      <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <h2 className='text-lg font-semibold'>Band cutoffs</h2>
          <p className='text-sm text-muted-foreground'>
            Configure the score ranges that map to each proficiency band, per school.
          </p>
        </div>
        <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
          <Select value={instId} onValueChange={setInstId}>
            <SelectTrigger className='w-full sm:w-56'>
              <SelectValue placeholder='Select a school' />
            </SelectTrigger>
            <SelectContent>
              {institutions.map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={openNew} disabled={!instId}>
            <Plus className='mr-2 h-4 w-4' /> New cutoff
          </Button>
        </div>
      </div>

      {/* Persistent provisional banner — always visible on this surface. */}
      <Alert className='border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100'>
        <AlertDescription className='text-sm font-medium'>
          <span className='font-semibold'>Provisional cutoffs — pending MyJKKN validation.</span>{' '}
          These do not drive any live scoring yet. They are configuration values, not
          validated psychometric thresholds.
        </AlertDescription>
      </Alert>
      <ValidationBanner draftCount={rows.length} />

      {!instId ? (
        <div className='rounded-md border border-dashed p-10 text-center'>
          <Lock className='mx-auto mb-2 h-8 w-8 text-muted-foreground' />
          <p className='text-sm text-muted-foreground'>
            Band cutoffs are per school. Choose a school above to view and edit its cutoffs.
          </p>
        </div>
      ) : configsQuery.isLoading ? (
        <Skeleton className='h-64 w-full' />
      ) : rows.length === 0 ? (
        <div className='rounded-md border border-dashed p-10 text-center'>
          <SlidersHorizontal className='mx-auto mb-2 h-8 w-8 text-muted-foreground' />
          <p className='text-sm text-muted-foreground'>
            No cutoffs configured for {instName(instId)} yet. Create one to start.
          </p>
        </div>
      ) : (
        <div className='rounded-md border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dimension</TableHead>
                <TableHead>Band</TableHead>
                <TableHead className='text-right'>Min (provisional)</TableHead>
                <TableHead className='text-right'>Max (provisional)</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className='text-right'>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className='font-medium capitalize'>{r.dimension}</TableCell>
                  <TableCell>{BAND_LABEL[r.band]}</TableCell>
                  <TableCell className='text-right tabular-nums'>{r.min_score}</TableCell>
                  <TableCell className='text-right tabular-nums'>{r.max_score}</TableCell>
                  <TableCell>
                    {r.is_system ? (
                      <Badge variant='secondary'>system</Badge>
                    ) : (
                      <span className='text-xs text-muted-foreground'>custom</span>
                    )}
                  </TableCell>
                  <TableCell className='text-right'>
                    <div className='flex justify-end gap-1'>
                      <Button size='sm' variant='ghost' onClick={() => openEdit(r)}>
                        <Pencil className='h-3.5 w-3.5' />
                      </Button>
                      <Button
                        size='sm'
                        variant='ghost'
                        onClick={() => setDeleting(r)}
                        aria-label={`Delete ${r.dimension} ${BAND_LABEL[r.band]} cutoff`}
                      >
                        <Trash2 className='h-3.5 w-3.5 text-destructive' />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <BandConfigDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        institutionId={instId}
      />
      <DeleteBandConfigDialog
        row={deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
      />
    </div>
  );
}
