'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Settings, BookOpen, Target, Grid3x3 } from 'lucide-react';
import Link from 'next/link';
import { useMockRegulationConfig } from '@/hooks/obe/use-mock-obe-data';

/*
 * A regulation can be configured against THREE frameworks, not two. Both database
 * CHECK constraints (obe_regulation_config_taxonomy_type_check and
 * chk_curriculum_lesson_primary_taxonomy) admit 'jkkn_advanced', so this surface
 * can receive it today. Branching on a boolean made the third value render as
 * Fink's. See specs/jkkn-advanced-blooms-taxonomy-2026-07-30.md (§2.2, §8.4).
 */
type ObeTaxonomyType = 'blooms' | 'finks' | 'jkkn_advanced';

/* JABT: Bloom's six retained (K1-K6) plus five added (A1-A5). Spec §2.2. */
const JABT_ELEMENT_COUNT = 11;

const JABT_ELEMENT_LIST =
  'K1-K6, plus A1 Human Dimension, A2 Caring, A3 Learning How to Learn, A4 Performed Skill and A5 Accountable AI Use';

/* Mandatory attribution line — spec §1. Shown wherever JABT is named as the framework in force. */
const JABT_ATTRIBUTION =
  "JKKN Advanced Bloom's Taxonomy: Bloom's revised cognitive taxonomy (Bloom et al., 1956; Anderson & Krathwohl, 2001) retained in full, extended by three dimensions drawn from L. Dee Fink's Taxonomy of Significant Learning (Creating Significant Learning Experiences, 2003) — Human Dimension, Caring, and Learning How to Learn; by Performed Skill, operationalising Bloom's uncompleted psychomotor domain in three bands after Simpson (1972); and by Accountable AI Use, which has no precedent in either author.";

export default function OBEDashboardPage() {
  const { config } = useMockRegulationConfig();
  // The stored value is one of three; the shared config type still declares only the legacy pair.
  const taxonomyType = config.taxonomy_type as ObeTaxonomyType;

  const taxonomySummary: Record<ObeTaxonomyType, { label: string; count: number; unit: string }> = {
    blooms: {
      label: "Bloom's",
      count: config.blooms_active_levels.length,
      unit: 'Levels Active',
    },
    finks: {
      label: "Fink's",
      count: config.finks_active_dimensions.length,
      unit: 'Dimensions Active',
    },
    jkkn_advanced: {
      label: 'JKKN Advanced',
      count: JABT_ELEMENT_COUNT,
      unit: 'Elements Active',
    },
  };

  const { label: taxonomyLabel, count: taxonomyCount, unit: taxonomyUnit } =
    taxonomySummary[taxonomyType];

  return (
    <div className='space-y-6 w-full min-w-0 px-4 md:px-8 pb-24 lg:pb-0'>
      <div>
        <h1 className='text-2xl font-bold py-1'>Outcome-Based Education</h1>
        <p className='text-sm sm:text-base text-muted-foreground'>
          Configure program outcomes, track course outcomes, and analyze attainment metrics
        </p>
      </div>

      {/* Quick Stats */}
      <div className='grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4'>
        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium'>POs Configured</CardTitle>
          </CardHeader>
          <CardContent>
            <p className='text-2xl font-bold'>12</p>
            <p className='text-xs text-muted-foreground mt-1'>NBA Engineering Standard</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium'>PSOs Defined</CardTitle>
          </CardHeader>
          <CardContent>
            <p className='text-2xl font-bold'>2</p>
            <p className='text-xs text-muted-foreground mt-1'>Program Specific</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium'>COs Mapped</CardTitle>
          </CardHeader>
          <CardContent>
            <p className='text-2xl font-bold'>24</p>
            <p className='text-xs text-muted-foreground mt-1'>Course Outcomes</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm font-medium'>Taxonomy</CardTitle>
          </CardHeader>
          <CardContent>
            <p className='text-2xl font-bold'>{taxonomyLabel}</p>
            <p className='text-xs text-muted-foreground mt-1'>{taxonomyCount} {taxonomyUnit}</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className='grid grid-cols-1 lg:grid-cols-2 gap-4'>
        <Card className='hover:shadow-md transition-shadow'>
          <CardHeader>
            <Settings className='h-5 w-5 text-primary mb-2' />
            <CardTitle>Regulation Configuration</CardTitle>
            <CardDescription>Set up OBE framework, taxonomy type, and weightages</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href='/academic/obe/regulation-config'>
              <Button variant='outline' size='sm' className='w-full'>
                Configure
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className='hover:shadow-md transition-shadow'>
          <CardHeader>
            <Target className='h-5 w-5 text-primary mb-2' />
            <CardTitle>Program & PSO Outcomes</CardTitle>
            <CardDescription>Create and manage POs and PSOs for your programs</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href='/academic/obe/po-pso'>
              <Button variant='outline' size='sm' className='w-full'>
                Manage Outcomes
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className='hover:shadow-md transition-shadow'>
          <CardHeader>
            <Grid3x3 className='h-5 w-5 text-primary mb-2' />
            <CardTitle>CO-PO Mapping</CardTitle>
            <CardDescription>Link course outcomes to program outcomes and PSOs</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href='/academic/obe/co-po-mapping'>
              <Button variant='outline' size='sm' className='w-full'>
                Map Outcomes
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className='hover:shadow-md transition-shadow'>
          <CardHeader>
            <BookOpen className='h-5 w-5 text-primary mb-2' />
            <CardTitle>Coming Soon</CardTitle>
            <CardDescription>Assessment, marks entry, and attainment calculation</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant='outline' size='sm' className='w-full' disabled>
              Next Phase
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Information */}
      <Card className='bg-blue-50 border-blue-200'>
        <CardHeader>
          <CardTitle className='text-base'>OBE Module Overview</CardTitle>
        </CardHeader>
        <CardContent className='space-y-3 text-sm text-muted-foreground'>
          <p>
            <strong>Program Outcomes (POs):</strong> Graduate-level competencies. For engineering, the 12 AICTE/NBA standard POs are provided.
          </p>
          <p>
            <strong>Program Specific Outcomes (PSOs):</strong> Competencies unique to your degree program.
          </p>
          <p>
            <strong>Course Outcomes (COs):</strong> Learning objectives per course, linked to POs and PSOs through a correlation matrix.
          </p>
          <p>
            <strong>Taxonomy Support:</strong> Bloom&apos;s Taxonomy (6 levels: L1-L6), Fink&apos;s Taxonomy (6 dimensions: FK, AP, IN, HD, CA, LL), or JKKN Advanced Bloom&apos;s Taxonomy ({JABT_ELEMENT_COUNT} elements: {JABT_ELEMENT_LIST}).
          </p>
          {taxonomyType === 'jkkn_advanced' && (
            <p className='text-xs'>{JABT_ATTRIBUTION}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
