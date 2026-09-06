'use client';

// =============================================================================
// RCLTP Reports index — shell only (Phase 4e)
// =============================================================================
// Lists the three named report surfaces as descriptive cards:
//   (i)   Student / Parent score report
//   (ii)  Teacher class analytics
//   (iii) School-head dashboard
//
// CONTENT-SAFETY: each card describes WHAT the report will show and carries an
// "Awaiting MyJKKN scoring + the 24-report catalog" note. ZERO fabricated scores,
// bands, percentages, rankings, or chart points appear anywhere. The full
// 24-report catalog and the validated scoring formula are MyJKKN-gated and not
// delivered, so we never imply a result exists.
// =============================================================================

import {
  FileBarChart,
  Users,
  LayoutDashboard,
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

interface ReportEntry {
  icon: React.ElementType;
  title: string;
  description: string;
  audience: string;
}

const REPORTS: ReportEntry[] = [
  {
    icon: FileBarChart,
    title: 'Student / Parent score report',
    description:
      'A learner-facing report showing the reading band, strengths, and next steps for a single student — written for students and parents.',
    audience: 'For students & parents',
  },
  {
    icon: Users,
    title: 'Teacher class analytics',
    description:
      'Class-level analytics for a teacher: how a class is spread across reading bands and which learners may need support.',
    audience: 'For teachers',
  },
  {
    icon: LayoutDashboard,
    title: 'School-head dashboard',
    description:
      'A whole-school view for the principal: cohort band distribution, cycle progress, at-risk learners, and class comparison.',
    audience: 'For school heads',
  },
];

export function ReportsIndex() {
  return (
    <div className='grid gap-5 md:grid-cols-2 lg:grid-cols-3'>
      {REPORTS.map((r) => {
        const Icon = r.icon;
        return (
          <Card key={r.title} className='flex flex-col'>
            <CardHeader>
              <div className='flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary'>
                <Icon className='h-5 w-5' aria-hidden='true' />
              </div>
              <CardTitle className='mt-3 text-base'>{r.title}</CardTitle>
              <CardDescription>{r.description}</CardDescription>
            </CardHeader>
            <CardContent className='mt-auto space-y-3'>
              <Badge variant='secondary'>{r.audience}</Badge>
              <div className='flex items-start gap-2 rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground'>
                <Clock
                  className='mt-0.5 h-3.5 w-3.5 shrink-0'
                  aria-hidden='true'
                />
                <span>
                  Awaiting MyJKKN scoring and the 24-report catalog. We only show
                  validated results — never an estimated or placeholder score.
                </span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
