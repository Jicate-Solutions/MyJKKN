'use client';

import { Suspense } from 'react';
import { SheetMenu } from './sheet-menu';
import { Button } from '../ui/button';
import { LogOut } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { usePathname, useSearchParams } from 'next/navigation';
import { AuthService } from '@/lib/auth/auth-service';
import { UserNav } from './user-nav';
import { ModeToggle } from '../theme/mode-toggle';
import { NotificationBell } from '../notifications/notification-bell';
import { HeaderConnectionBadge } from '../whatsapp/header-connection-badge';
import { FavoriteStar } from '../Favorites/FavoriteStar';
import { derivePageInfo } from '@/lib/navigation/derive-page-info';
import { useInstitutionType } from '@/hooks/use-institution-type';
import { adaptLabel } from '@/lib/utils/school-label-adapter';


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

  const handleLogout = async () => {
    try {
      await AuthService.signOut();
    } catch (error) {
      console.error('Error during logout:', error);
    }
  };

  return (
    <header className='sticky top-0 z-30 w-full bg-background border-b border-border shadow-sm dark:shadow-secondary'>
      <div className='mx-2 sm:mx-8 flex h-14 items-center justify-between gap-2'>
        <div className='flex min-w-0 flex-1 items-center space-x-2 sm:space-x-4 lg:space-x-0'>
          <SheetMenu />
          <h1 className='font-bold text-foreground text-sm sm:text-base truncate min-w-0 max-w-[180px] sm:max-w-[300px] md:max-w-none'>{resolvedTitle}</h1>
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

          {/* Mobile view */}
          <div className='flex md:hidden items-center space-x-1 sm:space-x-2'>
            <HeaderConnectionBadge />
            <NotificationBell />
            <UserNav />
            <Button
              variant='destructive'
              onClick={handleLogout}
              className='text-sm px-3'
            >
              <LogOut className='w-4 h-4' />
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
