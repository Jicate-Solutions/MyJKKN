'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ChevronDown, Dot, LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { DropdownMenuArrow } from '@radix-ui/react-dropdown-menu';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@/components/ui/collapsible';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import { FavoriteStar } from '@/components/Favorites/FavoriteStar';

type Submenu = {
  href: string;
  label: string;
  active: boolean;
  icon?: LucideIcon;
  submenus?: Submenu[];
};

interface CollapseMenuButtonProps {
  icon: LucideIcon;
  label: string;
  active: boolean;
  submenus: Submenu[];
  isOpen?: boolean;
  shortcut?: string;
  module?: string;
  parentIconName?: string;
  /** Real URL for the parent item — used when favoriting the top-level row */
  href?: string;
}

/**
 * Renders a submenu row. If the row has its own `submenus`, renders it as a nested
 * collapsible. Otherwise renders as a plain link with a FavoriteStar.
 * Depth controls indentation so level-3 items step further right than level-2.
 */
function SubmenuRow({
  item,
  depth,
  module,
  parentIconName,
}: {
  item: Submenu;
  depth: number;
  module: string;
  parentIconName: string;
}) {
  const [open, setOpen] = useState(
    !!item.submenus?.some(s => s.active)
  );
  const ItemIcon = item.icon;
  const hasChildren = !!item.submenus && item.submenus.length > 0;

  // Leaf submenu: plain link + favorite star
  if (!hasChildren) {
    return (
      <div className='flex items-center group/row mb-1'>
        <Button
          variant={item.active ? 'secondary' : 'ghost'}
          className={cn(
            'flex-1 justify-start h-9',
            !item.active && 'dark:text-gray-400'
          )}
          style={{ paddingLeft: `${8 + depth * 12}px` }}
          asChild
        >
          <Link href={item.href}>
            <span className='mr-3'>
              {ItemIcon ? <ItemIcon size={14} /> : <Dot size={18} />}
            </span>
            <p className='max-w-[160px] truncate text-sm'>{item.label}</p>
          </Link>
        </Button>
        <FavoriteStar
          pagePath={item.href}
          pageTitle={item.label}
          module={module}
          iconName={parentIconName}
          size='sm'
          className='opacity-0 group-hover/row:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity mr-1'
        />
      </div>
    );
  }

  // Branch submenu: collapsible that recurses
  return (
    <Collapsible open={open} onOpenChange={setOpen} className='w-full'>
      <div className='flex items-center group/row mb-1'>
        <CollapsibleTrigger asChild>
          <Button
            variant={item.active ? 'secondary' : 'ghost'}
            className={cn(
              'flex-1 justify-between h-9',
              !item.active && 'dark:text-gray-400'
            )}
            style={{ paddingLeft: `${8 + depth * 12}px` }}
          >
            <div className='flex items-center'>
              <span className='mr-3'>
                {ItemIcon ? <ItemIcon size={14} /> : <Dot size={18} />}
              </span>
              <p className='max-w-[150px] truncate text-sm'>{item.label}</p>
            </div>
            <ChevronDown
              size={14}
              className={cn(
                'transition-transform duration-200 mr-1',
                open && 'rotate-180'
              )}
            />
          </Button>
        </CollapsibleTrigger>
        <FavoriteStar
          pagePath={item.href}
          pageTitle={item.label}
          module={module}
          iconName={parentIconName}
          size='sm'
          className='opacity-0 group-hover/row:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity mr-1'
        />
      </div>
      <CollapsibleContent className='overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down'>
        {item.submenus!.map((child, idx) => (
          <SubmenuRow
            key={idx}
            item={child}
            depth={depth + 1}
            module={module}
            parentIconName={parentIconName}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function CollapseMenuButton({
  icon: Icon,
  label,
  active,
  submenus,
  isOpen,
  shortcut,
  module = 'Unknown',
  parentIconName = 'Folder',
  href,
}: CollapseMenuButtonProps) {
  const isSubmenuActive = submenus.some(
    (submenu) =>
      submenu.active ||
      submenu.submenus?.some((grand) => grand.active)
  );
  const [isCollapsed, setIsCollapsed] = useState<boolean>(isSubmenuActive);

  // Sidebar expanded: inline collapsible with recursive children + favorite stars
  return isOpen ? (
    <Collapsible
      open={isCollapsed}
      onOpenChange={setIsCollapsed}
      className='w-full'
    >
      <div className='flex items-center group/row mb-1'>
        <CollapsibleTrigger
          className='[&[data-state=open]>div>div>svg]:rotate-180 flex-1'
          asChild
        >
          <Button
            variant={active ? 'secondary' : 'ghost'}
            className={cn('w-full justify-start h-10', !active && 'dark:text-gray-400')}
          >
            <div className='w-full items-center flex justify-between'>
              <div className='flex items-center'>
                <span className='mr-4'>
                  <Icon size={18} />
                </span>
                <p
                  className={cn(
                    'max-w-[150px] truncate',
                    isOpen
                      ? 'translate-x-0 opacity-100'
                      : '-translate-x-96 opacity-0'
                  )}
                >
                  {label}
                </p>
              </div>
              <div
                className={cn(
                  'whitespace-nowrap flex items-center gap-1',
                  isOpen
                    ? 'translate-x-0 opacity-100'
                    : '-translate-x-96 opacity-0'
                )}
              >
                {shortcut && (
                  <kbd className='hidden lg:inline-flex h-4 select-none items-center rounded border px-1 font-mono text-[9px] font-medium text-muted-foreground dark:text-gray-400 dark:border-gray-600 dark:bg-gray-800/50 bg-muted/80 border-border/60'>
                    {shortcut}
                  </kbd>
                )}
                <ChevronDown
                  size={18}
                  className='transition-transform duration-200'
                />
              </div>
            </div>
          </Button>
        </CollapsibleTrigger>
        {href && (
          <FavoriteStar
            pagePath={href}
            pageTitle={label}
            module={module}
            iconName={parentIconName}
            size='sm'
            className='opacity-0 group-hover/row:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity mr-1'
          />
        )}
      </div>
      <CollapsibleContent className='overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down'>
        {submenus.map((child, index) => (
          <SubmenuRow
            key={index}
            item={child}
            depth={1}
            module={module}
            parentIconName={parentIconName}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  ) : (
    // Sidebar collapsed (icon-only): dropdown, no star (no room)
    <DropdownMenu>
      <TooltipProvider disableHoverableContent>
        <Tooltip delayDuration={100}>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant={active ? 'secondary' : 'ghost'}
                className={cn('w-full justify-start h-10 mb-1', !active && 'dark:text-gray-400')}
              >
                <div className='w-full items-center flex justify-between'>
                  <div className='flex items-center'>
                    <span className={cn(isOpen === false ? '' : 'mr-4')}>
                      <Icon size={18} />
                    </span>
                    <p
                      className={cn(
                        'max-w-[200px] truncate',
                        isOpen === false ? 'opacity-0' : 'opacity-100'
                      )}
                    >
                      {label}
                    </p>
                  </div>
                </div>
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side='right' align='start' alignOffset={2}>
            {label}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DropdownMenuContent side='right' sideOffset={25} align='start'>
        <DropdownMenuLabel className='max-w-[190px] truncate'>
          {label}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {submenus.map(({ href, label, submenus: grand }, index) => (
          <DropdownMenuItem key={index} asChild>
            <Link className='cursor-pointer' href={href}>
              <p className='max-w-[180px] truncate'>
                {label}
                {grand && grand.length > 0 && (
                  <span className='ml-1 text-xs text-muted-foreground'>
                    ({grand.length})
                  </span>
                )}
              </p>
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuArrow className='fill-border' />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
