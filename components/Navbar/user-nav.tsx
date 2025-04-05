'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { User, Settings, LayoutDashboard, LogOut } from 'lucide-react';
import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { RoleService } from '@/lib/services/roles/role-service';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { CustomRole } from '@/types/auth';

export function UserNav() {
  const { user, signOut } = useAuth();
  const [roleName, setRoleName] = useState<string | null>(null);

  useEffect(() => {
    const fetchRoleName = async () => {
      if (user?.role) {
        try {
          const roles = await RoleService.getAssignableRoles();
          const role = roles.find((r) => r.role_key === user.role);
          if (role) {
            setRoleName(role.role_name);
          } else {
            // Fallback to role key if role not found
            setRoleName(user.role);
          }
        } catch (error) {
          console.error('Error fetching role name:', error);
          // Fallback to role key in case of error
          setRoleName(user.role);
        }
      }
    };

    fetchRoleName();
  }, [user?.role]);

  if (!user) return null;

  // Generate initials for avatar
  const initials = user.full_name
    ? user.full_name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
    : user.email[0].toUpperCase();

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='ghost' className='relative h-10 w-10 rounded-full'>
          <Avatar className='h-10 w-10'>
            <AvatarImage
              src={user.avatar_url || undefined}
              alt={user.full_name || 'User'}
            />
            <AvatarFallback className='bg-primary/10'>
              {initials}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent className='w-64' align='end' forceMount>
        <DropdownMenuLabel className='font-normal'>
          <div className='flex flex-col space-y-2'>
            <p className='text-sm font-medium leading-none'>
              {user.full_name || 'User'}
            </p>
            <p className='text-xs leading-none text-muted-foreground'>
              {user.email}
            </p>
            <Badge variant='secondary' className='w-fit text-xs'>
              {roleName || user.role}
            </Badge>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link href='/' className='flex items-center cursor-pointer'>
              <LayoutDashboard className='mr-2 h-4 w-4' />
              Dashboard
            </Link>
          </DropdownMenuItem>

          <DropdownMenuItem asChild>
            <Link href='/profile' className='flex items-center cursor-pointer'>
              <User className='mr-2 h-4 w-4' />
              Profile
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          className='text-red-600 cursor-pointer'
          onClick={handleSignOut}
        >
          <LogOut className='mr-2 h-4 w-4' />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
