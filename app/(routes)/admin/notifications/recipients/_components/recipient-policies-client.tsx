'use client';

/**
 * recipient-policies-client.tsx
 *
 * Director-facing UI for /admin/notifications/recipients. One card per digest
 * category, each with:
 *
 *   - Role checkboxes (alphabetically ordered active roles)
 *   - Optional individual email overrides (textarea, one per line)
 *   - "Include super_admins" toggle
 *   - "Match legacy single role only" toggle (advanced)
 *   - "Enabled" toggle (kill-switch)
 *   - Live preview of resolved recipients via get_digest_recipients()
 *   - Save button
 *
 * Director's standing rule (2026-04-29):
 *   "Re-map CEO's digest categories? Click checkboxes" — verbatim Director example.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  Users,
  Loader2,
  Save,
  Eye,
  Mail,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import toast from 'react-hot-toast';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { usePermissions } from '@/hooks/use-permissions';

import {
  listPolicies,
  listAvailableRoles,
  previewRecipients,
  updatePolicy,
  type NotificationRecipientPolicy,
  type AvailableRoleOption,
  type DigestRecipientPreviewRow,
} from '@/lib/services/admin/notification-recipient-policies-service';

// --- Helpers ---------------------------------------------------------------

function emailsArrayFromTextarea(value: string): string[] {
  return value
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function emailsTextareaFromArray(arr: string[] | null | undefined): string {
  if (!arr || arr.length === 0) return '';
  return arr.join('\n');
}

interface DraftState {
  recipient_role_keys: Set<string>;
  recipient_user_emails_text: string;
  include_super_admins: boolean;
  match_legacy_role_only: boolean;
  enabled: boolean;
  description: string;
}

function policyToDraft(p: NotificationRecipientPolicy): DraftState {
  return {
    recipient_role_keys: new Set(p.recipient_role_keys ?? []),
    recipient_user_emails_text: emailsTextareaFromArray(p.recipient_user_emails),
    include_super_admins: p.include_super_admins,
    match_legacy_role_only: p.match_legacy_role_only,
    enabled: p.enabled,
    description: p.description,
  };
}

function draftEqualsPolicy(d: DraftState, p: NotificationRecipientPolicy): boolean {
  const roles = Array.from(d.recipient_role_keys).sort();
  const polRoles = [...(p.recipient_role_keys ?? [])].sort();
  if (roles.length !== polRoles.length) return false;
  for (let i = 0; i < roles.length; i++) {
    if (roles[i] !== polRoles[i]) return false;
  }
  const emails = emailsArrayFromTextarea(d.recipient_user_emails_text).sort();
  const polEmails = [...(p.recipient_user_emails ?? [])].sort();
  if (emails.length !== polEmails.length) return false;
  for (let i = 0; i < emails.length; i++) {
    if (emails[i] !== polEmails[i]) return false;
  }
  return (
    d.include_super_admins === p.include_super_admins &&
    d.match_legacy_role_only === p.match_legacy_role_only &&
    d.enabled === p.enabled &&
    d.description === p.description
  );
}

// --- Single-policy card ----------------------------------------------------

interface PolicyCardProps {
  policy: NotificationRecipientPolicy;
  availableRoles: AvailableRoleOption[];
  canEdit: boolean;
}

function PolicyCard({ policy, availableRoles, canEdit }: PolicyCardProps) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<DraftState>(() => policyToDraft(policy));
  const [previewOpen, setPreviewOpen] = useState(false);
  const [roleSearch, setRoleSearch] = useState('');

  // Reset draft when the saved policy changes (e.g. another tab saved).
  useEffect(() => {
    setDraft(policyToDraft(policy));
  }, [policy]);

  const dirty = !draftEqualsPolicy(draft, policy);

  const previewQuery = useQuery({
    queryKey: ['recipient-policy-preview', policy.digest_category],
    queryFn: () => previewRecipients(policy.digest_category),
    enabled: previewOpen,
    staleTime: 30 * 1000,
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      updatePolicy(policy.id, {
        recipient_role_keys: Array.from(draft.recipient_role_keys),
        recipient_user_emails: emailsArrayFromTextarea(
          draft.recipient_user_emails_text
        ),
        include_super_admins: draft.include_super_admins,
        match_legacy_role_only: draft.match_legacy_role_only,
        enabled: draft.enabled,
        description: draft.description,
      }),
    onSuccess: () => {
      toast.success(`Saved ${policy.digest_category}`);
      queryClient.invalidateQueries({ queryKey: ['recipient-policies'] });
      queryClient.invalidateQueries({
        queryKey: ['recipient-policy-preview', policy.digest_category],
      });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Save failed');
    },
  });

  const filteredRoles = useMemo(() => {
    const q = roleSearch.trim().toLowerCase();
    if (!q) return availableRoles;
    return availableRoles.filter(
      (r) =>
        r.role_key.toLowerCase().includes(q) ||
        r.role_name.toLowerCase().includes(q)
    );
  }, [availableRoles, roleSearch]);

  function toggleRole(roleKey: string, checked: boolean) {
    setDraft((d) => {
      const next = new Set(d.recipient_role_keys);
      if (checked) {
        next.add(roleKey);
      } else {
        next.delete(roleKey);
      }
      return { ...d, recipient_role_keys: next };
    });
  }

  return (
    <Card className={cn(!draft.enabled && 'opacity-70')}>
      <CardHeader className='flex flex-row items-start justify-between gap-3'>
        <div className='space-y-1'>
          <CardTitle className='font-mono text-base'>
            {policy.digest_category}
          </CardTitle>
          <CardDescription className='text-xs'>
            {policy.description}
          </CardDescription>
        </div>
        <div className='flex flex-col items-end gap-2'>
          <Badge variant={draft.enabled ? 'default' : 'secondary'}>
            {draft.enabled ? 'Enabled' : 'Disabled'}
          </Badge>
          <div className='flex items-center gap-2 text-xs'>
            <Switch
              id={`enabled-${policy.id}`}
              checked={draft.enabled}
              disabled={!canEdit}
              onCheckedChange={(v) =>
                setDraft((d) => ({ ...d, enabled: !!v }))
              }
            />
            <Label htmlFor={`enabled-${policy.id}`} className='text-xs'>
              On
            </Label>
          </div>
        </div>
      </CardHeader>
      <CardContent className='space-y-5'>
        {/* Role checkboxes */}
        <div className='space-y-2'>
          <div className='flex items-center justify-between gap-2'>
            <Label className='text-sm font-medium'>
              Roles ({draft.recipient_role_keys.size} selected)
            </Label>
            <Input
              type='search'
              placeholder='Filter roles...'
              value={roleSearch}
              onChange={(e) => setRoleSearch(e.target.value)}
              className='h-8 max-w-[200px] text-xs'
            />
          </div>
          <div className='grid grid-cols-1 gap-1.5 rounded-md border p-3 sm:grid-cols-2 lg:grid-cols-3'>
            {filteredRoles.length === 0 ? (
              <p className='col-span-full text-center text-xs text-muted-foreground'>
                No matching roles
              </p>
            ) : (
              filteredRoles.map((role) => {
                const checked = draft.recipient_role_keys.has(role.role_key);
                return (
                  <label
                    key={role.role_key}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1 text-sm hover:bg-muted',
                      !canEdit && 'cursor-not-allowed opacity-60'
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      disabled={!canEdit}
                      onCheckedChange={(v) => toggleRole(role.role_key, !!v)}
                    />
                    <span className='flex-1 truncate'>
                      <span className='font-medium'>{role.role_name}</span>{' '}
                      <span className='font-mono text-[11px] text-muted-foreground'>
                        {role.role_key}
                      </span>
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </div>

        {/* Switches */}
        <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
          <div className='flex items-start gap-3 rounded-md border p-3'>
            <ShieldCheck className='mt-0.5 h-4 w-4 text-emerald-600' />
            <div className='flex-1'>
              <div className='flex items-center justify-between gap-2'>
                <Label
                  htmlFor={`super-${policy.id}`}
                  className='text-sm font-medium'
                >
                  Always include super-admins
                </Label>
                <Switch
                  id={`super-${policy.id}`}
                  checked={draft.include_super_admins}
                  disabled={!canEdit}
                  onCheckedChange={(v) =>
                    setDraft((d) => ({ ...d, include_super_admins: !!v }))
                  }
                />
              </div>
              <p className='mt-1 text-xs text-muted-foreground'>
                Director-level oversight always receives this digest
                regardless of role checkboxes.
              </p>
            </div>
          </div>
          <div className='flex items-start gap-3 rounded-md border p-3'>
            <AlertTriangle className='mt-0.5 h-4 w-4 text-amber-600' />
            <div className='flex-1'>
              <div className='flex items-center justify-between gap-2'>
                <Label
                  htmlFor={`legacy-${policy.id}`}
                  className='text-sm font-medium'
                >
                  Match legacy primary role only
                </Label>
                <Switch
                  id={`legacy-${policy.id}`}
                  checked={draft.match_legacy_role_only}
                  disabled={!canEdit}
                  onCheckedChange={(v) =>
                    setDraft((d) => ({ ...d, match_legacy_role_only: !!v }))
                  }
                />
              </div>
              <p className='mt-1 text-xs text-muted-foreground'>
                ON: matches users via <code>profiles.role</code> only (single
                role). OFF: also expands via secondary roles in user_roles.
              </p>
            </div>
          </div>
        </div>

        {/* Email overrides */}
        <div className='space-y-2'>
          <Label
            htmlFor={`emails-${policy.id}`}
            className='flex items-center gap-2 text-sm font-medium'
          >
            <Mail className='h-3.5 w-3.5' />
            Individual email overrides (optional)
          </Label>
          <Textarea
            id={`emails-${policy.id}`}
            value={draft.recipient_user_emails_text}
            disabled={!canEdit}
            onChange={(e) =>
              setDraft((d) => ({
                ...d,
                recipient_user_emails_text: e.target.value,
              }))
            }
            placeholder={'one.email@jkkn.ac.in\nanother.email@jkkn.ac.in'}
            rows={3}
            className='font-mono text-xs'
          />
          <p className='text-xs text-muted-foreground'>
            One email per line, comma, or semicolon. Adds these individuals
            even if their role is not ticked.
          </p>
        </div>

        {/* Description */}
        <div className='space-y-2'>
          <Label
            htmlFor={`desc-${policy.id}`}
            className='text-sm font-medium'
          >
            Description (Director-facing)
          </Label>
          <Textarea
            id={`desc-${policy.id}`}
            value={draft.description}
            disabled={!canEdit}
            onChange={(e) =>
              setDraft((d) => ({ ...d, description: e.target.value }))
            }
            rows={2}
            className='text-xs'
          />
        </div>

        {/* Preview */}
        {previewOpen && (
          <div className='space-y-2 rounded-md border bg-muted/30 p-3'>
            <div className='flex items-center gap-2'>
              <Eye className='h-3.5 w-3.5' />
              <span className='text-xs font-medium'>
                Resolved recipients (current saved state)
              </span>
            </div>
            <RecipientPreviewList query={previewQuery} />
          </div>
        )}

        {/* Action row */}
        <div className='flex flex-col items-stretch justify-between gap-2 border-t pt-3 sm:flex-row sm:items-center'>
          <div className='flex items-center gap-2'>
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() => setPreviewOpen((v) => !v)}
            >
              <Eye className='mr-2 h-3.5 w-3.5' />
              {previewOpen ? 'Hide preview' : 'Preview recipients'}
            </Button>
            {dirty && (
              <Badge variant='outline' className='text-[11px]'>
                Unsaved changes
              </Badge>
            )}
          </div>
          <div className='flex items-center gap-2'>
            <Button
              type='button'
              variant='ghost'
              size='sm'
              disabled={!dirty || saveMutation.isPending}
              onClick={() => setDraft(policyToDraft(policy))}
            >
              Reset
            </Button>
            <Button
              type='button'
              size='sm'
              disabled={!canEdit || !dirty || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending ? (
                <Loader2 className='mr-2 h-3.5 w-3.5 animate-spin' />
              ) : (
                <Save className='mr-2 h-3.5 w-3.5' />
              )}
              Save
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface RecipientPreviewListProps {
  query: {
    isLoading: boolean;
    isError: boolean;
    error: unknown;
    data: DigestRecipientPreviewRow[] | undefined;
  };
}

function RecipientPreviewList({ query }: RecipientPreviewListProps) {
  if (query.isLoading) {
    return (
      <div className='flex items-center gap-2 text-xs text-muted-foreground'>
        <Loader2 className='h-3.5 w-3.5 animate-spin' />
        Resolving recipients...
      </div>
    );
  }
  if (query.isError) {
    return (
      <p className='text-xs text-destructive'>
        Failed to load preview: {(query.error as Error)?.message ?? 'unknown'}
      </p>
    );
  }
  const rows = query.data ?? [];
  if (rows.length === 0) {
    return (
      <p className='text-xs italic text-muted-foreground'>
        No matching recipients — this digest will produce zero rows.
      </p>
    );
  }
  return (
    <>
      <p className='text-[11px] text-muted-foreground'>
        {rows.length} recipient{rows.length === 1 ? '' : 's'}
      </p>
      <ul className='max-h-48 overflow-y-auto rounded-sm border bg-background'>
        {rows.map((r) => (
          <li
            key={r.user_id}
            className='flex items-center justify-between gap-2 border-b px-2 py-1 text-xs last:border-b-0'
          >
            <span className='truncate font-mono'>{r.email}</span>
            <Badge variant='outline' className='text-[10px]'>
              {r.source}
            </Badge>
          </li>
        ))}
      </ul>
    </>
  );
}

// --- Top-level client ------------------------------------------------------

export function RecipientPoliciesClient() {
  const { isSuperAdmin } = usePermissions();
  const canEdit = !!isSuperAdmin;

  const policiesQuery = useQuery({
    queryKey: ['recipient-policies'],
    queryFn: listPolicies,
    staleTime: 60 * 1000,
  });

  const rolesQuery = useQuery({
    queryKey: ['recipient-policies', 'available-roles'],
    queryFn: listAvailableRoles,
    staleTime: 5 * 60 * 1000,
  });

  if (policiesQuery.isLoading || rolesQuery.isLoading) {
    return (
      <div className='space-y-3'>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className='h-48 w-full' />
        ))}
      </div>
    );
  }

  if (policiesQuery.isError) {
    return (
      <div className='rounded-md border border-destructive bg-destructive/5 p-4 text-sm'>
        Failed to load notification recipient policies:{' '}
        {(policiesQuery.error as Error)?.message ?? 'unknown error'}
      </div>
    );
  }

  const policies = policiesQuery.data ?? [];
  const roles = rolesQuery.data ?? [];

  return (
    <div className='space-y-4 px-0 sm:p-4'>
      <header className='space-y-1'>
        <div className='flex items-center gap-2'>
          <Users className='h-5 w-5' />
          <h2 className='text-2xl font-bold tracking-tight'>
            Digest recipients
          </h2>
        </div>
        <p className='max-w-3xl text-sm text-muted-foreground'>
          Re-map who receives each digest category. Tick role checkboxes, add
          individual email overrides, or flip the kill-switch — saves
          immediately apply on the next digest run. No PR. No deploy.
        </p>
        {!canEdit && (
          <p className='flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200'>
            <CheckCircle2 className='h-3.5 w-3.5' />
            Read-only — only super_admins can edit these policies.
          </p>
        )}
      </header>

      {policies.length === 0 ? (
        <Card>
          <CardContent className='py-8 text-center text-sm text-muted-foreground'>
            No digest categories configured yet.
          </CardContent>
        </Card>
      ) : (
        <div className='space-y-4'>
          {policies.map((p) => (
            <PolicyCard
              key={p.id}
              policy={p}
              availableRoles={roles}
              canEdit={canEdit}
            />
          ))}
        </div>
      )}
    </div>
  );
}
