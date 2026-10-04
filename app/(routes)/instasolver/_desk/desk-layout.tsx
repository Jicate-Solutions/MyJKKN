// app/(routes)/instasolver/_desk/desk-layout.tsx
//
// The InstaSolver desk shell — issues and requirements with CAO triage,
// maintenance teams and reporter confirmation (docs/instasolver/MYJKKN-MODULE-SPEC.md).
//
// Each desk folder (dashboard, issues, requirements, triage, work, workload,
// analytics, admin) has a one-line layout.tsx that re-exports this. A shared
// "(desk)" route group would be tidier, but the repo's hub-page CI check
// treats a group folder as a URL that needs its own page, and a page there
// would collide with the /instasolver chooser beside it. `_desk` is a private
// folder, so it is never a route.

import { ContentLayout } from '@/components/layout/content-layout';
import { InstaSolverNav } from '@/components/instasolver/instasolver-nav';

export default function InstaSolverDeskLayout({ children }: { children: React.ReactNode }) {
  return (
    <ContentLayout title="InstaSolver">
      <div className="w-full min-w-0 space-y-4 px-0 sm:px-2">
        <InstaSolverNav />
        {children}
      </div>
    </ContentLayout>
  );
}
