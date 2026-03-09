import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { Skeleton } from '@/components/ui/skeleton'
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

  if (!event.is_results_published) {
    return (
      <div className="container max-w-2xl py-10 text-center space-y-2">
        <h1 className="text-2xl font-bold">Results Not Yet Published</h1>
        <p className="text-muted-foreground">
          Track declaration opens once Demo Day results are published.
        </p>
      </div>
    )
  }

  return (
    <div className="container max-w-2xl py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">What&apos;s Next for Your Team?</h1>
        <p className="text-muted-foreground mt-1">
          Choose the path that matches where you want to take your app.
        </p>
      </div>
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <DeclarePageClient eventId={id} />
      </Suspense>
    </div>
  )
}
