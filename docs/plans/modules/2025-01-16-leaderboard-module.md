# Leaderboard Module - Implementation Plan

**Created:** 2025-01-16
**Module:** Leaderboard (Bug Bounty Gamification)
**Estimated Time:** 3-4 hours
**Dependencies:** Bug Reports Module
**Tech Stack:** Next.js 15, Supabase, TypeScript, React Query, Tailwind CSS

---

## 📋 Overview

The Leaderboard Module adds gamification to bug reporting with organization-specific leaderboards and prize configurations. It tracks and displays top bug reporters with weekly, monthly, and all-time rankings.

### Key Features

1. **Organization-Specific Leaderboards**: Each organization manages their own leaderboard
2. **Time Period Rankings**: Weekly, Monthly, and All-Time views
3. **Prize Configuration**: Organization owners can set prize amounts and rewards
4. **Podium Display**: Top 3 positions with visual emphasis
5. **Points System**: Configurable points based on bug severity/priority
6. **Ranking Table**: Full leaderboard with stats

---

## 🗄️ Database Schema Reference

The database schema was already created in Phase 2. Here's the relevant table:

```sql
-- organization_leaderboard_config table (already created)
CREATE TABLE organization_leaderboard_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE UNIQUE,

  -- Prize configuration
  weekly_prize_amount DECIMAL(10,2) DEFAULT 0,
  monthly_prize_amount DECIMAL(10,2) DEFAULT 0,
  prize_description TEXT,

  -- Points configuration
  points_critical INTEGER DEFAULT 50,
  points_high INTEGER DEFAULT 30,
  points_medium INTEGER DEFAULT 20,
  points_low INTEGER DEFAULT 10,

  -- Leaderboard settings
  is_enabled BOOLEAN DEFAULT true,
  reset_frequency TEXT DEFAULT 'weekly', -- 'weekly', 'monthly', 'never'

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

**Note:** Bug reports already have a `points` field and `reporter_email` for tracking.

---

## 🏗️ Architecture - 5 Layers

1. **Types Layer** → Leaderboard entry, config interfaces
2. **Services Layer** → Leaderboard queries and prize config
3. **Hooks Layer** → Fetch leaderboard data and config
4. **Components Layer** → Podium, leaderboard table, prize cards
5. **Pages Layer** → Leaderboard page and prize settings
6. **Permissions & Navigation** → Public view, admin config

---

## 📁 File Structure

```
bug-reporter-platform/
├── packages/
│   └── shared/
│       └── types/
│           └── leaderboard.ts          # Layer 1: New types
│
└── apps/
    └── platform/
        ├── lib/
        │   └── services/
        │       └── leaderboard/
        │           └── leaderboard-service.ts    # Layer 2
        │
        ├── hooks/
        │   └── leaderboard/
        │       ├── use-leaderboard.ts           # Layer 3
        │       └── use-leaderboard-config.ts
        │
        └── app/
            └── (dashboard)/
                └── leaderboard/
                    ├── page.tsx                 # Layer 5: Public view
                    ├── settings/
                    │   └── page.tsx            # Layer 5: Prize config
                    └── _components/            # Layer 4
                        ├── leaderboard-podium.tsx
                        ├── leaderboard-table.tsx
                        ├── prize-card.tsx
                        ├── time-period-tabs.tsx
                        └── leaderboard-config-form.tsx
```

---

## 🚀 Implementation Steps

### Layer 1: Types Layer (15-20 minutes)

Create `packages/shared/types/leaderboard.ts`:

```typescript
// Leaderboard entry for a user
export interface LeaderboardEntry {
  reporter_email: string;
  reporter_name?: string;
  total_bugs: number;
  total_points: number;
  rank: number;
}

// Leaderboard configuration
export interface LeaderboardConfig {
  id: string;
  organization_id: string;
  weekly_prize_amount: number;
  monthly_prize_amount: number;
  prize_description?: string;
  points_critical: number;
  points_high: number;
  points_medium: number;
  points_low: number;
  is_enabled: boolean;
  reset_frequency: 'weekly' | 'monthly' | 'never';
  created_at: string;
  updated_at: string;
}

// Update leaderboard config payload
export interface UpdateLeaderboardConfigPayload {
  organization_id: string;
  weekly_prize_amount?: number;
  monthly_prize_amount?: number;
  prize_description?: string;
  points_critical?: number;
  points_high?: number;
  points_medium?: number;
  points_low?: number;
  is_enabled?: boolean;
  reset_frequency?: 'weekly' | 'monthly' | 'never';
}

// Time period for leaderboard filtering
export type LeaderboardTimePeriod = 'week' | 'month' | 'all-time';
```

**Testing Checklist:**
- [ ] Verify all types compile
- [ ] Export from package index

---

### Layer 2: Services Layer (45-60 minutes)

Create `apps/platform/lib/services/leaderboard/leaderboard-service.ts`:

```typescript
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  LeaderboardEntry,
  LeaderboardConfig,
  UpdateLeaderboardConfigPayload,
  LeaderboardTimePeriod
} from '@your-org/shared/types/leaderboard';

export class LeaderboardService {
  /**
   * Get leaderboard entries for organization
   */
  static async getLeaderboard(
    organizationId: string,
    timePeriod: LeaderboardTimePeriod = 'all-time',
    limit = 100
  ): Promise<LeaderboardEntry[]> {
    try {
      const supabase = createClientSupabaseClient();

      // Build date filter based on time period
      let dateFilter: Date | null = null;
      if (timePeriod === 'week') {
        dateFilter = new Date();
        dateFilter.setDate(dateFilter.getDate() - 7);
      } else if (timePeriod === 'month') {
        dateFilter = new Date();
        dateFilter.setMonth(dateFilter.getMonth() - 1);
      }

      let query = supabase
        .from('bug_reports')
        .select('reporter_email, reporter_name, points')
        .eq('organization_id', organizationId)
        .not('reporter_email', 'is', null);

      if (dateFilter) {
        query = query.gte('created_at', dateFilter.toISOString());
      }

      const { data, error } = await query;
      if (error) throw error;

      // Group by reporter and calculate totals
      const leaderboardMap = new Map<string, LeaderboardEntry>();

      data?.forEach((bug) => {
        const email = bug.reporter_email;
        if (!email) return;

        const existing = leaderboardMap.get(email);
        if (existing) {
          existing.total_bugs += 1;
          existing.total_points += bug.points || 0;
        } else {
          leaderboardMap.set(email, {
            reporter_email: email,
            reporter_name: bug.reporter_name || undefined,
            total_bugs: 1,
            total_points: bug.points || 0,
            rank: 0
          });
        }
      });

      // Convert to array and sort by points
      const leaderboard = Array.from(leaderboardMap.values())
        .sort((a, b) => b.total_points - a.total_points)
        .slice(0, limit);

      // Assign ranks
      leaderboard.forEach((entry, index) => {
        entry.rank = index + 1;
      });

      console.log(`[leaderboard] Fetched ${leaderboard.length} entries for ${timePeriod}`);
      return leaderboard;
    } catch (error) {
      console.error('[leaderboard] Error fetching leaderboard:', error);
      throw error;
    }
  }

  /**
   * Get top 3 for podium display
   */
  static async getTopThree(
    organizationId: string,
    timePeriod: LeaderboardTimePeriod = 'week'
  ): Promise<LeaderboardEntry[]> {
    const leaderboard = await this.getLeaderboard(organizationId, timePeriod, 3);
    return leaderboard;
  }

  /**
   * Get leaderboard configuration for organization
   */
  static async getLeaderboardConfig(
    organizationId: string
  ): Promise<LeaderboardConfig | null> {
    try {
      const supabase = createClientSupabaseClient();

      const { data, error } = await supabase
        .from('organization_leaderboard_config')
        .select('*')
        .eq('organization_id', organizationId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No config exists, return default
          return null;
        }
        throw error;
      }

      return data;
    } catch (error) {
      console.error('[leaderboard] Error fetching config:', error);
      throw error;
    }
  }

  /**
   * Create or update leaderboard configuration
   */
  static async upsertLeaderboardConfig(
    payload: UpdateLeaderboardConfigPayload
  ): Promise<LeaderboardConfig> {
    try {
      const supabase = createClientSupabaseClient();

      const { data, error } = await supabase
        .from('organization_leaderboard_config')
        .upsert({
          ...payload,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'organization_id'
        })
        .select()
        .single();

      if (error) throw error;

      console.log(`[leaderboard] Updated config for org ${payload.organization_id}`);
      return data;
    } catch (error) {
      console.error('[leaderboard] Error updating config:', error);
      throw error;
    }
  }

  /**
   * Calculate points for a bug based on priority
   */
  static async calculateBugPoints(
    organizationId: string,
    priority: string
  ): Promise<number> {
    try {
      const config = await this.getLeaderboardConfig(organizationId);

      if (!config) {
        // Default points if no config
        const defaultPoints = {
          critical: 50,
          high: 30,
          medium: 20,
          low: 10
        };
        return defaultPoints[priority as keyof typeof defaultPoints] || 10;
      }

      const pointsMap = {
        critical: config.points_critical,
        high: config.points_high,
        medium: config.points_medium,
        low: config.points_low
      };

      return pointsMap[priority as keyof typeof pointsMap] || config.points_low;
    } catch (error) {
      console.error('[leaderboard] Error calculating points:', error);
      return 10; // Fallback
    }
  }
}
```

**Testing Checklist:**
- [ ] Test leaderboard fetching for different time periods
- [ ] Test top 3 retrieval
- [ ] Test config creation/update
- [ ] Test points calculation
- [ ] Verify grouping by reporter email works correctly

---

### Layer 3: Hooks Layer (30-40 minutes)

#### 1. `apps/platform/hooks/leaderboard/use-leaderboard.ts`

```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import { LeaderboardService } from '@/lib/services/leaderboard/leaderboard-service';
import type { LeaderboardEntry, LeaderboardTimePeriod } from '@your-org/shared/types/leaderboard';
import { useOrganizationContext } from '@/contexts/organization-context';

export function useLeaderboard(timePeriod: LeaderboardTimePeriod = 'all-time') {
  const { currentOrganization } = useOrganizationContext();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLeaderboard = useCallback(async () => {
    if (!currentOrganization) {
      setEntries([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const data = await LeaderboardService.getLeaderboard(
        currentOrganization.id,
        timePeriod
      );

      setEntries(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch leaderboard';
      setError(message);
      console.error('[hooks/leaderboard] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [currentOrganization, timePeriod]);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  return {
    entries,
    loading,
    error,
    refetch: fetchLeaderboard
  };
}
```

#### 2. `apps/platform/hooks/leaderboard/use-leaderboard-config.ts`

```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import { LeaderboardService } from '@/lib/services/leaderboard/leaderboard-service';
import type { LeaderboardConfig } from '@your-org/shared/types/leaderboard';
import { useOrganizationContext } from '@/contexts/organization-context';
import { useToast } from '@/hooks/use-toast';

export function useLeaderboardConfig() {
  const { currentOrganization } = useOrganizationContext();
  const [config, setConfig] = useState<LeaderboardConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const { toast } = useToast();

  const fetchConfig = useCallback(async () => {
    if (!currentOrganization) {
      setConfig(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const data = await LeaderboardService.getLeaderboardConfig(currentOrganization.id);
      setConfig(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch config';
      setError(message);
      console.error('[hooks/leaderboard-config] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [currentOrganization]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const updateConfig = async (updates: any) => {
    if (!currentOrganization) return;

    try {
      setUpdating(true);

      const updated = await LeaderboardService.upsertLeaderboardConfig({
        organization_id: currentOrganization.id,
        ...updates
      });

      setConfig(updated);

      toast({
        title: 'Success',
        description: 'Leaderboard settings updated successfully',
      });

      return updated;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update config';

      toast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      });

      throw err;
    } finally {
      setUpdating(false);
    }
  };

  return {
    config,
    loading,
    error,
    updating,
    updateConfig,
    refetch: fetchConfig
  };
}
```

**Testing Checklist:**
- [ ] Test leaderboard hook with different time periods
- [ ] Test config hook fetching
- [ ] Test config update
- [ ] Verify hooks update on organization change

---

### Layer 4: Components Layer (60-75 minutes)

#### 1. `apps/platform/app/(dashboard)/leaderboard/_components/leaderboard-podium.tsx`

Adapt from `MyJKKN/app/(routes)/bug-leaderboard/page.tsx` podium section:

```typescript
'use client';

import { Trophy, Award, Medal } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { LeaderboardEntry } from '@your-org/shared/types/leaderboard';

interface LeaderboardPodiumProps {
  topThree: LeaderboardEntry[];
}

export function LeaderboardPodium({ topThree }: LeaderboardPodiumProps) {
  const [first, second, third] = topThree;

  const positions = [
    { entry: second, rank: 2, icon: Medal, color: 'text-slate-400', height: 'h-32' },
    { entry: first, rank: 1, icon: Trophy, color: 'text-yellow-500', height: 'h-40' },
    { entry: third, rank: 3, icon: Award, color: 'text-amber-600', height: 'h-28' }
  ];

  return (
    <div className="flex items-end justify-center gap-4 py-8">
      {positions.map((pos, idx) => (
        pos.entry ? (
          <Card key={idx} className="w-32">
            <CardContent className={`p-4 text-center ${pos.height} flex flex-col justify-end`}>
              <pos.icon className={`h-8 w-8 mx-auto mb-2 ${pos.color}`} />
              <div className="font-bold text-lg">#{pos.rank}</div>
              <div className="text-sm truncate">{pos.entry.reporter_name || pos.entry.reporter_email}</div>
              <div className="text-xs text-muted-foreground">{pos.entry.total_points} pts</div>
            </CardContent>
          </Card>
        ) : null
      ))}
    </div>
  );
}
```

#### 2. `apps/platform/app/(dashboard)/leaderboard/_components/leaderboard-table.tsx`

```typescript
'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Trophy } from 'lucide-react';
import type { LeaderboardEntry } from '@your-org/shared/types/leaderboard';

interface LeaderboardTableProps {
  entries: LeaderboardEntry[];
}

export function LeaderboardTable({ entries }: LeaderboardTableProps) {
  if (entries.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No entries yet. Be the first to report a bug!
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-16">Rank</TableHead>
          <TableHead>Reporter</TableHead>
          <TableHead className="text-right">Bugs Reported</TableHead>
          <TableHead className="text-right">Total Points</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => (
          <TableRow key={entry.reporter_email}>
            <TableCell className="font-medium">
              {entry.rank <= 3 ? (
                <div className="flex items-center gap-2">
                  <Trophy className={`h-4 w-4 ${
                    entry.rank === 1 ? 'text-yellow-500' :
                    entry.rank === 2 ? 'text-slate-400' :
                    'text-amber-600'
                  }`} />
                  {entry.rank}
                </div>
              ) : (
                entry.rank
              )}
            </TableCell>
            <TableCell>
              <div>
                <div className="font-medium">
                  {entry.reporter_name || 'Anonymous'}
                </div>
                <div className="text-sm text-muted-foreground">
                  {entry.reporter_email}
                </div>
              </div>
            </TableCell>
            <TableCell className="text-right">{entry.total_bugs}</TableCell>
            <TableCell className="text-right font-bold">{entry.total_points}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

#### 3. `apps/platform/app/(dashboard)/leaderboard/_components/prize-card.tsx`

```typescript
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, Gift } from 'lucide-react';
import type { LeaderboardConfig } from '@your-org/shared/types/leaderboard';

interface PrizeCardProps {
  config: LeaderboardConfig | null;
}

export function PrizeCard({ config }: PrizeCardProps) {
  if (!config || !config.is_enabled) return null;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {config.weekly_prize_amount > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <DollarSign className="h-5 w-5 text-green-600" />
              Weekly Prize
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              ${config.weekly_prize_amount}
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Awarded to top bug reporter each week
            </p>
          </CardContent>
        </Card>
      )}

      {config.monthly_prize_amount > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Gift className="h-5 w-5 text-purple-600" />
              Monthly Prize
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              ${config.monthly_prize_amount}
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Awarded to top bug reporter each month
            </p>
          </CardContent>
        </Card>
      )}

      {config.prize_description && (
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Additional Rewards</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{config.prize_description}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

#### 4. `apps/platform/app/(dashboard)/leaderboard/_components/time-period-tabs.tsx`

```typescript
'use client';

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { LeaderboardTimePeriod } from '@your-org/shared/types/leaderboard';

interface TimePeriodTabsProps {
  value: LeaderboardTimePeriod;
  onChange: (value: LeaderboardTimePeriod) => void;
}

export function TimePeriodTabs({ value, onChange }: TimePeriodTabsProps) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as LeaderboardTimePeriod)}>
      <TabsList>
        <TabsTrigger value="week">This Week</TabsTrigger>
        <TabsTrigger value="month">This Month</TabsTrigger>
        <TabsTrigger value="all-time">All Time</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
```

#### 5. `apps/platform/app/(dashboard)/leaderboard/_components/leaderboard-config-form.tsx`

```typescript
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import type { LeaderboardConfig } from '@your-org/shared/types/leaderboard';

const formSchema = z.object({
  is_enabled: z.boolean(),
  weekly_prize_amount: z.coerce.number().min(0),
  monthly_prize_amount: z.coerce.number().min(0),
  prize_description: z.string().optional(),
  points_low: z.coerce.number().min(1),
  points_medium: z.coerce.number().min(1),
  points_high: z.coerce.number().min(1),
  points_critical: z.coerce.number().min(1),
});

type FormValues = z.infer<typeof formSchema>;

interface LeaderboardConfigFormProps {
  config: LeaderboardConfig | null;
  onSubmit: (values: FormValues) => Promise<void>;
  isSubmitting?: boolean;
}

export function LeaderboardConfigForm({
  config,
  onSubmit,
  isSubmitting = false
}: LeaderboardConfigFormProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      is_enabled: config?.is_enabled ?? true,
      weekly_prize_amount: config?.weekly_prize_amount ?? 0,
      monthly_prize_amount: config?.monthly_prize_amount ?? 0,
      prize_description: config?.prize_description ?? '',
      points_low: config?.points_low ?? 10,
      points_medium: config?.points_medium ?? 20,
      points_high: config?.points_high ?? 30,
      points_critical: config?.points_critical ?? 50,
    }
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="is_enabled"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <FormLabel className="text-base">Enable Leaderboard</FormLabel>
                <FormDescription>
                  Show leaderboard and gamification features
                </FormDescription>
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />

        <div className="grid gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="weekly_prize_amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Weekly Prize Amount ($)</FormLabel>
                <FormControl>
                  <Input type="number" min="0" step="0.01" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="monthly_prize_amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Monthly Prize Amount ($)</FormLabel>
                <FormControl>
                  <Input type="number" min="0" step="0.01" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="prize_description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Additional Prize Description</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="e.g., Top 3 reporters get exclusive swag..."
                  rows={3}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="space-y-4">
          <h3 className="font-medium">Points Configuration</h3>
          <div className="grid gap-4 md:grid-cols-4">
            <FormField
              control={form.control}
              name="points_low"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Low Priority</FormLabel>
                  <FormControl>
                    <Input type="number" min="1" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="points_medium"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Medium Priority</FormLabel>
                  <FormControl>
                    <Input type="number" min="1" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="points_high"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>High Priority</FormLabel>
                  <FormControl>
                    <Input type="number" min="1" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="points_critical"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Critical Priority</FormLabel>
                  <FormControl>
                    <Input type="number" min="1" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : 'Save Settings'}
        </Button>
      </form>
    </Form>
  );
}
```

**Testing Checklist:**
- [ ] Test podium display
- [ ] Test leaderboard table
- [ ] Test prize cards
- [ ] Test time period tabs
- [ ] Test config form
- [ ] Verify mobile responsiveness

---

### Layer 5: Pages Layer (45-60 minutes)

#### 1. `apps/platform/app/(dashboard)/leaderboard/page.tsx`

```typescript
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ContentLayout } from '@/components/admin-panel/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { useLeaderboard } from '@/hooks/leaderboard/use-leaderboard';
import { useLeaderboardConfig } from '@/hooks/leaderboard/use-leaderboard-config';
import { LeaderboardPodium } from './_components/leaderboard-podium';
import { LeaderboardTable } from './_components/leaderboard-table';
import { PrizeCard } from './_components/prize-card';
import { TimePeriodTabs } from './_components/time-period-tabs';
import type { LeaderboardTimePeriod } from '@your-org/shared/types/leaderboard';

export default function LeaderboardPage() {
  const [timePeriod, setTimePeriod] = useState<LeaderboardTimePeriod>('week');
  const { entries, loading } = useLeaderboard(timePeriod);
  const { config } = useLeaderboardConfig();

  const topThree = entries.slice(0, 3);

  return (
    <ContentLayout title="Leaderboard">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Leaderboard</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Bug Reporter Leaderboard</h1>
            <p className="text-muted-foreground">
              Top bug reporters and their rankings
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/leaderboard/settings">
              <Settings className="mr-2 h-4 w-4" />
              Prize Settings
            </Link>
          </Button>
        </div>

        <PrizeCard config={config} />

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Rankings</CardTitle>
              <TimePeriodTabs value={timePeriod} onChange={setTimePeriod} />
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-12">Loading...</div>
            ) : (
              <>
                {topThree.length > 0 && <LeaderboardPodium topThree={topThree} />}
                <LeaderboardTable entries={entries} />
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
```

#### 2. `apps/platform/app/(dashboard)/leaderboard/settings/page.tsx`

```typescript
'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ContentLayout } from '@/components/admin-panel/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { useLeaderboardConfig } from '@/hooks/leaderboard/use-leaderboard-config';
import { LeaderboardConfigForm } from '../_components/leaderboard-config-form';

export default function LeaderboardSettingsPage() {
  const { config, updating, updateConfig } = useLeaderboardConfig();

  return (
    <ContentLayout title="Leaderboard Settings">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/leaderboard">Leaderboard</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Settings</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 space-y-4">
        <Button asChild variant="outline" size="sm">
          <Link href="/leaderboard">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Leaderboard
          </Link>
        </Button>

        <Card>
          <CardHeader>
            <CardTitle>Prize & Points Configuration</CardTitle>
            <CardDescription>
              Configure prize amounts and points for your organization's bug bounty program
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LeaderboardConfigForm
              config={config}
              onSubmit={updateConfig}
              isSubmitting={updating}
            />
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
```

**Testing Checklist:**
- [ ] Test leaderboard page displays correctly
- [ ] Test time period switching
- [ ] Test settings page
- [ ] Test config form submission
- [ ] Verify navigation works
- [ ] Test mobile responsiveness

---

### Layer 6: Permissions & Navigation (15-20 minutes)

#### Update Navigation Menu

```typescript
// In navigation/menu config
{
  groupLabel: 'Leaderboard',
  menus: [
    {
      href: '/leaderboard',
      label: 'Leaderboard',
      icon: Trophy,
      permission: 'leaderboard.view' // Public to all org members
    }
  ]
}
```

#### Define Permissions

```typescript
export const PERMISSIONS = {
  leaderboard: {
    view: ['owner', 'admin', 'developer'], // All can view
    configure: ['owner', 'admin'] // Only owner/admin can configure prizes
  }
};
```

**Testing Checklist:**
- [ ] Test all roles can view leaderboard
- [ ] Test only owner/admin can access settings
- [ ] Verify permissions enforce correctly

---

## ✅ Completion Checklist

### Functionality
- [ ] Leaderboard displays for week/month/all-time
- [ ] Top 3 podium displays correctly
- [ ] Full rankings table works
- [ ] Prize cards display when configured
- [ ] Settings page allows prize configuration
- [ ] Points configuration works
- [ ] Calculations are accurate

### Technical
- [ ] Grouping by reporter email works
- [ ] Rankings calculate correctly
- [ ] Time period filtering works
- [ ] Config upsert works correctly
- [ ] Mobile responsive
- [ ] Performance is good with many entries

### Integration
- [ ] Organization context integrated
- [ ] Points from bug reports calculated
- [ ] Navigation works
- [ ] Permissions enforced

---

## 🔧 Dependencies

**Required:**
1. ✅ Bug Reports Module (for points data)
2. ✅ Organizations Module (for context)
3. ✅ Database schema (Phase 2)

**Optional Enhancements:**
- Real-time leaderboard updates
- Email notifications for prize winners
- Leaderboard reset automation

---

## 📝 Notes

### Reuse from MyJKKN

Adapt from `app/(routes)/bug-leaderboard/page.tsx`:
- Podium design and layout
- Trophy/medal icons and colors
- Prize card styling
- Table structure

### Future Enhancements

- Automated prize distribution
- Leaderboard history/archives
- Additional reward tiers
- Team-based leaderboards
- Achievement badges

---

**Total Estimated Time:** 3-4 hours

**Status:** Ready for Implementation
**Next Module:** Team Management Module or Messaging Module
