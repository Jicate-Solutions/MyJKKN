'use client';

import { useEffect, useState } from 'react';
import { BeatLoader } from 'react-spinners';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { PERMISSION_CATEGORIES } from '@/lib/constants/permissions';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RoleMeta {
  name: string;
  userCount: number;
  isSystem: boolean;
}

interface MatrixData {
  roles: string[];
  roleMeta: Record<string, RoleMeta>;
  matrix: Record<string, Record<string, boolean>>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Return the PERMISSION_CATEGORIES entry whose `key` is a prefix of the
 *  permission key (e.g. "users.create" → category with key "users"). */
function categoryForPermission(permKey: string) {
  return PERMISSION_CATEGORIES.find(
    (cat) =>
      permKey === cat.key ||
      permKey.startsWith(cat.key + '.') ||
      // some permissions live under a different category key  (e.g. roles.* → users)
      cat.permissions.some((p) => p.key === permKey)
  );
}

/** Return human-readable label from PERMISSION_CATEGORIES, falling back to
 *  the raw key when the permission isn't listed there. */
function labelForPermission(permKey: string): string {
  for (const cat of PERMISSION_CATEGORIES) {
    const found = cat.permissions.find((p) => p.key === permKey);
    if (found) return found.label;
  }
  return permKey;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PermissionMatrixTab() {
  const [matrixData, setMatrixData] = useState<MatrixData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedModule, setSelectedModule] = useState<string>('all');

  // Fetch matrix on mount
  useEffect(() => {
    const fetchMatrix = async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/users/permissions-audit/matrix');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        setMatrixData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load matrix');
      } finally {
        setLoading(false);
      }
    };
    fetchMatrix();
  }, []);

  // ── Loading / error states ──────────────────────────────────────────────────
  if (loading) {
    return (
      <Card>
        <CardContent className='flex items-center justify-center h-64'>
          <BeatLoader color='#6366f1' size={10} />
        </CardContent>
      </Card>
    );
  }

  if (error || !matrixData) {
    return (
      <Card>
        <CardContent className='flex items-center justify-center h-64 text-destructive'>
          {error ?? 'No data returned from API'}
        </CardContent>
      </Card>
    );
  }

  const { roles, roleMeta, matrix } = matrixData;

  // ── Filter permissions by selected module ──────────────────────────────────
  const allPermissions = Object.keys(matrix);

  const filteredPermissions =
    selectedModule === 'all'
      ? allPermissions
      : allPermissions.filter((permKey) => {
          const cat = categoryForPermission(permKey);
          return cat?.key === selectedModule;
        });

  // ── Group filtered permissions by category ─────────────────────────────────
  const groupedPermissions: Record<
    string,
    { categoryName: string; permissions: string[] }
  > = {};

  for (const permKey of filteredPermissions) {
    const cat = categoryForPermission(permKey);
    const groupKey = cat?.key ?? '__other__';
    const groupName = cat?.name ?? 'Other';
    if (!groupedPermissions[groupKey]) {
      groupedPermissions[groupKey] = { categoryName: groupName, permissions: [] };
    }
    groupedPermissions[groupKey].permissions.push(permKey);
  }

  const groups = Object.values(groupedPermissions);

  return (
    <Card>
      <CardHeader className='pb-3'>
        <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3'>
          <CardTitle className='text-base font-semibold'>
            Permission Matrix
          </CardTitle>

          {/* Module filter */}
          <div className='flex items-center gap-2'>
            <span className='text-xs text-muted-foreground whitespace-nowrap'>
              Filter by module
            </span>
            <Select value={selectedModule} onValueChange={setSelectedModule}>
              <SelectTrigger className='w-[200px] h-8 text-xs'>
                <SelectValue placeholder='All Modules' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All Modules</SelectItem>
                {PERMISSION_CATEGORIES.map((cat) => (
                  <SelectItem key={cat.key} value={cat.key}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Role count summary */}
        <div className='flex flex-wrap gap-2 mt-2'>
          {roles.map((role) => {
            const meta = roleMeta[role];
            return (
              <Badge key={role} variant='outline' className='text-xs gap-1'>
                {meta?.name ?? role}
                <span className='text-muted-foreground'>
                  ({meta?.userCount ?? 0})
                </span>
              </Badge>
            );
          })}
        </div>
      </CardHeader>

      <CardContent className='p-0'>
        {filteredPermissions.length === 0 ? (
          <div className='flex items-center justify-center h-32 text-sm text-muted-foreground'>
            No permissions found for this module.
          </div>
        ) : (
          <div className='overflow-x-auto'>
            <table className='w-full text-xs border-collapse'>
              <thead>
                <tr className='border-b bg-muted/40'>
                  {/* Sticky permission name header */}
                  <th className='sticky left-0 z-10 bg-muted/40 text-left px-4 py-2 font-semibold min-w-[260px] border-r'>
                    Permission
                  </th>
                  {roles.map((role) => {
                    const meta = roleMeta[role];
                    return (
                      <th
                        key={role}
                        className='px-3 py-2 text-center font-semibold whitespace-nowrap min-w-[90px]'
                      >
                        <div>{meta?.name ?? role}</div>
                        {meta && (
                          <div className='text-muted-foreground font-normal'>
                            ({meta.userCount})
                          </div>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>

              <tbody>
                {groups.map((group) => (
                  <>
                    {/* Category group header row */}
                    <tr
                      key={`group-${group.categoryName}`}
                      className='bg-indigo-50 border-y border-indigo-100'
                    >
                      <td
                        colSpan={roles.length + 1}
                        className='sticky left-0 px-4 py-1.5 font-semibold text-indigo-700 bg-indigo-50'
                      >
                        {group.categoryName}
                      </td>
                    </tr>

                    {/* Permission rows */}
                    {group.permissions.map((permKey, idx) => (
                      <tr
                        key={permKey}
                        className={idx % 2 === 0 ? 'bg-white' : 'bg-muted/20'}
                      >
                        {/* Sticky permission label */}
                        <td
                          className={`sticky left-0 z-10 px-4 py-2 border-r text-foreground font-mono ${
                            idx % 2 === 0 ? 'bg-white' : 'bg-muted/20'
                          }`}
                        >
                          <div className='font-medium text-[11px] text-muted-foreground'>
                            {permKey}
                          </div>
                          <div className='text-[11px] text-foreground/70 leading-tight mt-0.5'>
                            {labelForPermission(permKey)}
                          </div>
                        </td>

                        {/* Role cells */}
                        {roles.map((role) => {
                          const granted = matrix[permKey]?.[role] ?? false;
                          return (
                            <td
                              key={role}
                              className='px-3 py-2 text-center'
                              aria-label={`${role}: ${granted ? 'granted' : 'denied'}`}
                            >
                              {granted ? (
                                <span className='inline-flex items-center justify-center'>
                                  <span className='w-3 h-3 rounded-full bg-emerald-500' />
                                </span>
                              ) : (
                                <span className='inline-flex items-center justify-center'>
                                  <span className='w-3 h-3 rounded-full bg-gray-200' />
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Legend */}
        <div className='flex items-center gap-4 px-4 py-3 border-t text-xs text-muted-foreground'>
          <span className='flex items-center gap-1.5'>
            <span className='w-3 h-3 rounded-full bg-emerald-500 inline-block' />
            Granted
          </span>
          <span className='flex items-center gap-1.5'>
            <span className='w-3 h-3 rounded-full bg-gray-200 inline-block' />
            Denied
          </span>
          <span className='ml-auto'>
            {filteredPermissions.length} permission
            {filteredPermissions.length !== 1 ? 's' : ''}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
