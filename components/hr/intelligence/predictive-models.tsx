'use client';

/**
 * HR Intelligence — Tab 15: Predictive Models
 *
 * Structured placeholder for AI/ML-powered predictive analytics:
 * attrition risk scoring, demand forecasting, compensation benchmarking.
 * These require ML pipelines not yet built — this tab describes the
 * planned capabilities and data prerequisites.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Brain,
  TrendingUp,
  Users,
  BarChart3,
  Target,
  Cpu,
  Database,
  Sparkles,
} from 'lucide-react';

interface PlannedModelProps {
  icon: React.ElementType;
  title: string;
  description: string;
  dataRequirements: string[];
  estimatedAccuracy: string;
  status: 'planned' | 'data-collection' | 'in-development';
}

function PlannedModelCard({
  icon: Icon,
  title,
  description,
  dataRequirements,
  estimatedAccuracy,
  status,
}: PlannedModelProps) {
  const statusConfig = {
    planned: { label: 'Planned', color: 'bg-gray-100 text-gray-700 border-gray-300' },
    'data-collection': { label: 'Collecting Data', color: 'bg-blue-100 text-blue-700 border-blue-300' },
    'in-development': { label: 'In Development', color: 'bg-amber-100 text-amber-700 border-amber-300' },
  };

  const sc = statusConfig[status];

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10">
              <Icon className="h-4 w-4 text-primary" />
            </div>
            <CardTitle className="text-sm">{title}</CardTitle>
          </div>
          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${sc.color}`}>
            {sc.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <p className="text-xs text-muted-foreground">{description}</p>

        <div>
          <p className="text-xs font-medium mb-1.5">Data Requirements:</p>
          <div className="flex flex-wrap gap-1">
            {dataRequirements.map((req) => (
              <Badge key={req} variant="secondary" className="text-[10px] px-1.5 py-0">
                {req}
              </Badge>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
          <span>Est. accuracy</span>
          <span className="font-medium">{estimatedAccuracy}</span>
        </div>
      </CardContent>
    </Card>
  );
}

const PLANNED_MODELS: PlannedModelProps[] = [
  {
    icon: Users,
    title: 'Attrition Risk Scoring',
    description:
      'Predict which employees are at risk of leaving within the next 6 months based on leave patterns, tenure, compensation data, and engagement signals.',
    dataRequirements: ['12+ months leave data', 'Staff tenure records', 'Compensation history', 'Performance reviews'],
    estimatedAccuracy: '75-85%',
    status: 'data-collection',
  },
  {
    icon: TrendingUp,
    title: 'Demand Forecasting',
    description:
      'Forecast staffing needs per department based on student enrollment projections, seasonal patterns, and historical hiring velocity.',
    dataRequirements: ['Enrollment projections', 'Historical headcount', 'Recruitment timelines', 'Department growth data'],
    estimatedAccuracy: '70-80%',
    status: 'planned',
  },
  {
    icon: BarChart3,
    title: 'Compensation Benchmarking',
    description:
      'Compare internal compensation bands against regional education sector benchmarks to identify under/over-compensation risks.',
    dataRequirements: ['Current salary data', 'Regional benchmarks', 'Role classifications', 'Experience bands'],
    estimatedAccuracy: 'N/A (index-based)',
    status: 'planned',
  },
  {
    icon: Target,
    title: 'Performance Trajectory',
    description:
      'Identify employees with accelerating or declining performance trends to support early intervention and succession planning.',
    dataRequirements: ['3+ review cycles', 'Training completion', 'Project contributions', 'Peer feedback'],
    estimatedAccuracy: '65-75%',
    status: 'planned',
  },
  {
    icon: Cpu,
    title: 'Optimal Team Composition',
    description:
      'Recommend team structures that maximize output based on skill complementarity, workload distribution, and past collaboration success.',
    dataRequirements: ['Skills matrix data', 'Workload metrics', 'Project outcomes', 'Team history'],
    estimatedAccuracy: '60-70%',
    status: 'planned',
  },
  {
    icon: Sparkles,
    title: 'Recruitment Source ROI',
    description:
      'Score recruitment channels by quality-of-hire metrics: retention after 1 year, performance ratings, time-to-productivity.',
    dataRequirements: ['Candidate source tracking', '1-year retention data', 'Performance data', 'Time-to-fill records'],
    estimatedAccuracy: '70-80%',
    status: 'planned',
  },
];

export function PredictiveModelsTab() {
  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Predictive Models
          </CardTitle>
          <CardDescription>
            AI/ML-powered analytics for workforce planning, risk detection, and strategic
            HR decision-making. Models require sufficient historical data before activation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Database className="h-3.5 w-3.5" />
              <span>{PLANNED_MODELS.length} models planned</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Cpu className="h-3.5 w-3.5" />
              <span>{PLANNED_MODELS.filter((m) => m.status === 'data-collection').length} collecting data</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              <span>{PLANNED_MODELS.filter((m) => m.status === 'in-development').length} in development</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Model cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {PLANNED_MODELS.map((model) => (
          <PlannedModelCard key={model.title} {...model} />
        ))}
      </div>

      {/* Data readiness notice */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <Database className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium">Data Readiness</p>
              <p className="text-xs text-muted-foreground mt-1">
                Predictive models require 6-12 months of clean historical data before training can begin.
                The platform is actively collecting data through leave, performance, recruitment, and
                payroll modules. Model activation will be phased as data thresholds are met.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
