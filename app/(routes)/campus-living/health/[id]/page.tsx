'use client'

import { use, useState } from 'react'
import Link from 'next/link'
import { ContentLayout } from '@/components/layout/content-layout'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  ArrowLeft,
  Loader2,
  HeartPulse,
  Stethoscope,
  Building2,
  Phone,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldCheck,
  AlertTriangle,
  Activity,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/use-auth'
import {
  useHealthCase,
  useRecordFirstAid,
  useReferToDoctor,
  useHospitalizeStudent,
  useNotifyParent,
  useClearStudent,
  useCloseHealthCase,
} from '@/hooks/campus-living/use-health-cases'

const SEVERITY_BADGE: Record<string, { className: string; label: string }> = {
  minor: { className: 'bg-blue-100 text-blue-800 hover:bg-blue-100', label: 'Minor' },
  moderate: { className: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100', label: 'Moderate' },
  serious: { className: 'bg-orange-100 text-orange-800 hover:bg-orange-100', label: 'Serious' },
  emergency: { className: 'bg-red-100 text-red-800 hover:bg-red-100', label: 'Emergency' },
}

const STATUS_BADGE: Record<string, { className: string; label: string }> = {
  reported: { className: 'bg-gray-100 text-gray-800 hover:bg-gray-100', label: 'Reported' },
  first_aid: { className: 'bg-blue-100 text-blue-800 hover:bg-blue-100', label: 'First Aid' },
  doctor_referred: { className: 'bg-purple-100 text-purple-800 hover:bg-purple-100', label: 'Doctor Referred' },
  hospitalized: { className: 'bg-red-100 text-red-800 hover:bg-red-100', label: 'Hospitalized' },
  recovering: { className: 'bg-orange-100 text-orange-800 hover:bg-orange-100', label: 'Recovering' },
  cleared: { className: 'bg-green-100 text-green-800 hover:bg-green-100', label: 'Cleared' },
  closed: { className: 'bg-gray-100 text-gray-600 hover:bg-gray-100', label: 'Closed' },
}

interface TimelineEvent {
  label: string
  timestamp: string | null
  icon: React.ReactNode
  detail?: string
}

export default function HealthCaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const { profile } = useAuth()
  const { data: caseData, isLoading } = useHealthCase(id)

  const recordFirstAid = useRecordFirstAid()
  const referToDoctor = useReferToDoctor()
  const hospitalizeStudent = useHospitalizeStudent()
  const notifyParent = useNotifyParent()
  const clearStudent = useClearStudent()
  const closeCase = useCloseHealthCase()

  // Dialog states
  const [showFirstAidDialog, setShowFirstAidDialog] = useState(false)
  const [showDoctorDialog, setShowDoctorDialog] = useState(false)
  const [showHospitalDialog, setShowHospitalDialog] = useState(false)
  const [showClearDialog, setShowClearDialog] = useState(false)

  // Form state for dialogs
  const [firstAidGiven, setFirstAidGiven] = useState('')
  const [firstAidBy, setFirstAidBy] = useState('')
  const [doctorName, setDoctorName] = useState('')
  const [hospitalName, setHospitalName] = useState('')
  const [recoveryNotes, setRecoveryNotes] = useState('')

  const healthCase = caseData as any

  if (isLoading || !healthCase) {
    return (
      <ContentLayout title="Health Case Details">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    )
  }

  const severity = SEVERITY_BADGE[healthCase.severity] || { className: '', label: healthCase.severity }
  const status = STATUS_BADGE[healthCase.status] || { className: '', label: healthCase.status }

  const isNotClearedOrClosed = healthCase.status !== 'cleared' && healthCase.status !== 'closed'

  // Build timeline events
  const timelineEvents: TimelineEvent[] = [
    {
      label: 'Case Reported',
      timestamp: healthCase.created_at,
      icon: <AlertTriangle className="h-4 w-4" />,
      detail: healthCase.symptoms,
    },
  ]

  if (healthCase.first_aid_at) {
    timelineEvents.push({
      label: 'First Aid Given',
      timestamp: healthCase.first_aid_at,
      icon: <HeartPulse className="h-4 w-4" />,
      detail: healthCase.first_aid_given
        ? `${healthCase.first_aid_given}${healthCase.first_aid_by ? ` (by ${healthCase.first_aid_by})` : ''}`
        : undefined,
    })
  }

  if (healthCase.doctor_referral_at) {
    timelineEvents.push({
      label: 'Referred to Doctor',
      timestamp: healthCase.doctor_referral_at,
      icon: <Stethoscope className="h-4 w-4" />,
      detail: healthCase.doctor_name ? `Dr. ${healthCase.doctor_name}` : undefined,
    })
  }

  if (healthCase.hospitalized_at) {
    timelineEvents.push({
      label: 'Hospitalized',
      timestamp: healthCase.hospitalized_at,
      icon: <Building2 className="h-4 w-4" />,
      detail: healthCase.hospital_name || undefined,
    })
  }

  if (healthCase.parent_notified_at) {
    timelineEvents.push({
      label: 'Parent Notified',
      timestamp: healthCase.parent_notified_at,
      icon: <Phone className="h-4 w-4" />,
    })
  }

  if (healthCase.cleared_at) {
    timelineEvents.push({
      label: 'Student Cleared',
      timestamp: healthCase.cleared_at,
      icon: <CheckCircle2 className="h-4 w-4" />,
      detail: healthCase.recovery_notes || undefined,
    })
  }

  if (healthCase.closed_at) {
    timelineEvents.push({
      label: 'Case Closed',
      timestamp: healthCase.closed_at,
      icon: <ShieldCheck className="h-4 w-4" />,
    })
  }

  // Action handlers
  const handleRecordFirstAid = () => {
    if (!firstAidGiven.trim()) return
    recordFirstAid.mutate(
      { id, first_aid_given: firstAidGiven.trim(), first_aid_by: firstAidBy.trim() || null },
      {
        onSuccess: () => {
          setShowFirstAidDialog(false)
          setFirstAidGiven('')
          setFirstAidBy('')
          toast.success('First aid recorded')
        },
        onError: () => toast.error('Failed to record first aid'),
      }
    )
  }

  const handleReferToDoctor = () => {
    if (!doctorName.trim()) return
    referToDoctor.mutate(
      { id, doctor_name: doctorName.trim() },
      {
        onSuccess: () => {
          setShowDoctorDialog(false)
          setDoctorName('')
          toast.success('Doctor referral recorded')
        },
        onError: () => toast.error('Failed to record referral'),
      }
    )
  }

  const handleHospitalize = () => {
    if (!hospitalName.trim()) return
    hospitalizeStudent.mutate(
      { id, hospital_name: hospitalName.trim() },
      {
        onSuccess: () => {
          setShowHospitalDialog(false)
          setHospitalName('')
          toast.success('Hospitalization recorded')
        },
        onError: () => toast.error('Failed to record hospitalization'),
      }
    )
  }

  const handleNotifyParent = () => {
    notifyParent.mutate(id, {
      onSuccess: () => toast.success('Parent notification recorded'),
      onError: () => toast.error('Failed to record parent notification'),
    })
  }

  const handleClearStudent = () => {
    clearStudent.mutate(
      { id, recovery_notes: recoveryNotes.trim() || null },
      {
        onSuccess: () => {
          setShowClearDialog(false)
          setRecoveryNotes('')
          toast.success('Student cleared')
        },
        onError: () => toast.error('Failed to clear student'),
      }
    )
  }

  const handleCloseCase = () => {
    closeCase.mutate(id, {
      onSuccess: () => toast.success('Case closed'),
      onError: () => toast.error('Failed to close case'),
    })
  }

  return (
    <ContentLayout title={`Case ${healthCase.case_number || healthCase.id?.slice(0, 8)}`}>
      <div className="space-y-6 max-w-4xl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/campus-living/health">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-3">
                Case {healthCase.case_number || healthCase.id?.slice(0, 8)}
                <Badge className={status.className}>{status.label}</Badge>
                <Badge className={severity.className}>{severity.label}</Badge>
              </h1>
              <p className="text-muted-foreground">
                {healthCase.learner?.full_name ?? 'Unknown Student'}
              </p>
            </div>
          </div>
        </div>

        {/* Case Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Case Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-sm text-muted-foreground">Student</p>
                <p className="font-medium">{healthCase.learner?.full_name ?? '-'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Block</p>
                <p className="font-medium">{healthCase.block?.name ?? healthCase.block_id ?? '-'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Severity</p>
                <Badge className={severity.className}>{severity.label}</Badge>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Temperature</p>
                <p className="font-medium">
                  {healthCase.temperature ? `${healthCase.temperature}°F` : '-'}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Reported</p>
                <p className="font-medium">
                  {healthCase.created_at
                    ? new Date(healthCase.created_at).toLocaleString()
                    : '-'}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Parent Notified</p>
                <div className="flex items-center gap-1">
                  {healthCase.parent_notified_at ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <span className="font-medium text-green-700">Yes</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4 text-red-400" />
                      <span className="font-medium text-red-500">No</span>
                    </>
                  )}
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Doctor</p>
                <p className="font-medium">{healthCase.doctor_name ? `Dr. ${healthCase.doctor_name}` : '-'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Hospital</p>
                <p className="font-medium">{healthCase.hospital_name || '-'}</p>
              </div>
            </div>
            <div className="mt-4 p-3 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground mb-1">Symptoms</p>
              <p className="text-sm">{healthCase.symptoms || '-'}</p>
            </div>
            {healthCase.first_aid_given && (
              <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                <p className="text-sm text-muted-foreground mb-1">First Aid Given</p>
                <p className="text-sm">{healthCase.first_aid_given}</p>
                {healthCase.first_aid_by && (
                  <p className="text-xs text-muted-foreground mt-1">By: {healthCase.first_aid_by}</p>
                )}
              </div>
            )}
            {healthCase.recovery_notes && (
              <div className="mt-3 p-3 bg-green-50 dark:bg-green-950 rounded-lg">
                <p className="text-sm text-muted-foreground mb-1">Recovery Notes</p>
                <p className="text-sm">{healthCase.recovery_notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Timeline */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Timeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative">
              {timelineEvents.map((event, index) => (
                <div key={index} className="flex gap-4 pb-6 last:pb-0">
                  {/* Connector line */}
                  <div className="flex flex-col items-center">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-primary bg-primary/10 text-primary">
                      {event.icon}
                    </div>
                    {index < timelineEvents.length - 1 && (
                      <div className="w-0.5 flex-1 bg-border mt-1" />
                    )}
                  </div>
                  {/* Content */}
                  <div className="flex-1 pt-1">
                    <p className="font-medium text-sm">{event.label}</p>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                      <Clock className="h-3 w-3" />
                      {event.timestamp
                        ? new Date(event.timestamp).toLocaleString()
                        : '-'}
                    </div>
                    {event.detail && (
                      <p className="text-sm text-muted-foreground mt-1">{event.detail}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3">
          {healthCase.status === 'reported' && (
            <Button onClick={() => setShowFirstAidDialog(true)}>
              <HeartPulse className="mr-2 h-4 w-4" />
              Record First Aid
            </Button>
          )}

          {(healthCase.status === 'reported' || healthCase.status === 'first_aid') && (
            <Button onClick={() => setShowDoctorDialog(true)} variant="outline">
              <Stethoscope className="mr-2 h-4 w-4" />
              Refer to Doctor
            </Button>
          )}

          {healthCase.status === 'doctor_referred' && (
            <Button onClick={() => setShowHospitalDialog(true)} variant="outline">
              <Building2 className="mr-2 h-4 w-4" />
              Hospitalize
            </Button>
          )}

          {!healthCase.parent_notified_at && (
            <Button
              onClick={handleNotifyParent}
              variant="outline"
              disabled={notifyParent.isPending}
            >
              {notifyParent.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              <Phone className="mr-2 h-4 w-4" />
              Notify Parent
            </Button>
          )}

          {isNotClearedOrClosed && (
            <Button onClick={() => setShowClearDialog(true)} variant="outline" className="border-green-300 text-green-700 hover:bg-green-50">
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Clear Student
            </Button>
          )}

          {healthCase.status === 'cleared' && (
            <Button
              onClick={handleCloseCase}
              disabled={closeCase.isPending}
            >
              {closeCase.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              <ShieldCheck className="mr-2 h-4 w-4" />
              Close Case
            </Button>
          )}
        </div>
      </div>

      {/* First Aid Dialog */}
      <Dialog open={showFirstAidDialog} onOpenChange={setShowFirstAidDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record First Aid</DialogTitle>
            <DialogDescription>
              Enter the first aid details provided to the student.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="dialog_first_aid_given">First Aid Given *</Label>
              <Textarea
                id="dialog_first_aid_given"
                placeholder="Describe the first aid administered..."
                value={firstAidGiven}
                onChange={(e) => setFirstAidGiven(e.target.value)}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dialog_first_aid_by">First Aid By</Label>
              <Input
                id="dialog_first_aid_by"
                placeholder="Name of person who gave first aid"
                value={firstAidBy}
                onChange={(e) => setFirstAidBy(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFirstAidDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleRecordFirstAid}
              disabled={recordFirstAid.isPending || !firstAidGiven.trim()}
            >
              {recordFirstAid.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Doctor Referral Dialog */}
      <Dialog open={showDoctorDialog} onOpenChange={setShowDoctorDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Refer to Doctor</DialogTitle>
            <DialogDescription>
              Enter the doctor details for the referral.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="dialog_doctor_name">Doctor Name *</Label>
              <Input
                id="dialog_doctor_name"
                placeholder="Enter doctor name"
                value={doctorName}
                onChange={(e) => setDoctorName(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDoctorDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleReferToDoctor}
              disabled={referToDoctor.isPending || !doctorName.trim()}
            >
              {referToDoctor.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Refer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hospitalize Dialog */}
      <Dialog open={showHospitalDialog} onOpenChange={setShowHospitalDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hospitalize Student</DialogTitle>
            <DialogDescription>
              Enter the hospital details where the student is being admitted.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="dialog_hospital_name">Hospital Name *</Label>
              <Input
                id="dialog_hospital_name"
                placeholder="Enter hospital name"
                value={hospitalName}
                onChange={(e) => setHospitalName(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowHospitalDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleHospitalize}
              disabled={hospitalizeStudent.isPending || !hospitalName.trim()}
            >
              {hospitalizeStudent.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clear Student Dialog */}
      <Dialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear Student</DialogTitle>
            <DialogDescription>
              Mark the student as recovered and cleared to return to normal activities.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="dialog_recovery_notes">Recovery Notes</Label>
              <Textarea
                id="dialog_recovery_notes"
                placeholder="Any notes about recovery, follow-up required, etc."
                value={recoveryNotes}
                onChange={(e) => setRecoveryNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClearDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleClearStudent}
              disabled={clearStudent.isPending}
            >
              {clearStudent.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Clear Student
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentLayout>
  )
}
