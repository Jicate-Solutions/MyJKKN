export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Users } from 'lucide-react'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { ContentLayout } from '@/components/layout/content-layout'
import { PageBreadcrumb } from '@/components/navigation'
import { MentorReviewClient } from './_components/mentor-review-client'

interface Props {
  params: Promise<{ id: string }>
}

export default async function MentorReviewPage({ params }: Props) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) notFound()

  const { data: event } = await supabase
    .from('startup_events')
    .select('id, name, start_date')
    .eq('id', id)
    .single()

  if (!event) notFound()

  // Check if user is a mentor or super_admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const isSuperAdmin = profile?.role === 'super_admin'

  const { data: staffAssignment } = await (supabase as any)
    .from('event_staff_assignments')
    .select('id, role')
    .eq('event_id', id)
    .eq('staff_id', user.id)
    .in('role', ['mentor', 'lead_mentor'])
    .maybeSingle()

  if (!isSuperAdmin && !staffAssignment) {
    return (
      <ContentLayout title="Mentor Review">
        <div className="text-center space-y-2 py-10">
          <Users className="h-12 w-12 text-muted-foreground/40 mx-auto" />
          <h1 className="text-xl font-semibold">Mentor Access Required</h1>
          <p className="text-muted-foreground text-sm">
            This page is only available to assigned mentors.
          </p>
        </div>
      </ContentLayout>
    )
  }

  const breadcrumbs = [
    { label: 'Home', href: '/' },
    { label: 'Startup Studio', href: '/startup-studio/events' },
    { label: event.name, href: `/startup-studio/events/${id}` },
    { label: 'Solve for 100', href: `/startup-studio/events/${id}/solve-for-100` },
    { label: 'Mentor Review' },
  ]

  return (
    <ContentLayout title="Mentor Review">
      <PageBreadcrumb items={breadcrumbs} />
      <div className="space-y-6 mt-4 pb-10">
        <Link href={`/startup-studio/events/${id}/solve-for-100`}>
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back to Solve for 100
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6 text-green-600" />
            Mentor Review Dashboard
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Review team check-ins, add notes, and track progress across weeks.
          </p>
        </div>
        <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
          <MentorReviewClient eventId={id} eventStartDate={event.start_date} />
        </Suspense>
      </div>
    </ContentLayout>
  )
}
