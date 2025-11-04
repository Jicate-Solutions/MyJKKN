# Team Management Module - Implementation Plan

**Created:** 2025-01-16
**Module:** Team Management
**Estimated Time:** 4-5 hours
**Dependencies:** Organizations Module
**Tech Stack:** Next.js 15, Supabase, TypeScript, React Query, Tailwind CSS

---

## 📋 Overview

The Team Management Module enables organization owners and admins to invite team members, assign roles, and manage permissions. It provides role-based access control with three tiers: Owner, Admin, and Developer.

### Key Features

1. **Member Invitations**: Send email invitations to join organization
2. **Role Management**: Assign and update roles (Owner/Admin/Developer)
3. **Permission Enforcement**: Role-based access control across platform
4. **Member List**: View all organization members with roles
5. **Invitation Management**: View pending invitations, resend, or revoke
6. **Member Removal**: Remove members from organization

---

## 🗄️ Database Schema Reference

The database schema was already created in Phase 2. Here are the relevant tables:

```sql
-- organization_members table (already created)
CREATE TABLE organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'developer', -- 'owner', 'admin', 'developer'
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id, user_id)
);

-- organization_invitations table (already created)
CREATE TABLE organization_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'developer',
  invited_by UUID REFERENCES auth.users(id),
  invited_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '7 days'),
  accepted BOOLEAN DEFAULT false,
  accepted_at TIMESTAMPTZ,
  UNIQUE(organization_id, email)
);
```

**Indexes** (already created):
```sql
CREATE INDEX idx_org_members_user ON organization_members(user_id);
CREATE INDEX idx_org_invitations_email ON organization_invitations(email);
```

---

## 🏗️ Architecture - 5 Layers

1. **Types Layer** → Member, invitation, role interfaces
2. **Services Layer** → Member CRUD, invitation management
3. **Hooks Layer** → Fetch members, send invitations, update roles
4. **Components Layer** → Member table, invitation form, role selector
5. **Pages Layer** → Team page, invitation management
6. **Permissions & Navigation** → Owner/admin access control

---

## 📁 File Structure

```
bug-reporter-platform/
├── packages/
│   └── shared/
│       └── types/
│           └── team.ts          # Layer 1: New types
│
└── apps/
    └── platform/
        ├── lib/
        │   └── services/
        │       └── team/
        │           └── team-service.ts    # Layer 2
        │
        ├── hooks/
        │   └── team/
        │       ├── use-team-members.ts    # Layer 3
        │       ├── use-invite-member.ts
        │       └── use-update-member-role.ts
        │
        └── app/
            └── (dashboard)/
                └── team/
                    ├── page.tsx                 # Layer 5: Team page
                    ├── invitations/
                    │   └── page.tsx            # Layer 5: Invitations
                    └── _components/            # Layer 4
                        ├── members-table.tsx
                        ├── invite-member-form.tsx
                        ├── role-select.tsx
                        ├── member-actions.tsx
                        └── invitations-table.tsx
```

---

## 🚀 Implementation Steps

### Layer 1: Types Layer (15-20 minutes)

Create `packages/shared/types/team.ts`:

```typescript
// Organization member
export interface OrganizationMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'developer';
  joined_at: string;

  // Joined user data
  user?: {
    id: string;
    email: string;
    raw_user_meta_data?: {
      full_name?: string;
      avatar_url?: string;
    };
  };
}

// Organization invitation
export interface OrganizationInvitation {
  id: string;
  organization_id: string;
  email: string;
  role: 'admin' | 'developer';
  invited_by: string;
  invited_at: string;
  expires_at: string;
  accepted: boolean;
  accepted_at?: string;

  // Joined inviter data
  inviter?: {
    email: string;
    raw_user_meta_data?: {
      full_name?: string;
    };
  };
}

// Invite member payload
export interface InviteMemberPayload {
  organization_id: string;
  email: string;
  role: 'admin' | 'developer';
}

// Update member role payload
export interface UpdateMemberRolePayload {
  member_id: string;
  role: 'admin' | 'developer';
}

// Member stats
export interface TeamStats {
  total_members: number;
  by_role: {
    owner: number;
    admin: number;
    developer: number;
  };
  pending_invitations: number;
}
```

**Testing Checklist:**
- [ ] Verify all types compile
- [ ] Export from package index

---

### Layer 2: Services Layer (60-75 minutes)

Create `apps/platform/lib/services/team/team-service.ts`:

```typescript
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  OrganizationMember,
  OrganizationInvitation,
  InviteMemberPayload,
  UpdateMemberRolePayload,
  TeamStats
} from '@your-org/shared/types/team';

export class TeamService {
  /**
   * Get all members for an organization
   */
  static async getOrganizationMembers(
    organizationId: string
  ): Promise<OrganizationMember[]> {
    try {
      const supabase = createClientSupabaseClient();

      const { data, error } = await supabase
        .from('organization_members')
        .select(`
          *,
          user:auth.users(id, email, raw_user_meta_data)
        `)
        .eq('organization_id', organizationId)
        .order('joined_at', { ascending: false });

      if (error) throw error;

      console.log(`[team] Fetched ${data?.length || 0} members`);
      return data || [];
    } catch (error) {
      console.error('[team] Error fetching members:', error);
      throw error;
    }
  }

  /**
   * Get current user's role in organization
   */
  static async getUserRole(
    organizationId: string,
    userId: string
  ): Promise<string | null> {
    try {
      const supabase = createClientSupabaseClient();

      const { data, error } = await supabase
        .from('organization_members')
        .select('role')
        .eq('organization_id', organizationId)
        .eq('user_id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return null; // Not a member
        }
        throw error;
      }

      return data.role;
    } catch (error) {
      console.error('[team] Error fetching user role:', error);
      throw error;
    }
  }

  /**
   * Invite member to organization
   */
  static async inviteMember(
    payload: InviteMemberPayload
  ): Promise<OrganizationInvitation> {
    try {
      const supabase = createClientSupabaseClient();

      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('Not authenticated');

      // Check if email is already a member
      const { data: existingMember } = await supabase
        .from('organization_members')
        .select('user:auth.users(email)')
        .eq('organization_id', payload.organization_id)
        .eq('user.email', payload.email)
        .single();

      if (existingMember) {
        throw new Error('User is already a member of this organization');
      }

      // Create invitation
      const { data, error } = await supabase
        .from('organization_invitations')
        .insert([{
          organization_id: payload.organization_id,
          email: payload.email,
          role: payload.role,
          invited_by: user.id,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
        }])
        .select(`
          *,
          inviter:auth.users!invited_by(email, raw_user_meta_data)
        `)
        .single();

      if (error) throw error;

      console.log(`[team] Sent invitation to ${payload.email}`);

      // TODO: Send invitation email
      // await sendInvitationEmail(payload.email, data.id);

      return data;
    } catch (error) {
      console.error('[team] Error inviting member:', error);
      throw error;
    }
  }

  /**
   * Get pending invitations for organization
   */
  static async getInvitations(
    organizationId: string
  ): Promise<OrganizationInvitation[]> {
    try {
      const supabase = createClientSupabaseClient();

      const { data, error } = await supabase
        .from('organization_invitations')
        .select(`
          *,
          inviter:auth.users!invited_by(email, raw_user_meta_data)
        `)
        .eq('organization_id', organizationId)
        .eq('accepted', false)
        .gt('expires_at', new Date().toISOString())
        .order('invited_at', { ascending: false });

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('[team] Error fetching invitations:', error);
      throw error;
    }
  }

  /**
   * Revoke (delete) invitation
   */
  static async revokeInvitation(invitationId: string): Promise<void> {
    try {
      const supabase = createClientSupabaseClient();

      const { error } = await supabase
        .from('organization_invitations')
        .delete()
        .eq('id', invitationId);

      if (error) throw error;

      console.log(`[team] Revoked invitation: ${invitationId}`);
    } catch (error) {
      console.error('[team] Error revoking invitation:', error);
      throw error;
    }
  }

  /**
   * Resend invitation email
   */
  static async resendInvitation(invitationId: string): Promise<void> {
    try {
      const supabase = createClientSupabaseClient();

      const { data, error } = await supabase
        .from('organization_invitations')
        .select('email')
        .eq('id', invitationId)
        .single();

      if (error) throw error;

      // TODO: Send invitation email
      // await sendInvitationEmail(data.email, invitationId);

      console.log(`[team] Resent invitation to ${data.email}`);
    } catch (error) {
      console.error('[team] Error resending invitation:', error);
      throw error;
    }
  }

  /**
   * Accept invitation and join organization
   */
  static async acceptInvitation(invitationId: string): Promise<void> {
    try {
      const supabase = createClientSupabaseClient();

      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('Not authenticated');

      // Get invitation details
      const { data: invitation, error: invError } = await supabase
        .from('organization_invitations')
        .select('*')
        .eq('id', invitationId)
        .eq('email', user.email)
        .single();

      if (invError) throw new Error('Invitation not found or expired');

      // Check if already accepted
      if (invitation.accepted) {
        throw new Error('Invitation already accepted');
      }

      // Check if expired
      if (new Date(invitation.expires_at) < new Date()) {
        throw new Error('Invitation has expired');
      }

      // Add user to organization
      const { error: memberError } = await supabase
        .from('organization_members')
        .insert([{
          organization_id: invitation.organization_id,
          user_id: user.id,
          role: invitation.role
        }]);

      if (memberError) throw memberError;

      // Mark invitation as accepted
      const { error: updateError } = await supabase
        .from('organization_invitations')
        .update({
          accepted: true,
          accepted_at: new Date().toISOString()
        })
        .eq('id', invitationId);

      if (updateError) throw updateError;

      console.log(`[team] User joined organization via invitation ${invitationId}`);
    } catch (error) {
      console.error('[team] Error accepting invitation:', error);
      throw error;
    }
  }

  /**
   * Update member role
   */
  static async updateMemberRole(
    payload: UpdateMemberRolePayload
  ): Promise<OrganizationMember> {
    try {
      const supabase = createClientSupabaseClient();

      const { data, error } = await supabase
        .from('organization_members')
        .update({ role: payload.role })
        .eq('id', payload.member_id)
        .select(`
          *,
          user:auth.users(id, email, raw_user_meta_data)
        `)
        .single();

      if (error) throw error;

      console.log(`[team] Updated role for member ${payload.member_id}`);
      return data;
    } catch (error) {
      console.error('[team] Error updating member role:', error);
      throw error;
    }
  }

  /**
   * Remove member from organization
   */
  static async removeMember(memberId: string): Promise<void> {
    try {
      const supabase = createClientSupabaseClient();

      const { error } = await supabase
        .from('organization_members')
        .delete()
        .eq('id', memberId);

      if (error) throw error;

      console.log(`[team] Removed member: ${memberId}`);
    } catch (error) {
      console.error('[team] Error removing member:', error);
      throw error;
    }
  }

  /**
   * Get team statistics
   */
  static async getTeamStats(organizationId: string): Promise<TeamStats> {
    try {
      const supabase = createClientSupabaseClient();

      // Get members
      const { data: members, error: membersError } = await supabase
        .from('organization_members')
        .select('role')
        .eq('organization_id', organizationId);

      if (membersError) throw membersError;

      // Get pending invitations
      const { data: invitations, error: invError } = await supabase
        .from('organization_invitations')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('accepted', false)
        .gt('expires_at', new Date().toISOString());

      if (invError) throw invError;

      const stats: TeamStats = {
        total_members: members?.length || 0,
        by_role: {
          owner: members?.filter(m => m.role === 'owner').length || 0,
          admin: members?.filter(m => m.role === 'admin').length || 0,
          developer: members?.filter(m => m.role === 'developer').length || 0
        },
        pending_invitations: invitations?.length || 0
      };

      return stats;
    } catch (error) {
      console.error('[team] Error fetching team stats:', error);
      throw error;
    }
  }
}
```

**Testing Checklist:**
- [ ] Test fetching members
- [ ] Test inviting member
- [ ] Test checking existing members before invite
- [ ] Test fetching invitations
- [ ] Test revoking invitation
- [ ] Test accepting invitation
- [ ] Test updating member role
- [ ] Test removing member
- [ ] Test team statistics

---

### Layer 3: Hooks Layer (40-50 minutes)

#### 1. `apps/platform/hooks/team/use-team-members.ts`

```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import { TeamService } from '@/lib/services/team/team-service';
import type { OrganizationMember } from '@your-org/shared/types/team';
import { useOrganizationContext } from '@/contexts/organization-context';

export function useTeamMembers() {
  const { currentOrganization } = useOrganizationContext();
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMembers = useCallback(async () => {
    if (!currentOrganization) {
      setMembers([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const data = await TeamService.getOrganizationMembers(currentOrganization.id);
      setMembers(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch members';
      setError(message);
      console.error('[hooks/team-members] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [currentOrganization]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  return {
    members,
    loading,
    error,
    refetch: fetchMembers
  };
}
```

#### 2. `apps/platform/hooks/team/use-invite-member.ts`

```typescript
'use client';

import { useState } from 'react';
import { TeamService } from '@/lib/services/team/team-service';
import type { InviteMemberPayload } from '@your-org/shared/types/team';
import { useToast } from '@/hooks/use-toast';

export function useInviteMember() {
  const [inviting, setInviting] = useState(false);
  const { toast } = useToast();

  const inviteMember = async (payload: InviteMemberPayload) => {
    try {
      setInviting(true);

      const invitation = await TeamService.inviteMember(payload);

      toast({
        title: 'Invitation Sent',
        description: `Invitation sent to ${payload.email}`,
      });

      return invitation;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send invitation';

      toast({
        title: 'Error',
        description: message,
        variant: 'destructive'
      });

      throw err;
    } finally {
      setInviting(false);
    }
  };

  return {
    inviteMember,
    inviting
  };
}
```

#### 3. `apps/platform/hooks/team/use-update-member-role.ts`

```typescript
'use client';

import { useState } from 'react';
import { TeamService } from '@/lib/services/team/team-service';
import type { UpdateMemberRolePayload } from '@your-org/shared/types/team';
import { useToast } from '@/hooks/use-toast';

export function useUpdateMemberRole() {
  const [updating, setUpdating] = useState(false);
  const { toast } = useToast();

  const updateRole = async (payload: UpdateMemberRolePayload) => {
    try {
      setUpdating(true);

      const updated = await TeamService.updateMemberRole(payload);

      toast({
        title: 'Role Updated',
        description: 'Member role updated successfully',
      });

      return updated;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update role';

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
    updateRole,
    updating
  };
}
```

**Testing Checklist:**
- [ ] Test team members hook
- [ ] Test invite member hook
- [ ] Test update role hook
- [ ] Verify toast notifications
- [ ] Test error handling

---

### Layer 4: Components Layer (60-75 minutes)

#### 1. `apps/platform/app/(dashboard)/team/_components/role-select.tsx`

```typescript
'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Shield, UserCog, Code } from 'lucide-react';

const roleConfig = {
  owner: { label: 'Owner', icon: Shield, color: 'text-purple-600' },
  admin: { label: 'Admin', icon: UserCog, color: 'text-blue-600' },
  developer: { label: 'Developer', icon: Code, color: 'text-green-600' }
};

interface RoleSelectProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  excludeOwner?: boolean;
}

export function RoleSelect({ value, onChange, disabled, excludeOwner }: RoleSelectProps) {
  const roles = excludeOwner
    ? Object.entries(roleConfig).filter(([key]) => key !== 'owner')
    : Object.entries(roleConfig);

  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="w-[150px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {roles.map(([key, config]) => (
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

#### 2. `apps/platform/app/(dashboard)/team/_components/invite-member-form.tsx`

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
import { RoleSelect } from './role-select';

const formSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.enum(['admin', 'developer']),
});

type FormValues = z.infer<typeof formSchema>;

interface InviteMemberFormProps {
  onSubmit: (values: FormValues) => Promise<void>;
  isSubmitting?: boolean;
}

export function InviteMemberForm({ onSubmit, isSubmitting }: InviteMemberFormProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: '',
      role: 'developer',
    }
  });

  const handleSubmit = async (values: FormValues) => {
    await onSubmit(values);
    form.reset();
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email Address</FormLabel>
              <FormControl>
                <Input placeholder="member@example.com" type="email" {...field} />
              </FormControl>
              <FormDescription>
                Enter the email address of the person you want to invite
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="role"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Role</FormLabel>
              <FormControl>
                <RoleSelect
                  value={field.value}
                  onChange={field.onChange}
                  excludeOwner
                />
              </FormControl>
              <FormDescription>
                Select the role for this team member
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Sending...' : 'Send Invitation'}
        </Button>
      </form>
    </Form>
  );
}
```

#### 3. `apps/platform/app/(dashboard)/team/_components/members-table.tsx`

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
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { MemberActions } from './member-actions';
import type { OrganizationMember } from '@your-org/shared/types/team';
import { formatDistanceToNow } from 'date-fns';

interface MembersTableProps {
  members: OrganizationMember[];
  onUpdate: () => void;
  currentUserRole?: string;
}

export function MembersTable({ members, onUpdate, currentUserRole }: MembersTableProps) {
  const canManage = currentUserRole === 'owner' || currentUserRole === 'admin';

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Member</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Joined</TableHead>
          {canManage && <TableHead className="text-right">Actions</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {members.map((member) => (
          <TableRow key={member.id}>
            <TableCell>
              <div className="flex items-center gap-3">
                <Avatar>
                  <AvatarImage src={member.user?.raw_user_meta_data?.avatar_url} />
                  <AvatarFallback>
                    {member.user?.email?.[0].toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="font-medium">
                    {member.user?.raw_user_meta_data?.full_name || 'Unknown'}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {member.user?.email}
                  </div>
                </div>
              </div>
            </TableCell>
            <TableCell>
              <Badge variant={member.role === 'owner' ? 'default' : 'secondary'}>
                {member.role}
              </Badge>
            </TableCell>
            <TableCell>
              {formatDistanceToNow(new Date(member.joined_at), { addSuffix: true })}
            </TableCell>
            {canManage && (
              <TableCell className="text-right">
                <MemberActions
                  member={member}
                  onUpdate={onUpdate}
                  currentUserRole={currentUserRole}
                />
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

#### 4. `apps/platform/app/(dashboard)/team/_components/member-actions.tsx`

```typescript
'use client';

import { useState } from 'react';
import { MoreHorizontal, UserCog, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { TeamService } from '@/lib/services/team/team-service';
import { useUpdateMemberRole } from '@/hooks/team/use-update-member-role';
import { RoleSelect } from './role-select';
import type { OrganizationMember } from '@your-org/shared/types/team';
import { useToast } from '@/hooks/use-toast';

interface MemberActionsProps {
  member: OrganizationMember;
  onUpdate: () => void;
  currentUserRole?: string;
}

export function MemberActions({ member, onUpdate, currentUserRole }: MemberActionsProps) {
  const [showRoleDialog, setShowRoleDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedRole, setSelectedRole] = useState(member.role);
  const { updateRole, updating } = useUpdateMemberRole();
  const { toast } = useToast();

  // Owner cannot be modified
  if (member.role === 'owner') {
    return null;
  }

  // Only owner can modify admins
  if (member.role === 'admin' && currentUserRole !== 'owner') {
    return null;
  }

  const handleUpdateRole = async () => {
    await updateRole({
      member_id: member.id,
      role: selectedRole as 'admin' | 'developer'
    });
    setShowRoleDialog(false);
    onUpdate();
  };

  const handleRemove = async () => {
    try {
      await TeamService.removeMember(member.id);
      toast({
        title: 'Member Removed',
        description: 'Team member has been removed from the organization',
      });
      onUpdate();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to remove member',
        variant: 'destructive'
      });
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setShowRoleDialog(true)}>
            <UserCog className="mr-2 h-4 w-4" />
            Change Role
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setShowDeleteDialog(true)}
            className="text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showRoleDialog} onOpenChange={setShowRoleDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Member Role</DialogTitle>
            <DialogDescription>
              Select a new role for {member.user?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <RoleSelect
              value={selectedRole}
              onChange={setSelectedRole}
              excludeOwner
            />
            <div className="flex gap-2">
              <Button onClick={handleUpdateRole} disabled={updating}>
                {updating ? 'Updating...' : 'Update Role'}
              </Button>
              <Button variant="outline" onClick={() => setShowRoleDialog(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Team Member?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove {member.user?.email} from the organization.
              They will lose access to all organization data immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemove}>
              Remove Member
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
```

**Testing Checklist:**
- [ ] Test role selector
- [ ] Test invite form validation
- [ ] Test members table display
- [ ] Test member actions (role change, remove)
- [ ] Test dialogs and confirmations
- [ ] Verify mobile responsiveness

---

### Layer 5: Pages Layer (45-60 minutes)

#### 1. `apps/platform/app/(dashboard)/team/page.tsx`

```typescript
'use client';

import Link from 'next/link';
import { Users, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ContentLayout } from '@/components/admin-panel/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { useTeamMembers } from '@/hooks/team/use-team-members';
import { useInviteMember } from '@/hooks/team/use-invite-member';
import { useOrganizationContext } from '@/contexts/organization-context';
import { MembersTable } from './_components/members-table';
import { InviteMemberForm } from './_components/invite-member-form';
import { useState } from 'react';

export default function TeamPage() {
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const { members, loading, refetch } = useTeamMembers();
  const { inviteMember, inviting } = useInviteMember();
  const { currentOrganization } = useOrganizationContext();

  const handleInvite = async (values: any) => {
    if (!currentOrganization) return;

    await inviteMember({
      organization_id: currentOrganization.id,
      ...values
    });

    setShowInviteDialog(false);
    refetch();
  };

  return (
    <ContentLayout title="Team">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Team</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Team Members</h1>
            <p className="text-muted-foreground">
              Manage your organization's team members and roles
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href="/team/invitations">
                <Mail className="mr-2 h-4 w-4" />
                Invitations
              </Link>
            </Button>
            <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
              <DialogTrigger asChild>
                <Button>
                  <Users className="mr-2 h-4 w-4" />
                  Invite Member
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Invite Team Member</DialogTitle>
                  <DialogDescription>
                    Send an invitation to join your organization
                  </DialogDescription>
                </DialogHeader>
                <InviteMemberForm onSubmit={handleInvite} isSubmitting={inviting} />
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Members ({members.length})</CardTitle>
            <CardDescription>
              All members of your organization
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">Loading members...</div>
            ) : members.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No team members yet
              </div>
            ) : (
              <MembersTable members={members} onUpdate={refetch} />
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
```

#### 2. `apps/platform/app/(dashboard)/team/invitations/page.tsx`

```typescript
'use client';

import { useEffect, useState } from 'react';
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
import { TeamService } from '@/lib/services/team/team-service';
import { useOrganizationContext } from '@/contexts/organization-context';
import type { OrganizationInvitation } from '@your-org/shared/types/team';
import { InvitationsTable } from '../_components/invitations-table';

export default function InvitationsPage() {
  const { currentOrganization } = useOrganizationContext();
  const [invitations, setInvitations] = useState<OrganizationInvitation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchInvitations = async () => {
      if (!currentOrganization) return;

      try {
        const data = await TeamService.getInvitations(currentOrganization.id);
        setInvitations(data);
      } catch (error) {
        console.error('Failed to fetch invitations:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchInvitations();
  }, [currentOrganization]);

  return (
    <ContentLayout title="Invitations">
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
              <Link href="/team">Team</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Invitations</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 space-y-4">
        <Button asChild variant="outline" size="sm">
          <Link href="/team">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Team
          </Link>
        </Button>

        <Card>
          <CardHeader>
            <CardTitle>Pending Invitations</CardTitle>
            <CardDescription>
              Manage invitations sent to join your organization
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">Loading...</div>
            ) : invitations.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No pending invitations
              </div>
            ) : (
              <InvitationsTable invitations={invitations} />
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
```

**Note:** Create `invitations-table.tsx` component similar to members-table with actions to resend/revoke.

**Testing Checklist:**
- [ ] Test team page displays members correctly
- [ ] Test invite dialog
- [ ] Test invitations page
- [ ] Test navigation
- [ ] Verify mobile responsiveness

---

### Layer 6: Permissions & Navigation (15-20 minutes)

#### Update Navigation Menu

```typescript
// In navigation/menu config
{
  groupLabel: 'Organization',
  menus: [
    {
      href: '/team',
      label: 'Team',
      icon: Users,
      permission: 'team.view'
    }
  ]
}
```

#### Define Permissions

```typescript
export const PERMISSIONS = {
  team: {
    view: ['owner', 'admin', 'developer'], // All can view
    invite: ['owner', 'admin'], // Only owner/admin can invite
    manage: ['owner', 'admin'], // Only owner/admin can manage
    remove: ['owner', 'admin'] // Only owner/admin can remove
  }
};
```

**Testing Checklist:**
- [ ] Test all roles can view team
- [ ] Test only owner/admin can invite
- [ ] Test only owner/admin can manage roles
- [ ] Test only owner can modify admins
- [ ] Owner role cannot be modified

---

## ✅ Completion Checklist

### Functionality
- [ ] Can invite members via email
- [ ] Can view all team members
- [ ] Can update member roles
- [ ] Can remove members
- [ ] Can view pending invitations
- [ ] Can revoke invitations
- [ ] Can accept invitations
- [ ] Role-based permissions enforced

### Technical
- [ ] Email validation works
- [ ] Duplicate member check works
- [ ] Invitation expiry works (7 days)
- [ ] RLS policies verified
- [ ] Mobile responsive
- [ ] Toast notifications work

### Integration
- [ ] Organization context integrated
- [ ] Navigation works
- [ ] Permissions enforced correctly
- [ ] Owner protection works

---

## 🔧 Dependencies

**Required:**
1. ✅ Organizations Module
2. ✅ Database schema (Phase 2)
3. ✅ Shared types package

**Optional Enhancements:**
- Email service for invitations (TODO)
- SSO integration
- Team activity log

---

## 📝 Notes

### Email Invitations

The service layer has placeholders for sending invitation emails:
```typescript
// TODO: Send invitation email
// await sendInvitationEmail(payload.email, invitationId);
```

Implement this with your email service (SendGrid, Resend, etc.).

### Security Considerations

- Owner role is protected and cannot be modified
- Only owners can modify admin roles
- Invitations expire after 7 days
- Email must match authenticated user to accept invitation

---

**Total Estimated Time:** 4-5 hours

**Status:** Ready for Implementation
**Next Module:** Messaging Module
