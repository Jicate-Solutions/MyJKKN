// components/Navbar/user-nav.tsx
'use client';

import Link from 'next/link';
import { CircleUser, LayoutGrid, LogOut, Settings, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { AuthService } from '@/lib/auth/auth-service';
import { useAuth } from '@/providers/auth-provider';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export function UserNav() {
  const { user, signOut, refreshUser } = useAuth();
  const router = useRouter();

  // Check user access periodically
  useEffect(() => {
    const checkAccess = async () => {
      const hasAccess = await AuthService.checkUserAccess();
      if (!hasAccess) {
        // If user no longer has access, sign them out
        await signOut();
      }
    };

    // Check access immediately
    checkAccess();

    // Then check periodically (e.g., every 5 minutes)
    const interval = setInterval(checkAccess, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [signOut]);

  // Return null if no user or invalid role
  if (
    !user ||
    !['student', 'faculty', 'staff', 'administrator', 'super_admin'].includes(
      user.role
    )
  ) {
    return null;
  }

  const handleProfileClick = () => {
    router.push('/profile');
  };

  const handleLogout = async () => {
    try {
      await signOut();
      router.push('/auth/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='ghost' className='relative h-8 w-8 rounded-full'>
          <Avatar className='h-8 w-8'>
            {user.avatar_url && (
              <AvatarImage src={user.avatar_url} alt={user.full_name || ''} />
            )}
            <AvatarFallback className='bg-primary/10'>
              {user.full_name?.charAt(0) || <CircleUser className='h-4 w-4' />}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent className='w-56' align='end'>
        <DropdownMenuLabel className='font-normal'>
          <div className='flex flex-col space-y-1'>
            <p className='text-sm font-medium leading-none'>
              {user.full_name || 'User'}
            </p>
            <p className='text-xs leading-none text-muted-foreground'>
              {user.email}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleProfileClick}>
          <User className='mr-2 h-4 w-4' />
          Profile
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleLogout}
          className='text-destructive focus:text-destructive'
        >
          <LogOut className='mr-2 h-4 w-4' />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
