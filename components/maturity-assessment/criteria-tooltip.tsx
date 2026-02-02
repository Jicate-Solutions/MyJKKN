/**
 * Criteria Tooltip Component
 *
 * Tooltip explaining criteria for each maturity stage.
 * Shows what's needed to reach the next stage and evidence requirements.
 */

'use client';

import { HelpCircle, CheckCircle2, ArrowRight } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import type {
  MaturityDimensionName,
  MaturityStage,
  MaturityDimension
} from '@/types/maturity-assessment';
import { MATURITY_STAGE_NAMES } from '@/types/maturity-assessment';

interface CriteriaTooltipProps {
  dimension: MaturityDimensionName;
  currentStage: MaturityStage;
  targetStage?: MaturityStage | null;
  criteria?: MaturityDimension;
  trigger?: 'icon' | 'text' | 'badge';
  className?: string;
}

/**
 * Default criteria for each dimension and stage
 * These can be overridden by passing custom criteria
 */
const DEFAULT_CRITERIA: Record<
  MaturityDimensionName,
  Record<MaturityStage, { description: string; evidence: string[] }>
> = {
  Leadership: {
    1: {
      description: 'Ad-hoc leadership, reactive decision-making',
      evidence: [
        'Leadership structure exists',
        'Basic meeting records',
        'Evidence of decisions made'
      ]
    },
    2: {
      description: 'Leadership structure defined, roles documented',
      evidence: [
        'Organizational chart',
        'Role descriptions',
        'Regular leadership meetings documented'
      ]
    },
    3: {
      description: 'Strategic leadership, goals aligned with vision',
      evidence: [
        'Strategic plan document',
        'Goal alignment matrix',
        'Leadership development program'
      ]
    },
    4: {
      description: 'Integrated leadership, continuous improvement culture',
      evidence: [
        'Continuous improvement initiatives',
        'Leadership effectiveness metrics',
        'Succession planning evidence'
      ]
    }
  },
  Strategy: {
    1: {
      description: 'No formal strategy, reactive planning',
      evidence: ['Basic mission/vision statement', 'Evidence of some planning']
    },
    2: {
      description: 'Basic strategic planning process exists',
      evidence: ['Written strategic plan', 'Annual planning cycle', 'SWOT analysis']
    },
    3: {
      description: 'Strategy linked to operations, OKRs tracked',
      evidence: ['OKR framework', 'Strategy execution dashboard', 'Quarterly reviews']
    },
    4: {
      description: 'Integrated strategy, data-driven adjustments',
      evidence: [
        'Real-time strategy monitoring',
        'Predictive analytics',
        'Agile strategy adaptation'
      ]
    }
  },
  People: {
    1: {
      description: 'Ad-hoc staffing, minimal training',
      evidence: ['Staff roster', 'Basic job descriptions', 'Hiring records']
    },
    2: {
      description: 'HR processes documented, basic training programs',
      evidence: [
        'HR policy manual',
        'Training schedule',
        'Performance review process'
      ]
    },
    3: {
      description: 'Competency framework, development plans aligned',
      evidence: [
        'Competency matrix',
        'Individual development plans',
        'Career progression paths'
      ]
    },
    4: {
      description: 'Integrated talent management, continuous learning culture',
      evidence: [
        'Learning management system',
        'Skills inventory dashboard',
        'Innovation initiatives'
      ]
    }
  },
  Processes: {
    1: {
      description: 'Ad-hoc processes, firefighting mode',
      evidence: ['Basic process documentation', 'Evidence of workflow']
    },
    2: {
      description: 'Key processes documented, some standardization',
      evidence: [
        'Process maps',
        'Standard operating procedures',
        'Process ownership assigned'
      ]
    },
    3: {
      description: 'Processes linked to goals, metrics tracked',
      evidence: [
        'Process performance metrics',
        'Goal-process linkage matrix',
        'Regular process reviews'
      ]
    },
    4: {
      description: 'Integrated processes, continuous optimization',
      evidence: [
        'Process automation evidence',
        'Continuous improvement projects',
        'Process efficiency analytics'
      ]
    }
  },
  Resources: {
    1: {
      description: 'Minimal data collection, reactive resource allocation',
      evidence: ['Basic financial records', 'Asset inventory', 'Budget documents']
    },
    2: {
      description: 'Data systems established, regular reporting',
      evidence: [
        'Management information system',
        'Regular reports',
        'Resource utilization tracking'
      ]
    },
    3: {
      description: 'Data analytics, resource optimization based on metrics',
      evidence: [
        'Analytics dashboard',
        'Resource optimization reports',
        'Data-driven decisions documented'
      ]
    },
    4: {
      description: 'Integrated data systems, predictive resource planning',
      evidence: [
        'Predictive analytics models',
        'Real-time resource monitoring',
        'Integrated data platform'
      ]
    }
  },
  Results: {
    1: {
      description: 'Minimal stakeholder feedback, reactive responses',
      evidence: [
        'Basic satisfaction surveys',
        'Complaint records',
        'Some outcome data'
      ]
    },
    2: {
      description: 'Regular stakeholder surveys, basic outcome tracking',
      evidence: [
        'Stakeholder feedback system',
        'Regular survey results',
        'Outcome metrics defined'
      ]
    },
    3: {
      description: 'Multi-stakeholder balanced scorecard, trend analysis',
      evidence: [
        'Balanced scorecard',
        'Trend analysis reports',
        'Stakeholder satisfaction benchmarks'
      ]
    },
    4: {
      description: 'Integrated results monitoring, continuous stakeholder engagement',
      evidence: [
        'Real-time results dashboard',
        'Stakeholder co-creation initiatives',
        'Excellence recognition'
      ]
    }
  }
};

export function CriteriaTooltip({
  dimension,
  currentStage,
  targetStage,
  criteria,
  trigger = 'icon',
  className
}: CriteriaTooltipProps) {
  const nextStage =
    targetStage && targetStage > currentStage
      ? targetStage
      : currentStage < 4
        ? ((currentStage + 1) as MaturityStage)
        : null;

  const currentCriteria = DEFAULT_CRITERIA[dimension][currentStage];
  const nextCriteria = nextStage ? DEFAULT_CRITERIA[dimension][nextStage] : null;

  // Custom criteria override
  const getCurrentStageCriteria = () => {
    if (criteria) {
      const key = `stage_${currentStage}_criteria` as keyof MaturityDimension;
      return criteria[key] as string;
    }
    return currentCriteria.description;
  };

  const getNextStageCriteria = () => {
    if (criteria && nextStage) {
      const key = `stage_${nextStage}_criteria` as keyof MaturityDimension;
      return criteria[key] as string;
    }
    return nextCriteria?.description;
  };

  // Render trigger element
  let triggerElement: React.ReactNode;

  switch (trigger) {
    case 'text':
      triggerElement = (
        <button className="text-primary hover:underline inline-flex items-center gap-1">
          View Criteria
          <HelpCircle className="h-4 w-4" />
        </button>
      );
      break;
    case 'badge':
      triggerElement = (
        <Badge variant="outline" className="cursor-help">
          <HelpCircle className="h-3 w-3 mr-1" />
          Criteria
        </Badge>
      );
      break;
    case 'icon':
    default:
      triggerElement = (
        <button className="text-muted-foreground hover:text-primary transition-colors">
          <HelpCircle className="h-4 w-4" />
        </button>
      );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={className}>{triggerElement}</span>
        </TooltipTrigger>
        <TooltipContent className="max-w-sm p-4" side="bottom">
          <div className="space-y-4">
            {/* Current Stage */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="font-semibold text-sm">
                  Current: Stage {currentStage} ({MATURITY_STAGE_NAMES[currentStage]})
                </span>
              </div>
              <p className="text-xs text-muted-foreground mb-2">
                {getCurrentStageCriteria()}
              </p>
              <div className="text-xs">
                <div className="font-medium mb-1">Evidence Required:</div>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  {currentCriteria.evidence.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Next Stage */}
            {nextStage && nextCriteria && (
              <>
                <div className="border-t pt-3">
                  <div className="flex items-center gap-2 mb-2">
                    <ArrowRight className="h-4 w-4 text-blue-600" />
                    <span className="font-semibold text-sm">
                      Next: Stage {nextStage} ({MATURITY_STAGE_NAMES[nextStage]})
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">
                    {getNextStageCriteria()}
                  </p>
                  <div className="text-xs">
                    <div className="font-medium mb-1">To Reach This Stage:</div>
                    <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                      {nextCriteria.evidence.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </>
            )}

            {/* Already at Excellence */}
            {currentStage === 4 && (
              <div className="text-center py-2 text-green-600 text-xs font-medium">
                🏆 Excellence Stage Achieved! Continue monitoring and improving.
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Dimension Criteria Info Card
 * Standalone card showing criteria without tooltip
 */
interface DimensionCriteriaCardProps {
  dimension: MaturityDimensionName;
  stage: MaturityStage;
  criteria?: MaturityDimension;
  showEvidence?: boolean;
}

export function DimensionCriteriaCard({
  dimension,
  stage,
  criteria,
  showEvidence = true
}: DimensionCriteriaCardProps) {
  const stageCriteria = DEFAULT_CRITERIA[dimension][stage];

  const getCriteria = () => {
    if (criteria) {
      const key = `stage_${stage}_criteria` as keyof MaturityDimension;
      return criteria[key] as string;
    }
    return stageCriteria.description;
  };

  return (
    <div className="p-4 rounded-lg border bg-card">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h4 className="font-semibold">{dimension}</h4>
          <p className="text-sm text-muted-foreground">
            Stage {stage}: {MATURITY_STAGE_NAMES[stage]}
          </p>
        </div>
        <Badge variant="outline">Current</Badge>
      </div>

      <p className="text-sm mb-3">{getCriteria()}</p>

      {showEvidence && (
        <div>
          <div className="text-xs font-medium mb-2">Evidence Required:</div>
          <ul className="text-xs space-y-1 text-muted-foreground">
            {stageCriteria.evidence.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <CheckCircle2 className="h-3 w-3 mt-0.5 flex-shrink-0 text-green-600" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
