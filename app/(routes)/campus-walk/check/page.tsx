// app/(routes)/campus-walk/check/page.tsx
// ============================================================================
// Campus Walk — the routine check screen. /campus-walk/check?task=<uuid>
//
// Director rulings, 30 Sep 2026: routine check jobs are created by MyJKKN
// itself (app/api/cron/routine-checks) and the fixer's bell links here. Two
// big buttons: "All OK" (one photo, closes the job) and "Found a problem"
// (one line, photo optional — becomes an ordinary repair job).
//
// Every refusal RENDERS as a card with the reason (rule #27) — no redirect.
// The gate is lib/campus-walk/routine-checks.ts resolveCheckAccess, the same
// one app/api/campus-walk/check/route.ts enforces. Service-role reads for the
// same reason as the fix screen: project_* RLS is open to every signed-in user,
// so the gate below is the real boundary.
// ============================================================================

import { AlertCircle, CheckCircle2, ClipboardList, Wrench } from 'lucide-react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { resolveCheckAccess, routineCheckState } from '@/lib/campus-walk/routine-checks';
import { CheckClient } from './_components/check-client';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ task?: string }>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function formatDay(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <ContentLayout title="Routine check">
      <div className="mt-4">
        <PageHeader title="Routine check" description="Check the item. If all is fine, one photo closes it." />
      </div>
      {children}
    </ContentLayout>
  );
}

function InfoCard({
  icon,
  heading,
  reason,
  action
}: {
  icon: React.ReactNode;
  heading: string;
  reason: string;
  action?: React.ReactNode;
}) {
  return (
    <Card className="mx-auto mt-6 w-full max-w-2xl">
      <CardContent className="flex items-start gap-3 py-6">
        {icon}
        <div className="space-y-2">
          <p className="font-medium">{heading}</p>
          <p className="text-sm text-muted-foreground">{reason}</p>
          {action}
        </div>
      </CardContent>
    </Card>
  );
}

const deniedIcon = <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />;

export default async function RoutineCheckPage({ searchParams }: PageProps) {
  const { task: taskParam } = await searchParams;
  const taskId = (taskParam ?? '').trim();

  if (!taskId || !UUID_RE.test(taskId)) {
    return (
      <Shell>
        <InfoCard
          icon={<ClipboardList className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />}
          heading="No routine check selected"
          reason="Open this screen from the routine check notification in your bell."
        />
      </Shell>
    );
  }

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return (
      <Shell>
        <InfoCard icon={deniedIcon} heading="You are signed out" reason="Sign in, then open the notification again." />
      </Shell>
    );
  }

  const admin = createServiceRoleClient();
  const access = await resolveCheckAccess(admin as any, user.id, taskId);
  if (access.allowed === false) {
    return (
      <Shell>
        <InfoCard
          icon={deniedIcon}
          heading="You can't answer this routine check"
          reason={access.reason}
          action={
            <p className="text-sm text-muted-foreground">
              Please speak to the estate office (Campus Operations desk).
            </p>
          }
        />
      </Shell>
    );
  }

  const { task } = access;
  const m = task.metadata ?? {};
  const state = routineCheckState(task);

  if (state === 'answered') {
    const outcome = m.routine_check_outcome ?? {};
    if (outcome.result === 'problem') {
      return (
        <Shell>
          <InfoCard
            icon={<Wrench className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />}
            heading="A problem was found — this is now a repair job"
            reason={`"${outcome.note ?? ''}" — due by ${formatDay(task.due_date)}. Send a photo of the finished repair from the fix screen.`}
            action={
              <Button asChild className="h-11">
                <Link href={`/campus-walk/fix?task=${task.id}`}>Open the repair job</Link>
              </Button>
            }
          />
        </Shell>
      );
    }
    return (
      <Shell>
        <InfoCard
          icon={<CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />}
          heading="Done — this routine check is closed"
          reason={`Marked All OK${outcome.by_name ? ` by ${outcome.by_name}` : ''}.`}
        />
      </Shell>
    );
  }

  if (state === 'closed') {
    return (
      <Shell>
        <InfoCard
          icon={deniedIcon}
          heading="This routine check is closed"
          reason={task.status_key === 'cancelled' ? 'It was withdrawn.' : 'There is nothing left to answer.'}
        />
      </Shell>
    );
  }

  return (
    <Shell>
      <CheckClient
        ticket={{
          taskId: task.id,
          itemName: typeof m.resource_name === 'string' ? m.resource_name : task.title,
          place: typeof m.resource_place === 'string' ? m.resource_place : '',
          whatToCheck:
            typeof m.what_to_check === 'string' ? m.what_to_check : (task.description ?? 'Check the item.'),
          dueLabel: task.due_date ? `Due by ${formatDay(task.due_date)}` : ''
        }}
      />
    </Shell>
  );
}
