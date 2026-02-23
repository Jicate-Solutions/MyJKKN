'use client'

import Link from 'next/link'
import { ContentLayout } from '@/components/layout/content-layout'
import { PageBreadcrumb } from '@/components/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/hooks/use-auth'
import {
  usePulseConfigs,
  useFlaggedStudents,
} from '@/hooks/campus-living/use-wellness'
import {
  Heart,
  ClipboardList,
  BarChart3,
  Users,
  AlertTriangle,
  Smile,
  Meh,
  Frown,
  Plus,
  ArrowRight,
  Loader2,
  Activity,
} from 'lucide-react'

const moodEmoji = (mood: number) => {
  if (mood >= 4) return <Smile className="h-5 w-5 text-green-600" />
  if (mood >= 2.5) return <Meh className="h-5 w-5 text-yellow-600" />
  return <Frown className="h-5 w-5 text-red-600" />
}

const moodLabel = (mood: number) => {
  if (mood >= 4) return 'Good'
  if (mood >= 2.5) return 'Okay'
  return 'Low'
}

export default function WellnessDashboardPage() {
  const { profile } = useAuth()
  const institutionId = profile?.institution_id || ''

  const { data: configsData, isLoading: configsLoading } = usePulseConfigs(institutionId, { status: 'active' })
  const { data: allConfigsData, isLoading: allLoading } = usePulseConfigs(institutionId)
  const { data: flaggedData, isLoading: flaggedLoading } = useFlaggedStudents(institutionId)

  const activeConfigs = configsData?.data || []
  const allConfigs = allConfigsData?.data || []
  const flaggedStudents = flaggedData || []

  const isLoading = configsLoading || allLoading || flaggedLoading

  // Compute summary stats
  const totalResponses = allConfigs.reduce((sum: number, c: any) => sum + (c.response_count || 0), 0)
  // Average mood: we only have flagged students data here, show a placeholder
  // In a full implementation this would come from mood trends
  const activeSurveyCount = activeConfigs.length

  if (isLoading) {
    return (
      <ContentLayout title="Student Wellness">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    )
  }

  return (
    <ContentLayout title="Student Wellness">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Campus Living', href: '/campus-living' },
          { label: 'Student Wellness' },
        ]}
      />

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
          <div>
            <h1 className="text-2xl font-bold py-1">Student Wellness</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Monitor student wellbeing through pulse surveys and mood tracking
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href="/campus-living/wellness/surveys">
                <BarChart3 className="mr-2 h-4 w-4" />
                View Analytics
              </Link>
            </Button>
            <Button asChild>
              <Link href="/campus-living/wellness/surveys/new">
                <Plus className="mr-2 h-4 w-4" />
                Create Survey
              </Link>
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Active Surveys</CardTitle>
              <ClipboardList className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activeSurveyCount}</div>
              <p className="text-xs text-muted-foreground mt-1">Currently running</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Surveys</CardTitle>
              <Activity className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{allConfigs.length}</div>
              <p className="text-xs text-muted-foreground mt-1">All time</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Average Mood</CardTitle>
              <Heart className="h-4 w-4 text-pink-600" />
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Smile className="h-6 w-6 text-green-600" />
                <span className="text-2xl font-bold text-green-600">--</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Across all responses</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Flagged Students</CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{flaggedStudents.length}</div>
              <p className="text-xs text-muted-foreground mt-1">Need attention</p>
            </CardContent>
          </Card>
        </div>

        {/* Two-column layout: Active Surveys + Flagged Students */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Active Surveys */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Active Surveys</CardTitle>
                <CardDescription>Currently running pulse surveys</CardDescription>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/campus-living/wellness/surveys">
                  View All
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {activeConfigs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <ClipboardList className="h-10 w-10 text-muted-foreground mb-3" />
                  <p className="text-sm font-medium">No active surveys</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Create a wellness survey to start tracking student mood
                  </p>
                  <Button variant="outline" size="sm" className="mt-3" asChild>
                    <Link href="/campus-living/wellness/surveys/new">
                      <Plus className="mr-1 h-3 w-3" />
                      Create Survey
                    </Link>
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {activeConfigs.map((config: any) => (
                    <Link
                      key={config.id}
                      href={`/campus-living/wellness/surveys/${config.id}`}
                      className="block"
                    >
                      <div className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                        <div className="space-y-1">
                          <p className="text-sm font-medium">{config.title}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Badge variant="outline" className="text-xs capitalize">
                              {config.frequency}
                            </Badge>
                            <span>{config.questions?.length || 0} questions</span>
                          </div>
                        </div>
                        <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                          Active
                        </Badge>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Flagged Students */}
          <Card>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  Flagged Students
                </CardTitle>
                <CardDescription>
                  Students with consistently low mood scores (avg &lt; 2)
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {flaggedStudents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Users className="h-10 w-10 text-muted-foreground mb-3" />
                  <p className="text-sm font-medium">No flagged students</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    All students are doing well based on recent responses
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {flaggedStudents.map((student: any) => (
                    <div
                      key={student.learner_id}
                      className="flex items-center justify-between p-3 rounded-lg border border-red-100 bg-red-50/50"
                    >
                      <div className="flex items-center gap-3">
                        <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                        <div>
                          <p className="text-sm font-medium">
                            Student {student.learner_id.slice(0, 8)}...
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {student.response_count} recent responses
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {moodEmoji(student.avg_mood)}
                        <span className="text-sm font-medium">
                          {student.avg_mood.toFixed(1)}
                        </span>
                        <Badge
                          variant="outline"
                          className="text-xs text-red-700 border-red-300"
                        >
                          {moodLabel(student.avg_mood)}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </ContentLayout>
  )
}
