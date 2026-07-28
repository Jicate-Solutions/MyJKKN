'use client';

/**
 * LC-004: Approval Chain Configuration - Create/edit chains with step ordering
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import {
  Plus,
  GripVertical,
  Trash2,
  ArrowUp,
  ArrowDown,
  Link2,
  Shield,
  Settings,
  Star,
} from 'lucide-react';
import { useCreateApprovalChain, useUpdateApprovalChain, useSetFallbackChain } from '@/hooks/learners-council/use-lc-od';
import type {
  LCODApprovalChain,
  ODApprovalStep,
  EventScope,
  CreateODApprovalChainDto,
} from '@/types/learners-council';

interface InstitutionOption {
  id: string;
  name: string;
}

interface ApprovalChainsClientProps {
  initialChains: (LCODApprovalChain & { institution?: InstitutionOption | null })[];
  userId: string;
  /** LC office bearer or super admin. Mirrors the lc_od_chains_* RLS policies. */
  canManage: boolean;
  institutions: InstitutionOption[];
}

const approverRoles = [
  { value: 'class_advisor', label: 'Class Advisor' },
  { value: 'hod', label: 'Head of Department' },
  { value: 'yuva_chair', label: 'YUVA Chapter Chair' },
  { value: 'principal', label: 'Principal' },
  { value: 'dean', label: 'Dean' },
  { value: 'md', label: 'Managing Director' },
  { value: 'lc_president', label: 'LC President' },
  { value: 'lc_vice_president', label: 'LC Vice President' },
];

const scopeOptions = [
  { value: 'campus', label: 'Campus Events' },
  { value: 'inter_campus', label: 'Inter-Campus Events' },
  { value: 'institution_wide', label: 'Institution-Wide Events' },
];

function StepEditor({
  steps,
  onChange,
}: {
  steps: ODApprovalStep[];
  onChange: (steps: ODApprovalStep[]) => void;
}) {
  const addStep = () => {
    const newStep: ODApprovalStep = {
      step_order: steps.length + 1,
      approver_role: '',
      approval_type: 'sequential',
      is_required: true,
      auto_approve_after_hours: null,
    };
    onChange([...steps, newStep]);
  };

  const removeStep = (idx: number) => {
    const updated = steps.filter((_, i) => i !== idx).map((s, i) => ({ ...s, step_order: i + 1 }));
    onChange(updated);
  };

  const moveStep = (idx: number, direction: 'up' | 'down') => {
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === steps.length - 1) return;

    const updated = [...steps];
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    [updated[idx], updated[targetIdx]] = [updated[targetIdx], updated[idx]];
    onChange(updated.map((s, i) => ({ ...s, step_order: i + 1 })));
  };

  const updateStep = (idx: number, field: string, value: any) => {
    const updated = [...steps];
    (updated[idx] as any)[field] = value;
    onChange(updated);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Approval Steps</Label>
        <Button type="button" size="sm" variant="outline" onClick={addStep}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add Step
        </Button>
      </div>

      {steps.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No steps yet. Add at least one approval step.
        </p>
      )}

      {steps.map((step, idx) => (
        <div key={idx} className="flex items-center gap-2 p-3 rounded-lg border bg-muted/30">
          <div className="flex flex-col gap-0.5">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-5 w-5"
              onClick={() => moveStep(idx, 'up')}
              disabled={idx === 0}
            >
              <ArrowUp className="h-3 w-3" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-5 w-5"
              onClick={() => moveStep(idx, 'down')}
              disabled={idx === steps.length - 1}
            >
              <ArrowDown className="h-3 w-3" />
            </Button>
          </div>

          <Badge variant="outline" className="text-xs w-7 flex justify-center">
            {idx + 1}
          </Badge>

          <Select
            value={step.approver_role}
            onValueChange={(v) => updateStep(idx, 'approver_role', v)}
          >
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Select approver role" />
            </SelectTrigger>
            <SelectContent>
              {approverRoles.map((role) => (
                <SelectItem key={role.value} value={role.value}>
                  {role.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <label className="flex items-center gap-1.5 text-xs whitespace-nowrap">
            <input
              type="checkbox"
              checked={step.is_required}
              onChange={(e) => updateStep(idx, 'is_required', e.target.checked)}
              className="h-3.5 w-3.5 rounded border-gray-300"
            />
            Required
          </label>

          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-red-500 hover:text-red-700"
            onClick={() => removeStep(idx)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
    </div>
  );
}

function CreateChainForm({
  userId,
  institutions,
  onSuccess,
}: {
  userId: string;
  institutions: InstitutionOption[];
  onSuccess: () => void;
}) {
  const createChain = useCreateApprovalChain();
  const [name, setName] = useState('');
  const [institutionId, setInstitutionId] = useState('');
  const [scope, setScope] = useState<EventScope>('campus');
  const [steps, setSteps] = useState<ODApprovalStep[]>([]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !institutionId || steps.length === 0) return;

    const validSteps = steps.filter((s) => s.approver_role);
    if (validSteps.length === 0) return;

    createChain.mutate(
      {
        data: {
          institution_id: institutionId,
          name,
          event_scope: scope,
          steps: validSteps,
        },
        userId,
      },
      { onSuccess }
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="chain-name">Chain Name *</Label>
          <Input
            id="chain-name"
            placeholder="e.g. Campus Event OD Chain"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        {/* Office bearers are LC-wide, so the college a chain belongs to is an explicit
            choice rather than the creator's own institution. */}
        <div className="space-y-2">
          <Label htmlFor="chain-institution">College *</Label>
          <Select value={institutionId} onValueChange={setInstitutionId}>
            <SelectTrigger id="chain-institution">
              <SelectValue placeholder="Select college" />
            </SelectTrigger>
            <SelectContent>
              {institutions.map((inst) => (
                <SelectItem key={inst.id} value={inst.id}>
                  {inst.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="chain-scope">Event Scope *</Label>
          <Select value={scope} onValueChange={(v) => setScope(v as EventScope)}>
            <SelectTrigger id="chain-scope">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {scopeOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <StepEditor steps={steps} onChange={setSteps} />

      <Separator />

      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={createChain.isPending || steps.length === 0 || !institutionId}
        >
          {createChain.isPending ? 'Creating...' : 'Create Chain'}
        </Button>
      </div>
    </form>
  );
}

export function ApprovalChainsClient({
  initialChains,
  userId,
  canManage,
  institutions,
}: ApprovalChainsClientProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const chains = initialChains;
  const toggleChain = useUpdateApprovalChain();
  const setFallback = useSetFallbackChain();
  // The list is server-rendered, so refresh the route after a write rather than relying
  // on React Query cache invalidation (which this list does not read from).
  const router = useRouter();

  return (
    <>
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">Approval Chains</h1>
          <p className="text-sm text-muted-foreground">
            OD approval workflows across every college of the Council
          </p>
        </div>
        {canManage && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="shrink-0">
                <Plus className="h-4 w-4 mr-2" />
                New Chain
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create Approval Chain</DialogTitle>
              </DialogHeader>
              <CreateChainForm
                userId={userId}
                institutions={institutions}
                onSuccess={() => {
                  setDialogOpen(false);
                  router.refresh();
                }}
              />
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Info Banner */}
      <Card className="bg-blue-50/50 border-blue-200">
        <CardContent className="p-4 flex items-start gap-3">
          <Shield className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-blue-900">How Approval Chains Work</p>
            <p className="text-blue-700 mt-0.5">
              When a learner submits an OD request, the chain is chosen by the event&apos;s scope
              (campus / inter-campus / institution-wide). Each step must be completed before the
              next. If no chain matches the scope &mdash; or the request has no event &mdash; the
              college&apos;s <span className="font-medium">Default</span> chain is used.
              {canManage
                ? ' Give each college one Default chain so a request is never left with nowhere to go.'
                : ' Only LC office bearers can create or change a chain.'}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Chains List */}
      {chains.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Link2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No approval chains configured</p>
            <p className="text-sm mt-1">
              {canManage
                ? 'Create a chain to define the OD approval workflow.'
                : 'An LC office bearer needs to create one before OD requests can be submitted.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {chains.map((chain: any) => {
            const steps = (chain.steps || []) as ODApprovalStep[];

            return (
              <Card key={chain.id} className={chain.is_active ? undefined : 'opacity-60'}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">{chain.name}</CardTitle>
                    <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                      {chain.is_fallback && (
                        <Badge variant="secondary" className="gap-1">
                          <Star className="h-3 w-3" />
                          Default
                        </Badge>
                      )}
                      <Badge variant={chain.is_active ? 'default' : 'outline'}>
                        {chain.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                      {canManage && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={toggleChain.isPending}
                          onClick={() =>
                            toggleChain.mutate(
                              {
                                id: chain.id,
                                data: { is_active: !chain.is_active } as any,
                              },
                              { onSuccess: () => router.refresh() }
                            )
                          }
                        >
                          {chain.is_active ? 'Deactivate' : 'Activate'}
                        </Button>
                      )}
                      {canManage && chain.is_active && !chain.is_fallback && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={setFallback.isPending}
                          onClick={() =>
                            setFallback.mutate(chain.id, { onSuccess: () => router.refresh() })
                          }
                        >
                          Set as default
                        </Button>
                      )}
                    </div>
                  </div>
                  <CardDescription>
                    {/* The list spans every college, so the owning college has to be on the card. */}
                    {chain.institution?.name || 'Unknown college'}
                    {' · '}
                    {scopeOptions.find((s) => s.value === chain.event_scope)?.label || chain.event_scope}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Approval Steps ({steps.length})
                    </p>
                    {steps.map((step, idx) => {
                      const roleLabel = approverRoles.find((r) => r.value === step.approver_role)?.label || step.approver_role;
                      return (
                        <div key={idx} className="flex items-center gap-2 text-sm">
                          <Badge variant="outline" className="text-xs w-6 flex justify-center">
                            {idx + 1}
                          </Badge>
                          <span>{roleLabel}</span>
                          {step.is_required && (
                            <Badge variant="secondary" className="text-[10px]">Required</Badge>
                          )}
                          {step.auto_approve_after_hours && (
                            <span className="text-xs text-muted-foreground">
                              (auto-approve after {step.auto_approve_after_hours}h)
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
