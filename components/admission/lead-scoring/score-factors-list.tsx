'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Minus,
  Activity,
  Award,
  MousePointer,
  Mail,
  Phone,
  MapPin,
  FileText,
  GraduationCap,
  Clock,
  Users,
  Globe,
  MessageSquare,
} from 'lucide-react';
import type { ScoreFactor } from './lead-score-card';

// ============================================
// TYPES
// ============================================

export interface ScoreFactorWithDetails extends ScoreFactor {
  icon?: string;
  isPositive?: boolean;
  occurrences?: number;
  maxOccurrences?: number;
  lastUpdated?: string;
}

export interface ScoreFactorsListProps {
  factors: ScoreFactorWithDetails[];
  className?: string;
  defaultExpanded?: boolean;
  groupByCategory?: boolean;
}

// ============================================
// HELPERS
// ============================================

/**
 * Get icon component for factor type
 */
function getFactorIcon(name: string, iconName?: string) {
  const iconClass = 'h-4 w-4';

  // Check for specific icon name first
  if (iconName) {
    const iconMap: Record<string, React.ReactNode> = {
      click: <MousePointer className={iconClass} />,
      email: <Mail className={iconClass} />,
      phone: <Phone className={iconClass} />,
      visit: <MapPin className={iconClass} />,
      document: <FileText className={iconClass} />,
      academic: <GraduationCap className={iconClass} />,
      time: <Clock className={iconClass} />,
      referral: <Users className={iconClass} />,
      website: <Globe className={iconClass} />,
      message: <MessageSquare className={iconClass} />,
      activity: <Activity className={iconClass} />,
      award: <Award className={iconClass} />,
    };
    if (iconMap[iconName]) return iconMap[iconName];
  }

  // Infer icon from factor name
  const lowerName = name.toLowerCase();

  if (lowerName.includes('email') || lowerName.includes('mail')) {
    return <Mail className={iconClass} />;
  }
  if (lowerName.includes('call') || lowerName.includes('phone')) {
    return <Phone className={iconClass} />;
  }
  if (lowerName.includes('visit') || lowerName.includes('campus')) {
    return <MapPin className={iconClass} />;
  }
  if (lowerName.includes('document') || lowerName.includes('upload') || lowerName.includes('form')) {
    return <FileText className={iconClass} />;
  }
  if (lowerName.includes('academic') || lowerName.includes('score') || lowerName.includes('marks') || lowerName.includes('exam')) {
    return <GraduationCap className={iconClass} />;
  }
  if (lowerName.includes('website') || lowerName.includes('web')) {
    return <Globe className={iconClass} />;
  }
  if (lowerName.includes('whatsapp') || lowerName.includes('chat') || lowerName.includes('message')) {
    return <MessageSquare className={iconClass} />;
  }
  if (lowerName.includes('click')) {
    return <MousePointer className={iconClass} />;
  }
  if (lowerName.includes('referral')) {
    return <Users className={iconClass} />;
  }

  // Default based on category
  return <Activity className={iconClass} />;
}

/**
 * Format the contribution display
 */
function formatContribution(points: number, maxPoints: number): string {
  const percentage = maxPoints > 0 ? Math.round((points / maxPoints) * 100) : 0;
  return `${points}/${maxPoints} (${percentage}%)`;
}

// ============================================
// SUBCOMPONENTS
// ============================================

/**
 * Single factor item row
 */
function FactorItem({ factor }: { factor: ScoreFactorWithDetails }) {
  const isPositive = factor.isPositive !== false && factor.points > 0;
  const percentage = factor.maxPoints > 0
    ? Math.round((factor.points / factor.maxPoints) * 100)
    : 0;

  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors">
      {/* Icon */}
      <div
        className={cn(
          'flex items-center justify-center w-8 h-8 rounded-lg',
          factor.category === 'engagement'
            ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400'
            : 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
        )}
      >
        {getFactorIcon(factor.name, factor.icon)}
      </div>

      {/* Name and description */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{factor.name}</span>
          {factor.occurrences !== undefined && factor.maxOccurrences !== undefined && (
            <Badge variant="secondary" className="text-xs">
              {factor.occurrences}/{factor.maxOccurrences}
            </Badge>
          )}
        </div>
        {factor.description && (
          <p className="text-xs text-muted-foreground truncate">
            {factor.description}
          </p>
        )}
      </div>

      {/* Points contribution */}
      <div className="flex items-center gap-2">
        {/* Progress indicator */}
        <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all',
              isPositive ? 'bg-green-500' : 'bg-red-500'
            )}
            style={{ width: `${percentage}%` }}
          />
        </div>

        {/* Points */}
        <div
          className={cn(
            'flex items-center gap-0.5 min-w-[60px] justify-end text-sm font-semibold',
            isPositive ? 'text-green-600' : 'text-red-600'
          )}
        >
          {isPositive ? (
            <Plus className="h-3 w-3" />
          ) : (
            <Minus className="h-3 w-3" />
          )}
          <span className="tabular-nums">{Math.abs(factor.points)}</span>
          <span className="text-muted-foreground text-xs font-normal">
            /{factor.maxPoints}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Collapsible category group
 */
function CategoryGroup({
  title,
  icon: Icon,
  iconColor,
  factors,
  defaultExpanded = true,
  totalPoints,
  maxPoints,
}: {
  title: string;
  icon: React.ElementType;
  iconColor: string;
  factors: ScoreFactorWithDetails[];
  defaultExpanded?: boolean;
  totalPoints: number;
  maxPoints: number;
}) {
  const [isOpen, setIsOpen] = useState(defaultExpanded);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          className="w-full justify-between px-3 py-2 h-auto hover:bg-muted/50"
        >
          <div className="flex items-center gap-2">
            <Icon className={cn('h-4 w-4', iconColor)} />
            <span className="font-semibold">{title}</span>
            <Badge variant="secondary" className="text-xs">
              {factors.length}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {totalPoints}/{maxPoints} pts
            </span>
            {isOpen ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </div>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 space-y-0.5">
          {factors.map((factor) => (
            <FactorItem key={factor.id} factor={factor} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

/**
 * ScoreFactorsList - Expandable list of score factors
 *
 * Features:
 * - Group by engagement/quality category
 * - Expandable sections
 * - Positive/negative contribution indicators
 * - Progress bars for each factor
 * - Icons for factor types
 *
 * @example
 * <ScoreFactorsList
 *   factors={[
 *     { id: '1', name: 'Email Opened', category: 'engagement', points: 15, maxPoints: 20 },
 *     { id: '2', name: 'Campus Visit', category: 'engagement', points: 50, maxPoints: 50 },
 *     { id: '3', name: '12th Marks', category: 'quality', points: 35, maxPoints: 50 },
 *   ]}
 *   groupByCategory
 * />
 */
export function ScoreFactorsList({
  factors,
  className,
  defaultExpanded = true,
  groupByCategory = true,
}: ScoreFactorsListProps) {
  if (factors.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="py-8 text-center">
          <Activity className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground">No scoring factors available</p>
        </CardContent>
      </Card>
    );
  }

  // Group factors by category
  const engagementFactors = factors.filter((f) => f.category === 'engagement');
  const qualityFactors = factors.filter((f) => f.category === 'quality');

  // Calculate totals
  const engagementTotal = engagementFactors.reduce((sum, f) => sum + f.points, 0);
  const engagementMax = engagementFactors.reduce((sum, f) => sum + f.maxPoints, 0);
  const qualityTotal = qualityFactors.reduce((sum, f) => sum + f.points, 0);
  const qualityMax = qualityFactors.reduce((sum, f) => sum + f.maxPoints, 0);

  if (!groupByCategory) {
    // Flat list
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Score Factors
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-0.5">
            {factors
              .sort((a, b) => b.points - a.points)
              .map((factor) => (
                <FactorItem key={factor.id} factor={factor} />
              ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Score Breakdown
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {engagementFactors.length > 0 && (
          <CategoryGroup
            title="Engagement Factors"
            icon={Activity}
            iconColor="text-purple-500"
            factors={engagementFactors}
            defaultExpanded={defaultExpanded}
            totalPoints={engagementTotal}
            maxPoints={engagementMax}
          />
        )}
        {qualityFactors.length > 0 && (
          <CategoryGroup
            title="Quality Factors"
            icon={Award}
            iconColor="text-blue-500"
            factors={qualityFactors}
            defaultExpanded={defaultExpanded}
            totalPoints={qualityTotal}
            maxPoints={qualityMax}
          />
        )}
      </CardContent>
    </Card>
  );
}
