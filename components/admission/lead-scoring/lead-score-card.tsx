'use client';

import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Target,
  TrendingUp,
  TrendingDown,
  Minus,
  Activity,
  Award,
  Info,
} from 'lucide-react';
import {
  getScoreCategory,
  getCategoryLabel,
  getCategoryColors,
  type ScoreCategory,
} from './lead-score-badge';

// ============================================
// TYPES
// ============================================

export interface ScoreFactor {
  id: string;
  name: string;
  category: 'engagement' | 'quality';
  points: number;
  maxPoints: number;
  description?: string;
}

export interface LeadScoreCardProps {
  score: number;
  engagementScore?: number;
  qualityScore?: number;
  previousScore?: number;
  factors?: ScoreFactor[];
  engagementWeight?: number;
  qualityWeight?: number;
  className?: string;
  compact?: boolean;
}

// ============================================
// SUBCOMPONENTS
// ============================================

/**
 * Circular progress indicator for score display
 */
function CircularProgress({
  score,
  category,
  size = 120,
}: {
  score: number;
  category: ScoreCategory;
  size?: number;
}) {
  const colors = getCategoryColors(category);
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const progress = (score / 100) * circumference;
  const offset = circumference - progress;

  // Map category to stroke color class (extracting the color value)
  const strokeColors: Record<ScoreCategory, string> = {
    hot: '#ef4444',
    warm: '#f97316',
    qualified: '#eab308',
    nurture: '#3b82f6',
    cold: '#64748b',
  };

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="transform -rotate-90"
      >
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/20"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={strokeColors[category]}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-500 ease-out"
        />
      </svg>
      {/* Score in center */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn('text-3xl font-bold tabular-nums', colors.text)}>
          {score}
        </span>
        <span className="text-xs text-muted-foreground">/ 100</span>
      </div>
    </div>
  );
}

/**
 * Score breakdown bar for engagement/quality
 */
function ScoreBreakdownBar({
  label,
  score,
  weight,
  icon: Icon,
  color,
}: {
  label: string;
  score: number;
  weight: number;
  icon: React.ElementType;
  color: string;
}) {
  const contribution = Math.round((score * weight) / 100);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-1.5">
          <Icon className={cn('h-3.5 w-3.5', color)} />
          <span className="font-medium">{label}</span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Info className="h-3 w-3 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent>
                <p>{weight}% weight in total score</p>
                <p className="text-xs text-muted-foreground">
                  Contributing {contribution} points
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs">{weight}%</span>
          <span className="font-semibold tabular-nums">{score}</span>
        </div>
      </div>
      <Progress value={score} className="h-2" />
    </div>
  );
}

/**
 * Trend indicator for score change
 */
function TrendIndicator({
  current,
  previous,
}: {
  current: number;
  previous: number;
}) {
  const diff = current - previous;
  const isUp = diff > 0;
  const isDown = diff < 0;

  if (diff === 0) {
    return (
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Minus className="h-3 w-3" />
        <span>No change</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex items-center gap-1 text-xs font-medium',
        isUp && 'text-green-600',
        isDown && 'text-red-600'
      )}
    >
      {isUp ? (
        <TrendingUp className="h-3 w-3" />
      ) : (
        <TrendingDown className="h-3 w-3" />
      )}
      <span>
        {isUp ? '+' : ''}
        {diff} from last update
      </span>
    </div>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

/**
 * LeadScoreCard - Detailed card with score breakdown
 *
 * Features:
 * - Circular progress indicator
 * - Engagement and quality score breakdown
 * - Contributing factors list
 * - Score trend display
 *
 * @example
 * <LeadScoreCard
 *   score={75}
 *   engagementScore={80}
 *   qualityScore={70}
 *   engagementWeight={50}
 *   qualityWeight={50}
 *   factors={[
 *     { id: '1', name: 'Email Opened', category: 'engagement', points: 15, maxPoints: 20 },
 *     { id: '2', name: 'Academic Score', category: 'quality', points: 35, maxPoints: 50 },
 *   ]}
 * />
 */
export function LeadScoreCard({
  score,
  engagementScore = 0,
  qualityScore = 0,
  previousScore,
  factors = [],
  engagementWeight = 50,
  qualityWeight = 50,
  className,
  compact = false,
}: LeadScoreCardProps) {
  const normalizedScore = Math.max(0, Math.min(100, Math.round(score)));
  const category = getScoreCategory(normalizedScore);
  const label = getCategoryLabel(category);
  const colors = getCategoryColors(category);

  // Group factors by category
  const engagementFactors = factors.filter((f) => f.category === 'engagement');
  const qualityFactors = factors.filter((f) => f.category === 'quality');

  if (compact) {
    return (
      <Card className={cn('overflow-hidden', className)}>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <CircularProgress score={normalizedScore} category={category} size={80} />
            <div className="flex-1 space-y-2">
              <div className="flex items-center justify-between">
                <span className={cn('text-sm font-semibold', colors.text)}>
                  {label} Lead
                </span>
                {previousScore !== undefined && (
                  <TrendIndicator current={normalizedScore} previous={previousScore} />
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-1">
                  <Activity className="h-3 w-3 text-purple-500" />
                  <span className="text-muted-foreground">Engagement:</span>
                  <span className="font-medium">{engagementScore}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Award className="h-3 w-3 text-blue-500" />
                  <span className="text-muted-foreground">Quality:</span>
                  <span className="font-medium">{qualityScore}</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader className={cn('pb-2', colors.bg)}>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className={cn('h-5 w-5', colors.icon)} />
            <span>Lead Score</span>
          </div>
          <span className={cn('text-lg font-bold', colors.text)}>
            {label}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="flex flex-col items-center gap-6">
          {/* Circular Progress */}
          <CircularProgress score={normalizedScore} category={category} />

          {/* Trend */}
          {previousScore !== undefined && (
            <TrendIndicator current={normalizedScore} previous={previousScore} />
          )}

          {/* Score Breakdown */}
          <div className="w-full space-y-4">
            <ScoreBreakdownBar
              label="Engagement"
              score={engagementScore}
              weight={engagementWeight}
              icon={Activity}
              color="text-purple-500"
            />
            <ScoreBreakdownBar
              label="Quality"
              score={qualityScore}
              weight={qualityWeight}
              icon={Award}
              color="text-blue-500"
            />
          </div>

          {/* Top Factors Summary */}
          {factors.length > 0 && (
            <div className="w-full pt-4 border-t">
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Top Contributing Factors
              </p>
              <div className="space-y-1">
                {factors
                  .sort((a, b) => b.points - a.points)
                  .slice(0, 3)
                  .map((factor) => (
                    <div
                      key={factor.id}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-muted-foreground truncate">
                        {factor.name}
                      </span>
                      <span className="font-medium text-green-600">
                        +{factor.points}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
