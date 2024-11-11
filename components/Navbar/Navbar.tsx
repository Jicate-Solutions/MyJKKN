'use client';

import { SheetMenu } from './sheet-menu';
import { Button } from '../ui/button';
import { UserCircle } from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { AuthService } from '@/lib/auth/auth-service';
import { UserNav } from './user-nav';

interface NavbarProps {
  title: string;
}

export function Navbar({ title }: NavbarProps) {
  const { user } = useAuth();

  const handleLogout = async () => {
    try {
      await AuthService.signOut();
    } catch (error) {
      console.error('Error during logout:', error);
    }
  };

  return (
    <header className='sticky top-0 z-10 w-full bg-background/95 shadow backdrop-blur supports-[backdrop-filter]:bg-background/60 dark:shadow-secondary'>
      <div className='mx-4 sm:mx-8 flex h-14 items-center justify-between'>
        <div className='flex items-center space-x-4 lg:space-x-0'>
          <SheetMenu />
          <h1 className='font-bold'>{title}</h1>
        </div>
        <div className='flex items-center justify-between space-x-4'>
          {/* Desktop view */}
          <div className='hidden md:flex items-center space-x-2'>
            <UserNav />
          </div>

          {/* Mobile view */}
          <div className='flex md:hidden items-center space-x-2'>
            <UserNav />
            <Button
              variant='destructive'
              onClick={handleLogout}
              className='text-sm'
            >
              Sign out
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
