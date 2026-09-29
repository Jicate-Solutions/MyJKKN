'use client';
// ============================================
// ROLES TAB — HEADCOUNT PER SYSTEM ROLE
// ============================================
// Created: 2026-09-25
// Counts staff by staff.role_key (labelled with custom_roles.role_name —
// Senior Learner, HOD, Staff, …) under the dashboard's filter bar, and lists the
// employees behind each count. Clicking a card or bar narrows the list.
// ============================================

import { useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ShieldCheck, Users, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StaffRoleStats } from '@/types/staff';
import { RoleMembersTable } from './role-members-table';

const ALL_ROLES = '__all__';

const PRIMARY = '#3b82f6';
const MUTED = '#cbd5e1';

const RoleTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className='rounded-lg border bg-background p-3 shadow-lg'>
      <p className='font-medium'>{d.roleName}</p>
      <div className='mt-2 space-y-1 text-sm'>
        <div className='flex justify-between gap-4'>
          <span className='text-muted-foreground'>Employees:</span>
          <span className='font-medium'>{d.count.toLocaleString()}</span>
        </div>
        <div className='flex justify-between gap-4'>
          <span className='text-green-600'>Active:</span>
          <span className='font-medium'>{d.activeCount.toLocaleString()}</span>
        </div>
        <div className='flex justify-between gap-4'>
          <span className='text-muted-foreground'>Share:</span>
          <span className='font-medium'>{d.percentage.toFixed(1)}%</span>
        </div>
      </div>
    </div>
  );
};

interface RoleAnalyticsProps {
  data?: StaffRoleStats;
  isLoading: boolean;
}

export function RoleAnalytics({ data, isLoading }: RoleAnalyticsProps) {
  const [selectedRole, setSelectedRole] = useState<string>(ALL_ROLES);

  const roles = data?.roles ?? [];
  // A dashboard filter can remove the selected role entirely; fall back to all.
  const activeRole = roles.some((r) => r.roleKey === selectedRole) ? selectedRole : ALL_ROLES;
  const activeRoleName = roles.find((r) => r.roleKey === activeRole)?.roleName;

  const members = useMemo(() => {
    const all = data?.members ?? [];
    return activeRole === ALL_ROLES ? all : all.filter((m) => m.roleKey === activeRole);
  }, [data?.members, activeRole]);

  const toggleRole = (roleKey: string) =>
    setSelectedRole((current) => (current === roleKey ? ALL_ROLES : roleKey));

  if (isLoading || !data) {
    return (
      <div className='space-y-6'>
        <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className='h-20' />
          ))}
        </div>
        <Skeleton className='h-80' />
      </div>
    );
  }

  const chartHeight = Math.max(240, roles.length * 28);

  return (
    <div className='space-y-6'>
      {/* Summary */}
      <div className='grid gap-4 sm:grid-cols-2'>
        <Card>
          <CardContent className='flex items-center gap-4 p-5'>
            <Users className='h-8 w-8 text-primary' />
            <div>
              <p className='text-sm text-muted-foreground'>Total Employees</p>
              <p className='text-2xl font-bold'>{data.total.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className='flex items-center gap-4 p-5'>
            <ShieldCheck className='h-8 w-8 text-primary' />
            <div>
              <p className='text-sm text-muted-foreground'>Distinct Roles</p>
              <p className='text-2xl font-bold'>{roles.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Role cards */}
      <Card>
        <CardHeader>
          <CardTitle>Employees per Role</CardTitle>
          <CardDescription>
            Click a role to list its employees below. Counts follow the filters above.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {roles.length === 0 ? (
            <p className='text-sm text-muted-foreground'>No employees match the current filters.</p>
          ) : (
            <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
              {roles.map((r) => (
                <button
                  key={r.roleKey}
                  type='button'
                  onClick={() => toggleRole(r.roleKey)}
                  className={cn(
                    'rounded-lg border p-3 text-left transition-colors hover:bg-muted/50',
                    activeRole === r.roleKey && 'border-primary bg-primary/5 ring-1 ring-primary'
                  )}
                >
                  <p className='truncate text-sm font-medium' title={r.roleName}>
                    {r.roleName}
                  </p>
                  <div className='mt-1 flex items-baseline justify-between gap-2'>
                    <span className='text-2xl font-bold'>{r.count.toLocaleString()}</span>
                    <span className='text-xs text-muted-foreground'>{r.percentage.toFixed(1)}%</span>
                  </div>
                  <p className='text-xs text-muted-foreground'>
                    {r.activeCount.toLocaleString()} active
                  </p>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bar chart */}
      {roles.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Role Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width='100%' height={chartHeight}>
              <BarChart data={roles} layout='vertical' margin={{ left: 8, right: 24 }}>
                <CartesianGrid strokeDasharray='3 3' horizontal={false} />
                <XAxis type='number' allowDecimals={false} />
                <YAxis type='category' dataKey='roleName' width={170} tick={{ fontSize: 12 }} />
                <Tooltip content={<RoleTooltip />} cursor={{ fillOpacity: 0.1 }} />
                <Bar
                  dataKey='count'
                  radius={[0, 4, 4, 0]}
                  className='cursor-pointer'
                  onClick={(entry: any) => entry?.roleKey && toggleRole(entry.roleKey)}
                >
                  {roles.map((r) => (
                    <Cell
                      key={r.roleKey}
                      fill={activeRole === ALL_ROLES || activeRole === r.roleKey ? PRIMARY : MUTED}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Name list */}
      <Card>
        <CardHeader>
          <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
            <div className='min-w-0'>
              <CardTitle className='flex flex-wrap items-center gap-2'>
                {activeRoleName ? `${activeRoleName} — Employees` : 'All Employees by Role'}
                <Badge variant='outline'>{members.length.toLocaleString()}</Badge>
              </CardTitle>
              <CardDescription className='mt-1'>
                Name and institution email of every employee in the selected role.
              </CardDescription>
            </div>
            <div className='flex items-center gap-2'>
              <Select value={activeRole} onValueChange={setSelectedRole}>
                <SelectTrigger className='w-full sm:w-[220px]'>
                  <SelectValue placeholder='All roles' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_ROLES}>All roles</SelectItem>
                  {roles.map((r) => (
                    <SelectItem key={r.roleKey} value={r.roleKey}>
                      {r.roleName} ({r.count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {activeRole !== ALL_ROLES && (
                <Button
                  variant='ghost'
                  size='icon'
                  aria-label='Clear role'
                  onClick={() => setSelectedRole(ALL_ROLES)}
                >
                  <X className='h-4 w-4' />
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <RoleMembersTable
            members={members}
            scopeLabel={activeRoleName ? `Role: ${activeRoleName}` : 'All roles'}
          />
        </CardContent>
      </Card>
    </div>
  );
}
