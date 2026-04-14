'use client';

import { useEffect, useState } from 'react';
import { PlainHealthCards } from './plain-health-cards';
import { BeatLoader } from 'react-spinners';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Users,
  AlertTriangle,
  AlertCircle,
  Shield,
  ShieldCheck
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface HealthTotals {
  users: number;
  orphans: number;
  mismatches: number;
  roles: number;
  superAdmins: number;
}

interface OrphanByRole {
  role: string;
  count: number;
}

interface UserPerRole {
  roleKey: string;
  roleName: string;
  profileCount: number;
  userRolesCount: number;
  delta: number;
}

interface PermissionHealth {
  roleKey: string;
  roleName: string;
  isSystemRole: boolean;
  totalDefined: number;
  granted: number;
  grantedPercent: number;
  flagged: boolean;
}

interface SuperAdminEntry {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_super_admin: boolean;
  is_active: boolean;
  last_login: string | null;
  hasUserRolesEntry: boolean;
}

interface HealthData {
  totals: HealthTotals;
  orphansByRole: OrphanByRole[];
  usersPerRole: UserPerRole[];
  permissionHealth: PermissionHealth[];
  superAdminList: SuperAdminEntry[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString();
}

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  variant?: 'neutral' | 'danger' | 'success';
}

function StatCard({ label, value, icon, variant = 'neutral' }: StatCardProps) {
  const bgMap = {
    neutral: 'bg-slate-50 dark:bg-slate-900',
    danger: 'bg-red-50 dark:bg-red-950',
    success: 'bg-emerald-50 dark:bg-emerald-950'
  };
  const textMap = {
    neutral: 'text-slate-700 dark:text-slate-300',
    danger: 'text-red-600 dark:text-red-400',
    success: 'text-emerald-600 dark:text-emerald-400'
  };

  return (
    <Card className={`relative overflow-hidden ${bgMap[variant]} hover:shadow-md transition-shadow`}>
      <CardContent className='pt-6 pb-5'>
        <div className='absolute top-4 right-4 opacity-60'>{icon}</div>
        <p className={`text-3xl font-bold tracking-tight ${textMap[variant]}`}>
          {fmt(value)}
        </p>
        <p className='text-sm text-muted-foreground mt-1 font-medium'>{label}</p>
      </CardContent>
    </Card>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface SystemHealthTabProps {
  /** Allow child action buttons (e.g. "View RLS audit") to switch the parent's tabs */
  onSwitchTab?: (tab: string) => void;
}

export function SystemHealthTab({ onSwitchTab }: SystemHealthTabProps = {}) {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'plain' | 'technical'>('plain');

  // Action handler for PlainHealthCards buttons
  const handleHealthAction = (
    action: 'show-orphans' | 'show-mismatches' | 'show-super-admins' | 'show-tables'
  ) => {
    switch (action) {
      case 'show-orphans':
      case 'show-mismatches':
        // Both orphan counts and role mismatches show in the "Users Per Role" table
        // (Profiles vs User Roles columns + Delta column)
        document
          .getElementById('users-per-role-section')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        break;
      case 'show-super-admins':
        document
          .getElementById('super-admins-section')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        break;
      case 'show-tables':
        // Switch the parent tabs container to the RLS Audit tab
        onSwitchTab?.('rls');
        break;
    }
  };

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch('/api/users/permissions-audit/health');
        if (!res.ok) {
          throw new Error(`Failed to load health data (${res.status})`);
        }
        const json = await res.json();
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchHealth();
  }, []);

  if (loading) {
    return (
      <div className='flex justify-center items-center min-h-[400px]'>
        <BeatLoader color='#6366f1' size={12} />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant='destructive' className='m-4'>
        <AlertCircle className='h-4 w-4' />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!data) return null;

  const { totals, usersPerRole, permissionHealth, superAdminList } = data;

  const sortedUserPerRole = [...usersPerRole].sort(
    (a, b) => b.profileCount - a.profileCount
  );

  const sortedPermHealth = [...permissionHealth].sort(
    (a, b) => b.granted - a.granted
  );

  return (
    <div className='space-y-6'>
      {/* ── View Toggle + Stat Cards ── */}
      <div>
        <div className='flex justify-between items-center mb-4'>
          <div className='text-xs text-muted-foreground'>
            Toggle between plain-English summary and technical counts
          </div>
          <div className='inline-flex rounded-md border overflow-hidden'>
            <button
              onClick={() => setView('plain')}
              className={`px-3 py-1 text-xs transition-colors ${
                view === 'plain' ? 'bg-slate-900 text-white' : 'bg-white hover:bg-slate-50'
              }`}
            >
              Plain English
            </button>
            <button
              onClick={() => setView('technical')}
              className={`px-3 py-1 text-xs transition-colors ${
                view === 'technical' ? 'bg-slate-900 text-white' : 'bg-white hover:bg-slate-50'
              }`}
            >
              Technical
            </button>
          </div>
        </div>

        {view === 'plain' ? (
          <PlainHealthCards data={data} onAction={handleHealthAction} />
        ) : (
          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
            <StatCard
              label='Total Users'
              value={totals.users}
              icon={<Users className='h-6 w-6 text-slate-400' />}
              variant='neutral'
            />
            <StatCard
              label='Orphan Users'
              value={totals.orphans}
              icon={<AlertTriangle className='h-6 w-6' />}
              variant={totals.orphans > 0 ? 'danger' : 'success'}
            />
            <StatCard
              label='Role Mismatches'
              value={totals.mismatches}
              icon={<AlertCircle className='h-6 w-6' />}
              variant={totals.mismatches > 0 ? 'danger' : 'success'}
            />
            <StatCard
              label='Active Roles'
              value={totals.roles}
              icon={<Shield className='h-6 w-6 text-slate-400' />}
              variant='neutral'
            />
          </div>
        )}
      </div>

      {/* ── Users Per Role Table ── */}
      <Card id='users-per-role-section' className='hover:shadow-md transition-shadow scroll-mt-20'>
        <CardHeader className='pb-3'>
          <CardTitle className='text-base font-semibold flex items-center gap-2'>
            <Users className='h-4 w-4 text-indigo-500' />
            Users Per Role
          </CardTitle>
        </CardHeader>
        <CardContent className='p-0'>
          <div className='overflow-x-auto'>
            <table className='w-full text-sm'>
              <thead>
                <tr className='border-b bg-muted/40'>
                  <th className='text-left px-4 py-3 font-medium text-muted-foreground'>Role</th>
                  <th className='text-right px-4 py-3 font-medium text-muted-foreground'>Profiles</th>
                  <th className='text-right px-4 py-3 font-medium text-muted-foreground'>User Roles</th>
                  <th className='text-right px-4 py-3 font-medium text-muted-foreground'>Delta</th>
                </tr>
              </thead>
              <tbody>
                {sortedUserPerRole.map((row) => (
                  <tr
                    key={row.roleKey}
                    className='border-b last:border-0 hover:bg-muted/20 transition-colors'
                  >
                    <td className='px-4 py-3'>
                      <span className='font-medium'>{row.roleName}</span>
                      <span className='ml-2 text-xs text-muted-foreground'>{row.roleKey}</span>
                    </td>
                    <td className='px-4 py-3 text-right font-mono'>
                      {fmt(row.profileCount)}
                    </td>
                    <td className='px-4 py-3 text-right font-mono'>
                      {fmt(row.userRolesCount)}
                    </td>
                    <td className='px-4 py-3 text-right font-mono font-semibold'>
                      {row.delta === 0 ? (
                        <span className='text-emerald-500'>0</span>
                      ) : (
                        <span className='text-red-500'>
                          {row.delta > 0 ? '+' : ''}{row.delta}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ── Permission Health Table ── */}
      <Card className='hover:shadow-md transition-shadow'>
        <CardHeader className='pb-3'>
          <CardTitle className='text-base font-semibold flex items-center gap-2'>
            <Shield className='h-4 w-4 text-indigo-500' />
            Permission Health
          </CardTitle>
        </CardHeader>
        <CardContent className='p-0'>
          <div className='overflow-x-auto'>
            <table className='w-full text-sm'>
              <thead>
                <tr className='border-b bg-muted/40'>
                  <th className='text-left px-4 py-3 font-medium text-muted-foreground'>Role</th>
                  <th className='text-right px-4 py-3 font-medium text-muted-foreground'>Defined</th>
                  <th className='text-right px-4 py-3 font-medium text-muted-foreground'>Granted</th>
                  <th className='px-4 py-3 font-medium text-muted-foreground w-40'>Coverage</th>
                </tr>
              </thead>
              <tbody>
                {sortedPermHealth.map((row) => (
                  <tr
                    key={row.roleKey}
                    className='border-b last:border-0 hover:bg-muted/20 transition-colors'
                  >
                    <td className='px-4 py-3'>
                      <div className='flex items-center gap-2'>
                        {row.flagged && (
                          <AlertTriangle className='h-3.5 w-3.5 text-amber-500 shrink-0' />
                        )}
                        <span className='font-medium'>{row.roleName}</span>
                        {row.isSystemRole && (
                          <Badge variant='secondary' className='text-xs px-1.5 py-0'>
                            System
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className='px-4 py-3 text-right font-mono text-muted-foreground'>
                      {fmt(row.totalDefined)}
                    </td>
                    <td className='px-4 py-3 text-right font-mono font-semibold'>
                      {fmt(row.granted)}
                    </td>
                    <td className='px-4 py-3'>
                      <div className='flex items-center gap-2'>
                        <div className='flex-1 h-2 rounded-full bg-muted overflow-hidden'>
                          <div
                            className={`h-full rounded-full transition-all ${
                              row.grantedPercent >= 80
                                ? 'bg-emerald-500'
                                : row.grantedPercent >= 50
                                ? 'bg-amber-400'
                                : 'bg-red-500'
                            }`}
                            style={{ width: `${Math.min(row.grantedPercent, 100)}%` }}
                          />
                        </div>
                        <span className='text-xs font-mono text-muted-foreground w-8 text-right'>
                          {row.grantedPercent}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ── Super Admin List Table ── */}
      <Card id='super-admins-section' className='hover:shadow-md transition-shadow scroll-mt-20'>
        <CardHeader className='pb-3'>
          <CardTitle className='text-base font-semibold flex items-center gap-2'>
            <ShieldCheck className='h-4 w-4 text-indigo-500' />
            Super Admins
            <Badge className='ml-1 text-xs' variant='secondary'>
              {superAdminList.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className='p-0'>
          <div className='overflow-x-auto'>
            <table className='w-full text-sm'>
              <thead>
                <tr className='border-b bg-muted/40'>
                  <th className='text-left px-4 py-3 font-medium text-muted-foreground'>Name</th>
                  <th className='text-left px-4 py-3 font-medium text-muted-foreground'>Email</th>
                  <th className='text-left px-4 py-3 font-medium text-muted-foreground'>Last Login</th>
                  <th className='text-left px-4 py-3 font-medium text-muted-foreground'>Status</th>
                  <th className='text-left px-4 py-3 font-medium text-muted-foreground'>Roles Entry</th>
                </tr>
              </thead>
              <tbody>
                {superAdminList.map((admin) => (
                  <tr
                    key={admin.id}
                    className='border-b last:border-0 hover:bg-muted/20 transition-colors'
                  >
                    <td className='px-4 py-3 font-medium'>{admin.full_name}</td>
                    <td className='px-4 py-3 text-muted-foreground'>{admin.email}</td>
                    <td className='px-4 py-3 text-muted-foreground'>
                      {fmtDate(admin.last_login)}
                    </td>
                    <td className='px-4 py-3'>
                      {admin.is_active ? (
                        <Badge className='bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-0 text-xs'>
                          Active
                        </Badge>
                      ) : (
                        <Badge variant='secondary' className='text-xs'>
                          Inactive
                        </Badge>
                      )}
                    </td>
                    <td className='px-4 py-3'>
                      {admin.hasUserRolesEntry ? (
                        <Badge className='bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-0 text-xs'>
                          Present
                        </Badge>
                      ) : (
                        <Badge className='bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border-0 text-xs flex items-center gap-1 w-fit'>
                          <AlertTriangle className='h-3 w-3' />
                          Missing
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
