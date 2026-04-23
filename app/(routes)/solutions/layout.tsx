import { Metadata } from 'next';
import { Suspense } from 'react';

/**
 * Solutions Hub module layout — metadata + suspense.
 *
 * Title template is `'%s · Solutions Hub'` — NOT `'%s · Solutions Hub · MyJKKN'`.
 * The root layout at app/layout.tsx adds the `· MyJKKN` suffix via its own
 * template, so including it here produced `'Page · Solutions Hub · MyJKKN · MyJKKN'`
 * (triple suffix). See #371 for the admission equivalent fix.
 *
 * Navigation: handled globally by AutoTabNav (components/navigation/
 * auto-tab-nav.tsx), which reads app/(routes)/solutions/nav-config.ts
 * and renders 10 module tabs plus nested sub-tabs for Pipeline / Training /
 * Content / Products. No per-module <SolutionsNav /> or per-section
 * layout.tsx needed.
 */
export const metadata: Metadata = {
  title: {
    template: '%s · Solutions Hub',
    default: 'Solutions Hub',
  },
  description: 'JKKN Solutions Hub - Managing software, training, and content solutions',
};

interface SolutionsLayoutProps {
  children: React.ReactNode;
}

export default function SolutionsLayout({ children }: SolutionsLayoutProps) {
  return (
    <div className='solutions-module'>
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
