'use client';

import { useEffect, useState } from 'react';
import { LogOut, Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useAuth } from '@/hooks/use-auth';
import { AuthService } from '@/lib/auth/auth-service';
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
  const { profile } = useAuth();
  const { theme, setTheme } = useTheme();
  const [roleName, setRoleName] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // Prevent hydration mismatch for theme
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const fetchRoleName = async () => {
      if (profile?.role) {
        try {
          const roles = await RoleService.getAssignableRoles();
          const role = roles.find((r) => r.role_key === profile.role);
          if (role) {
            setRoleName(role.role_name);
          } else {
            // Fallback to role key if role not found
            setRoleName(profile.role);
          }
        } catch (error) {
          console.error('Error fetching role name:', error);
          // Fallback to role key in case of error
          setRoleName(profile.role);
        }
      }
    };

    fetchRoleName();
  }, [profile?.role]);

  const handleSignOut = async () => {
    await AuthService.signOut();
  };

  if (!profile) return null;

  // Generate initials for avatar
  const initials = profile.full_name
    ? profile.full_name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
    : profile.email[0].toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='ghost' className='relative h-10 w-10 rounded-full'>
          <Avatar className='h-10 w-10'>
            <AvatarImage
              src={profile.avatar_url || undefined}
              alt={profile.full_name || 'User'}
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
              {profile.full_name || 'User'}
            </p>
            <p className='text-xs leading-none text-muted-foreground'>
              {profile.email}
            </p>
            <Badge variant='secondary' className='w-fit text-xs'>
              {roleName || profile.role}
            </Badge>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        {mounted && (
          <>
            <DropdownMenuLabel className='text-xs text-muted-foreground'>
              Theme
            </DropdownMenuLabel>
            <DropdownMenuGroup>
              <DropdownMenuItem
                onClick={() => setTheme('light')}
                className='flex items-center cursor-pointer'
              >
                <Sun className='mr-2 h-4 w-4' />
                <span>Light</span>
                {theme === 'light' && (
                  <span className='ml-auto text-primary'>✓</span>
                )}
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={() => setTheme('dark')}
                className='flex items-center cursor-pointer'
              >
                <Moon className='mr-2 h-4 w-4' />
                <span>Dark</span>
                {theme === 'dark' && (
                  <span className='ml-auto text-primary'>✓</span>
                )}
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={() => setTheme('system')}
                className='flex items-center cursor-pointer'
              >
                <Monitor className='mr-2 h-4 w-4' />
                <span>System</span>
                {theme === 'system' && (
                  <span className='ml-auto text-primary'>✓</span>
                )}
              </DropdownMenuItem>
            </DropdownMenuGroup>

            <DropdownMenuSeparator />
          </>
        )}

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
