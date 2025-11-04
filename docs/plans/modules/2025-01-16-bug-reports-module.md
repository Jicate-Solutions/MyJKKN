# Bug Reports Module - Implementation Plan

**Created:** 2025-01-16
**Module:** Bug Reports
**Estimated Time:** 6-8 hours
**Dependencies:** Organizations Module, Applications Module
**Tech Stack:** Next.js 15, Supabase, TypeScript, React Query, Tailwind CSS

---

## 📋 Overview

The Bug Reports Module is the core feature of the platform. It enables viewing, managing, and responding to bug reports submitted through the SDK. This module adapts the existing MyJKKN bug report functionality for multi-tenant, multi-application usage.

### Key Features

1. **Bug Listing**: View all bugs with advanced filtering (org, app, status, category, priority)
2. **Bug Details**: Full bug information with screenshots, system info, and messages
3. **Status Management**: Update bug status through workflow (open → in_progress → resolved → closed)
4. **Priority & Assignment**: Set priority levels and assign to team members
5. **Messaging**: Thread-based communication on bug reports
6. **Search & Filter**: Full-text search with multiple filter options
7. **Bulk Actions**: Update multiple bugs at once
8. **Statistics**: Dashboard with bug metrics

---

## 🗄️ Database Schema Reference

The database schema was already created in Phase 2 of the main implementation plan. Here are the relevant tables:

```sql
-- bug_reports table (already created)
CREATE TABLE bug_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,

  -- Bug information
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL, -- 'ui', 'functionality', 'performance', 'security', 'other'
  priority TEXT DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
  status TEXT DEFAULT 'open', -- 'open', 'in_progress', 'resolved', 'closed'

  -- Reporter information
  reporter_name TEXT,
  reporter_email TEXT,
  reporter_user_id UUID REFERENCES auth.users(id), -- If logged in

  -- System information
  browser_info JSONB,
  system_info JSONB,
  screenshot_url TEXT,
  page_url TEXT,
  console_logs JSONB,

  -- Assignment
  assigned_to UUID REFERENCES auth.users(id),

  -- Points for gamification
  points INTEGER DEFAULT 0,

  -- Metadata
  is_resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- bug_report_messages table (already created)
CREATE TABLE bug_report_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bug_report_id UUID NOT NULL REFERENCES bug_reports(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- bug_report_participants table (already created)
CREATE TABLE bug_report_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bug_report_id UUID NOT NULL REFERENCES bug_reports(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  added_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(bug_report_id, user_id)
);
```

**Indexes** (already created):
```sql
CREATE INDEX idx_bug_reports_org ON bug_reports(organization_id);
CREATE INDEX idx_bug_reports_app ON bug_reports(application_id);
CREATE INDEX idx_bug_reports_status ON bug_reports(status);
CREATE INDEX idx_bug_reports_assigned ON bug_reports(assigned_to);
```

---

## 🏗️ Architecture - 5 Layers

This module follows the standard 5-layer architecture:

1. **Types Layer** → TypeScript interfaces (already in shared package)
2. **Services Layer** → Bug report CRUD operations with complex queries
3. **Hooks Layer** → React Query hooks for data fetching and mutations
4. **Components Layer** → Bug cards, detail view, status updates, messaging
5. **Pages Layer** → List, detail, and dashboard pages
6. **Permissions & Navigation** → Access control and menu setup

---

## 📁 File Structure

```
bug-reporter-platform/
├── packages/
│   └── shared/
│       └── types/
│           └── bug-reports.ts          # ✅ Already exists (Phase 2)
│
└── apps/
    └── platform/
        ├── lib/
        │   └── services/
        │       └── bug-reports/
        │           └── bug-report-service.ts    # Layer 2: Service
        │
        ├── hooks/
        │   └── bug-reports/
        │       ├── use-bug-reports.ts          # Layer 3: Hooks
        │       ├── use-bug-report.ts
        │       ├── use-update-bug-status.ts
        │       ├── use-send-message.ts
        │       └── use-bug-stats.ts
        │
        └── app/
            └── (dashboard)/
                └── bugs/
                    ├── page.tsx                 # Layer 5: List page
                    ├── dashboard/
                    │   └── page.tsx            # Layer 5: Dashboard
                    ├── [id]/
                    │   └── page.tsx            # Layer 5: Detail page
                    └── _components/            # Layer 4: Components
                        ├── bug-filters.tsx
                        ├── bug-list.tsx
                        ├── bug-card.tsx
                        ├── bug-detail-view.tsx
                        ├── bug-status-badge.tsx
                        ├── bug-priority-select.tsx
                        ├── bug-messages.tsx
                        ├── bug-message-form.tsx
                        ├── bug-screenshot-viewer.tsx
                        ├── bug-system-info.tsx
                        ├── bug-stats-cards.tsx
                        └── bulk-actions.tsx
```

---

## 🚀 Implementation Steps

### Layer 1: Types Layer ✅ **ALREADY COMPLETE**

The types are already defined in `packages/shared/types/bug-reports.ts` from Phase 2.

**Verification Checklist:**
- [ ] Verify `BugReport` interface exists with all fields
- [ ] Verify `BugReportMessage` interface exists
- [ ] Verify `BugReportFilters` interface exists
- [ ] Verify `BugReportStats` interface exists
- [ ] Verify status, category, priority enums exist

**No action needed** - Move to Layer 2.

---

### Layer 2: Services Layer (75-90 minutes)

Create `apps/platform/lib/services/bug-reports/bug-report-service.ts`:

```typescript
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  BugReport,
  BugReportMessage,
  BugReportFilters,
  UpdateBugReportPayload
} from '@your-org/shared/types/bug-reports';

export class BugReportService {
  /**
   * Get bug reports with advanced filtering and pagination
   */
  static async getBugReports(
    filters: BugReportFilters = {},
    page = 1,
    pageSize = 20
  ) {
    try {
      const supabase = createClientSupabaseClient();

      let query = supabase
        .from('bug_reports')
        .select(`
          *,
          application:applications(id, name),
          organization:organizations(id, name),
          assigned_user:auth.users(id, email, raw_user_meta_data)
        `, { count: 'exact' });

      // Apply filters
      if (filters.organization_id) {
        query = query.eq('organization_id', filters.organization_id);
      }
      if (filters.application_id) {
        query = query.eq('application_id', filters.application_id);
      }
      if (filters.status) {
        query = query.eq('status', filters.status);
      }
      if (filters.category) {
        query = query.eq('category', filters.category);
      }
      if (filters.priority) {
        query = query.eq('priority', filters.priority);
      }
      if (filters.assigned_to) {
        query = query.eq('assigned_to', filters.assigned_to);
      }
      if (filters.search) {
        query = query.or(`title.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
      }

      // Sort
      const sortBy = filters.sort_by || 'created_at';
      const sortOrder = filters.sort_order || 'desc';
      query = query.order(sortBy, { ascending: sortOrder === 'asc' });

      // Pagination
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;
      if (error) throw error;

      console.log(`[bug-reports] Fetched ${data?.length || 0} bugs (total: ${count})`);
      return { data: data || [], total: count || 0, page, pageSize };
    } catch (error) {
      console.error('[bug-reports] Error fetching bug reports:', error);
      throw error;
    }
  }

  /**
   * Get single bug report by ID with full details
   */
  static async getBugReportById(id: string): Promise<BugReport | null> {
    try {
      const supabase = createClientSupabaseClient();

      const { data, error } = await supabase
        .from('bug_reports')
        .select(`
          *,
          application:applications(id, name),
          organization:organizations(id, name),
          assigned_user:auth.users(id, email, raw_user_meta_data),
          messages:bug_report_messages(
            id,
            message,
            created_at,
            user:auth.users(id, email, raw_user_meta_data)
          )
        `)
        .eq('id', id)
        .order('created_at', { foreignTable: 'bug_report_messages', ascending: true })
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          console.warn(`[bug-reports] Bug report not found: ${id}`);
          return null;
        }
        throw error;
      }

      return data;
    } catch (error) {
      console.error('[bug-reports] Error fetching bug report by ID:', error);
      throw error;
    }
  }

  /**
   * Update bug report status
   */
  static async updateBugStatus(
    id: string,
    status: string
  ): Promise<BugReport> {
    try {
      const supabase = createClientSupabaseClient();

      const updateData: any = {
        status,
        updated_at: new Date().toISOString()
      };

      // Mark as resolved when status is 'resolved' or 'closed'
      if (status === 'resolved' || status === 'closed') {
        updateData.is_resolved = true;
        if (!updateData.resolved_at) {
          updateData.resolved_at = new Date().toISOString();
        }
      } else {
        updateData.is_resolved = false;
        updateData.resolved_at = null;
      }

      const { data, error } = await supabase
        .from('bug_reports')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      console.log(`[bug-reports] Updated status for ${id}: ${status}`);
      return data;
    } catch (error) {
      console.error('[bug-reports] Error updating bug status:', error);
      throw error;
    }
  }

  /**
   * Update bug report details
   */
  static async updateBugReport(
    payload: UpdateBugReportPayload
  ): Promise<BugReport> {
    try {
      const supabase = createClientSupabaseClient();

      const { id, ...updates } = payload;

      const { data, error } = await supabase
        .from('bug_reports')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      console.log(`[bug-reports] Updated bug report: ${id}`);
      return data;
    } catch (error) {
      console.error('[bug-reports] Error updating bug report:', error);
      throw error;
    }
  }

  /**
   * Assign bug to user
   */
  static async assignBug(
    bugId: string,
    userId: string | null
  ): Promise<BugReport> {
    try {
      const supabase = createClientSupabaseClient();

      const { data, error } = await supabase
        .from('bug_reports')
        .update({
          assigned_to: userId,
          updated_at: new Date().toISOString()
        })
        .eq('id', bugId)
        .select()
        .single();

      if (error) throw error;

      console.log(`[bug-reports] Assigned bug ${bugId} to ${userId || 'unassigned'}`);
      return data;
    } catch (error) {
      console.error('[bug-reports] Error assigning bug:', error);
      throw error;
    }
  }

  /**
   * Update bug priority
   */
  static async updatePriority(
    bugId: string,
    priority: string
  ): Promise<BugReport> {
    try {
      const supabase = createClientSupabaseClient();

      const { data, error } = await supabase
        .from('bug_reports')
        .update({
          priority,
          updated_at: new Date().toISOString()
        })
        .eq('id', bugId)
        .select()
        .single();

      if (error) throw error;

      console.log(`[bug-reports] Updated priority for ${bugId}: ${priority}`);
      return data;
    } catch (error) {
      console.error('[bug-reports] Error updating priority:', error);
      throw error;
    }
  }

  /**
   * Send message on bug report
   */
  static async sendMessage(
    bugReportId: string,
    message: string
  ): Promise<BugReportMessage> {
    try {
      const supabase = createClientSupabaseClient();

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('bug_report_messages')
        .insert([{
          bug_report_id: bugReportId,
          user_id: user.id,
          message
        }])
        .select(`
          id,
          message,
          created_at,
          user:auth.users(id, email, raw_user_meta_data)
        `)
        .single();

      if (error) throw error;

      console.log(`[bug-reports] Sent message on bug ${bugReportId}`);
      return data;
    } catch (error) {
      console.error('[bug-reports] Error sending message:', error);
      throw error;
    }
  }

  /**
   * Get bug report messages
   */
  static async getMessages(bugReportId: string): Promise<BugReportMessage[]> {
    try {
      const supabase = createClientSupabaseClient();

      const { data, error } = await supabase
        .from('bug_report_messages')
        .select(`
          id,
          message,
          created_at,
          user:auth.users(id, email, raw_user_meta_data)
        `)
        .eq('bug_report_id', bugReportId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('[bug-reports] Error fetching messages:', error);
      throw error;
    }
  }

  /**
   * Get bug report statistics
   */
  static async getBugStats(organizationId: string) {
    try {
      const supabase = createClientSupabaseClient();

      const { data: bugs, error } = await supabase
        .from('bug_reports')
        .select('status, priority, category, created_at')
        .eq('organization_id', organizationId);

      if (error) throw error;

      const stats = {
        total: bugs?.length || 0,
        by_status: {
          open: bugs?.filter(b => b.status === 'open').length || 0,
          in_progress: bugs?.filter(b => b.status === 'in_progress').length || 0,
          resolved: bugs?.filter(b => b.status === 'resolved').length || 0,
          closed: bugs?.filter(b => b.status === 'closed').length || 0
        },
        by_priority: {
          low: bugs?.filter(b => b.priority === 'low').length || 0,
          medium: bugs?.filter(b => b.priority === 'medium').length || 0,
          high: bugs?.filter(b => b.priority === 'high').length || 0,
          critical: bugs?.filter(b => b.priority === 'critical').length || 0
        },
        by_category: {
          ui: bugs?.filter(b => b.category === 'ui').length || 0,
          functionality: bugs?.filter(b => b.category === 'functionality').length || 0,
          performance: bugs?.filter(b => b.category === 'performance').length || 0,
          security: bugs?.filter(b => b.category === 'security').length || 0,
          other: bugs?.filter(b => b.category === 'other').length || 0
        },
        recent_count: bugs?.filter(b => {
          const weekAgo = new Date();
          weekAgo.setDate(weekAgo.getDate() - 7);
          return new Date(b.created_at) > weekAgo;
        }).length || 0
      };

      return stats;
    } catch (error) {
      console.error('[bug-reports] Error fetching bug stats:', error);
      throw error;
    }
  }

  /**
   * Bulk update bug status
   */
  static async bulkUpdateStatus(
    bugIds: string[],
    status: string
  ): Promise<void> {
    try {
      const supabase = createClientSupabaseClient();

      const updateData: any = {
        status,
        updated_at: new Date().toISOString()
      };

      if (status === 'resolved' || status === 'closed') {
        updateData.is_resolved = true;
        updateData.resolved_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('bug_reports')
        .update(updateData)
        .in('id', bugIds);

      if (error) throw error;

      console.log(`[bug-reports] Bulk updated ${bugIds.length} bugs to ${status}`);
    } catch (error) {
      console.error('[bug-reports] Error bulk updating status:', error);
      throw error;
    }
  }

  /**
   * Delete bug report
   */
  static async deleteBugReport(id: string): Promise<void> {
    try {
      const supabase = createClientSupabaseClient();

      const { error } = await supabase
        .from('bug_reports')
        .delete()
        .eq('id', id);

      if (error) throw error;

      console.log(`[bug-reports] Deleted bug report: ${id}`);
    } catch (error) {
      console.error('[bug-reports] Error deleting bug report:', error);
      throw error;
    }
  }
}
```

**Testing Checklist:**
- [ ] Test fetching bugs with various filters
- [ ] Test bug detail view with messages
- [ ] Test status updates
- [ ] Test priority updates
- [ ] Test assignment
- [ ] Test sending messages
- [ ] Test bulk operations
- [ ] Test statistics calculation

---

### Layer 3: Hooks Layer (60-75 minutes)

#### 1. `apps/platform/hooks/bug-reports/use-bug-reports.ts`

```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import { BugReportService } from '@/lib/services/bug-reports/bug-report-service';
import type { BugReport, BugReportFilters } from '@your-org/shared/types/bug-reports';
import { useOrganizationContext } from '@/contexts/organization-context';

export function useBugReports(initialFilters: BugReportFilters = {}) {
  const { currentOrganization } = useOrganizationContext();
  const [bugs, setBugs] = useState<BugReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<BugReportFilters>(initialFilters);
  const pageSize = 20;

  const fetchBugs = useCallback(async () => {
    if (!currentOrganization) {
      setBugs([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const effectiveFilters = {
        ...filters,
        organization_id: currentOrganization.id
      };

      const response = await BugReportService.getBugReports(
        effectiveFilters,
        page,
        pageSize
      );

      setBugs(response.data);
      setTotal(response.total);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch bugs';
      setError(message);
      console.error('[hooks/bug-reports] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [currentOrganization, filters, page]);

  useEffect(() => {
    fetchBugs();
  }, [fetchBugs]);

  return {
    bugs,
    loading,
    error,
    total,
    page,
    setPage,
    pageSize,
    filters,
    setFilters,
    refetch: fetchBugs
  };
}
```

#### 2. `apps/platform/hooks/bug-reports/use-bug-report.ts`

```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import { BugReportService } from '@/lib/services/bug-reports/bug-report-service';
import type { BugReport } from '@your-org/shared/types/bug-reports';

export function useBugReport(id: string) {
  const [bug, setBug] = useState<BugReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBug = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const data = await BugReportService.getBugReportById(id);
      setBug(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch bug';
      setError(message);
      console.error('[hooks/bug-report] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchBug();
  }, [fetchBug]);

  return {
    bug,
    loading,
    error,
    refetch: fetchBug
  };
}
```

#### 3. `apps/platform/hooks/bug-reports/use-update-bug-status.ts`

```typescript
'use client';

import { useState } from 'react';
import { BugReportService } from '@/lib/services/bug-reports/bug-report-service';
import { useToast } from '@/hooks/use-toast';

export function useUpdateBugStatus() {
  const [updating, setUpdating] = useState(false);
  const { toast } = useToast();

  const updateStatus = async (bugId: string, status: string) => {
    try {
      setUpdating(true);

      const updated = await BugReportService.updateBugStatus(bugId, status);

      toast({
        title: 'Status Updated',
        description: `Bug status changed to ${status}`,
      });

      return updated;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update status';

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
    updateStatus,
    updating
  };
}
```

#### 4. `apps/platform/hooks/bug-reports/use-send-message.ts`

```typescript
'use client';

import { useState } from 'react';
import { BugReportService } from '@/lib/services/bug-reports/bug-report-service';
import { useToast } from '@/hooks/use-toast';

export function useSendMessage() {
  const [sending, setSending] = useState(false);
  const { toast } = useToast();

  const sendMessage = async (bugReportId: string, message: string) => {
    try {
      setSending(true);

      const newMessage = await BugReportService.sendMessage(bugReportId, message);

      return newMessage;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send message';

      toast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      });

      throw err;
    } finally {
      setSending(false);
    }
  };

  return {
    sendMessage,
    sending
  };
}
```

#### 5. `apps/platform/hooks/bug-reports/use-bug-stats.ts`

```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import { BugReportService } from '@/lib/services/bug-reports/bug-report-service';
import { useOrganizationContext } from '@/contexts/organization-context';

export function useBugStats() {
  const { currentOrganization } = useOrganizationContext();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    if (!currentOrganization) {
      setStats(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const data = await BugReportService.getBugStats(currentOrganization.id);
      setStats(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch stats';
      setError(message);
      console.error('[hooks/bug-stats] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [currentOrganization]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return {
    stats,
    loading,
    error,
    refetch: fetchStats
  };
}
```

**Testing Checklist:**
- [ ] Test bug list hook with filters
- [ ] Test single bug hook
- [ ] Test status update hook
- [ ] Test message sending hook
- [ ] Test statistics hook
- [ ] Verify all hooks update on organization change

---

### Layer 4: Components Layer (120-150 minutes)

Due to the length, I'll provide key components. Full component code would be adapted from the existing MyJKKN bug report components.

#### Key Components to Create:

1. **`bug-filters.tsx`** - Advanced filtering UI
   - Status, category, priority filters
   - Application selector
   - Search input
   - Date range picker
   - Assigned user filter

2. **`bug-card.tsx`** - Bug list item card
   - Title, description preview
   - Status badge, priority indicator
   - Category icon
   - Application name
   - Reporter info
   - Created date

3. **`bug-status-badge.tsx`** - Status display with colors

```typescript
'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const statusConfig = {
  open: { label: 'Open', variant: 'destructive' as const },
  in_progress: { label: 'In Progress', variant: 'default' as const },
  resolved: { label: 'Resolved', variant: 'secondary' as const },
  closed: { label: 'Closed', variant: 'outline' as const }
};

interface BugStatusBadgeProps {
  status: string;
  className?: string;
}

export function BugStatusBadge({ status, className }: BugStatusBadgeProps) {
  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.open;

  return (
    <Badge variant={config.variant} className={cn('capitalize', className)}>
      {config.label}
    </Badge>
  );
}
```

4. **`bug-priority-select.tsx`** - Priority selector dropdown

```typescript
'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AlertCircle, ArrowUp, ArrowDown, Minus } from 'lucide-react';

const priorityConfig = {
  low: { label: 'Low', icon: ArrowDown, color: 'text-blue-600' },
  medium: { label: 'Medium', icon: Minus, color: 'text-yellow-600' },
  high: { label: 'High', icon: ArrowUp, color: 'text-orange-600' },
  critical: { label: 'Critical', icon: AlertCircle, color: 'text-red-600' }
};

interface BugPrioritySelectProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function BugPrioritySelect({ value, onChange, disabled }: BugPrioritySelectProps) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="w-[150px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(priorityConfig).map(([key, config]) => (
          <SelectItem key={key} value={key}>
            <div className="flex items-center gap-2">
              <config.icon className={`h-4 w-4 ${config.color}`} />
              {config.label}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

5. **`bug-messages.tsx`** - Message thread display
   - Adapt from MyJKKN's existing bug message component
   - Real-time message updates
   - User avatars
   - Timestamp formatting

6. **`bug-message-form.tsx`** - Send message form
   - Textarea input
   - Character count
   - Submit button with loading state

7. **`bug-screenshot-viewer.tsx`** - Screenshot lightbox
   - Image viewer with zoom
   - Download button
   - Fullscreen mode

8. **`bug-system-info.tsx`** - System information display
   - Browser details
   - OS information
   - Screen resolution
   - Console logs viewer

9. **`bug-stats-cards.tsx`** - Dashboard statistics cards

```typescript
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Bug, Clock, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';

interface BugStatsCardsProps {
  stats: any;
  loading?: boolean;
}

export function BugStatsCards({ stats, loading }: BugStatsCardsProps) {
  if (loading) return <div>Loading stats...</div>;
  if (!stats) return null;

  const cards = [
    {
      title: 'Total Bugs',
      value: stats.total,
      icon: Bug,
      color: 'text-blue-600'
    },
    {
      title: 'Open',
      value: stats.by_status.open,
      icon: XCircle,
      color: 'text-red-600'
    },
    {
      title: 'In Progress',
      value: stats.by_status.in_progress,
      icon: Clock,
      color: 'text-yellow-600'
    },
    {
      title: 'Resolved',
      value: stats.by_status.resolved,
      icon: CheckCircle2,
      color: 'text-green-600'
    },
    {
      title: 'Critical',
      value: stats.by_priority.critical,
      icon: AlertTriangle,
      color: 'text-red-600'
    }
  ];

  return (
    <div className="grid gap-4 md:grid-cols-5">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
            <card.icon className={`h-4 w-4 ${card.color}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{card.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

10. **`bulk-actions.tsx`** - Bulk operations toolbar
    - Select all checkbox
    - Bulk status update
    - Bulk assignment
    - Bulk delete with confirmation

**Reuse from MyJKKN:**
- Adapt `app/(routes)/admin/bug-reports/page.tsx` components
- Adapt `app/(routes)/my-bug-reports/[id]/page.tsx` message components
- Adapt `components/bug-reporter/` UI components

**Testing Checklist:**
- [ ] Test all filter combinations
- [ ] Test bug card displays correctly
- [ ] Test status badge colors
- [ ] Test priority selector
- [ ] Test message thread
- [ ] Test screenshot viewer
- [ ] Test system info display
- [ ] Test stats cards
- [ ] Test bulk actions
- [ ] Verify mobile responsiveness

---

### Layer 5: Pages Layer (75-90 minutes)

#### 1. `apps/platform/app/(dashboard)/bugs/page.tsx` - Bug List Page

```typescript
import { Metadata } from 'next';
import Link from 'next/link';
import { ContentLayout } from '@/components/admin-panel/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { BugsClient } from './_components/bugs-client';

export const metadata: Metadata = {
  title: 'Bug Reports | Bug Reporter',
  description: 'View and manage bug reports from your applications',
};

export default function BugsPage() {
  return (
    <ContentLayout title="Bug Reports">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Bug Reports</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6">
        <BugsClient />
      </div>
    </ContentLayout>
  );
}
```

#### 2. `apps/platform/app/(dashboard)/bugs/_components/bugs-client.tsx`

```typescript
'use client';

import { useBugReports } from '@/hooks/bug-reports/use-bug-reports';
import { BugFilters } from './bug-filters';
import { BugList } from './bug-list';
import { BulkActions } from './bulk-actions';
import { Pagination } from '@/components/ui/pagination';
import { useState } from 'react';

export function BugsClient() {
  const { bugs, loading, filters, setFilters, page, setPage, total, pageSize, refetch } = useBugReports();
  const [selectedBugs, setSelectedBugs] = useState<string[]>([]);

  return (
    <div className="space-y-4">
      <BugFilters filters={filters} onFiltersChange={setFilters} />

      {selectedBugs.length > 0 && (
        <BulkActions
          selectedIds={selectedBugs}
          onSuccess={() => {
            setSelectedBugs([]);
            refetch();
          }}
        />
      )}

      <BugList
        bugs={bugs}
        loading={loading}
        selectedIds={selectedBugs}
        onSelectionChange={setSelectedBugs}
      />

      {total > pageSize && (
        <Pagination
          currentPage={page}
          totalPages={Math.ceil(total / pageSize)}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
```

#### 3. `apps/platform/app/(dashboard)/bugs/[id]/page.tsx` - Bug Detail Page

```typescript
'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ContentLayout } from '@/components/admin-panel/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { useBugReport } from '@/hooks/bug-reports/use-bug-report';
import { BugDetailView } from '../_components/bug-detail-view';
import { Skeleton } from '@/components/ui/skeleton';

export default function BugDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { bug, loading, refetch } = useBugReport(id);

  if (loading) {
    return (
      <ContentLayout title="Bug Report">
        <Skeleton className="h-96 w-full" />
      </ContentLayout>
    );
  }

  if (!bug) {
    return (
      <ContentLayout title="Bug Not Found">
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">Bug report not found</p>
          <Button asChild variant="outline">
            <Link href="/bugs">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Bugs
            </Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={`Bug #${bug.id.substring(0, 8)}`}>
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
              <Link href="/bugs">Bug Reports</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>#{bug.id.substring(0, 8)}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6">
        <BugDetailView bug={bug} onUpdate={refetch} />
      </div>
    </ContentLayout>
  );
}
```

#### 4. `apps/platform/app/(dashboard)/bugs/dashboard/page.tsx` - Bug Dashboard

```typescript
import { Metadata } from 'next';
import Link from 'next/link';
import { ContentLayout } from '@/components/admin-panel/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { BugDashboardClient } from './_components/bug-dashboard-client';

export const metadata: Metadata = {
  title: 'Bug Dashboard | Bug Reporter',
  description: 'Overview of bug reports and statistics',
};

export default function BugDashboardPage() {
  return (
    <ContentLayout title="Bug Dashboard">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Bug Dashboard</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6">
        <BugDashboardClient />
      </div>
    </ContentLayout>
  );
}
```

**Testing Checklist:**
- [ ] Test bug list page with filters
- [ ] Test pagination
- [ ] Test bug detail page
- [ ] Test navigation between pages
- [ ] Test dashboard statistics
- [ ] Verify all breadcrumbs work
- [ ] Test mobile responsiveness

---

### Layer 6: Permissions & Navigation (20-30 minutes)

#### Update Navigation Menu

```typescript
// In navigation/menu config
{
  groupLabel: 'Bug Reports',
  menus: [
    {
      href: '/bugs/dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      permission: 'bugs.view'
    },
    {
      href: '/bugs',
      label: 'All Bugs',
      icon: Bug,
      permission: 'bugs.view'
    }
  ]
}
```

#### Define Permissions

```typescript
export const PERMISSIONS = {
  bugs: {
    view: ['owner', 'admin', 'developer'],
    update: ['owner', 'admin', 'developer'],
    assign: ['owner', 'admin'],
    delete: ['owner', 'admin']
  }
};
```

**Testing Checklist:**
- [ ] Test menu appears for all roles
- [ ] Test update permissions
- [ ] Test assignment permissions
- [ ] Test delete permissions

---

## ✅ Completion Checklist

### Functionality
- [ ] Can view bug list with filters
- [ ] Can view bug details
- [ ] Can update bug status
- [ ] Can update priority
- [ ] Can assign bugs
- [ ] Can send messages
- [ ] Can view screenshots
- [ ] Can view system info
- [ ] Can perform bulk actions
- [ ] Dashboard displays statistics

### Technical
- [ ] Multi-organization filtering works
- [ ] Multi-application filtering works
- [ ] Real-time updates (optional)
- [ ] RLS policies verified
- [ ] All hooks manage state correctly
- [ ] Mobile responsive
- [ ] Search and filters perform well

### Integration
- [ ] Organization context integrated
- [ ] Application context integrated
- [ ] Navigation works
- [ ] Permissions enforced
- [ ] Adapted MyJKKN components properly

---

## 🔧 Dependencies

**Required:**
1. ✅ Organizations Module
2. ✅ Applications Module
3. ✅ Database schema (Phase 2)
4. ✅ Shared types package

**Can Develop in Parallel:**
- Team Management Module (for assignment)
- Messaging Module (enhance messaging features)

---

## 📝 Notes

### Adaptation from MyJKKN

Reuse these existing files with modifications:
- `app/(routes)/admin/bug-reports/page.tsx` → Add org/app filters
- `app/(routes)/my-bug-reports/[id]/page.tsx` → Messaging UI
- `components/bug-reporter/` → Reference for UI patterns

### Performance Considerations

- Implement pagination (20 items per page)
- Index on organization_id, application_id, status
- Cache statistics queries
- Lazy load screenshots

---

**Total Estimated Time:** 6-8 hours

**Status:** Ready for Implementation
**Next Module:** Leaderboard Module or Team Management Module
