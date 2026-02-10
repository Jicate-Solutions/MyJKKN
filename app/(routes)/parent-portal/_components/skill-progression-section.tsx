'use client';

import { Loader2, Award, Code2, GraduationCap, ShieldCheck, Star, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useLearnerSkills } from '@/hooks/parent-portal/use-learner-skills';
import type { ParentCompetencyView, ParentSolutionView } from '@/types/parent-portal';

const LEVEL_CONFIG: Record<string, { label: string; color: string }> = {
  novice: { label: 'Novice', color: 'bg-gray-400' },
  beginner: { label: 'Beginner', color: 'bg-blue-400' },
  intermediate: { label: 'Intermediate', color: 'bg-yellow-500' },
  advanced: { label: 'Advanced', color: 'bg-green-500' },
  expert: { label: 'Expert', color: 'bg-purple-500' },
};

interface SkillProgressionSectionProps {
  learnerId: string;
  learnerName: string;
}

export function SkillProgressionSection({ learnerId, learnerName }: SkillProgressionSectionProps) {
  const { data, isLoading, error } = useLearnerSkills(learnerId);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="ml-2 text-sm text-gray-500">Loading skills data...</span>
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return null;
  }

  const hasAnyData =
    data.competencies.length > 0 ||
    data.builder !== null ||
    data.aiGraduation.cleared ||
    data.industryReadiness !== null;

  if (!hasAnyData) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <TrendingUp className="h-5 w-5 text-indigo-600" />
          Skills &amp; Growth — {learnerName}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Competency Progress */}
        {data.competencies.length > 0 && (
          <CompetencySection
            competencies={data.competencies}
            stats={data.competencyStats}
          />
        )}

        {/* Solutions Built */}
        {data.solutions.length > 0 && (
          <SolutionsSection solutions={data.solutions} />
        )}

        {/* AI Graduation + Readiness Row */}
        {(data.aiGraduation.cleared || data.industryReadiness !== null || data.capabilities.length > 0) && (
          <ReadinessSection
            aiCleared={data.aiGraduation.cleared}
            aiClearedAt={data.aiGraduation.clearedAt}
            readinessScore={data.industryReadiness}
            capabilities={data.capabilities}
          />
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Competency Sub-Section ───────────────────────────────────── */

function CompetencySection({
  competencies,
  stats,
}: {
  competencies: ParentCompetencyView[];
  stats: { total: number; mastered: number; inProgress: number; notStarted: number };
}) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-700">
          <Award className="h-4 w-4 text-amber-500" />
          Competencies
        </h3>
        <div className="flex gap-3 text-xs text-gray-500">
          <span className="text-green-600">{stats.mastered} mastered</span>
          <span className="text-yellow-600">{stats.inProgress} in progress</span>
          <span className="text-gray-400">{stats.notStarted} not started</span>
        </div>
      </div>
      <div className="space-y-2">
        {competencies.map((c) => {
          const config = LEVEL_CONFIG[c.currentLevel] || LEVEL_CONFIG.novice;
          return (
            <div key={c.id} className="flex items-center gap-3">
              <span className="w-36 truncate text-xs text-gray-600" title={c.name}>
                {c.name}
              </span>
              <div className="flex-1">
                <div className="h-2 rounded-full bg-gray-100">
                  <div
                    className={`h-2 rounded-full ${config.color}`}
                    style={{ width: `${c.progressPercent}%` }}
                  />
                </div>
              </div>
              <span className="w-20 text-right text-xs text-gray-500">
                {config.label}
              </span>
              {c.verified && (
                <span title="Verified">
                  <ShieldCheck className="h-3.5 w-3.5 text-green-500" />
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Solutions Sub-Section ─────────────────────────────────────── */

function SolutionsSection({ solutions }: { solutions: ParentSolutionView[] }) {
  return (
    <div>
      <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-gray-700">
        <Code2 className="h-4 w-4 text-blue-500" />
        Solutions Built
      </h3>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {solutions.map((s, i) => (
          <div
            key={`${s.code}-${i}`}
            className="flex items-start gap-2 rounded-lg border p-3"
          >
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-medium text-gray-800" title={s.title}>
                {s.title}
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <Badge variant="outline" className="text-[10px]">
                  {s.role}
                </Badge>
                <Badge
                  variant={s.status === 'completed' ? 'default' : 'secondary'}
                  className="text-[10px]"
                >
                  {s.status}
                </Badge>
              </div>
            </div>
            {s.rating !== null && (
              <div className="flex items-center gap-0.5 text-amber-500">
                <Star className="h-3.5 w-3.5 fill-current" />
                <span className="text-xs font-medium">{s.rating.toFixed(1)}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Readiness Sub-Section ────────────────────────────────────── */

function ReadinessSection({
  aiCleared,
  aiClearedAt,
  readinessScore,
  capabilities,
}: {
  aiCleared: boolean;
  aiClearedAt: string | null;
  readinessScore: number | null;
  capabilities: string[];
}) {
  return (
    <div className="flex flex-wrap gap-4">
      {/* AI Graduation Gate */}
      <div className="flex items-center gap-2 rounded-lg border px-4 py-3">
        <GraduationCap className={`h-5 w-5 ${aiCleared ? 'text-green-600' : 'text-gray-400'}`} />
        <div>
          <p className="text-xs font-medium text-gray-500">AI Graduation</p>
          {aiCleared ? (
            <p className="text-sm font-semibold text-green-600">
              Cleared
              {aiClearedAt && (
                <span className="ml-1 font-normal text-gray-400">
                  {new Date(aiClearedAt).toLocaleDateString()}
                </span>
              )}
            </p>
          ) : (
            <p className="text-sm text-gray-500">Not yet cleared</p>
          )}
        </div>
      </div>

      {/* Industry Readiness */}
      {readinessScore !== null && (
        <div className="flex items-center gap-2 rounded-lg border px-4 py-3">
          <TrendingUp className="h-5 w-5 text-indigo-500" />
          <div>
            <p className="text-xs font-medium text-gray-500">Industry Readiness</p>
            <p className="text-sm font-semibold text-indigo-600">{readinessScore}%</p>
          </div>
        </div>
      )}

      {/* Capabilities */}
      {capabilities.length > 0 && (
        <div className="flex-1 min-w-[200px]">
          <p className="mb-1.5 text-xs font-medium text-gray-500">Capabilities</p>
          <div className="flex flex-wrap gap-1.5">
            {capabilities.slice(0, 8).map((cap) => (
              <Badge key={cap} variant="secondary" className="text-[10px]">
                {cap}
              </Badge>
            ))}
            {capabilities.length > 8 && (
              <Badge variant="outline" className="text-[10px]">
                +{capabilities.length - 8} more
              </Badge>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
