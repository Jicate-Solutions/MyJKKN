// app/(routes)/accreditation/_components/no-visible-colleges.tsx
// ============================================================================
// What a body dashboard shows a reader who can see NO accredited college.
//
// 1,070 production profiles are in this state (verified live 2026-08-13): every
// account whose institution has `iqac_code IS NULL` — Jicate Solutions, JKKN
// Main Office, JKKN Matric Higher Secondary School, JKKN Testing Institution,
// Nattraja Incubation Forum, Nattraja Vidhyalya CBSE. Their access read
// ANSWERS; it just returns one campus, and that campus is not assessed.
//
// ----------------------------------------------------------------------------
// WHY THE NUMBERS ARE REMOVED RATHER THAN SHOWN AS ZERO
// ----------------------------------------------------------------------------
// Every rollup on these pages folds through the visible-college list, so an
// empty list drives marks, coverage and evidence-row counts to nought. Rendered,
// that becomes "0.0 of 900" and "0%" — which reads as a MEASURED score of zero,
// i.e. "your colleges were assessed and earned nothing". The reader here has no
// college in the framework at all; nought is not their score, it is the absence
// of a subject.
//
// `iqac/_lib/metric-framework.ts` measurementState() already refuses exactly
// this trade for a single metric ("Never rendered as 0: a zero reads as a
// measured value of nought, which is a different and much worse claim than 'we
// do not capture this'"). This is the same refusal one level up, for a whole
// dashboard. So the numbers are not styled differently or dashed out — they are
// not computed into a claim at all, and the page says what is true instead.
//
// The alternative considered and rejected was showing the stat strip with "—"
// in each tile: a dash still sits under "of 900" and still puts the reader on a
// scale they are not on.
// ============================================================================

'use client';

import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { School } from 'lucide-react';
import { NO_VISIBLE_LABEL } from '../_lib/visible-institutions';

interface NoVisibleCollegesProps {
  /** Page title, e.g. 'NAAC — IQAC Dashboard'. Same string the live page uses. */
  title: string;
  /** Breadcrumb leaf, e.g. 'NAAC'. */
  bodyLabel: string;
  /** Breadcrumb href, e.g. '/accreditation/naac'. */
  bodyHref: string;
}

export function NoVisibleColleges({ title, bodyLabel, bodyHref }: NoVisibleCollegesProps) {
  return (
    <ContentLayout title={title}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/dashboard' },
          { label: 'Accreditation', href: '/accreditation' },
          { label: bodyLabel, href: bodyHref },
        ]}
      />

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <School className="h-6 w-6 text-muted-foreground" />
            {NO_VISIBLE_LABEL}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            {bodyLabel} scores are recorded per accredited college. Your account
            is attached to a campus that is not one of them, so there is nothing
            here to show you — not a score of nought, and not an empty cluster.
          </p>
          <p>
            If you should be able to see a college here, ask your administrator
            to grant you access to it. Access is granted per college, and this
            page follows that grant exactly.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link href="/accreditation">Back to Accreditation</Link>
          </Button>
        </CardContent>
      </Card>
    </ContentLayout>
  );
}
