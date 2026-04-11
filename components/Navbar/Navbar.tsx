'use client';

import { SheetMenu } from './sheet-menu';
import { Button } from '../ui/button';
import { LogOut, UserCircle } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { usePathname } from 'next/navigation';
import { AuthService } from '@/lib/auth/auth-service';
import { UserNav } from './user-nav';
import { ModeToggle } from '../theme/mode-toggle';
import { NotificationBell } from '../notifications/notification-bell';
import { FavoriteStar } from '../Favorites/FavoriteStar';
import { getPageByPath } from '@/lib/navigation/page-registry';

interface NavbarProps {
  title: string;
}

export function Navbar({ title }: NavbarProps) {
  const { profile } = useAuth();
  const pathname = usePathname();

  // Look up current page for favorite star
  let currentPage: { path: string; title: string; module: string; iconName: string } | null = null;
  try {
    const page = getPageByPath(pathname);
    if (page) {
      currentPage = { path: page.path, title: page.title, module: page.module, iconName: page.iconName };
    }
  } catch {
    // Registry not ready
  }

  const handleLogout = async () => {
    try {
      await AuthService.signOut();
    } catch (error) {
      console.error('Error during logout:', error);
    }
  };

  return (
    <header className='sticky top-0 z-30 w-full bg-background border-b border-border shadow-sm dark:shadow-secondary'>
      <div className='mx-4 sm:mx-8 flex h-14 items-center justify-between'>
        <div className='flex items-center space-x-4 lg:space-x-0'>
          <SheetMenu />
          <h1 className='font-bold text-foreground text-sm sm:text-base truncate max-w-[180px] sm:max-w-[300px] md:max-w-none'>{title}</h1>
          {currentPage && (
            <FavoriteStar
              pagePath={currentPage.path}
              pageTitle={currentPage.title}
              module={currentPage.module}
              iconName={currentPage.iconName}
              size="sm"
            />
          )}
        </div>
        <div className='flex items-center justify-between space-x-4'>
          {/* Desktop view */}
          <div className='hidden md:flex items-center space-x-2'>
            <NotificationBell />
            <ModeToggle />
            <UserNav />
          </div>

          {/* Mobile view */}
          <div className='flex md:hidden items-center space-x-2'>
            <NotificationBell />
            <UserNav />
            <Button
              variant='destructive'
              onClick={handleLogout}
              className='text-sm'
            >
              <LogOut className='w-4 h-4' />
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
