'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { ExternalLink, Instagram, Youtube, Search, Plus, Building2, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  type SmAccount,
  type SmPlatform,
  PLATFORM_LABELS,
  PLATFORM_COLORS,
  HEALTH_STATUS_LABELS,
  HEALTH_STATUS_COLORS,
} from '@/types/social-media';

interface AccountsListProps {
  institutionId: string;
  userRole?: string;
  departmentId?: string | null;
}

const ADMIN_ROLES = ['super_admin', 'admin', 'principal'];

const ALL_PLATFORMS: SmPlatform[] = [
  'instagram', 'youtube', 'facebook', 'linkedin',
  'google_business', 'twitter', 'pinterest', 'snapchat',
  'threads', 'reddit', 'tumblr', 'quora',
];

export function AccountsList({ institutionId, userRole, departmentId }: AccountsListProps) {
  const isAdmin = ADMIN_ROLES.includes(userRole || '');
  const [accounts, setAccounts] = useState<SmAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [healthFilter, setHealthFilter] = useState<string>('all');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);

  const fetchAccounts = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(
        `/api/social-media/accounts?institution_id=${encodeURIComponent(institutionId)}&limit=100`
      );
      if (!res.ok) throw new Error('Failed to load accounts');
      const json = await res.json();
      setAccounts(json.data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [institutionId]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  // Get unique department IDs for filter
  const departments = useMemo(() => {
    const set = new Set<string>();
    accounts.forEach(a => {
      if (a.department_id) set.add(a.department_id);
    });
    return Array.from(set).sort();
  }, [accounts]);

  const filtered = useMemo(() => {
    return accounts.filter(account => {
      if (search) {
        const s = search.toLowerCase();
        if (
          !account.username.toLowerCase().includes(s) &&
          !(account.display_name || '').toLowerCase().includes(s)
        ) {
          return false;
        }
      }
      if (platformFilter !== 'all' && account.platform !== platformFilter) return false;
      if (healthFilter !== 'all' && account.health_status !== healthFilter) return false;
      if (departmentFilter !== 'all') {
        if (departmentFilter === 'institution' && account.department_id !== null) return false;
        if (departmentFilter !== 'institution' && account.department_id !== departmentFilter) return false;
      }
      return true;
    });
  }, [accounts, search, platformFilter, healthFilter, departmentFilter]);

  // Group filtered accounts by department
  const grouped = useMemo(() => {
    const map = new Map<string | null, SmAccount[]>();
    for (const account of filtered) {
      const key = account.department_id;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(account);
    }
    // Sort: institution-level (null) first, then department IDs alphabetically
    const sorted = Array.from(map.entries()).sort(([a], [b]) => {
      if (a === null) return -1;
      if (b === null) return 1;
      return a.localeCompare(b);
    });
    return sorted;
  }, [filtered]);

  // Get unique platforms for filter
  const platforms = useMemo(() => {
    const set = new Set(accounts.map(a => a.platform));
    return Array.from(set).sort();
  }, [accounts]);

  if (loading) return null;
  if (error) return <div className="text-red-500">Error: {error}</div>;

  return (
    <div className="space-y-4">
      {/* Filters + Add button */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search accounts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={platformFilter} onValueChange={setPlatformFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Platform" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Platforms</SelectItem>
            {platforms.map(p => (
              <SelectItem key={p} value={p}>
                {PLATFORM_LABELS[p as SmPlatform] || p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={healthFilter} onValueChange={setHealthFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Health" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Health</SelectItem>
            <SelectItem value="green">Active</SelectItem>
            <SelectItem value="yellow">Warning</SelectItem>
            <SelectItem value="red">Critical</SelectItem>
            <SelectItem value="dormant">Dormant</SelectItem>
          </SelectContent>
        </Select>
        {departments.length > 0 && (
          <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Department" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              <SelectItem value="institution">Institution-Level</SelectItem>
              {departments.map(d => (
                <SelectItem key={d} value={d}>
                  {d.substring(0, 8)}...
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Add Account Dialog — visible only to admins */}
        {isAdmin && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" />
                Add Account
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Social Media Account</DialogTitle>
                <DialogDescription>
                  Register a new social media account for monitoring.
                </DialogDescription>
              </DialogHeader>
              <AddAccountForm
                institutionId={institutionId}
                onSuccess={() => {
                  setDialogOpen(false);
                  fetchAccounts();
                }}
              />
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Results count */}
      <p className="text-sm text-muted-foreground">
        Showing {filtered.length} of {accounts.length} accounts
      </p>

      {/* Grouped accounts */}
      {grouped.map(([deptId, deptAccounts]) => (
        <div key={deptId ?? '__institution'} className="space-y-3">
          <div className="flex items-center gap-2 pt-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              {deptId === null ? 'Institution-Level Accounts' : `Department ${deptId.substring(0, 8)}...`}
            </h3>
            <Badge variant="secondary" className="text-[10px]">
              {deptAccounts.length}
            </Badge>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {deptAccounts.map(account => (
              <AccountCard key={account.id} account={account} />
            ))}
          </div>
        </div>
      ))}

      {filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No accounts match your filters
        </div>
      )}
    </div>
  );
}


// ─── Add Account Form ──────────────────────────────────────────────────────

interface AddAccountFormProps {
  institutionId: string;
  onSuccess: () => void;
}

function AddAccountForm({ institutionId, onSuccess }: AddAccountFormProps) {
  const [platform, setPlatform] = useState<string>('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [profileUrl, setProfileUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!platform || !username.trim()) {
      setFormError('Platform and username are required.');
      return;
    }
    setFormError(null);
    setSubmitting(true);
    try {
      const body: Record<string, string> = {
        institution_id: institutionId,
        platform,
        username: username.trim(),
      };
      if (displayName.trim()) body.display_name = displayName.trim();
      if (profileUrl.trim()) body.profile_url = profileUrl.trim();

      const res = await fetch('/api/social-media/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Failed to add account');
      }
      onSuccess();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="add-platform">Platform *</Label>
        <Select value={platform} onValueChange={setPlatform}>
          <SelectTrigger id="add-platform">
            <SelectValue placeholder="Select platform" />
          </SelectTrigger>
          <SelectContent>
            {ALL_PLATFORMS.map(p => (
              <SelectItem key={p} value={p}>
                {PLATFORM_LABELS[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="add-username">Username *</Label>
        <Input
          id="add-username"
          placeholder="e.g. jkkn_official"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="add-display-name">Display Name</Label>
        <Input
          id="add-display-name"
          placeholder="e.g. JKKN Group of Institutions"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="add-profile-url">Profile URL</Label>
        <Input
          id="add-profile-url"
          type="url"
          placeholder="https://instagram.com/jkkn_official"
          value={profileUrl}
          onChange={(e) => setProfileUrl(e.target.value)}
        />
      </div>
      {formError && (
        <p className="text-sm text-red-500">{formError}</p>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={submitting} className="gap-1.5">
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitting ? 'Adding...' : 'Add Account'}
        </Button>
      </div>
    </form>
  );
}


// ─── Account Card ──────────────────────────────────────────────────────────

function AccountCard({ account }: { account: SmAccount }) {
  const healthColor = HEALTH_STATUS_COLORS[account.health_status];
  const healthLabel = HEALTH_STATUS_LABELS[account.health_status];

  return (
    <Link href={`/social-media/accounts/${account.id}`}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start gap-3">
            {/* Platform icon */}
            <div className="shrink-0">
              <PlatformAvatar platform={account.platform} />
            </div>

            {/* Account info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium text-sm truncate">@{account.username}</p>
                {account.is_verified && (
                  <Badge variant="secondary" className="text-[10px] px-1">Verified</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {account.display_name || PLATFORM_LABELS[account.platform]}
              </p>
              <div className="flex items-center gap-2 mt-2">
                <div className="flex items-center gap-1">
                  <div
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: healthColor }}
                  />
                  <span className="text-[11px] text-muted-foreground">{healthLabel}</span>
                </div>
                <span className="text-[11px] text-muted-foreground">
                  Score: {account.health_score}/100
                </span>
              </div>
            </div>

            {/* External link */}
            {account.profile_url && (
              <a
                href={account.profile_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function PlatformAvatar({ platform }: { platform: string }) {
  const color = PLATFORM_COLORS[platform as SmPlatform] || '#6B7280';

  switch (platform) {
    case 'instagram':
      return (
        <div className="h-10 w-10 rounded-full flex items-center justify-center bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600">
          <Instagram className="h-5 w-5 text-white" />
        </div>
      );
    case 'youtube':
      return (
        <div className="h-10 w-10 rounded-full flex items-center justify-center bg-red-600">
          <Youtube className="h-5 w-5 text-white" />
        </div>
      );
    default:
      return (
        <div
          className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
          style={{ backgroundColor: color }}
        >
          {platform.charAt(0).toUpperCase()}
        </div>
      );
  }
}
