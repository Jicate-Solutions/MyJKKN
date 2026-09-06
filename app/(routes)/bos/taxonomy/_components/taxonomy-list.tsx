'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { usePermissions } from '@/hooks/use-permissions';
import { useInstitutionContext } from '@/hooks/use-institution-context';
import { InstitutionPicker } from '@/app/(routes)/bos/_components/institution-picker';
import { TaxonomyBadge } from './taxonomy-badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface Regulation {
  id: string;
  title: string;
  regulation_year: string;
  regulation_code: string;
}

interface TaxonomyAssignment {
  id: string;
  regulation_id: string;
  taxonomy_type: string;
  institutions_id: string;
}

export function TaxonomyList() {
  const router = useRouter();
  const { isSuperAdmin } = usePermissions();
  const { data: institutionCtx } = useInstitutionContext();

  const [selectedInstitutionId, setSelectedInstitutionId] = useState<string | undefined>(undefined);

  // Super-admin picks from InstitutionPicker; regular users resolve via useInstitutionContext.
  const institutionId = isSuperAdmin
    ? selectedInstitutionId
    : (institutionCtx?.myjkkn_id ?? undefined);

  const regulationsQuery = useQuery<Regulation[]>({
    queryKey: ['bos', 'regulations', institutionId],
    queryFn: async () => {
      const url = institutionId
        ? `/api/bos/regulations?institutionId=${institutionId}`
        : '/api/bos/regulations';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to load regulations');
      const json = await res.json();
      return json.data ?? [];
    },
    enabled: !!institutionId || !isSuperAdmin,
  });

  const assignmentsQuery = useQuery<TaxonomyAssignment[]>({
    queryKey: ['bos', 'taxonomy-assignments', institutionId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (institutionId) params.set('institutionsId', institutionId);
      // Show the regulation-wide default (board_id NULL) per regulation. Per-board
      // overrides are configured on the regulation's detail page (child table).
      params.set('boardId', 'null');
      const res = await fetch(`/api/bos/taxonomy?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load taxonomy assignments');
      const json = await res.json();
      return json.data ?? [];
    },
    enabled: !!institutionId || !isSuperAdmin,
  });

  const assignedMap = new Map(
    (assignmentsQuery.data ?? []).map((a) => [a.regulation_id, a.taxonomy_type])
  );

  const isLoading = regulationsQuery.isLoading || assignmentsQuery.isLoading;
  const error = regulationsQuery.error ?? assignmentsQuery.error;

  return (
    <div className='space-y-4'>
      {isSuperAdmin && (
        <div className='flex flex-wrap items-end gap-3'>
          <InstitutionPicker
            value={selectedInstitutionId}
            onChange={setSelectedInstitutionId}
            showAllOption
          />
          <Button
            variant='ghost'
            size='sm'
            onClick={() => setSelectedInstitutionId(undefined)}
          >
            Reset
          </Button>
        </div>
      )}

      {!institutionId && isSuperAdmin ? (
        <p className='text-sm text-muted-foreground py-4'>
          Select an institution to view regulation taxonomy assignments.
        </p>
      ) : isLoading ? (
        <div className='space-y-2'>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className='h-12 w-full' />
          ))}
        </div>
      ) : error ? (
        <p className='text-sm text-destructive'>
          {error instanceof Error ? error.message : 'Failed to load data'}
        </p>
      ) : (regulationsQuery.data ?? []).length === 0 ? (
        <p className='text-sm text-muted-foreground py-4'>No regulations found.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Regulation</TableHead>
              <TableHead>Taxonomy Assigned</TableHead>
              <TableHead className='text-right'>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(regulationsQuery.data ?? []).map((reg) => {
              const taxonomyType = assignedMap.get(reg.id);
              return (
                <TableRow key={reg.id}>
                  <TableCell className='font-medium'>{reg.title}</TableCell>
                  <TableCell>
                    {taxonomyType ? (
                      <TaxonomyBadge type={taxonomyType} />
                    ) : (
                      <span className='text-sm text-muted-foreground'>Not configured</span>
                    )}
                  </TableCell>
                  <TableCell className='text-right'>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => router.push(`/bos/taxonomy/${reg.id}`)}
                    >
                      Configure
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
