'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
import { ArrowLeft, Loader2, Pencil, Plus } from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { useHostelBlocks } from '@/hooks/campus-living/use-hostel-blocks';
import { useHousekeepingCleaners } from '@/hooks/campus-living/use-housekeeping-cleaners';
import { CleanerDialog } from './_components/cleaner-dialog';
import type { Cleaner } from '@/types/campus-living/housekeeping';

const HK_KEYS = ['campus_living.housekeeping.cleaners_manage'];

// Postgres DOW: index 0 = Sunday .. 6 = Saturday — the values actually stored
// in hostel_cleaners.working_days. Rendered Monday-first for readability only.
// Keep this in sync with the mapping in _components/cleaner-dialog.tsx.
const DOW_SHORT: Record<number, string> = {
  0: 'Su', 1: 'Mo', 2: 'Tu', 3: 'We', 4: 'Th', 5: 'Fr', 6: 'Sa',
};
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export default function HousekeepingCleanersPage() {
  const [institutionId, setInstitutionId] = useState<string>('all');
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Cleaner | null>(null);
  const [creating, setCreating] = useState(false);

  const { permissions, isSuperAdmin, isLoading: permsLoading } = usePermissions(HK_KEYS);
  // Default OPEN while loading: isSuperAdmin reads false mid-load, so gating on
  // it before permissions resolve would false-negative super admins out.
  const canManage =
    permsLoading || isSuperAdmin || !!permissions['campus_living.housekeeping.cleaners_manage'];

  const { institutions, loading: institutionsLoading } = useInstitutionsWithAccess();

  // Pass the selection straight through — never branch on isSuperAdmin to
  // decide WHICH institution's rows to fetch; RLS already filters them.
  const scopedInstitution = institutionId === 'all' ? undefined : institutionId;

  const { data: cleaners = [], isLoading } = useHousekeepingCleaners(
    scopedInstitution,
    showInactive,
  );

  const { data: blocksResult } = useHostelBlocks(scopedInstitution);
  const blockNameById = useMemo(() => {
    const list = ((blocksResult as any)?.data ?? []) as Array<{ id: string; name: string }>;
    return new Map(list.map((b) => [b.id, b.name]));
  }, [blocksResult]);

  return (
    <ContentLayout title='Cleaners'>
      <PageBreadcrumb
        items={[
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Housekeeping', href: '/campus-living/housekeeping' },
          { label: 'Cleaners' },
        ]}
      />

      <div className='space-y-4'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div>
            <h1 className='text-2xl font-semibold tracking-tight'>Cleaners</h1>
            <p className='max-w-3xl text-sm text-muted-foreground'>
              Who can be assigned to a cleaning, which blocks they serve, and when. These are
              directory records — cleaners do not log in.
            </p>
          </div>
          <div className='flex gap-2'>
            <Button asChild variant='outline' size='sm'>
              <Link href='/campus-living/housekeeping'>
                <ArrowLeft className='mr-1.5 h-4 w-4' /> Day board
              </Link>
            </Button>
            {canManage && (
              <Button size='sm' onClick={() => setCreating(true)}>
                <Plus className='mr-1.5 h-4 w-4' /> Add cleaner
              </Button>
            )}
          </div>
        </div>

        <Card>
          <CardContent className='flex flex-wrap items-center gap-4 p-4'>
            <Select
              value={institutionId}
              onValueChange={setInstitutionId}
              disabled={institutionsLoading}
            >
              <SelectTrigger className='w-[16rem]'>
                <SelectValue placeholder='All institutions' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All institutions</SelectItem>
                {institutions.map((inst: any) => (
                  <SelectItem key={inst.id} value={inst.id}>
                    {inst.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className='flex items-center gap-2'>
              <Switch id='show-inactive' checked={showInactive} onCheckedChange={setShowInactive} />
              <Label htmlFor='show-inactive' className='text-sm text-muted-foreground'>
                Show inactive
              </Label>
            </div>
          </CardContent>
        </Card>

        {isLoading && (
          <p className='flex items-center gap-2 py-8 text-sm text-muted-foreground'>
            <Loader2 className='h-4 w-4 animate-spin' /> Loading cleaners…
          </p>
        )}

        {!isLoading && cleaners.length === 0 && (
          <Card>
            <CardContent className='p-10 text-center text-sm text-muted-foreground'>
              No cleaners yet. Add one so bookings can be assigned.
            </CardContent>
          </Card>
        )}

        {cleaners.length > 0 && (
          <Card>
            <CardContent className='p-0'>
              <div className='overflow-x-auto'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Gender</TableHead>
                      <TableHead>Blocks</TableHead>
                      <TableHead>Working days</TableHead>
                      <TableHead>Shift</TableHead>
                      <TableHead>Status</TableHead>
                      {canManage && <TableHead className='w-16' />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cleaners.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className='font-medium'>{c.full_name}</TableCell>
                        <TableCell>{c.phone ?? '—'}</TableCell>
                        <TableCell>{c.gender ?? '—'}</TableCell>
                        <TableCell>
                          {c.block_ids.length === 0 ? (
                            <Badge variant='destructive'>None</Badge>
                          ) : (
                            <span title={c.block_ids.map((id) => blockNameById.get(id) ?? id).join(', ')}>
                              {c.block_ids.length}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className='flex gap-0.5'>
                            {DISPLAY_ORDER.map((dow) => (
                              <span
                                key={dow}
                                className={[
                                  'rounded px-1 text-[10px]',
                                  c.working_days?.includes(dow)
                                    ? 'bg-primary/10 font-medium text-primary'
                                    : 'text-muted-foreground/50',
                                ].join(' ')}
                              >
                                {DOW_SHORT[dow]}
                              </span>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          {c.shift_start && c.shift_end
                            ? `${c.shift_start.slice(0, 5)}–${c.shift_end.slice(0, 5)}`
                            : '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={c.is_active ? 'secondary' : 'outline'}>
                            {c.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                        {canManage && (
                          <TableCell>
                            <Button variant='ghost' size='icon' onClick={() => setEditing(c)}>
                              <Pencil className='h-4 w-4' />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Keyed so a different cleaner (or a fresh create) MOUNTS a new dialog
          with state initialised from props, instead of an effect resetting it
          — which would cascade a render on every open. */}
      <CleanerDialog
        key={`create-${creating}-${scopedInstitution ?? 'all'}`}
        mode='create'
        open={creating}
        onOpenChange={setCreating}
        defaultInstitutionId={scopedInstitution}
      />
      <CleanerDialog
        key={`edit-${editing?.id ?? 'none'}`}
        mode='edit'
        cleaner={editing}
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
      />
    </ContentLayout>
  );
}
