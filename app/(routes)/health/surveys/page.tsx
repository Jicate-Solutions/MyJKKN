'use client';

/**
 * health/surveys/page.tsx
 * Health & Wellness → Wellness Surveys (inside the app shell).
 * The survey UI lives in components/health/wellness-survey-taker.tsx; the
 * standalone, shell-free version for shared links is app/survey/page.tsx.
 * Created: 2026-09-28
 */

import { Suspense } from 'react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { WellnessSurveyTaker } from '@/components/health/wellness-survey-taker';

export default function WellnessSurveysPage() {
  return (
    <ContentLayout title="Wellness Surveys">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Health', href: '/health/dashboard' },
          { label: 'Wellness Surveys' },
        ]}
      />
      <div className="mx-auto mt-4 max-w-3xl">
        <Suspense fallback={null}>
          <WellnessSurveyTaker />
        </Suspense>
      </div>
    </ContentLayout>
  );
}
