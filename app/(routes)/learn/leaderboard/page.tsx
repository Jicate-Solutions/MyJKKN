'use client';

import { useState, useMemo } from 'react';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useLeaderboard } from '@/hooks/pde/use-pde-phase2';
import { useAuth } from '@/hooks/use-auth';
import { BeatLoader } from 'react-spinners';
import {
  Trophy,
  Medal,
  Crown,
  Star,
  Flame,
  Target,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LeaderboardEntry, ReputationLevel } from '@/types/pde';

// ============================================
// Constants
// ============================================

const LEVEL_CONFIG: Record<ReputationLevel, { label: string; color: string; bgColor: string }> = {
  apprentice: { label: 'Apprentice', color: 'text-slate-600', bgColor: 'bg-slate-100 dark:bg-slate-950/40' },
  practitioner: { label: 'Practitioner', color: 'text-blue-600', bgColor: 'bg-blue-100 dark:bg-blue-950/40' },
  expert: { label: 'Expert', color: 'text-purple-600', bgColor: 'bg-purple-100 dark:bg-purple-950/40' },
  principal: { label: 'Principal', color: 'text-amber-600', bgColor: 'bg-amber-100 dark:bg-amber-950/40' },
  mentor: { label: 'Mentor', color: 'text-emerald-600', bgColor: 'bg-emerald-100 dark:bg-emerald-950/40' },
};

// ============================================
// Podium (Top 3)
// ============================================

function PodiumCard({ entry, position }: { entry: LeaderboardEntry; position: 1 | 2 | 3 }) {
  const levelConfig = LEVEL_CONFIG[entry.level];
  const isFirst = position === 1;
  const initials = (entry.learner_name || 'U')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const positionConfig = {
    1: { icon: Crown, color: 'text-amber-500', bgGradient: 'from-amber-50 to-amber-100/50 dark:from-amber-950/20 dark:to-amber-950/10', size: 'h-20 w-20' },
    2: { icon: Medal, color: 'text-slate-400', bgGradient: 'from-slate-50 to-slate-100/50 dark:from-slate-950/20 dark:to-slate-950/10', size: 'h-16 w-16' },
    3: { icon: Medal, color: 'text-amber-700', bgGradient: 'from-orange-50 to-orange-100/50 dark:from-orange-950/20 dark:to-orange-950/10', size: 'h-16 w-16' },
  }[position];

  const PosIcon = positionConfig.icon;

  return (
    <Card className={cn('text-center relative', isFirst && 'md:-mt-4')}>
      <CardContent className={cn('p-6 bg-gradient-to-b rounded-lg', positionConfig.bgGradient)}>
        <PosIcon className={cn('h-6 w-6 mx-auto mb-2', positionConfig.color)} />
        <Avatar className={cn('mx-auto mb-3', positionConfig.size)}>
          <AvatarFallback className={cn('text-lg bg-primary/10 text-primary', isFirst && 'text-xl')}>
            {initials}
          </AvatarFallback>
        </Avatar>
        <p className={cn('font-bold truncate', isFirst ? 'text-lg' : 'text-sm')}>
          {entry.learner_name}
        </p>
        <Badge variant="outline" className={cn('text-xs mt-1', levelConfig.color, levelConfig.bgColor)}>
          {levelConfig.label}
        </Badge>
        <p className={cn('font-bold mt-2', isFirst ? 'text-2xl' : 'text-xl')}>
          {entry.total_points.toLocaleString()}
        </p>
        <p className="text-xs text-muted-foreground">points</p>
        <div className="flex justify-center gap-4 mt-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Target className="h-3 w-3" />
            {entry.quests_completed}
          </span>
          <span className="flex items-center gap-1">
            <Zap className="h-3 w-3" />
            {entry.capabilities_demonstrated}
          </span>
          <span className="flex items-center gap-1">
            <Flame className="h-3 w-3" />
            {entry.current_streak}d
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================
// Main Page
// ============================================

export default function LeaderboardPage() {
  const { profile: user } = useAuth();
  const [filterInstitution, setFilterInstitution] = useState<string>('all');

  const { data: leaderboard, isLoading } = useLeaderboard(
    filterInstitution !== 'all' ? filterInstitution : undefined
  );

  const entries: LeaderboardEntry[] = leaderboard || [];
  const top3 = entries.slice(0, 3);
  const rest = entries.slice(3);

  // My position
  const myIdx = entries.findIndex((e) => e.learner_id === user?.id);
  const myRank = myIdx >= 0 ? myIdx + 1 : null;

  return (
    <ContentLayout title="Leaderboard">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Learn', href: '/learn/quests' },
          { label: 'Leaderboard' },
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div>
            <h1 className="text-2xl font-bold py-1 flex items-center gap-2">
              <Trophy className="h-6 w-6 text-amber-500" />
              Leaderboard
            </h1>
            <p className="text-sm text-muted-foreground">
              Top Learners ranked by reputation points
            </p>
          </div>
          <Select value={filterInstitution} onValueChange={setFilterInstitution}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All Institutions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Institutions</SelectItem>
              <SelectItem value="engineering">Engineering</SelectItem>
              <SelectItem value="pharmacy">Pharmacy</SelectItem>
              <SelectItem value="dental">Dental</SelectItem>
              <SelectItem value="arts_science">Arts & Science</SelectItem>
              <SelectItem value="nursing">Nursing</SelectItem>
              <SelectItem value="ahs">Allied Health Sciences</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <BeatLoader color="#00e902" />
          </div>
        ) : entries.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <Trophy className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <p className="text-muted-foreground">No Learners on the leaderboard yet</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Podium */}
            {top3.length >= 3 && (
              <div className="grid grid-cols-3 gap-4 max-w-2xl mx-auto">
                <div className="md:mt-4">
                  <PodiumCard entry={top3[1]} position={2} />
                </div>
                <PodiumCard entry={top3[0]} position={1} />
                <div className="md:mt-4">
                  <PodiumCard entry={top3[2]} position={3} />
                </div>
              </div>
            )}

            {/* My rank highlight (if not in top 3) */}
            {myRank && myRank > 3 && (
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <span className="text-xl font-bold text-primary w-10 text-center">#{myRank}</span>
                    <span className="font-medium flex-1">{user?.full_name}</span>
                    <span className="font-bold">{entries[myIdx]?.total_points?.toLocaleString() || 0} pts</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Full Table */}
            {rest.length > 0 && (
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16 text-center">Rank</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Level</TableHead>
                        <TableHead className="text-right">Points</TableHead>
                        <TableHead className="text-center hidden md:table-cell">Quests</TableHead>
                        <TableHead className="text-center hidden md:table-cell">Capabilities</TableHead>
                        <TableHead className="text-center hidden lg:table-cell">Streak</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rest.map((entry) => {
                        const levelConfig = LEVEL_CONFIG[entry.level];
                        const isMe = entry.learner_id === user?.id;
                        return (
                          <TableRow
                            key={entry.learner_id}
                            className={cn(isMe && 'bg-primary/5')}
                          >
                            <TableCell className="text-center font-medium">
                              {entry.rank}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Avatar className="h-7 w-7">
                                  <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                                    {(entry.learner_name || 'U').split(' ').map((n) => n[0]).join('').slice(0, 2)}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="font-medium text-sm truncate">
                                  {entry.learner_name}
                                  {isMe && <span className="text-xs text-primary ml-1">(You)</span>}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={cn('text-xs', levelConfig.color, levelConfig.bgColor)}>
                                {levelConfig.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {entry.total_points.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-center hidden md:table-cell">
                              {entry.quests_completed}
                            </TableCell>
                            <TableCell className="text-center hidden md:table-cell">
                              {entry.capabilities_demonstrated}
                            </TableCell>
                            <TableCell className="text-center hidden lg:table-cell">
                              <span className="flex items-center justify-center gap-1">
                                <Flame className="h-3 w-3 text-orange-500" />
                                {entry.current_streak}d
                              </span>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </ContentLayout>
  );
}
