// /hr/recruitment/intake — "Bring in candidates" from CVViZ.
//
// The HR intake helper: HR uploads a CVViZ export plus the resumes, the helper
// prepares one proposal per candidate, and a person decides each one with a
// tap. Nothing is filed into MyJKKN until a person decides (types/hr-intake.ts).
//
// Gate: hr.recruitment.create (page guard here; route guard via
// MENU_PERMISSIONS['/hr/recruitment/intake'] in lib/sidebarMenuLink.ts).

import Link from 'next/link';
import { ListChecks } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Button } from '@/components/ui/button';
import { IntakeUploadForm } from './_components/intake-upload-form';
import { BatchList } from './_components/batch-list';

export const navMeta = { label: 'Bring in Candidates', icon: 'FileUp' } as const;

export default function RecruitmentIntakePage() {
  return (
    <ContentLayout title="Bring in Candidates">
      <PermissionGuard module="hr.recruitment" action="create">
        <div className="mx-auto max-w-3xl space-y-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold text-foreground">Bring in candidates from CVViZ</h1>
              <p className="text-sm text-muted-foreground">
                Upload a CVViZ export and the resumes. The helper reads each candidate and proposes where they
                belong; you accept or correct each one with a tap. Every correction is remembered for next time
                and credited to the person who made it.
              </p>
            </div>
            <Button asChild variant="outline" size="sm" className="shrink-0">
              <Link href="/hr/recruitment/intake/rules">
                <ListChecks className="mr-1.5 h-4 w-4" aria-hidden="true" /> Learned rules
              </Link>
            </Button>
          </div>

          <IntakeUploadForm />

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">Past uploads</h2>
            <BatchList />
          </section>
        </div>
      </PermissionGuard>
    </ContentLayout>
  );
}
