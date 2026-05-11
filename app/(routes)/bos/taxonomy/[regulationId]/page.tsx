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
import { TaxonomyForm } from '../_components/taxonomy-form';
import { ProgrammeOutcomesEditor } from '../_components/programme-outcomes-editor';

interface Regulation {
  id: string;
  title: string;
  regulation_year: string;
  regulation_code: string;
}

export default function EditTaxonomyPage() {
  const router = useRouter();
  const params = useParams();
  const regulationId = params.regulationId as string;

  const regulationsQuery = useQuery<Regulation[]>({
    queryKey: ['bos', 'regulations'],
    queryFn: async () => {
      const res = await fetch('/api/bos/regulations');
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

  const taxonomyQuery = useQuery<BosRegulationTaxonomy | null>({
    // Distinct key from useBosTaxonomy (which shares ['bos','taxonomy',id]) to avoid
    // key collision and unwanted error propagation between this page and the syllabus form.
    queryKey: ['bos', 'regulation-taxonomy-config', regulationId],
    queryFn: async () => {
      const res = await fetch(`/api/bos/taxonomy/${regulationId}`);
      if (res.status === 404) return null;
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to load taxonomy');
      }
      return res.json();
    },
    enabled: !!regulationId,
    retry: false,
  });

  const isLoading = taxonomyQuery.isLoading || regulationsQuery.isLoading;
  const isConfigured = !!taxonomyQuery.data;

  if (isLoading) {
    return (
      <div className='space-y-6'>
        <Skeleton className='h-10 w-32' />
        <Card>
          <CardHeader>
            <Skeleton className='h-6 w-64' />
            <Skeleton className='h-4 w-48' />
          </CardHeader>
          <CardContent>
            <div className='space-y-4'>
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className='h-10 w-full' />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (taxonomyQuery.error) {
    return (
      <div className='space-y-6'>
        <Button variant='ghost' size='sm' onClick={() => router.back()} className='gap-2'>
          <ArrowLeft className='h-4 w-4' />
          Back
        </Button>
        <Card>
          <CardContent className='pt-6'>
            <p className='text-center text-destructive'>
              {taxonomyQuery.error instanceof Error
                ? taxonomyQuery.error.message
                : 'Failed to load taxonomy'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      {/* Header */}
      <div className='flex items-center gap-2'>
        <Button
          variant='ghost'
          size='sm'
          onClick={() => router.push('/bos/taxonomy')}
          className='gap-2'
        >
          <ArrowLeft className='h-4 w-4' />
          Back to Taxonomy
        </Button>
      </div>

      {/* Step 1 — Framework & K-Values */}
      <Card>
        <CardHeader>
          <div className='flex items-center gap-2'>
            <CardTitle>Step 1 — Framework & K-Values</CardTitle>
            <Badge variant='outline' className='text-xs'>
              {regulationLabel}
            </Badge>
          </div>
          <CardDescription>
            Select a taxonomy framework and define the knowledge levels (K1, K2, …).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TaxonomyForm
            regulationId={regulationId}
            initialData={taxonomyQuery.data ?? null}
          />
        </CardContent>
      </Card>

      {/* Step 2 — Programme Outcomes */}
      <Card>
        <CardHeader>
          <div className='flex items-center gap-2'>
            <CardTitle>Step 2 — Programme Outcomes</CardTitle>
            {!isConfigured && (
              <Badge variant='secondary' className='text-xs'>
                Save Step 1 first
              </Badge>
            )}
          </div>
          <CardDescription>
            Configure POs and PSOs per programme. Only the board chairman for each programme
            can edit outcomes. Board members can view. Others have no access.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isConfigured ? (
            <ProgrammeOutcomesEditor regulationId={regulationId} />
          ) : (
            <div className='text-center py-8 border rounded-md border-dashed'>
              <p className='text-sm text-muted-foreground'>
                Save the taxonomy framework above before configuring programme outcomes.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
