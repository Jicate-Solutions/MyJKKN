import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, GitBranch } from 'lucide-react'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { ContentLayout } from '@/components/layout/content-layout'
import { PageBreadcrumb } from '@/components/navigation'
import { DeclarePageClient } from './_components/declare-page-client'

interface Props {
  params: Promise<{ id: string }>
}

export default async function TrackDeclarationPage({ params }: Props) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) notFound()

  const { data: event } = await supabase
    .from('startup_events')
    .select('id, name, is_results_published')
    .eq('id', id)
    .single()

  if (!event) notFound()

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const isSuperAdmin = profile?.role === 'super_admin'

  const breadcrumbs = [
    { label: 'Home', href: '/' },
    { label: 'Startup Studio', href: '/startup-studio/events' },
    { label: event.name, href: `/startup-studio/events/${id}` },
    { label: 'Declare Track' },
  ]

  if (!isSuperAdmin && !event.is_results_published) {
    return (
      <ContentLayout title="Declare Track">
        <PageBreadcrumb items={breadcrumbs} />
        <div className="space-y-6 mt-4 pb-10">
          <Link href={`/startup-studio/events/${id}`}>
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" /> Back to Event
            </Button>
          </Link>
          <div className="text-center space-y-2 py-10">
            <GitBranch className="h-12 w-12 text-muted-foreground/40 mx-auto" />
            <h1 className="text-xl font-semibold">Results Not Yet Published</h1>
            <p className="text-muted-foreground text-sm">
              Track declaration opens once Demo Day results are published.
            </p>
          </div>
        </div>
      </ContentLayout>
    )
  }

  return (
    <ContentLayout title="Declare Track">
      <PageBreadcrumb items={breadcrumbs} />
      <div className="space-y-6 mt-4 pb-10">
        <Link href={`/startup-studio/events/${id}`}>
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back to Event
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <GitBranch className="h-6 w-6 text-primary" />
            What&apos;s Next for Your Team?
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Choose the path that matches where you want to take your app.
          </p>
        </div>
        <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
          <DeclarePageClient eventId={id} />
        </Suspense>
      </div>
    </ContentLayout>
  )
}
