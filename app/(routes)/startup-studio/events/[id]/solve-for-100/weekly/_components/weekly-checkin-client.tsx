'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { useMyRegistration } from '@/hooks/startup-studio/use-event-registrations'
import { useMyWeeklyCheckin, useTeamHistory, useSubmitWeeklyCheckin } from '@/hooks/startup-studio/use-solve100-weekly'
import { getCurrentWeekNumber, isCheckinDeadlinePassed, APP_STATUS_OPTIONS, SOLVE100_WEEKS } from '@/lib/constants/startup-studio/solve100'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { CheckCircle2, AlertCircle, ChevronLeft, ChevronRight, Loader2, Clock } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import type { SubmitWeeklyCheckinDto, Solve100AppStatus } from '@/types/startup-studio'

interface Props {
  eventId: string
  eventStartDate: string | null
}

const DRAFT_KEY = (eventId: string, week: number) => `solve100-weekly-draft-${eventId}-${week}`

export function WeeklyCheckinClient({ eventId, eventStartDate }: Props) {
  const { profile } = useAuth()
  const { data: registration, isLoading: regLoading } = useMyRegistration(eventId)

  const currentWeek = eventStartDate ? getCurrentWeekNumber(eventStartDate) : 1
  const [selectedWeek, setSelectedWeek] = useState(currentWeek)

  // Sync selectedWeek if eventStartDate resolves after initial render
  useEffect(() => {
    if (eventStartDate) setSelectedWeek(getCurrentWeekNumber(eventStartDate))
  }, [eventStartDate])

  const teamId = registration?.id ?? null
  const { data: existingCheckin, isLoading: checkinLoading } = useMyWeeklyCheckin(eventId, teamId, selectedWeek)
  const { data: prevCheckin } = useMyWeeklyCheckin(eventId, teamId, selectedWeek - 1)
  const { data: history } = useTeamHistory(eventId, teamId)
  const submitMutation = useSubmitWeeklyCheckin(eventId)

  // Form state
  const [commitment, setCommitment] = useState('')
  const [commitmentResult, setCommitmentResult] = useState('')
  const [commitmentMet, setCommitmentMet] = useState<boolean | null>(null)
  const [verifiedPaidUsers, setVerifiedPaidUsers] = useState(0)
  const [totalUsers, setTotalUsers] = useState(0)
  const [activeUsers, setActiveUsers] = useState(0)
  const [targetCustomerName, setTargetCustomerName] = useState('')
  const [targetCustomerLocation, setTargetCustomerLocation] = useState('')
  const [problemDescription, setProblemDescription] = useState('')
  const [pricing, setPricing] = useState('')
  const [acquisitionPlan, setAcquisitionPlan] = useState('')
  const [appStatus, setAppStatus] = useState<Solve100AppStatus | ''>('')
  const [appUrl, setAppUrl] = useState('')
  const [biggestBlocker, setBiggestBlocker] = useState('')
  const [blockerResolved, setBlockerResolved] = useState(false)

  // Load existing data or draft
  useEffect(() => {
    if (existingCheckin) {
      setCommitment(existingCheckin.commitment)
      setCommitmentResult(existingCheckin.commitment_result ?? '')
      setCommitmentMet(existingCheckin.commitment_met)
      setVerifiedPaidUsers(existingCheckin.verified_paid_users)
      setTotalUsers(existingCheckin.total_users)
      setActiveUsers(existingCheckin.active_users)
      setTargetCustomerName(existingCheckin.target_customer_name ?? '')
      setTargetCustomerLocation(existingCheckin.target_customer_location ?? '')
      setProblemDescription(existingCheckin.problem_description ?? '')
      setPricing(existingCheckin.pricing ?? '')
      setAcquisitionPlan(existingCheckin.acquisition_plan ?? '')
      setAppStatus(existingCheckin.app_status ?? '')
      setAppUrl(existingCheckin.app_url ?? '')
      setBiggestBlocker(existingCheckin.biggest_blocker ?? '')
      setBlockerResolved(existingCheckin.blocker_resolved)
    } else {
      // Reset all fields to defaults first to prevent stale data from previous week
      setCommitment('')
      setCommitmentResult('')
      setCommitmentMet(null)
      setVerifiedPaidUsers(0)
      setTotalUsers(0)
      setActiveUsers(0)
      setTargetCustomerName('')
      setTargetCustomerLocation('')
      setProblemDescription('')
      setPricing('')
      setAcquisitionPlan('')
      setAppStatus('')
      setAppUrl('')
      setBiggestBlocker('')
      setBlockerResolved(false)

      // Then try draft from sessionStorage
      try {
        const draft = sessionStorage.getItem(DRAFT_KEY(eventId, selectedWeek))
        if (draft) {
          const parsed = JSON.parse(draft)
          setCommitment(parsed.commitment ?? '')
          setVerifiedPaidUsers(parsed.verifiedPaidUsers ?? 0)
          setTotalUsers(parsed.totalUsers ?? 0)
          setActiveUsers(parsed.activeUsers ?? 0)
          setTargetCustomerName(parsed.targetCustomerName ?? '')
          setTargetCustomerLocation(parsed.targetCustomerLocation ?? '')
          setProblemDescription(parsed.problemDescription ?? '')
          setPricing(parsed.pricing ?? '')
          setAcquisitionPlan(parsed.acquisitionPlan ?? '')
          setAppStatus(parsed.appStatus ?? '')
          setAppUrl(parsed.appUrl ?? '')
          setBiggestBlocker(parsed.biggestBlocker ?? '')
        }
      } catch { /* ignore */ }
    }
  }, [existingCheckin, eventId, selectedWeek])

  // Auto-save draft
  useEffect(() => {
    if (existingCheckin) return // Don't save draft if already submitted
    const timer = setTimeout(() => {
      try {
        sessionStorage.setItem(DRAFT_KEY(eventId, selectedWeek), JSON.stringify({
          commitment, verifiedPaidUsers, totalUsers, activeUsers,
          targetCustomerName, targetCustomerLocation, problemDescription,
          pricing, acquisitionPlan, appStatus, appUrl, biggestBlocker,
        }))
      } catch { /* ignore */ }
    }, 1000)
    return () => clearTimeout(timer)
  }, [commitment, verifiedPaidUsers, totalUsers, activeUsers, targetCustomerName,
    targetCustomerLocation, problemDescription, pricing, acquisitionPlan,
    appStatus, appUrl, biggestBlocker, eventId, selectedWeek, existingCheckin])

  const handleSubmit = () => {
    if (!teamId || !commitment.trim()) {
      if (!commitment.trim()) toast.error('Commitment is required')
      return
    }
    // Validate app_url if provided
    if (appUrl.trim() && !appUrl.trim().startsWith('http://') && !appUrl.trim().startsWith('https://')) {
      toast.error('App URL must start with http:// or https://')
      return
    }

    const dto: SubmitWeeklyCheckinDto = {
      event_id: eventId,
      team_id: teamId,
      week_number: selectedWeek,
      commitment: commitment.trim(),
      commitment_result: commitmentResult.trim() || undefined,
      commitment_met: commitmentMet ?? undefined,
      verified_paid_users: verifiedPaidUsers,
      total_users: totalUsers,
      active_users: activeUsers,
      target_customer_name: targetCustomerName.trim() || undefined,
      target_customer_location: targetCustomerLocation.trim() || undefined,
      problem_description: problemDescription.trim() || undefined,
      pricing: pricing.trim() || undefined,
      acquisition_plan: acquisitionPlan.trim() || undefined,
      app_status: appStatus || undefined,
      app_url: appUrl.trim() || undefined,
      biggest_blocker: biggestBlocker.trim() || undefined,
      blocker_resolved: blockerResolved,
    }

    submitMutation.mutate(dto, {
      onSuccess: () => {
        try { sessionStorage.removeItem(DRAFT_KEY(eventId, selectedWeek)) } catch { /* ignore */ }
      },
    })
  }

  if (regLoading || checkinLoading) return <Skeleton className="h-[600px] w-full rounded-xl" />

  if (!registration) {
    return (
      <div className="text-center py-10 space-y-3">
        <p className="text-muted-foreground">You are not registered for this event.</p>
        <Link href={`/startup-studio/events/${eventId}`}>
          <Button variant="outline" size="sm">Go to Event Page</Button>
        </Link>
      </div>
    )
  }

  const isSuperAdmin = profile?.role === 'super_admin'
  const isTeamLeader = registration.owner_id === profile?.id
  if (!isSuperAdmin && !isTeamLeader) {
    return (
      <p className="text-center text-muted-foreground py-10">
        Only the team leader can submit the weekly check-in.
      </p>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Week Navigator */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline" size="sm"
          disabled={selectedWeek <= 1}
          onClick={() => setSelectedWeek(w => w - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="text-center">
          <p className="font-semibold">Week {selectedWeek}</p>
          <p className="text-xs text-muted-foreground">
            {selectedWeek === currentWeek ? 'Current week' : selectedWeek < currentWeek ? 'Past week' : 'Future week'}
          </p>
          {eventStartDate && selectedWeek < currentWeek && isCheckinDeadlinePassed(eventStartDate, selectedWeek) && (
            <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center justify-center gap-1 mt-0.5">
              <Clock className="h-3 w-3" /> Deadline passed
            </p>
          )}
        </div>
        <Button
          variant="outline" size="sm"
          disabled={selectedWeek >= currentWeek}
          onClick={() => setSelectedWeek(w => w + 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* History badges */}
      {history && history.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {Array.from({ length: currentWeek }, (_, i) => i + 1).map(w => {
            const done = history.some(h => h.week_number === w)
            return (
              <button
                key={w}
                onClick={() => setSelectedWeek(w)}
                className={`w-7 h-7 rounded text-xs font-medium border transition-colors ${
                  w === selectedWeek
                    ? 'bg-primary text-primary-foreground border-primary'
                    : done
                      ? 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800'
                      : 'bg-muted text-muted-foreground border-border'
                }`}
              >
                {w}
              </button>
            )
          })}
        </div>
      )}

      {/* Previous Week's Commitment (accountability) */}
      {prevCheckin && (
        <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-amber-800 dark:text-amber-400">
              Last Week&apos;s Commitment (Week {selectedWeek - 1})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm italic">&ldquo;{prevCheckin.commitment}&rdquo;</p>
          </CardContent>
        </Card>
      )}

      {/* Results from last week */}
      {prevCheckin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Did you meet last week&apos;s commitment?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-3">
              <Button
                variant={commitmentMet === true ? 'default' : 'outline'}
                size="sm"
                onClick={() => setCommitmentMet(true)}
                className="gap-1.5"
              >
                <CheckCircle2 className="h-4 w-4" /> Yes
              </Button>
              <Button
                variant={commitmentMet === false ? 'destructive' : 'outline'}
                size="sm"
                onClick={() => setCommitmentMet(false)}
                className="gap-1.5"
              >
                <AlertCircle className="h-4 w-4" /> No
              </Button>
            </div>
            <div className="space-y-1.5">
              <Label>What happened?</Label>
              <Textarea
                value={commitmentResult}
                onChange={(e) => setCommitmentResult(e.target.value)}
                placeholder="Describe what you accomplished or why you couldn't deliver..."
                rows={2}
              />
            </div>
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* This Week's Commitment */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">This Week&apos;s Commitment</CardTitle>
          <CardDescription>Be specific and measurable</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5">
            <Label>By next Thursday we will...</Label>
            <Textarea
              value={commitment}
              onChange={(e) => setCommitment(e.target.value)}
              placeholder="e.g., Talk to 5 potential customers at the Coimbatore Bazaar and get 2 sign-ups"
              rows={2}
              required
            />
          </div>
        </CardContent>
      </Card>

      {/* Customer Metrics */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Customer Metrics</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label>Verified Paid Users</Label>
            <Input
              type="number" min={0}
              value={verifiedPaidUsers}
              onChange={(e) => setVerifiedPaidUsers(Math.max(0, parseInt(e.target.value, 10) || 0))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Total Users</Label>
            <Input
              type="number" min={0}
              value={totalUsers}
              onChange={(e) => setTotalUsers(Math.max(0, parseInt(e.target.value, 10) || 0))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Active Users</Label>
            <Input
              type="number" min={0}
              value={activeUsers}
              onChange={(e) => setActiveUsers(Math.max(0, parseInt(e.target.value, 10) || 0))}
            />
          </div>
        </CardContent>
      </Card>

      {/* First Customer Plan */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">First Customer Plan</CardTitle>
          <CardDescription>Focus on ONE real person</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Target Customer Name</Label>
              <Input
                value={targetCustomerName}
                onChange={(e) => setTargetCustomerName(e.target.value)}
                placeholder="A real person's name"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Location</Label>
              <Input
                value={targetCustomerLocation}
                onChange={(e) => setTargetCustomerLocation(e.target.value)}
                placeholder="Where they are"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Problem (2-3 sentences)</Label>
            <Textarea
              value={problemDescription}
              onChange={(e) => setProblemDescription(e.target.value)}
              placeholder="What problem does this person face?"
              rows={2}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Pricing</Label>
              <Input
                value={pricing}
                onChange={(e) => setPricing(e.target.value)}
                placeholder="e.g., Rs.299/month"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Acquisition Plan (this week)</Label>
            <Textarea
              value={acquisitionPlan}
              onChange={(e) => setAcquisitionPlan(e.target.value)}
              placeholder="What specific conversation or action will you take?"
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      {/* App Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">App Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={appStatus} onValueChange={(v) => setAppStatus(v as Solve100AppStatus)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {APP_STATUS_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>App URL</Label>
              <Input
                value={appUrl}
                onChange={(e) => setAppUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Blockers */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Blockers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Biggest Blocker</Label>
            <Textarea
              value={biggestBlocker}
              onChange={(e) => setBiggestBlocker(e.target.value)}
              placeholder="What's stopping you from making progress?"
              rows={2}
            />
          </div>
          {prevCheckin?.biggest_blocker && (
            <div className="flex items-center gap-2">
              <Switch checked={blockerResolved} onCheckedChange={setBlockerResolved} />
              <Label className="text-sm">Last week&apos;s blocker is resolved</Label>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Submit */}
      <div className="flex items-center gap-3">
        <Button
          onClick={handleSubmit}
          disabled={submitMutation.isPending || !commitment.trim()}
          className="gap-1.5"
        >
          {submitMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {existingCheckin ? 'Update Check-in' : 'Submit Check-in'}
        </Button>
        {existingCheckin && (
          <Badge variant="outline" className="text-green-600 border-green-200">
            <CheckCircle2 className="h-3 w-3 mr-1" /> Submitted
          </Badge>
        )}
      </div>
    </div>
  )
}
