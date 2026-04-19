'use client';

import { useEffect, useMemo, useState } from 'react';
import { BeatLoader } from 'react-spinners';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from '@/components/ui/tabs';
import {
  AlertTriangle,
  Copy,
  Info,
  ShieldAlert,
  Users
} from 'lucide-react';
import {
  INSTITUTIONS,
  PERMISSION_CATEGORIES
} from '@/lib/constants/permissions';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RoleMeta {
  name: string;
  userCount: number;
  isSystem: boolean;
}

interface MatrixData {
  roles: string[];
  roleMeta: Record<string, RoleMeta>;
  matrix: Record<string, Record<string, boolean>>;
}

type Severity = 'green' | 'amber' | 'red';

// ─── Helpers (duplicated per spec — mirrors module-access-tab.tsx) ────────────

/** Split dot-notation permission key. Duplicated from module-access-tab.tsx. */
function classifyPerm(permKey: string) {
  const parts = permKey.split('.');
  if (parts.length < 2) return { module: permKey, submodule: '', action: '' };
  return {
    module: parts[0],
    action: parts[parts.length - 1],
    submodule: parts.slice(1, -1).join(' › ')
  };
}

function moduleLabel(key: string) {
  const cat = PERMISSION_CATEGORIES.find((c) => c.key === key);
  return cat?.name ?? key;
}

/** Build a flat lookup of permKey → human label, using PERMISSION_CATEGORIES. */
function buildPermLabelMap(): Map<string, string> {
  const m = new Map<string, string>();
  for (const cat of PERMISSION_CATEGORIES) {
    for (const p of cat.permissions) {
      m.set(p.key, p.label);
    }
  }
  return m;
}

/** Detect privilege-escalating / admin-level permissions. */
function isAdminLevel(permKey: string): boolean {
  const lower = permKey.toLowerCase();
  if (lower.includes('admin')) return true;
  if (lower.endsWith('.delete') || lower.includes('.delete.')) return true;
  if (lower.includes('manage')) return true;
  if (lower.includes('roles.create')) return true;
  if (lower.includes('roles.delete')) return true;
  if (lower.includes('roles.edit')) return true;
  return false;
}

function severityColorClass(sev: Severity): string {
  if (sev === 'green')
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (sev === 'amber') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-rose-50 text-rose-700 border-rose-200';
}

function severityLabel(sev: Severity): string {
  if (sev === 'green') return 'Low impact';
  if (sev === 'amber') return 'Medium impact';
  return 'High impact';
}

function severityForUserCount(count: number): Severity {
  if (count <= 5) return 'green';
  if (count <= 50) return 'amber';
  return 'red';
}

async function copyToClipboard(text: string, setCopied: (v: boolean) => void) {
  try {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  } catch {
    // Silently ignore — clipboard may be blocked by browser permissions.
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ScenarioSimulatorTab() {
  const [data, setData] = useState<MatrixData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const r = await fetch('/api/users/permissions-audit/matrix');
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        setData((await r.json()) as MatrixData);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className='flex items-center justify-center h-64'>
          <BeatLoader color='#6366f1' size={10} />
        </CardContent>
      </Card>
    );
  }
  if (err || !data) {
    return (
      <Card>
        <CardContent className='flex items-center justify-center h-64 text-destructive'>
          {err ?? 'No data returned from API'}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className='space-y-4'>
      {/* Explainer */}
      <Card>
        <CardContent className='pt-4 pb-4'>
          <div className='flex items-start gap-2'>
            <Info className='h-4 w-4 text-indigo-500 mt-0.5 shrink-0' />
            <p className='text-xs text-muted-foreground'>
              <span className='font-medium text-foreground'>
                Scenario Simulator.
              </span>{' '}
              Preview the blast radius of a permission change before you make
              it. No data is modified — this is a read-only what-if analyzer.
              Use it to catch accidental privilege escalations and orphaned
              access paths.
            </p>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue='revoke' className='w-full'>
        <TabsList className='grid w-full grid-cols-1 sm:grid-cols-3'>
          <TabsTrigger value='revoke'>Revoke permission</TabsTrigger>
          <TabsTrigger value='delete-role'>Delete role</TabsTrigger>
          <TabsTrigger value='grant-institution'>
            Grant by institution
          </TabsTrigger>
        </TabsList>

        <TabsContent value='revoke' className='mt-4'>
          <RevokePermissionScenario data={data} />
        </TabsContent>
        <TabsContent value='delete-role' className='mt-4'>
          <DeleteRoleScenario data={data} />
        </TabsContent>
        <TabsContent value='grant-institution' className='mt-4'>
          <GrantInstitutionScenario data={data} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Shared permission picker (grouped by module) ─────────────────────────────

interface PermissionPickerProps {
  data: MatrixData;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

function PermissionPicker({
  data,
  value,
  onChange,
  placeholder
}: PermissionPickerProps) {
  const labelMap = useMemo(buildPermLabelMap, []);

  // Group all matrix permission keys by their module segment.
  const groups = useMemo(() => {
    const g = new Map<string, string[]>();
    for (const permKey of Object.keys(data.matrix)) {
      const { module } = classifyPerm(permKey);
      if (!g.has(module)) g.set(module, []);
      g.get(module)!.push(permKey);
    }
    return Array.from(g.entries())
      .map(([mod, keys]) => ({
        module: mod,
        label: moduleLabel(mod),
        keys: keys.sort()
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [data]);

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className='w-full h-9 text-xs'>
        <SelectValue placeholder={placeholder ?? 'Select permission'} />
      </SelectTrigger>
      <SelectContent className='max-h-80'>
        {groups.map((grp) => (
          <SelectGroup key={grp.module}>
            <SelectLabel className='text-[11px] font-semibold text-muted-foreground'>
              {grp.label}
            </SelectLabel>
            {grp.keys.map((k) => (
              <SelectItem key={k} value={k} className='text-xs'>
                <span className='font-mono text-[11px]'>{k}</span>
                {labelMap.has(k) && (
                  <span className='ml-2 text-muted-foreground'>
                    — {labelMap.get(k)}
                  </span>
                )}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}

// ─── Scenario 1 — Revoke permission from a role ───────────────────────────────

interface ScenarioProps {
  data: MatrixData;
}

function RevokePermissionScenario({ data }: ScenarioProps) {
  const [role, setRole] = useState<string>('');
  const [permKey, setPermKey] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const labelMap = useMemo(buildPermLabelMap, []);

  const clear = () => {
    setRole('');
    setPermKey('');
  };

  const roleMeta = role ? data.roleMeta[role] : undefined;
  const permRow = permKey ? data.matrix[permKey] ?? {} : {};
  const permIsGrantedToRole = role && permKey ? permRow[role] === true : false;
  const affectedUsers = roleMeta?.userCount ?? 0;
  const adminLevel = permKey ? isAdminLevel(permKey) : false;

  const severity: Severity = useMemo(() => {
    if (!role || !permKey) return 'green';
    if (adminLevel) return 'red';
    return severityForUserCount(affectedUsers);
  }, [role, permKey, adminLevel, affectedUsers]);

  // Related permissions — same module & submodule, different action.
  const relatedPerms = useMemo(() => {
    if (!permKey) return [] as Array<{ key: string; grantedToRole: boolean }>;
    const c = classifyPerm(permKey);
    return Object.keys(data.matrix)
      .filter((k) => {
        if (k === permKey) return false;
        const o = classifyPerm(k);
        return o.module === c.module && o.submodule === c.submodule;
      })
      .map((k) => ({
        key: k,
        grantedToRole: role ? data.matrix[k]?.[role] === true : false
      }))
      .sort((a, b) => a.key.localeCompare(b.key));
  }, [permKey, data, role]);

  // Stranded perms — role keeps these but loses the view/read gate.
  const strandedPerms = useMemo(() => {
    if (!permKey) return [] as string[];
    const { action } = classifyPerm(permKey);
    if (action !== 'view' && action !== 'read') return [];
    return relatedPerms
      .filter((r) => r.grantedToRole)
      .filter((r) => {
        const a = classifyPerm(r.key).action;
        return a !== 'view' && a !== 'read';
      })
      .map((r) => r.key);
  }, [permKey, relatedPerms]);

  // Alternative roles that still grant this permission.
  const alternativeRoles = useMemo(() => {
    if (!permKey) return [] as Array<{ role: string; meta: RoleMeta }>;
    return data.roles
      .filter((r) => r !== role && data.matrix[permKey]?.[r] === true)
      .map((r) => ({ role: r, meta: data.roleMeta[r] }))
      .filter((x) => !!x.meta)
      .sort((a, b) => b.meta.userCount - a.meta.userCount);
  }, [permKey, data, role]);

  const canShowReport = role && permKey;

  const markdownReport = useMemo(() => {
    if (!canShowReport) return '';
    const lines: string[] = [];
    lines.push(`# Scenario: Revoke Permission`);
    lines.push('');
    lines.push(
      `- **Role:** ${roleMeta?.name ?? role} (\`${role}\`)`
    );
    lines.push(`- **Permission:** \`${permKey}\``);
    if (labelMap.has(permKey))
      lines.push(`- **Label:** ${labelMap.get(permKey)}`);
    lines.push(`- **Users affected:** ${affectedUsers}`);
    lines.push(`- **Severity:** ${severityLabel(severity)}`);
    lines.push(
      `- **Admin-level permission:** ${adminLevel ? 'YES' : 'no'}`
    );
    lines.push(
      `- **Currently granted to this role:** ${permIsGrantedToRole ? 'yes' : 'no'}`
    );
    lines.push('');
    if (strandedPerms.length > 0) {
      lines.push(`## Stranded permissions (user can act but not see)`);
      for (const s of strandedPerms) lines.push(`- \`${s}\``);
      lines.push('');
    }
    if (alternativeRoles.length > 0) {
      lines.push(`## Users can still get this access via`);
      for (const a of alternativeRoles)
        lines.push(`- ${a.meta.name} (${a.meta.userCount} users)`);
    } else {
      lines.push(
        `## Alternative access`
      );
      lines.push(
        `NONE — no other role grants this permission. Revoking removes it system-wide (except super_admin).`
      );
    }
    return lines.join('\n');
  }, [
    canShowReport,
    role,
    roleMeta,
    permKey,
    labelMap,
    affectedUsers,
    severity,
    adminLevel,
    permIsGrantedToRole,
    strandedPerms,
    alternativeRoles
  ]);

  return (
    <Card>
      <CardHeader className='pb-3'>
        <CardTitle className='text-base font-semibold'>
          Revoke a permission from a role
        </CardTitle>
        <p className='text-xs text-muted-foreground mt-1'>
          Pick a role and a permission to preview how many users lose access
          and whether they have an alternate path.
        </p>
      </CardHeader>
      <CardContent className='space-y-4'>
        {/* Inputs */}
        <div className='grid gap-3 md:grid-cols-2'>
          <div className='space-y-1.5'>
            <label className='text-xs font-medium text-muted-foreground'>
              Role
            </label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className='w-full h-9 text-xs'>
                <SelectValue placeholder='Select role' />
              </SelectTrigger>
              <SelectContent className='max-h-80'>
                {data.roles
                  .map((r) => ({ r, meta: data.roleMeta[r] }))
                  .filter((x) => !!x.meta)
                  .sort((a, b) => a.meta.name.localeCompare(b.meta.name))
                  .map(({ r, meta }) => (
                    <SelectItem key={r} value={r} className='text-xs'>
                      {meta.name}
                      <span className='ml-1 text-muted-foreground'>
                        ({meta.userCount} user
                        {meta.userCount !== 1 ? 's' : ''}
                        {meta.isSystem ? ' · system' : ''})
                      </span>
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className='space-y-1.5'>
            <label className='text-xs font-medium text-muted-foreground'>
              Permission
            </label>
            <PermissionPicker
              data={data}
              value={permKey}
              onChange={setPermKey}
              placeholder='Select permission to revoke'
            />
          </div>
        </div>

        {canShowReport ? (
          <div className='space-y-3'>
            {/* Blast radius */}
            <Card
              className={`border-l-4 ${
                severity === 'red'
                  ? 'border-l-rose-500'
                  : severity === 'amber'
                    ? 'border-l-amber-500'
                    : 'border-l-emerald-500'
              }`}
            >
              <CardContent className='pt-4 pb-4 space-y-2'>
                <div className='flex items-center justify-between gap-2 flex-wrap'>
                  <div className='flex items-center gap-2'>
                    <Users className='h-4 w-4 text-muted-foreground' />
                    <span className='text-sm font-medium'>
                      {affectedUsers} user
                      {affectedUsers !== 1 ? 's' : ''} affected
                    </span>
                  </div>
                  <div className='flex items-center gap-1.5 flex-wrap'>
                    <Badge
                      variant='outline'
                      className={`text-[11px] ${severityColorClass(severity)}`}
                    >
                      {severityLabel(severity)}
                    </Badge>
                    {adminLevel && (
                      <Badge
                        variant='outline'
                        className='text-[11px] bg-rose-50 text-rose-700 border-rose-200 gap-1'
                      >
                        <ShieldAlert className='h-3 w-3' />
                        Admin-level
                      </Badge>
                    )}
                    {!permIsGrantedToRole && (
                      <Badge
                        variant='outline'
                        className='text-[11px] bg-slate-50 text-slate-600 border-slate-200'
                      >
                        Not currently granted to this role
                      </Badge>
                    )}
                  </div>
                </div>
                <div className='text-xs text-muted-foreground'>
                  Revoking{' '}
                  <span className='font-mono text-foreground'>{permKey}</span>
                  {labelMap.has(permKey) && (
                    <span className='ml-1'>
                      ({labelMap.get(permKey)})
                    </span>
                  )}{' '}
                  from{' '}
                  <span className='font-medium text-foreground'>
                    {roleMeta?.name ?? role}
                  </span>
                  .
                </div>
              </CardContent>
            </Card>

            {/* Stranded perms */}
            {strandedPerms.length > 0 && (
              <Card className='border-l-4 border-l-amber-500'>
                <CardHeader className='pb-2'>
                  <CardTitle className='text-sm font-semibold flex items-center gap-2'>
                    <AlertTriangle className='h-4 w-4 text-amber-500' />
                    Stranded permissions
                  </CardTitle>
                  <p className='text-[11px] text-muted-foreground'>
                    This role will keep these permissions but lose the
                    view/read gate — users can act but not see the data.
                  </p>
                </CardHeader>
                <CardContent className='pt-0'>
                  <div className='flex flex-wrap gap-1.5'>
                    {strandedPerms.map((s) => (
                      <Badge
                        key={s}
                        variant='outline'
                        className='text-[11px] font-mono bg-amber-50 border-amber-200 text-amber-800'
                      >
                        {s}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Alternatives */}
            <Card>
              <CardHeader className='pb-2'>
                <CardTitle className='text-sm font-semibold'>
                  Alternative access paths
                </CardTitle>
              </CardHeader>
              <CardContent className='pt-0'>
                {alternativeRoles.length === 0 ? (
                  <p className='text-xs text-muted-foreground'>
                    No other role grants this permission. Revoking removes it
                    system-wide (except super_admin, which always has access).
                  </p>
                ) : (
                  <div className='space-y-1.5'>
                    <p className='text-xs text-muted-foreground'>
                      Users could still obtain this permission via:
                    </p>
                    <div className='flex flex-wrap gap-1.5'>
                      {alternativeRoles.map(({ role: r, meta }) => (
                        <Badge
                          key={r}
                          variant='outline'
                          className='text-[11px] gap-1 bg-slate-50'
                        >
                          {meta.name}
                          <span className='text-muted-foreground'>
                            ({meta.userCount})
                          </span>
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Actions */}
            <div className='flex items-center gap-2'>
              <Button
                size='sm'
                variant='outline'
                className='h-8 text-xs gap-1'
                onClick={() => copyToClipboard(markdownReport, setCopied)}
              >
                <Copy className='h-3 w-3' />
                {copied ? 'Copied!' : 'Copy report as Markdown'}
              </Button>
              <Button
                size='sm'
                variant='ghost'
                className='h-8 text-xs'
                onClick={clear}
              >
                Clear
              </Button>
            </div>
          </div>
        ) : (
          <div className='flex items-center gap-2'>
            <Button
              size='sm'
              variant='ghost'
              className='h-8 text-xs'
              onClick={clear}
            >
              Clear
            </Button>
            <span className='text-xs text-muted-foreground'>
              Select a role and permission to preview impact.
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Scenario 2 — Delete a role ───────────────────────────────────────────────

function DeleteRoleScenario({ data }: ScenarioProps) {
  const [role, setRole] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const labelMap = useMemo(buildPermLabelMap, []);

  const clear = () => setRole('');

  const roleMeta = role ? data.roleMeta[role] : undefined;
  const affectedUsers = roleMeta?.userCount ?? 0;
  const isDangerousSystem =
    role === 'super_admin' || roleMeta?.isSystem === true;

  // Permissions this role grants.
  const rolePerms = useMemo(() => {
    if (!role) return [] as string[];
    return Object.keys(data.matrix).filter(
      (k) => data.matrix[k]?.[role] === true
    );
  }, [data, role]);

  // For each perm, is there another role that grants it?
  const permCoverage = useMemo(() => {
    if (!role) return [] as Array<{ permKey: string; orphaned: boolean }>;
    return rolePerms
      .map((permKey) => {
        const others = data.roles.filter(
          (r) => r !== role && data.matrix[permKey]?.[r] === true
        );
        return { permKey, orphaned: others.length === 0 };
      })
      .sort((a, b) => {
        if (a.orphaned !== b.orphaned) return a.orphaned ? -1 : 1;
        return a.permKey.localeCompare(b.permKey);
      });
  }, [rolePerms, data, role]);

  const orphanedCount = permCoverage.filter((p) => p.orphaned).length;

  const severity: Severity = useMemo(() => {
    if (!role) return 'green';
    if (isDangerousSystem) return 'red';
    if (orphanedCount >= 6) return 'red';
    if (affectedUsers > 50) return 'red';
    if (orphanedCount >= 1) return 'amber';
    if (affectedUsers > 5) return 'amber';
    return 'green';
  }, [role, isDangerousSystem, orphanedCount, affectedUsers]);

  const canShowReport = !!role;

  const markdownReport = useMemo(() => {
    if (!canShowReport) return '';
    const lines: string[] = [];
    lines.push(`# Scenario: Delete Role`);
    lines.push('');
    lines.push(`- **Role:** ${roleMeta?.name ?? role} (\`${role}\`)`);
    lines.push(`- **System role:** ${roleMeta?.isSystem ? 'YES' : 'no'}`);
    lines.push(`- **Users affected:** ${affectedUsers}`);
    lines.push(`- **Permissions granted by this role:** ${rolePerms.length}`);
    lines.push(`- **Orphaned permissions:** ${orphanedCount}`);
    lines.push(`- **Severity:** ${severityLabel(severity)}`);
    if (isDangerousSystem)
      lines.push(
        `- **WARNING:** System / super_admin role — DO NOT PROCEED.`
      );
    lines.push('');
    if (orphanedCount > 0) {
      lines.push(`## Orphaned permissions (no other role grants these)`);
      for (const p of permCoverage.filter((x) => x.orphaned)) {
        lines.push(`- \`${p.permKey}\``);
      }
    }
    return lines.join('\n');
  }, [
    canShowReport,
    role,
    roleMeta,
    affectedUsers,
    rolePerms,
    orphanedCount,
    severity,
    isDangerousSystem,
    permCoverage
  ]);

  return (
    <Card>
      <CardHeader className='pb-3'>
        <CardTitle className='text-base font-semibold'>
          Delete a role
        </CardTitle>
        <p className='text-xs text-muted-foreground mt-1'>
          Preview which permissions would become orphaned (granted by no other
          role) and how many users would lose access.
        </p>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='space-y-1.5 max-w-md'>
          <label className='text-xs font-medium text-muted-foreground'>
            Role to delete
          </label>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger className='w-full h-9 text-xs'>
              <SelectValue placeholder='Select role' />
            </SelectTrigger>
            <SelectContent className='max-h-80'>
              {data.roles
                .map((r) => ({ r, meta: data.roleMeta[r] }))
                .filter((x) => !!x.meta)
                .sort((a, b) => a.meta.name.localeCompare(b.meta.name))
                .map(({ r, meta }) => (
                  <SelectItem key={r} value={r} className='text-xs'>
                    {meta.name}
                    <span className='ml-1 text-muted-foreground'>
                      ({meta.userCount} user
                      {meta.userCount !== 1 ? 's' : ''}
                      {meta.isSystem ? ' · system' : ''})
                    </span>
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        {canShowReport ? (
          <div className='space-y-3'>
            {/* Do-not-proceed warning */}
            {isDangerousSystem && (
              <Card className='border-l-4 border-l-rose-600 bg-rose-50'>
                <CardContent className='pt-4 pb-4'>
                  <div className='flex items-start gap-2'>
                    <ShieldAlert className='h-5 w-5 text-rose-600 mt-0.5 shrink-0' />
                    <div>
                      <div className='text-sm font-semibold text-rose-700'>
                        Do not proceed
                      </div>
                      <p className='text-xs text-rose-700 mt-1'>
                        This is a system-critical role. Deleting{' '}
                        <span className='font-mono'>{role}</span> can lock
                        administrators out of MyJKKN. Contact a system owner
                        before any change.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Summary */}
            <Card
              className={`border-l-4 ${
                severity === 'red'
                  ? 'border-l-rose-500'
                  : severity === 'amber'
                    ? 'border-l-amber-500'
                    : 'border-l-emerald-500'
              }`}
            >
              <CardContent className='pt-4 pb-4 space-y-2'>
                <div className='flex items-center justify-between gap-2 flex-wrap'>
                  <div className='flex items-center gap-2'>
                    <Users className='h-4 w-4 text-muted-foreground' />
                    <span className='text-sm font-medium'>
                      {affectedUsers} user
                      {affectedUsers !== 1 ? 's' : ''} affected
                    </span>
                  </div>
                  <Badge
                    variant='outline'
                    className={`text-[11px] ${severityColorClass(severity)}`}
                  >
                    {severityLabel(severity)}
                  </Badge>
                </div>
                <div className='flex items-center gap-3 flex-wrap text-[11px] text-muted-foreground'>
                  <span>
                    <span className='font-medium text-foreground'>
                      {rolePerms.length}
                    </span>{' '}
                    permission{rolePerms.length !== 1 ? 's' : ''} granted
                  </span>
                  <span>·</span>
                  <span>
                    <span className='font-medium text-foreground'>
                      {orphanedCount}
                    </span>{' '}
                    orphaned (no other role covers)
                  </span>
                  {roleMeta?.isSystem && (
                    <>
                      <span>·</span>
                      <Badge
                        variant='outline'
                        className='text-[10px] bg-rose-50 text-rose-700 border-rose-200'
                      >
                        System role
                      </Badge>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Orphaned list */}
            {orphanedCount > 0 && (
              <Card className='border-l-4 border-l-rose-500'>
                <CardHeader className='pb-2'>
                  <CardTitle className='text-sm font-semibold flex items-center gap-2'>
                    <AlertTriangle className='h-4 w-4 text-rose-500' />
                    Orphaned permissions ({orphanedCount})
                  </CardTitle>
                  <p className='text-[11px] text-muted-foreground'>
                    Only this role grants these permissions. Deleting the role
                    removes them system-wide (except super_admin).
                  </p>
                </CardHeader>
                <CardContent className='pt-0'>
                  <div className='flex flex-wrap gap-1.5'>
                    {permCoverage
                      .filter((p) => p.orphaned)
                      .map((p) => (
                        <Badge
                          key={p.permKey}
                          variant='outline'
                          className='text-[11px] font-mono bg-rose-50 border-rose-200 text-rose-800'
                          title={labelMap.get(p.permKey) ?? p.permKey}
                        >
                          {p.permKey}
                        </Badge>
                      ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* All perms */}
            {rolePerms.length > 0 && (
              <Card>
                <CardHeader className='pb-2'>
                  <CardTitle className='text-sm font-semibold'>
                    All permissions granted by this role
                  </CardTitle>
                </CardHeader>
                <CardContent className='pt-0'>
                  <details>
                    <summary className='text-[11px] text-muted-foreground cursor-pointer hover:text-foreground select-none'>
                      Show {rolePerms.length} permission
                      {rolePerms.length !== 1 ? 's' : ''}
                    </summary>
                    <div className='mt-2 flex flex-wrap gap-1'>
                      {permCoverage.map((p) => (
                        <Badge
                          key={p.permKey}
                          variant='outline'
                          className={`text-[10px] font-mono ${
                            p.orphaned
                              ? 'bg-rose-50 border-rose-200 text-rose-800'
                              : 'bg-slate-50 text-slate-600'
                          }`}
                        >
                          {p.permKey}
                        </Badge>
                      ))}
                    </div>
                  </details>
                </CardContent>
              </Card>
            )}

            {/* Actions */}
            <div className='flex items-center gap-2'>
              <Button
                size='sm'
                variant='outline'
                className='h-8 text-xs gap-1'
                onClick={() => copyToClipboard(markdownReport, setCopied)}
              >
                <Copy className='h-3 w-3' />
                {copied ? 'Copied!' : 'Copy report as Markdown'}
              </Button>
              <Button
                size='sm'
                variant='ghost'
                className='h-8 text-xs'
                onClick={clear}
              >
                Clear
              </Button>
            </div>
          </div>
        ) : (
          <div className='flex items-center gap-2'>
            <Button
              size='sm'
              variant='ghost'
              className='h-8 text-xs'
              onClick={clear}
            >
              Clear
            </Button>
            <span className='text-xs text-muted-foreground'>
              Select a role to preview the effect of deleting it.
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Scenario 3 — Grant permission to all users in an institution ─────────────

function GrantInstitutionScenario({ data }: ScenarioProps) {
  const [institution, setInstitution] = useState<string>('');
  const [permKey, setPermKey] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const labelMap = useMemo(buildPermLabelMap, []);

  const clear = () => {
    setInstitution('');
    setPermKey('');
  };

  const institutionEntry = institution
    ? INSTITUTIONS.find((i) => i.value === institution)
    : undefined;
  const adminLevel = permKey ? isAdminLevel(permKey) : false;
  const { module: modSegment } = permKey
    ? classifyPerm(permKey)
    : { module: '' };

  // Which roles currently grant this perm?
  const rolesGranting = useMemo(() => {
    if (!permKey) return [] as Array<{ role: string; meta: RoleMeta }>;
    return data.roles
      .filter((r) => data.matrix[permKey]?.[r] === true)
      .map((r) => ({ role: r, meta: data.roleMeta[r] }))
      .filter((x) => !!x.meta)
      .sort((a, b) => b.meta.userCount - a.meta.userCount);
  }, [data, permKey]);

  const canShowReport = institution && permKey;

  const markdownReport = useMemo(() => {
    if (!canShowReport) return '';
    const lines: string[] = [];
    lines.push(`# Scenario: Grant Permission to an Institution`);
    lines.push('');
    lines.push(
      `- **Institution:** ${institutionEntry?.label ?? institution} (\`${institution}\`)`
    );
    lines.push(`- **Permission:** \`${permKey}\``);
    if (labelMap.has(permKey))
      lines.push(`- **Label:** ${labelMap.get(permKey)}`);
    lines.push(`- **Module:** ${moduleLabel(modSegment)}`);
    lines.push(
      `- **Admin-level permission:** ${adminLevel ? 'YES — privilege escalation risk' : 'no'}`
    );
    lines.push('');
    lines.push(
      `**Note:** User counts per institution are not available in the matrix API. This simulator previews the permission effect only, not the user-count blast radius.`
    );
    lines.push('');
    if (rolesGranting.length > 0) {
      lines.push(`## Roles that already grant this permission`);
      for (const { role, meta } of rolesGranting)
        lines.push(`- ${meta.name} (${meta.userCount} users)`);
    }
    lines.push('');
    lines.push(`## Safety checklist`);
    lines.push(`- [ ] Does this permission make sense for students?`);
    lines.push(`- [ ] Does this permission make sense for faculty?`);
    lines.push(`- [ ] Does this permission make sense for staff?`);
    lines.push(`- [ ] Is the change reversible?`);
    lines.push(
      `- [ ] Does the permission expose data from OTHER institutions?`
    );
    return lines.join('\n');
  }, [
    canShowReport,
    institution,
    institutionEntry,
    permKey,
    labelMap,
    modSegment,
    adminLevel,
    rolesGranting
  ]);

  return (
    <Card>
      <CardHeader className='pb-3'>
        <CardTitle className='text-base font-semibold'>
          Grant a permission to all users in an institution
        </CardTitle>
        <p className='text-xs text-muted-foreground mt-1'>
          Preview the theoretical effect of an institution-scoped grant. User
          counts per institution are not available from the matrix API.
        </p>
      </CardHeader>
      <CardContent className='space-y-4'>
        {/* Inputs */}
        <div className='grid gap-3 md:grid-cols-2'>
          <div className='space-y-1.5'>
            <label className='text-xs font-medium text-muted-foreground'>
              Institution
            </label>
            <Select value={institution} onValueChange={setInstitution}>
              <SelectTrigger className='w-full h-9 text-xs'>
                <SelectValue placeholder='Select institution' />
              </SelectTrigger>
              <SelectContent className='max-h-80'>
                {INSTITUTIONS.map((i) => (
                  <SelectItem key={i.value} value={i.value} className='text-xs'>
                    {i.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className='space-y-1.5'>
            <label className='text-xs font-medium text-muted-foreground'>
              Permission
            </label>
            <PermissionPicker
              data={data}
              value={permKey}
              onChange={setPermKey}
              placeholder='Select permission to grant'
            />
          </div>
        </div>

        {canShowReport ? (
          <div className='space-y-3'>
            {/* Data-availability note */}
            <Card className='border-l-4 border-l-slate-400'>
              <CardContent className='pt-4 pb-4'>
                <div className='flex items-start gap-2'>
                  <Info className='h-4 w-4 text-slate-500 mt-0.5 shrink-0' />
                  <p className='text-xs text-muted-foreground'>
                    <span className='font-medium text-foreground'>
                      User count per institution requires live data.
                    </span>{' '}
                    This simulator computes theoretical effect only. Use
                    role-management to apply the change and verify counts.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Scope preview */}
            <Card
              className={`border-l-4 ${
                adminLevel ? 'border-l-rose-500' : 'border-l-indigo-500'
              }`}
            >
              <CardContent className='pt-4 pb-4 space-y-2'>
                <div className='flex items-center justify-between gap-2 flex-wrap'>
                  <div className='text-sm font-medium'>
                    {institutionEntry?.label ?? institution}
                  </div>
                  {adminLevel && (
                    <Badge
                      variant='outline'
                      className='text-[11px] bg-rose-50 text-rose-700 border-rose-200 gap-1'
                    >
                      <ShieldAlert className='h-3 w-3' />
                      Privilege escalation risk
                    </Badge>
                  )}
                </div>
                <div className='text-xs text-muted-foreground'>
                  Grant{' '}
                  <span className='font-mono text-foreground'>{permKey}</span>
                  {labelMap.has(permKey) && (
                    <span className='ml-1'>
                      ({labelMap.get(permKey)})
                    </span>
                  )}{' '}
                  under module{' '}
                  <span className='font-medium text-foreground'>
                    {moduleLabel(modSegment)}
                  </span>
                  .
                </div>
                {rolesGranting.length > 0 && (
                  <div className='pt-1'>
                    <div className='text-[11px] text-muted-foreground mb-1'>
                      Roles that already grant this permission:
                    </div>
                    <div className='flex flex-wrap gap-1.5'>
                      {rolesGranting.map(({ role, meta }) => (
                        <Badge
                          key={role}
                          variant='outline'
                          className='text-[11px] gap-1 bg-slate-50'
                        >
                          {meta.name}
                          <span className='text-muted-foreground'>
                            ({meta.userCount})
                          </span>
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Safety checklist */}
            <Card>
              <CardHeader className='pb-2'>
                <CardTitle className='text-sm font-semibold'>
                  Safety checklist
                </CardTitle>
                <p className='text-[11px] text-muted-foreground'>
                  Confirm each item before applying this change in
                  role-management.
                </p>
              </CardHeader>
              <CardContent className='pt-0'>
                <ul className='space-y-1.5 text-xs text-muted-foreground'>
                  <li className='flex items-start gap-2'>
                    <span className='text-slate-400 mt-0.5'>☐</span>
                    <span>
                      Does this permission make sense for{' '}
                      <span className='font-medium text-foreground'>
                        students
                      </span>
                      ?
                    </span>
                  </li>
                  <li className='flex items-start gap-2'>
                    <span className='text-slate-400 mt-0.5'>☐</span>
                    <span>
                      Does this permission make sense for{' '}
                      <span className='font-medium text-foreground'>
                        faculty
                      </span>
                      ?
                    </span>
                  </li>
                  <li className='flex items-start gap-2'>
                    <span className='text-slate-400 mt-0.5'>☐</span>
                    <span>
                      Does this permission make sense for{' '}
                      <span className='font-medium text-foreground'>
                        staff
                      </span>
                      ?
                    </span>
                  </li>
                  <li className='flex items-start gap-2'>
                    <span className='text-slate-400 mt-0.5'>☐</span>
                    <span>
                      Is the change{' '}
                      <span className='font-medium text-foreground'>
                        reversible
                      </span>
                      ?
                    </span>
                  </li>
                  <li className='flex items-start gap-2'>
                    <span className='text-slate-400 mt-0.5'>☐</span>
                    <span>
                      Does the permission expose data from{' '}
                      <span className='font-medium text-foreground'>
                        other institutions
                      </span>
                      ?
                    </span>
                  </li>
                </ul>
              </CardContent>
            </Card>

            {/* Actions */}
            <div className='flex items-center gap-2'>
              <Button
                size='sm'
                variant='outline'
                className='h-8 text-xs gap-1'
                onClick={() => copyToClipboard(markdownReport, setCopied)}
              >
                <Copy className='h-3 w-3' />
                {copied ? 'Copied!' : 'Copy report as Markdown'}
              </Button>
              <Button
                size='sm'
                variant='ghost'
                className='h-8 text-xs'
                onClick={clear}
              >
                Clear
              </Button>
            </div>
          </div>
        ) : (
          <div className='flex items-center gap-2'>
            <Button
              size='sm'
              variant='ghost'
              className='h-8 text-xs'
              onClick={clear}
            >
              Clear
            </Button>
            <span className='text-xs text-muted-foreground'>
              Select an institution and permission to preview scope.
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
