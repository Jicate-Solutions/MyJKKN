export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ClipboardCheck } from 'lucide-react'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { ContentLayout } from '@/components/layout/content-layout'
import { PageBreadcrumb } from '@/components/navigation'
import { WeeklyCheckinClient } from './_components/weekly-checkin-client'

interface Props {
  params: Promise<{ id: string }>
}

export default async function WeeklyCheckinPage({ params }: Props) {
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

  const breadcrumbs = [
    { label: 'Home', href: '/' },
    { label: 'Startup Studio', href: '/startup-studio/events' },
    { label: event.name, href: `/startup-studio/events/${id}` },
    { label: 'Solve for 100', href: `/startup-studio/events/${id}/solve-for-100` },
    { label: 'Weekly Check-in' },
  ]

  return (
    <ContentLayout title="Weekly Check-in">
      <PageBreadcrumb items={breadcrumbs} />
      <div className="space-y-6 mt-4 pb-10">
        <Link href={`/startup-studio/events/${id}/solve-for-100`}>
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back to Solve for 100
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6 text-green-600" />
            Weekly Check-in
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Report your team&apos;s progress, commitments, and metrics for this week.
          </p>
        </div>
        <Suspense fallback={<Skeleton className="h-[600px] w-full rounded-xl" />}>
          <WeeklyCheckinClient eventId={id} eventStartDate={event.start_date} />
        </Suspense>
      </div>
    </ContentLayout>
  )
}
