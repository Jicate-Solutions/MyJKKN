'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ContentLayout } from '@/components/layout/content-layout'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import Link from 'next/link'
import {
  ArrowLeft,
  Shield,
  Layers,
  Target,
  FileText,
  Upload,
  ClipboardList,
  Play,
  Download,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  BookOpen,
  BarChart3,
  Calendar,
  Clock,
  ChevronRight,
} from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { usePermissions } from '@/hooks/use-permissions'
import {
  useFrameworkDetail,
  useFrameworkCriteria,
  useFrameworkMetricValues,
  useFrameworkEvidence,
  useFrameworkSubmissions,
  useFrameworkCompleteness,
  useStartSubmission,
} from '@/hooks/regulatory'
import { CriteriaTree } from './_components/criteria-tree'
import { MetricTable } from './_components/metric-table'
import { EvidencePanel } from './_components/evidence-panel'
import toast from 'react-hot-toast'

// Status badge config
const statusConfig: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
  active: { variant: 'default', label: 'Active' },
  draft: { variant: 'outline', label: 'Draft' },
  archived: { variant: 'secondary', label: 'Archived' },
  submitted: { variant: 'default', label: 'Submitted' },
}

// Submission status config
const submissionStatusConfig: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
  draft: { variant: 'outline', label: 'Draft' },
  data_collection: { variant: 'secondary', label: 'Data Collection' },
  in_review: { variant: 'default', label: 'In Review' },
  approved: { variant: 'default', label: 'Approved' },
  submitted: { variant: 'default', label: 'Submitted' },
}

export default function FrameworkDetailPage() {
  const params = useParams()
  const router = useRouter()
  const frameworkId = params.frameworkId as string
  const { profile } = useAuth()
  const { isSuperAdmin } = usePermissions()
  const [activeTab, setActiveTab] = useState('criteria')
  const [showStartDialog, setShowStartDialog] = useState(false)

  const institutionId = isSuperAdmin ? undefined : profile?.institution_id

  const {
    data: framework,
    isLoading: frameworkLoading,
    error: frameworkError,
  } = useFrameworkDetail({ framework_id: frameworkId, institution_id: institutionId })

  const {
    data: criteria,
    isLoading: criteriaLoading,
  } = useFrameworkCriteria({ framework_id: frameworkId })

  const {
    data: metricValues,
    isLoading: metricsLoading,
    refetch: refetchMetrics,
  } = useFrameworkMetricValues({ framework_id: frameworkId, institution_id: institutionId })

  const {
    data: evidence,
    isLoading: evidenceLoading,
  } = useFrameworkEvidence({ framework_id: frameworkId, institution_id: institutionId })

  const {
    data: submissions,
    isLoading: submissionsLoading,
  } = useFrameworkSubmissions({ framework_id: frameworkId, institution_id: institutionId })

  const {
    data: completenessData,
  } = useFrameworkCompleteness(frameworkId, institutionId)

  const completenessPercent = completenessData?.completeness_percent ?? 0

  const startSubmissionMutation = useStartSubmission()

  const handleStartSubmission = async () => {
    try {
      await startSubmissionMutation.mutateAsync({
        framework_id: frameworkId,
        institution_id: institutionId,
      })
      toast.success('Submission started successfully')
      setShowStartDialog(false)
    } catch (err) {
      toast.error('Failed to start submission')
    }
  }

  if (frameworkLoading) {
    return (
      <ContentLayout title="Framework Details">
        <div className="space-y-6">
          <Skeleton className="h-8 w-64" />
          <div className="grid gap-4 md:grid-cols-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
          <Skeleton className="h-[400px] w-full" />
        </div>
      </ContentLayout>
    )
  }

  if (frameworkError) {
    return (
      <ContentLayout title="Framework Details">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Failed to load framework</AlertTitle>
          <AlertDescription>
            {(frameworkError as Error).message || 'An unexpected error occurred.'}
          </AlertDescription>
        </Alert>
        <Button variant="outline" className="mt-4" onClick={() => router.push('/regulatory')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>
      </ContentLayout>
    )
  }

  if (!framework) {
    return (
      <ContentLayout title="Framework Details">
        <div className="text-center py-12 text-muted-foreground">
          <Shield className="h-12 w-12 mx-auto mb-4 opacity-30" />
          <h3 className="text-lg font-medium mb-2">Framework Not Found</h3>
          <p className="text-sm mb-4">The requested framework could not be found.</p>
          <Button variant="outline" onClick={() => router.push('/regulatory')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
        </div>
      </ContentLayout>
    )
  }

  return (
    <ContentLayout title={framework.name || 'Framework Details'}>
      <div className="space-y-6">
        {/* Back Button + Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => router.push('/regulatory')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{framework.name}</h1>
                <Badge
                  variant={statusConfig[framework.status]?.variant || 'secondary'}
                >
                  {statusConfig[framework.status]?.label || framework.status}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {framework.body}
                {framework.version && ` | Version ${framework.version}`}
                {framework.cycle && ` | Cycle: ${framework.cycle}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/regulatory/simulations?framework=${frameworkId}`}>
                <BarChart3 className="h-4 w-4 mr-2" />
                Simulate
              </Link>
            </Button>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
            <Dialog open={showStartDialog} onOpenChange={setShowStartDialog}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Play className="h-4 w-4 mr-2" />
                  Start Submission
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Start New Submission</DialogTitle>
                  <DialogDescription>
                    This will create a new submission for {framework.name}. You can begin collecting
                    data and filling in metric values.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowStartDialog(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleStartSubmission}
                    disabled={startSubmissionMutation.isPending}
                  >
                    {startSubmissionMutation.isPending ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4 mr-2" />
                    )}
                    Start
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Criteria</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-blue-100">
                  <BookOpen className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="font-semibold text-xl">{framework.criteria_count ?? 0}</p>
                  <p className="text-xs text-muted-foreground">total criteria</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Metrics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-purple-100">
                  <Layers className="h-4 w-4 text-purple-600" />
                </div>
                <div>
                  <p className="font-semibold text-xl">{framework.metric_count ?? 0}</p>
                  <p className="text-xs text-muted-foreground">data points</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Completeness</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-end gap-2">
                  <span className={`text-2xl font-bold ${
                    (framework.completeness_pct ?? 0) >= 80 ? 'text-emerald-600' :
                    (framework.completeness_pct ?? 0) >= 50 ? 'text-amber-600' : 'text-red-600'
                  }`}>
                    {framework.completeness_pct ?? 0}%
                  </span>
                </div>
                <Progress value={framework.completeness_pct ?? 0} className="h-1.5" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Score</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-emerald-100">
                  <Target className="h-4 w-4 text-emerald-600" />
                </div>
                <div>
                  <p className={`font-semibold text-xl ${
                    framework.score != null && framework.score >= 3.5 ? 'text-emerald-600' :
                    framework.score != null && framework.score >= 2.5 ? 'text-amber-600' :
                    framework.score != null ? 'text-red-600' : 'text-muted-foreground'
                  }`}>
                    {framework.score != null ? framework.score.toFixed(2) : '--'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {framework.max_score ? `out of ${framework.max_score}` : 'calculated'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabbed Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="criteria" className="flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              <span className="hidden sm:inline">Criteria Tree</span>
              <span className="sm:hidden">Criteria</span>
            </TabsTrigger>
            <TabsTrigger value="metrics" className="flex items-center gap-2">
              <Layers className="h-4 w-4" />
              <span className="hidden sm:inline">Metric Values</span>
              <span className="sm:hidden">Metrics</span>
            </TabsTrigger>
            <TabsTrigger value="evidence" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Evidence</span>
              <span className="sm:hidden">Docs</span>
            </TabsTrigger>
            <TabsTrigger value="submissions" className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              <span className="hidden sm:inline">Submissions</span>
              <span className="sm:hidden">Subs</span>
            </TabsTrigger>
          </TabsList>

          {/* Criteria Tree Tab */}
          <TabsContent value="criteria" className="mt-6">
            {criteriaLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : !criteria || criteria.length === 0 ? (
              <Card>
                <CardContent className="pt-12 pb-12">
                  <div className="text-center text-muted-foreground">
                    <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <h3 className="font-medium mb-1">No Criteria Defined</h3>
                    <p className="text-sm">
                      No criteria have been configured for this framework yet.
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <CriteriaTree criteria={criteria} frameworkId={frameworkId} />
            )}
          </TabsContent>

          {/* Metric Values Tab */}
          <TabsContent value="metrics" className="mt-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {metricValues?.length ?? 0} metric{(metricValues?.length ?? 0) !== 1 ? 's' : ''} total
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetchMetrics()}
                  disabled={metricsLoading}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${metricsLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>

              {metricsLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : !metricValues || metricValues.length === 0 ? (
                <Card>
                  <CardContent className="pt-12 pb-12">
                    <div className="text-center text-muted-foreground">
                      <Layers className="h-10 w-10 mx-auto mb-3 opacity-30" />
                      <h3 className="font-medium mb-1">No Metrics</h3>
                      <p className="text-sm">
                        No metric values have been recorded yet.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <MetricTable
                  metrics={metricValues}
                  frameworkId={frameworkId}
                  institutionId={institutionId}
                />
              )}
            </div>
          </TabsContent>

          {/* Evidence Tab */}
          <TabsContent value="evidence" className="mt-6">
            {evidenceLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : !evidence || evidence.length === 0 ? (
              <Card>
                <CardContent className="pt-12 pb-12">
                  <div className="text-center text-muted-foreground">
                    <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <h3 className="font-medium mb-1">No Evidence Uploaded</h3>
                    <p className="text-sm">
                      Upload supporting documents for your metrics.
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <EvidencePanel
                evidence={evidence}
                frameworkId={frameworkId}
                institutionId={institutionId}
              />
            )}
          </TabsContent>

          {/* Submissions Tab */}
          <TabsContent value="submissions" className="mt-6">
            {submissionsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : !submissions || submissions.length === 0 ? (
              <Card>
                <CardContent className="pt-12 pb-12">
                  <div className="text-center text-muted-foreground">
                    <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <h3 className="font-medium mb-1">No Submissions</h3>
                    <p className="text-sm mb-4">
                      Start your first submission for this framework.
                    </p>
                    <Button size="sm" onClick={() => setShowStartDialog(true)}>
                      <Play className="h-4 w-4 mr-2" />
                      Start Submission
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {submissions.map((sub: any) => {
                  const statusConf = submissionStatusConfig[sub.status] || {
                    variant: 'secondary' as const,
                    label: sub.status,
                  }
                  return (
                    <Card key={sub.id} className="hover:border-primary/50 transition-colors">
                      <CardContent className="pt-4 pb-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4 min-w-0">
                            <div className="p-2 rounded-lg bg-blue-50">
                              <ClipboardList className="h-4 w-4 text-blue-600" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-sm">
                                  {sub.academic_year || sub.title || `Submission #${sub.id?.slice(0, 8)}`}
                                </p>
                                <Badge variant={statusConf.variant} className="text-xs">
                                  {statusConf.label}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                                {sub.created_at && (
                                  <span className="flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    Started {new Date(sub.created_at).toLocaleDateString('en-IN')}
                                  </span>
                                )}
                                {sub.updated_at && (
                                  <span className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    Updated {new Date(sub.updated_at).toLocaleDateString('en-IN')}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-4 shrink-0">
                            {sub.completeness_pct != null && (
                              <div className="text-right hidden sm:block">
                                <p className="text-sm font-medium">{sub.completeness_pct}%</p>
                                <Progress value={sub.completeness_pct} className="h-1 w-20" />
                              </div>
                            )}
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </ContentLayout>
  )
}
