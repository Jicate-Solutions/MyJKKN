'use client';

// =============================================================================
// RCLTP Principal (school-head) dashboard — shell only (Phase 4e)
// =============================================================================
// Four titled sections, each a Card describing WHAT it will show, each rendering
// the honest "awaiting EKSAQ scoring" empty state:
//   (a) Cohort band distribution
//   (b) Cycle progress across the 6 cycles
//   (c) At-risk learners alert list
//   (d) Class / section comparison
//
// CONTENT-SAFETY: ZERO fabricated numbers, bands, percentages, rankings, or
// chart points. The scoring engine and the 24-report catalog are EKSAQ-gated and
// not delivered — so we never imply a result exists. The hooks (useRcltpResults
// etc.) intentionally stay uncalled here: there is no scored data to read, and
// rendering the awaiting state is the correct, honest behaviour.
// =============================================================================

import {
  BarChart3,
  TrendingUp,
  AlertTriangle,
  Users,
  Clock,
} from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AwaitingScoring, ChartFrame } from './awaiting-scoring';

function SectionCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <div className='flex items-start justify-between gap-3'>
          <div className='flex items-start gap-3'>
            <div className='mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary'>
              <Icon className='h-5 w-5' aria-hidden='true' />
            </div>
            <div>
              <CardTitle className='text-base'>{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </div>
          </div>
          <Badge variant='outline' className='shrink-0 gap-1'>
            <Clock className='h-3 w-3' aria-hidden='true' /> Awaiting scoring
          </Badge>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function PrincipalDashboard() {
  return (
    <div className='space-y-6'>
      {/* School-head context header */}
      <div className='rounded-xl border bg-card p-5'>
        <h1 className='text-xl font-semibold'>School-head dashboard</h1>
        <p className='mt-1 max-w-prose text-sm text-muted-foreground'>
          This is the school-head (principal) view of reading across your school.
          Once EKSAQ delivers the validated scoring formula, the sections below
          will summarise how your cohorts are progressing. Until then, every
          panel shows an honest waiting state — we never display an estimated or
          placeholder result.
        </p>
      </div>

      <div className='grid gap-5 lg:grid-cols-2'>
        {/* (a) Cohort band distribution */}
        <SectionCard
          icon={BarChart3}
          title='Cohort band distribution'
          description='How learners across the school are spread over reading bands.'
        >
          <ChartFrame label='Band distribution' />
          <div className='mt-4'>
            <AwaitingScoring what='Band distribution for your school will appear here.' />
          </div>
        </SectionCard>

        {/* (b) Cycle progress across the 6 cycles */}
        <SectionCard
          icon={TrendingUp}
          title='Cycle progress'
          description='Progress across the six assessment cycles for the school.'
        >
          <ChartFrame label='Cycle-by-cycle progress' />
          <div className='mt-4'>
            <AwaitingScoring what='Progress across the six cycles will appear here.' />
          </div>
        </SectionCard>

        {/* (c) At-risk learners alert list */}
        <SectionCard
          icon={AlertTriangle}
          title='At-risk learners'
          description='Learners who may need additional reading support.'
        >
          <AwaitingScoring what='The at-risk learner list will appear here.' />
        </SectionCard>

        {/* (d) Class / section comparison */}
        <SectionCard
          icon={Users}
          title='Class & section comparison'
          description='Compare reading outcomes across classes and sections.'
        >
          <ChartFrame label='Class / section comparison' />
          <div className='mt-4'>
            <AwaitingScoring what='Class and section comparison will appear here.' />
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
