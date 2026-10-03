// app/(routes)/instasolver/(desk)/layout.tsx
//
// The InstaSolver desk — issues and requirements with CAO triage, maintenance
// teams and reporter confirmation (docs/instasolver/MYJKKN-MODULE-SPEC.md).
// A route group, so the URLs are /instasolver/issues etc. and the existing
// chooser, broken, complaint and track pages beside it are untouched.

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
