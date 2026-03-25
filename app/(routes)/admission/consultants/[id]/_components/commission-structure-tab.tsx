'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ConsultantService } from '@/lib/services/admission/consultant-service'
import { useAuth } from '@/hooks/use-auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, MoreHorizontal, Edit, Power, AlertCircle, Percent, DollarSign, BarChart3, Flag } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import type { ConsultantCommissionStructure } from '@/types/education-consultants'

const COMMISSION_TYPES = [
  { value: 'percentage', label: 'Percentage', icon: Percent, description: 'Earn a % of the student fee' },
  { value: 'flat', label: 'Flat Amount', icon: DollarSign, description: 'Earn a fixed amount per referral' },
  { value: 'tiered', label: 'Volume Tiered', icon: BarChart3, description: 'Rate increases with referral volume' },
  { value: 'milestone', label: 'Milestone', icon: Flag, description: 'Different rate per admission stage' },
]

function getTypeBadgeColor(type: string) {
  const colors: Record<string, string> = {
    percentage: 'bg-blue-100 text-blue-800',
    flat: 'bg-green-100 text-green-800',
    tiered: 'bg-purple-100 text-purple-800',
    milestone: 'bg-orange-100 text-orange-800',
  }
  return colors[type] || 'bg-gray-100 text-gray-800'
}

function formatRate(structure: ConsultantCommissionStructure): string {
  const s = structure as any
  if (s.commission_type === 'flat') {
    return s.base_amount != null
      ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(s.base_amount)
      : '—'
  }
  if (s.commission_type === 'percentage' || s.commission_type === 'tiered') {
    return s.base_rate != null ? `${s.base_rate}%` : '—'
  }
  if (s.commission_type === 'milestone') {
    const milestones = s.milestones as any[]
    return milestones?.length ? `${milestones.length} milestone${milestones.length > 1 ? 's' : ''}` : '—'
  }
  return '—'
}

function EmptyStructures({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="text-center py-12">
      <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
      <h3 className="text-lg font-medium mb-2">No Commission Structures</h3>
      <p className="text-muted-foreground text-sm mb-6 max-w-sm mx-auto">
        Define how this consultant earns commissions. Without a structure, no commissions can be calculated.
      </p>
      <Button onClick={onAdd}>
        <Plus className="h-4 w-4 mr-2" />
        Add Commission Structure
      </Button>
    </div>
  )
}

function getDefaultFormValues() {
  return {
    name: '',
    commission_type: 'percentage',
    base_rate: '',
    base_amount: '',
    effective_from: new Date().toISOString().split('T')[0],
    effective_to: '',
    is_active: true,
    description: '',
    clawback_enabled: false,
    clawback_period_days: '',
    clawback_percentage: '',
  }
}

interface StructureDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  consultantId: string
  institutionId: string
  editing: ConsultantCommissionStructure | null
  onSuccess: () => void
}

function StructureDialog({ open, onOpenChange, consultantId, institutionId, editing, onSuccess }: StructureDialogProps) {
  const { profile } = useAuth()
  const [form, setForm] = useState(getDefaultFormValues)
  const [submitting, setSubmitting] = useState(false)

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setForm(
        editing
          ? {
              name: (editing as any).name || '',
              commission_type: (editing as any).commission_type || 'percentage',
              base_rate: (editing as any).base_rate?.toString() || '',
              base_amount: (editing as any).base_amount?.toString() || '',
              effective_from: (editing as any).effective_from || new Date().toISOString().split('T')[0],
              effective_to: (editing as any).effective_to || '',
              is_active: (editing as any).is_active ?? true,
              description: (editing as any).description || '',
              clawback_enabled: (editing as any).clawback_enabled ?? false,
              clawback_period_days: (editing as any).clawback_period_days?.toString() || '',
              clawback_percentage: (editing as any).clawback_percentage?.toString() || '',
            }
          : getDefaultFormValues()
      )
    }
    onOpenChange(isOpen)
  }

  const set = (key: string, value: any) => setForm(prev => ({ ...prev, [key]: value }))

  const handleSubmit = async () => {
    if (!form.name.trim()) { toast.error('Structure name is required'); return }
    if (!form.effective_from) { toast.error('Effective from date is required'); return }
    if ((form.commission_type === 'percentage' || form.commission_type === 'tiered') && !form.base_rate) {
      toast.error('Base rate is required for this commission type'); return
    }
    if (form.commission_type === 'flat' && !form.base_amount) {
      toast.error('Base amount is required for flat commission'); return
    }

    setSubmitting(true)
    try {
      const payload: Record<string, any> = {
        name: form.name.trim(),
        commission_type: form.commission_type,
        effective_from: form.effective_from,
        effective_to: form.effective_to || null,
        is_active: form.is_active,
        description: form.description || null,
        milestones: [],
        clawback_enabled: form.clawback_enabled,
        clawback_period_days: form.clawback_enabled && form.clawback_period_days ? parseInt(form.clawback_period_days) : null,
        clawback_percentage: form.clawback_enabled && form.clawback_percentage ? parseFloat(form.clawback_percentage) : null,
      }

      if (form.commission_type === 'percentage' || form.commission_type === 'tiered') {
        const rate = parseFloat(form.base_rate)
        if (Number.isNaN(rate) || rate < 0 || rate > 100) {
          toast.error('Base rate must be a number between 0 and 100')
          setSubmitting(false)
          return
        }
        payload.base_rate = rate
        payload.base_amount = null
      } else if (form.commission_type === 'flat') {
        const amount = parseFloat(form.base_amount)
        if (Number.isNaN(amount) || amount < 0) {
          toast.error('Base amount must be a valid positive number')
          setSubmitting(false)
          return
        }
        payload.base_amount = amount
        payload.base_rate = null
      }

      if (editing) {
        await ConsultantService.updateCommissionStructure(editing.id, payload as any)
        toast.success('Commission structure updated')
      } else {
        payload.institution_id = institutionId
        payload.consultant_id = consultantId
        payload.created_by = profile?.id || null
        await ConsultantService.createCommissionStructure(payload as any)
        toast.success('Commission structure created')
      }

      onSuccess()
      onOpenChange(false)
    } catch (err: any) {
      toast.error(err.message || 'Failed to save commission structure')
    } finally {
      setSubmitting(false)
    }
  }

  const isPercentageOrTiered = form.commission_type === 'percentage' || form.commission_type === 'tiered'
  const isFlat = form.commission_type === 'flat'

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Commission Structure' : 'Add Commission Structure'}</DialogTitle>
          <DialogDescription>
            Define how this consultant earns commissions for referrals.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Structure Name *</Label>
            <Input
              placeholder="e.g. Standard 5% Commission"
              value={form.name}
              onChange={e => set('name', e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Commission Type *</Label>
            <Select value={form.commission_type} onValueChange={v => set('commission_type', v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COMMISSION_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value}>
                    <div>
                      <div className="font-medium">{t.label}</div>
                      <div className="text-xs text-muted-foreground">{t.description}</div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isPercentageOrTiered && (
            <div className="space-y-1.5">
              <Label>Base Rate (%) *</Label>
              <div className="relative">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  placeholder="5.0"
                  value={form.base_rate}
                  onChange={e => set('base_rate', e.target.value)}
                  className="pr-8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
              </div>
              {form.commission_type === 'tiered' && (
                <p className="text-xs text-muted-foreground">
                  This is the base rate. Volume tier escalation can be configured later.
                </p>
              )}
            </div>
          )}

          {isFlat && (
            <div className="space-y-1.5">
              <Label>Flat Amount (₹) *</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₹</span>
                <Input
                  type="number"
                  min="0"
                  step="100"
                  placeholder="2000"
                  value={form.base_amount}
                  onChange={e => set('base_amount', e.target.value)}
                  className="pl-7"
                />
              </div>
            </div>
          )}

          {form.commission_type === 'milestone' && (
            <div className="rounded-md border p-3 bg-muted/40 space-y-1">
              <p className="text-sm font-medium">Milestone-based commission</p>
              <p className="text-xs text-muted-foreground">
                Milestone rates are configured per admission stage after creating the structure. Set the name and validity dates first, then save.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Effective From *</Label>
              <Input
                type="date"
                value={form.effective_from}
                onChange={e => set('effective_from', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Effective To</Label>
              <Input
                type="date"
                value={form.effective_to}
                onChange={e => set('effective_to', e.target.value)}
                min={form.effective_from}
              />
              <p className="text-xs text-muted-foreground">Leave blank for no end date</p>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <div>
              <p className="text-sm font-medium">Active</p>
              <p className="text-xs text-muted-foreground">Only active structures are used for commission calculation</p>
            </div>
            <Switch
              checked={form.is_active}
              onCheckedChange={v => set('is_active', v)}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <div>
                <p className="text-sm font-medium">Enable Clawback</p>
                <p className="text-xs text-muted-foreground">Recover commission if student drops within a period</p>
              </div>
              <Switch
                checked={form.clawback_enabled}
                onCheckedChange={v => set('clawback_enabled', v)}
              />
            </div>

            {form.clawback_enabled && (
              <div className="grid grid-cols-2 gap-3 pl-2 border-l-2 border-orange-200">
                <div className="space-y-1.5">
                  <Label className="text-xs">Clawback Period (days)</Label>
                  <Input
                    type="number"
                    min="1"
                    placeholder="60"
                    value={form.clawback_period_days}
                    onChange={e => set('clawback_period_days', e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Clawback % to Recover</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    placeholder="100"
                    value={form.clawback_percentage}
                    onChange={e => set('clawback_percentage', e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Description / Notes</Label>
            <Textarea
              placeholder="Internal notes about this commission structure..."
              rows={2}
              value={form.description}
              onChange={e => set('description', e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Saving…' : editing ? 'Update Structure' : 'Create Structure'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface CommissionStructureTabProps {
  consultantId: string
  institutionId: string
}

export function CommissionStructureTab({ consultantId, institutionId }: CommissionStructureTabProps) {
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ConsultantCommissionStructure | null>(null)

  const { data: structures, isLoading } = useQuery({
    queryKey: ['commission-structures', consultantId],
    queryFn: () => ConsultantService.getCommissionStructures(consultantId),
    enabled: !!consultantId,
  })

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      ConsultantService.updateCommissionStructure(id, { is_active } as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commission-structures', consultantId] })
      toast.success('Status updated')
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to update status'),
  })

  const handleOpenCreate = () => {
    setEditing(null)
    setDialogOpen(true)
  }

  const handleOpenEdit = (s: ConsultantCommissionStructure) => {
    setEditing(s)
    setDialogOpen(true)
  }

  const handleSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['commission-structures', consultantId] })
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map(i => <Skeleton key={i} className="h-16 w-full" />)}
      </div>
    )
  }

  const list = structures || []

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Commission Structures</CardTitle>
            <CardDescription>Define how this consultant earns commissions per referral</CardDescription>
          </div>
          <Button size="sm" onClick={handleOpenCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Add Structure
          </Button>
        </CardHeader>
        <CardContent>
          {list.length === 0 ? (
            <EmptyStructures onAdd={handleOpenCreate} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Rate / Amount</TableHead>
                  <TableHead>Effective From</TableHead>
                  <TableHead>Effective To</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map(s => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">
                      {(s as any).name}
                      {(s as any).clawback_enabled && (
                        <span className="ml-1.5 text-xs text-orange-600 font-normal">(clawback)</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={getTypeBadgeColor((s as any).commission_type)}>
                        {(s as any).commission_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{formatRate(s)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {(s as any).effective_from
                        ? format(new Date((s as any).effective_from), 'dd MMM yyyy')
                        : '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {(s as any).effective_to
                        ? format(new Date((s as any).effective_to), 'dd MMM yyyy')
                        : <span className="text-muted-foreground/60 italic">No end date</span>}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={
                          (s as any).is_active
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-500'
                        }
                      >
                        {(s as any).is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleOpenEdit(s)}>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              toggleActiveMutation.mutate({
                                id: s.id,
                                is_active: !(s as any).is_active,
                              })
                            }
                          >
                            <Power className="h-4 w-4 mr-2" />
                            {(s as any).is_active ? 'Deactivate' : 'Activate'}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {list.length > 0 && !list.some(s => (s as any).is_active) && (
        <div className="flex items-start gap-3 rounded-md border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <p>
            No active commission structure. Commission cannot be calculated until at least one structure is active.
          </p>
        </div>
      )}

      <StructureDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        consultantId={consultantId}
        institutionId={institutionId}
        editing={editing}
        onSuccess={handleSuccess}
      />
    </>
  )
}
