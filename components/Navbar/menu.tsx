'use client';

import Link from 'next/link';
import { Ellipsis, LogOut, Download } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { usePWA } from '@/components/pwa/pwa-provider';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider
} from '@/components/ui/tooltip';
import { CollapseMenuButton } from './CollapseMenuButton';
import { GetRoleBasedPages, RolePermissionData } from '@/lib/sidebarMenuLink';
import { AuthService } from '@/lib/auth/auth-service';
import { useMemo } from 'react';
import { usePermissions } from '@/hooks/use-permissions';
import { useUserExpoTeamStatus } from '@/hooks/admission/use-expo-capture';

interface MenuProps {
  isOpen: boolean | undefined;
}

export function Menu({ isOpen }: MenuProps) {
  const pathname = usePathname();
  const {
    permissions,
    isSuperAdmin,
    isLoading: permissionsLoading,
    userProfile
  } = usePermissions();
  const { isInstalled, canInstall, installApp } = usePWA();

  // Check if user is an expo team member (for dynamic sidebar visibility)
  const { data: isExpoTeamMember } = useUserExpoTeamStatus();

  // Build RolePermissionData from usePermissions (multi-role merged)
  const roleData = useMemo((): RolePermissionData | null => {
    if (!userProfile) return null;

    // Super admin: GetRoleBasedPages checks role_key === 'super_admin'
    if (isSuperAdmin) {
      return {
        role_key: 'super_admin',
        permissions: {}
      };
    }

    // Enrich permissions with dynamic expo access for assigned team members.
    // Faculty/students assigned to expo events need to see the Expos menu
    // even without a global `admission.marketing.expos.view` permission.
    const enrichedPermissions = isExpoTeamMember
      ? { ...permissions, 'admission.marketing.expos.view': true }
      : permissions;

    return {
      role_key: userProfile.role || '',
      permissions: enrichedPermissions
    };
  }, [userProfile, permissions, isSuperAdmin, isExpoTeamMember]);

  // Debug: Log permission state for troubleshooting
  if (process.env.NODE_ENV === 'development' && roleData && !permissionsLoading) {
    const permCount = Object.keys(roleData.permissions).length;
    const trueCount = Object.values(roleData.permissions).filter(v => v === true).length;
    console.log(`[Menu] Role: ${roleData.role_key} | Permissions: ${trueCount}/${permCount} true`);
  }

  // Use the role-based menu with merged permissions
  const pages = GetRoleBasedPages(pathname, roleData);

  const handleLogout = async () => {
    try {
      await AuthService.signOut();
    } catch (error) {
      console.error('Error during logout:', error);
    }
  };

  return (
    <div className='overflow-y-auto h-full custom-scrollbar'>
      <nav className='mt-8 h-full w-full'>
        {permissionsLoading ? (
          <div className='flex justify-center items-center py-4'>
            <div className='animate-pulse h-4 w-24 bg-muted rounded mb-2'></div>
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className='animate-pulse h-8 w-full bg-muted rounded-md mb-2'
              ></div>
            ))}
          </div>
        ) : (
          <ul className='flex flex-col min-h-[calc(100vh-48px-36px-16px-32px)] lg:min-h-[calc(100vh-32px-40px-32px)] items-start space-y-1 px-2'>
            {pages.map(({ groupLabel, menus }, index) => (
              <li
                className={cn('w-full', groupLabel ? 'pt-5' : '')}
                key={index}
              >
                {(isOpen && groupLabel) || isOpen === undefined ? (
                  <p className='text-sm font-medium text-muted-foreground dark:text-white/80 px-4 pb-2 max-w-[248px] truncate'>
                    {groupLabel}
                  </p>
                ) : !isOpen && isOpen !== undefined && groupLabel ? (
                  <TooltipProvider>
                    <Tooltip delayDuration={100}>
                      <TooltipTrigger className='w-full'>
                        <div className='w-full flex justify-center items-center'>
                          <Ellipsis className='h-5 w-5' />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side='right'>
                        <p>{groupLabel}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <p className='pb-2'></p>
                )}
                {menus.map(
                  ({ href, label, icon: Icon, active, submenus }, index) =>
                    submenus.length === 0 ? (
                      <div className='w-full' key={index}>
                        <TooltipProvider disableHoverableContent>
                          <Tooltip delayDuration={100}>
                            <TooltipTrigger asChild>
                              <Button
                                variant={active ? 'secondary' : 'ghost'}
                                className={cn('w-full justify-start h-10 mb-1', !active && 'dark:text-gray-400')}
                                asChild
                              >
                                <Link href={href}>
                                  <span
                                    className={cn(
                                      isOpen === false ? '' : 'mr-4'
                                    )}
                                  >
                                    <Icon size={18} />
                                  </span>
                                  <p
                                    className={cn(
                                      'max-w-[200px] truncate',
                                      isOpen === false
                                        ? '-translate-x-96 opacity-0'
                                        : 'translate-x-0 opacity-100'
                                    )}
                                  >
                                    {label}
                                  </p>
                                </Link>
                              </Button>
                            </TooltipTrigger>
                            {isOpen === false && (
                              <TooltipContent side='right'>
                                {label}
                              </TooltipContent>
                            )}
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    ) : (
                      <div className='w-full' key={index}>
                        <CollapseMenuButton
                          icon={Icon}
                          label={label}
                          active={active}
                          submenus={submenus}
                          isOpen={isOpen}
                        />
                      </div>
                    )
                )}
              </li>
            ))}
            <li className='w-full grow flex items-end'>
              <div className='w-full'>
                {!isInstalled && canInstall && (
                  <TooltipProvider disableHoverableContent>
                    <Tooltip delayDuration={100}>
                      <TooltipTrigger asChild>
                        <Button
                          variant='ghost'
                          className='w-full justify-start h-10 mb-1 text-green-700 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300 hover:bg-green-50 dark:hover:bg-green-950'
                          onClick={installApp}
                        >
                          <span className={cn(isOpen === false ? '' : 'mr-4')}>
                            <Download size={18} />
                          </span>
                          <p
                            className={cn(
                              'max-w-[200px] truncate',
                              isOpen === false
                                ? '-translate-x-96 opacity-0'
                                : 'translate-x-0 opacity-100'
                            )}
                          >
                            Install App
                          </p>
                        </Button>
                      </TooltipTrigger>
                      {isOpen === false && (
                        <TooltipContent side='right'>Install App</TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                )}
                <TooltipProvider disableHoverableContent>
                  <Tooltip delayDuration={100}>
                    <TooltipTrigger asChild>
                      <Button
                        variant='outline'
                        className='w-full justify-center h-10 mt-4'
                        onClick={handleLogout}
                      >
                        <span className={cn(isOpen === false ? '' : 'mr-4')}>
                          <LogOut size={18} />
                        </span>
                        <p
                          className={cn(
                            'whitespace-nowrap',
                            isOpen === false ? 'opacity-0 hidden' : 'opacity-100'
                          )}
                        >
                          Sign out
                        </p>
                      </Button>
                    </TooltipTrigger>
                    {isOpen === false && (
                      <TooltipContent side='right'>Sign out</TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
              </div>
            </li>
          </ul>
        )}
      </nav>
    </div>
  );
}
