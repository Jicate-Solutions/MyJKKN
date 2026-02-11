'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { ExternalLink, Instagram, Youtube, Search, Filter } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  type SmAccount,
  type SmPlatform,
  type SmHealthStatus,
  PLATFORM_LABELS,
  PLATFORM_COLORS,
  HEALTH_STATUS_LABELS,
  HEALTH_STATUS_COLORS,
} from '@/types/social-media';

interface AccountsListProps {
  institutionId: string;
}

export function AccountsList({ institutionId }: AccountsListProps) {
  const [accounts, setAccounts] = useState<SmAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [healthFilter, setHealthFilter] = useState<string>('all');

  useEffect(() => {
    async function fetchAccounts() {
      try {
        const res = await fetch(
          `/api/social-media/accounts?institution_id=${institutionId}&limit=100`
        );
        if (!res.ok) throw new Error('Failed to load accounts');
        const json = await res.json();
        setAccounts(json.data || []);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchAccounts();
  }, [institutionId]);

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
      return true;
    });
  }, [accounts, search, platformFilter, healthFilter]);

  // Get unique platforms for filter
  const platforms = useMemo(() => {
    const set = new Set(accounts.map(a => a.platform));
    return Array.from(set).sort();
  }, [accounts]);

  if (loading) return null;
  if (error) return <div className="text-red-500">Error: {error}</div>;

  return (
    <div className="space-y-4">
      {/* Filters */}
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
      </div>

      {/* Results count */}
      <p className="text-sm text-muted-foreground">
        Showing {filtered.length} of {accounts.length} accounts
      </p>

      {/* Accounts grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map(account => (
          <AccountCard key={account.id} account={account} />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No accounts match your filters
        </div>
      )}
    </div>
  );
}


function AccountCard({ account }: { account: SmAccount }) {
  const platformColor = PLATFORM_COLORS[account.platform] || '#6B7280';
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
