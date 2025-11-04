# Organizations Module - Implementation Plan

**Module:** Organizations (Centralized Bug Reporter Platform)
**Estimated Time:** 5-7 hours
**Dependencies:** Supabase setup, Shared types package
**Priority:** CRITICAL - All other modules depend on this

---

## Module Overview

The Organizations module is the foundation of the multi-tenant platform. It handles:
- Organization CRUD operations
- Organization settings (bug bounty configuration)
- Organization member management (covered in Team Management module)
- Organization context for all other modules

**Database Tables:**
- `organizations` - Organization data
- `organization_members` - User membership (used for permissions)

---

## Architecture: 5-Layer Implementation

### Layer 1: Types (20-30 min)
### Layer 2: Services (45-60 min)
### Layer 3: Hooks (30-45 min)
### Layer 4: Components (90-120 min)
### Layer 5: Pages (45-60 min)
### Layer 6: Permissions & Navigation (20-30 min)

---

## LAYER 1: Types Layer

**File:** `packages/shared/src/types/organizations.ts` (already created in Phase 1)

**Verification:**
- [x] Types already exist from Phase 1
- [ ] Validate all interfaces match database schema
- [ ] Ensure DTOs are properly structured

**Expected Interfaces:**
```typescript
- Organization
- OrganizationMember
- OrganizationRole
- CreateOrganizationPayload
- UpdateOrganizationPayload
- InviteMemberPayload (for Team Management module)
```

**Action:** No additional work needed - types created in Phase 1, Task 1.2

---

## LAYER 2: Service Layer (45-60 min)

**File:** `apps/platform/lib/services/organizations/organization-service.ts`

### Task 2.1: Create Organization Service

**Step 1: Create service file structure**

```bash
mkdir -p apps/platform/lib/services/organizations
touch apps/platform/lib/services/organizations/organization-service.ts
```

**Step 2: Implement OrganizationService class**

```typescript
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type {
  Organization,
  CreateOrganizationPayload,
  UpdateOrganizationPayload
} from '@bug-reporter/shared/types';

export class OrganizationService {
  /**
   * Get all organizations for current user
   * Uses client-side Supabase for browser context
   */
  static async getUserOrganizations(): Promise<Organization[]> {
    try {
      const supabase = createClientSupabaseClient();

      const {
        data: { user },
        error: authError
      } = await supabase.auth.getUser();

      if (authError || !user) {
        throw new Error('Not authenticated');
      }

      // Get organizations where user is a member
      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .in('id',
          supabase
            .from('organization_members')
            .select('organization_id')
            .eq('user_id', user.id)
        )
        .order('name');

      if (error) throw error;

      console.log('[organizations] Fetched user organizations:', data?.length);
      return data || [];
    } catch (error) {
      console.error('[organizations] Error fetching user organizations:', error);
      throw error;
    }
  }

  /**
   * Get organization by ID
   * Server-side method for API routes
   */
  static async getOrganizationById(id: string): Promise<Organization | null> {
    try {
      const supabase = await createServerSupabaseClient();

      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // Not found
          return null;
        }
        throw error;
      }

      console.log('[organizations] Fetched organization:', data.slug);
      return data;
    } catch (error) {
      console.error('[organizations] Error fetching organization by ID:', error);
      throw error;
    }
  }

  /**
   * Get organization by slug
   */
  static async getOrganizationBySlug(slug: string): Promise<Organization | null> {
    try {
      const supabase = await createServerSupabaseClient();

      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .eq('slug', slug)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        throw error;
      }

      console.log('[organizations] Fetched organization by slug:', slug);
      return data;
    } catch (error) {
      console.error('[organizations] Error fetching organization by slug:', error);
      throw error;
    }
  }

  /**
   * Create new organization
   * Auto-adds creator as owner via database trigger
   */
  static async createOrganization(
    payload: CreateOrganizationPayload
  ): Promise<Organization> {
    try {
      const supabase = createClientSupabaseClient();

      const {
        data: { user },
        error: authError
      } = await supabase.auth.getUser();

      if (authError || !user) {
        throw new Error('Not authenticated');
      }

      // Check if slug is available
      const { data: existing } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', payload.slug)
        .maybeSingle();

      if (existing) {
        throw new Error('Organization slug already exists');
      }

      const { data, error } = await supabase
        .from('organizations')
        .insert([
          {
            ...payload,
            owner_user_id: user.id
          }
        ])
        .select()
        .single();

      if (error) throw error;

      console.log('[organizations] Created organization:', data.slug);
      return data;
    } catch (error) {
      console.error('[organizations] Error creating organization:', error);
      throw error;
    }
  }

  /**
   * Update organization
   * Only owner can update
   */
  static async updateOrganization(
    payload: UpdateOrganizationPayload
  ): Promise<Organization> {
    try {
      const supabase = createClientSupabaseClient();

      const {
        data: { user },
        error: authError
      } = await supabase.auth.getUser();

      if (authError || !user) {
        throw new Error('Not authenticated');
      }

      // Verify user is owner
      const { data: org } = await supabase
        .from('organizations')
        .select('owner_user_id')
        .eq('id', payload.id)
        .single();

      if (!org || org.owner_user_id !== user.id) {
        throw new Error('Only organization owner can update');
      }

      // If updating slug, check availability
      if (payload.slug) {
        const { data: existing } = await supabase
          .from('organizations')
          .select('id')
          .eq('slug', payload.slug)
          .neq('id', payload.id)
          .maybeSingle();

        if (existing) {
          throw new Error('Organization slug already exists');
        }
      }

      const { id, ...updates } = payload;

      const { data, error } = await supabase
        .from('organizations')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      console.log('[organizations] Updated organization:', data.slug);
      return data;
    } catch (error) {
      console.error('[organizations] Error updating organization:', error);
      throw error;
    }
  }

  /**
   * Delete organization (soft delete by setting inactive)
   * Only owner can delete
   */
  static async deleteOrganization(id: string): Promise<void> {
    try {
      const supabase = createClientSupabaseClient();

      const {
        data: { user },
        error: authError
      } = await supabase.auth.getUser();

      if (authError || !user) {
        throw new Error('Not authenticated');
      }

      // Verify user is owner
      const { data: org } = await supabase
        .from('organizations')
        .select('owner_user_id')
        .eq('id', id)
        .single();

      if (!org || org.owner_user_id !== user.id) {
        throw new Error('Only organization owner can delete');
      }

      // Hard delete (cascade will remove members, apps, bugs, etc.)
      const { error } = await supabase.from('organizations').delete().eq('id', id);

      if (error) throw error;

      console.log('[organizations] Deleted organization:', id);
    } catch (error) {
      console.error('[organizations] Error deleting organization:', error);
      throw error;
    }
  }

  /**
   * Get user's role in organization
   */
  static async getUserRole(
    organizationId: string,
    userId: string
  ): Promise<string | null> {
    try {
      const supabase = await createServerSupabaseClient();

      const { data, error } = await supabase
        .from('organization_members')
        .select('role')
        .eq('organization_id', organizationId)
        .eq('user_id', userId)
        .maybeSingle();

      if (error) throw error;

      return data?.role || null;
    } catch (error) {
      console.error('[organizations] Error fetching user role:', error);
      return null;
    }
  }

  /**
   * Check if user is owner
   */
  static async isOwner(organizationId: string, userId: string): Promise<boolean> {
    try {
      const supabase = await createServerSupabaseClient();

      const { data } = await supabase
        .from('organizations')
        .select('owner_user_id')
        .eq('id', organizationId)
        .single();

      return data?.owner_user_id === userId;
    } catch (error) {
      console.error('[organizations] Error checking owner status:', error);
      return false;
    }
  }

  /**
   * Get organization statistics
   */
  static async getOrganizationStats(organizationId: string) {
    try {
      const supabase = await createServerSupabaseClient();

      // Get counts in parallel
      const [appsResult, bugsResult, membersResult] = await Promise.all([
        supabase
          .from('applications')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', organizationId),
        supabase
          .from('bug_reports')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', organizationId),
        supabase
          .from('organization_members')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', organizationId)
      ]);

      return {
        totalApps: appsResult.count || 0,
        totalBugs: bugsResult.count || 0,
        totalMembers: membersResult.count || 0
      };
    } catch (error) {
      console.error('[organizations] Error fetching stats:', error);
      return {
        totalApps: 0,
        totalBugs: 0,
        totalMembers: 0
      };
    }
  }
}
```

**Step 3: Test service methods**

Create test file (optional but recommended):
```bash
touch apps/platform/lib/services/organizations/__tests__/organization-service.test.ts
```

**Step 4: Commit service layer**

```bash
git add apps/platform/lib/services/organizations
git commit -m "feat(organizations): add organization service layer"
```

---

## LAYER 3: Hooks Layer (30-45 min)

**File:** `apps/platform/hooks/organizations/use-organizations.ts`

### Task 3.1: Create Organization Hooks

**Step 1: Create hooks directory and file**

```bash
mkdir -p apps/platform/hooks/organizations
touch apps/platform/hooks/organizations/use-organizations.ts
```

**Step 2: Implement useOrganizations hook**

```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { OrganizationService } from '@/lib/services/organizations/organization-service';
import type { Organization } from '@bug-reporter/shared/types';
import toast from 'react-hot-toast';

export function useOrganizations() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOrganizations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const data = await OrganizationService.getUserOrganizations();
      setOrganizations(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch organizations';
      setError(message);
      console.error('[hooks/organizations] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrganizations();
  }, [fetchOrganizations]);

  return {
    organizations,
    loading,
    error,
    refetch: fetchOrganizations
  };
}

export function useOrganization(slug: string) {
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchOrganization() {
      try {
        setLoading(true);
        setError(null);

        const data = await OrganizationService.getOrganizationBySlug(slug);
        if (!data) {
          setError('Organization not found');
        } else {
          setOrganization(data);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch organization';
        setError(message);
        console.error('[hooks/organizations] Fetch error:', err);
      } finally {
        setLoading(false);
      }
    }

    if (slug) {
      fetchOrganization();
    }
  }, [slug]);

  return {
    organization,
    loading,
    error
  };
}

export function useCreateOrganization() {
  const [creating, setCreating] = useState(false);
  const router = useRouter();

  const createOrganization = useCallback(
    async (payload: CreateOrganizationPayload) => {
      try {
        setCreating(true);

        const newOrg = await OrganizationService.createOrganization(payload);

        toast.success('Organization created successfully!');

        // Redirect to new organization dashboard
        router.push(`/org/${newOrg.slug}`);

        return newOrg;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create organization';
        toast.error(message);
        console.error('[hooks/organizations] Create error:', err);
        throw err;
      } finally {
        setCreating(false);
      }
    },
    [router]
  );

  return {
    createOrganization,
    creating
  };
}

export function useUpdateOrganization() {
  const [updating, setUpdating] = useState(false);

  const updateOrganization = useCallback(
    async (payload: UpdateOrganizationPayload) => {
      try {
        setUpdating(true);

        const updated = await OrganizationService.updateOrganization(payload);

        toast.success('Organization updated successfully!');

        return updated;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update organization';
        toast.error(message);
        console.error('[hooks/organizations] Update error:', err);
        throw err;
      } finally {
        setUpdating(false);
      }
    },
    []
  );

  return {
    updateOrganization,
    updating
  };
}

export function useDeleteOrganization() {
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  const deleteOrganization = useCallback(
    async (id: string) => {
      try {
        setDeleting(true);

        await OrganizationService.deleteOrganization(id);

        toast.success('Organization deleted successfully');

        // Redirect to home or organization list
        router.push('/');

        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to delete organization';
        toast.error(message);
        console.error('[hooks/organizations] Delete error:', err);
        throw err;
      } finally {
        setDeleting(false);
      }
    },
    [router]
  );

  return {
    deleteOrganization,
    deleting
  };
}
```

**Step 3: Create organization context hook**

```bash
touch apps/platform/hooks/organizations/use-organization-context.ts
```

```typescript
'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { Organization } from '@bug-reporter/shared/types';
import { useOrganization } from './use-organizations';

interface OrganizationContextValue {
  organization: Organization | null;
  loading: boolean;
  error: string | null;
}

const OrganizationContext = createContext<OrganizationContextValue | null>(null);

export function OrganizationProvider({
  children,
  slug
}: {
  children: ReactNode;
  slug: string;
}) {
  const { organization, loading, error } = useOrganization(slug);

  return (
    <OrganizationContext.Provider value={{ organization, loading, error }}>
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganizationContext() {
  const context = useContext(OrganizationContext);

  if (!context) {
    throw new Error('useOrganizationContext must be used within OrganizationProvider');
  }

  return context;
}
```

**Step 4: Commit hooks layer**

```bash
git add apps/platform/hooks/organizations
git commit -m "feat(organizations): add organization hooks layer"
```

---

## LAYER 4: Components Layer (90-120 min)

**Directory:** `apps/platform/app/(dashboard)/org/[slug]/_components/`

### Task 4.1: Create Organization Form Component

**Step 1: Create components directory**

```bash
mkdir -p "apps/platform/app/(dashboard)/org/[slug]/_components"
```

**Step 2: Create organization-form.tsx**

```bash
touch "apps/platform/app/(dashboard)/org/[slug]/_components/organization-form.tsx"
```

```typescript
'use client';

import { useState } from 'react';
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
  FormMessage
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { Organization } from '@bug-reporter/shared/types';

const organizationSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  slug: z
    .string()
    .min(2, 'Slug must be at least 2 characters')
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers, and hyphens only'),
  settings: z.object({
    bug_bounty: z.object({
      enabled: z.boolean().optional(),
      weekly_prize: z.number().optional(),
      currency: z.string().optional(),
      internship_wins_required: z.number().optional()
    }).optional()
  }).optional()
});

type OrganizationFormValues = z.infer<typeof organizationSchema>;

interface OrganizationFormProps {
  organization?: Organization;
  onSubmit: (values: OrganizationFormValues) => Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
}

export function OrganizationForm({
  organization,
  onSubmit,
  onCancel,
  submitLabel = 'Create Organization'
}: OrganizationFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<OrganizationFormValues>({
    resolver: zodResolver(organizationSchema),
    defaultValues: {
      name: organization?.name || '',
      slug: organization?.slug || '',
      settings: {
        bug_bounty: {
          enabled: organization?.settings?.bug_bounty?.enabled || false,
          weekly_prize: organization?.settings?.bug_bounty?.weekly_prize || 500,
          currency: organization?.settings?.bug_bounty?.currency || 'INR',
          internship_wins_required: organization?.settings?.bug_bounty?.internship_wins_required || 3
        }
      }
    }
  });

  // Auto-generate slug from name
  const handleNameChange = (value: string) => {
    if (!organization) {
      // Only auto-generate for new organizations
      const slug = value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      form.setValue('slug', slug);
    }
  };

  const handleSubmit = async (values: OrganizationFormValues) => {
    setIsSubmitting(true);
    try {
      await onSubmit(values);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Organization Name *</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  placeholder="My Company"
                  onChange={(e) => {
                    field.onChange(e);
                    handleNameChange(e.target.value);
                  }}
                />
              </FormControl>
              <FormDescription>
                The display name for your organization
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="slug"
          render={({ field }) => (
            <FormItem>
              <FormLabel>URL Slug *</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  placeholder="my-company"
                  disabled={!!organization}
                />
              </FormControl>
              <FormDescription>
                {organization
                  ? 'URL slug cannot be changed after creation'
                  : 'Used in URLs (e.g., /org/my-company)'}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Bug Bounty Settings</h3>

          <FormField
            control={form.control}
            name="settings.bug_bounty.enabled"
            render={({ field }) => (
              <FormItem className="flex items-center space-x-2">
                <FormControl>
                  <input
                    type="checkbox"
                    checked={field.value}
                    onChange={field.onChange}
                    className="h-4 w-4"
                  />
                </FormControl>
                <FormLabel className="!mt-0">Enable Bug Bounty Program</FormLabel>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="settings.bug_bounty.weekly_prize"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Weekly Prize Amount</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    {...field}
                    onChange={(e) => field.onChange(parseFloat(e.target.value))}
                  />
                </FormControl>
                <FormDescription>
                  Prize for weekly top bug reporter
                </FormDescription>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="settings.bug_bounty.internship_wins_required"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Wins Required for Internship</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    {...field}
                    onChange={(e) => field.onChange(parseInt(e.target.value))}
                  />
                </FormControl>
                <FormDescription>
                  Number of weekly wins needed to qualify for internship
                </FormDescription>
              </FormItem>
            )}
          />
        </div>

        <div className="flex gap-2">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : submitLabel}
          </Button>
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
}
```

**Step 3: Create organization-stats card**

```bash
touch "apps/platform/app/(dashboard)/org/[slug]/_components/organization-stats.tsx"
```

```typescript
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Building, Bug, Users } from 'lucide-react';

interface OrganizationStatsProps {
  stats: {
    totalApps: number;
    totalBugs: number;
    totalMembers: number;
  };
}

export function OrganizationStats({ stats }: OrganizationStatsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Applications</CardTitle>
          <Building className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.totalApps}</div>
          <p className="text-xs text-muted-foreground">
            Registered applications
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Bug Reports</CardTitle>
          <Bug className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.totalBugs}</div>
          <p className="text-xs text-muted-foreground">
            Total reports submitted
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Team Members</CardTitle>
          <Users className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.totalMembers}</div>
          <p className="text-xs text-muted-foreground">
            Active team members
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
```

**Step 4: Create organization selector dropdown**

```bash
touch "apps/platform/app/(dashboard)/org/[slug]/_components/organization-selector.tsx"
```

```typescript
'use client';

import { useRouter } from 'next/navigation';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import { useState } from 'react';
import type { Organization } from '@bug-reporter/shared/types';

interface OrganizationSelectorProps {
  organizations: Organization[];
  currentOrg: Organization;
}

export function OrganizationSelector({
  organizations,
  currentOrg
}: OrganizationSelectorProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const handleSelect = (slug: string) => {
    setOpen(false);
    router.push(`/org/${slug}`);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-[200px] justify-between"
        >
          {currentOrg.name}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0">
        <Command>
          <CommandInput placeholder="Search organization..." />
          <CommandEmpty>No organization found.</CommandEmpty>
          <CommandGroup>
            {organizations.map((org) => (
              <CommandItem
                key={org.id}
                value={org.slug}
                onSelect={() => handleSelect(org.slug)}
              >
                <Check
                  className={`mr-2 h-4 w-4 ${
                    currentOrg.id === org.id ? 'opacity-100' : 'opacity-0'
                  }`}
                />
                {org.name}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup>
            <CommandItem
              onSelect={() => {
                setOpen(false);
                router.push('/org/new');
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Create Organization
            </CommandItem>
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
```

**Step 5: Commit components layer**

```bash
git add "apps/platform/app/(dashboard)/org"
git commit -m "feat(organizations): add organization components"
```

---

## LAYER 5: Pages Layer (45-60 min)

### Task 5.1: Create Organization Dashboard Page

**File:** `apps/platform/app/(dashboard)/org/[slug]/page.tsx`

```bash
mkdir -p "apps/platform/app/(dashboard)/org/[slug]"
touch "apps/platform/app/(dashboard)/org/[slug]/page.tsx"
```

```typescript
import { OrganizationService } from '@/lib/services/organizations/organization-service';
import { OrganizationStats } from './_components/organization-stats';
import { notFound } from 'next/navigation';

interface OrganizationPageProps {
  params: {
    slug: string;
  };
}

export default async function OrganizationPage({ params }: OrganizationPageProps) {
  const organization = await OrganizationService.getOrganizationBySlug(params.slug);

  if (!organization) {
    notFound();
  }

  const stats = await OrganizationService.getOrganizationStats(organization.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{organization.name}</h1>
        <p className="text-muted-foreground">
          Organization dashboard and overview
        </p>
      </div>

      <OrganizationStats stats={stats} />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button variant="outline" className="w-full" asChild>
              <Link href={`/org/${params.slug}/apps`}>
                Manage Applications
              </Link>
            </Button>
            <Button variant="outline" className="w-full" asChild>
              <Link href={`/org/${params.slug}/bugs`}>
                View Bug Reports
              </Link>
            </Button>
            <Button variant="outline" className="w-full" asChild>
              <Link href={`/org/${params.slug}/team`}>
                Manage Team
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Organization Info</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-2">
              <div>
                <dt className="text-sm font-medium text-muted-foreground">
                  Slug
                </dt>
                <dd className="text-sm">{organization.slug}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">
                  Created
                </dt>
                <dd className="text-sm">
                  {new Date(organization.created_at).toLocaleDateString()}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">
                  Bug Bounty
                </dt>
                <dd className="text-sm">
                  {organization.settings?.bug_bounty?.enabled
                    ? 'Enabled'
                    : 'Disabled'}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

### Task 5.2: Create New Organization Page

**File:** `apps/platform/app/(dashboard)/org/new/page.tsx`

```bash
mkdir -p "apps/platform/app/(dashboard)/org/new"
touch "apps/platform/app/(dashboard)/org/new/page.tsx"
```

```typescript
'use client';

import { OrganizationForm } from '../[slug]/_components/organization-form';
import { useCreateOrganization } from '@/hooks/organizations/use-organizations';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function NewOrganizationPage() {
  const { createOrganization, creating } = useCreateOrganization();

  return (
    <div className="max-w-2xl mx-auto py-8">
      <Card>
        <CardHeader>
          <CardTitle>Create New Organization</CardTitle>
        </CardHeader>
        <CardContent>
          <OrganizationForm
            onSubmit={createOrganization}
            submitLabel={creating ? 'Creating...' : 'Create Organization'}
          />
        </CardContent>
      </Card>
    </div>
  );
}
```

### Task 5.3: Create Settings Page

**File:** `apps/platform/app/(dashboard)/org/[slug]/settings/page.tsx`

```bash
mkdir -p "apps/platform/app/(dashboard)/org/[slug]/settings"
touch "apps/platform/app/(dashboard)/org/[slug]/settings/page.tsx"
```

```typescript
import { OrganizationService } from '@/lib/services/organizations/organization-service';
import { OrganizationForm } from '../_components/organization-form';
import { notFound } from 'next/navigation';

interface SettingsPageProps {
  params: {
    slug: string;
  };
}

export default async function SettingsPage({ params }: SettingsPageProps) {
  const organization = await OrganizationService.getOrganizationBySlug(params.slug);

  if (!organization) {
    notFound();
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Organization Settings</h1>
        <p className="text-muted-foreground">
          Manage your organization configuration
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <OrganizationForm
            organization={organization}
            onSubmit={async (values) => {
              'use server';
              await OrganizationService.updateOrganization({
                id: organization.id,
                ...values
              });
            }}
            submitLabel="Save Changes"
          />
        </CardContent>
      </Card>
    </div>
  );
}
```

**Commit pages layer:**

```bash
git add apps/platform/app/(dashboard)/org
git commit -m "feat(organizations): add organization pages"
```

---

## LAYER 6: Permissions & Navigation (20-30 min)

### Task 6.1: Add Navigation Menu

**File:** `apps/platform/lib/sidebarMenuLink.ts` (create if doesn't exist)

Add organization menu items:

```typescript
{
  groupLabel: 'Organization',
  menus: [
    {
      label: 'Dashboard',
      href: '/org/[slug]',
      icon: 'LayoutDashboard'
    },
    {
      label: 'Applications',
      href: '/org/[slug]/apps',
      icon: 'Building'
    },
    {
      label: 'Bug Reports',
      href: '/org/[slug]/bugs',
      icon: 'Bug'
    },
    {
      label: 'Leaderboard',
      href: '/org/[slug]/leaderboard',
      icon: 'Trophy'
    },
    {
      label: 'Team',
      href: '/org/[slug]/team',
      icon: 'Users'
    },
    {
      label: 'Settings',
      href: '/org/[slug]/settings',
      icon: 'Settings'
    }
  ]
}
```

### Task 6.2: Add Organization Layout

**File:** `apps/platform/app/(dashboard)/org/[slug]/layout.tsx`

```typescript
import { OrganizationProvider } from '@/hooks/organizations/use-organization-context';
import { OrganizationSelector } from './_components/organization-selector';
import { OrganizationService } from '@/lib/services/organizations/organization-service';

interface OrganizationLayoutProps {
  children: React.ReactNode;
  params: {
    slug: string;
  };
}

export default async function OrganizationLayout({
  children,
  params
}: OrganizationLayoutProps) {
  const organizations = await OrganizationService.getUserOrganizations();
  const currentOrg = await OrganizationService.getOrganizationBySlug(params.slug);

  if (!currentOrg) {
    notFound();
  }

  return (
    <OrganizationProvider slug={params.slug}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <OrganizationSelector
            organizations={organizations}
            currentOrg={currentOrg}
          />
        </div>
        {children}
      </div>
    </OrganizationProvider>
  );
}
```

**Commit navigation and permissions:**

```bash
git add apps/platform/lib/sidebarMenuLink.ts apps/platform/app/(dashboard)/org/[slug]/layout.tsx
git commit -m "feat(organizations): add navigation and layout"
```

---

## Testing Checklist

- [ ] Can create new organization
- [ ] Organization slug validates correctly
- [ ] Bug bounty settings save properly
- [ ] Organization stats display correctly
- [ ] Can switch between organizations
- [ ] Settings page loads and saves
- [ ] Organization dashboard displays
- [ ] Navigation menu works
- [ ] RLS policies prevent unauthorized access
- [ ] Only owner can update/delete organization

---

## Completion Criteria

✅ Organizations Module Complete when:

1. All 6 layers implemented
2. CRUD operations working
3. Organization context available
4. Navigation integrated
5. All tests passing
6. No TypeScript errors
7. RLS policies tested

---

## Next Module

After Organizations Module completion, proceed to:
**Applications Module** - `docs/plans/modules/2025-01-16-applications-module.md`

This module depends on Organizations and enables:
- Application registration
- API key generation
- Application management
