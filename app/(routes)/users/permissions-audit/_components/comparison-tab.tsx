'use client';

import { useEffect, useState } from 'react';
import { BeatLoader } from 'react-spinners';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { ArrowLeftRight, CheckCircle, XCircle } from 'lucide-react';
import { PERMISSION_CATEGORIES } from '@/lib/constants/permissions';

// ─── Types ────────────────────────────────────────────────────────────────────

type ComparisonStatus = 'both' | 'left_only' | 'right_only' | 'neither';

interface ComparisonEntry {
  left: boolean;
  right: boolean;
  status: ComparisonStatus;
}

interface ComparisonResult {
  type: string;
  left: { roleKey: string; roleName: string };
  right: { roleKey: string; roleName: string };
  comparison: Record<string, ComparisonEntry>;
}

interface RoleMeta {
  name: string;
  userCount: number;
  isSystem: boolean;
}

interface MatrixResponse {
  roles: string[];
  roleMeta: Record<string, RoleMeta>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function labelForPermission(permKey: string): string {
  for (const cat of PERMISSION_CATEGORIES) {
    const found = cat.permissions.find((p) => p.key === permKey);
    if (found) return found.label;
  }
  return permKey;
}

function categoryForPermission(permKey: string) {
  return PERMISSION_CATEGORIES.find(
    (cat) =>
      permKey === cat.key ||
      permKey.startsWith(cat.key + '.') ||
      cat.permissions.some((p) => p.key === permKey)
  );
}

const STATUS_STYLES: Record<ComparisonStatus, string> = {
  both: 'bg-emerald-50 border-emerald-100',
  left_only: 'bg-amber-50 border-amber-100',
  right_only: 'bg-blue-50 border-blue-100',
  neither: 'bg-white border-gray-100'
};

const STATUS_BADGE: Record<ComparisonStatus, { label: string; className: string }> =
  {
    both: { label: 'Both', className: 'bg-emerald-100 text-emerald-800' },
    left_only: { label: 'Left only', className: 'bg-amber-100 text-amber-800' },
    right_only: {
      label: 'Right only',
      className: 'bg-blue-100 text-blue-800'
    },
    neither: { label: 'Neither', className: 'bg-gray-100 text-gray-600' }
  };

// ─── Component ────────────────────────────────────────────────────────────────

export function ComparisonTab() {
  // Roles list (from matrix API)
  const [rolesData, setRolesData] = useState<MatrixResponse | null>(null);
  const [rolesLoading, setRolesLoading] = useState(true);

  // User selections
  const [leftRole, setLeftRole] = useState<string>('');
  const [rightRole, setRightRole] = useState<string>('');

  // Comparison result
  const [comparisonData, setComparisonData] = useState<ComparisonResult | null>(
    null
  );
  const [comparing, setComparing] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);

  // UI state
  const [diffsOnly, setDiffsOnly] = useState(false);

  // ── Fetch roles on mount ──────────────────────────────────────────────────
  useEffect(() => {
    const fetchRoles = async () => {
      try {
        const res = await fetch('/api/users/permissions-audit/matrix');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: MatrixResponse = await res.json();
        setRolesData(json);
      } catch (err) {
        console.error('Failed to fetch roles:', err);
      } finally {
        setRolesLoading(false);
      }
    };
    fetchRoles();
  }, []);

  // ── Run comparison ────────────────────────────────────────────────────────
  const handleCompare = async () => {
    if (!leftRole || !rightRole) return;
    try {
      setComparing(true);
      setCompareError(null);
      setComparisonData(null);

      const params = new URLSearchParams({
        type: 'roles',
        left: leftRole,
        right: rightRole
      });
      const res = await fetch(`/api/users/permissions-audit/compare?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: ComparisonResult = await res.json();
      setComparisonData(json);
    } catch (err) {
      setCompareError(
        err instanceof Error ? err.message : 'Comparison failed'
      );
    } finally {
      setComparing(false);
    }
  };

  // ── Derived stats ─────────────────────────────────────────────────────────
  const stats = comparisonData
    ? Object.values(comparisonData.comparison).reduce(
        (acc, entry) => {
          acc[entry.status] = (acc[entry.status] ?? 0) + 1;
          return acc;
        },
        {} as Record<ComparisonStatus, number>
      )
    : null;

  // Group comparison entries by PERMISSION_CATEGORIES
  const groupedComparison = comparisonData
    ? (() => {
        const allKeys = Object.keys(comparisonData.comparison);
        const groups: Record<
          string,
          { categoryName: string; entries: { key: string; data: ComparisonEntry }[] }
        > = {};

        for (const permKey of allKeys) {
          const entry = comparisonData.comparison[permKey];

          // Apply diff-only filter
          if (diffsOnly && (entry.status === 'both' || entry.status === 'neither'))
            continue;

          const cat = categoryForPermission(permKey);
          const groupKey = cat?.key ?? '__other__';
          const groupName = cat?.name ?? 'Other';

          if (!groups[groupKey]) {
            groups[groupKey] = { categoryName: groupName, entries: [] };
          }
          groups[groupKey].entries.push({ key: permKey, data: entry });
        }

        // Remove empty groups (when diffsOnly is active)
        return Object.values(groups).filter((g) => g.entries.length > 0);
      })()
    : [];

  // ── Loading roles ─────────────────────────────────────────────────────────
  if (rolesLoading) {
    return (
      <Card>
        <CardContent className='flex items-center justify-center h-64'>
          <BeatLoader color='#6366f1' size={10} />
        </CardContent>
      </Card>
    );
  }

  const roles = rolesData?.roles ?? [];
  const roleMeta = rolesData?.roleMeta ?? {};

  return (
    <div className='space-y-4'>
      {/* ── Role selection ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className='pb-3'>
          <CardTitle className='text-base font-semibold flex items-center gap-2'>
            <ArrowLeftRight className='h-4 w-4 text-indigo-500' />
            Compare Two Roles
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className='flex flex-col sm:flex-row items-start sm:items-end gap-3'>
            {/* Left role */}
            <div className='flex flex-col gap-1 flex-1 min-w-[160px]'>
              <label className='text-xs text-muted-foreground font-medium'>
                Left Role
              </label>
              <Select value={leftRole} onValueChange={setLeftRole}>
                <SelectTrigger className='h-9 text-sm'>
                  <SelectValue placeholder='Select left role' />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((role) => (
                    <SelectItem key={role} value={role}>
                      {roleMeta[role]?.name ?? role}
                      <span className='ml-1 text-muted-foreground'>
                        ({roleMeta[role]?.userCount ?? 0})
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <span className='text-muted-foreground text-sm hidden sm:block pb-1'>
              vs
            </span>

            {/* Right role */}
            <div className='flex flex-col gap-1 flex-1 min-w-[160px]'>
              <label className='text-xs text-muted-foreground font-medium'>
                Right Role
              </label>
              <Select value={rightRole} onValueChange={setRightRole}>
                <SelectTrigger className='h-9 text-sm'>
                  <SelectValue placeholder='Select right role' />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((role) => (
                    <SelectItem key={role} value={role}>
                      {roleMeta[role]?.name ?? role}
                      <span className='ml-1 text-muted-foreground'>
                        ({roleMeta[role]?.userCount ?? 0})
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Compare button */}
            <Button
              onClick={handleCompare}
              disabled={!leftRole || !rightRole || comparing}
              className='h-9 px-5 shrink-0'
            >
              {comparing ? (
                <BeatLoader color='#ffffff' size={6} />
              ) : (
                <>
                  <ArrowLeftRight className='h-4 w-4 mr-2' />
                  Compare
                </>
              )}
            </Button>
          </div>

          {compareError && (
            <p className='mt-3 text-sm text-destructive'>{compareError}</p>
          )}
        </CardContent>
      </Card>

      {/* ── Results ────────────────────────────────────────────────────────── */}
      {comparisonData && stats && (
        <>
          {/* Summary cards */}
          <div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
            {/* Both */}
            <Card className='border-emerald-200'>
              <CardContent className='pt-4 pb-3 px-4'>
                <p className='text-xs text-muted-foreground mb-1'>
                  Both Have
                </p>
                <p className='text-2xl font-bold text-emerald-600'>
                  {stats.both ?? 0}
                </p>
              </CardContent>
            </Card>

            {/* Left only */}
            <Card className='border-amber-200'>
              <CardContent className='pt-4 pb-3 px-4'>
                <p className='text-xs text-muted-foreground mb-1 truncate'>
                  Only {comparisonData.left.roleName}
                </p>
                <p className='text-2xl font-bold text-amber-600'>
                  {stats.left_only ?? 0}
                </p>
              </CardContent>
            </Card>

            {/* Right only */}
            <Card className='border-blue-200'>
              <CardContent className='pt-4 pb-3 px-4'>
                <p className='text-xs text-muted-foreground mb-1 truncate'>
                  Only {comparisonData.right.roleName}
                </p>
                <p className='text-2xl font-bold text-blue-600'>
                  {stats.right_only ?? 0}
                </p>
              </CardContent>
            </Card>

            {/* Neither */}
            <Card className='border-gray-200'>
              <CardContent className='pt-4 pb-3 px-4'>
                <p className='text-xs text-muted-foreground mb-1'>
                  Neither Has
                </p>
                <p className='text-2xl font-bold text-gray-500'>
                  {stats.neither ?? 0}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Permission list */}
          <Card>
            <CardHeader className='pb-3'>
              {/* Header: title + diffs-only toggle */}
              <div className='flex items-center justify-between'>
                <CardTitle className='text-base font-semibold'>
                  Permission Breakdown
                  <span className='ml-2 text-xs font-normal text-muted-foreground'>
                    {comparisonData.left.roleName} vs{' '}
                    {comparisonData.right.roleName}
                  </span>
                </CardTitle>

                {/* Show differences toggle */}
                <label className='flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none'>
                  <input
                    type='checkbox'
                    checked={diffsOnly}
                    onChange={(e) => setDiffsOnly(e.target.checked)}
                    className='rounded'
                    aria-label='Show differences only'
                  />
                  Differences only
                </label>
              </div>

              {/* Column headers */}
              <div className='mt-3 grid grid-cols-[1fr_80px_80px] gap-2 text-xs font-semibold text-muted-foreground border-b pb-2'>
                <span>Permission</span>
                <span className='text-center'>
                  {comparisonData.left.roleName}
                </span>
                <span className='text-center'>
                  {comparisonData.right.roleName}
                </span>
              </div>
            </CardHeader>

            <CardContent className='pt-0 space-y-4'>
              {groupedComparison.length === 0 ? (
                <p className='text-sm text-muted-foreground text-center py-8'>
                  {diffsOnly
                    ? 'No differences found between these roles.'
                    : 'No permissions to display.'}
                </p>
              ) : (
                groupedComparison.map((group) => (
                  <div key={group.categoryName}>
                    {/* Group header */}
                    <div className='text-xs font-semibold text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded mb-1'>
                      {group.categoryName}
                    </div>

                    {/* Permission rows */}
                    <div className='space-y-0.5'>
                      {group.entries.map(({ key: permKey, data }) => (
                        <div
                          key={permKey}
                          className={`grid grid-cols-[1fr_80px_80px] gap-2 items-center px-3 py-2 rounded border text-xs ${STATUS_STYLES[data.status]}`}
                        >
                          {/* Permission label */}
                          <div>
                            <div className='text-foreground/80 font-medium leading-snug'>
                              {labelForPermission(permKey)}
                            </div>
                            <div className='text-muted-foreground font-mono text-[10px] mt-0.5'>
                              {permKey}
                            </div>
                          </div>

                          {/* Left column */}
                          <div className='flex justify-center'>
                            {data.left ? (
                              <CheckCircle className='h-4 w-4 text-emerald-500' />
                            ) : (
                              <XCircle className='h-4 w-4 text-gray-300' />
                            )}
                          </div>

                          {/* Right column */}
                          <div className='flex justify-center'>
                            {data.right ? (
                              <CheckCircle className='h-4 w-4 text-emerald-500' />
                            ) : (
                              <XCircle className='h-4 w-4 text-gray-300' />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </CardContent>

            {/* Legend */}
            <div className='flex flex-wrap items-center gap-3 px-6 py-3 border-t text-xs text-muted-foreground'>
              {(
                Object.entries(STATUS_BADGE) as [
                  ComparisonStatus,
                  { label: string; className: string }
                ][]
              ).map(([status, meta]) => (
                <span
                  key={status}
                  className={`px-2 py-0.5 rounded font-medium ${meta.className}`}
                >
                  {meta.label}
                </span>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
