'use client';

import { useState } from 'react';
import { Activity, AlertTriangle, CalendarClock, Clock, Hand, Inbox, RefreshCw, RotateCcw, Zap, type LucideIcon } from 'lucide-react';
import { PageBreadcrumb } from '@/components/navigation';
import { PageHeader } from '@/components/page-header';
import { AccessGate } from '@/components/instasolver/access-gate';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useInstitutions, useTeams, useWorkload } from '@/hooks/instasolver/use-instasolver';
import { PRIORITY_META, PRIORITY_VALUES } from '@/lib/instasolver/constants';
import { cn } from '@/lib/utils';
import type { Priority, Workload } from '@/types/instasolver';
import { MembersTable, TeamsTable } from './workload-tables';
import { StatCard, type Accent } from '@/components/instasolver/stat-card';

const OPEN_DAY_OPTIONS = [3, 7, 30];

type SummaryKey = keyof Workload['summary'];

// The 8 figure cards — the dashboard card style in Workload's own colours.
// `list` is the issue list the card opens (the open-work statuses, narrowed);
// a card with no exact list keeps the dashboard's hover lift without a link.
const ACTIVE = 'status=assigned,in_progress';
const SUMMARY_CARDS: { key: SummaryKey; label: string; hint: string; accent: Accent; icon: LucideIcon; list?: string }[] = [
  { key: 'active', label: 'Active', hint: 'Assigned or in progress', accent: 'teal', icon: Activity, list: ACTIVE },
  { key: 'awaiting_triage', label: 'Awaiting triage', hint: 'Waiting for a decision', accent: 'orange', icon: Inbox, list: 'status=pending' },
  { key: 'unclaimed', label: 'Unclaimed', hint: 'With a team, nobody has picked up', accent: 'cyan', icon: Hand },
  { key: 'critical', label: 'Critical', hint: 'Reported as critical', accent: 'rose', icon: AlertTriangle, list: `severity=critical&${ACTIVE}` },
  { key: 'urgent', label: 'Urgent', hint: 'Prioritised as urgent', accent: 'fuchsia', icon: Zap, list: `priority=urgent&${ACTIVE}` },
  { key: 'ageing_7d', label: 'Open 7+ days', hint: 'Open for a week or more', accent: 'purple', icon: Clock },
  { key: 'ageing_30d', label: 'Open 30+ days', hint: 'Open for a month or more', accent: 'pink', icon: CalendarClock },
  { key: 'reopened', label: 'Reopened', hint: 'Came back after completion', accent: 'lime', icon: RotateCcw }
];

export function WorkloadClient() {
  return (
    <AccessGate need="manager">
      <WorkloadDesk />
    </AccessGate>
  );
}

function WorkloadDesk() {
  const [institutionId, setInstitutionId] = useState('all');
  const [priority, setPriority] = useState('all');
  const [openDays, setOpenDays] = useState('any');
  const [showIdle, setShowIdle] = useState(false);

  const { data: institutions } = useInstitutions();
  const { data: teams } = useTeams(false);
  const { data, isLoading, isFetching, error, refetch } = useWorkload({
    institution_id: institutionId === 'all' ? undefined : institutionId,
    priority: priority === 'all' ? undefined : (priority as Priority),
    open_days: openDays === 'any' ? undefined : Number(openDays)
  });

  const teamRows = data?.teams.filter((t) => showIdle || t.active > 0) ?? [];
  const memberRows = data?.members.filter((m) => showIdle || m.active > 0) ?? [];
  const idleTeams = (data?.teams.length ?? 0) - (data?.teams.filter((t) => t.active > 0).length ?? 0);
  const idleMembers = (data?.members.length ?? 0) - (data?.members.filter((m) => m.active > 0).length ?? 0);

  return (
    <div className="space-y-6">
      <PageBreadcrumb
        items={[
          { label: 'InstaSolver', href: '/instasolver/dashboard' },
          { label: 'Workload', isCurrent: true }
        ]}
      />
      <PageHeader
        title="Workload"
        description="Who is carrying what, so you can see where the next issue should go. Assignment stays your decision."
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn('mr-1.5 h-4 w-4', isFetching && 'animate-spin')} />
            Refresh
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label>Institution</Label>
          <Select value={institutionId} onValueChange={setInstitutionId}>
            <SelectTrigger>
              <SelectValue placeholder="All institutions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All institutions</SelectItem>
              {institutions?.map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Priority</Label>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger>
              <SelectValue placeholder="Any priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any priority</SelectItem>
              {PRIORITY_VALUES.map((p) => (
                <SelectItem key={p} value={p}>
                  {PRIORITY_META[p].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Age</Label>
          <Select value={openDays} onValueChange={setOpenDays}>
            <SelectTrigger>
              <SelectValue placeholder="Any age" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any age</SelectItem>
              {OPEN_DAY_OPTIONS.map((d) => (
                <SelectItem key={d} value={String(d)}>
                  Open more than {d} days
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end gap-3 pb-2">
          <Switch id="show-idle" checked={showIdle} onCheckedChange={setShowIdle} />
          <Label htmlFor="show-idle">Show idle</Label>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : error || !data ? (
        <Card>
          <CardContent className="space-y-3 p-6 text-center">
            <p className="font-medium">The workload could not be loaded</p>
            <p className="text-sm text-muted-foreground">{(error as Error | null)?.message}</p>
            <Button variant="outline" onClick={() => refetch()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {SUMMARY_CARDS.map((c) => (
              <StatCard
                key={c.key}
                label={c.label}
                value={data.summary[c.key]}
                hint={c.hint}
                icon={c.icon}
                accent={c.accent}
                href={
                  c.list
                    ? `/instasolver/issues?${c.list}${institutionId === 'all' ? '' : `&institution=${institutionId}`}`
                    : undefined
                }
                interactive
              />
            ))}
          </div>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Teams</h2>
            {teamRows.length === 0 ? (
              <EmptyNote text={idleTeams > 0 ? 'Every team is idle. Turn on Show idle to list them.' : 'No teams to show.'} />
            ) : (
              <TeamsTable teams={teamRows} />
            )}
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Team members</h2>
            {memberRows.length === 0 ? (
              <EmptyNote
                text={idleMembers > 0 ? 'Every team member is idle. Turn on Show idle to list them.' : 'No team members to show.'}
              />
            ) : (
              <MembersTable members={memberRows} teams={teams} />
            )}
          </section>

          <p className="text-xs text-muted-foreground">
            An issue given to both a person and their team counts on both plates, so the team and member columns do not
            add up to the totals above. Idle rows (nothing active) are hidden unless you turn on Show idle.
          </p>
        </>
      )}
    </div>
  );
}

function EmptyNote({ text }: { text: string }) {
  return (
    <Card>
      <CardContent className="p-6 text-center text-sm text-muted-foreground">{text}</CardContent>
    </Card>
  );
}
