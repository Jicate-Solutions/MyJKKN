'use client';

import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft } from 'lucide-react';
import { BosRegulationTaxonomy } from '@/types/bos';
import { TaxonomyForm } from '../_components/taxonomy-form';

export default function EditTaxonomyPage() {
  const router = useRouter();
  const params = useParams();
  const regulationId = params.regulationId as string;

  const [regulation, setRegulation] = useState<{ id: string; name: string; code: string } | null>(null);
  const [taxonomy, setTaxonomy] = useState<BosRegulationTaxonomy | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const taxRes = await fetch(`/api/bos/taxonomy/${regulationId}`);
        if (!taxRes.ok && taxRes.status !== 404) {
          throw new Error('Failed to fetch taxonomy');
        }
        const taxData = taxRes.status === 200 ? await taxRes.json() : null;
        setTaxonomy(taxData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load taxonomy');
      } finally {
        setIsLoading(false);
      }
    };

    if (regulationId) {
      fetchData();
    }
  }, [regulationId]);

  if (isLoading) {
    return (
      <div className='space-y-6'>
        <Skeleton className='h-10 w-32' />
        <Card>
          <CardHeader>
            <Skeleton className='h-6 w-48' />
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

  if (error) {
    return (
      <div className='space-y-6'>
        <Button
          variant='ghost'
          size='sm'
          onClick={() => router.back()}
          className='gap-2'
        >
          <ArrowLeft className='h-4 w-4' />
          Back
        </Button>

        <Card>
          <CardContent className='pt-6'>
            <div className='text-center text-red-600'>{error}</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      <div className='flex items-center gap-2'>
        <Button
          variant='ghost'
          size='sm'
          onClick={() => router.back()}
          className='gap-2'
        >
          <ArrowLeft className='h-4 w-4' />
          Back
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Manage Regulation Taxonomy</CardTitle>
          <CardDescription>
            Configure learning outcome frameworks (K-values, Programme Outcomes, Programme Specific Outcomes)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TaxonomyForm regulationId={regulationId} initialData={taxonomy} />
        </CardContent>
      </Card>
    </div>
  );
}
