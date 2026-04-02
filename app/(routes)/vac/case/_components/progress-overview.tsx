'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { GraduationCap, Clock, AlertTriangle, CalendarCheck } from 'lucide-react';
import type { CASELearnerProgress, CASETrackEnrollmentWithTrack } from '@/types/case';

interface ProgressOverviewProps {
  learnerProgress: CASELearnerProgress | null;
  trackEnrollments: CASETrackEnrollmentWithTrack[];
}

const TOTAL_TRACKS = 6;
const TOTAL_HOURS = 180;

const RISK_BADGE_STYLES: Record<string, string> = {
  on_track: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  at_risk: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  critical: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  overdue: 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900',
  completed: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
};

const RISK_LABELS: Record<string, string> = {
  on_track: 'On Track',
  at_risk: 'At Risk',
  critical: 'Critical',
  overdue: 'Overdue',
  completed: 'Completed',
};

function CircularProgress({ value, max, size = 120 }: { value: number; max: number; size?: number }) {
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  const offset = circumference - pct * circumference;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Background ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/30"
        />
        {/* Progress ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={pct >= 1 ? 'text-green-500' : pct >= 0.5 ? 'text-primary' : 'text-amber-500'}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-2xl font-bold tabular-nums">{value}</span>
        <span className="text-[10px] text-muted-foreground">of {max}</span>
      </div>
    </div>
  );
}

export function ProgressOverview({ learnerProgress, trackEnrollments }: ProgressOverviewProps) {
  const tracksCompleted = learnerProgress?.tracks_completed ?? 0;
  const totalHours = learnerProgress?.total_hours_completed ?? 0;
  const riskLevel = learnerProgress?.risk_level ?? 'on_track';
  const estimatedExamDate = learnerProgress?.estimated_exam_date;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <GraduationCap className="h-4 w-4 text-primary" />
          CASE Progress Overview
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
          {/* Circular progress ring */}
          <div className="flex flex-col items-center gap-1.5">
            <CircularProgress value={tracksCompleted} max={TOTAL_TRACKS} />
            <span className="text-xs font-medium text-muted-foreground">Tracks Completed</span>
          </div>

          {/* Stats grid */}
          <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-3">
            {/* Total Hours */}
            <div className="flex items-start gap-3 rounded-lg border p-3">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-lg font-bold tabular-nums">
                  {totalHours}<span className="text-xs font-normal text-muted-foreground">/{TOTAL_HOURS}h</span>
                </p>
                <p className="text-[11px] text-muted-foreground">Total Hours</p>
              </div>
            </div>

            {/* Risk Level */}
            <div className="flex items-start gap-3 rounded-lg border p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <Badge variant="secondary" className={`text-xs ${RISK_BADGE_STYLES[riskLevel] || ''}`}>
                  {RISK_LABELS[riskLevel] || riskLevel}
                </Badge>
                <p className="mt-1 text-[11px] text-muted-foreground">Risk Level</p>
              </div>
            </div>

            {/* Estimated Graduation */}
            <div className="flex items-start gap-3 rounded-lg border p-3">
              <CalendarCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-sm font-semibold">
                  {estimatedExamDate
                    ? new Date(estimatedExamDate).toLocaleDateString('en-IN', {
                        month: 'short',
                        year: 'numeric',
                      })
                    : '—'}
                </p>
                <p className="text-[11px] text-muted-foreground">Est. Graduation</p>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
