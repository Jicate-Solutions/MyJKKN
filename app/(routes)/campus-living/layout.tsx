/**
 * Campus Living Module Layout
 *
 * Navigation: handled globally by AutoTabNav (components/navigation/
 * auto-tab-nav.tsx), which reads app/(routes)/campus-living/nav-config.ts
 * and renders 8 grouped module tabs. No per-module CLNav needed.
 *
 * Auth is NOT checked here — each page.tsx handles its own auth. This avoids
 * double getEnhancedUserProfile() calls which fail in Next.js 16 Turbopack.
 *
 * Exception: CampusLivingResidentGuard (a client child using React-Query-cached
 * auth/permissions, NOT getEnhancedUserProfile) confines student-role users to
 * /campus-living/my-hostel/* — hard-blocking the admin/operational pages even on
 * a manually-typed URL. Staff and non-student roles are unaffected.
 */

import { Suspense } from 'react';
import { CampusLivingResidentGuard } from './_components/resident-route-guard';

interface CLLayoutProps {
  children: React.ReactNode;
}

export default function CampusLivingLayout({ children }: CLLayoutProps) {
  return (
    <div className='campus-living-module'>
      <Suspense
        fallback={
          <div className='flex items-center justify-center py-8'>
            <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-primary' />
          </div>
        }
      >
        <CampusLivingResidentGuard>{children}</CampusLivingResidentGuard>
      </Suspense>
      {/* The per-module "?Help" FAB was removed — the ONE route-aware platform
          guide FAB (root layout) now covers every screen, campus-living
          included. The campus-living guide PAGE is untouched. */}
    </div>
  );
}
