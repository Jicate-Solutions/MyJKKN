'use client';

// =============================================================================
// RCLTP badge-catalog console (Phase 4d)
// =============================================================================
// Badge-catalog CRUD against useRcltpBadges + useCreate/Update/DeleteRcltpBadge.
// Badges are institution-scoped or global (institution_id null). This is a CONFIG
// surface — it edits what a badge IS (slug/name/points/criteria), never who has
// earned one and never any score.
//
// SAFETY: a badge's `criteria` JSON is PROVISIONAL — the award rules it encodes
// are NOT MyJKKN-validated and drive no live awarding yet. The criteria field is
// labelled "provisional — pending MyJKKN" and a persistent <ValidationBanner> sits
// on the catalog so it can never be mistaken for a validated, live rule.
// =============================================================================

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { Plus, Pencil, Trash2, Award, Globe } from 'lucide-react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  useRcltpBadges,
  useCreateRcltpBadge,
  useUpdateRcltpBadge,
  useDeleteRcltpBadge,
} from '@/hooks/rcltp/use-rcltp-gamification';
import { ValidationBanner } from '../../../_components/validation-banner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import type { RcltpBadge } from '@/types/rcltp';
import type { Json } from '@/types/supabase';

const GLOBAL = '__global__';
const ALL = '__all__';

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

function scopeBadge(institutionId: string | null, instName: (id: string | null) => string) {
  if (!institutionId)
    return (
      <Badge variant='secondary' className='gap-1'>
        <Globe className='h-3 w-3' /> Global
      </Badge>
    );
  return <span className='text-sm'>{instName(institutionId)}</span>;
}

// ===========================================================================
// Badge create/edit dialog
// ===========================================================================
function BadgeDialog({
  open,
  onOpenChange,
  editing,
  institutions,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: RcltpBadge | null;
  institutions: Institution[];
}) {
  const createBadge = useCreateRcltpBadge();
  const updateBadge = useUpdateRcltpBadge();

  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [iconUrl, setIconUrl] = useState('');
  const [category, setCategory] = useState('');
  const [points, setPoints] = useState('');
  const [criteriaText, setCriteriaText] = useState('');
  const [institutionId, setInstitutionId] = useState<string>(GLOBAL);
  const [criteriaError, setCriteriaError] = useState<string | null>(null);

  // Seed form whenever the dialog opens.
  function seed() {
    setSlug(editing?.slug ?? '');
    setName(editing?.name ?? '');
    setDescription(editing?.description ?? '');
    setIconUrl(editing?.icon_url ?? '');
    setCategory(editing?.category ?? '');
    setPoints(editing?.points != null ? String(editing.points) : '');
    setCriteriaText(
      editing?.criteria != null ? JSON.stringify(editing.criteria, null, 2) : ''
    );
    setInstitutionId(editing?.institution_id ?? GLOBAL);
    setCriteriaError(null);
  }

  function handleOpenChange(v: boolean) {
    if (v) seed();
    onOpenChange(v);
  }

  async function handleSave() {
    if (!slug.trim() || !name.trim()) {
      toast.error('Slug and name are required');
      return;
    }

    // criteria is optional free-form JSON config; parse + surface errors, never
    // silently drop. Empty = null (no provisional rule attached).
    let criteria: Json | null = null;
    if (criteriaText.trim()) {
      try {
        criteria = JSON.parse(criteriaText) as Json;
      } catch {
        setCriteriaError('Criteria must be valid JSON (e.g. {"min_streak": 5}).');
        toast.error('Criteria is not valid JSON');
        return;
      }
    }

    const base = {
      name: name.trim(),
      description: description.trim() || null,
      icon_url: iconUrl.trim() || null,
      category: category.trim() || null,
      points: points ? Number(points) : 0,
      criteria,
      institution_id: institutionId === GLOBAL ? null : institutionId,
    };

    try {
      if (editing) {
        // slug is immutable on update (UpdateRcltpBadgeDto omits slug).
        await updateBadge.mutateAsync({ id: editing.id, input: base });
      } else {
        await createBadge.mutateAsync({ slug: slug.trim(), ...base });
      }
      onOpenChange(false);
    } catch {
      /* hook surfaces the toast */
    }
  }

  const saving = createBadge.isPending || updateBadge.isPending;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className='max-w-2xl'>
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit badge' : 'New badge'}</DialogTitle>
          <DialogDescription>
            Edits the badge <strong>catalog</strong> only — who earns a badge is decided
            server-side, never here.
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4'>
          <ValidationBanner draftCount={1} />

          <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
            <div>
              <Label htmlFor='b-slug'>Slug</Label>
              <Input
                id='b-slug'
                value={slug}
                disabled={!!editing}
                placeholder='reading-streak-5'
                onChange={(e) => setSlug(e.target.value)}
              />
              {editing && (
                <p className='mt-1 text-xs text-muted-foreground'>
                  Slug is the stable identifier and cannot be changed after creation.
                </p>
              )}
            </div>
            <div>
              <Label htmlFor='b-name'>Name</Label>
              <Input
                id='b-name'
                value={name}
                placeholder='5-day reading streak'
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor='b-category'>Category</Label>
              <Input
                id='b-category'
                value={category}
                placeholder='streak, milestone, …'
                onChange={(e) => setCategory(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor='b-points'>Points</Label>
              <Input
                id='b-points'
                type='number'
                min={0}
                value={points}
                onChange={(e) => setPoints(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor='b-icon'>Icon URL</Label>
              <Input
                id='b-icon'
                value={iconUrl}
                placeholder='https://… (optional)'
                onChange={(e) => setIconUrl(e.target.value)}
              />
            </div>
            <div>
              <Label>Institution (board)</Label>
              <Select value={institutionId} onValueChange={setInstitutionId}>
                <SelectTrigger>
                  <SelectValue placeholder='Select school' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={GLOBAL}>Global (shared by all schools)</SelectItem>
                  {institutions.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor='b-desc'>Description</Label>
            <Textarea
              id='b-desc'
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor='b-criteria'>
              Criteria{' '}
              <span className='font-normal text-amber-700'>
                (provisional — criteria pending MyJKKN)
              </span>
            </Label>
            <Textarea
              id='b-criteria'
              rows={4}
              className='font-mono text-xs'
              placeholder='{"min_streak": 5}'
              value={criteriaText}
              onChange={(e) => {
                setCriteriaText(e.target.value);
                setCriteriaError(null);
              }}
            />
            {criteriaError && (
              <p className='mt-1 text-xs text-destructive'>{criteriaError}</p>
            )}
            <Alert className='mt-2'>
              <AlertDescription className='text-xs'>
                Criteria is <strong>provisional configuration only</strong>. It is{' '}
                <strong>not yet MyJKKN-validated</strong> and does not drive any live
                awarding — badges are awarded server-side, not by this rule. Leave blank if
                unsure.
              </AlertDescription>
            </Alert>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Save' : 'Create badge'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===========================================================================
// Delete confirm dialog
// ===========================================================================
function DeleteBadgeDialog({
  badge,
  onOpenChange,
}: {
  badge: RcltpBadge | null;
  onOpenChange: (v: boolean) => void;
}) {
  const deleteBadge = useDeleteRcltpBadge();

  async function confirm() {
    if (!badge) return;
    try {
      await deleteBadge.mutateAsync(badge.id);
      onOpenChange(false);
    } catch {
      /* hook surfaces the toast */
    }
  }

  return (
    <Dialog open={!!badge} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete badge</DialogTitle>
          <DialogDescription>
            Delete <strong>{badge?.name}</strong> from the catalog? This removes the badge
            definition. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className='gap-2 sm:gap-0'>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant='destructive'
            onClick={confirm}
            disabled={deleteBadge.isPending}
          >
            {deleteBadge.isPending ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===========================================================================
// Main console
// ===========================================================================
export function BadgeCatalogConsole() {
  const { data: institutions = [] } = useInstitutions();
  const [instFilter, setInstFilter] = useState<string>(ALL);

  const badgesQuery = useRcltpBadges(
    instFilter === ALL || instFilter === GLOBAL
      ? {}
      : { institution_id: instFilter }
  );
  const badges = badgesQuery.data?.data ?? [];

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RcltpBadge | null>(null);
  const [deleting, setDeleting] = useState<RcltpBadge | null>(null);

  const instName = useMemo(() => {
    const m = new Map(institutions.map((i) => [i.id, i.name]));
    return (id: string | null) => (id ? m.get(id) ?? 'Institution' : 'Global');
  }, [institutions]);

  function openNew() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(b: RcltpBadge) {
    setEditing(b);
    setDialogOpen(true);
  }

  return (
    <div className='space-y-4'>
      <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <h2 className='text-lg font-semibold'>Badge catalog</h2>
          <p className='text-sm text-muted-foreground'>
            Define the gamification badges per board, or globally. This edits what a badge
            is — earned badges are awarded server-side, never here.
          </p>
        </div>
        <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
          <Select value={instFilter} onValueChange={setInstFilter}>
            <SelectTrigger className='w-full sm:w-56'>
              <SelectValue placeholder='Filter by school' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All schools + global</SelectItem>
              {institutions.map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={openNew}>
            <Plus className='mr-2 h-4 w-4' /> New badge
          </Button>
        </div>
      </div>

      {/* Catalog-wide provisional banner: badge criteria are unvalidated config. */}
      <ValidationBanner draftCount={badges.length} />

      {badgesQuery.isLoading ? (
        <Skeleton className='h-64 w-full' />
      ) : badges.length === 0 ? (
        <div className='rounded-md border border-dashed p-10 text-center'>
          <Award className='mx-auto mb-2 h-8 w-8 text-muted-foreground' />
          <p className='text-sm text-muted-foreground'>
            No badges yet. Create one to start building the catalog.
          </p>
        </div>
      ) : (
        <div className='rounded-md border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className='text-right'>Points</TableHead>
                <TableHead>Criteria</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead className='text-right'>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {badges.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className='font-medium'>{b.name}</TableCell>
                  <TableCell className='font-mono text-xs text-muted-foreground'>
                    {b.slug}
                  </TableCell>
                  <TableCell className='text-sm'>{b.category ?? '—'}</TableCell>
                  <TableCell className='text-right'>{b.points}</TableCell>
                  <TableCell>
                    {b.criteria != null ? (
                      <Badge
                        variant='outline'
                        className='border-amber-300 text-amber-800'
                        title='Provisional rule — pending MyJKKN validation'
                      >
                        provisional
                      </Badge>
                    ) : (
                      <span className='text-xs text-muted-foreground'>none</span>
                    )}
                  </TableCell>
                  <TableCell>{scopeBadge(b.institution_id, instName)}</TableCell>
                  <TableCell className='text-right'>
                    <div className='flex justify-end gap-1'>
                      <Button size='sm' variant='ghost' onClick={() => openEdit(b)}>
                        <Pencil className='h-3.5 w-3.5' />
                      </Button>
                      <Button
                        size='sm'
                        variant='ghost'
                        onClick={() => setDeleting(b)}
                        aria-label={`Delete ${b.name}`}
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

      <BadgeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        institutions={institutions}
      />
      <DeleteBadgeDialog
        badge={deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
      />
    </div>
  );
}
