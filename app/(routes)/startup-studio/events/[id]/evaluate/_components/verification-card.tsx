'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ExternalLink, CheckCircle2, Flag, XCircle, RotateCcw } from 'lucide-react'
import { AppathonVerificationService } from '@/lib/services/startup-studio/appathon-verification-service'
import type { EvaluatorTeamCard, VerificationScore, VerificationStatus } from '@/types/startup-studio'

const schema = z.object({
  presented: z.boolean(),
  app_live: z.boolean(),
  verified_users: z.coerce.number().min(0),
  verified_active_users: z.coerce.number().min(0),
  verified_revenue: z.coerce.number().min(0),
  notes: z.string().optional(),
})

type FormData = z.infer<typeof schema>

const TIER_LABELS: Record<number, string> = {
  0: 'Level 0 — No Points',
  1: 'Level 1 — App Live (10 pts)',
  2: 'Level 2 — 5+ Users (25 pts)',
  3: 'Level 3 — 10+ Active Users (40 pts)',
  4: 'Level 4 — 25+ Active Users (50 pts)',
}

interface VerificationCardProps {
  team: EvaluatorTeamCard
  onVerify: (
    status: VerificationStatus,
    data: FormData,
    flagReason?: string
  ) => Promise<void>
  isSubmitting: boolean
}

export function VerificationCard({ team, onVerify, isSubmitting }: VerificationCardProps) {
  const [score, setScore] = useState<VerificationScore>({
    tier: 0, tier_points: 0, revenue_bonus: 0, total_score: 0,
  })
  const [pendingAction, setPendingAction] = useState<VerificationStatus | null>(null)
  const [flagReason, setFlagReason] = useState('')

  const existing = team.verification
  const sub = team.submission

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      presented: existing?.presented ?? true,
      app_live: existing?.app_live ?? false,
      verified_users: existing?.verified_users ?? 0,
      verified_active_users: existing?.verified_active_users ?? 0,
      verified_revenue: existing?.verified_revenue ?? 0,
      notes: existing?.notes ?? '',
    },
  })

  const watched = form.watch()

  useEffect(() => {
    setScore(AppathonVerificationService.calculateScore({
      app_live: watched.app_live,
      verified_users: Number(watched.verified_users ?? 0),
      verified_active_users: Number(watched.verified_active_users ?? 0),
      verified_revenue: Number(watched.verified_revenue ?? 0),
    }))
  }, [watched.app_live, watched.verified_users, watched.verified_active_users, watched.verified_revenue])

  const handleAction = async (status: VerificationStatus) => {
    const needsReason = status === 'flagged' || status === 'disqualified'
    if (needsReason && !pendingAction) {
      setPendingAction(status)
      return
    }
    const data = form.getValues()
    await onVerify(status, data, needsReason ? flagReason : undefined)
    setPendingAction(null)
    setFlagReason('')
  }

  const statusColor = {
    verified: 'border-green-500 bg-green-50 dark:bg-green-950/20',
    flagged: 'border-amber-500 bg-amber-50 dark:bg-amber-950/20',
    disqualified: 'border-red-500 bg-red-50 dark:bg-red-950/20',
    pending: '',
  }[existing?.verification_status ?? 'pending']

  return (
    <Card className={statusColor}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base leading-tight">
              {team.demo_slot != null ? `Slot ${team.demo_slot}: ` : ''}{team.team_name}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">{team.institution_name}</p>
          </div>
          {existing?.verification_status && existing.verification_status !== 'pending' && (
            <Badge
              className={
                existing.verification_status === 'verified'
                  ? 'bg-green-500 shrink-0'
                  : existing.verification_status === 'flagged'
                  ? 'text-amber-600 border-amber-400 shrink-0'
                  : 'text-red-600 border-red-400 shrink-0'
              }
              variant={existing.verification_status === 'verified' ? 'default' : 'outline'}
            >
              {existing.verification_status}
            </Badge>
          )}
        </div>

        {sub && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {sub.live_app_url && (
              <a href={sub.live_app_url} target="_blank" rel="noopener noreferrer">
                <Badge variant="outline" className="cursor-pointer hover:bg-muted gap-1 text-xs">
                  <ExternalLink className="h-3 w-3" /> Live App
                </Badge>
              </a>
            )}
            {sub.github_url && (
              <a href={sub.github_url} target="_blank" rel="noopener noreferrer">
                <Badge variant="outline" className="cursor-pointer hover:bg-muted gap-1 text-xs">
                  <ExternalLink className="h-3 w-3" /> GitHub
                </Badge>
              </a>
            )}
            {(sub.proof_urls ?? []).map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                <Badge variant="outline" className="cursor-pointer hover:bg-muted gap-1 text-xs">
                  <ExternalLink className="h-3 w-3" /> Proof {i + 1}
                </Badge>
              </a>
            ))}
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Checkbox
            id={`presented-${team.registration_id}`}
            checked={form.watch('presented')}
            onCheckedChange={v => form.setValue('presented', !!v)}
          />
          <Label htmlFor={`presented-${team.registration_id}`} className="text-sm">
            Team was present and presented
          </Label>
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id={`app_live-${team.registration_id}`}
            checked={form.watch('app_live')}
            onCheckedChange={v => form.setValue('app_live', !!v)}
          />
          <Label htmlFor={`app_live-${team.registration_id}`} className="text-sm">
            App is live and working
          </Label>
        </div>

        <div className="rounded-md border overflow-hidden text-sm">
          <div className="grid grid-cols-2 bg-muted/50 px-3 py-1.5 text-xs font-medium text-muted-foreground">
            <span>Team Claims</span>
            <span>You Verify</span>
          </div>
          <div className="divide-y">
            <div className="grid grid-cols-2 items-center px-3 py-2 gap-3">
              <span className="text-muted-foreground">
                Total Users: <span className="font-mono text-foreground">{sub?.user_count ?? 0}</span>
              </span>
              <Input type="number" min={0} placeholder="0" className="h-7 text-sm" {...form.register('verified_users')} />
            </div>
            <div className="grid grid-cols-2 items-center px-3 py-2 gap-3">
              <span className="text-muted-foreground">
                Active Users: <span className="font-mono text-foreground">{sub?.active_users_count ?? 0}</span>
              </span>
              <Input type="number" min={0} placeholder="0" className="h-7 text-sm" {...form.register('verified_active_users')} />
            </div>
            <div className="grid grid-cols-2 items-center px-3 py-2 gap-3">
              <span className="text-muted-foreground">
                Revenue: <span className="font-mono text-foreground">₹{sub?.mrr_amount ?? 0}</span>
              </span>
              <div className="relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">₹</span>
                <Input type="number" min={0} placeholder="0" className="h-7 text-sm pl-5" {...form.register('verified_revenue')} />
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-md bg-muted p-3 text-sm space-y-0.5">
          <div className="font-medium">{TIER_LABELS[score.tier]}</div>
          {score.revenue_bonus > 0 && (
            <div className="text-green-600 text-xs">+ Revenue Bonus: +{score.revenue_bonus} pts</div>
          )}
          <div className="text-lg font-bold tabular-nums">Total: {score.total_score} pts</div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Notes (optional)</Label>
          <Textarea placeholder="Any observations..." className="text-sm h-14 resize-none" {...form.register('notes')} />
        </div>

        {pendingAction && (
          <div className="space-y-1">
            <Label className="text-xs text-amber-700 font-medium">
              {pendingAction === 'disqualified' ? 'Disqualification reason (required)' : 'Flag reason (required)'}
            </Label>
            <Textarea
              placeholder="Describe the issue clearly..."
              className="text-sm h-16 resize-none border-amber-500 focus-visible:ring-amber-400"
              value={flagReason}
              onChange={e => setFlagReason(e.target.value)}
            />
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            className="flex-1 bg-green-600 hover:bg-green-700 gap-1.5 min-w-[100px]"
            onClick={() => handleAction('verified')}
            disabled={isSubmitting}
          >
            <CheckCircle2 className="h-4 w-4" />
            {existing?.verification_status === 'verified' ? 'Update' : 'Verify'}
          </Button>

          {(!pendingAction || pendingAction === 'flagged') && (
            <Button
              type="button"
              variant="outline"
              className="flex-1 text-amber-600 border-amber-400 hover:bg-amber-50 gap-1.5 min-w-[100px]"
              onClick={() => handleAction('flagged')}
              disabled={isSubmitting || (pendingAction === 'flagged' && !flagReason.trim())}
            >
              <Flag className="h-4 w-4" />
              {pendingAction === 'flagged' ? 'Confirm Flag' : 'Flag'}
            </Button>
          )}

          {(!pendingAction || pendingAction === 'disqualified') && (
            <Button
              type="button"
              variant="outline"
              className="flex-1 text-red-600 border-red-400 hover:bg-red-50 gap-1.5 min-w-[100px]"
              onClick={() => handleAction('disqualified')}
              disabled={isSubmitting || (pendingAction === 'disqualified' && !flagReason.trim())}
            >
              <XCircle className="h-4 w-4" />
              {pendingAction === 'disqualified' ? 'Confirm DQ' : 'DQ'}
            </Button>
          )}

          {pendingAction && (
            <Button
              type="button"
              variant="ghost"
              className="w-full text-xs"
              onClick={() => { setPendingAction(null); setFlagReason('') }}
            >
              <RotateCcw className="h-3 w-3 mr-1" /> Cancel
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
