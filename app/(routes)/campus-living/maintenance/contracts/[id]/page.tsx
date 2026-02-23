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
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  Loader2,
  FileText,
  User,
  Phone,
  Mail,
  IndianRupee,
  CalendarDays,
  Wrench,
  Edit,
  Save,
  X,
} from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import {
  useAmcContract,
  useUpdateAmcContract,
  useRenewAmcContract,
} from '@/hooks/campus-living/use-amc-contracts'
import type { HostelAmcContract } from '@/types/campus-living'

const CATEGORY_LABELS: Record<string, string> = {
  electrical: 'Electrical',
  plumbing: 'Plumbing',
  civil: 'Civil',
  pest_control: 'Pest Control',
  cleaning: 'Cleaning',
  internet: 'Internet',
  water_supply: 'Water Supply',
  furniture: 'Furniture',
  safety: 'Safety',
  other: 'Other',
}

const FREQUENCY_LABELS: Record<string, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  biweekly: 'Bi-Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  half_yearly: 'Half Yearly',
  yearly: 'Yearly',
}

interface AmcContractDetailPageProps {
  params: Promise<{ id: string }>
}

export default function AmcContractDetailPage({ params }: AmcContractDetailPageProps) {
  const { id } = use(params)
  const { profile } = useAuth()

  const { data: contract, isLoading } = useAmcContract(id)
  const updateMutation = useUpdateAmcContract()
  const renewMutation = useRenewAmcContract()

  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState<Partial<HostelAmcContract>>({})
  const [renewDialogOpen, setRenewDialogOpen] = useState(false)
  const [renewEndDate, setRenewEndDate] = useState('')
  const [renewCost, setRenewCost] = useState('')

  if (isLoading || !contract) {
    return (
      <ContentLayout title="AMC Contract">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ContentLayout>
    )
  }

  const c = contract as HostelAmcContract

  const todayStr = new Date().toISOString().split('T')[0]
  const thirtyDaysFromNow = new Date()
  thirtyDaysFromNow.setDate(new Date().getDate() + 30)
  const thirtyDaysStr = thirtyDaysFromNow.toISOString().split('T')[0]

  const getDisplayStatus = (): string => {
    if (c.status === 'cancelled') return 'cancelled'
    if (c.status === 'renewed') return 'renewed'
    if (c.end_date < todayStr) return 'expired'
    if (c.end_date <= thirtyDaysStr) return 'expiring_soon'
    return c.status
  }

  const displayStatus = getDisplayStatus()

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100"><CheckCircle2 className="mr-1 h-3 w-3" />Active</Badge>
      case 'expiring_soon':
        return <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100"><Clock className="mr-1 h-3 w-3" />Expiring Soon</Badge>
      case 'expired':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100"><XCircle className="mr-1 h-3 w-3" />Expired</Badge>
      case 'renewed':
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100"><RefreshCw className="mr-1 h-3 w-3" />Renewed</Badge>
      case 'cancelled':
        return <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-100">Cancelled</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const startEditing = () => {
    setEditForm({
      title: c.title,
      vendor_name: c.vendor_name,
      vendor_phone: c.vendor_phone,
      vendor_email: c.vendor_email,
      coverage_details: c.coverage_details,
      notes: c.notes,
    })
    setIsEditing(true)
  }

  const cancelEditing = () => {
    setEditForm({})
    setIsEditing(false)
  }

  const handleSaveEdit = async () => {
    await updateMutation.mutateAsync({ id, payload: editForm })
    setIsEditing(false)
    setEditForm({})
  }

  const handleRenew = async () => {
    if (!renewEndDate) return
    await renewMutation.mutateAsync({
      id,
      newEndDate: renewEndDate,
      newCost: renewCost ? Number(renewCost) : undefined,
    })
    setRenewDialogOpen(false)
    setRenewEndDate('')
    setRenewCost('')
  }

  // Calculate days remaining
  const endDate = new Date(c.end_date + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const daysRemaining = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  return (
    <ContentLayout title={c.title}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/campus-living/maintenance/contracts">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold">{c.title}</h1>
              {c.contract_number && (
                <p className="text-muted-foreground">Contract #{c.contract_number}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {getStatusBadge(displayStatus)}
            {!isEditing && c.status !== 'cancelled' && (
              <Button variant="outline" size="sm" onClick={startEditing}>
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </Button>
            )}
            {(displayStatus === 'active' || displayStatus === 'expiring_soon' || displayStatus === 'expired') && (
              <Dialog open={renewDialogOpen} onOpenChange={setRenewDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Renew
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Renew Contract</DialogTitle>
                    <DialogDescription>
                      Extend this AMC contract with a new end date and optionally update the annual cost.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="renew_end_date">New End Date *</Label>
                      <Input
                        id="renew_end_date"
                        type="date"
                        value={renewEndDate}
                        onChange={(e) => setRenewEndDate(e.target.value)}
                        min={todayStr}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="renew_cost">New Annual Cost (INR)</Label>
                      <Input
                        id="renew_cost"
                        type="number"
                        min={0}
                        step={0.01}
                        value={renewCost}
                        onChange={(e) => setRenewCost(e.target.value)}
                        placeholder={c.annual_cost ? String(c.annual_cost) : '0.00'}
                      />
                      <p className="text-xs text-muted-foreground">Leave blank to keep current cost</p>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setRenewDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleRenew} disabled={!renewEndDate || renewMutation.isPending}>
                      {renewMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="mr-2 h-4 w-4" />
                      )}
                      {renewMutation.isPending ? 'Renewing...' : 'Renew Contract'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>

        {/* Two-column layout */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Contract Details */}
            <Card>
              <CardHeader>
                <CardTitle>Contract Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {isEditing ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2 space-y-2">
                      <Label>Title</Label>
                      <Input
                        value={editForm.title || ''}
                        onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                      />
                    </div>
                    <div className="sm:col-span-2 space-y-2">
                      <Label>Coverage Details</Label>
                      <Textarea
                        value={editForm.coverage_details || ''}
                        onChange={(e) => setEditForm({ ...editForm, coverage_details: e.target.value })}
                        rows={4}
                      />
                    </div>
                    <div className="sm:col-span-2 space-y-2">
                      <Label>Notes</Label>
                      <Textarea
                        value={editForm.notes || ''}
                        onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                        rows={3}
                      />
                    </div>
                    <div className="sm:col-span-2 flex gap-2 justify-end">
                      <Button variant="outline" size="sm" onClick={cancelEditing}>
                        <X className="mr-2 h-4 w-4" />
                        Cancel
                      </Button>
                      <Button size="sm" onClick={handleSaveEdit} disabled={updateMutation.isPending}>
                        {updateMutation.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="mr-2 h-4 w-4" />
                        )}
                        Save Changes
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="flex items-center gap-2">
                      <Wrench className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Category</p>
                        <p className="font-medium">{CATEGORY_LABELS[c.category] || c.category?.replace('_', ' ')}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Contract Number</p>
                        <p className="font-medium">{c.contract_number || '-'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Start Date</p>
                        <p className="font-medium">{new Date(c.start_date + 'T00:00:00').toLocaleDateString()}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">End Date</p>
                        <p className={`font-medium ${displayStatus === 'expired' ? 'text-red-600' : displayStatus === 'expiring_soon' ? 'text-orange-600' : ''}`}>
                          {new Date(c.end_date + 'T00:00:00').toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <IndianRupee className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Annual Cost</p>
                        <p className="font-medium">
                          {c.annual_cost
                            ? Number(c.annual_cost).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
                            : '-'}
                        </p>
                      </div>
                    </div>
                    {c.service_frequency && (
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm text-muted-foreground">Service Frequency</p>
                          <p className="font-medium">{FREQUENCY_LABELS[c.service_frequency] || c.service_frequency}</p>
                        </div>
                      </div>
                    )}
                    {c.last_service_date && (
                      <div className="flex items-center gap-2">
                        <CalendarDays className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm text-muted-foreground">Last Service</p>
                          <p className="font-medium">{new Date(c.last_service_date + 'T00:00:00').toLocaleDateString()}</p>
                        </div>
                      </div>
                    )}
                    {c.next_service_date && (
                      <div className="flex items-center gap-2">
                        <CalendarDays className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm text-muted-foreground">Next Service</p>
                          <p className="font-medium">{new Date(c.next_service_date + 'T00:00:00').toLocaleDateString()}</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Vendor Information */}
            <Card>
              <CardHeader>
                <CardTitle>Vendor Information</CardTitle>
              </CardHeader>
              <CardContent>
                {isEditing ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2 space-y-2">
                      <Label>Vendor Name</Label>
                      <Input
                        value={editForm.vendor_name || ''}
                        onChange={(e) => setEditForm({ ...editForm, vendor_name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Phone</Label>
                      <Input
                        value={editForm.vendor_phone || ''}
                        onChange={(e) => setEditForm({ ...editForm, vendor_phone: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input
                        type="email"
                        value={editForm.vendor_email || ''}
                        onChange={(e) => setEditForm({ ...editForm, vendor_email: e.target.value })}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Vendor Name</p>
                        <p className="font-medium">{c.vendor_name}</p>
                      </div>
                    </div>
                    {c.vendor_phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm text-muted-foreground">Phone</p>
                          <p className="font-medium">{c.vendor_phone}</p>
                        </div>
                      </div>
                    )}
                    {c.vendor_email && (
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm text-muted-foreground">Email</p>
                          <p className="font-medium">{c.vendor_email}</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Coverage Details */}
            {(c.coverage_details || c.notes) && !isEditing && (
              <Card>
                <CardHeader>
                  <CardTitle>Coverage & Notes</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {c.coverage_details && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Coverage Details</p>
                      <p className="whitespace-pre-wrap">{c.coverage_details}</p>
                    </div>
                  )}
                  {c.notes && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Notes</p>
                      <p className="whitespace-pre-wrap">{c.notes}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right column - Sidebar */}
          <div className="space-y-6">
            {/* Status & Timeline */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Status & Timeline</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Current Status</span>
                  {getStatusBadge(displayStatus)}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Days Remaining</p>
                  <p className={`text-xl font-bold ${daysRemaining < 0 ? 'text-red-600' : daysRemaining <= 30 ? 'text-orange-600' : 'text-green-600'}`}>
                    {daysRemaining < 0
                      ? `${Math.abs(daysRemaining)} days overdue`
                      : `${daysRemaining} days`}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Renewal Reminder</p>
                  <p className="text-sm font-medium">{c.renewal_reminder_days} days before expiry</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Created</p>
                  <p className="text-sm font-medium">
                    {c.created_at ? new Date(c.created_at).toLocaleDateString() : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Last Updated</p>
                  <p className="text-sm font-medium">
                    {c.updated_at ? new Date(c.updated_at).toLocaleDateString() : '-'}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Quick Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Quick Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-xs text-muted-foreground">Category</p>
                  <Badge variant="outline" className="capitalize mt-1">
                    {CATEGORY_LABELS[c.category] || c.category?.replace('_', ' ')}
                  </Badge>
                </div>
                {c.service_frequency && (
                  <div>
                    <p className="text-xs text-muted-foreground">Service Frequency</p>
                    <p className="text-sm font-medium">{FREQUENCY_LABELS[c.service_frequency] || c.service_frequency}</p>
                  </div>
                )}
                {c.block_name && (
                  <div>
                    <p className="text-xs text-muted-foreground">Block</p>
                    <p className="text-sm font-medium">{c.block_name}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-muted-foreground">Annual Cost</p>
                  <p className="text-sm font-medium">
                    {c.annual_cost
                      ? Number(c.annual_cost).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
                      : '-'}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </ContentLayout>
  )
}
