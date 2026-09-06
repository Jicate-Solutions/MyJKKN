'use client';

import { Suspense } from 'react';
import { SheetMenu } from './sheet-menu';
import { useAuth } from '@/hooks/use-auth';
import { usePathname, useSearchParams } from 'next/navigation';
import { UserNav } from './user-nav';
import { ModeToggle } from '../theme/mode-toggle';
import { NotificationBell } from '../notifications/notification-bell';
import { HeaderConnectionBadge } from '../whatsapp/header-connection-badge';
import { FavoriteStar } from '../Favorites/FavoriteStar';
import { derivePageInfo } from '@/lib/navigation/derive-page-info';
import { useInstitutionType } from '@/hooks/use-institution-type';
import { adaptLabel } from '@/lib/utils/school-label-adapter';
import { cn } from '@/lib/utils';


interface NavbarProps {
  title?: string;
}

/**
 * Tab-aware favorite star. When the current URL carries a `?tab=` param
 * (URL-driven tab pages), the star favorites that specific tab —
 * path includes the query string, title gets the tab label appended
 * (e.g. "Permissions Audit · Resolver"). Without a tab param it behaves
 * exactly as before (page-level favorite).
 *
 * Isolated in its own component because useSearchParams() requires a
 * <Suspense> boundary to not block static prerendering of every route.
 */
function TabAwareFavoriteStar({ pathname }: { pathname: string }) {
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab');

  const page = (() => {
    try {
      return derivePageInfo(pathname, tab);
    } catch {
      return null;
    }
  })();

  if (!page) return null;

  return (
    <FavoriteStar
      pagePath={page.path}
      pageTitle={page.title}
      module={page.module}
      iconName={page.iconName}
      size='sm'
      showLabel
    />
  );
}

export function Navbar({ title }: NavbarProps) {
  const { profile } = useAuth();
  const pathname = usePathname();
  // Adapt the header title to the institution type (e.g. "Degrees" → "Streams"
  // for schools), keeping the navbar consistent with the sidebar and page body.
  const { institutionType } = useInstitutionType();

  // Look up OR derive — every real app route gets a star, even if it's
  // a dynamic [id] route, a deep-link, or a page added after the static
  // page-registry was built. See lib/navigation/derive-page-info.ts.
  const currentPage = (() => {
    try {
      return derivePageInfo(pathname);
    } catch {
      return null;
    }
  })();

  const resolvedTitle = adaptLabel(title ?? currentPage?.title ?? '', institutionType);

  // A3 (Director, 2026-08-09) — /dashboard ONLY. The shell prints the same word
  // twice within ~40px: this header <h1> ("Dashboard") and the AutoBreadcrumbs
  // trail ("Home › Dashboard") rendered directly beneath it. On a 387px phone
  // that is two lines of the first screenful spent saying nothing. The Director
  // chose to keep the breadcrumb and drop the heading.
  //
  // Hidden VISUALLY, not removed: this <h1> is the only level-1 heading on
  // /dashboard (the page itself renders no <h1>), so deleting it would leave
  // the route with zero headings for screen readers and the crumb is not a
  // substitute. Exact match, not startsWith — /dashboard/* sub-pages and every
  // other route keep their visible heading unchanged.
  const hideVisibleTitle = pathname === '/dashboard';

  return (
    <header className='sticky top-0 z-30 w-full bg-background border-b border-border shadow-sm dark:shadow-secondary'>
      <div className='mx-2 sm:mx-8 flex h-14 items-center justify-between gap-2'>
        <div className='flex min-w-0 flex-1 items-center space-x-2 sm:space-x-4 lg:space-x-0'>
          <SheetMenu />
          <h1
            className={cn(
              'font-bold text-foreground text-sm sm:text-base truncate min-w-0 max-w-[180px] sm:max-w-[300px] md:max-w-none',
              hideVisibleTitle && 'sr-only'
            )}
          >
            {resolvedTitle}
          </h1>
          {currentPage && (
            <Suspense
              fallback={
                <FavoriteStar
                  pagePath={currentPage.path}
                  pageTitle={currentPage.title}
                  module={currentPage.module}
                  iconName={currentPage.iconName}
                  size='sm'
                  showLabel
                />
              }
            >
              <TabAwareFavoriteStar pathname={pathname} />
            </Suspense>
          )}
        </div>
        <div className='flex shrink-0 items-center justify-between space-x-4'>
          {/* Desktop view */}
          <div className='hidden md:flex items-center space-x-2'>
            <HeaderConnectionBadge />
            <NotificationBell />
            <ModeToggle />
            <UserNav />
          </div>

          {/* Mobile view.
              No standalone logout button here. It used to be a solid red
              button sitting ~8px from the avatar — the loudest control in the
              header, one mis-tap from ending the session, on the surface
              people touch with a thumb. Sign out lives in the account menu
              behind the avatar (see UserNav), which is where a rarely-wanted,
              costly-to-mistap action belongs. */}
          <div className='flex md:hidden items-center space-x-2'>
            <HeaderConnectionBadge />
            <NotificationBell />
            <UserNav />
          </div>
        </div>
      </div>
    </header>
  );
}
