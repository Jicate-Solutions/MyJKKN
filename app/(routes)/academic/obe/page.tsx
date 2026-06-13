'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Settings, BookOpen, Target, Grid3x3 } from 'lucide-react';
import Link from 'next/link';
import { useMockRegulationConfig } from '@/hooks/obe/use-mock-obe-data';

export default function OBEDashboardPage() {
  const { config } = useMockRegulationConfig();
  const isBlooms = config.taxonomy_type === 'blooms';
  const taxonomyLabel = isBlooms ? "Bloom's" : "Fink's";
  const taxonomyCount = isBlooms
    ? config.blooms_active_levels.length
    : config.finks_active_dimensions.length;
  const taxonomyUnit = isBlooms ? 'Levels Active' : 'Dimensions Active';

  return (
    <div className='space-y-6 w-full min-w-0 px-4 md:px-8'>
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
            <strong>Taxonomy Support:</strong> Bloom's Taxonomy (6 levels: L1-L6) or Fink's Taxonomy (6 dimensions: FK, AP, IN, HD, CA, LL).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
