'use client';

import { useRouter, useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft } from 'lucide-react';
import { BosRegulationTaxonomy } from '@/types/bos';
import { ProgrammeOutcomesEditor } from '../_components/programme-outcomes-editor';
import { BoardTaxonomyTable } from '../_components/board-taxonomy-table';

interface Regulation {
  id: string;
  title: string;
  regulation_year: string;
  regulation_code: string;
  institution_id?: string;
}

export default function EditTaxonomyPage() {
  const router = useRouter();
  const params = useParams();
  const regulationId = params.regulationId as string;

  const regulationsQuery = useQuery<Regulation[]>({
    // preferId keeps THIS regulation at the front of the code-dedupe, so it survives
    // even when another institution shares the same regulation_code — preserving the
    // correct institution_id + label for this page.
    queryKey: ['bos', 'regulations', 'prefer', regulationId],
    queryFn: async () => {
      const res = await fetch(`/api/bos/regulations?preferId=${encodeURIComponent(regulationId)}`);
      if (!res.ok) throw new Error('Failed to load regulations');
      const json = await res.json();
      return json.data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });
  const regulation = (regulationsQuery.data ?? []).find((r) => r.id === regulationId);
  const regulationLabel = regulation
    ? `${regulation.title} (${regulation.regulation_code})`
    : regulationId;

  // Light check: is the regulation-wide default configured? Gates Programme Outcomes.
  // Also the most reliable source of the institution (the row carries institutions_id),
  // which we use to scope the board list — robust even when the regulation is absent
  // from the deduped /api/bos/regulations list.
  const defaultTaxQuery = useQuery<BosRegulationTaxonomy | null>({
    queryKey: ['bos', 'regulation-taxonomy-config', regulationId, ''],
    queryFn: async () => {
      const res = await fetch(`/api/bos/taxonomy/${regulationId}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!regulationId,
  });
  const isConfigured = !!defaultTaxQuery.data?.taxonomy_type;
  const institutionForBoards =
    regulation?.institution_id ?? defaultTaxQuery.data?.institutions_id ?? undefined;

  return (
    <div className='space-y-6'>
      <div className='space-y-1'>
        <Button
          variant='ghost'
          size='sm'
          onClick={() => router.push('/bos/taxonomy')}
          className='gap-2 -ml-2'
        >
          <ArrowLeft className='h-4 w-4' />
          Back to Taxonomy
        </Button>
        <h1 className='text-lg font-semibold flex items-center gap-2'>
          Taxonomy
          <Badge variant='outline' className='text-xs font-normal'>{regulationLabel}</Badge>
        </h1>
      </div>

      {/* The whole feature in one table: a default framework + optional per-board overrides. */}
      <Card>
        <CardHeader>
          <CardTitle>Assign taxonomy by board</CardTitle>
          <CardDescription>
            Pick the framework each board uses. Set the regulation default once; switch a board to a
            different framework only if it needs one.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {regulationsQuery.isLoading ? (
            <Skeleton className='h-40 w-full' />
          ) : (
            <BoardTaxonomyTable regulationId={regulationId} institutionId={institutionForBoards} />
          )}
        </CardContent>
      </Card>

      {/* Programme Outcomes — unchanged, gated on a configured default. */}
      <Card>
        <CardHeader>
          <div className='flex items-center gap-2'>
            <CardTitle>Programme Outcomes</CardTitle>
            {!isConfigured && (
              <Badge variant='secondary' className='text-xs'>Set a default framework first</Badge>
            )}
          </div>
          <CardDescription>
            Configure POs and PSOs per programme. Only the board chairman for each programme can edit
            outcomes. Board members can view.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isConfigured ? (
            <ProgrammeOutcomesEditor regulationId={regulationId} />
          ) : (
            <div className='text-center py-8 border rounded-md border-dashed'>
              <p className='text-sm text-muted-foreground'>
                Set the regulation default framework above before configuring programme outcomes.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
