'use client';

// Learners tab on /campus-living/residents. Lists every Learner whose
// admission record classifies them as a hostelite (learners_profiles.
// accommodation_type = 'HOSTEL'). Prod has ~718 rows today, 0 of which
// have matching hostel_allocations.
//
// 2026-05-10: BUG-003325 + BUG-003326 — added 4 new filters
// (institution / year / gender / block, with URL persistence) + click-row →
// comprehensive read-only detail drawer. Pencil opens the existing edit
// drawer (stopPropagation prevents row-click). Spec at
// .claude/scratch/residents-filter-detail-spec-2026-05-09.md.

import { useState, useMemo, useCallback } from 'react';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuth } from '@/hooks/use-auth';
import {
  useLearnerHostelites,
  useHostelBlocksForFilter,
} from '@/hooks/campus-living/use-learner-hostelites';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
import { Loader2, Pencil, Search, Trash2, UserPlus } from 'lucide-react';
import {
  UNASSIGNED_BLOCK,
  type LearnerHostelite,
  type LearnerHostelitesFilters,
  type LearnerHostelType,
} from '@/types/campus-living';
import { RemoveHosteliteDialog } from './remove-hostelite-dialog';
import { AddLearnerToHostelDialog } from './add-learner-to-hostel-dialog';
import { EditHosteliteDrawer } from './edit-hostelite-drawer';
import { LearnerDetailDrawer } from './learner-detail-drawer';
import { FilterChips, YEAR_OPTIONS, GENDER_OPTIONS } from './filter-chips';
import {
  useResidentsFilterUrl,
  useReconcileBlockInstitution,
} from '../_hooks/use-residents-filter-url';

const HOSTEL_TYPE_OPTIONS: { value: LearnerHostelType | 'all'; label: string }[] = [
  { value: 'all', label: 'All types' },
  { value: 'AC HOSTEL', label: 'AC' },
  { value: 'NON-AC HOSTEL', label: 'Non-AC' },
];

function fullName(l: LearnerHostelite): string {
  const parts = [l.first_name, l.last_name].filter(Boolean).map((s) => s!.trim());
  return parts.join(' ') || '(unnamed)';
}

function hostelTypeBadge(type: LearnerHostelite['hostel_type']) {
  if (!type) return <Badge variant='outline'>Not set</Badge>;
  const label = type === 'AC HOSTEL' ? 'AC' : 'Non-AC';
  const variant = type === 'AC HOSTEL' ? 'default' : 'secondary';
  return <Badge variant={variant as 'default' | 'secondary'}>{label}</Badge>;
}

export function LearnersTab() {
  const { profile } = useAuth();
  const { isSuperAdmin, permissions } = usePermissions();
  const { institutions } = useInstitutionsWithAccess();

  // URL-backed filter state (BUG-003325 — shareable + survives refresh)
  const { state, setState, clearAllFilters, activeFilterCount } = useResidentsFilterUrl();

  // Institution scoping: non-super-admin pinned to own institution; super-admin
  // can pick from URL `institution` param or see all (undefined).
  const userInstitutionId: string | undefined = profile?.institution_id ?? undefined;
  const effectiveInstitutionId: string | undefined = isSuperAdmin
    ? state.institution ?? undefined
    : userInstitutionId;

  // Block dropdown options — scoped to accessible institutions
  const { data: blockList } = useHostelBlocksForFilter(effectiveInstitutionId);

  // Conflict reconciliation: if URL has block_id ∉ selected institution, clear it
  const blockMap = useMemo(() => {
    if (!blockList) return null;
    const m = new Map<string, { institution_id: string }>();
    blockList.forEach((b) => m.set(b.id, { institution_id: b.institution_id }));
    return m;
  }, [blockList]);
  useReconcileBlockInstitution(state, setState, blockMap);

  // Local mutation state (drawers + dialogs that aren't URL-shared)
  const [removeTarget, setRemoveTarget] = useState<LearnerHostelite | null>(null);
  const [editTarget, setEditTarget] = useState<LearnerHostelite | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  // Edit pencil — wardens + super_admins only
  const canEdit = isSuperAdmin || !!permissions?.['campus_living.residents.edit'];

  // Compose filters for the service
  const filters: LearnerHostelitesFilters = useMemo(() => {
    const f: LearnerHostelitesFilters = {};
    if (state.q.trim()) f.search = state.q.trim();
    if (state.hostel) f.hostel_type = state.hostel;
    if (state.institution && isSuperAdmin) f.institution_id = state.institution;
    if (state.year !== null) f.year_of_study = state.year;
    if (state.gender) f.gender = state.gender;
    if (state.block) f.block_id = state.block;
    return f;
  }, [state, isSuperAdmin]);

  const { data, isLoading, error } = useLearnerHostelites(effectiveInstitutionId, filters);
  const rows = data?.data ?? [];
  const total = data?.count ?? 0;

  const instName = useMemo(() => {
    const map = new Map<string, string>();
    institutions.forEach((i: { id: string; name: string }) => map.set(i.id, i.name));
    return (id: string) => map.get(id) ?? '—';
  }, [institutions]);

  // Row click → open detail drawer (BUG-003326). Pencil + Trash buttons use
  // stopPropagation so they don't ALSO fire row-click.
  const handleRowClick = useCallback(
    (learner: LearnerHostelite) => {
      setState({ detail: learner.id });
    },
    [setState],
  );
  const handleRowKeyDown = useCallback(
    (e: React.KeyboardEvent, learner: LearnerHostelite) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleRowClick(learner);
      }
    },
    [handleRowClick],
  );

  return (
    <div className='space-y-4'>
      {/* Row 1: Search + Hostel type (existing dropdowns) */}
      <div className='flex flex-col sm:flex-row gap-3 sm:items-end justify-between'>
        <div className='flex flex-col sm:flex-row gap-3 flex-1'>
          <div className='relative sm:w-[280px]'>
            <Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground' />
            <Input
              value={state.q}
              onChange={(e) => setState({ q: e.target.value })}
              placeholder='Search by roll, name, or email…'
              className='pl-9'
            />
          </div>
          <Select
            value={state.hostel ?? 'all'}
            onValueChange={(v) =>
              setState({ hostel: v === 'all' ? null : (v as LearnerHostelType) })
            }
          >
            <SelectTrigger className='w-[160px]'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HOSTEL_TYPE_OPTIONS.map((o) => (
                <SelectItem key={o.value as string} value={o.value as string}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <UserPlus className='mr-2 h-4 w-4' />
          Add Learner to Hostel
        </Button>
      </div>

      {/* Row 2: Institution + Block dropdowns (NEW — BUG-003325) */}
      <div className='flex flex-col sm:flex-row gap-3'>
        <div className='space-y-1 sm:w-[260px]'>
          <label className='text-[11px] text-muted-foreground'>Institution</label>
          <Select
            value={state.institution ?? 'all'}
            onValueChange={(v) => setState({ institution: v === 'all' ? null : v })}
            disabled={!isSuperAdmin}
          >
            <SelectTrigger>
              <SelectValue
                placeholder={
                  isSuperAdmin
                    ? 'All institutions'
                    : userInstitutionId
                      ? instName(userInstitutionId)
                      : '—'
                }
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All institutions</SelectItem>
              {institutions.map((i: { id: string; name: string }) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className='space-y-1 sm:w-[260px]'>
          <label className='text-[11px] text-muted-foreground'>Block</label>
          <Select
            value={state.block ?? 'all'}
            onValueChange={(v) =>
              setState({
                block:
                  v === 'all'
                    ? null
                    : v === UNASSIGNED_BLOCK
                      ? UNASSIGNED_BLOCK
                      : v,
              })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder='All blocks' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All blocks</SelectItem>
              <SelectItem value={UNASSIGNED_BLOCK}>Unassigned</SelectItem>
              {(blockList ?? []).map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                  {b.code ? ` (${b.code})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Row 3: Year chips (NEW) */}
      <FilterChips
        label='Year'
        options={YEAR_OPTIONS}
        value={state.year}
        onChange={(v) => setState({ year: v })}
      />

      {/* Row 4: Gender chips (NEW) */}
      <FilterChips
        label='Gender'
        options={GENDER_OPTIONS}
        value={state.gender}
        onChange={(v) => setState({ gender: v })}
      />

      {/* Active filter count + Clear */}
      <div className='flex items-center justify-between text-sm'>
        <div className='text-muted-foreground'>
          {isLoading ? (
            'Loading…'
          ) : (
            <>
              Showing <span className='font-medium text-foreground'>{rows.length}</span> of{' '}
              <span className='font-medium text-foreground'>{total}</span> learner hostelite
              {total === 1 ? '' : 's'}
              {activeFilterCount > 0 && (
                <span className='ml-2 text-xs'>
                  ({activeFilterCount} filter{activeFilterCount === 1 ? '' : 's'} active)
                </span>
              )}
            </>
          )}
        </div>
        {activeFilterCount > 0 && (
          <button
            type='button'
            onClick={clearAllFilters}
            className='text-xs text-primary hover:underline underline-offset-2'
          >
            Clear all filters
          </button>
        )}
      </div>

      {/* Table */}
      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Roll</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className='hidden md:table-cell'>Email</TableHead>
              <TableHead>Hostel</TableHead>
              {isSuperAdmin && <TableHead className='hidden lg:table-cell'>Institution</TableHead>}
              <TableHead className='hidden sm:table-cell'>Gender</TableHead>
              <TableHead className='text-right'>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className='text-center py-12 text-muted-foreground'>
                  <Loader2 className='h-5 w-5 animate-spin inline mr-2' />
                  Loading learner hostelites…
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell colSpan={7} className='text-center py-12 text-destructive'>
                  Failed to load: {(error as Error).message}
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className='text-center py-12 text-muted-foreground'>
                  <p>No learners match these filters.</p>
                  {activeFilterCount > 0 && (
                    <button
                      type='button'
                      onClick={clearAllFilters}
                      className='mt-2 text-xs text-primary hover:underline underline-offset-2'
                    >
                      Clear all filters
                    </button>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow
                  key={r.id}
                  role='button'
                  tabIndex={0}
                  onClick={() => handleRowClick(r)}
                  onKeyDown={(e) => handleRowKeyDown(e, r)}
                  className='cursor-pointer hover:bg-muted/50'
                >
                  <TableCell className='font-mono text-xs'>{r.roll_number ?? '—'}</TableCell>
                  <TableCell className='font-medium'>{fullName(r)}</TableCell>
                  <TableCell className='hidden md:table-cell text-xs text-muted-foreground'>
                    {r.student_email ?? r.college_email ?? '—'}
                  </TableCell>
                  <TableCell>{hostelTypeBadge(r.hostel_type)}</TableCell>
                  {isSuperAdmin && (
                    <TableCell className='hidden lg:table-cell text-xs text-muted-foreground'>
                      {instName(r.institution_id)}
                    </TableCell>
                  )}
                  <TableCell className='hidden sm:table-cell text-xs capitalize'>
                    {r.gender?.toLowerCase() ?? '—'}
                  </TableCell>
                  <TableCell className='text-right'>
                    {canEdit && (
                      <Button
                        variant='ghost'
                        size='sm'
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditTarget(r);
                        }}
                        title='Edit hostel details'
                      >
                        <Pencil className='h-4 w-4' />
                      </Button>
                    )}
                    <Button
                      variant='ghost'
                      size='sm'
                      onClick={(e) => {
                        e.stopPropagation();
                        setRemoveTarget(r);
                      }}
                      title='Remove from hostel (mark as day scholar)'
                    >
                      <Trash2 className='h-4 w-4 text-destructive' />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Drawers + dialogs */}
      <RemoveHosteliteDialog
        learner={removeTarget}
        onClose={() => setRemoveTarget(null)}
      />
      <EditHosteliteDrawer
        learner={editTarget}
        onClose={() => setEditTarget(null)}
      />
      <AddLearnerToHostelDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        institutionId={effectiveInstitutionId}
      />

      {/* NEW: read-only detail drawer (BUG-003326) */}
      <LearnerDetailDrawer
        learnerId={state.detail}
        onClose={() => setState({ detail: null })}
        canEdit={canEdit}
        onEdit={
          canEdit && state.detail
            ? () => {
                const target = rows.find((r) => r.id === state.detail);
                if (target) {
                  setState({ detail: null });
                  setEditTarget(target);
                }
              }
            : undefined
        }
      />
    </div>
  );
}
