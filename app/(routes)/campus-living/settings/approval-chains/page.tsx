'use client';

// Approval-chain rules admin page — rewritten from mock JSX (PR-0, 2026-04-22).
// Reads rules from DB via ApprovalChainService. Shows each rule's stages as
// a read-only stepper. Admins can toggle `is_active`, edit name / description /
// priority, and delete rules with no active runs. Creating new rules and
// editing stages is deferred (complex JSON UX for a later PR).

import { useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useApprovalChainRules,
  useUpdateApprovalChainRule,
  useDeleteApprovalChainRule,
} from '@/hooks/use-approval-chain';
import {
  ArrowRight,
  Edit,
  Info,
  Loader2,
  Trash2,
  GitBranch,
  Clock,
  UserCheck,
  UserCog,
  Users,
  Building,
} from 'lucide-react';
import type {
  ApprovalChainRuleSummary,
  StageDefinition,
} from '@/types/approval-chain';

const actorIcon: Record<string, typeof Users> = {
  parent: Users,
  warden: UserCheck,
  chief_warden: UserCog,
  hostel_office: Building,
};

export default function ApprovalChainsPage() {
  const { profile } = useAuth();
  const { isSuperAdmin } = usePermissions();
  const institutionId = isSuperAdmin ? '' : profile?.institution_id ?? '';

  const { data: rulesResult, isLoading, error, refetch } = useApprovalChainRules(institutionId);
  const rules = rulesResult?.data ?? [];

  const [editRule, setEditRule] = useState<ApprovalChainRuleSummary | null>(null);
  const [deleteRule, setDeleteRule] = useState<ApprovalChainRuleSummary | null>(null);

  const updateMut = useUpdateApprovalChainRule();
  const deleteMut = useDeleteApprovalChainRule();

  // Group rules by workflow_type for display
  const grouped = rules.reduce<Record<string, ApprovalChainRuleSummary[]>>((acc, r) => {
    (acc[r.workflow_type] ||= []).push(r);
    return acc;
  }, {});

  const handleToggleActive = async (rule: ApprovalChainRuleSummary, active: boolean) => {
    await updateMut.mutateAsync({ id: rule.id, payload: { is_active: active } });
    refetch();
  };

  const handleSaveEdit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editRule) return;
    const formData = new FormData(e.currentTarget);
    await updateMut.mutateAsync({
      id: editRule.id,
      payload: {
        rule_name: String(formData.get('rule_name') ?? ''),
        description: String(formData.get('description') ?? '') || null,
        priority: Number(formData.get('priority') ?? 100),
      },
    });
    setEditRule(null);
    refetch();
  };

  const handleConfirmDelete = async () => {
    if (!deleteRule) return;
    await deleteMut.mutateAsync(deleteRule.id);
    setDeleteRule(null);
    refetch();
  };

  if (isLoading) {
    return (
      <ContentLayout title='Approval Chains'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <Loader2 className='h-8 w-8 animate-spin text-primary' />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Approval Chains'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Settings', href: '/campus-living/settings' },
          { label: 'Approval Chains' },
        ]}
      />

      <div className='space-y-6 mt-4'>
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold'>Approval Chains</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              DB-backed approval workflow rules. Each rule defines the stages a request
              must pass through based on its context (resident type, reason, etc.).
            </p>
          </div>
        </div>

        {/* Design note callout */}
        <Card className='border-blue-200 bg-blue-50 dark:bg-blue-950/20'>
          <CardContent className='flex gap-3 p-4'>
            <Info className='h-5 w-5 text-blue-600 shrink-0 mt-0.5' />
            <div className='text-sm space-y-1'>
              <p className='font-medium'>Stage editing is coming in a follow-up PR.</p>
              <p className='text-muted-foreground'>
                In this release you can toggle rules on/off, edit name &middot; description
                &middot; priority, and delete unused rules. Adding new rules or modifying
                the stage sequence requires direct migration for now.
              </p>
            </div>
          </CardContent>
        </Card>

        {error && (
          <Card className='border-destructive'>
            <CardContent className='p-4 text-sm text-destructive'>
              Failed to load approval chain rules: {(error as Error).message}
            </CardContent>
          </Card>
        )}

        {Object.keys(grouped).length === 0 && !isLoading && (
          <Card>
            <CardContent className='p-8 text-center text-muted-foreground'>
              No approval chain rules configured yet.
            </CardContent>
          </Card>
        )}

        {Object.entries(grouped).map(([workflowType, workflowRules]) => (
          <div key={workflowType} className='space-y-3'>
            <h2 className='text-sm font-semibold uppercase tracking-wide text-muted-foreground'>
              {workflowType.replace(/_/g, ' ')}
            </h2>
            <div className='space-y-3'>
              {workflowRules.map((rule) => (
                <Card key={rule.id}>
                  <CardHeader className='pb-3'>
                    <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
                      <div className='flex items-start gap-3'>
                        <GitBranch className='h-5 w-5 text-muted-foreground mt-0.5' />
                        <div>
                          <CardTitle className='text-base flex items-center gap-2'>
                            {rule.rule_name}
                            <Badge variant={rule.is_active ? 'success' : 'secondary'}>
                              {rule.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                            <Badge variant='outline' className='font-mono text-xs'>
                              priority {rule.priority}
                            </Badge>
                          </CardTitle>
                          {rule.description && (
                            <p className='text-xs text-muted-foreground mt-1 max-w-2xl'>
                              {rule.description}
                            </p>
                          )}
                          <p className='text-xs text-muted-foreground mt-1 font-mono'>
                            when: {rule.criteria_summary}
                          </p>
                        </div>
                      </div>

                      <div className='flex items-center gap-2'>
                        <Label htmlFor={`active-${rule.id}`} className='text-xs'>
                          Active
                        </Label>
                        <Switch
                          id={`active-${rule.id}`}
                          checked={rule.is_active}
                          onCheckedChange={(v) => handleToggleActive(rule, v)}
                          disabled={updateMut.isPending}
                        />
                        <Button
                          size='icon'
                          variant='ghost'
                          onClick={() => setEditRule(rule)}
                          aria-label='Edit rule'
                        >
                          <Edit className='h-4 w-4' />
                        </Button>
                        <Button
                          size='icon'
                          variant='ghost'
                          onClick={() => setDeleteRule(rule)}
                          aria-label='Delete rule'
                        >
                          <Trash2 className='h-4 w-4 text-destructive' />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className='flex flex-wrap items-center gap-2 overflow-x-auto'>
                      {(rule.stages as StageDefinition[]).map((s, idx) => {
                        const Icon = actorIcon[s.actor_role_key] ?? Users;
                        return (
                          <div
                            key={`${rule.id}-${s.stage_idx}`}
                            className='flex items-center gap-2'
                          >
                            <div className='flex items-center gap-2 rounded-md border px-3 py-2 bg-background'>
                              <Icon className='h-4 w-4 text-muted-foreground' />
                              <div className='flex flex-col'>
                                <span className='text-sm font-medium'>{s.stage_label}</span>
                                <span className='text-xs text-muted-foreground'>
                                  <Clock className='inline h-3 w-3 mr-0.5' />
                                  {s.sla_hours}h &middot; {s.action_type}
                                </span>
                              </div>
                            </div>
                            {idx < rule.stages.length - 1 && (
                              <ArrowRight className='h-4 w-4 text-muted-foreground shrink-0' />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editRule} onOpenChange={(o) => !o && setEditRule(null)}>
        <DialogContent className='max-w-[480px]'>
          <form onSubmit={handleSaveEdit}>
            <DialogHeader>
              <DialogTitle>Edit Approval Rule</DialogTitle>
              <DialogDescription>
                Stage configuration is read-only in this release. Only the fields below can
                be modified.
              </DialogDescription>
            </DialogHeader>

            <div className='space-y-4 py-4'>
              <div className='space-y-2'>
                <Label htmlFor='rule_name'>Name</Label>
                <Input
                  id='rule_name'
                  name='rule_name'
                  defaultValue={editRule?.rule_name ?? ''}
                  required
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='description'>Description</Label>
                <Textarea
                  id='description'
                  name='description'
                  defaultValue={editRule?.description ?? ''}
                  rows={3}
                />
              </div>
              <div className='space-y-2'>
                <Label htmlFor='priority'>Priority</Label>
                <Input
                  id='priority'
                  name='priority'
                  type='number'
                  defaultValue={editRule?.priority ?? 100}
                  min={0}
                />
                <p className='text-xs text-muted-foreground'>
                  Lower values win when multiple rules match the same workflow context.
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                onClick={() => setEditRule(null)}
                disabled={updateMut.isPending}
              >
                Cancel
              </Button>
              <Button type='submit' disabled={updateMut.isPending}>
                {updateMut.isPending && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteRule} onOpenChange={(o) => !o && setDeleteRule(null)}>
        <DialogContent className='max-w-[480px]'>
          <DialogHeader>
            <DialogTitle>Delete approval rule?</DialogTitle>
            <DialogDescription>
              This will remove <strong>{deleteRule?.rule_name}</strong>. Delete fails if any
              active runs still reference this rule (FK RESTRICT). Deactivate the rule
              first if you just want to stop new runs from using it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => setDeleteRule(null)}
              disabled={deleteMut.isPending}
            >
              Cancel
            </Button>
            <Button
              variant='destructive'
              onClick={handleConfirmDelete}
              disabled={deleteMut.isPending}
            >
              {deleteMut.isPending && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentLayout>
  );
}
