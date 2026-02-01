'use client';

// ============================================================================
// OKR A/B/C/D Matrix Page
// Process vs. Result analysis for strategic assessment
// ============================================================================

import { useState } from 'react';
import Link from 'next/link';
import {
  AlertOctagon,
  Target,
  ChevronRight,
  Filter,
  AlertTriangle,
  CheckCircle2,
  Search,
  Info,
  Star
} from 'lucide-react';

// UI Components
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

// Hooks
import { useABCDAnalysis, useABCDDistribution, useDCategoryAlerts } from '@/hooks/okr/use-key-results';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';

// Components
import { OKRErrorBoundary } from '../_components';
import { ABCDMatrix, ABCDMatrixCompact } from '../_components/abcd-matrix';
import { ABCDDistribution, ABCDDistributionBar } from '../_components/abcd-distribution';

// Types
import { ABCD_CATEGORY_CONFIG, ABCDCategory, PROCESS_RATING_LABELS } from '@/types/okr';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

export default function ABCDMatrixPage() {
  const { institutions } = useUserInstitutionAccess();
  const institutionId = institutions?.[0]?.institution_id || undefined;

  // Filter state
  const [categoryFilter, setCategoryFilter] = useState<ABCDCategory | 'all'>('all');

  // Fetch data
  const { data: analysisData = [], isLoading: analysisLoading } = useABCDAnalysis({
    institution_id: institutionId,
    category: categoryFilter === 'all' ? undefined : categoryFilter
  });

  const { data: distributionData = [], isLoading: distributionLoading } = useABCDDistribution({
    institution_id: institutionId
  });

  const { data: dCategoryAlerts = [], isLoading: alertsLoading } = useDCategoryAlerts(institutionId);

  const isLoading = analysisLoading || distributionLoading || alertsLoading;

  return (
    <ContentLayout title="A/B/C/D Matrix">
      <OKRErrorBoundary>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Target className="h-6 w-6" style={{ color: '#0b6d41' }} />
                Process vs. Result Analysis
              </h1>
              <p className="text-muted-foreground mt-1">
                Evaluate key results based on process quality and outcome achievement
              </p>
            </div>
            <Button asChild>
              <Link href="/okr">
                Back to OKR Dashboard
              </Link>
            </Button>
          </div>

          {/* Explanation Card */}
          <Alert className="border-blue-200 bg-blue-50">
            <Info className="h-4 w-4 text-blue-600" />
            <AlertTitle className="text-blue-800">Understanding the A/B/C/D Matrix</AlertTitle>
            <AlertDescription className="text-blue-700">
              <p className="mb-2">
                The A/B/C/D matrix helps distinguish between luck and skill by evaluating both the
                <strong> process quality</strong> (how well you executed) and the <strong>result</strong> (what you achieved).
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
                {(['A', 'B', 'C', 'D'] as const).map((cat) => {
                  const config = ABCD_CATEGORY_CONFIG[cat];
                  return (
                    <div key={cat} className={cn('p-2 rounded text-xs', config.bgColor)}>
                      <span className={cn('font-bold', config.color)}>{cat}:</span>{' '}
                      <span className={config.color}>{config.label}</span>
                    </div>
                  );
                })}
              </div>
            </AlertDescription>
          </Alert>

          {/* D-Category Alerts (Danger Zone) */}
          {dCategoryAlerts.length > 0 && (
            <Alert variant="destructive" className="border-red-300">
              <AlertOctagon className="h-4 w-4" />
              <AlertTitle className="flex items-center gap-2">
                FALSE SECURITY WARNING
                <Badge variant="destructive">{dCategoryAlerts.length} items</Badge>
              </AlertTitle>
              <AlertDescription>
                <p className="mb-3">
                  These key results achieved good results but with poor process. This is dangerous
                  because success may not be repeatable!
                </p>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {dCategoryAlerts.slice(0, 5).map((alert) => (
                    <Link
                      key={alert.key_result_id}
                      href={`/okr/objectives/${alert.objective_id}`}
                      className="block p-2 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-sm text-red-800">
                            {alert.key_result_title}
                          </p>
                          <p className="text-xs text-red-600">
                            {alert.objective_title}
                          </p>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold text-red-800">
                            {Math.round(alert.progress)}% result
                          </div>
                          <div className="text-xs text-red-600">
                            Process: {PROCESS_RATING_LABELS[alert.process_rating]}
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
                {dCategoryAlerts.length > 5 && (
                  <p className="text-xs text-red-600 mt-2">
                    +{dCategoryAlerts.length - 5} more items need attention
                  </p>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Main Content */}
          <Tabs defaultValue="matrix" className="space-y-4">
            <div className="flex items-center justify-between">
              <TabsList>
                <TabsTrigger value="matrix">Matrix View</TabsTrigger>
                <TabsTrigger value="distribution">Distribution</TabsTrigger>
                <TabsTrigger value="list">List View</TabsTrigger>
              </TabsList>

              {/* Filter */}
              <Select
                value={categoryFilter || 'all'}
                onValueChange={(v) => setCategoryFilter(v === 'all' ? 'all' : v as ABCDCategory)}
              >
                <SelectTrigger className="w-40">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="A">A - Success</SelectItem>
                  <SelectItem value="B">B - Learning</SelectItem>
                  <SelectItem value="C">C - Expected</SelectItem>
                  <SelectItem value="D">D - Danger</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Matrix View Tab */}
            <TabsContent value="matrix">
              <ABCDMatrix
                data={analysisData}
                isLoading={isLoading}
                showDetails={true}
              />
            </TabsContent>

            {/* Distribution Tab */}
            <TabsContent value="distribution">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <ABCDDistribution
                  data={distributionData}
                  isLoading={distributionLoading}
                />
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Category Insights</CardTitle>
                    <CardDescription>
                      What each category tells you
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {(['A', 'B', 'C', 'D'] as const).map((cat) => {
                      const config = ABCD_CATEGORY_CONFIG[cat];
                      const Icon = cat === 'A' ? CheckCircle2 :
                                   cat === 'B' ? Search :
                                   cat === 'C' ? AlertTriangle :
                                   AlertOctagon;
                      return (
                        <div
                          key={cat}
                          className={cn('p-3 rounded-lg border', config.bgColor, config.borderColor)}
                        >
                          <div className="flex items-start gap-3">
                            <div className={cn('p-2 rounded-full', config.bgColor)}>
                              <Icon className={cn('h-5 w-5', config.color)} />
                            </div>
                            <div>
                              <h4 className={cn('font-semibold', config.color)}>
                                {cat}: {config.label}
                              </h4>
                              <p className="text-sm text-muted-foreground">
                                {config.description}
                              </p>
                              <p className={cn('text-sm mt-1 font-medium', config.color)}>
                                Action: {config.action}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* List View Tab */}
            <TabsContent value="list">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Target className="h-5 w-5" style={{ color: '#0b6d41' }} />
                    All Rated Key Results
                    <Badge variant="outline">{analysisData.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <div className="space-y-3">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <Skeleton key={i} className="h-16" />
                      ))}
                    </div>
                  ) : analysisData.length > 0 ? (
                    <div className="space-y-2">
                      {analysisData.map((item) => {
                        const config = item.abcd_category
                          ? ABCD_CATEGORY_CONFIG[item.abcd_category]
                          : null;
                        return (
                          <Link
                            key={item.key_result_id}
                            href={`/okr/objectives/${item.objective_id}`}
                            className={cn(
                              'block p-3 rounded-lg border transition-colors hover:border-primary',
                              config?.bgColor || 'bg-gray-50'
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  {item.abcd_category && (
                                    <Badge
                                      className={cn(
                                        'shrink-0',
                                        item.abcd_category === 'A' && 'bg-emerald-600',
                                        item.abcd_category === 'B' && 'bg-blue-600',
                                        item.abcd_category === 'C' && 'bg-amber-600',
                                        item.abcd_category === 'D' && 'bg-red-600'
                                      )}
                                    >
                                      {item.abcd_category}
                                    </Badge>
                                  )}
                                  <h4 className="font-medium truncate">
                                    {item.key_result_title}
                                  </h4>
                                </div>
                                <p className="text-sm text-muted-foreground truncate">
                                  {item.objective_title}
                                </p>
                              </div>
                              <div className="flex items-center gap-4 shrink-0">
                                <div className="text-right">
                                  <div className="text-sm font-medium">
                                    Result: {Math.round(item.progress)}%
                                  </div>
                                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <Star className="h-3 w-3" />
                                    Process: {item.process_rating ? PROCESS_RATING_LABELS[item.process_rating] : 'N/A'}
                                  </div>
                                </div>
                                <ChevronRight className="h-5 w-5 text-muted-foreground" />
                              </div>
                            </div>
                            {item.process_notes && (
                              <p className="text-xs text-muted-foreground mt-2 line-clamp-1">
                                Note: {item.process_notes}
                              </p>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-muted-foreground">
                      <Target className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <h3 className="text-lg font-medium">No Rated Key Results</h3>
                      <p className="text-sm">
                        Rate the process quality of your key results to see them here
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* How to Use Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">How to Use the A/B/C/D Matrix</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-medium mb-2">Rating Process Quality</h4>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <p className="flex items-center gap-2">
                      <Star className="h-4 w-4 text-amber-400 fill-amber-400" />
                      <span><strong>5 - Excellent:</strong> Systematic approach, documented, repeatable</span>
                    </p>
                    <p className="flex items-center gap-2">
                      <Star className="h-4 w-4 text-amber-400 fill-amber-400" />
                      <span><strong>4 - Good:</strong> Well-planned, tracked progress, learned from issues</span>
                    </p>
                    <p className="flex items-center gap-2">
                      <Star className="h-4 w-4 text-amber-400" />
                      <span><strong>3 - Average:</strong> Basic planning, some tracking</span>
                    </p>
                    <p className="flex items-center gap-2">
                      <Star className="h-4 w-4 text-gray-300" />
                      <span><strong>2 - Below Average:</strong> Ad-hoc approach, little planning</span>
                    </p>
                    <p className="flex items-center gap-2">
                      <Star className="h-4 w-4 text-gray-300" />
                      <span><strong>1 - Poor:</strong> No process, purely reactive</span>
                    </p>
                  </div>
                </div>
                <div>
                  <h4 className="font-medium mb-2">Category Actions</h4>
                  <div className="space-y-2 text-sm">
                    <p className="p-2 bg-emerald-50 rounded text-emerald-700">
                      <strong>A (Sustainable Success):</strong> Document and replicate this approach
                    </p>
                    <p className="p-2 bg-blue-50 rounded text-blue-700">
                      <strong>B (Learning Opportunity):</strong> Good process but poor result - investigate external factors
                    </p>
                    <p className="p-2 bg-amber-50 rounded text-amber-700">
                      <strong>C (Expected Failure):</strong> Both process and result need improvement
                    </p>
                    <p className="p-2 bg-red-50 rounded text-red-700">
                      <strong>D (False Security):</strong> DANGER! Success was luck, not skill. Fix the process!
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </OKRErrorBoundary>
    </ContentLayout>
  );
}
