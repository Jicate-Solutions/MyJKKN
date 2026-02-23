'use client'

import { use } from 'react'
import Link from 'next/link'
import { ContentLayout } from '@/components/layout/content-layout'
import { PageBreadcrumb } from '@/components/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useAuth } from '@/hooks/use-auth'
import {
  usePulseConfig,
  usePulseResponses,
  useActivatePulse,
  usePausePulse,
  useArchivePulse,
  useMoodTrends,
} from '@/hooks/campus-living/use-wellness'
import {
  ArrowLeft,
  Loader2,
  Play,
  Pause,
  Archive,
  Calendar,
  Clock,
  ClipboardList,
  Users,
  Smile,
  Meh,
  Frown,
  Star,
  ToggleLeft,
  MessageSquare,
  CheckCircle2,
  BarChart3,
  TrendingUp,
} from 'lucide-react'

const statusBadge = (status: string) => {
  switch (status) {
    case 'draft':
      return <Badge variant="secondary">Draft</Badge>
    case 'active':
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Active</Badge>
    case 'paused':
      return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Paused</Badge>
    case 'completed':
      return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Completed</Badge>
    case 'archived':
      return <Badge variant="secondary">Archived</Badge>
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

const moodEmoji = (mood: number | null) => {
  if (mood === null) return <Meh className="h-4 w-4 text-gray-400" />
  if (mood >= 4) return <Smile className="h-4 w-4 text-green-600" />
  if (mood >= 2.5) return <Meh className="h-4 w-4 text-yellow-600" />
  return <Frown className="h-4 w-4 text-red-600" />
}

const moodColor = (mood: number | null) => {
  if (mood === null) return 'text-gray-400'
  if (mood >= 4) return 'text-green-600'
  if (mood >= 2.5) return 'text-yellow-600'
  return 'text-red-600'
}

const questionTypeIcon = (type: string) => {
  switch (type) {
    case 'emoji_scale': return <Smile className="h-4 w-4" />
    case 'rating_5': return <Star className="h-4 w-4" />
    case 'yes_no': return <ToggleLeft className="h-4 w-4" />
    case 'text': return <MessageSquare className="h-4 w-4" />
    default: return <ClipboardList className="h-4 w-4" />
  }
}

const questionTypeLabel = (type: string) => {
  switch (type) {
    case 'emoji_scale': return 'Emoji Scale'
    case 'rating_5': return '5-Star Rating'
    case 'yes_no': return 'Yes / No'
    case 'text': return 'Free Text'
    default: return type
  }
}

const frequencyLabel = (freq: string) => {
  switch (freq) {
    case 'weekly': return 'Weekly'
    case 'biweekly': return 'Bi-weekly'
    case 'monthly': return 'Monthly'
    default: return freq
  }
}

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '--'
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

const formatDateTime = (dateStr: string | null) => {
  if (!dateStr) return '--'
  return new Date(dateStr).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function WellnessSurveyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const { profile } = useAuth()
  const institutionId = profile?.institution_id || ''

  const { data: config, isLoading: configLoading } = usePulseConfig(id)
  const { data: responsesData, isLoading: responsesLoading } = usePulseResponses(institutionId, {
    config_id: id,
  })
  const { data: moodTrendsData } = useMoodTrends(institutionId)

  const activateMutation = useActivatePulse()
  const pauseMutation = usePausePulse()
  const archiveMutation = useArchivePulse()

  const responses = responsesData?.data || []
  const responseCount = responsesData?.count || 0
  const questions = (config as any)?.questions || []

  // Filter mood trends for this config's responses
  const trends = moodTrendsData || []

  const isLoading = configLoading

  if (isLoading || !config) {
    return (
      <ContentLayout title="Survey Details">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    )
  }

  const survey = config as any

  return (
    <ContentLayout title={survey.title}>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Student Wellness', href: '/campus-living/wellness' },
          { label: 'Surveys', href: '/campus-living/wellness/surveys' },
          { label: survey.title },
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header with actions */}
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/campus-living/wellness/surveys">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold">{survey.title}</h1>
                {statusBadge(survey.status)}
              </div>
              {survey.description && (
                <p className="text-muted-foreground mt-1">{survey.description}</p>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            {survey.status === 'draft' && (
              <Button
                onClick={() => activateMutation.mutate(id)}
                disabled={activateMutation.isPending}
                className="bg-green-600 hover:bg-green-700"
              >
                {activateMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Play className="mr-2 h-4 w-4" />
                )}
                Activate
              </Button>
            )}
            {survey.status === 'active' && (
              <Button
                variant="outline"
                onClick={() => pauseMutation.mutate(id)}
                disabled={pauseMutation.isPending}
              >
                {pauseMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Pause className="mr-2 h-4 w-4" />
                )}
                Pause
              </Button>
            )}
            {survey.status === 'paused' && (
              <Button
                onClick={() => activateMutation.mutate(id)}
                disabled={activateMutation.isPending}
                className="bg-green-600 hover:bg-green-700"
              >
                {activateMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Play className="mr-2 h-4 w-4" />
                )}
                Resume
              </Button>
            )}
            {survey.status !== 'archived' && (
              <Button
                variant="outline"
                onClick={() => archiveMutation.mutate(id)}
                disabled={archiveMutation.isPending}
              >
                {archiveMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Archive className="mr-2 h-4 w-4" />
                )}
                Archive
              </Button>
            )}
          </div>
        </div>

        {/* Survey Info & Questions side-by-side */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Survey Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Survey Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Status</span>
                {statusBadge(survey.status)}
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Frequency</span>
                <Badge variant="outline" className="capitalize">
                  {frequencyLabel(survey.frequency)}
                </Badge>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Start Date</span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {formatDate(survey.starts_at)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">End Date</span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {formatDate(survey.ends_at)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Target Blocks</span>
                <span>
                  {survey.target_blocks
                    ? `${survey.target_blocks.length} block${survey.target_blocks.length !== 1 ? 's' : ''}`
                    : 'All blocks'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Questions</span>
                <span className="font-medium">{questions.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Responses</span>
                <span className="font-medium">{responseCount}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Created</span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDate(survey.created_at)}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Questions */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardList className="h-4 w-4" />
                Questions ({questions.length})
              </CardTitle>
              <CardDescription>Survey questions in order</CardDescription>
            </CardHeader>
            <CardContent>
              {questions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No questions defined
                </p>
              ) : (
                <div className="space-y-3">
                  {questions.map((q: any, idx: number) => (
                    <div
                      key={q.id || idx}
                      className="flex items-start gap-3 p-3 rounded-lg border"
                    >
                      <div className="flex items-center justify-center h-7 w-7 rounded-full bg-muted text-xs font-medium shrink-0">
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{q.question}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            {questionTypeIcon(q.type)}
                            <span>{questionTypeLabel(q.type)}</span>
                          </div>
                          {q.required && (
                            <Badge variant="outline" className="text-xs">
                              <CheckCircle2 className="mr-1 h-2.5 w-2.5" />
                              Required
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Mood Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Mood Trend
            </CardTitle>
            <CardDescription>Average mood score per period</CardDescription>
          </CardHeader>
          <CardContent>
            {trends.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <BarChart3 className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-sm font-medium">No trend data yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Mood trends will appear once students start responding
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-[1fr_100px_80px_60px] gap-2 text-xs font-medium text-muted-foreground pb-2 border-b">
                  <span>Period</span>
                  <span>Avg Mood</span>
                  <span>Responses</span>
                  <span>Mood</span>
                </div>
                {trends.map((t: any) => (
                  <div
                    key={t.period}
                    className="grid grid-cols-[1fr_100px_80px_60px] gap-2 items-center text-sm py-1.5"
                  >
                    <span className="font-medium">{formatDate(t.period)}</span>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            t.avg_mood >= 4
                              ? 'bg-green-500'
                              : t.avg_mood >= 2.5
                                ? 'bg-yellow-500'
                                : 'bg-red-500'
                          }`}
                          style={{ width: `${(t.avg_mood / 5) * 100}%` }}
                        />
                      </div>
                      <span className={`text-xs font-medium ${moodColor(t.avg_mood)}`}>
                        {t.avg_mood.toFixed(1)}
                      </span>
                    </div>
                    <span className="text-muted-foreground">{t.response_count}</span>
                    <span>{moodEmoji(t.avg_mood)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Responses Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" />
              Responses ({responseCount})
            </CardTitle>
            <CardDescription>Recent student submissions for this survey</CardDescription>
          </CardHeader>
          <CardContent>
            {responsesLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : responses.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Users className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-sm font-medium">No responses yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Responses will appear here once students submit their wellness checks
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Overall Mood</TableHead>
                    <TableHead>Submitted At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {responses.map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <span className="font-medium">
                          {r.learner?.full_name || `Student ${r.learner_id?.slice(0, 8)}...`}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{formatDate(r.period_start)}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {moodEmoji(r.overall_mood)}
                          <span className={`text-sm font-medium ${moodColor(r.overall_mood)}`}>
                            {r.overall_mood !== null ? r.overall_mood.toFixed(1) : '--'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {formatDateTime(r.submitted_at)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  )
}
