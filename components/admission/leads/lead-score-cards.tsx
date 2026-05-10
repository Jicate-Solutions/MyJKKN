'use client';

import { Card, CardContent } from '@/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { Activity, Info, Target, TrendingUp, Star, Flame, User } from 'lucide-react';

// Match the shape produced by computedScores in app/(routes)/admission/leads/[id]/page.tsx
// Category values: lowercase 'hot' | 'warm' | 'cool' | 'cold' | 'Not Scored'
export type LeadScoreCategory = 'hot' | 'warm' | 'cool' | 'cold' | 'Not Scored' | string;

export interface LeadScoreCardsProps {
  scores: {
    score: number;
    category: LeadScoreCategory;
    engagement: number;
    quality: number;
    engagementBreakdown?: Record<string, { count: number; points: number }>;
    qualityBreakdown?: Record<string, boolean>;
    qualityFilledCount?: number;
    qualityTotalFields?: number;
  };
  hasActivities: boolean;
  hasProfile: boolean;
}

// Color stops for the progress bar based on numeric score (0-100)
function barColor(value: number): string {
  if (value <= 30) return 'bg-red-500';
  if (value <= 60) return 'bg-amber-500';
  return 'bg-emerald-500';
}

function barTrack(): string {
  return 'h-1.5 w-full bg-muted rounded-full overflow-hidden';
}

interface ScoreBarProps {
  value: number;
}

function ScoreBar({ value }: ScoreBarProps) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={barTrack()}>
      <div
        className={`h-full rounded-full transition-all ${barColor(value)}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// Category tier sub-line — matches thresholds in computedScores:
// hot: 75-100, warm: 50-74, cool: 25-49, cold: 0-24
function categoryTierLine(category: string): string {
  switch (category) {
    case 'hot':
      return 'Top tier · 75–100';
    case 'warm':
      return 'Upper-mid · 50–74';
    case 'cool':
      return 'Lower-mid · 25–49';
    case 'cold':
      return 'Bottom tier · 0–24';
    default:
      return 'Awaiting data';
  }
}

function categoryTextClass(category: string): string {
  switch (category) {
    case 'hot':
      return 'text-red-600';
    case 'warm':
      return 'text-orange-600';
    case 'cool':
      return 'text-cyan-600';
    case 'cold':
      return 'text-blue-600';
    default:
      return 'text-muted-foreground';
  }
}

export function LeadScoreCards({ scores, hasActivities, hasProfile }: LeadScoreCardsProps) {
  const {
    score,
    category,
    engagement,
    quality,
    engagementBreakdown = {},
    qualityBreakdown = {},
    qualityFilledCount = 0,
    qualityTotalFields = 14,
  } = scores;

  const isUnscored = category === 'Not Scored' || (!hasActivities && !hasProfile && score === 0);
  const showEngagementEmpty = !hasActivities && engagement === 0;
  const showQualityEmpty = !hasProfile && quality === 0;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Overall Score */}
        <Card>
          <CardContent className="py-4">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-1">
                <p className="text-xs text-muted-foreground">Score</p>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[260px] text-xs space-y-1.5 p-3">
                    <p className="font-semibold">Overall Lead Score</p>
                    <p>Weighted average of Engagement and Quality:</p>
                    <p className="font-mono text-[11px]">Score = (Engagement × 50%) + (Quality × 50%)</p>
                    <div className="border-t pt-1.5 mt-1.5 space-y-0.5">
                      <p>Engagement: <span className="font-medium">{engagement}</span> pts</p>
                      <p>Quality: <span className="font-medium">{quality}</span> pts</p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Target className="h-5 w-5 text-primary opacity-50" />
            </div>
            {isUnscored ? (
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Awaiting data</p>
                <p className="text-[11px] text-muted-foreground/80">Score appears once activities log.</p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-baseline gap-1">
                  <p className="text-3xl font-bold leading-none">{score}</p>
                  <p className="text-xs text-muted-foreground">/100</p>
                </div>
                <ScoreBar value={score} />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Category */}
        <Card>
          <CardContent className="py-4">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-1">
                <p className="text-xs text-muted-foreground">Category</p>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[220px] text-xs space-y-1 p-3">
                    <p className="font-semibold">Score Category Thresholds</p>
                    <p className={`${category === 'hot' ? 'font-bold' : 'opacity-70'} text-red-300`}>Hot: 75 – 100</p>
                    <p className={`${category === 'warm' ? 'font-bold' : 'opacity-70'} text-orange-300`}>Warm: 50 – 74</p>
                    <p className={`${category === 'cool' ? 'font-bold' : 'opacity-70'} text-cyan-300`}>Cool: 25 – 49</p>
                    <p className={`${category === 'cold' ? 'font-bold' : 'opacity-70'} text-blue-300`}>Cold: 0 – 24</p>
                    <p className="border-t pt-1 mt-1">Current score: <span className="font-medium">{score}</span></p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Flame className="h-5 w-5 text-orange-500 opacity-50" />
            </div>
            {isUnscored ? (
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Awaiting data</p>
                <p className="text-[11px] text-muted-foreground/80">Category populates with score.</p>
              </div>
            ) : (
              <div className="space-y-1">
                <Badge
                  variant="outline"
                  className={`text-sm font-bold capitalize px-2 py-0.5 border-current ${categoryTextClass(category)}`}
                >
                  {category}
                </Badge>
                <p className="text-[11px] text-muted-foreground">{categoryTierLine(category)}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Engagement */}
        <Card>
          <CardContent className="py-4">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-1">
                <p className="text-xs text-muted-foreground">Engagement</p>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[260px] text-xs space-y-1.5 p-3">
                    <p className="font-semibold">Engagement Score</p>
                    <p>Based on activity interactions with this lead:</p>
                    {Object.keys(engagementBreakdown).length > 0 ? (
                      <div className="border-t pt-1.5 mt-1.5 space-y-0.5">
                        {Object.entries(engagementBreakdown).map(([label, data]) => (
                          <p key={label}>{label}: {data.count}× = <span className="font-medium">{data.points} pts</span></p>
                        ))}
                      </div>
                    ) : (
                      <p className="text-muted-foreground italic border-t pt-1.5 mt-1.5">No activities recorded yet</p>
                    )}
                  </TooltipContent>
                </Tooltip>
              </div>
              <TrendingUp className="h-5 w-5 text-blue-500 opacity-50" />
            </div>
            {showEngagementEmpty ? (
              <div className="flex items-start gap-2">
                <Activity className="h-4 w-4 text-muted-foreground/70 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">No engagement yet</p>
                  <p className="text-[11px] text-muted-foreground/80">Will populate after first call/WhatsApp/SMS.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-baseline gap-1">
                  <p className="text-3xl font-bold leading-none">{engagement}</p>
                  <p className="text-xs text-muted-foreground">/100</p>
                </div>
                <ScoreBar value={engagement} />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quality */}
        <Card>
          <CardContent className="py-4">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-1">
                <p className="text-xs text-muted-foreground">Quality</p>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[240px] text-xs space-y-1.5 p-3">
                    <p className="font-semibold">Profile Quality ({qualityFilledCount}/{qualityTotalFields} fields)</p>
                    {Object.keys(qualityBreakdown).length > 0 ? (
                      <div className="border-t pt-1.5 mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5">
                        {Object.entries(qualityBreakdown).map(([field, filled]) => (
                          <p key={field} className={filled ? 'text-green-300' : 'text-red-300/70'}>
                            {filled ? '✓' : '✗'} {field}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <p className="text-muted-foreground italic border-t pt-1.5 mt-1.5">No profile data yet</p>
                    )}
                  </TooltipContent>
                </Tooltip>
              </div>
              <Star className="h-5 w-5 text-yellow-500 opacity-50" />
            </div>
            {showQualityEmpty ? (
              <div className="flex items-start gap-2">
                <User className="h-4 w-4 text-muted-foreground/70 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Profile incomplete</p>
                  <p className="text-[11px] text-muted-foreground/80">Fill name, email, phone to unlock score.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-baseline gap-1">
                  <p className="text-3xl font-bold leading-none">{quality}</p>
                  <p className="text-xs text-muted-foreground">/100</p>
                </div>
                <ScoreBar value={quality} />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}
