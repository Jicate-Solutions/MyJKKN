'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'react-hot-toast';
import { BosRegulationTaxonomy } from '@/types/bos';
import { Loader2, Plus, Trash2 } from 'lucide-react';

interface TaxonomyFormProps {
  regulationId: string;
  initialData?: BosRegulationTaxonomy | null;
}

// Predefined taxonomy frameworks
const BLOOM_TAXONOMY = {
  L1: 'Remember - define, list, recall, name, identify',
  L2: 'Understand - explain, describe, classify, summarize',
  L3: 'Apply - use, solve, demonstrate, execute, implement',
  L4: 'Analyze - differentiate, compare, examine, break down',
  L5: 'Evaluate - justify, critique, judge, argue, assess',
  L6: 'Create - design, construct, develop, formulate, produce',
};

const FINK_TAXONOMY = {
  FK: 'Foundational Knowledge - Understanding key information and ideas',
  AP: 'Application - Skills, critical thinking, managing projects',
  IN: 'Integration - Connecting ideas, people, realms of life',
  HD: 'Human Dimension - Learning about oneself and others',
  CA: 'Caring - Developing new feelings, interests, values',
  LL: 'Learning How to Learn - Self-direction, inquiry, becoming a better learner',
};

export function TaxonomyForm({ regulationId, initialData }: TaxonomyFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [taxonomyType, setTaxonomyType] = useState<string>(initialData?.taxonomy_type || 'blooms');
  const [kValues, setKValues] = useState<Record<string, string>>(initialData?.k_values || {});
  const [pos, setPos] = useState<Record<string, string>>(initialData?.pos || {});
  const [psos, setPsos] = useState<Record<string, string>>(initialData?.psos || {});

  // Auto-populate K-values when taxonomy type changes (only if empty)
  useEffect(() => {
    if (!initialData && Object.keys(kValues).length === 0) {
      if (taxonomyType === 'blooms') {
        setKValues(BLOOM_TAXONOMY);
      } else if (taxonomyType === 'finks') {
        setKValues(FINK_TAXONOMY);
      }
    }
  }, [taxonomyType, initialData, kValues]);

  const handleAddKValue = (key: string) => {
    setKValues({ ...kValues, [key]: '' });
  };

  const handleAddPO = (key: string) => {
    setPos({ ...pos, [key]: '' });
  };

  const handleAddPSO = (key: string) => {
    setPsos({ ...psos, [key]: '' });
  };

  const handleRemoveKValue = (key: string) => {
    const newKValues = { ...kValues };
    delete newKValues[key];
    setKValues(newKValues);
  };

  const handleRemovePO = (key: string) => {
    const newPos = { ...pos };
    delete newPos[key];
    setPos(newPos);
  };

  const handleRemovePSO = (key: string) => {
    const newPsos = { ...psos };
    delete newPsos[key];
    setPsos(newPsos);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const res = await fetch(`/api/bos/taxonomy/${regulationId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taxonomy_type: taxonomyType,
          k_values: kValues,
          pos,
          psos: Object.keys(psos).length > 0 ? psos : undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to save taxonomy');
      }

      toast.success('Taxonomy saved successfully');
      router.push('/bos/taxonomy');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save taxonomy');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className='space-y-6'>
      <div className='space-y-4'>
        <div>
          <Label htmlFor='taxonomy-type' className='mb-2 block'>
            Taxonomy Framework
          </Label>
          <Select value={taxonomyType} onValueChange={setTaxonomyType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='blooms'>Bloom's Taxonomy</SelectItem>
              <SelectItem value='finks'>Fink's Taxonomy</SelectItem>
              <SelectItem value='custom'>Custom Framework</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue='k-values' className='w-full'>
        <TabsList className='grid w-full grid-cols-3'>
          <TabsTrigger value='k-values'>K-Values</TabsTrigger>
          <TabsTrigger value='pos'>Programme Outcomes</TabsTrigger>
          <TabsTrigger value='psos'>PSOs (Optional)</TabsTrigger>
        </TabsList>

        {/* K-Values Tab */}
        <TabsContent value='k-values' className='space-y-4'>
          <div className='text-sm text-muted-foreground'>
            Define knowledge levels (e.g., K1: Foundational, K2: Intermediate)
          </div>
          <div className='space-y-3'>
            {Object.entries(kValues).map(([key, value]) => (
              <div key={key} className='flex gap-2'>
                <Input
                  placeholder='K1, K2, etc.'
                  value={key}
                  disabled
                  className='w-24'
                />
                <Input
                  placeholder='Description'
                  value={value}
                  onChange={(e) =>
                    setKValues({ ...kValues, [key]: e.target.value })
                  }
                />
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={() => handleRemoveKValue(key)}
                >
                  <Trash2 className='h-4 w-4' />
                </Button>
              </div>
            ))}
          </div>
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={() => {
              const nextNum = Object.keys(kValues).length + 1;
              handleAddKValue(`K${nextNum}`);
            }}
          >
            <Plus className='h-4 w-4 mr-2' />
            Add K-Value
          </Button>
        </TabsContent>

        {/* Programme Outcomes Tab */}
        <TabsContent value='pos' className='space-y-4'>
          <div className='text-sm text-muted-foreground'>
            Define programme-level outcomes (e.g., PO1: Students will demonstrate...)
          </div>
          <div className='space-y-3'>
            {Object.entries(pos).map(([key, value]) => (
              <div key={key} className='flex gap-2'>
                <Input
                  placeholder='PO1, PO2, etc.'
                  value={key}
                  disabled
                  className='w-24'
                />
                <Input
                  placeholder='Description'
                  value={value}
                  onChange={(e) => setPos({ ...pos, [key]: e.target.value })}
                />
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={() => handleRemovePO(key)}
                >
                  <Trash2 className='h-4 w-4' />
                </Button>
              </div>
            ))}
          </div>
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={() => {
              const nextNum = Object.keys(pos).length + 1;
              handleAddPO(`PO${nextNum}`);
            }}
          >
            <Plus className='h-4 w-4 mr-2' />
            Add Programme Outcome
          </Button>
        </TabsContent>

        {/* PSOs Tab */}
        <TabsContent value='psos' className='space-y-4'>
          <div className='text-sm text-muted-foreground'>
            Define programme-specific outcomes (optional, e.g., PSO1, PSO2)
          </div>
          <div className='space-y-3'>
            {Object.entries(psos).map(([key, value]) => (
              <div key={key} className='flex gap-2'>
                <Input
                  placeholder='PSO1, PSO2, etc.'
                  value={key}
                  disabled
                  className='w-24'
                />
                <Input
                  placeholder='Description'
                  value={value}
                  onChange={(e) => setPsos({ ...psos, [key]: e.target.value })}
                />
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={() => handleRemovePSO(key)}
                >
                  <Trash2 className='h-4 w-4' />
                </Button>
              </div>
            ))}
          </div>
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={() => {
              const nextNum = Object.keys(psos).length + 1;
              handleAddPSO(`PSO${nextNum}`);
            }}
          >
            <Plus className='h-4 w-4 mr-2' />
            Add PSO
          </Button>
        </TabsContent>
      </Tabs>

      <div className='flex justify-end gap-2'>
        <Button
          type='button'
          variant='outline'
          onClick={() => router.back()}
        >
          Cancel
        </Button>
        <Button type='submit' disabled={isSubmitting}>
          {isSubmitting && <Loader2 className='h-4 w-4 mr-2 animate-spin' />}
          Save Taxonomy
        </Button>
      </div>
    </form>
  );
}
