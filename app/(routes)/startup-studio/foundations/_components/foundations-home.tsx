'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Compass, ArrowRight, GraduationCap, Lightbulb, Target, ClipboardList } from 'lucide-react';
import { useFoundationsProgress } from '@/hooks/startup-studio/use-foundations';
import type { FoundationsProgress } from '@/types/startup-studio/foundations';

const STRANDS = [
  { icon: Compass, label: 'Founder mindset', desc: 'Discover what kind of builder you are.' },
  { icon: Lightbulb, label: 'Ideation', desc: '5 Whys, Six Hats, SCAMPER — find a real problem.' },
  { icon: Target, label: 'Evaluation', desc: 'Score your idea on desirability, feasibility, viability.' },
  { icon: ClipboardList, label: 'Value & reflection', desc: 'Shape your value proposition and look back on your growth.' },
];

export function FoundationsHome() {
  const { data: progress, isLoading } = useFoundationsProgress() as {
    data?: FoundationsProgress;
    isLoading: boolean;
  };

  return (
    <div className="space-y-6 mt-4">
      <div>
        <div className="flex items-center gap-2">
          <Compass className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold py-1">Foundations</h1>
          <Badge variant="secondary">Level 0 · Explorer</Badge>
        </div>
        <p className="text-sm sm:text-base text-muted-foreground max-w-2xl">
          Your pre-Appathon on-ramp. Work through a short set of worksheets to learn how founders
          think — then you&apos;re ready to build your first app.
        </p>
      </div>

      {/* Progress */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span>Your progress</span>
            {progress?.graduated && (
              <Badge className="bg-green-600 hover:bg-green-600">
                <GraduationCap className="h-3.5 w-3.5 mr-1" /> Foundations complete
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading || !progress ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {progress.submitted_required} of {progress.total_required} worksheets completed
                </span>
                <span className="font-semibold tabular-nums">{progress.completion_pct}%</span>
              </div>
              <Progress value={progress.completion_pct} className="h-2" />
              <div className="pt-1">
                <Button asChild>
                  <Link href="/startup-studio/foundations/my-journey">
                    {progress.submitted_required > 0 ? 'Continue your journey' : 'Start your journey'}
                    <ArrowRight className="h-4 w-4 ml-1.5" />
                  </Link>
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* What you'll do */}
      <div className="grid gap-4 sm:grid-cols-2">
        {STRANDS.map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <s.icon className="h-4 w-4 text-primary" />
                {s.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>{s.desc}</CardDescription>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
