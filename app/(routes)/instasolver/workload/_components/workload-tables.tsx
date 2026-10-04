'use client';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { MaintenanceTeam, Workload } from '@/types/instasolver';

/** Oldest open item as "N days" / "N hours" (the RPC returns hours). */
export function oldestLabel(hours: number | null): string {
  if (hours === null || hours === undefined) return '—';
  const h = Number(hours);
  if (h < 24) {
    const n = Math.max(0, Math.round(h));
    return `${n} ${n === 1 ? 'hour' : 'hours'}`;
  }
  const d = Math.floor(h / 24);
  return `${d} ${d === 1 ? 'day' : 'days'}`;
}

function Num({ value, tone }: { value: number; tone?: 'danger' | 'warning' }) {
  return (
    <span
      className={cn(
        'tabular-nums',
        value === 0 && 'text-muted-foreground',
        value > 0 && tone === 'danger' && 'font-semibold text-red-700 dark:text-red-300',
        value > 0 && tone === 'warning' && 'font-semibold text-amber-700 dark:text-amber-300'
      )}
    >
      {value}
    </span>
  );
}

const numHead = 'text-right whitespace-nowrap';
const numCell = 'text-right';

export function TeamsTable({ teams }: { teams: Workload['teams'] }) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Team</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Institution</TableHead>
            <TableHead className={numHead}>Members</TableHead>
            <TableHead className={numHead}>Active</TableHead>
            <TableHead className={numHead}>Unclaimed</TableHead>
            <TableHead className={numHead}>Critical</TableHead>
            <TableHead className={numHead}>Urgent</TableHead>
            <TableHead className={numHead}>High</TableHead>
            <TableHead className={numHead}>Open 7+ days</TableHead>
            <TableHead className={numHead}>Oldest open</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {teams.map((t) => (
            <TableRow key={t.team_id}>
              <TableCell className="font-medium">{t.team_name}</TableCell>
              <TableCell>{t.category ?? '—'}</TableCell>
              <TableCell>{t.institution ?? 'All institutions'}</TableCell>
              <TableCell className={numCell}><Num value={t.members} /></TableCell>
              <TableCell className={numCell}><Num value={t.active} /></TableCell>
              <TableCell className={numCell}><Num value={t.unclaimed} tone="warning" /></TableCell>
              <TableCell className={numCell}><Num value={t.critical} tone="danger" /></TableCell>
              <TableCell className={numCell}><Num value={t.urgent} tone="danger" /></TableCell>
              <TableCell className={numCell}><Num value={t.high} tone="warning" /></TableCell>
              <TableCell className={numCell}><Num value={t.ageing_7d} tone="warning" /></TableCell>
              <TableCell className={cn(numCell, 'whitespace-nowrap')}>{oldestLabel(t.oldest_open_hours)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function MembersTable({ members, teams }: { members: Workload['members']; teams: MaintenanceTeam[] | undefined }) {
  const teamName = new Map((teams ?? []).map((t) => [t.id, t.name]));
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Team member</TableHead>
            <TableHead>Teams</TableHead>
            <TableHead className={numHead}>Active</TableHead>
            <TableHead className={numHead}>In progress</TableHead>
            <TableHead className={numHead}>Critical</TableHead>
            <TableHead className={numHead}>Urgent</TableHead>
            <TableHead className={numHead}>Open 7+ days</TableHead>
            <TableHead className={numHead}>Completed, last 7 days</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((m) => {
            const names = (m.team_ids ?? []).map((id) => teamName.get(id) ?? 'A team');
            return (
              <TableRow key={m.user_id}>
                <TableCell className="font-medium">{m.full_name ?? 'Unnamed'}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{names.length ? names.join(', ') : '—'}</TableCell>
                <TableCell className={numCell}><Num value={m.active} /></TableCell>
                <TableCell className={numCell}><Num value={m.in_progress} /></TableCell>
                <TableCell className={numCell}><Num value={m.critical} tone="danger" /></TableCell>
                <TableCell className={numCell}><Num value={m.urgent} tone="danger" /></TableCell>
                <TableCell className={numCell}><Num value={m.ageing_7d} tone="warning" /></TableCell>
                <TableCell className={numCell}><Num value={m.completed_7d} /></TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
