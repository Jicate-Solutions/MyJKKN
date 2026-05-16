'use client';

// Scope Policy Editor — Director's-view UI for HR recruitment-approvals scope.
// Renders the two platform_policies rows as toggles + per-role selects with
// English consequences. Never shows raw JSONB.

import { useEffect, useMemo, useState } from 'react';
import { ShieldAlert, Info, Save, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useEnforceScopingPolicy,
  useScopeRulesPolicy,
  useUpdateEnforceScoping,
  useUpdateScopeRules,
  type ScopeOption,
  type ScopeRules,
} from '@/hooks/admin/use-hr-approvals-scope-policy';

// ---------------------------------------------------------------------------
// Role catalog — the recruitment-approver roles that the engine consults.
// Mirrors Agent A's default seed (kept here so the page renders before seeds
// land). When Agent A's PR merges, this becomes purely the "row list" — the
// scope values still come from platform_policies.
// ---------------------------------------------------------------------------

interface RoleCatalogEntry {
  roleKey: string;
  label: string;
  defaultScope: ScopeOption;
}

const ROLE_CATALOG: RoleCatalogEntry[] = [
  { roleKey: 'super_admin', label: 'Super Admin', defaultScope: 'all' },
  { roleKey: 'admin', label: 'Admin', defaultScope: 'all' },
  { roleKey: 'hr_manager', label: 'HR Manager', defaultScope: 'hr_organization' },
  { roleKey: 'hr_officer', label: 'HR Officer', defaultScope: 'hr_organization' },
  { roleKey: 'registrar', label: 'Registrar', defaultScope: 'institution' },
  { roleKey: 'principal', label: 'Principal', defaultScope: 'institution' },
  { roleKey: 'vice_principal', label: 'Vice Principal', defaultScope: 'institution' },
  { roleKey: 'hod', label: 'Head of Department (HOD)', defaultScope: 'department' },
  { roleKey: 'interviewer', label: 'Interviewer', defaultScope: 'self' },
];

const SCOPE_OPTIONS: { value: ScopeOption; label: string; consequence: (role: string) => string }[] = [
  {
    value: 'all',
    label: 'All — full queue',
    consequence: (r) => `${r}: sees every candidate across all institutions.`,
  },
  {
    value: 'hr_organization',
    label: 'HR Organization',
    consequence: (r) =>
      `${r}: sees candidates within their hr_organization_id only (typically JKKN central + child colleges).`,
  },
  {
    value: 'institution',
    label: 'Institution',
    consequence: (r) =>
      `${r}: sees candidates within their institution_id only (one college).`,
  },
  {
    value: 'department',
    label: 'Department',
    consequence: (r) =>
      `${r}: sees candidates within their department_id only.`,
  },
  {
    value: 'self',
    label: 'Self — only candidates assigned to them',
    consequence: (r) =>
      `${r}: sees only candidates where they are the assigned interviewer / approver.`,
  },
];

function scopeLabel(scope: ScopeOption): string {
  return SCOPE_OPTIONS.find((o) => o.value === scope)?.label ?? scope;
}

function scopeConsequence(roleLabel: string, scope: ScopeOption): string {
  return (
    SCOPE_OPTIONS.find((o) => o.value === scope)?.consequence(roleLabel) ??
    `${roleLabel}: ${scope}`
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ScopePolicyEditor() {
  const enforceQ = useEnforceScopingPolicy();
  const rulesQ = useScopeRulesPolicy();
  const updateEnforce = useUpdateEnforceScoping();
  const updateRules = useUpdateScopeRules();

  // Local working copy of rules so user can stage multiple selects before save.
  const [draftRules, setDraftRules] = useState<ScopeRules>({});
  const [dirty, setDirty] = useState(false);

  // Hydrate draft from server. If a role is missing from server payload, fall
  // back to ROLE_CATALOG default.
  useEffect(() => {
    if (!rulesQ.data) return;
    const serverRules = rulesQ.data.rules ?? {};
    const next: ScopeRules = {};
    for (const r of ROLE_CATALOG) {
      const fromServer = serverRules[r.roleKey]?.scope;
      next[r.roleKey] = { scope: (fromServer as ScopeOption) ?? r.defaultScope };
    }
    if (serverRules._default?.scope) {
      next._default = { scope: serverRules._default.scope };
    }
    setDraftRules(next);
    setDirty(false);
  }, [rulesQ.data]);

  const isLoading = enforceQ.isLoading || rulesQ.isLoading;
  const hasError = enforceQ.isError || rulesQ.isError;
  const seedsMissing =
    enforceQ.data?.exists === false || rulesQ.data?.exists === false;

  const sortedRoles = useMemo(
    () => [...ROLE_CATALOG].sort((a, b) => a.label.localeCompare(b.label)),
    []
  );

  const handleScopeChange = (roleKey: string, scope: ScopeOption) => {
    setDraftRules((prev) => ({
      ...prev,
      [roleKey]: { scope },
    }));
    setDirty(true);
  };

  const handleSave = () => {
    updateRules.mutate(draftRules, {
      onSuccess: () => setDirty(false),
    });
  };

  const handleResetDefaults = () => {
    const next: ScopeRules = {};
    for (const r of ROLE_CATALOG) {
      next[r.roleKey] = { scope: r.defaultScope };
    }
    setDraftRules(next);
    setDirty(true);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (hasError) {
    return (
      <Alert variant="destructive">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Failed to load scope policy</AlertTitle>
        <AlertDescription>
          {enforceQ.error?.message || rulesQ.error?.message || 'Unknown error.'}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {seedsMissing && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Seeds not yet applied</AlertTitle>
          <AlertDescription>
            The platform_policies rows for HR recruitment-approvals scope have
            not been seeded yet (Agent A&apos;s PR). This page will show defaults
            until those rows exist; saves will no-op until then.
          </AlertDescription>
        </Alert>
      )}

      {/* ===================== ENFORCE SCOPING TOGGLE ===================== */}
      <section className="rounded-lg border border-border bg-card p-6 space-y-4">
        <div className="flex items-start justify-between gap-6">
          <div className="flex-1">
            <h2 className="text-lg font-semibold">
              Restrict approvals page by viewer&apos;s institution / department
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Master switch. When this is OFF, the per-role scope rules below
              are ignored and every approver sees the full queue.
            </p>
            <div className="mt-3 rounded-md bg-muted/40 p-3 text-sm">
              <strong>Consequence:</strong>{' '}
              {enforceQ.data?.enabled ? (
                <span>
                  Each approver sees only the candidates that match their role
                  scope below. A Principal sees their institution only; an HOD
                  sees their department only.
                </span>
              ) : (
                <span>
                  Every approver sees the full recruitment queue regardless of
                  their institution / department / role.
                </span>
              )}
            </div>
          </div>
          <div className="flex-shrink-0 flex flex-col items-end gap-2">
            <Switch
              checked={enforceQ.data?.enabled ?? false}
              disabled={updateEnforce.isPending}
              onCheckedChange={(checked) => updateEnforce.mutate(checked)}
              aria-label="Toggle enforce scoping"
            />
            <Badge variant={enforceQ.data?.enabled ? 'default' : 'secondary'}>
              {enforceQ.data?.enabled ? 'ON' : 'OFF'}
            </Badge>
          </div>
        </div>
        {enforceQ.data?.updatedAt && (
          <p className="text-xs text-muted-foreground">
            Last updated: {new Date(enforceQ.data.updatedAt).toLocaleString()}
          </p>
        )}
      </section>

      {/* ===================== PER-ROLE SCOPE RULES ===================== */}
      <section className="rounded-lg border border-border bg-card p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Per-role scope rules</h2>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              For each role, pick the scope that bounds what candidates that
              role can see on the recruitment approvals page. Changes are
              staged until you click <strong>Save scope rules</strong>.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetDefaults}
              disabled={updateRules.isPending}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Reset to defaults
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!dirty || updateRules.isPending}
            >
              <Save className="h-4 w-4 mr-2" />
              {updateRules.isPending ? 'Saving…' : 'Save scope rules'}
            </Button>
          </div>
        </div>

        {!enforceQ.data?.enabled && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Scoping is currently OFF</AlertTitle>
            <AlertDescription>
              These rules are stored but inert until you turn the master switch
              above ON.
            </AlertDescription>
          </Alert>
        )}

        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium w-64">Scope</th>
                <th className="px-4 py-3 font-medium">English consequence</th>
              </tr>
            </thead>
            <tbody>
              {sortedRoles.map((role) => {
                const currentScope =
                  draftRules[role.roleKey]?.scope ?? role.defaultScope;
                return (
                  <tr
                    key={role.roleKey}
                    className="border-t border-border align-top"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium">{role.label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {role.roleKey}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Select
                        value={currentScope}
                        onValueChange={(v) =>
                          handleScopeChange(role.roleKey, v as ScopeOption)
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue>{scopeLabel(currentScope)}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {SCOPE_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {currentScope !== role.defaultScope && (
                        <p className="mt-1 text-xs text-amber-600">
                          Differs from default ({scopeLabel(role.defaultScope)})
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {scopeConsequence(role.label, currentScope)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {rulesQ.data?.updatedAt && (
          <p className="text-xs text-muted-foreground">
            Last updated: {new Date(rulesQ.data.updatedAt).toLocaleString()}
          </p>
        )}
      </section>
    </div>
  );
}
