'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useBosTaxonomies, useBosTaxonomy } from '@/hooks/bos/use-bos-taxonomies';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { BosRegulationTaxonomy } from '@/types/bos';

interface TaxonomyFormProps {
  regulationId: string;
  initialData?: BosRegulationTaxonomy | null;
  onSaved?: () => void;
}

export function TaxonomyForm({ regulationId, initialData, onSaved }: TaxonomyFormProps) {
  const queryClient = useQueryClient();

  const [selectedTaxonomyId, setSelectedTaxonomyId] = useState<string>('');
  const [kValues, setKValues] = useState<Record<string, string>>(initialData?.k_values ?? {});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const taxonomiesQuery = useBosTaxonomies();
  const taxonomies = taxonomiesQuery.data?.data ?? [];
  const selectedTaxonomy = taxonomies.find((t) => t.id === selectedTaxonomyId);

  const taxonomyDetailQuery = useBosTaxonomy(selectedTaxonomyId || undefined);
  const taxonomyDetail = taxonomyDetailQuery.data;

  // Pre-select framework when editing existing data
  useEffect(() => {
    if (initialData && taxonomies.length > 0 && !selectedTaxonomyId) {
      const match = taxonomies.find((t) => t.code === initialData.taxonomy_type);
      if (match) setSelectedTaxonomyId(match.id);
    }
  }, [initialData, taxonomies, selectedTaxonomyId]);

  // Auto-fill K-values from taxonomy levels when selecting a new framework
  useEffect(() => {
    if (!selectedTaxonomyId || !taxonomyDetail) return;
    if (initialData) return; // don't overwrite existing config
    const levels = taxonomyDetail.levels ?? [];
    if (levels.length === 0) return;
    const autoFilled: Record<string, string> = {};
    [...levels]
      .sort((a, b) => a.sort_order - b.sort_order)
      .forEach((level) => {
        autoFilled[level.code] = level.name;
      });
    setKValues(autoFilled);
  }, [taxonomyDetail, selectedTaxonomyId, initialData]);

  const handleTaxonomyChange = (id: string) => {
    setSelectedTaxonomyId(id);
    if (!initialData) setKValues({});
  };

  const addKValue = () => {
    const next = `K${Object.keys(kValues).length + 1}`;
    setKValues({ ...kValues, [next]: '' });
  };
  const removeKValue = (key: string) => {
    const copy = { ...kValues };
    delete copy[key];
    setKValues(copy);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTaxonomy) {
      toast.error('Please select a taxonomy framework');
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/bos/taxonomy/${regulationId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taxonomy_type: selectedTaxonomy.code,
          k_values: kValues,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to save taxonomy');
      }
      toast.success('Taxonomy framework saved');
      queryClient.invalidateQueries({ queryKey: ['bos', 'taxonomy-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['bos', 'regulation-taxonomy-config', regulationId] });
      onSaved?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save taxonomy');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Deduplicate by code — super-admin sees all institutions' copies, show one entry per framework
  const taxonomyOptions = useMemo(() => {
    const seen = new Set<string>();
    return taxonomies
      .filter((t) => {
        if (seen.has(t.code)) return false;
        seen.add(t.code);
        return true;
      })
      .map((t) => ({ value: t.id, label: t.name }));
  }, [taxonomies]);

  return (
    <form onSubmit={handleSubmit} className='space-y-8'>
      {/* Framework selector */}
      <div className='space-y-2'>
        <Label>
          Taxonomy Framework <span className='text-destructive'>*</span>
        </Label>
        {taxonomiesQuery.isLoading ? (
          <Skeleton className='h-10 w-full' />
        ) : (
          <SearchableSelect
            value={selectedTaxonomyId}
            onValueChange={handleTaxonomyChange}
            options={taxonomyOptions}
            placeholder='Select taxonomy framework…'
            searchPlaceholder='Search frameworks…'
            emptyMessage='No frameworks found.'
            loading={taxonomiesQuery.isLoading}
            className='w-full'
          />
        )}
      </div>

      {/* K-Values */}
      <div className='space-y-3'>
        <div>
          <h3 className='font-semibold text-sm'>K-Values</h3>
          <p className='text-xs text-muted-foreground'>
            Knowledge levels (e.g. K1: Remember, K2: Understand)
          </p>
        </div>
        {taxonomyDetailQuery.isLoading && selectedTaxonomyId && (
          <Skeleton className='h-24 w-full' />
        )}
        {Object.keys(kValues).length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className='w-28'>Code</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className='w-12' />
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(kValues).map(([code, desc]) => (
                <TableRow key={code}>
                  <TableCell>
                    <Input value={code} disabled className='w-24' />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={desc}
                      placeholder='Description'
                      onChange={(e) => setKValues({ ...kValues, [code]: e.target.value })}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      type='button'
                      variant='ghost'
                      size='icon'
                      onClick={() => removeKValue(code)}
                    >
                      <Trash2 className='h-4 w-4 text-destructive' />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <Button type='button' variant='outline' size='sm' onClick={addKValue}>
          <Plus className='h-4 w-4 mr-1' />
          Add K-Value
        </Button>
      </div>

      {/* Actions */}
      <div className='flex justify-end'>
        <Button type='submit' disabled={isSubmitting}>
          {isSubmitting && <Loader2 className='h-4 w-4 mr-2 animate-spin' />}
          {initialData ? 'Update Framework' : 'Save Framework'}
        </Button>
      </div>
    </form>
  );
}
