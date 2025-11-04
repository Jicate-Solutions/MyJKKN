# Applications Module - Implementation Plan

**Created:** 2025-01-16
**Module:** Applications
**Estimated Time:** 4-6 hours
**Dependencies:** Organizations Module (MUST be completed first)
**Tech Stack:** Next.js 15, Supabase, TypeScript, React Query, Tailwind CSS

---

## 📋 Overview

The Applications Module enables organization members to register individual applications that will use the bug reporting SDK. Each application gets a unique API key for authentication and can be configured with allowed domains for CORS security.

### Key Features

1. **Application Registration**: Register new applications under an organization
2. **API Key Management**: Generate, regenerate, and revoke API keys
3. **Domain Whitelisting**: Configure allowed domains for CORS
4. **Application Settings**: Update application metadata and status
5. **Application Statistics**: View bug counts and SDK usage stats

---

## 🗄️ Database Schema Reference

The database schema was already created in Phase 2 of the main implementation plan. Here's the relevant table for reference:

```sql
-- applications table (already created)
CREATE TABLE applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  api_key TEXT NOT NULL UNIQUE,
  allowed_domains TEXT[], -- Array of allowed domains for CORS
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);
```

**RLS Policies** (already created):
- Users can only view applications for organizations they're members of
- Only organization owners and admins can create/update/delete applications

---

## 🏗️ Architecture - 5 Layers

This module follows the standard 5-layer architecture:

1. **Types Layer** → TypeScript interfaces (already in shared package)
2. **Services Layer** → Application CRUD operations
3. **Hooks Layer** → React Query hooks for data fetching
4. **Components Layer** → Application forms, API key display, data tables
5. **Pages Layer** → List, create, edit, settings pages
6. **Permissions & Navigation** → Access control and menu setup

---

## 📁 File Structure

```
bug-reporter-platform/
├── packages/
│   └── shared/
│       └── types/
│           └── applications.ts          # ✅ Already exists (Phase 2)
│
└── apps/
    └── platform/
        ├── lib/
        │   └── services/
        │       └── applications/
        │           └── application-service.ts    # Layer 2: Service
        │
        ├── hooks/
        │   └── applications/
        │       ├── use-applications.ts          # Layer 3: Hooks
        │       ├── use-create-application.ts
        │       ├── use-update-application.ts
        │       └── use-regenerate-api-key.ts
        │
        └── app/
            └── (dashboard)/
                └── applications/
                    ├── page.tsx                 # Layer 5: List page
                    ├── new/
                    │   └── page.tsx            # Layer 5: Create page
                    ├── [id]/
                    │   ├── page.tsx            # Layer 5: Detail/Settings page
                    │   └── edit/
                    │       └── page.tsx        # Layer 5: Edit page
                    └── _components/            # Layer 4: Components
                        ├── application-form.tsx
                        ├── api-key-display.tsx
                        ├── allowed-domains-input.tsx
                        ├── application-stats.tsx
                        └── application-selector.tsx
```

---

## 🚀 Implementation Steps

### Layer 1: Types Layer ✅ **ALREADY COMPLETE**

The types are already defined in `packages/shared/types/applications.ts` from Phase 2.

**Verification Checklist:**
- [ ] Verify `Application` interface exists
- [ ] Verify `CreateApplicationPayload` exists
- [ ] Verify `UpdateApplicationPayload` exists
- [ ] Verify `ApplicationStats` interface exists

**No action needed** - Move to Layer 2.

---

### Layer 2: Services Layer (60-75 minutes)

Create `apps/platform/lib/services/applications/application-service.ts`:

```typescript
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  Application,
  CreateApplicationPayload,
  UpdateApplicationPayload
} from '@your-org/shared/types/applications';
import { generateApiKey } from '@/lib/utils/api-key-generator';

export class ApplicationService {
  /**
   * Get all applications for an organization
   */
  static async getApplicationsByOrganization(
    organizationId: string
  ): Promise<Application[]> {
    try {
      const supabase = createClientSupabaseClient();

      const { data, error } = await supabase
        .from('applications')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      console.log(`[applications] Fetched ${data?.length || 0} applications for org ${organizationId}`);
      return data || [];
    } catch (error) {
      console.error('[applications] Error fetching applications:', error);
      throw error;
    }
  }

  /**
   * Get application by ID
   */
  static async getApplicationById(id: string): Promise<Application | null> {
    try {
      const supabase = createClientSupabaseClient();

      const { data, error } = await supabase
        .from('applications')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          console.warn(`[applications] Application not found: ${id}`);
          return null;
        }
        throw error;
      }

      return data;
    } catch (error) {
      console.error('[applications] Error fetching application by ID:', error);
      throw error;
    }
  }

  /**
   * Create new application
   */
  static async createApplication(
    payload: CreateApplicationPayload
  ): Promise<Application> {
    try {
      const supabase = createClientSupabaseClient();

      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('Not authenticated');

      // Generate unique API key
      const apiKey = generateApiKey();

      const { data, error } = await supabase
        .from('applications')
        .insert([{
          organization_id: payload.organization_id,
          name: payload.name,
          description: payload.description,
          api_key: apiKey,
          allowed_domains: payload.allowed_domains || [],
          is_active: true,
          created_by: user.id
        }])
        .select()
        .single();

      if (error) throw error;

      console.log(`[applications] Created application: ${data.name} (${data.id})`);
      return data;
    } catch (error) {
      console.error('[applications] Error creating application:', error);
      throw error;
    }
  }

  /**
   * Update application
   */
  static async updateApplication(
    payload: UpdateApplicationPayload
  ): Promise<Application> {
    try {
      const supabase = createClientSupabaseClient();

      const updateData: Partial<Application> = {
        updated_at: new Date().toISOString()
      };

      if (payload.name !== undefined) updateData.name = payload.name;
      if (payload.description !== undefined) updateData.description = payload.description;
      if (payload.allowed_domains !== undefined) updateData.allowed_domains = payload.allowed_domains;
      if (payload.is_active !== undefined) updateData.is_active = payload.is_active;

      const { data, error } = await supabase
        .from('applications')
        .update(updateData)
        .eq('id', payload.id)
        .select()
        .single();

      if (error) throw error;

      console.log(`[applications] Updated application: ${payload.id}`);
      return data;
    } catch (error) {
      console.error('[applications] Error updating application:', error);
      throw error;
    }
  }

  /**
   * Regenerate API key for application
   */
  static async regenerateApiKey(applicationId: string): Promise<Application> {
    try {
      const supabase = createClientSupabaseClient();

      // Generate new API key
      const newApiKey = generateApiKey();

      const { data, error } = await supabase
        .from('applications')
        .update({
          api_key: newApiKey,
          updated_at: new Date().toISOString()
        })
        .eq('id', applicationId)
        .select()
        .single();

      if (error) throw error;

      console.log(`[applications] Regenerated API key for: ${applicationId}`);
      return data;
    } catch (error) {
      console.error('[applications] Error regenerating API key:', error);
      throw error;
    }
  }

  /**
   * Delete application (soft delete)
   */
  static async deleteApplication(id: string): Promise<void> {
    try {
      const supabase = createClientSupabaseClient();

      const { error } = await supabase
        .from('applications')
        .update({ is_active: false })
        .eq('id', id);

      if (error) throw error;

      console.log(`[applications] Deleted (soft) application: ${id}`);
    } catch (error) {
      console.error('[applications] Error deleting application:', error);
      throw error;
    }
  }

  /**
   * Get application statistics
   */
  static async getApplicationStats(applicationId: string) {
    try {
      const supabase = createClientSupabaseClient();

      // Get bug counts by status
      const { data: bugs, error: bugsError } = await supabase
        .from('bug_reports')
        .select('status')
        .eq('application_id', applicationId);

      if (bugsError) throw bugsError;

      const stats = {
        total: bugs?.length || 0,
        open: bugs?.filter(b => b.status === 'open').length || 0,
        in_progress: bugs?.filter(b => b.status === 'in_progress').length || 0,
        resolved: bugs?.filter(b => b.status === 'resolved').length || 0,
        closed: bugs?.filter(b => b.status === 'closed').length || 0
      };

      return stats;
    } catch (error) {
      console.error('[applications] Error fetching application stats:', error);
      throw error;
    }
  }

  /**
   * Validate API key
   */
  static async validateApiKey(apiKey: string): Promise<Application | null> {
    try {
      const supabase = createClientSupabaseClient();

      const { data, error } = await supabase
        .from('applications')
        .select('*')
        .eq('api_key', apiKey)
        .eq('is_active', true)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null; // Invalid API key
        }
        throw error;
      }

      return data;
    } catch (error) {
      console.error('[applications] Error validating API key:', error);
      throw error;
    }
  }
}
```

**Helper Utility**: Create `apps/platform/lib/utils/api-key-generator.ts`:

```typescript
import { customAlphabet } from 'nanoid';

/**
 * Generate a secure API key with prefix
 * Format: app_live_<32-char-random-string>
 */
export function generateApiKey(): string {
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const nanoid = customAlphabet(alphabet, 32);

  return `app_live_${nanoid()}`;
}
```

**Testing Checklist:**
- [ ] Test creating application with API key generation
- [ ] Test fetching applications by organization
- [ ] Test updating application details
- [ ] Test regenerating API key
- [ ] Test soft delete functionality
- [ ] Test application stats calculation
- [ ] Test API key validation

---

### Layer 3: Hooks Layer (45-60 minutes)

#### 1. `apps/platform/hooks/applications/use-applications.ts`

```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import { ApplicationService } from '@/lib/services/applications/application-service';
import type { Application } from '@your-org/shared/types/applications';
import { useOrganizationContext } from '@/contexts/organization-context';

export function useApplications() {
  const { currentOrganization } = useOrganizationContext();
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchApplications = useCallback(async () => {
    if (!currentOrganization) {
      setApplications([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const data = await ApplicationService.getApplicationsByOrganization(
        currentOrganization.id
      );

      setApplications(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch applications';
      setError(message);
      console.error('[hooks/applications] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [currentOrganization]);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  return {
    applications,
    loading,
    error,
    refetch: fetchApplications
  };
}
```

#### 2. `apps/platform/hooks/applications/use-create-application.ts`

```typescript
'use client';

import { useState } from 'react';
import { ApplicationService } from '@/lib/services/applications/application-service';
import type { CreateApplicationPayload } from '@your-org/shared/types/applications';
import { useToast } from '@/hooks/use-toast';

export function useCreateApplication() {
  const [creating, setCreating] = useState(false);
  const { toast } = useToast();

  const createApplication = async (payload: CreateApplicationPayload) => {
    try {
      setCreating(true);

      const newApplication = await ApplicationService.createApplication(payload);

      toast({
        title: 'Success',
        description: `Application "${newApplication.name}" created successfully!`,
      });

      return newApplication;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create application';

      toast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      });

      throw err;
    } finally {
      setCreating(false);
    }
  };

  return {
    createApplication,
    creating
  };
}
```

#### 3. `apps/platform/hooks/applications/use-update-application.ts`

```typescript
'use client';

import { useState } from 'react';
import { ApplicationService } from '@/lib/services/applications/application-service';
import type { UpdateApplicationPayload } from '@your-org/shared/types/applications';
import { useToast } from '@/hooks/use-toast';

export function useUpdateApplication() {
  const [updating, setUpdating] = useState(false);
  const { toast } = useToast();

  const updateApplication = async (payload: UpdateApplicationPayload) => {
    try {
      setUpdating(true);

      const updated = await ApplicationService.updateApplication(payload);

      toast({
        title: 'Success',
        description: 'Application updated successfully',
      });

      return updated;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update application';

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
    updateApplication,
    updating
  };
}
```

#### 4. `apps/platform/hooks/applications/use-regenerate-api-key.ts`

```typescript
'use client';

import { useState } from 'react';
import { ApplicationService } from '@/lib/services/applications/application-service';
import { useToast } from '@/hooks/use-toast';

export function useRegenerateApiKey() {
  const [regenerating, setRegenerating] = useState(false);
  const { toast } = useToast();

  const regenerateApiKey = async (applicationId: string) => {
    try {
      setRegenerating(true);

      const updated = await ApplicationService.regenerateApiKey(applicationId);

      toast({
        title: 'API Key Regenerated',
        description: 'New API key generated successfully. Update your application immediately.',
        variant: 'default'
      });

      return updated;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to regenerate API key';

      toast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      });

      throw err;
    } finally {
      setRegenerating(false);
    }
  };

  return {
    regenerateApiKey,
    regenerating
  };
}
```

**Testing Checklist:**
- [ ] Test applications hook updates when organization changes
- [ ] Test create application hook with success/error states
- [ ] Test update application hook
- [ ] Test regenerate API key hook
- [ ] Verify toast notifications appear correctly

---

### Layer 4: Components Layer (90-120 minutes)

#### 1. `apps/platform/app/(dashboard)/applications/_components/application-form.tsx`

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
import { AllowedDomainsInput } from './allowed-domains-input';
import type { Application } from '@your-org/shared/types/applications';

const formSchema = z.object({
  name: z.string().min(3, 'Name must be at least 3 characters'),
  description: z.string().optional(),
  allowed_domains: z.array(z.string()).optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface ApplicationFormProps {
  initialData?: Application;
  onSubmit: (values: FormValues) => Promise<void>;
  onCancel?: () => void;
  isSubmitting?: boolean;
}

export function ApplicationForm({
  initialData,
  onSubmit,
  onCancel,
  isSubmitting = false
}: ApplicationFormProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: initialData?.name || '',
      description: initialData?.description || '',
      allowed_domains: initialData?.allowed_domains || [],
    }
  });

  const handleSubmit = async (values: FormValues) => {
    await onSubmit(values);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Application Name</FormLabel>
              <FormControl>
                <Input placeholder="My Awesome App" {...field} />
              </FormControl>
              <FormDescription>
                A descriptive name for your application
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="A brief description of your application..."
                  rows={4}
                  {...field}
                />
              </FormControl>
              <FormDescription>
                Optional description to help identify this application
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="allowed_domains"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Allowed Domains (CORS)</FormLabel>
              <FormControl>
                <AllowedDomainsInput
                  value={field.value || []}
                  onChange={field.onChange}
                />
              </FormControl>
              <FormDescription>
                Domains where your application is hosted (for CORS security)
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex gap-3 pt-4">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : initialData ? 'Update Application' : 'Create Application'}
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

#### 2. `apps/platform/app/(dashboard)/applications/_components/allowed-domains-input.tsx`

```typescript
'use client';

import { useState } from 'react';
import { X, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface AllowedDomainsInputProps {
  value: string[];
  onChange: (domains: string[]) => void;
}

export function AllowedDomainsInput({ value, onChange }: AllowedDomainsInputProps) {
  const [inputValue, setInputValue] = useState('');

  const addDomain = () => {
    const domain = inputValue.trim();

    if (!domain) return;

    // Validate domain format (basic validation)
    const domainRegex = /^(https?:\/\/)?([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(:\d+)?$/;
    if (!domainRegex.test(domain)) {
      alert('Please enter a valid domain (e.g., https://example.com)');
      return;
    }

    if (!value.includes(domain)) {
      onChange([...value, domain]);
      setInputValue('');
    }
  };

  const removeDomain = (domainToRemove: string) => {
    onChange(value.filter(d => d !== domainToRemove));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addDomain();
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="https://example.com"
          className="flex-1"
        />
        <Button type="button" onClick={addDomain} size="icon" variant="outline">
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map((domain) => (
            <Badge key={domain} variant="secondary" className="gap-1">
              {domain}
              <button
                type="button"
                onClick={() => removeDomain(domain)}
                className="ml-1 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
```

#### 3. `apps/platform/app/(dashboard)/applications/_components/api-key-display.tsx`

```typescript
'use client';

import { useState } from 'react';
import { Copy, Eye, EyeOff, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';

interface ApiKeyDisplayProps {
  apiKey: string;
  onRegenerate: () => Promise<void>;
  canRegenerate?: boolean;
}

export function ApiKeyDisplay({
  apiKey,
  onRegenerate,
  canRegenerate = true
}: ApiKeyDisplayProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const { toast } = useToast();

  const copyToClipboard = () => {
    navigator.clipboard.writeText(apiKey);
    toast({
      title: 'Copied!',
      description: 'API key copied to clipboard',
    });
  };

  const handleRegenerate = async () => {
    try {
      setIsRegenerating(true);
      await onRegenerate();
    } finally {
      setIsRegenerating(false);
    }
  };

  return (
    <div className="space-y-2">
      <Label>API Key</Label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            type={isVisible ? 'text' : 'password'}
            value={apiKey}
            readOnly
            className="pr-10 font-mono text-sm"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-0 top-0 h-full"
            onClick={() => setIsVisible(!isVisible)}
          >
            {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        </div>

        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={copyToClipboard}
        >
          <Copy className="h-4 w-4" />
        </Button>

        {canRegenerate && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={isRegenerating}
              >
                <RefreshCw className={`h-4 w-4 ${isRegenerating ? 'animate-spin' : ''}`} />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Regenerate API Key?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will invalidate the current API key immediately. Your application will stop working until you update it with the new key.
                  <br /><br />
                  Are you sure you want to continue?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleRegenerate}>
                  Regenerate Key
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        Keep this key secret. It allows SDK access to submit bug reports.
      </p>
    </div>
  );
}
```

#### 4. `apps/platform/app/(dashboard)/applications/_components/application-stats.tsx`

```typescript
'use client';

import { useEffect, useState } from 'react';
import { Bug, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ApplicationService } from '@/lib/services/applications/application-service';

interface ApplicationStatsProps {
  applicationId: string;
}

export function ApplicationStats({ applicationId }: ApplicationStatsProps) {
  const [stats, setStats] = useState({
    total: 0,
    open: 0,
    in_progress: 0,
    resolved: 0,
    closed: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        const data = await ApplicationService.getApplicationStats(applicationId);
        setStats(data);
      } catch (error) {
        console.error('Failed to fetch stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [applicationId]);

  const statCards = [
    { label: 'Total Bugs', value: stats.total, icon: Bug, color: 'text-blue-600' },
    { label: 'Open', value: stats.open, icon: XCircle, color: 'text-red-600' },
    { label: 'In Progress', value: stats.in_progress, icon: Clock, color: 'text-yellow-600' },
    { label: 'Resolved', value: stats.resolved, icon: CheckCircle2, color: 'text-green-600' },
  ];

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading statistics...</div>;
  }

  return (
    <div className="grid gap-4 md:grid-cols-4">
      {statCards.map((stat) => (
        <Card key={stat.label}>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">{stat.label}</CardTitle>
            <stat.icon className={`h-4 w-4 ${stat.color}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stat.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

#### 5. `apps/platform/app/(dashboard)/applications/_components/application-selector.tsx`

```typescript
'use client';

import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useState } from 'react';
import type { Application } from '@your-org/shared/types/applications';

interface ApplicationSelectorProps {
  applications: Application[];
  selectedId?: string;
  onSelect: (application: Application) => void;
}

export function ApplicationSelector({
  applications,
  selectedId,
  onSelect
}: ApplicationSelectorProps) {
  const [open, setOpen] = useState(false);

  const selectedApp = applications.find(app => app.id === selectedId);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-[300px] justify-between"
        >
          {selectedApp ? selectedApp.name : "Select application..."}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0">
        <Command>
          <CommandInput placeholder="Search applications..." />
          <CommandEmpty>No application found.</CommandEmpty>
          <CommandGroup>
            {applications.map((app) => (
              <CommandItem
                key={app.id}
                value={app.name}
                onSelect={() => {
                  onSelect(app);
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    "mr-2 h-4 w-4",
                    selectedId === app.id ? "opacity-100" : "opacity-0"
                  )}
                />
                {app.name}
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
```

**Testing Checklist:**
- [ ] Test application form validation
- [ ] Test allowed domains input (add/remove)
- [ ] Test API key display (show/hide/copy/regenerate)
- [ ] Test application stats display
- [ ] Test application selector dropdown
- [ ] Verify all components are mobile responsive

---

### Layer 5: Pages Layer (60-75 minutes)

#### 1. `apps/platform/app/(dashboard)/applications/page.tsx` - List Page

```typescript
import { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
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
import { ApplicationsClient } from './_components/applications-client';

export const metadata: Metadata = {
  title: 'Applications | Bug Reporter',
  description: 'Manage your registered applications',
};

export default function ApplicationsPage() {
  return (
    <ContentLayout title="Applications">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Applications</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Applications</h1>
            <p className="text-muted-foreground">
              Register and manage applications using the bug reporter SDK
            </p>
          </div>
          <Button asChild>
            <Link href="/applications/new">
              <Plus className="mr-2 h-4 w-4" />
              New Application
            </Link>
          </Button>
        </div>

        <ApplicationsClient />
      </div>
    </ContentLayout>
  );
}
```

#### 2. `apps/platform/app/(dashboard)/applications/_components/applications-client.tsx`

```typescript
'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Settings, ExternalLink } from 'lucide-react';
import Link from 'link';
import { useApplications } from '@/hooks/applications/use-applications';
import { Skeleton } from '@/components/ui/skeleton';

export function ApplicationsClient() {
  const { applications, loading, error } = useApplications();

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <Skeleton className="h-8 w-3/4 mb-2" />
              <Skeleton className="h-4 w-full mb-4" />
              <Skeleton className="h-10 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-destructive">Error: {error}</p>
        </CardContent>
      </Card>
    );
  }

  if (applications.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <p className="text-muted-foreground mb-4">
            No applications registered yet. Create your first application to get started.
          </p>
          <Button asChild>
            <Link href="/applications/new">Create Application</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {applications.map((app) => (
        <Card key={app.id}>
          <CardContent className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-semibold text-lg">{app.name}</h3>
                {app.description && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {app.description}
                  </p>
                )}
              </div>
              <Badge variant={app.is_active ? 'default' : 'secondary'}>
                {app.is_active ? 'Active' : 'Inactive'}
              </Badge>
            </div>

            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">
                API Key: {app.api_key.substring(0, 20)}...
              </div>
              {app.allowed_domains && app.allowed_domains.length > 0 && (
                <div className="text-xs text-muted-foreground">
                  {app.allowed_domains.length} domain(s) configured
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-4">
              <Button asChild size="sm" variant="outline" className="flex-1">
                <Link href={`/applications/${app.id}`}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  View
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline" className="flex-1">
                <Link href={`/applications/${app.id}/edit`}>
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

#### 3. `apps/platform/app/(dashboard)/applications/new/page.tsx` - Create Page

```typescript
'use client';

import { useRouter } from 'next/navigation';
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ApplicationForm } from '../_components/application-form';
import { useCreateApplication } from '@/hooks/applications/use-create-application';
import { useOrganizationContext } from '@/contexts/organization-context';

export default function NewApplicationPage() {
  const router = useRouter();
  const { createApplication, creating } = useCreateApplication();
  const { currentOrganization } = useOrganizationContext();

  if (!currentOrganization) {
    return (
      <ContentLayout title="New Application">
        <Card>
          <CardContent className="p-6">
            <p className="text-muted-foreground">
              Please select an organization first
            </p>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  const handleSubmit = async (values: any) => {
    const newApp = await createApplication({
      organization_id: currentOrganization.id,
      ...values
    });

    if (newApp) {
      router.push(`/applications/${newApp.id}`);
    }
  };

  return (
    <ContentLayout title="Create Application">
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
              <Link href="/applications">Applications</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>New</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Create New Application</CardTitle>
          <CardDescription>
            Register a new application to get an API key for the bug reporter SDK
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ApplicationForm
            onSubmit={handleSubmit}
            onCancel={() => router.back()}
            isSubmitting={creating}
          />
        </CardContent>
      </Card>
    </ContentLayout>
  );
}
```

#### 4. `apps/platform/app/(dashboard)/applications/[id]/page.tsx` - Detail/Settings Page

```typescript
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Settings, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ContentLayout } from '@/components/admin-panel/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { ApplicationService } from '@/lib/services/applications/application-service';
import { ApiKeyDisplay } from '../_components/api-key-display';
import { ApplicationStats } from '../_components/application-stats';
import { useRegenerateApiKey } from '@/hooks/applications/use-regenerate-api-key';
import type { Application } from '@your-org/shared/types/applications';
import { Skeleton } from '@/components/ui/skeleton';

export default function ApplicationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [application, setApplication] = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);
  const { regenerateApiKey } = useRegenerateApiKey();

  useEffect(() => {
    const fetchApplication = async () => {
      try {
        const data = await ApplicationService.getApplicationById(id);
        setApplication(data);
      } catch (error) {
        console.error('Failed to fetch application:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchApplication();
  }, [id]);

  const handleRegenerateKey = async () => {
    const updated = await regenerateApiKey(id);
    if (updated) {
      setApplication(updated);
    }
  };

  if (loading) {
    return (
      <ContentLayout title="Application Details">
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-8 w-1/2 mb-4" />
            <Skeleton className="h-4 w-full mb-2" />
            <Skeleton className="h-4 w-3/4" />
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  if (!application) {
    return (
      <ContentLayout title="Application Not Found">
        <Card>
          <CardContent className="p-6">
            <p className="text-muted-foreground mb-4">
              The application you're looking for doesn't exist or you don't have access to it.
            </p>
            <Button asChild variant="outline">
              <Link href="/applications">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Applications
              </Link>
            </Button>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={application.name}>
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
              <Link href="/applications">Applications</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{application.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold">{application.name}</h1>
              <Badge variant={application.is_active ? 'default' : 'secondary'}>
                {application.is_active ? 'Active' : 'Inactive'}
              </Badge>
            </div>
            {application.description && (
              <p className="text-muted-foreground mt-2">{application.description}</p>
            )}
          </div>
          <Button asChild variant="outline">
            <Link href={`/applications/${id}/edit`}>
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </Link>
          </Button>
        </div>

        <ApplicationStats applicationId={id} />

        <Card>
          <CardHeader>
            <CardTitle>API Configuration</CardTitle>
            <CardDescription>
              Use this API key to integrate the bug reporter SDK in your application
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ApiKeyDisplay
              apiKey={application.api_key}
              onRegenerate={handleRegenerateKey}
            />

            {application.allowed_domains && application.allowed_domains.length > 0 && (
              <div>
                <h4 className="font-medium mb-2">Allowed Domains</h4>
                <div className="flex flex-wrap gap-2">
                  {application.allowed_domains.map((domain) => (
                    <Badge key={domain} variant="outline">
                      {domain}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Integration Example</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm">
              <code>{`import { BugReporterProvider } from '@your-org/bug-reporter-sdk';

function App() {
  return (
    <BugReporterProvider apiKey="${application.api_key}">
      {/* Your app components */}
    </BugReporterProvider>
  );
}`}</code>
            </pre>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
```

#### 5. `apps/platform/app/(dashboard)/applications/[id]/edit/page.tsx` - Edit Page

```typescript
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ApplicationForm } from '../../_components/application-form';
import { ApplicationService } from '@/lib/services/applications/application-service';
import { useUpdateApplication } from '@/hooks/applications/use-update-application';
import type { Application } from '@your-org/shared/types/applications';
import { Skeleton } from '@/components/ui/skeleton';

export default function EditApplicationPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [application, setApplication] = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);
  const { updateApplication, updating } = useUpdateApplication();

  useEffect(() => {
    const fetchApplication = async () => {
      try {
        const data = await ApplicationService.getApplicationById(id);
        setApplication(data);
      } catch (error) {
        console.error('Failed to fetch application:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchApplication();
  }, [id]);

  const handleSubmit = async (values: any) => {
    await updateApplication({
      id,
      ...values
    });

    router.push(`/applications/${id}`);
  };

  if (loading) {
    return (
      <ContentLayout title="Edit Application">
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-8 w-1/2 mb-4" />
            <Skeleton className="h-4 w-full mb-2" />
            <Skeleton className="h-4 w-3/4" />
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  if (!application) {
    return (
      <ContentLayout title="Application Not Found">
        <Card>
          <CardContent className="p-6">
            <p className="text-muted-foreground">Application not found</p>
          </CardContent>
        </Card>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title="Edit Application">
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
              <Link href="/applications">Applications</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={`/applications/${id}`}>{application.name}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Edit</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Edit Application</CardTitle>
          <CardDescription>
            Update application settings and allowed domains
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ApplicationForm
            initialData={application}
            onSubmit={handleSubmit}
            onCancel={() => router.back()}
            isSubmitting={updating}
          />
        </CardContent>
      </Card>
    </ContentLayout>
  );
}
```

**Testing Checklist:**
- [ ] Test applications list page displays correctly
- [ ] Test create new application flow
- [ ] Test application detail page with all sections
- [ ] Test edit application flow
- [ ] Test all navigation and breadcrumbs
- [ ] Verify mobile responsiveness

---

### Layer 6: Permissions & Navigation (20-30 minutes)

#### Update Navigation Menu

Add to your platform's navigation configuration:

```typescript
// In your navigation/menu config file
{
  groupLabel: 'Manage',
  menus: [
    {
      href: '/applications',
      label: 'Applications',
      icon: Package, // Import from lucide-react
      permission: 'applications.view'
    }
  ]
}
```

#### Define Permissions

Add to your permissions configuration:

```typescript
export const PERMISSIONS = {
  applications: {
    view: ['owner', 'admin', 'developer'],
    create: ['owner', 'admin'],
    edit: ['owner', 'admin'],
    delete: ['owner'],
    regenerate_key: ['owner', 'admin']
  }
};
```

#### Apply Permission Guards

Wrap sensitive actions with permission checks:

```typescript
// In components
import { usePermissions } from '@/hooks/use-permissions';

const { hasPermission } = usePermissions();

{hasPermission('applications.create') && (
  <Button asChild>
    <Link href="/applications/new">New Application</Link>
  </Button>
)}
```

**Testing Checklist:**
- [ ] Test menu item appears for authorized users
- [ ] Test create button only shows for owner/admin
- [ ] Test regenerate key only works for owner/admin
- [ ] Test delete only works for owner
- [ ] Verify permissions enforce correctly across all pages

---

## ✅ Completion Checklist

### Functionality
- [ ] Can create new application with generated API key
- [ ] Can view list of all applications for current organization
- [ ] Can view application details and statistics
- [ ] Can edit application name, description, and domains
- [ ] Can regenerate API key with confirmation
- [ ] Can soft delete (deactivate) application
- [ ] API key copy to clipboard works
- [ ] API key show/hide toggle works
- [ ] Allowed domains can be added/removed
- [ ] Application stats display correctly

### Technical
- [ ] All TypeScript types are strict (no `any`)
- [ ] Service methods have proper error handling
- [ ] Hooks properly manage loading/error states
- [ ] Components are mobile responsive
- [ ] Forms validate inputs correctly
- [ ] Toast notifications work for all actions
- [ ] Console logs use `[applications]` prefix
- [ ] RLS policies verified in Supabase dashboard

### Integration
- [ ] Organization context properly integrated
- [ ] Applications filter by current organization
- [ ] Navigation menu item appears
- [ ] Permissions enforce correctly
- [ ] Breadcrumbs navigate correctly
- [ ] Links between pages work properly

---

## 🔧 Dependencies

**Required Before Starting:**
1. ✅ Organizations Module completed
2. ✅ Organization Context provider implemented
3. ✅ Database schema applied (Phase 2)
4. ✅ Shared types package built (Phase 2)

**Required Packages:**
```bash
npm install nanoid
npm install @hookform/resolvers zod
```

---

## 📝 Notes

### API Key Format
- Prefix: `app_live_`
- Length: 32 random characters
- Alphabet: alphanumeric (case-sensitive)
- Example: `app_live_4K8n2Qp7Rx3Ym9Wd1Tv5Zs6Hf0Jg2Lb`

### Domain Validation
- Must be valid URL format
- Should include protocol (https://)
- Can include port number
- Examples:
  - `https://example.com`
  - `http://localhost:3000`
  - `https://app.example.com:8080`

### Security Considerations
- API keys should never be committed to version control
- Use environment variables in client applications
- Validate domains on server-side for CORS
- Implement rate limiting on public API endpoints

---

## 🚀 Next Steps

After completing this module:

1. **Test Integration**: Verify organization switching updates applications list
2. **Create Bug Reports Module**: Applications will be used to filter bug reports
3. **Implement Public API**: Use API key validation for SDK endpoints
4. **Add Webhooks (Optional)**: Notify applications of bug status changes

---

## 📞 Support

If you encounter issues:

1. Verify Organizations Module is fully functional
2. Check organization context is providing current organization
3. Test API key generation utility
4. Verify RLS policies in Supabase dashboard
5. Check browser console for detailed errors

---

**Total Estimated Time:** 4-6 hours

**Status:** Ready for Implementation
**Next Module:** Bug Reports Module
