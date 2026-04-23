/**
 * Startup Studio Module Layout
 *
 * Navigation: handled globally by AutoTabNav (components/navigation/
 * auto-tab-nav.tsx), which reads app/(routes)/startup-studio/nav-config.ts
 * and renders 9 grouped module tabs + Solve-for-100's 5 nested sub-tabs.
 * No per-module StartupStudioNav needed.
 *
 * Event-level 15-tab subnav still renders dynamically per eventId via
 * events/[id]/layout.tsx (useParams-driven) — AutoTabNav cannot replicate
 * dynamic-URL-parameterized tabs.
 *
 * Auth is NOT checked here — each page.tsx handles its own auth.
 */

import { Metadata } from 'next';
import { Suspense } from 'react';

/**
 * Startup Studio module metadata.
 *
 * Title template is `'%s · Startup Studio'` — NOT `'%s · Startup Studio · MyJKKN'`.
 * Root layout adds the `· MyJKKN` suffix; embedding it here caused the
 * `'Page · Startup Studio · MyJKKN · MyJKKN'` triple-suffix bug.
 * See #371 for the admission equivalent fix.
 */
export const metadata: Metadata = {
  title: {
    template: '%s · Startup Studio',
    default: 'Startup Studio',
  },
  description: 'JKKN Startup Studio - Innovation cycles, mentorship, and portfolio',
};

interface StartupStudioLayoutProps {
  children: React.ReactNode;
}

export default function StartupStudioLayout({ children }: StartupStudioLayoutProps) {
  return (
    <div className='startup-studio-module'>
      <Suspense
        fallback={
          <div className='flex items-center justify-center py-8'>
            <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-primary' />
          </div>
        }
      >
        {children}
      </Suspense>
    </div>
  );
}
