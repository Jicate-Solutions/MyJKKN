// /hr/recruitment/intake/rules — what the intake helper has learned, and from whom.
// Gate: hr.recruitment.create (MENU_PERMISSIONS['/hr/recruitment/intake/rules']).

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { RulesList } from '../_components/rules-list';

export const navMeta = { label: 'Learned Rules', icon: 'ListChecks' } as const;

export default function RecruitmentIntakeRulesPage() {
  return (
    <ContentLayout title="Learned rules">
      <PermissionGuard module="hr.recruitment" action="create">
        <div className="mx-auto max-w-3xl space-y-6">
          <Link
            href="/hr/recruitment/intake"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Bring in candidates
          </Link>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-foreground">Learned rules</h1>
            <p className="text-sm text-muted-foreground">
              Each rule came from a person correcting the helper. The next upload uses it, and every card it
              shapes names the person who taught it.
            </p>
          </div>
          <RulesList />
        </div>
      </PermissionGuard>
    </ContentLayout>
  );
}
