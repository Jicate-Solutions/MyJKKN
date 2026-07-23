'use client';

import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { BosProgrammeOutcome, BosProgrammeSpecificOutcome } from '@/types/bos';

interface Mapping { po_code: string; pso_code: string; }

interface PoPsoMappingMatrixProps {
  regulationId: string;
  programmeCode: string;
  institutionsId: string;
  canEdit: boolean;
}

export function PoPsoMappingMatrix({
  regulationId,
  programmeCode,
  institutionsId,
  canEdit,
}: PoPsoMappingMatrixProps) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  // Set of "PO1:PSO2" keys representing checked cells
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);

  const posQuery = useQuery<{ data: BosProgrammeOutcome[] }>({
    queryKey: ['bos', 'programme-pos', regulationId, programmeCode],
    queryFn: async () => {
      const res = await fetch(`/api/bos/taxonomy/${regulationId}/programmes/${programmeCode}/pos`);
      if (!res.ok) throw new Error('Failed to load POs');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const psosQuery = useQuery<{ data: BosProgrammeSpecificOutcome[] }>({
    queryKey: ['bos', 'programme-psos', regulationId, programmeCode],
    queryFn: async () => {
      const res = await fetch(`/api/bos/taxonomy/${regulationId}/programmes/${programmeCode}/psos`);
      if (!res.ok) throw new Error('Failed to load PSOs');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const mappingKey = ['bos', 'po-pso-mapping', regulationId, programmeCode];
  const mappingQuery = useQuery<{ data: Mapping[] }>({
    queryKey: mappingKey,
    queryFn: async () => {
      const res = await fetch(
        `/api/bos/taxonomy/${regulationId}/programmes/${programmeCode}/po-pso-mapping`
      );
      if (!res.ok) throw new Error('Failed to load mapping');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  // Seed checked state from saved mappings
  useEffect(() => {
    if (mappingQuery.data?.data) {
      setChecked(new Set(mappingQuery.data.data.map((m) => `${m.po_code}:${m.pso_code}`)));
      setDirty(false);
    }
  }, [mappingQuery.data]);

  const pos = posQuery.data?.data ?? [];
  const psos = psosQuery.data?.data ?? [];

  const toggle = (poCode: string, psoCode: string) => {
    if (!canEdit) return;
    const key = `${poCode}:${psoCode}`;
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const mappings: Mapping[] = [];
      for (const key of checked) {
        const [po_code, pso_code] = key.split(':');
        mappings.push({ po_code, pso_code });
      }
      const res = await fetch(
        `/api/bos/taxonomy/${regulationId}/programmes/${programmeCode}/po-pso-mapping`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mappings, institutions_id: institutionsId }),
        }
      );
      if (!res.ok) throw new Error('Failed to save mapping');
      toast.success('Mapping saved');
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: mappingKey });
    } catch {
      toast.error('Failed to save mapping');
    } finally {
      setSaving(false);
    }
  };

  const isLoading = posQuery.isLoading || psosQuery.isLoading || mappingQuery.isLoading;

  if (isLoading) {
    return (
      <div className='space-y-2'>
        {[1, 2, 3].map((i) => <Skeleton key={i} className='h-8 w-full' />)}
      </div>
    );
  }

  if (pos.length === 0 || psos.length === 0) {
    return (
      <p className='text-sm text-muted-foreground text-center py-6'>
        {pos.length === 0
          ? 'No Programme Outcomes (POs) defined yet.'
          : 'No Programme Specific Outcomes (PSOs) defined yet.'}
        {' '}Add them in the PO / PSO tabs first.
      </p>
    );
  }

  return (
    <div className='space-y-3'>
      <div className='overflow-x-auto rounded-md border'>
        <table className='min-w-max text-sm'>
          <thead>
            <tr className='border-b bg-muted/50'>
              <th className='px-4 py-2 text-left font-medium text-muted-foreground w-20'>
                PO / PSO
              </th>
              {psos.map((pso) => (
                <th key={pso.pso_code} className='px-3 py-2 text-center font-medium min-w-[64px]'>
                  {pso.pso_code}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pos.map((po, rowIdx) => (
              <tr key={po.po_code} className={rowIdx % 2 === 0 ? '' : 'bg-muted/20'}>
                <td className='px-4 py-2 font-medium'>{po.po_code}</td>
                {psos.map((pso) => {
                  const key = `${po.po_code}:${pso.pso_code}`;
                  return (
                    <td key={pso.pso_code} className='px-3 py-2 text-center'>
                      <Checkbox
                        checked={checked.has(key)}
                        onCheckedChange={() => toggle(po.po_code, pso.pso_code)}
                        disabled={!canEdit}
                        aria-label={`Map ${po.po_code} to ${pso.pso_code}`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <div className='flex justify-end'>
          <Button
            size='sm'
            disabled={!dirty || saving}
            onClick={handleSave}
          >
            {saving ? (
              <Loader2 className='h-4 w-4 mr-1.5 animate-spin' />
            ) : (
              <Save className='h-4 w-4 mr-1.5' />
            )}
            Save Mapping
          </Button>
        </div>
      )}
    </div>
  );
}
