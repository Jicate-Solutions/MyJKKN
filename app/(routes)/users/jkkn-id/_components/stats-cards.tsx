'use client';

/**
 * Kind-wise issuance analytics for /users/jkkn-id.
 *
 * Four cards: Learners / Team members / Associates (each: issued of eligible,
 * pending, and for learners the withheld-for-review count) plus the register
 * itself. Data comes from fn_jkkn_stats — gated on users.jkkn_id.view and
 * institution-scoped for non-admins, so every viewer sees their own slice.
 *
 * `refreshKey` re-fetches after a manual issuance so the cards and the table
 * move together.
 */

import { useEffect, useState } from 'react';
import { GraduationCap, Users, UserCog, BookUser } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  JkknIdentityService,
  type JkknStats,
  type JkknKindStats
} from '@/lib/services/users/jkkn-identity-service';

function KindCard({
  icon: Icon,
  label,
  stats
}: {
  icon: typeof Users;
  label: string;
  stats: JkknKindStats;
}) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums">
            {stats.issued.toLocaleString()}
          </span>
          <span className="text-xs text-muted-foreground">
            of {stats.eligible.toLocaleString()} have an ID
          </span>
        </div>
        <p className="mt-1 text-xs">
          {stats.pending > 0 ? (
            <span className="font-medium text-amber-600 dark:text-amber-500">
              {stats.pending.toLocaleString()} pending
              {stats.review ? ` · ${stats.review} need review` : ''}
            </span>
          ) : (
            <span className="text-muted-foreground">everyone issued</span>
          )}
        </p>
      </CardContent>
    </Card>
  );
}

export function JkknStatsCards({ refreshKey }: { refreshKey: number }) {
  const [stats, setStats] = useState<JkknStats | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    JkknIdentityService.getStats()
      .then((s) => { if (!cancelled) { setStats(s); setFailed(false); } })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [refreshKey]);

  if (failed) return null; // The directory still works; cards degrade silently.

  if (!stats) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[104px] rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <KindCard icon={GraduationCap} label="Learners" stats={stats.learners} />
      <KindCard icon={Users} label="Team members" stats={stats.team_members} />
      <KindCard icon={UserCog} label="Associates" stats={stats.associates} />
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <BookUser className="h-3.5 w-3.5" />
            Register
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums">
              {stats.register.total.toLocaleString()}
            </span>
            <span className="text-xs text-muted-foreground">numbers issued, for life</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {stats.register.both} learner-&-team · {stats.register.external_participants} external
            {stats.register.retired > 0 ? ` · ${stats.register.retired} retired` : ''}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
