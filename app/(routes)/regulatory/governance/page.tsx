'use client'

import { useState } from 'react'
import { ContentLayout } from '@/components/layout/content-layout'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import Link from 'next/link'
import {
  ArrowLeft,
  Users,
  Calendar,
  BookOpen,
  UserCheck,
  AlertCircle,
  RefreshCw,
} from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { usePermissions } from '@/hooks/use-permissions'
import {
  useGoverningBodies,
  useGoverningMeetings,
  useCourseSyllabi,
  usePeerVisits,
} from '@/hooks/regulatory'
import { BodyList } from './_components/body-list'
import { MeetingList } from './_components/meeting-list'
import { SyllabusTable } from './_components/syllabus-table'
import { PeerVisitTimeline } from './_components/peer-visit-timeline'

export default function GovernancePage() {
  const { profile } = useAuth()
  const { isSuperAdmin } = usePermissions()
  const institutionId = isSuperAdmin ? undefined : profile?.institution_id

  const [activeTab, setActiveTab] = useState('bodies')

  const {
    data: bodiesResult,
    isLoading: bodiesLoading,
    error: bodiesError,
    refetch: refetchBodies,
  } = useGoverningBodies({ institution_id: institutionId })

  const {
    data: meetings,
    isLoading: meetingsLoading,
    error: meetingsError,
    refetch: refetchMeetings,
  } = useGoverningMeetings({ institution_id: institutionId })

  const {
    data: syllabi,
    isLoading: syllabiLoading,
    error: syllabiError,
    refetch: refetchSyllabi,
  } = useCourseSyllabi({ institution_id: institutionId })

  const {
    data: peerVisitsResult,
    isLoading: visitsLoading,
    error: visitsError,
    refetch: refetchVisits,
  } = usePeerVisits({ institution_id: institutionId })

  // Unwrap paginated results to flat arrays
  const bodies = Array.isArray(bodiesResult) ? bodiesResult : (bodiesResult as any)?.data || []
  const peerVisits = Array.isArray(peerVisitsResult) ? peerVisitsResult : (peerVisitsResult as any)?.data || []

  const currentError = activeTab === 'bodies' ? bodiesError
    : activeTab === 'meetings' ? meetingsError
    : activeTab === 'syllabi' ? syllabiError
    : visitsError

  const currentRefetch = activeTab === 'bodies' ? refetchBodies
    : activeTab === 'meetings' ? refetchMeetings
    : activeTab === 'syllabi' ? refetchSyllabi
    : refetchVisits

  return (
    <ContentLayout title="Governance">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/regulatory">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Link>
            </Button>
            <div>
              <h1 className="text-xl font-bold">Governance</h1>
              <p className="text-sm text-muted-foreground">
                Manage governing bodies, meetings, curricula, and peer review visits
              </p>
            </div>
          </div>
        </div>

        {/* Error State */}
        {currentError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Failed to load data</AlertTitle>
            <AlertDescription>
              {(currentError as Error).message || 'An unexpected error occurred.'}
            </AlertDescription>
          </Alert>
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="bodies" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Governing Bodies</span>
              <span className="sm:hidden">Bodies</span>
            </TabsTrigger>
            <TabsTrigger value="meetings" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <span className="hidden sm:inline">Meetings</span>
              <span className="sm:hidden">Meetings</span>
            </TabsTrigger>
            <TabsTrigger value="syllabi" className="flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              <span className="hidden sm:inline">Course Syllabi</span>
              <span className="sm:hidden">Syllabi</span>
            </TabsTrigger>
            <TabsTrigger value="visits" className="flex items-center gap-2">
              <UserCheck className="h-4 w-4" />
              <span className="hidden sm:inline">Peer Visits</span>
              <span className="sm:hidden">Visits</span>
            </TabsTrigger>
          </TabsList>

          {/* Governing Bodies Tab */}
          <TabsContent value="bodies" className="mt-6">
            {bodiesLoading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-28 w-full" />
                ))}
              </div>
            ) : (
              <BodyList
                bodies={bodies || []}
                institutionId={institutionId}
              />
            )}
          </TabsContent>

          {/* Meetings Tab */}
          <TabsContent value="meetings" className="mt-6">
            {meetingsLoading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : (
              <MeetingList
                meetings={meetings || []}
                institutionId={institutionId}
              />
            )}
          </TabsContent>

          {/* Course Syllabi Tab */}
          <TabsContent value="syllabi" className="mt-6">
            {syllabiLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (
              <SyllabusTable
                syllabi={syllabi || []}
                institutionId={institutionId}
              />
            )}
          </TabsContent>

          {/* Peer Visits Tab */}
          <TabsContent value="visits" className="mt-6">
            {visitsLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-32 w-full" />
                ))}
              </div>
            ) : (
              <PeerVisitTimeline
                visits={peerVisits || []}
                institutionId={institutionId}
              />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </ContentLayout>
  )
}
