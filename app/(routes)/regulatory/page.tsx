'use client'

import { useState, useMemo } from 'react'
import { ContentLayout } from '@/components/layout/content-layout'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import Link from 'next/link'
import {
  Shield,
  BookOpen,
  Award,
  GraduationCap,
  Building2,
  Calendar,
  TrendingUp,
  ArrowRight,
  FileText,
  BarChart3,
  Users,
  AlertCircle,
  Clock,
  CheckCircle2,
  Target,
  Layers,
  ClipboardList,
  Play,
  RefreshCw,
} from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { usePermissions } from '@/hooks/use-permissions'
import {
  useRegulatoryFrameworks,
  useRegulatoryDashboardStats,
  useUpcomingDeadlines,
} from '@/hooks/regulatory'

// Regulatory body configuration
const bodyConfig: Record<string, { label: string; color: string; bgColor: string; icon: React.ReactNode }> = {
  NAAC: {
    label: 'NAAC',
    color: 'text-blue-700',
    bgColor: 'bg-blue-50 border-blue-200',
    icon: <Award className="h-5 w-5 text-blue-600" />,
  },
  NIRF: {
    label: 'NIRF',
    color: 'text-purple-700',
    bgColor: 'bg-purple-50 border-purple-200',
    icon: <BarChart3 className="h-5 w-5 text-purple-600" />,
  },
  NBA: {
    label: 'NBA',
    color: 'text-emerald-700',
    bgColor: 'bg-emerald-50 border-emerald-200',
    icon: <GraduationCap className="h-5 w-5 text-emerald-600" />,
  },
  AICTE: {
    label: 'AICTE',
    color: 'text-orange-700',
    bgColor: 'bg-orange-50 border-orange-200',
    icon: <Building2 className="h-5 w-5 text-orange-600" />,
  },
  UGC: {
    label: 'UGC',
    color: 'text-rose-700',
    bgColor: 'bg-rose-50 border-rose-200',
    icon: <BookOpen className="h-5 w-5 text-rose-600" />,
  },
}

// Score color helper
function getScoreColor(score: number | null | undefined): string {
  if (score == null) return 'text-muted-foreground'
  if (score >= 3.5) return 'text-emerald-600'
  if (score >= 2.5) return 'text-amber-600'
  return 'text-red-600'
}

function getCompletenessColor(pct: number): string {
  if (pct >= 80) return 'text-emerald-600'
  if (pct >= 50) return 'text-amber-600'
  return 'text-red-600'
}

export default function RegulatoryDashboardPage() {
  const { profile } = useAuth()
  const { isSuperAdmin } = usePermissions()
  const [bodyFilter, setBodyFilter] = useState<string>('all')

  // Scope data: super_admin sees all, others see their institution
  const institutionId = isSuperAdmin ? undefined : profile?.institution_id

  const {
    data: frameworks,
    isLoading: frameworksLoading,
    error: frameworksError,
    refetch: refetchFrameworks,
  } = useRegulatoryFrameworks({ institution_id: institutionId })

  const {
    data: dashboardStats,
    isLoading: statsLoading,
  } = useRegulatoryDashboardStats({ institution_id: institutionId })

  const {
    data: deadlines,
    isLoading: deadlinesLoading,
  } = useUpcomingDeadlines({ institution_id: institutionId, limit: 5 })

  const isLoading = frameworksLoading || statsLoading

  // Group frameworks by body
  const groupedFrameworks = useMemo(() => {
    if (!frameworks) return {}
    const filtered = bodyFilter === 'all'
      ? frameworks
      : frameworks.filter((f: any) => f.body === bodyFilter)

    return filtered.reduce((acc: Record<string, any[]>, fw: any) => {
      const body = fw.body || 'Other'
      if (!acc[body]) acc[body] = []
      acc[body].push(fw)
      return acc
    }, {})
  }, [frameworks, bodyFilter])

  // Unique bodies for filter
  const availableBodies = useMemo(() => {
    if (!frameworks) return []
    const bodies = [...new Set(frameworks.map((f: any) => f.body))] as string[]
    return bodies.sort()
  }, [frameworks])

  return (
    <ContentLayout title="Regulatory Compliance">
      <div className="space-y-6">
        {/* Error State */}
        {frameworksError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Failed to load frameworks</AlertTitle>
            <AlertDescription className="flex items-center justify-between">
              <span>{(frameworksError as Error).message || 'An unexpected error occurred. Please try again.'}</span>
              <Button
                variant="outline"
                size="sm"
                className="ml-4 shrink-0"
                onClick={() => refetchFrameworks()}
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Quick Stats Row */}
        <div className="grid gap-4 md:grid-cols-4">
          {/* Total Frameworks */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Frameworks
              </CardTitle>
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-16 w-full" />
              ) : (
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-full bg-blue-100">
                    <Shield className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-2xl">
                      {dashboardStats?.total_frameworks ?? 0}
                    </p>
                    <p className="text-xs text-muted-foreground">configured</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Active Submissions */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Active Submissions
              </CardTitle>
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-16 w-full" />
              ) : (
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-full bg-emerald-100">
                    <FileText className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-2xl">
                      {dashboardStats?.active_submissions ?? 0}
                    </p>
                    <p className="text-xs text-muted-foreground">in progress</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Overall Completeness */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Avg. Completeness
              </CardTitle>
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-16 w-full" />
              ) : (
                <div className="space-y-2">
                  <div className="flex items-end gap-2">
                    <span className={`text-3xl font-bold ${getCompletenessColor(dashboardStats?.avg_completeness ?? 0)}`}>
                      {dashboardStats?.avg_completeness ?? 0}%
                    </span>
                    <TrendingUp className="h-5 w-5 text-muted-foreground mb-1" />
                  </div>
                  <Progress value={dashboardStats?.avg_completeness ?? 0} className="h-2" />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Upcoming Deadlines */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Upcoming Deadlines
              </CardTitle>
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-16 w-full" />
              ) : (
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-full bg-amber-100">
                    <Clock className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-2xl">
                      {dashboardStats?.upcoming_deadlines ?? 0}
                    </p>
                    <p className="text-xs text-muted-foreground">next 30 days</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Filter + Actions Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Select value={bodyFilter} onValueChange={setBodyFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by body" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Bodies</SelectItem>
                {availableBodies.map((body) => (
                  <SelectItem key={body} value={body}>
                    {bodyConfig[body]?.label || body}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/regulatory/submissions">
                <ClipboardList className="h-4 w-4 mr-2" />
                Submissions
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/regulatory/simulations">
                <Play className="h-4 w-4 mr-2" />
                Simulator
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/regulatory/governance">
                <Users className="h-4 w-4 mr-2" />
                Governance
              </Link>
            </Button>
          </div>
        </div>

        {/* Framework Cards Grouped by Body */}
        {isLoading ? (
          <div className="space-y-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="h-6 w-40" />
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  <Skeleton className="h-48 w-full" />
                  <Skeleton className="h-48 w-full" />
                  <Skeleton className="h-48 w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : Object.keys(groupedFrameworks).length === 0 ? (
          <Card>
            <CardContent className="pt-12 pb-12">
              <div className="text-center text-muted-foreground">
                <Shield className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <h3 className="text-lg font-medium mb-2">No Frameworks Found</h3>
                <p className="text-sm max-w-md mx-auto">
                  No regulatory frameworks have been configured yet. Contact your administrator to set up
                  NAAC, NIRF, NBA, AICTE, or UGC frameworks for your institution.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-8">
            {Object.entries(groupedFrameworks).map(([body, fws]) => {
              const config = bodyConfig[body] || {
                label: body,
                color: 'text-gray-700',
                bgColor: 'bg-gray-50 border-gray-200',
                icon: <Shield className="h-5 w-5 text-gray-600" />,
              }
              return (
                <div key={body} className="space-y-4">
                  {/* Body Header */}
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${config.bgColor}`}>
                      {config.icon}
                    </div>
                    <div>
                      <h2 className={`text-lg font-semibold ${config.color}`}>
                        {config.label}
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        {(fws as any[]).length} framework{(fws as any[]).length !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>

                  {/* Framework Cards */}
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {(fws as any[]).map((fw) => (
                      <Link key={fw.id} href={`/regulatory/${fw.id}`}>
                        <Card className="hover:border-primary transition-colors cursor-pointer h-full">
                          <CardHeader className="pb-3">
                            <div className="flex items-start justify-between">
                              <div className="flex-1 min-w-0">
                                <CardTitle className="text-base line-clamp-1">
                                  {fw.name}
                                </CardTitle>
                                <CardDescription className="mt-1">
                                  {fw.version && `v${fw.version}`}
                                  {fw.version && fw.cycle && ' | '}
                                  {fw.cycle && `Cycle: ${fw.cycle}`}
                                </CardDescription>
                              </div>
                              <Badge
                                variant={fw.status === 'active' ? 'default' : 'secondary'}
                                className="ml-2 shrink-0"
                              >
                                {fw.status === 'active' ? 'Active' : fw.status}
                              </Badge>
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            {/* Metric Count */}
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground flex items-center gap-1.5">
                                <Layers className="h-3.5 w-3.5" />
                                Metrics
                              </span>
                              <span className="font-medium">
                                {fw.metric_count ?? 0}
                              </span>
                            </div>

                            {/* Completeness — only shown if data is available (computed per-framework on detail page) */}
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">Completeness</span>
                                <span className="font-medium text-muted-foreground">
                                  View details
                                </span>
                              </div>
                              <Progress value={0} className="h-1.5" />
                            </div>

                            {/* Score */}
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground flex items-center gap-1.5">
                                <Target className="h-3.5 w-3.5" />
                                Score
                              </span>
                              <span className={`font-semibold text-base ${getScoreColor(fw.score)}`}>
                                {fw.score != null ? fw.score.toFixed(2) : '--'}
                              </span>
                            </div>

                            {/* Criteria Count */}
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground flex items-center gap-1.5">
                                <BookOpen className="h-3.5 w-3.5" />
                                Criteria
                              </span>
                              <span className="font-medium">
                                {fw.criteria_count ?? 0}
                              </span>
                            </div>
                          </CardContent>
                        </Card>
                      </Link>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Upcoming Deadlines Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-amber-600" />
                <div>
                  <CardTitle className="text-base">Upcoming Deadlines</CardTitle>
                  <CardDescription>Submissions due in the next 30 days</CardDescription>
                </div>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href="/regulatory/submissions">
                  View All
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {deadlinesLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : !deadlines || deadlines.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No upcoming deadlines</p>
              </div>
            ) : (
              <div className="space-y-3">
                {deadlines.map((deadline: any) => (
                  <div
                    key={deadline.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`p-2 rounded-lg ${bodyConfig[deadline.body]?.bgColor || 'bg-gray-50 border-gray-200'}`}>
                        {bodyConfig[deadline.body]?.icon || <Shield className="h-4 w-4 text-gray-500" />}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{deadline.framework_name}</p>
                        <p className="text-xs text-muted-foreground">{deadline.submission_type}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <p className="text-sm font-medium">
                          {deadline.due_date
                            ? new Date(deadline.due_date).toLocaleDateString('en-IN', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })
                            : '--'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {deadline.days_remaining != null
                            ? `${deadline.days_remaining} day${deadline.days_remaining !== 1 ? 's' : ''} left`
                            : ''}
                        </p>
                      </div>
                      <Badge
                        variant={
                          deadline.days_remaining != null && deadline.days_remaining <= 7
                            ? 'destructive'
                            : deadline.days_remaining != null && deadline.days_remaining <= 14
                            ? 'outline'
                            : 'secondary'
                        }
                        className="text-xs"
                      >
                        {deadline.days_remaining != null && deadline.days_remaining <= 7
                          ? 'Urgent'
                          : deadline.days_remaining != null && deadline.days_remaining <= 14
                          ? 'Soon'
                          : 'Upcoming'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <div className="grid gap-4 md:grid-cols-4">
          <Link href="/regulatory/submissions">
            <Card className="hover:border-primary transition-colors cursor-pointer h-full">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-full bg-blue-100">
                    <ClipboardList className="h-6 w-6 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold">Submissions</h3>
                    <p className="text-sm text-muted-foreground">Track filings</p>
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground shrink-0" />
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/regulatory/simulations">
            <Card className="hover:border-primary transition-colors cursor-pointer h-full">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-full bg-purple-100">
                    <BarChart3 className="h-6 w-6 text-purple-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold">Score Simulator</h3>
                    <p className="text-sm text-muted-foreground">What-if analysis</p>
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground shrink-0" />
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/regulatory/governance">
            <Card className="hover:border-primary transition-colors cursor-pointer h-full">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-full bg-emerald-100">
                    <Users className="h-6 w-6 text-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold">Governance</h3>
                    <p className="text-sm text-muted-foreground">Bodies & meetings</p>
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground shrink-0" />
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/regulatory/submissions">
            <Card className="hover:border-primary transition-colors cursor-pointer h-full">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-full bg-amber-100">
                    <FileText className="h-6 w-6 text-amber-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold">Reports</h3>
                    <p className="text-sm text-muted-foreground">Export & review</p>
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground shrink-0" />
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>
    </ContentLayout>
  )
}
