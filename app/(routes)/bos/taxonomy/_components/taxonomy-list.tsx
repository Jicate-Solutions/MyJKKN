'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { BosRegulationTaxonomy } from '@/types/bos';
import { usePermissions } from '@/hooks/use-permissions';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Regulation {
  id: string;
  title: string;
}

interface Institution {
  id: string;
  name: string;
}

export function TaxonomyList() {
  const router = useRouter();
  const { isSuperAdmin, userProfile, isLoading: permissionsLoading } = usePermissions();
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [selectedInstitution, setSelectedInstitution] = useState<string>('');
  const [regulations, setRegulations] = useState<Regulation[]>([]);
  const [syllabusCount, setSyllabusCount] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isReady = !permissionsLoading && (isSuperAdmin ? !!selectedInstitution : true);

  useEffect(() => {
    if (isSuperAdmin && !selectedInstitution && institutions.length > 0) {
      setSelectedInstitution(institutions[0].id);
    }
  }, [institutions, isSuperAdmin, selectedInstitution]);

  useEffect(() => {
    const fetchInstitutions = async () => {
      if (!isSuperAdmin) return;
      try {
        const res = await fetch('/api/bos/institutions');
        if (!res.ok) throw new Error('Failed to fetch institutions');
        const data = await res.json();
        setInstitutions(data || []);
      } catch (err) {
        console.error('Failed to fetch institutions:', err);
      }
    };

    fetchInstitutions();
  }, [isSuperAdmin]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const res = await fetch('/api/bos/regulations');
        if (!res.ok) throw new Error('Failed to fetch regulations');
        const { data } = await res.json();
        setRegulations(data || []);

        // Fetch syllabi counts for each regulation
        const institutionId = isSuperAdmin ? selectedInstitution : userProfile?.institution_id;
        const counts: Record<string, number> = {};

        for (const regulation of data || []) {
          const syllabusRes = await fetch(
            `/api/bos/syllabi?regulationId=${regulation.id}&institutionsId=${institutionId}&limit=1`
          );
          if (syllabusRes.ok) {
            const { metadata } = await syllabusRes.json();
            counts[regulation.id] = metadata?.total || 0;
          }
        }
        setSyllabusCount(counts);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load regulations');
      } finally {
        setIsLoading(false);
      }
    };

    if (isReady) {
      fetchData();
    }
  }, [isReady, selectedInstitution, userProfile?.institution_id, isSuperAdmin]);

  if (isSuperAdmin && institutions.length === 0) {
    return (
      <Alert>
        <AlertCircle className='h-4 w-4' />
        <AlertTitle>No Institutions</AlertTitle>
        <AlertDescription>
          No institutions available to manage taxonomy.
        </AlertDescription>
      </Alert>
    );
  }

  if (isLoading) {
    return (
      <div className='space-y-4'>
        {isSuperAdmin && <Skeleton className='h-10 w-48' />}
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className='h-20 w-full' />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant='destructive'>
        <AlertCircle className='h-4 w-4' />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (regulations.length === 0) {
    return (
      <div className='text-center py-8 text-muted-foreground'>
        No regulations found
      </div>
    );
  }

  return (
    <div className='space-y-4'>
      {isSuperAdmin && (
        <div className='space-y-2'>
          <label className='text-sm font-medium'>Select Institution</label>
          <Select value={selectedInstitution} onValueChange={setSelectedInstitution}>
            <SelectTrigger className='w-48'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {institutions.map((inst) => (
                <SelectItem key={inst.id} value={inst.id}>
                  {inst.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <p className='text-sm text-muted-foreground'>
        Manage learning outcome frameworks (K-values, Programme Outcomes, Programme Specific Outcomes) for each regulation.
      </p>

      <div className='grid gap-4'>
        {regulations.map((regulation) => (
          <div
            key={regulation.id}
            className='border rounded-lg p-4 flex items-center justify-between hover:bg-muted/50 transition-colors'
          >
            <div>
              <h3 className='font-semibold'>{regulation.title}</h3>
              <p className='text-xs text-muted-foreground mt-1'>
                {syllabusCount[regulation.id] || 0} syllabus/syllabi
              </p>
            </div>
            <Button
              variant='outline'
              onClick={() => router.push(`/bos/taxonomy/${regulation.id}`)}
            >
              Manage
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
