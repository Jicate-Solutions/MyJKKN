'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@/components/ui/collapsible';
import {
  Search,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Shield,
  User,
} from 'lucide-react';
import BeatLoader from 'react-spinners/BeatLoader';
import { PERMISSION_CATEGORIES } from '@/lib/constants/permissions';
import type { UnifiedAccessResponse } from '@/types/permissions-audit';
import { SeeAsUserButton } from './see-as-user-button';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SearchResult {
  id: string;
  email: string;
  full_name: string;
  role: string;
  avatar_url: string | null;
}

interface AssignedRole {
  roleKey: string;
  roleName: string;
  isPrimary: boolean;
}

interface InstitutionAccess {
  institutionId: string;
  institutionName: string;
  accessType: string;
  isActive: boolean;
}

interface ResolvedUser {
  user: {
    id: string;
    email: string;
    fullName: string;
    avatarUrl: string | null;
    role: string;
    isSuperAdmin: boolean;
    isActive: boolean;
    lastLogin: string | null;
    institutionId: string;
  };
  isOrphan: boolean;
  legacyRole: string;
  assignedRoles: AssignedRole[];
  primaryRole: string;
  isMismatch: boolean;
  isSuperAdmin: boolean;
  mergedPermissions: Record<string, boolean>;
  permissionSources: Record<string, string[]>;
  institutionAccess: InstitutionAccess[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getAvatarColor(name: string): string {
  const colors = [
    'bg-blue-500',
    'bg-emerald-500',
    'bg-violet-500',
    'bg-rose-500',
    'bg-amber-500',
    'bg-cyan-500',
    'bg-pink-500',
    'bg-indigo-500',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  try {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return 'Unknown';
  }
}

// ─── Sub-components (inline, no separate files) ────────────────────────────

function AvatarCircle({
  name,
  size = 'md',
}: {
  name: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const letter = name?.charAt(0)?.toUpperCase() ?? '?';
  const color = getAvatarColor(name ?? '');
  const sizeClass =
    size === 'sm'
      ? 'w-8 h-8 text-sm'
      : size === 'lg'
        ? 'w-12 h-12 text-lg'
        : 'w-10 h-10 text-base';
  return (
    <div
      className={`${color} ${sizeClass} rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0`}
    >
      {letter}
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  return (
    <Badge variant="secondary" className="font-mono text-xs capitalize">
      {role}
    </Badge>
  );
}

// ─── Permission Category Section ──────────────────────────────────────────────

function PermissionCategorySection({
  category,
  mergedPermissions,
  permissionSources,
  filter,
}: {
  category: (typeof PERMISSION_CATEGORIES)[number];
  mergedPermissions: Record<string, boolean>;
  permissionSources: Record<string, string[]>;
  filter: 'all' | 'granted' | 'denied';
}) {
  const [open, setOpen] = useState(false);

  const all = category.permissions;
  const granted = all.filter((p) => mergedPermissions[p.key] === true);
  const denied = all.filter((p) => !mergedPermissions[p.key]);

  const visible =
    filter === 'granted'
      ? granted
      : filter === 'denied'
        ? denied
        : all;

  // Don't render the category if the current filter yields nothing
  if (visible.length === 0) return null;

  const grantedCount = granted.length;
  const totalCount = all.length;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="w-full flex items-center justify-between px-4 py-3 bg-muted/40 hover:bg-muted/60 rounded-lg transition-colors text-left">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{category.name}</span>
            <span className="text-xs text-muted-foreground">
              ({grantedCount}/{totalCount} granted)
            </span>
          </div>
          {open ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 mb-3 pl-2 space-y-1">
          {visible.map((perm) => {
            const isGranted = mergedPermissions[perm.key] === true;
            const sources = permissionSources[perm.key] ?? [];
            return (
              <div
                key={perm.key}
                className="flex items-start gap-2 px-3 py-1.5 rounded-md hover:bg-muted/30 transition-colors"
              >
                {isGranted ? (
                  <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-muted-foreground/40 mt-0.5 flex-shrink-0" />
                )}
                <div className="flex flex-col min-w-0">
                  <span
                    className={`text-sm ${isGranted ? 'text-foreground' : 'text-muted-foreground/50'}`}
                  >
                    {perm.label}
                  </span>
                  {isGranted && sources.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      from: {sources.join(', ')}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function UserResolverTab() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedUserName, setSelectedUserName] = useState<string>('');
  const [resolvedData, setResolvedData] = useState<ResolvedUser | null>(null);
  const [resolveLoading, setResolveLoading] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  const [permissionFilter, setPermissionFilter] = useState<
    'all' | 'granted' | 'denied'
  >('all');

  const [unifiedData, setUnifiedData] = useState<UnifiedAccessResponse | null>(null);

  const searchRef = useRef<HTMLDivElement>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced search
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    debounceTimer.current = setTimeout(async () => {
      setSearchLoading(true);
      setSearchError(null);
      try {
        const res = await fetch(
          `/api/users/permissions-audit/search?q=${encodeURIComponent(q)}`
        );
        if (!res.ok) throw new Error('Search failed');
        const data = await res.json();
        setSearchResults(data.results ?? []);
        setShowDropdown(true);
      } catch {
        setSearchError('Failed to search users. Please try again.');
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [searchQuery]);

  // Fetch resolve data when a user is selected
  useEffect(() => {
    if (!selectedUserId) return;

    const fetchResolve = async () => {
      setResolveLoading(true);
      setResolveError(null);
      setResolvedData(null);
      try {
        const res = await fetch(
          `/api/users/permissions-audit/resolve?userId=${encodeURIComponent(selectedUserId)}`
        );
        if (!res.ok) throw new Error('Failed to resolve user permissions');
        const data: ResolvedUser = await res.json();
        setResolvedData(data);

        // After resolved user data is set, fetch unified access for their primary role
        if (data.primaryRole) {
          fetch(`/api/users/permissions-audit/unified?roleKey=${encodeURIComponent(data.primaryRole)}`)
            .then(res => res.ok ? res.json() : null)
            .then(uData => setUnifiedData(uData))
            .catch(() => setUnifiedData(null));
        }
      } catch {
        setResolveError(
          'Failed to load permission data for this user. Please try again.'
        );
      } finally {
        setResolveLoading(false);
      }
    };

    fetchResolve();
  }, [selectedUserId]);

  function handleSelectUser(result: SearchResult) {
    setSearchQuery(result.full_name || result.email);
    setSelectedUserId(result.id);
    setSelectedUserName(result.full_name || result.email);
    setShowDropdown(false);
    setPermissionFilter('all');
    setUnifiedData(null);
  }

  return (
    <div className="space-y-4">
      {/* ── Search Box ────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            User Permission Resolver
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Search for any user to inspect their complete effective permissions.
          </p>
        </CardHeader>
        <CardContent>
          <div ref={searchRef} className="relative max-w-lg">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (selectedUserId) {
                    setSelectedUserId(null);
                    setResolvedData(null);
                    setUnifiedData(null);
                  }
                }}
                onFocus={() => {
                  if (searchResults.length > 0) setShowDropdown(true);
                }}
                placeholder="Search by name or email..."
                className="pl-9 pr-4"
              />
              {searchLoading && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <BeatLoader size={6} color="#6b7280" />
                </div>
              )}
            </div>

            {/* Dropdown */}
            {showDropdown && (
              <div className="absolute z-50 mt-1 w-full bg-background border border-border rounded-lg shadow-lg overflow-hidden">
                {searchResults.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-muted-foreground text-center">
                    No users found
                  </div>
                ) : (
                  <ul className="max-h-64 overflow-y-auto">
                    {searchResults.map((result) => (
                      <li key={result.id}>
                        <button
                          className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/60 transition-colors text-left"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleSelectUser(result);
                          }}
                        >
                          <AvatarCircle
                            name={result.full_name || result.email}
                            size="sm"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {result.full_name || '(No name)'}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {result.email}
                            </p>
                          </div>
                          <RoleBadge role={result.role} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {searchError && (
              <p className="mt-2 text-xs text-destructive">{searchError}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Loading state ─────────────────────────────────────── */}
      {resolveLoading && (
        <Card>
          <CardContent className="flex items-center justify-center gap-3 py-12">
            <BeatLoader size={10} color="#6b7280" />
            <span className="text-sm text-muted-foreground">
              Loading permission data for {selectedUserName}...
            </span>
          </CardContent>
        </Card>
      )}

      {/* ── Error state ───────────────────────────────────────── */}
      {resolveError && (
        <Card>
          <CardContent className="flex items-center gap-3 py-6 text-destructive">
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            <p className="text-sm">{resolveError}</p>
          </CardContent>
        </Card>
      )}

      {/* ── Resolved user data ────────────────────────────────── */}
      {resolvedData && !resolveLoading && (
        <>
          {/* User Info Card */}
          <Card>
            <CardContent className="pt-5 space-y-4">
              {/* Top row: avatar + name/email | status + last login */}
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <AvatarCircle
                    name={resolvedData.user.fullName}
                    size="lg"
                  />
                  <div>
                    <p className="font-semibold text-base leading-tight">
                      {resolvedData.user.fullName}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {resolvedData.user.email}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <Badge
                    className={
                      resolvedData.user.isActive
                        ? 'bg-green-100 text-green-800 border-green-200'
                        : 'bg-red-100 text-red-800 border-red-200'
                    }
                  >
                    {resolvedData.user.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    Last login: {formatDate(resolvedData.user.lastLogin)}
                  </span>
                  <SeeAsUserButton
                    targetUserId={resolvedData.user.id}
                    targetName={resolvedData.user.fullName}
                    targetEmail={resolvedData.user.email}
                  />
                </div>
              </div>

              <hr className="border-border" />

              {/* Role information */}
              <div className="space-y-3">
                <p className="text-sm font-semibold">Role Information</p>

                {/* Super admin banner */}
                {resolvedData.isSuperAdmin && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-50 border border-purple-200">
                    <Shield className="h-4 w-4 text-purple-600 flex-shrink-0" />
                    <Badge className="bg-purple-100 text-purple-800 border-purple-200">
                      SUPER ADMIN
                    </Badge>
                    <span className="text-xs text-purple-700">
                      Bypasses all permission checks
                    </span>
                  </div>
                )}

                {/* Orphan warning */}
                {resolvedData.isOrphan && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200">
                    <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                    <span className="text-xs text-amber-700 font-medium">
                      ORPHAN — No user_roles entry found. This user has no
                      assigned roles in the roles table.
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Legacy role */}
                  <div className="rounded-lg border border-border px-3 py-2.5 space-y-1">
                    <p className="text-xs text-muted-foreground">
                      Legacy Role{' '}
                      <span className="font-mono">(profiles.role)</span>
                    </p>
                    <RoleBadge role={resolvedData.legacyRole} />
                  </div>

                  {/* Primary role */}
                  <div className="rounded-lg border border-border px-3 py-2.5 space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-muted-foreground">
                        Primary Role{' '}
                        <span className="font-mono">(user_roles)</span>
                      </p>
                      {resolvedData.isMismatch && (
                        <Badge className="bg-red-100 text-red-800 border-red-200 text-[10px] px-1.5 py-0">
                          MISMATCH
                        </Badge>
                      )}
                    </div>
                    <RoleBadge role={resolvedData.primaryRole} />
                  </div>
                </div>

                {/* All assigned roles */}
                {resolvedData.assignedRoles.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground">
                      All Assigned Roles
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {resolvedData.assignedRoles.map((ar) => (
                        <span
                          key={ar.roleKey}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                            ar.isPrimary
                              ? 'bg-primary text-primary-foreground border-transparent'
                              : 'bg-muted text-muted-foreground border-border'
                          }`}
                        >
                          {ar.roleName}
                          {ar.isPrimary && (
                            <span className="text-[10px] opacity-75">
                              primary
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Institution Access */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">
                Institution Access
              </CardTitle>
            </CardHeader>
            <CardContent>
              {resolvedData.institutionAccess.length === 0 ? (
                <div className="flex items-center gap-2 px-3 py-3 bg-muted/40 rounded-lg">
                  <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <p className="text-sm text-muted-foreground">
                    No cross-institution access. User sees only their primary
                    institution.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">
                          Institution
                        </th>
                        <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">
                          Access Type
                        </th>
                        <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">
                          Active
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {resolvedData.institutionAccess.map((ia) => (
                        <tr
                          key={ia.institutionId}
                          className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                        >
                          <td className="py-2 px-3 font-medium">
                            {ia.institutionName}
                          </td>
                          <td className="py-2 px-3">
                            <Badge
                              variant="secondary"
                              className="capitalize text-xs"
                            >
                              {ia.accessType}
                            </Badge>
                          </td>
                          <td className="py-2 px-3">
                            <span
                              className={`inline-block w-2.5 h-2.5 rounded-full ${ia.isActive ? 'bg-green-500' : 'bg-red-400'}`}
                              title={ia.isActive ? 'Active' : 'Inactive'}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Effective Permissions */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-sm font-semibold">
                  Effective Permissions
                </CardTitle>

                {/* Filter buttons */}
                {!resolvedData.isSuperAdmin && (
                  <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                    {(
                      [
                        { value: 'all', label: 'All' },
                        { value: 'granted', label: 'Granted Only' },
                        { value: 'denied', label: 'Denied Only' },
                      ] as const
                    ).map(({ value, label }) => (
                      <button
                        key={value}
                        onClick={() => setPermissionFilter(value)}
                        className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                          permissionFilter === value
                            ? 'bg-background shadow text-foreground'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {resolvedData.isSuperAdmin ? (
                <div className="flex items-center gap-3 px-4 py-4 rounded-lg bg-purple-50 border border-purple-200">
                  <Shield className="h-5 w-5 text-purple-600 flex-shrink-0" />
                  <p className="text-sm text-purple-700 font-medium">
                    Super Admin has ALL permissions via bypass flag. Individual
                    permission checks are skipped entirely.
                  </p>
                </div>
              ) : (
                PERMISSION_CATEGORIES.map((category) => (
                  <PermissionCategorySection
                    key={category.key}
                    category={category}
                    mergedPermissions={resolvedData.mergedPermissions}
                    permissionSources={resolvedData.permissionSources}
                    filter={permissionFilter}
                  />
                ))
              )}
            </CardContent>
          </Card>

          {/* Module Access Summary — Tri-Layer View */}
          {unifiedData && (() => {
            const filteredModules = unifiedData.modules.filter((mod) => {
              if (permissionFilter === 'all') return true;
              const ops = ['create', 'read', 'update', 'delete'] as const;
              if (permissionFilter === 'granted') {
                return ops.some((op) => mod.codePermissions[op] === true);
              }
              // 'denied' → keep modules where every CRUD is explicitly denied
              // (i.e. the module has a permission catalog and the role was
              // granted nothing). Drop indeterminate (null) cells from the
              // count so a single granted op also drops the row.
              if (!mod.hasCategory) return false;
              return ops.every((op) => mod.codePermissions[op] === false);
            });

            return (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">
                    Module Access Summary
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      ({filteredModules.length}/{unifiedData.modules.length})
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="grid gap-2">
                      {filteredModules.length === 0 ? (
                        <div className="text-xs text-muted-foreground italic px-3 py-4">
                          No modules match the current filter.
                        </div>
                      ) : (
                        filteredModules.map(mod => (
                        <div
                          key={mod.moduleName}
                          className={`flex items-center justify-between p-3 rounded-lg border ${
                            mod.conflicts.length > 0 ? 'border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20' : 'border-border'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className="font-medium text-sm">{mod.moduleName}</span>
                            {!mod.hasCategory && (
                              <Badge
                                variant="outline"
                                className="text-xs text-muted-foreground border-dashed"
                                title="No permission category defined for this module yet"
                              >
                                no catalog
                              </Badge>
                            )}
                            {mod.conflicts.length > 0 && (
                              <Badge variant="destructive" className="text-xs">
                                {mod.conflicts.length} conflict{mod.conflicts.length !== 1 ? 's' : ''}
                              </Badge>
                            )}
                            {mod.hasCategory && mod.isConsistent && (mod.codePermissions.create || mod.codePermissions.read || mod.codePermissions.update || mod.codePermissions.delete) && (
                              <Badge variant="outline" className="text-xs text-emerald-600 border-emerald-300">
                                Consistent
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            {/* Code CRUD */}
                            <div className="flex gap-1">
                              {(['create', 'read', 'update', 'delete'] as const).map(op => {
                                if (!mod.hasCategory) {
                                  return (
                                    <span
                                      key={op}
                                      title="No permission category defined for this module"
                                      className="w-5 h-5 inline-flex items-center justify-center rounded font-mono font-bold text-[10px] bg-muted text-muted-foreground border border-dashed"
                                    >
                                      —
                                    </span>
                                  );
                                }
                                return (
                                  <span
                                    key={op}
                                    title={`${op}: ${mod.codePermissions[op] === true ? 'granted' : mod.codePermissions[op] === false ? 'denied' : 'indeterminate'}`}
                                    className={`w-5 h-5 inline-flex items-center justify-center rounded font-mono font-bold text-[10px] ${
                                      mod.codePermissions[op] === true
                                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                        : mod.codePermissions[op] === false
                                          ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                          : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500'
                                    }`}
                                  >
                                    {op[0].toUpperCase()}
                                  </span>
                                );
                              })}
                            </div>
                            {/* Table count */}
                            <span>{mod.tableAccess.length} tables</span>
                            {/* Route count */}
                            <span>{mod.routeAccess.filter(r => r.hasPermission).length}/{mod.routeAccess.length} routes</span>
                          </div>
                        </div>
                        ))
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })()}
        </>
      )}

      {/* ── Empty state ───────────────────────────────────────── */}
      {!selectedUserId && !resolveLoading && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <User className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium text-sm">No user selected</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Search for a user above to view their effective permissions.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
