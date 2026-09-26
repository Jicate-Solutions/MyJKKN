'use client';

import { useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import {
  buildPermissionModuleGroups,
  type PermissionItem,
  type PermissionModuleGroup,
  type PermissionSubGroup
} from '@/lib/constants/permission-grouping';

interface GroupedPermissionPanelProps {
  /** Flat map: permission key → granted. */
  values: Record<string, boolean>;
  onToggle: (key: string, next: boolean, label: string) => void;
  onBulkSet: (keys: string[], value: boolean) => void;
  searchQuery: string;
  onClearSearch: () => void;
  disabled?: boolean;
  /** View / Create / Edit / Delete shortcuts at module level. */
  showActionShortcuts?: boolean;
}

const ACTION_SHORTCUTS = ['view', 'create', 'edit', 'delete'] as const;

const countActive = (perms: PermissionItem[], values: Record<string, boolean>) =>
  perms.reduce((n, p) => (values[p.key] ? n + 1 : n), 0);

const keysOf = (perms: PermissionItem[]) => perms.map((p) => p.key);

function filterGroups(groups: PermissionModuleGroup[], query: string): PermissionModuleGroup[] {
  const q = query.trim().toLowerCase();
  if (!q) return groups;

  const matches = (p: PermissionItem) =>
    p.label.toLowerCase().includes(q) || p.key.toLowerCase().includes(q);

  return groups.flatMap((group) => {
    if (group.name.toLowerCase().includes(q)) return [group];
    const subGroups: PermissionSubGroup[] = group.subGroups.flatMap((sub) => {
      if (sub.label.toLowerCase().includes(q)) return [sub];
      const permissions = sub.permissions.filter(matches);
      return permissions.length ? [{ ...sub, permissions }] : [];
    });
    if (subGroups.length === 0) return [];
    return [{ ...group, subGroups, permissions: subGroups.flatMap((s) => s.permissions) }];
  });
}

function BulkButtons({
  keys,
  onBulkSet,
  disabled,
  compact
}: {
  keys: string[];
  onBulkSet: (keys: string[], value: boolean) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const size = compact ? 'px-2 h-7 text-xs' : '';
  return (
    <div className='flex gap-2 shrink-0'>
      {[true, false].map((value) => (
        <Button
          key={String(value)}
          variant='outline'
          size='sm'
          type='button'
          className={size}
          disabled={disabled}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onBulkSet(keys, value);
          }}
        >
          {value ? 'Enable all' : 'Disable all'}
        </Button>
      ))}
    </div>
  );
}

function PermissionGrid({
  permissions,
  values,
  onToggle,
  disabled
}: {
  permissions: PermissionItem[];
  values: Record<string, boolean>;
  onToggle: GroupedPermissionPanelProps['onToggle'];
  disabled?: boolean;
}) {
  return (
    <div className='grid grid-cols-1 md:grid-cols-2 gap-3'>
      {permissions.map((permission) => {
        const id = `perm-${permission.key}`;
        return (
          <div
            key={permission.key}
            className='flex items-center justify-between space-x-2 rounded-md border p-2 sm:p-3 hover:bg-muted/50'
          >
            <div className='space-y-0.5 min-w-0'>
              <Label htmlFor={id} className='text-xs sm:text-sm leading-tight'>
                {permission.label}
              </Label>
              <p className='text-[10px] sm:text-xs text-muted-foreground truncate'>
                {permission.key}
              </p>
            </div>
            <Switch
              id={id}
              checked={Boolean(values[permission.key])}
              onCheckedChange={(checked) =>
                onToggle(permission.key, checked, permission.label)
              }
              disabled={disabled}
              aria-label={`Toggle ${permission.label}`}
            />
          </div>
        );
      })}
    </div>
  );
}

export function GroupedPermissionPanel({
  values,
  onToggle,
  onBulkSet,
  searchQuery,
  onClearSearch,
  disabled,
  showActionShortcuts
}: GroupedPermissionPanelProps) {
  const allGroups = useMemo(() => buildPermissionModuleGroups(), []);
  const groups = useMemo(
    () => filterGroups(allGroups, searchQuery),
    [allGroups, searchQuery]
  );
  const [openSubGroups, setOpenSubGroups] = useState<Set<string>>(new Set());
  const searching = searchQuery.trim().length > 0;

  const setSubGroupOpen = (key: string, open: boolean) =>
    setOpenSubGroups((prev) => {
      const next = new Set(prev);
      if (open) next.add(key);
      else next.delete(key);
      return next;
    });

  if (groups.length === 0) {
    return (
      <div className='flex flex-col items-center justify-center py-8 text-center'>
        <p className='text-muted-foreground'>No permissions match your search</p>
        <Button variant='link' type='button' onClick={onClearSearch} className='mt-2'>
          Clear search
        </Button>
      </div>
    );
  }

  return (
    <Accordion type='multiple' className='space-y-4'>
      {groups.map((group) => {
        // Counts always reflect the whole module, not just the search hits.
        const fullGroup = allGroups.find((g) => g.key === group.key) ?? group;
        const active = countActive(fullGroup.permissions, values);
        const total = fullGroup.permissions.length;

        return (
          <AccordionItem
            key={group.key}
            value={group.key}
            className='border rounded-lg overflow-hidden'
          >
            <AccordionTrigger className='px-3 sm:px-4 py-2.5 sm:py-3 hover:bg-muted/50 group'>
              <div className='flex items-center w-full justify-between pr-2 sm:pr-4'>
                <span className='font-medium text-sm sm:text-base'>{group.name}</span>
                <div className='flex items-center gap-2'>
                  {fullGroup.subGroups.length > 1 && (
                    <span className='hidden sm:inline text-xs text-muted-foreground'>
                      {fullGroup.subGroups.length} sub-modules
                    </span>
                  )}
                  <Badge
                    variant={active > 0 ? 'default' : 'outline'}
                    className='text-[10px] sm:text-xs'
                  >
                    {active}/{total}
                  </Badge>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className='px-4 pb-3 pt-1'>
              {!disabled && (
                <div className='flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-3 px-1 pt-2'>
                  <span className='text-xs sm:text-sm font-medium'>
                    All permissions in this module
                  </span>
                  <BulkButtons
                    keys={keysOf(group.permissions)}
                    onBulkSet={onBulkSet}
                    disabled={disabled}
                  />
                </div>
              )}

              {showActionShortcuts && !disabled && (
                <div className='flex flex-col gap-2 mb-4'>
                  <span className='text-xs font-medium text-muted-foreground'>
                    Enable a permission type across this module:
                  </span>
                  <div className='flex flex-wrap gap-2'>
                    {ACTION_SHORTCUTS.map((action) => {
                      const keys = group.permissions
                        .filter((p) => p.key.split('.').pop() === action)
                        .map((p) => p.key);
                      return (
                        <Button
                          key={action}
                          variant='secondary'
                          size='sm'
                          type='button'
                          className='px-2 py-1 h-7 text-xs capitalize'
                          disabled={keys.length === 0}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onBulkSet(keys, true);
                          }}
                        >
                          {action}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              )}

              {group.subGroups.length === 1 && fullGroup.subGroups.length === 1 ? (
                <PermissionGrid
                  permissions={group.permissions}
                  values={values}
                  onToggle={onToggle}
                  disabled={disabled}
                />
              ) : (
                <div className='space-y-2'>
                  {group.subGroups.map((sub) => {
                    const fullSub =
                      fullGroup.subGroups.find((s) => s.key === sub.key) ?? sub;
                    const subActive = countActive(fullSub.permissions, values);
                    const isOpen = searching || openSubGroups.has(sub.key);
                    return (
                      <Collapsible
                        key={sub.key}
                        open={isOpen}
                        onOpenChange={(open) => setSubGroupOpen(sub.key, open)}
                        className='rounded-md border'
                      >
                        <div className='flex items-center justify-between gap-2 px-3 py-2 bg-muted/30'>
                          <CollapsibleTrigger asChild>
                            <button
                              type='button'
                              className='flex flex-1 items-center gap-2 text-left min-w-0'
                            >
                              <ChevronRight
                                className={cn(
                                  'h-4 w-4 shrink-0 transition-transform',
                                  isOpen && 'rotate-90'
                                )}
                              />
                              <span className='text-sm font-medium truncate'>
                                {sub.label}
                              </span>
                              <Badge
                                variant={subActive > 0 ? 'default' : 'outline'}
                                className='text-[10px] sm:text-xs'
                              >
                                {subActive}/{fullSub.permissions.length}
                              </Badge>
                            </button>
                          </CollapsibleTrigger>
                          {!disabled && (
                            <BulkButtons
                              keys={keysOf(sub.permissions)}
                              onBulkSet={onBulkSet}
                              disabled={disabled}
                              compact
                            />
                          )}
                        </div>
                        <CollapsibleContent className='p-3'>
                          <PermissionGrid
                            permissions={sub.permissions}
                            values={values}
                            onToggle={onToggle}
                            disabled={disabled}
                          />
                        </CollapsibleContent>
                      </Collapsible>
                    );
                  })}
                </div>
              )}
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}
