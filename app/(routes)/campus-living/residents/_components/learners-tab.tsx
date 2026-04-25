'use client';

// Learners tab on /campus-living/residents. Lists every Learner whose
// admission record classifies them as a hostelite (learners_profiles.
// accommodation_type = 'HOSTEL'). Prod has ~718 rows today, 0 of which
// have matching hostel_allocations — this tab is the first surface that
// makes that cohort visible to wardens.

import { useState, useMemo } from 'react';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuth } from '@/hooks/use-auth';
import { useLearnerHostelites } from '@/hooks/campus-living/use-learner-hostelites';
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
import type {
  LearnerHostelite,
  LearnerHostelitesFilters,
  LearnerHostelType,
} from '@/types/campus-living';
import { RemoveHosteliteDialog } from './remove-hostelite-dialog';
import { AddLearnerToHostelDialog } from './add-learner-to-hostel-dialog';
import { EditHosteliteDrawer } from './edit-hostelite-drawer';

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

  const institutionId: string | undefined = isSuperAdmin
    ? undefined
    : profile?.institution_id ?? undefined;

  const [search, setSearch] = useState('');
  const [hostelTypeFilter, setHostelTypeFilter] = useState<LearnerHostelType | 'all'>('all');
  const [removeTarget, setRemoveTarget] = useState<LearnerHostelite | null>(null);
  const [editTarget, setEditTarget] = useState<LearnerHostelite | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  // Gate the Edit pencil — wardens + super_admins only. Matches the
  // canActWarden pattern from PR #395.
  const canEdit = isSuperAdmin || !!permissions?.['campus_living.residents.edit'];

  const filters: LearnerHostelitesFilters = useMemo(() => {
    const f: LearnerHostelitesFilters = {};
    if (search.trim()) f.search = search.trim();
    if (hostelTypeFilter !== 'all') f.hostel_type = hostelTypeFilter;
    return f;
  }, [search, hostelTypeFilter]);

  const { data, isLoading, error } = useLearnerHostelites(institutionId, filters);

  const rows = data?.data ?? [];
  const total = data?.count ?? 0;

  const instName = useMemo(() => {
    const map = new Map<string, string>();
    institutions.forEach((i: { id: string; name: string }) => map.set(i.id, i.name));
    return (id: string) => map.get(id) ?? '—';
  }, [institutions]);

  return (
    <div className='space-y-4'>
      {/* Filters + Add button */}
      <div className='flex flex-col sm:flex-row gap-3 sm:items-end justify-between'>
        <div className='flex flex-col sm:flex-row gap-3 flex-1'>
          <div className='relative sm:w-[280px]'>
            <Search className='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground' />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder='Search by roll, name, or email…'
              className='pl-9'
            />
          </div>
          <div className='space-y-1'>
            <Select
              value={hostelTypeFilter as string}
              onValueChange={(v) => setHostelTypeFilter(v as LearnerHostelType | 'all')}
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
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <UserPlus className='mr-2 h-4 w-4' />
          Add Learner to Hostel
        </Button>
      </div>

      {/* Count + table */}
      <div className='text-sm text-muted-foreground'>
        {isLoading ? (
          'Loading…'
        ) : (
          <>
            Showing <span className='font-medium text-foreground'>{rows.length}</span> of{' '}
            <span className='font-medium text-foreground'>{total}</span> learner hostelite
            {total === 1 ? '' : 's'}
          </>
        )}
      </div>

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
                  No learners classified as hostelites match these filters.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
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
                        onClick={() => setEditTarget(r)}
                        title='Edit hostel details'
                      >
                        <Pencil className='h-4 w-4' />
                      </Button>
                    )}
                    <Button
                      variant='ghost'
                      size='sm'
                      onClick={() => setRemoveTarget(r)}
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
        institutionId={institutionId}
      />
    </div>
  );
}
