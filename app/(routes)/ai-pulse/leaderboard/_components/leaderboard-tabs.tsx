'use client';

// app/(routes)/ai-pulse/leaderboard/_components/leaderboard-tabs.tsx
// ============================================================================
// AI Pulse leaderboard — the interactive boards.
//   * "Your standing" card (the signed-in learner's rank, points, badges, streak)
//   * Students tab   — individual board, This week | All-time
//   * Departments tab — average points per active student, All JKKN | My college
// Visual grammar deliberately matches the Lab console's dept-ranking-panel
// (Card + Table + Medal/Trophy, amber gold, tabular-nums) so the leaderboard
// reads as native to AI Pulse rather than a bolt-on.
// ============================================================================

import { useState } from 'react';
import {
  Award,
  Flame,
  Medal,
  Mic,
  Sparkles,
  Trophy,
  Users,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import {
  useDeptBoard,
  useIndividualBoard,
  useMyLeaderboardCard,
  useSeniorBoard,
  useMySeniorLeaderboardCard,
  type BadgeKey,
  type SeniorBadgeKey,
} from '@/lib/services/ai-pulse/leaderboard-service';

// ── Badges ──────────────────────────────────────────────────────────────────
const BADGE_META: Record<
  BadgeKey | SeniorBadgeKey,
  { label: string; Icon: typeof Award; className: string }
> = {
  first_prompt: { label: 'First Prompt', Icon: Sparkles, className: 'bg-blue-100 text-blue-700' },
  gold_prompt: { label: 'Gold Prompt', Icon: Medal, className: 'bg-amber-100 text-amber-700' },
  quiz_ace: { label: 'Quiz Ace', Icon: Award, className: 'bg-violet-100 text-violet-700' },
  loyal_streak: { label: 'Loyal Streak', Icon: Flame, className: 'bg-orange-100 text-orange-700' },
  first_quiz: { label: 'First Quiz', Icon: Sparkles, className: 'bg-teal-100 text-teal-700' },
  session_host: { label: 'Session Host', Icon: Mic, className: 'bg-emerald-100 text-emerald-700' },
};

function BadgeChips({
  badges,
  size = 'sm',
}: {
  badges: Array<BadgeKey | SeniorBadgeKey>;
  size?: 'sm' | 'xs';
}) {
  if (!badges.length) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {badges.map((b) => {
        const meta = BADGE_META[b];
        if (!meta) return null;
        const { label, Icon, className } = meta;
        return (
          <span
            key={b}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${
              size === 'xs' ? 'text-[10px]' : 'text-xs'
            } ${className}`}
            title={label}
          >
            <Icon className="h-3 w-3" aria-hidden />
            {label}
          </span>
        );
      })}
    </div>
  );
}

function Streak({ weeks }: { weeks: number }) {
  if (weeks <= 0) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center gap-1 text-sm font-medium text-orange-600 tabular-nums">
      <Flame className="h-3.5 w-3.5" aria-hidden />
      {weeks}
    </span>
  );
}

// Rank cell: trophy for #1, medals for #2/#3, plain number otherwise.
function RankCell({ rank }: { rank: number }) {
  if (rank === 1)
    return (
      <span className="inline-flex items-center gap-1 font-semibold text-amber-600 tabular-nums">
        <Trophy className="h-4 w-4" aria-hidden />1
      </span>
    );
  if (rank === 2)
    return (
      <span className="inline-flex items-center gap-1 font-semibold text-slate-500 tabular-nums">
        <Medal className="h-4 w-4" aria-hidden />2
      </span>
    );
  if (rank === 3)
    return (
      <span className="inline-flex items-center gap-1 font-semibold text-orange-700 tabular-nums">
        <Medal className="h-4 w-4" aria-hidden />3
      </span>
    );
  return <span className="tabular-nums">{rank}</span>;
}

function TimeframeToggle({
  allTime,
  onChange,
}: {
  allTime: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="inline-flex rounded-md border p-0.5">
      <Button
        size="sm"
        variant={allTime ? 'ghost' : 'default'}
        className="h-7 px-3 text-xs"
        onClick={() => onChange(false)}
      >
        This week
      </Button>
      <Button
        size="sm"
        variant={allTime ? 'default' : 'ghost'}
        className="h-7 px-3 text-xs"
        onClick={() => onChange(true)}
      >
        All-time
      </Button>
    </div>
  );
}

function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2 py-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}

// ── Your standing card ───────────────────────────────────────────────────────
function MyStandingCard({ allTime }: { allTime: boolean }) {
  const { data, isLoading } = useMyLeaderboardCard(allTime);

  if (isLoading) return <Skeleton className="h-24 w-full" />;
  if (!data) return null; // non-learners (e.g. admins previewing) have no card

  const parts: Array<[string, number]> = [
    ['Build', data.build_pts],
    ['Quiz', data.quiz_pts],
    ['Starter', data.starter_pts],
    ['Publish', data.publish_pts],
  ];

  return (
    <Card className="border-amber-200 bg-gradient-to-br from-amber-50 to-white">
      <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
        <div className="flex items-center gap-4">
          <div className="text-center">
            <div className="text-xs text-muted-foreground">Your rank</div>
            <div className="text-2xl font-bold tabular-nums text-amber-700">
              #{data.rank}
            </div>
            <div className="text-[11px] text-muted-foreground">
              of {data.total_learners}
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums">{data.total_pts}</span>
              <span className="text-xs text-muted-foreground">points</span>
              <Streak weeks={data.streak_weeks} />
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
              {parts.map(([label, v]) => (
                <span key={label} className="tabular-nums">
                  {label} {v}
                </span>
              ))}
            </div>
            <div className="mt-1.5">
              <BadgeChips badges={data.badges} size="xs" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Individual (student) board ───────────────────────────────────────────────
function StudentBoard() {
  const [allTime, setAllTime] = useState(false);
  const { data, isLoading, error } = useIndividualBoard(allTime);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Learners</CardTitle>
            <CardDescription>
              Everyone, ranked by points. Ties go to the higher quality score.
            </CardDescription>
          </div>
          <TimeframeToggle allTime={allTime} onChange={setAllTime} />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <TableSkeleton />
        ) : error ? (
          <p className="py-4 text-center text-sm text-destructive">
            Couldn&apos;t load the board. Please try again.
          </p>
        ) : !data || data.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No points yet this {allTime ? 'program' : 'week'}. Build a prompt,
            take the quiz, or publish your work to get on the board.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Learner</TableHead>
                  <TableHead className="w-20 text-center">Streak</TableHead>
                  <TableHead>Badges</TableHead>
                  <TableHead className="w-24 text-right">Points</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row) => (
                  <TableRow
                    key={row.learner_id}
                    className={row.rank <= 3 ? 'bg-amber-50/60' : undefined}
                  >
                    <TableCell className="font-medium">
                      <RankCell rank={row.rank} />
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">{row.learner_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {row.department_name || 'No department'}
                        {row.institution_name ? ` · ${row.institution_name}` : ''}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Streak weeks={row.streak_weeks} />
                    </TableCell>
                    <TableCell>
                      <BadgeChips badges={row.badges} />
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-sm font-semibold tabular-nums">
                        {row.total_pts}
                      </span>
                      <div className="text-[11px] text-muted-foreground tabular-nums">
                        {row.participation_pts}+{row.quality_pts}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Department board ─────────────────────────────────────────────────────────
function DeptBoard({ viewerInstitutionId }: { viewerInstitutionId: string | null }) {
  const [allTime, setAllTime] = useState(true);
  const [withinCollege, setWithinCollege] = useState(false);
  const { data, isLoading, error } = useDeptBoard(
    allTime,
    withinCollege,
    viewerInstitutionId,
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Departments</CardTitle>
            <CardDescription>
              Ranked by average points per <strong>active</strong> learner — so
              broad participation wins, not just a few stars.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {viewerInstitutionId && (
              <div className="inline-flex rounded-md border p-0.5">
                <Button
                  size="sm"
                  variant={withinCollege ? 'ghost' : 'default'}
                  className="h-7 px-3 text-xs"
                  onClick={() => setWithinCollege(false)}
                >
                  All JKKN
                </Button>
                <Button
                  size="sm"
                  variant={withinCollege ? 'default' : 'ghost'}
                  className="h-7 px-3 text-xs"
                  onClick={() => setWithinCollege(true)}
                >
                  My college
                </Button>
              </div>
            )}
            <TimeframeToggle allTime={allTime} onChange={setAllTime} />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <TableSkeleton />
        ) : error ? (
          <p className="py-4 text-center text-sm text-destructive">
            Couldn&apos;t load the board. Please try again.
          </p>
        ) : !data || data.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No departments qualify yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead className="w-28 text-center">Taking part</TableHead>
                  <TableHead className="w-28 text-right">Avg / learner</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row) => (
                  <TableRow
                    key={`${row.institution_id}:${row.department_id}`}
                    className={row.rank <= 3 ? 'bg-amber-50/60' : undefined}
                  >
                    <TableCell className="font-medium">
                      <RankCell rank={row.rank} />
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">
                        {row.department_name || 'Department'}
                      </div>
                      {!withinCollege && row.institution_name && (
                        <div className="text-xs text-muted-foreground">
                          {row.institution_name}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-center text-sm tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                        {row.participating_students}/{row.active_students}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-sm font-semibold tabular-nums">
                      {row.avg_pts_per_active}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Senior Learner (staff/faculty) standing card ─────────────────────────────
// Renders only when the signed-in viewer is a scored Senior Learner (a profile
// with no learner link). Learners and admins-without-a-signal get no card.
function SeniorStandingCard({ allTime }: { allTime: boolean }) {
  const { data, isLoading } = useMySeniorLeaderboardCard(allTime);

  if (isLoading) return <Skeleton className="h-24 w-full" />;
  if (!data) return null;

  const parts: Array<[string, number]> = [
    ['Sessions', data.attend_pts],
    ['Quiz', data.quiz_pts],
  ];
  // Facilitation credit (hosting/running a session) only shows for the staff who
  // actually ran one, so the ~150 attendee-only cards stay clean.
  if (data.facilitate_pts > 0) parts.push(['Facilitated', data.facilitate_pts]);

  return (
    <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50 to-white">
      <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
        <div className="flex items-center gap-4">
          <div className="text-center">
            <div className="text-xs text-muted-foreground">Your rank</div>
            <div className="text-2xl font-bold tabular-nums text-emerald-700">
              #{data.rank}
            </div>
            <div className="text-[11px] text-muted-foreground">
              of {data.total_seniors}
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums">{data.total_pts}</span>
              <span className="text-xs text-muted-foreground">points</span>
              <Streak weeks={data.streak_weeks} />
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
              {parts.map(([label, v]) => (
                <span key={label} className="tabular-nums">
                  {label} {v}
                </span>
              ))}
            </div>
            <div className="mt-1.5">
              <BadgeChips badges={data.badges} size="xs" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Role values are raw role keys (e.g. "hod", "staff_counselor"); tidy them for
// display without asserting a fixed set.
function prettyRole(role: string | null): string {
  if (!role) return '';
  return role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Senior Learner (staff/faculty) board ─────────────────────────────────────
function SeniorBoard() {
  const [allTime, setAllTime] = useState(false);
  const { data, isLoading, error } = useSeniorBoard(allTime);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Senior Learners</CardTitle>
            <CardDescription>
              A separate board for Senior Learners and team members who take part
              in AI Pulse — join a live session and take the quiz to climb. Kept
              apart so it never crowds the learners&apos; board.
            </CardDescription>
          </div>
          <TimeframeToggle allTime={allTime} onChange={setAllTime} />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <TableSkeleton />
        ) : error ? (
          <p className="py-4 text-center text-sm text-destructive">
            Couldn&apos;t load the board. Please try again.
          </p>
        ) : !data || data.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No points yet this {allTime ? 'program' : 'week'}. Join a live AI
            Pulse session and take the quiz to get on the board.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Senior Learner</TableHead>
                  <TableHead className="w-24 text-center">Sessions</TableHead>
                  <TableHead className="w-20 text-center">Quizzes</TableHead>
                  <TableHead className="w-20 text-center">Streak</TableHead>
                  <TableHead>Badges</TableHead>
                  <TableHead className="w-24 text-right">Points</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row) => (
                  <TableRow
                    key={row.profile_id}
                    className={row.rank <= 3 ? 'bg-emerald-50/60' : undefined}
                  >
                    <TableCell className="font-medium">
                      <RankCell rank={row.rank} />
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">{row.senior_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {[prettyRole(row.role), row.department_name, row.institution_name]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </TableCell>
                    <TableCell className="text-center text-sm tabular-nums">
                      {row.sessions_attended}
                    </TableCell>
                    <TableCell className="text-center text-sm tabular-nums">
                      {row.quizzes_taken}
                    </TableCell>
                    <TableCell className="text-center">
                      <Streak weeks={row.streak_weeks} />
                    </TableCell>
                    <TableCell>
                      <BadgeChips badges={row.badges} />
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-sm font-semibold tabular-nums">
                        {row.total_pts}
                      </span>
                      <div className="text-[11px] text-muted-foreground tabular-nums">
                        {row.participation_pts}+{row.quality_pts}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Root ─────────────────────────────────────────────────────────────────────
export function LeaderboardTabs({
  viewerInstitutionId,
  showSeniorBoard = false,
  seniorBoardEnabled = false,
}: {
  viewerInstitutionId: string | null;
  // Whether to render the Senior Learners tab at all (flag on, or admin preview).
  showSeniorBoard?: boolean;
  // Whether the Senior Learners board is actually live (vs admin-only preview).
  seniorBoardEnabled?: boolean;
}) {
  return (
    <div className="space-y-4">
      <MyStandingCard allTime={false} />
      {showSeniorBoard && <SeniorStandingCard allTime={false} />}
      <Tabs defaultValue="students">
        <TabsList>
          <TabsTrigger value="students">Learners</TabsTrigger>
          <TabsTrigger value="departments">Departments</TabsTrigger>
          {showSeniorBoard && (
            <TabsTrigger value="seniors">Senior Learners</TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="students" className="mt-4">
          <StudentBoard />
        </TabsContent>
        <TabsContent value="departments" className="mt-4">
          <DeptBoard viewerInstitutionId={viewerInstitutionId} />
        </TabsContent>
        {showSeniorBoard && (
          <TabsContent value="seniors" className="mt-4 space-y-3">
            {!seniorBoardEnabled && (
              <Card className="border-amber-300 bg-amber-50">
                <CardContent className="py-3 text-sm text-amber-800">
                  Preview only — the Senior Learners board is not yet visible to
                  Senior Learners. Flip{' '}
                  <code className="font-mono">leaderboard_staff_board_enabled</code>{' '}
                  in AI Pulse policies to go live.
                </CardContent>
              </Card>
            )}
            <SeniorBoard />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
