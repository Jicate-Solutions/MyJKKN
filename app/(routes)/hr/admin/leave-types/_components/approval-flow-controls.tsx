'use client';

/**
 * The two flow-shape settings, and the fallback approver.
 *
 * THEY ARE INDEPENDENT ON PURPOSE. "Where the steps come from" and "how they
 * run" are separate questions, and collapsing them into one three-way mode list
 * would have cost the useful combination — a ladder run in parallel, meaning
 * "any one of my superiors can approve this".
 *
 *   explicit + sequential  the classic chain: these people, in this order
 *   explicit + parallel    these people, whoever gets to it first
 *   ladder   + sequential  climb it: HOD, then Principal, then CAO
 *   ladder   + parallel    any superior can approve
 *
 * The fallback only appears for a ladder, because it only has a job there: an
 * explicit flow always yields the same steps, so it can never resolve to nobody.
 */

import { GitBranch, GitMerge, ListOrdered, Users } from 'lucide-react';

import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type {
  LeaveApproverRoleOption,
  LeaveFlowRunMode,
  LeaveFlowStepSource,
} from '@/types/hr-leave-types';

import { ApproverPersonPicker } from './approver-person-picker';
import { RolePicker } from './role-picker';

interface Props {
  stepSource: LeaveFlowStepSource;
  runMode: LeaveFlowRunMode;
  fallbackRole: string;
  fallbackUserId: string | null;
  fallbackName: string | null;
  roles: LeaveApproverRoleOption[] | undefined;
  hrOrgId: string | undefined;
  enabled: boolean;
  onStepSourceChange: (v: LeaveFlowStepSource) => void;
  onRunModeChange: (v: LeaveFlowRunMode) => void;
  onFallbackChange: (v: {
    role: string;
    userId: string | null;
    name: string | null;
  }) => void;
}

export function ApprovalFlowControls({
  stepSource,
  runMode,
  fallbackRole,
  fallbackUserId,
  fallbackName,
  roles,
  hrOrgId,
  enabled,
  onStepSourceChange,
  onRunModeChange,
  onFallbackChange,
}: Props) {
  return (
    <div className="space-y-4 rounded-md border bg-muted/30 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label className="inline-flex items-center gap-1.5">
            <GitBranch className="h-3.5 w-3.5" /> Steps come from
          </Label>
          <Select
            value={stepSource}
            onValueChange={(v) => onStepSourceChange(v as LeaveFlowStepSource)}
          >
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="explicit">A list I set out</SelectItem>
              <SelectItem value="role_ladder">A role ladder</SelectItem>
            </SelectContent>
          </Select>
          <p className="mt-1 text-xs text-muted-foreground">
            {stepSource === 'explicit'
              ? 'The same steps for everyone applying for this leave type.'
              : 'Each applicant is routed to whoever sits above them on the ladder.'}
          </p>
        </div>

        <div>
          <Label className="inline-flex items-center gap-1.5">
            {runMode === 'sequential' ? (
              <ListOrdered className="h-3.5 w-3.5" />
            ) : (
              <GitMerge className="h-3.5 w-3.5" />
            )}
            They run
          </Label>
          <Select value={runMode} onValueChange={(v) => onRunModeChange(v as LeaveFlowRunMode)}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="sequential">One after another</SelectItem>
              <SelectItem value="parallel">All at once</SelectItem>
            </SelectContent>
          </Select>
          <p className="mt-1 text-xs text-muted-foreground">
            {runMode === 'sequential'
              ? 'Each step is cleared before the next one is asked.'
              : 'Everyone is asked together; the step quorum decides when it is cleared.'}
          </p>
        </div>
      </div>

      {stepSource === 'role_ladder' && (
        <div className="border-t pt-3">
          <Label className="inline-flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" /> If nobody is above the applicant, send it to
          </Label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Used only for the person at the top of the ladder. Without it their request has no
            approver and cannot be submitted.
          </p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">A role</Label>
              {/* A role and a named person are alternatives, so choosing either
                  clears the other — including "No role", which is how you get
                  back to neither. */}
              <RolePicker
                roles={roles}
                value={fallbackRole}
                onChange={(v) => onFallbackChange({ role: v, userId: null, name: null })}
                placeholder="No role"
                clearLabel="No role"
                className="mt-1"
                aria-label="Fallback approver role"
              />
            </div>
            <div>
              <Label className="text-xs">…or one named person</Label>
              <div className="mt-1">
                <ApproverPersonPicker
                  hrOrgId={hrOrgId}
                  roles={roles}
                  selectedId={fallbackUserId}
                  selectedName={fallbackName}
                  onSelect={(picked) =>
                    onFallbackChange({
                      role: '',
                      userId: picked?.id ?? null,
                      name: picked?.name ?? null,
                    })
                  }
                  enabled={enabled}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
