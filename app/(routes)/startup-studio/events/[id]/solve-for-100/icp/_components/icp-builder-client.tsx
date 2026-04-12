'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { useMyRegistration } from '@/hooks/startup-studio/use-event-registrations'
import { useMyICP, useSubmitICP, useUpdateICP } from '@/hooks/startup-studio/use-solve100-icp'
import { VALIDATION_STATUS_OPTIONS } from '@/lib/constants/startup-studio/solve100'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CheckCircle2, User, MessageSquare, DollarSign, Map, Loader2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import type { CreateICPDto, UpdateICPDto, Solve100ValidationStatus } from '@/types/startup-studio'

interface Props {
  eventId: string
}

const DRAFT_KEY = (eventId: string) => `solve100-icp-draft-${eventId}`

export function ICPBuilderClient({ eventId }: Props) {
  useAuth()
  const { data: registration, isLoading: regLoading } = useMyRegistration(eventId)

  const teamId = registration?.id ?? null
  const { data: existingICP, isLoading: icpLoading } = useMyICP(eventId, teamId)
  const submitMutation = useSubmitICP(eventId)
  const updateMutation = useUpdateICP(eventId, teamId ?? undefined)

  // Form state — The Person
  const [customerName, setCustomerName] = useState('')
  const [customerAgeGender, setCustomerAgeGender] = useState('')
  const [customerRole, setCustomerRole] = useState('')
  const [customerLocation, setCustomerLocation] = useState('')
  const [customerIncome, setCustomerIncome] = useState('')
  const [customerPhoneType, setCustomerPhoneType] = useState('')

  // The Problem
  const [problemInTheirWords, setProblemInTheirWords] = useState('')
  const [problemFrequency, setProblemFrequency] = useState('')
  const [problemCost, setProblemCost] = useState('')
  const [currentSolution, setCurrentSolution] = useState('')
  const [currentSpend, setCurrentSpend] = useState('')

  // The Sale
  const [elevatorPitch, setElevatorPitch] = useState('')
  const [proposedPrice, setProposedPrice] = useState('')
  const [valueJustification, setValueJustification] = useState('')
  const [topObjection, setTopObjection] = useState('')
  const [objectionResponse, setObjectionResponse] = useState('')

  // The Market
  const [marketSize50km, setMarketSize50km] = useState('')
  const [whereTheyGather, setWhereTheyGather] = useState('')
  const [planToReach10, setPlanToReach10] = useState('')
  const [hasTalkedToCustomer, setHasTalkedToCustomer] = useState<Solve100ValidationStatus | ''>('')
  const [talkDate, setTalkDate] = useState('')

  // Load existing data
  useEffect(() => {
    if (existingICP) {
      setCustomerName(existingICP.customer_name)
      setCustomerAgeGender(existingICP.customer_age_gender ?? '')
      setCustomerRole(existingICP.customer_role ?? '')
      setCustomerLocation(existingICP.customer_location ?? '')
      setCustomerIncome(existingICP.customer_income ?? '')
      setCustomerPhoneType(existingICP.customer_phone_type ?? '')
      setProblemInTheirWords(existingICP.problem_in_their_words)
      setProblemFrequency(existingICP.problem_frequency ?? '')
      setProblemCost(existingICP.problem_cost ?? '')
      setCurrentSolution(existingICP.current_solution ?? '')
      setCurrentSpend(existingICP.current_spend ?? '')
      setElevatorPitch(existingICP.elevator_pitch ?? '')
      setProposedPrice(existingICP.proposed_price ?? '')
      setValueJustification(existingICP.value_justification ?? '')
      setTopObjection(existingICP.top_objection ?? '')
      setObjectionResponse(existingICP.objection_response ?? '')
      setMarketSize50km(existingICP.market_size_50km ?? '')
      setWhereTheyGather(existingICP.where_they_gather ?? '')
      setPlanToReach10(existingICP.plan_to_reach_10 ?? '')
      setHasTalkedToCustomer(existingICP.has_talked_to_customer ?? '')
      setTalkDate(existingICP.talk_date ?? '')
    } else {
      // Reset all fields to defaults first to prevent stale data
      setCustomerName('')
      setCustomerAgeGender('')
      setCustomerRole('')
      setCustomerLocation('')
      setCustomerIncome('')
      setCustomerPhoneType('')
      setProblemInTheirWords('')
      setProblemFrequency('')
      setProblemCost('')
      setCurrentSolution('')
      setCurrentSpend('')
      setElevatorPitch('')
      setProposedPrice('')
      setValueJustification('')
      setTopObjection('')
      setObjectionResponse('')
      setMarketSize50km('')
      setWhereTheyGather('')
      setPlanToReach10('')
      setHasTalkedToCustomer('')
      setTalkDate('')

      // Then try loading from draft
      try {
        const draft = sessionStorage.getItem(DRAFT_KEY(eventId))
        if (draft) {
          const p = JSON.parse(draft)
          setCustomerName(p.customerName ?? '')
          setProblemInTheirWords(p.problemInTheirWords ?? '')
          setCustomerAgeGender(p.customerAgeGender ?? '')
          setCustomerRole(p.customerRole ?? '')
          setCustomerLocation(p.customerLocation ?? '')
          setCustomerIncome(p.customerIncome ?? '')
          setCustomerPhoneType(p.customerPhoneType ?? '')
          setProblemFrequency(p.problemFrequency ?? '')
          setProblemCost(p.problemCost ?? '')
          setCurrentSolution(p.currentSolution ?? '')
          setCurrentSpend(p.currentSpend ?? '')
          setElevatorPitch(p.elevatorPitch ?? '')
          setProposedPrice(p.proposedPrice ?? '')
          setValueJustification(p.valueJustification ?? '')
          setTopObjection(p.topObjection ?? '')
          setObjectionResponse(p.objectionResponse ?? '')
          setMarketSize50km(p.marketSize50km ?? '')
          setWhereTheyGather(p.whereTheyGather ?? '')
          setPlanToReach10(p.planToReach10 ?? '')
          setHasTalkedToCustomer(p.hasTalkedToCustomer ?? '')
          setTalkDate(p.talkDate ?? '')
        }
      } catch { /* ignore */ }
    }
  }, [existingICP, eventId])

  // Auto-save draft (all fields)
  useEffect(() => {
    if (existingICP) return
    const timer = setTimeout(() => {
      try {
        sessionStorage.setItem(DRAFT_KEY(eventId), JSON.stringify({
          customerName, problemInTheirWords, customerAgeGender, customerRole, customerLocation,
          customerIncome, customerPhoneType, problemFrequency, problemCost, currentSolution,
          currentSpend, elevatorPitch, proposedPrice, valueJustification, topObjection,
          objectionResponse, marketSize50km, whereTheyGather, planToReach10,
          hasTalkedToCustomer, talkDate,
        }))
      } catch { /* ignore */ }
    }, 1000)
    return () => clearTimeout(timer)
  }, [customerName, problemInTheirWords, customerAgeGender, customerRole, customerLocation,
    customerIncome, customerPhoneType, problemFrequency, problemCost, currentSolution,
    currentSpend, elevatorPitch, proposedPrice, valueJustification, topObjection,
    objectionResponse, marketSize50km, whereTheyGather, planToReach10,
    hasTalkedToCustomer, talkDate, eventId, existingICP])

  const buildPayload = () => ({
    customer_name: customerName.trim(),
    customer_age_gender: customerAgeGender.trim() || undefined,
    customer_role: customerRole.trim() || undefined,
    customer_location: customerLocation.trim() || undefined,
    customer_income: customerIncome.trim() || undefined,
    customer_phone_type: customerPhoneType.trim() || undefined,
    problem_in_their_words: problemInTheirWords.trim(),
    problem_frequency: problemFrequency.trim() || undefined,
    problem_cost: problemCost.trim() || undefined,
    current_solution: currentSolution.trim() || undefined,
    current_spend: currentSpend.trim() || undefined,
    elevator_pitch: elevatorPitch.trim() || undefined,
    proposed_price: proposedPrice.trim() || undefined,
    value_justification: valueJustification.trim() || undefined,
    top_objection: topObjection.trim() || undefined,
    objection_response: objectionResponse.trim() || undefined,
    market_size_50km: marketSize50km.trim() || undefined,
    where_they_gather: whereTheyGather.trim() || undefined,
    plan_to_reach_10: planToReach10.trim() || undefined,
    has_talked_to_customer: hasTalkedToCustomer || undefined,
    talk_date: talkDate.trim() || undefined,
  })

  const handleSubmit = () => {
    if (!teamId || !customerName.trim() || !problemInTheirWords.trim()) {
      if (!customerName.trim()) toast.error('Customer Name is required')
      else if (!problemInTheirWords.trim()) toast.error('Problem description is required')
      return
    }

    if (existingICP) {
      updateMutation.mutate({
        id: existingICP.id,
        dto: buildPayload() as UpdateICPDto,
      }, {
        onSuccess: () => {
          try { sessionStorage.removeItem(DRAFT_KEY(eventId)) } catch { /* ignore */ }
        },
      })
    } else {
      const dto: CreateICPDto = {
        event_id: eventId,
        team_id: teamId,
        ...buildPayload(),
      }
      submitMutation.mutate(dto, {
        onSuccess: () => {
          try { sessionStorage.removeItem(DRAFT_KEY(eventId)) } catch { /* ignore */ }
        },
      })
    }
  }

  if (regLoading || icpLoading) return <Skeleton className="h-[600px] w-full rounded-xl" />

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

  const isPending = submitMutation.isPending || updateMutation.isPending
  const validationWarning = hasTalkedToCustomer === 'no_guessing'

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Validation Status Banner */}
      {existingICP && (
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-green-600 border-green-200 gap-1">
            <CheckCircle2 className="h-3 w-3" /> Version {existingICP.version}
          </Badge>
          {existingICP.has_talked_to_customer && (
            <Badge variant="outline" className={
              existingICP.has_talked_to_customer.startsWith('yes')
                ? 'text-green-600 border-green-200'
                : 'text-amber-600 border-amber-200'
            }>
              {VALIDATION_STATUS_OPTIONS.find(v => v.value === existingICP.has_talked_to_customer)?.label ?? existingICP.has_talked_to_customer}
            </Badge>
          )}
        </div>
      )}

      {/* Section 1: The Person */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-4 w-4" /> The Person
          </CardTitle>
          <CardDescription>Describe ONE real person — not a segment</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Customer Name *</Label>
            <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="A real person's name" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Age / Gender</Label>
              <Input value={customerAgeGender} onChange={(e) => setCustomerAgeGender(e.target.value)} placeholder="e.g., 25, Male" />
            </div>
            <div className="space-y-1.5">
              <Label>Role / Job</Label>
              <Input value={customerRole} onChange={(e) => setCustomerRole(e.target.value)} placeholder="e.g., Small shop owner" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Location</Label>
              <Input value={customerLocation} onChange={(e) => setCustomerLocation(e.target.value)} placeholder="Where they work/live" />
            </div>
            <div className="space-y-1.5">
              <Label>Income Bracket</Label>
              <Input value={customerIncome} onChange={(e) => setCustomerIncome(e.target.value)} placeholder="e.g., Rs.20,000-30,000/month" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Phone Type</Label>
            <Input value={customerPhoneType} onChange={(e) => setCustomerPhoneType(e.target.value)} placeholder="e.g., Android, low-end smartphone" />
          </div>
        </CardContent>
      </Card>

      {/* Section 2: The Problem */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4" /> The Problem
          </CardTitle>
          <CardDescription>In their words, not yours</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Problem in their words *</Label>
            <Textarea value={problemInTheirWords} onChange={(e) => setProblemInTheirWords(e.target.value)} placeholder="How would THEY describe this problem?" rows={3} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>How often?</Label>
              <Select value={problemFrequency} onValueChange={setProblemFrequency}>
                <SelectTrigger><SelectValue placeholder="Frequency" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="rarely">Rarely</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>What does it cost them?</Label>
              <Input value={problemCost} onChange={(e) => setProblemCost(e.target.value)} placeholder="Money, time, or both" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Current solution</Label>
              <Input value={currentSolution} onChange={(e) => setCurrentSolution(e.target.value)} placeholder="How do they handle it now?" />
            </div>
            <div className="space-y-1.5">
              <Label>What they pay now</Label>
              <Input value={currentSpend} onChange={(e) => setCurrentSpend(e.target.value)} placeholder="e.g., Rs.500/month for X" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 3: The Sale */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="h-4 w-4" /> The Sale
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Elevator Pitch (2 sentences)</Label>
            <Textarea value={elevatorPitch} onChange={(e) => setElevatorPitch(e.target.value)} placeholder="Our app helps [person] do [thing] so they can [benefit]." rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Proposed Price</Label>
              <Input value={proposedPrice} onChange={(e) => setProposedPrice(e.target.value)} placeholder="e.g., Rs.299/month" />
            </div>
            <div className="space-y-1.5">
              <Label>Why they&apos;d pay</Label>
              <Input value={valueJustification} onChange={(e) => setValueJustification(e.target.value)} placeholder="Value justification" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>#1 Objection</Label>
              <Input value={topObjection} onChange={(e) => setTopObjection(e.target.value)} placeholder="Why they'd say NO" />
            </div>
            <div className="space-y-1.5">
              <Label>Your Response</Label>
              <Input value={objectionResponse} onChange={(e) => setObjectionResponse(e.target.value)} placeholder="How you counter it" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 4: The Market */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Map className="h-4 w-4" /> The Market
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Market size within 50km</Label>
              <Input value={marketSize50km} onChange={(e) => setMarketSize50km(e.target.value)} placeholder="How many similar customers?" />
            </div>
            <div className="space-y-1.5">
              <Label>Where they gather</Label>
              <Input value={whereTheyGather} onChange={(e) => setWhereTheyGather(e.target.value)} placeholder="Physical/online spots" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Plan to reach first 10 customers</Label>
            <Textarea value={planToReach10} onChange={(e) => setPlanToReach10(e.target.value)} placeholder="Specific names, places, dates" rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Have you talked to this person?</Label>
              <Select value={hasTalkedToCustomer} onValueChange={(v) => setHasTalkedToCustomer(v as Solve100ValidationStatus)}>
                <SelectTrigger><SelectValue placeholder="Validation status" /></SelectTrigger>
                <SelectContent>
                  {VALIDATION_STATUS_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {hasTalkedToCustomer === 'no_guessing' && (
              <div className="space-y-1.5">
                <Label>When will you talk to them?</Label>
                <Input value={talkDate} onChange={(e) => setTalkDate(e.target.value)} placeholder="e.g., This Thursday" />
              </div>
            )}
          </div>
          {validationWarning && (
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-sm bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <span>You haven&apos;t talked to your customer yet. Go talk to them before spending more time building!</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Submit */}
      <div className="flex items-center gap-3">
        <Button
          onClick={handleSubmit}
          disabled={isPending || !customerName.trim() || !problemInTheirWords.trim()}
          className="gap-1.5"
        >
          {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {existingICP ? 'Update ICP' : 'Save ICP'}
        </Button>
        {existingICP && (
          <span className="text-sm text-muted-foreground">
            Saving will create version {existingICP.version + 1}
          </span>
        )}
      </div>
    </div>
  )
}
