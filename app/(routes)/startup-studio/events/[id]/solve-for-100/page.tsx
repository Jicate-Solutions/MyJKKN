export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Target } from 'lucide-react'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { ContentLayout } from '@/components/layout/content-layout'
import { PageBreadcrumb } from '@/components/navigation'
import { Solve100HubClient } from './_components/solve100-hub-client'

interface Props {
  params: Promise<{ id: string }>
}

export default async function Solve100HubPage({ params }: Props) {
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
    { label: 'Solve for 100' },
  ]

  return (
    <ContentLayout title="Solve for 100">
      <PageBreadcrumb items={breadcrumbs} />
      <div className="space-y-6 mt-4 pb-10">
        <Link href={`/startup-studio/events/${id}`}>
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back to Event
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Target className="h-6 w-6 text-green-600" />
            Solve for 100
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Track team progress, weekly commitments, and customer metrics across the 10-month program.
          </p>
        </div>
        <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
          <Solve100HubClient eventId={id} eventStartDate={event.start_date} />
        </Suspense>
      </div>
    </ContentLayout>
  )
}
