'use client';

import { useState } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent } from '@/components/ui/card';
import { FileText } from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuth } from '@/hooks/use-auth';
import {
  QuestionPaperFilters, type QuestionPaperFilterState,
} from './_components/question-paper-filters';
import { PaperList } from './_components/paper-list';
import { PaperAuthoring } from './_components/paper-authoring';

export default function QuestionPapersPage() {
  const { isSuperAdmin, canAccess, isLoading: isLoadingPermissions } = usePermissions();
  const { profile } = useAuth();

  const canView =
    isLoadingPermissions || isSuperAdmin || canAccess('academic.ia_question_paper', 'view');
  const canEnter = isSuperAdmin || canAccess('academic.ia_question_paper', 'enter');
  const canApprove = isSuperAdmin || canAccess('academic.ia_question_paper', 'approve');
  const canExport = isSuperAdmin || canAccess('academic.ia_question_paper', 'export');

  const [filters, setFilters] = useState<Partial<QuestionPaperFilterState>>({});
  const [openPaperId, setOpenPaperId] = useState<string | null>(null);

  // Super admin picks an institution; everyone else is locked to their own.
  const institutionId = isSuperAdmin ? filters.institution_id : profile?.institution_id ?? undefined;

  if (!canView) {
    return (
      <ContentLayout title='Question Papers'>
        <div className='flex items-center justify-center h-64'>
          <p className='text-muted-foreground'>
            You do not have permission to access Question Papers.
          </p>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Question Papers'>
      <Breadcrumb className='mb-4'>
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink href='/'>Dashboard</BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>Question Papers</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6'>
        <div>
          <h1 className='text-2xl font-bold py-1 flex items-center gap-2'>
            <FileText className='h-6 w-6' /> Question Papers
          </h1>
          <p className='text-sm text-muted-foreground'>
            Scaffold and author Internal Assessment (CIA) question papers per exam session, round and
            course. Subjects are shown only for staff-planned programs.
          </p>
        </div>

        {openPaperId ? (
          <PaperAuthoring
            paperId={openPaperId}
            onBack={() => setOpenPaperId(null)}
            canEnter={canEnter}
            canApprove={canApprove}
            canExport={canExport}
          />
        ) : (
          <>
            <Card>
              <CardContent className='pt-6'>
                <QuestionPaperFilters
                  institutionId={institutionId}
                  filters={filters}
                  onFiltersChange={setFilters}
                />
              </CardContent>
            </Card>

            <PaperList
              institutionId={institutionId}
              filters={filters}
              canExport={canExport}
              canApprove={canApprove}
              onOpen={setOpenPaperId}
            />
          </>
        )}
      </div>
    </ContentLayout>
  );
}
