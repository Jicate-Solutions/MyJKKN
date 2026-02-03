'use client';

import { useEffect, useState } from 'react';
import { createClientSupabaseClient as createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Award, CheckCircle, Lock } from 'lucide-react';

const LEVELS = [
  {
    level: 0,
    title: 'Observer',
    description: 'Watch and learn from experienced trainers',
    requirements: 'Starting level',
    sessionsNeeded: 0,
  },
  {
    level: 1,
    title: 'Co-Lead',
    description: 'Lead sessions with supervision',
    requirements: '5 sessions as Observer',
    sessionsNeeded: 5,
  },
  {
    level: 2,
    title: 'Lead',
    description: 'Independently lead training sessions',
    requirements: '10 sessions as Co-Lead',
    sessionsNeeded: 10,
  },
  {
    level: 3,
    title: 'Master Trainer',
    description: 'Train and mentor other cohort members',
    requirements: '20 sessions as Lead',
    sessionsNeeded: 20,
  },
];

export default function LevelProgressPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [currentLevel, setCurrentLevel] = useState(0);
  const [completedSessions, setCompletedSessions] = useState(0);

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setIsLoading(false);
        return;
      }

      const { data: member } = await (supabase as any).from('sh_cohort_members')
        .select('level')
        .eq('user_id', user.id)
        .single();

      if (!member) {
        setIsLoading(false);
        return;
      }

      setCurrentLevel(member.level || 0);

      // Count completed sessions
      const { count } = await (supabase as any).from('sh_cohort_assignments')
        .select('*', { count: 'exact', head: true })
        .eq('cohort_member_id', member.id);

      setCompletedSessions(count || 0);
      setIsLoading(false);
    }

    fetchData();
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Level Progress</h1>
        <p className="text-muted-foreground">
          Your journey to becoming a Master Trainer
        </p>
      </div>

      {/* Current Status */}
      <Card className="bg-primary/5 border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="h-6 w-6 text-primary" />
            Current Level: {LEVELS[currentLevel].title}
          </CardTitle>
          <CardDescription>
            {LEVELS[currentLevel].description}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm">
            Sessions completed: <strong>{completedSessions}</strong>
          </p>
        </CardContent>
      </Card>

      {/* Level Cards */}
      <div className="space-y-4">
        {LEVELS.map((level, index) => {
          const isUnlocked = currentLevel >= level.level;
          const isCurrent = currentLevel === level.level;
          const isNext = currentLevel === level.level - 1;
          const nextLevelSessions = LEVELS[currentLevel + 1]?.sessionsNeeded || 0;
          const progress = isNext && nextLevelSessions > 0
            ? Math.min((completedSessions / nextLevelSessions) * 100, 100)
            : isUnlocked ? 100 : 0;

          return (
            <Card
              key={level.level}
              className={
                isCurrent
                  ? 'border-primary bg-primary/5'
                  : isUnlocked
                  ? 'opacity-75'
                  : 'opacity-50'
              }
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {isUnlocked ? (
                      <CheckCircle className="h-6 w-6 text-green-500" />
                    ) : (
                      <Lock className="h-6 w-6 text-muted-foreground" />
                    )}
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        Level {level.level}: {level.title}
                        {isCurrent && <Badge>Current</Badge>}
                        {isNext && <Badge variant="outline">Next</Badge>}
                      </CardTitle>
                      <CardDescription>{level.description}</CardDescription>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-2">
                  {level.requirements}
                </p>
                {(isCurrent || isNext) && nextLevelSessions > 0 && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Progress to next level</span>
                      <span>{Math.round(progress)}%</span>
                    </div>
                    <Progress value={progress} />
                    <p className="text-xs text-muted-foreground">
                      {completedSessions} / {nextLevelSessions} sessions
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
