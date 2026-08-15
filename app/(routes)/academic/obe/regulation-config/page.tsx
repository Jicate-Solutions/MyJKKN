'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { useMockRegulationConfig } from '@/hooks/obe/use-mock-obe-data';
import {
  BLOOMS_LEVEL_LABELS,
  FINKS_DIMENSION_LABELS,
  JABT_A_DIMENSIONS,
  JABT_ATTRIBUTION,
  JABT_ELEMENTS,
  JABT_ELEMENT_LABELS,
  JABT_K_LEVELS,
} from '@/types/obe';
import type { BloomsLevel, FinksDimension, TaxonomyType } from '@/types/obe';
import { toast } from 'react-hot-toast';

/*
 * A regulation can be configured against THREE frameworks. This screen WRITES the
 * stored value, so a missing option here is not cosmetic: before this, a regulation
 * already set to 'jkkn_advanced' rendered with neither radio selected and a summary
 * reading "Fink's". Spec §8.4.
 */
const TAXONOMY_SUMMARY: Record<TaxonomyType, { name: string; shape: string }> = {
  blooms: { name: "Bloom's", shape: 'Hierarchical - 6 Levels' },
  finks: { name: "Fink's", shape: 'Non-hierarchical - 6 Dimensions' },
  jkkn_advanced: {
    name: "JKKN Advanced Bloom's",
    // Mixed on purpose: K1-K6 is a hierarchy, A1-A5 is a flat unordered series.
    // Spec §3 — forcing it into one bucket would misstate the framework.
    shape: 'Mixed - hierarchical K1-K6 plus a flat A1-A5 series, 11 elements',
  },
};

export default function RegulationConfigPage() {
  const { config, loading, updateConfig } = useMockRegulationConfig();
  const [taxonomyType, setTaxonomyType] = useState<TaxonomyType>(config.taxonomy_type);
  const [directWeightage, setDirectWeightage] = useState(config.direct_weightage);
  const [bloomsLevels, setBloomsLevels] = useState<BloomsLevel[]>(config.blooms_active_levels);
  const [finksLevels, setFinksLevels] = useState<FinksDimension[]>(config.finks_active_dimensions);

  const bloomsLevelKeys = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6'] as BloomsLevel[];
  const finksKeys = ['FK', 'AP', 'IN', 'HD', 'CA', 'LL'] as FinksDimension[];

  const toggleBloomsLevel = (level: BloomsLevel) => {
    setBloomsLevels(prev =>
      prev.includes(level) ? prev.filter(l => l !== level) : [...prev, level]
    );
  };

  const toggleFinksLevel = (dim: FinksDimension) => {
    setFinksLevels(prev =>
      prev.includes(dim) ? prev.filter(d => d !== dim) : [...prev, dim]
    );
  };

  const handleSave = async () => {
    try {
      await updateConfig({
        taxonomy_type: taxonomyType,
        direct_weightage: directWeightage,
        indirect_weightage: 100 - directWeightage,
        blooms_active_levels: bloomsLevels,
        finks_active_dimensions: finksLevels,
      });
      toast.success('Regulation configuration saved successfully');
    } catch (error) {
      toast.error('Failed to save configuration');
    }
  };

  return (
    <div className='space-y-6 px-4 md:px-8 pb-24 lg:pb-0'>
      <div>
        <h1 className='text-2xl font-bold py-1'>OBE Regulation Configuration</h1>
        <p className='text-sm sm:text-base text-muted-foreground'>
          Configure the taxonomy framework and assessment weightages for your institution
        </p>
      </div>

      {/* Taxonomy Type Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Taxonomy Type</CardTitle>
          <CardDescription>
            Choose between Bloom&apos;s Taxonomy (UGC regulations), Fink&apos;s Taxonomy (Management
            regulations), or JKKN Advanced Bloom&apos;s Taxonomy (R-2026 onward)
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-6'>
          {/* One radio group across all three options — separate groups would break
              keyboard navigation and cannot express a third choice cleanly. */}
          <RadioGroup
            value={taxonomyType}
            onValueChange={(val) => setTaxonomyType(val as TaxonomyType)}
            className='gap-4'
          >
            <div className='flex items-center space-x-4 p-4 border rounded-lg hover:bg-gray-50 cursor-pointer'>
              <div className='flex items-center space-x-2'>
                <RadioGroupItem value='blooms' id='blooms' />
                <Label htmlFor='blooms' className='cursor-pointer flex-1'>
                  <div>
                    <p className='font-medium'>Bloom&apos;s Taxonomy</p>
                    <p className='text-sm text-muted-foreground mt-1'>
                      Hierarchical model with 6 cognitive levels (L1-L6). Recommended for UGC, engineering, and general education programs.
                    </p>
                  </div>
                </Label>
              </div>
            </div>

            <div className='flex items-center space-x-4 p-4 border rounded-lg hover:bg-gray-50 cursor-pointer'>
              <div className='flex items-center space-x-2'>
                <RadioGroupItem value='finks' id='finks' />
                <Label htmlFor='finks' className='cursor-pointer flex-1'>
                  <div>
                    <p className='font-medium'>Fink&apos;s Taxonomy</p>
                    <p className='text-sm text-muted-foreground mt-1'>
                      Non-hierarchical model with 6 independent dimensions (FK, AP, IN, HD, CA, LL). Recommended for management and specialized programs.
                    </p>
                  </div>
                </Label>
              </div>
            </div>

            <div className='flex items-center space-x-4 p-4 border rounded-lg hover:bg-gray-50 cursor-pointer'>
              <div className='flex items-center space-x-2'>
                <RadioGroupItem value='jkkn_advanced' id='jkkn_advanced' />
                <Label htmlFor='jkkn_advanced' className='cursor-pointer flex-1'>
                  <div>
                    <p className='font-medium'>JKKN Advanced Bloom&apos;s Taxonomy</p>
                    <p className='text-sm text-muted-foreground mt-1'>
                      Mixed model with 11 elements. Bloom&apos;s 6 cognitive levels retained unchanged as a
                      hierarchy (K1-K6), extended by a flat, unordered series of 5 added dimensions
                      (A1-A5) that a cognitive taxonomy cannot assess. Applies to regulation R-2026 onward.
                    </p>
                  </div>
                </Label>
              </div>
            </div>
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Active Levels Configuration */}
      {taxonomyType === 'blooms' && (
        <Card>
          <CardHeader>
            <CardTitle>Bloom's Active Levels</CardTitle>
            <CardDescription>Select which cognitive levels are used in your program outcomes</CardDescription>
          </CardHeader>
          <CardContent>
            <div className='grid grid-cols-2 md:grid-cols-3 gap-4'>
              {bloomsLevelKeys.map(level => (
                <div key={level} className='flex items-center space-x-2 p-3 border rounded hover:bg-gray-50'>
                  <Checkbox
                    id={`bloom-${level}`}
                    checked={bloomsLevels.includes(level)}
                    onCheckedChange={() => toggleBloomsLevel(level)}
                  />
                  <Label htmlFor={`bloom-${level}`} className='cursor-pointer'>
                    <div className='text-sm font-medium'>{level}</div>
                    <div className='text-xs text-muted-foreground'>{BLOOMS_LEVEL_LABELS[level]}</div>
                  </Label>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {taxonomyType === 'finks' && (
        <Card>
          <CardHeader>
            <CardTitle>Fink's Active Dimensions</CardTitle>
            <CardDescription>Select which learning dimensions are used in your program outcomes</CardDescription>
          </CardHeader>
          <CardContent>
            <div className='grid grid-cols-2 md:grid-cols-3 gap-4'>
              {finksKeys.map(dim => (
                <div key={dim} className='flex items-center space-x-2 p-3 border rounded hover:bg-gray-50'>
                  <Checkbox
                    id={`fink-${dim}`}
                    checked={finksLevels.includes(dim)}
                    onCheckedChange={() => toggleFinksLevel(dim)}
                  />
                  <Label htmlFor={`fink-${dim}`} className='cursor-pointer'>
                    <div className='text-sm font-medium'>{dim}</div>
                    <div className='text-xs text-muted-foreground'>{FINKS_DIMENSION_LABELS[dim]}</div>
                  </Label>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {taxonomyType === 'jkkn_advanced' && (
        <Card>
          <CardHeader>
            <CardTitle>JKKN Advanced Elements</CardTitle>
            <CardDescription>
              All eleven elements are carried by this framework. The six cognitive levels are a
              hierarchy; the five added dimensions are flat and unordered — A1 does not rank below A3.
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-5'>
            <div className='space-y-2'>
              <p className='text-sm font-medium'>Cognitive levels (K1-K6) — hierarchical, retained from Bloom&apos;s unchanged</p>
              <div className='grid grid-cols-2 md:grid-cols-3 gap-4'>
                {JABT_K_LEVELS.map(code => (
                  <div key={code} className='p-3 border rounded'>
                    <div className='text-sm font-medium'>{code}</div>
                    <div className='text-xs text-muted-foreground'>{JABT_ELEMENT_LABELS[code]}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className='space-y-2'>
              <p className='text-sm font-medium'>Added dimensions (A1-A5) — flat and unordered</p>
              <div className='grid grid-cols-2 md:grid-cols-3 gap-4'>
                {JABT_A_DIMENSIONS.map(code => (
                  <div key={code} className='p-3 border rounded'>
                    <div className='text-sm font-medium'>{code}</div>
                    <div className='text-xs text-muted-foreground'>{JABT_ELEMENT_LABELS[code]}</div>
                    {code === 'A5' && (
                      <div className='text-xs text-muted-foreground mt-1'>
                        Used sparingly — a Board of Studies opts a course in.
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Weightage Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Assessment Weightage</CardTitle>
          <CardDescription>
            Configure the weightage between direct (exams/tests) and indirect (surveys) assessment
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-6'>
          <div className='space-y-4'>
            <div>
              <Label className='flex justify-between'>
                <span>Direct Assessment (Exams/Tests)</span>
                <span className='text-primary font-medium'>{directWeightage}%</span>
              </Label>
              <Slider
                value={[directWeightage]}
                onValueChange={val => setDirectWeightage(val[0])}
                min={0}
                max={100}
                step={5}
                className='mt-2'
              />
            </div>

            <div>
              <Label className='flex justify-between'>
                <span>Indirect Assessment (Surveys)</span>
                <span className='text-primary font-medium'>{100 - directWeightage}%</span>
              </Label>
              <div className='mt-2 h-2 bg-gray-200 rounded-full'>
                <div
                  className='h-full bg-primary rounded-full'
                  style={{ width: `${100 - directWeightage}%` }}
                />
              </div>
            </div>

            <p className='text-sm text-muted-foreground'>
              Default recommendation: 80% direct + 20% indirect
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <Card className='bg-blue-50 border-blue-200'>
        <CardHeader>
          <CardTitle className='text-base'>Current Configuration</CardTitle>
        </CardHeader>
        <CardContent className='space-y-2 text-sm'>
          <p>
            <strong>Taxonomy:</strong> {TAXONOMY_SUMMARY[taxonomyType].name} ({TAXONOMY_SUMMARY[taxonomyType].shape})
          </p>
          <p>
            <strong>Active Levels:</strong>{' '}
            {taxonomyType === 'blooms'
              ? bloomsLevels.join(', ')
              : taxonomyType === 'finks'
                ? finksLevels.join(', ')
                : JABT_ELEMENTS.join(', ')}
          </p>
          <p>
            <strong>Weightage:</strong> {directWeightage}% direct + {100 - directWeightage}% indirect
          </p>
          {taxonomyType === 'jkkn_advanced' && (
            <p className='text-xs text-muted-foreground'>{JABT_ATTRIBUTION}</p>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className='flex justify-end gap-2'>
        <Button variant='outline'>Cancel</Button>
        <Button onClick={handleSave} disabled={loading}>
          {loading ? 'Saving...' : 'Save Configuration'}
        </Button>
      </div>
    </div>
  );
}
