'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Award, CheckCircle, Lock, AlertCircle, ArrowUp } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import {
  useCohortProfile,
  useLevelProgress,
  useRequestLevelUp,
} from '@/hooks/solutions/use-cohort-portal';

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
  const { profile, isLoading: authLoading } = useAuth();

  // Get cohort member profile
  const { data: cohortProfile, isLoading: profileLoading } = useCohortProfile(profile?.id || '');
  const memberId = cohortProfile?.id;

  // Get level progress
  const { data: levelProgress, isLoading: levelLoading } = useLevelProgress(memberId || '');

  // Level up mutation
  const levelUpMutation = useRequestLevelUp();

  const isLoading = authLoading || profileLoading || levelLoading;

  const handleLevelUp = async () => {
    if (!memberId) return;

    try {
      await levelUpMutation.mutateAsync(memberId);
      toast.success('Congratulations! You have been promoted to the next level!');
    } catch (error) {
      toast.error('Failed to level up. Please try again.');
    }
  };

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

  if (!cohortProfile || !levelProgress) {
    return (
      <div className="space-y-6">
        <div className="rounded-lg border bg-yellow-50 p-6 dark:bg-yellow-900/20">
          <div className="flex items-start gap-4">
            <AlertCircle className="h-6 w-6 text-yellow-600" />
            <div>
              <h2 className="text-lg font-semibold">Cohort Profile Not Found</h2>
              <p className="text-muted-foreground mt-1">
                Your cohort member profile has not been set up yet.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const currentLevel = levelProgress.currentLevel;

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
            Current Level: {levelProgress.levelTitle}
          </CardTitle>
          <CardDescription>
            {levelProgress.levelDescription}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold">{levelProgress.sessionsObserved}</p>
              <p className="text-sm text-muted-foreground">Observed</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{levelProgress.sessionsCoLed}</p>
              <p className="text-sm text-muted-foreground">Co-Led</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{levelProgress.sessionsLed}</p>
              <p className="text-sm text-muted-foreground">Led</p>
            </div>
          </div>

          {levelProgress.canLevelUp && (
            <Button onClick={handleLevelUp} disabled={levelUpMutation.isPending} className="w-full">
              <ArrowUp className="h-4 w-4 mr-2" />
              {levelUpMutation.isPending ? 'Promoting...' : `Level Up to ${levelProgress.nextLevelTitle}`}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Level Cards */}
      <div className="space-y-4">
        {LEVELS.map((level) => {
          const isUnlocked = currentLevel >= level.level;
          const isCurrent = currentLevel === level.level;
          const isNext = currentLevel === level.level - 1;
          const progress = isCurrent ? levelProgress.progress : isUnlocked ? 100 : 0;

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
                {isCurrent && levelProgress.sessionsNeeded > 0 && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Progress to next level</span>
                      <span>{Math.round(progress)}%</span>
                    </div>
                    <Progress value={progress} />
                    <p className="text-xs text-muted-foreground">
                      {levelProgress.currentSessions} / {levelProgress.sessionsNeeded} sessions
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
