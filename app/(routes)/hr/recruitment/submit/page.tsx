'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList,
  BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import type { HRRecruitmentJob } from '@/types/hr-recruitment';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { JobsBrowser } from './_components/jobs-browser';
import { JobDetailPanel } from './_components/job-detail-panel';
import { ApplyWizard } from './_components/apply-wizard';

type View = 'listings' | 'detail' | 'wizard';

export default function JobOpeningsPage() {
  const [view, setView] = useState<View>('listings');
  const [selectedJob, setSelectedJob] = useState<HRRecruitmentJob | null>(null);

  const { institutions } = useInstitutionsWithAccess();
  const instNameMap: Record<string, string> = {};
  institutions.forEach((i) => { instNameMap[i.id] = i.name; });

  const handleSelectJob = (job: HRRecruitmentJob) => {
    setSelectedJob(job);
    setView('detail');
  };

  const handleApply = () => {
    setView('wizard');
  };

  const handleBackToListings = () => {
    setView('listings');
    setSelectedJob(null);
  };

  const handleBackToDetail = () => {
    setView('detail');
  };

  const breadcrumbPage =
    view === 'listings'
      ? 'Job Openings'
      : view === 'detail'
      ? selectedJob?.title ?? 'Job Detail'
      : 'Apply';

  return (
    <ContentLayout title="Job Openings">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild><Link href="/hr">HR</Link></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild><Link href="/hr/recruitment">Recruitment</Link></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          {view !== 'listings' && (
            <>
              <BreadcrumbItem>
                <BreadcrumbLink
                  asChild
                  className="cursor-pointer"
                >
                  <button onClick={handleBackToListings}>Job Openings</button>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
            </>
          )}
          <BreadcrumbItem>
            <BreadcrumbPage>{breadcrumbPage}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6">
        {view === 'listings' && (
          <JobsBrowser onSelectJob={handleSelectJob} />
        )}

        {view === 'detail' && selectedJob && (
          <JobDetailPanel
            job={selectedJob}
            institutionName={selectedJob.institution_id ? instNameMap[selectedJob.institution_id] : undefined}
            onBack={handleBackToListings}
            onApply={handleApply}
          />
        )}

        {view === 'wizard' && selectedJob && (
          <ApplyWizard
            job={selectedJob}
            onCancel={handleBackToDetail}
          />
        )}
      </div>
    </ContentLayout>
  );
}
