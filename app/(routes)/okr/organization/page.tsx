'use client';

/**
 * Organization OKR Page - Group-wide OKRs for JKKN Institutions
 *
 * This page displays OKRs at the organization level - above individual institutions.
 * These are strategic objectives that cascade down to all 9 JKKN institutions.
 *
 * Only super_admin can create organization-level OKRs.
 * All authenticated users can view them.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { format, formatDistanceToNow } from 'date-fns';
import {
  Building2,
  Plus,
  Target,
  TrendingUp,
  Calendar,
  ChevronRight,
  ArrowRight,
  AlertTriangle,
  Users,
  ListChecks,
  FileText
} from 'lucide-react';

// UI Components
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// Hooks
import { useAuth } from '@/hooks/use-auth';
import { OKRObjectiveService } from '@/lib/services/okr/okr-objective-service';
import type { OKRObjective } from '@/types/okr';

// Error Boundary
import { OKRErrorBoundary } from '../_components';

export default function OrganizationOKRPage() {
  const { profile } = useAuth();
  const [objectives, setObjectives] = useState<OKRObjective[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isSuperAdmin = profile?.role === 'super_admin';

  useEffect(() => {
    loadOrganizationOKRs();
  }, []);

  const loadOrganizationOKRs = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await OKRObjectiveService.getOrganizationObjectives();
      setObjectives(data);
    } catch (err: any) {
      console.error('[OKR] Error loading organization OKRs:', err);
      setError(err.message || 'Failed to load organization OKRs');
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500';
      case 'draft': return 'bg-yellow-500';
      case 'completed': return 'bg-blue-500';
      case 'archived': return 'bg-gray-500';
      default: return 'bg-gray-500';
    }
  };

  // Organization OKRs are ALWAYS Tier 1 - this is the highest strategic level
  const getTierBadge = () => (
    <Badge
      className="bg-emerald-900 hover:bg-emerald-900 text-white font-semibold"
      style={{ backgroundColor: '#0b6d41' }}
    >
      TIER 1
    </Badge>
  );

  // Parse AI integration notes to extract stakeholder count
  const parseAiNotes = (notes: string | null): { stakeholderCount: number; hasRisks: boolean } => {
    if (!notes) return { stakeholderCount: 0, hasRisks: false };
    try {
      const parsed = JSON.parse(notes);
      return {
        stakeholderCount: parsed.stakeholders?.length || 0,
        hasRisks: (parsed.risks?.length || 0) > 0
      };
    } catch {
      return { stakeholderCount: 0, hasRisks: false };
    }
  };

  return (
    <ContentLayout title="JKKN Group OKRs">
      <OKRErrorBoundary>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Building2 className="h-7 w-7 text-green-700" />
                JKKN Institutions - Group-wide OKRs
              </h1>
              <p className="text-muted-foreground mt-1">
                Strategic objectives that cascade across all 9 institutions
              </p>
            </div>
            {isSuperAdmin && (
              <Button asChild className="bg-green-700 hover:bg-green-800">
                <Link href="/okr/objectives/create/organization">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Group OKR
                </Link>
              </Button>
            )}
          </div>

          {/* Info Banner */}
          <Card className="bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900">
                  <Target className="h-5 w-5 text-green-700" />
                </div>
                <div>
                  <h3 className="font-semibold text-green-800 dark:text-green-200">
                    Organization-Level OKRs
                  </h3>
                  <p className="text-sm text-green-700 dark:text-green-300">
                    These OKRs represent JKKN Institutions&apos; group-wide strategic objectives.
                    They cascade down to institution, department, and individual levels.
                  </p>
                  <div className="flex items-center gap-4 mt-2 text-sm text-green-600 dark:text-green-400">
                    <span className="flex items-center gap-1">
                      <Building2 className="h-4 w-4" />
                      Organization Level
                    </span>
                    <span className="flex items-center gap-1">
                      <ChevronRight className="h-4 w-4" />
                      Cascades to 9 Institutions
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Loading State */}
          {isLoading && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-2 w-full mb-4" />
                    <Skeleton className="h-4 w-1/3" />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Error State */}
          {error && (
            <Card className="border-red-200 bg-red-50 dark:bg-red-950/20">
              <CardContent className="p-6 text-center">
                <p className="text-red-600 dark:text-red-400">{error}</p>
                <Button variant="outline" onClick={loadOrganizationOKRs} className="mt-4">
                  Try Again
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Empty State */}
          {!isLoading && !error && objectives.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="p-12 text-center">
                <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold">No Group-wide OKRs Yet</h3>
                <p className="text-muted-foreground mt-2 max-w-md mx-auto">
                  Organization-level OKRs represent strategic objectives for all JKKN Institutions.
                  {isSuperAdmin
                    ? " Create the first group-wide OKR to set the direction for all institutions."
                    : " Contact your administrator to create group-wide OKRs."}
                </p>
                {isSuperAdmin && (
                  <Button asChild className="mt-6 bg-green-700 hover:bg-green-800">
                    <Link href="/okr/objectives/create/organization">
                      <Plus className="h-4 w-4 mr-2" />
                      Create First Group OKR
                    </Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {/* Objectives Grid */}
          {!isLoading && !error && objectives.length > 0 && (
            <TooltipProvider>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {objectives.map((objective) => {
                  const krCount = objective.key_results?.length || 0;
                  const riskCount = objective.risks?.length || 0;
                  const aiNotes = parseAiNotes(objective.ai_integration_notes);

                  return (
                    <Card
                      key={objective.id}
                      className="hover:shadow-md transition-shadow cursor-pointer group border-l-4"
                      style={{ borderLeftColor: '#0b6d41' }}
                    >
                      <Link href={`/okr/objectives/${objective.id}`}>
                        <CardHeader className="pb-2">
                          <div className="flex items-start justify-between">
                            {getTierBadge()}
                            <Badge variant="outline" className="capitalize">
                              <div className={`w-2 h-2 rounded-full ${getStatusColor(objective.status)} mr-1.5`} />
                              {objective.status}
                            </Badge>
                          </div>
                          <CardTitle className="text-lg mt-2 group-hover:text-green-700 transition-colors">
                            {objective.title}
                          </CardTitle>
                          {objective.description && (
                            <CardDescription className="line-clamp-2">
                              {objective.description}
                            </CardDescription>
                          )}
                          {/* Strategic Rationale Preview */}
                          {objective.rationale && (
                            <div className="mt-2 p-2 bg-muted/50 rounded-md">
                              <p className="text-xs text-muted-foreground line-clamp-2 italic">
                                <FileText className="h-3 w-3 inline mr-1" />
                                {objective.rationale}
                              </p>
                            </div>
                          )}
                        </CardHeader>
                        <CardContent>
                          {/* Progress */}
                          <div className="space-y-2 mb-4">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">Progress</span>
                              <span className="font-medium">{objective.overall_progress}%</span>
                            </div>
                            <Progress value={objective.overall_progress} className="h-2" />
                          </div>

                          {/* Stats Row - KRs, Stakeholders, Risks */}
                          <div className="flex items-center gap-3 mb-3 flex-wrap">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center gap-1 text-xs bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 px-2 py-1 rounded-full">
                                  <ListChecks className="h-3 w-3" />
                                  <span>{krCount} KRs</span>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{krCount} Key Results defined</p>
                              </TooltipContent>
                            </Tooltip>

                            {aiNotes.stakeholderCount > 0 && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="flex items-center gap-1 text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 px-2 py-1 rounded-full">
                                    <Users className="h-3 w-3" />
                                    <span>{aiNotes.stakeholderCount}</span>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{aiNotes.stakeholderCount} Stakeholders</p>
                                </TooltipContent>
                              </Tooltip>
                            )}

                            {(riskCount > 0 || aiNotes.hasRisks) && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="flex items-center gap-1 text-xs bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 px-2 py-1 rounded-full">
                                    <AlertTriangle className="h-3 w-3" />
                                    <span>{riskCount || 'Has'} Risks</span>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{riskCount > 0 ? `${riskCount} identified risks` : 'Risks identified'}</p>
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>

                          {/* Meta Info - Timeline */}
                          <div className="flex items-center justify-between text-sm text-muted-foreground border-t pt-3">
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3.5 w-3.5" />
                              <span>Due {format(new Date(objective.end_date), 'MMM yyyy')}</span>
                            </div>
                            <div className="flex items-center gap-1 text-xs">
                              <span className="text-muted-foreground">
                                {formatDistanceToNow(new Date(objective.end_date), { addSuffix: true })}
                              </span>
                            </div>
                            <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity text-green-700" />
                          </div>
                        </CardContent>
                      </Link>
                    </Card>
                  );
                })}
              </div>
            </TooltipProvider>
          )}

          {/* Cascade Info */}
          {!isLoading && objectives.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-blue-600" />
                  OKR Hierarchy
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-sm">
                  <Badge variant="outline" className="bg-green-50">
                    Organization (JKKN Group)
                  </Badge>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  <Badge variant="outline">
                    Institution (9 Colleges)
                  </Badge>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  <Badge variant="outline">
                    Department
                  </Badge>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  <Badge variant="outline">
                    Individual
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-3">
                  Group-wide OKRs set the strategic direction. Institutions, departments, and
                  individuals align their OKRs to these group objectives.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </OKRErrorBoundary>
    </ContentLayout>
  );
}
