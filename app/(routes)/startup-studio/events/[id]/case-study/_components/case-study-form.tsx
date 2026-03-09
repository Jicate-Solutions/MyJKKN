'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Form, FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage } from '@/components/ui/form'
import { Badge } from '@/components/ui/badge'
import { Loader2, Save } from 'lucide-react'
import { useCreateCaseStudy, useUpdateCaseStudy } from '@/hooks/startup-studio/use-case-studies'
import type { CaseStudy } from '@/types/startup-studio'

const schema = z.object({
  problem: z.string().min(10, 'At least 10 characters').max(200, 'Max 200 characters'),
  solution: z.string().min(10, 'At least 10 characters').max(200, 'Max 200 characters'),
  proof: z.string().min(10, 'At least 10 characters').max(200, 'Max 200 characters'),
  who_else: z.string().max(200, 'Max 200 characters').optional(),
  demo_url: z.string().url('Must be a valid URL').optional().or(z.literal('')),
})

type FormValues = z.infer<typeof schema>

interface Props {
  eventId: string
  registrationId: string
  track: 'solve_for_industry' | 'jicate_solutions'
  appName: string
  appUrl: string
  score: number
  existing: CaseStudy | null
}

export function CaseStudyForm({
  eventId,
  registrationId,
  track,
  appName,
  appUrl,
  score,
  existing,
}: Props) {
  // Fix 5: derive DRAFT_KEY once with useMemo instead of on every render
  const DRAFT_KEY = useMemo(
    () => `case_study_draft_${eventId}_${registrationId}`,
    [eventId, registrationId]
  )

  const [draftSaved, setDraftSaved] = useState(false)
  const autoSaveRef = useRef<NodeJS.Timeout | null>(null)
  // Fix 2: ref to hold latest saveDraft so setInterval never has a stale closure
  const saveDraftRef = useRef<(() => void) | null>(null)

  // Fix 1: no localStorage in defaultValues (safe for SSR)
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: existing
      ? {
          problem: existing.problem,
          solution: existing.solution,
          proof: existing.proof,
          who_else: existing.who_else ?? '',
          demo_url: existing.demo_url ?? '',
        }
      : { problem: '', solution: '', proof: '', who_else: '', demo_url: '' },
  })

  // Fix 1: load draft from localStorage after mount (browser-only)
  useEffect(() => {
    if (!existing) {
      const draft = localStorage.getItem(DRAFT_KEY)
      if (draft) {
        try {
          form.reset(JSON.parse(draft))
        } catch {}
      }
    }
  }, []) // intentionally empty — only runs once on mount

  const create = useCreateCaseStudy(eventId, registrationId)
  const update = useUpdateCaseStudy(eventId, registrationId)
  const isPending = create.isPending || update.isPending

  function saveDraft() {
    if (!existing) {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(form.getValues()))
      setDraftSaved(true)
      setTimeout(() => setDraftSaved(false), 2000)
    }
  }

  // Fix 2: keep ref always up-to-date so interval never calls a stale closure
  saveDraftRef.current = saveDraft

  useEffect(() => {
    autoSaveRef.current = setInterval(() => saveDraftRef.current?.(), 10_000)
    return () => {
      if (autoSaveRef.current) clearInterval(autoSaveRef.current)
    }
  }, []) // empty deps is safe because interval calls through ref

  async function onSubmit(values: FormValues) {
    const cleanedUrl = values.demo_url || undefined
    if (existing) {
      await update.mutateAsync({
        id: existing.id,
        dto: {
          problem: values.problem,
          solution: values.solution,
          proof: values.proof,
          who_else: values.who_else || undefined,
          demo_url: cleanedUrl,
        },
      })
    } else {
      await create.mutateAsync({
        event_id: eventId,
        team_id: registrationId,
        track,
        problem: values.problem,
        solution: values.solution,
        proof: values.proof,
        who_else: values.who_else || undefined,
        demo_url: cleanedUrl,
        app_name: appName,
        app_url: appUrl,
        score,
      })
      localStorage.removeItem(DRAFT_KEY)
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-lg font-semibold">Case Study: {appName}</h2>
          <Badge variant="outline">{track.replace(/_/g, ' ')}</Badge>
          {draftSaved && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Save className="h-3 w-3" /> Draft saved
            </span>
          )}
        </div>

        <FormField
          control={form.control}
          name="problem"
          render={({ field }) => (
            <FormItem>
              <FormLabel>1. The Problem <span className="text-destructive">*</span></FormLabel>
              <FormDescription>Who has this problem and why does it matter?</FormDescription>
              <FormControl>
                <Textarea
                  {...field}
                  maxLength={200}
                  rows={3}
                  onBlur={() => { field.onBlur(); saveDraft() }}
                  disabled={isPending}
                />
              </FormControl>
              <div className="flex justify-between items-center">
                <FormMessage />
                <span className="text-xs text-muted-foreground">{field.value.length}/200</span>
              </div>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="solution"
          render={({ field }) => (
            <FormItem>
              <FormLabel>2. The Solution <span className="text-destructive">*</span></FormLabel>
              <FormDescription>What does your app do to solve it?</FormDescription>
              <FormControl>
                <Textarea
                  {...field}
                  maxLength={200}
                  rows={3}
                  onBlur={() => { field.onBlur(); saveDraft() }}
                  disabled={isPending}
                />
              </FormControl>
              <div className="flex justify-between items-center">
                <FormMessage />
                <span className="text-xs text-muted-foreground">{field.value.length}/200</span>
              </div>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="proof"
          render={({ field }) => (
            <FormItem>
              <FormLabel>3. The Proof <span className="text-destructive">*</span></FormLabel>
              <FormDescription>What happened when real people used it?</FormDescription>
              <FormControl>
                <Textarea
                  {...field}
                  maxLength={200}
                  rows={3}
                  placeholder="e.g. 15 hostel students used it daily to report maintenance issues, avg response time dropped from 3 days to 4 hours"
                  onBlur={() => { field.onBlur(); saveDraft() }}
                  disabled={isPending}
                />
              </FormControl>
              <div className="flex justify-between items-center">
                <FormMessage />
                <span className="text-xs text-muted-foreground">{field.value.length}/200</span>
              </div>
            </FormItem>
          )}
        />

        {track === 'solve_for_industry' && (
          <FormField
            control={form.control}
            name="who_else"
            render={({ field }) => (
              <FormItem>
                {/* Fix 3: field is optional in schema — remove asterisk, add (optional) hint */}
                <FormLabel>4. Who Else Needs This? <span className="text-muted-foreground text-xs">(optional)</span></FormLabel>
                <FormDescription>Beyond JKKN, who would pay for this?</FormDescription>
                <FormControl>
                  <Textarea
                    {...field}
                    maxLength={200}
                    rows={3}
                    onBlur={() => { field.onBlur(); saveDraft() }}
                    disabled={isPending}
                  />
                </FormControl>
                <div className="flex justify-between items-center">
                  <FormMessage />
                  <span className="text-xs text-muted-foreground">{(field.value ?? '').length}/200</span>
                </div>
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="demo_url"
          render={({ field }) => (
            <FormItem>
              <FormLabel>5. Screenshot / Demo URL <span className="text-muted-foreground text-xs">(optional)</span></FormLabel>
              <FormDescription>URL to a 30-second demo video or screenshot</FormDescription>
              <FormControl>
                <Input
                  {...field}
                  type="url"
                  placeholder="https://"
                  onBlur={() => { field.onBlur(); saveDraft() }}
                  disabled={isPending}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isPending ? 'Saving your case study...' : existing ? 'Update Case Study' : 'Submit Case Study'}
        </Button>
      </form>
    </Form>
  )
}
