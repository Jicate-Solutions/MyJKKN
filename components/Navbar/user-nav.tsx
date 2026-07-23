'use client';

import { useEffect, useState } from 'react';
import { LogOut, Sun, Moon, Monitor, Download, Star } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useAuth } from '@/hooks/use-auth';
import { AuthService } from '@/lib/auth/auth-service';
import { usePWA } from '@/components/pwa/pwa-provider';
import { Button } from '@/components/ui/button';
import { RoleService } from '@/lib/services/roles/role-service';
import { UserRolesService } from '@/lib/services/users/user-roles-service';
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
import { UserRoleAssignment } from '@/types/auth';

export function UserNav() {
  const { profile } = useAuth();
  const { theme, setTheme } = useTheme();
  const { isInstalled, canInstall, installApp } = usePWA();
  // All assigned roles from user_roles. The legacy profile.role field is the
  // single primary role only — the navbar must reflect the multi-role system
  // so users with extra roles (e.g. counselor + student, accounts + faculty)
  // see every role they actually carry.
  const [userRoles, setUserRoles] = useState<UserRoleAssignment[]>([]);
  // Legacy fallback: when the user has no user_roles entries (e.g. seeded
  // before the multi-role migration), look up the role name for profile.role
  // so we still show *something* sensible.
  const [legacyRoleName, setLegacyRoleName] = useState<string | null>(null);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  // Prevent hydration mismatch for theme
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!profile?.id) {
      setRolesLoading(false);
      return;
    }
    let cancelled = false;

    const fetchRoles = async () => {
      setRolesLoading(true);
      try {
        const roles = await UserRolesService.getUserRoles(profile.id);
        if (cancelled) return;
        setUserRoles(roles);
        // Only resolve the legacy fallback name if user_roles came back empty.
        if (roles.length === 0 && profile.role) {
          const allRoles = await RoleService.getAssignableRoles();
          if (cancelled) return;
          const found = allRoles.find((r) => r.role_key === profile.role);
          setLegacyRoleName(found?.role_name ?? profile.role);
        }
      } catch (err) {
        // Demoted to console.warn (2026-04-28) because UserNav has a graceful
        // fallback (sets legacyRoleName from profile.role below). A transient
        // TypeError: Failed to fetch from a network blip should not trigger
        // Next.js's blocking Console Error overlay on every page.
        console.warn('[user-nav] Failed to load user roles (using legacy fallback):', err);
        if (!cancelled && profile.role) {
          setLegacyRoleName(profile.role);
        }
      } finally {
        if (!cancelled) setRolesLoading(false);
      }
    };

    fetchRoles();
    return () => {
      cancelled = true;
    };
  }, [profile?.id, profile?.role]);

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

      <DropdownMenuContent className='w-72' align='end' forceMount>
        <DropdownMenuLabel className='font-normal'>
          <div className='flex flex-col space-y-2'>
            <p className='text-sm font-medium leading-none'>
              {profile.full_name || 'User'}
            </p>
            <p className='text-xs leading-none text-muted-foreground break-all'>
              {profile.email}
            </p>
            {/* Multi-role badges. Primary first with star icon (only when
                there are 2+ roles, to avoid noise for single-role users).
                Falls back to legacy profile.role badge when user_roles is
                empty, and to a loading shimmer while the fetch is in
                flight. */}
            {userRoles.length > 0 ? (
              <div className='flex flex-wrap gap-1'>
                {[...userRoles]
                  .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
                  .map((r) => {
                    const showStar = r.is_primary && userRoles.length > 1;
                    return (
                      <Badge
                        key={r.id}
                        variant={r.is_primary ? 'default' : 'secondary'}
                        className='text-[10px] gap-1'
                        title={
                          r.is_primary ? 'Primary role' : 'Additional role'
                        }
                      >
                        {showStar && <Star className='h-2.5 w-2.5' />}
                        {r.role_name ?? r.role_key}
                      </Badge>
                    );
                  })}
              </div>
            ) : legacyRoleName ? (
              <Badge variant='secondary' className='w-fit text-xs'>
                {legacyRoleName}
              </Badge>
            ) : rolesLoading ? (
              <Badge
                variant='secondary'
                className='w-fit text-xs animate-pulse opacity-60'
              >
                Loading…
              </Badge>
            ) : null}
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

        {!isInstalled && canInstall && (
          <>
            <DropdownMenuItem
              className='cursor-pointer text-green-700 dark:text-green-400'
              onClick={installApp}
            >
              <Download className='mr-2 h-4 w-4' />
              Install App
            </DropdownMenuItem>
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
