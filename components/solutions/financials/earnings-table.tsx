'use client'

import { useState } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { CheckCircle, DollarSign } from 'lucide-react'
import { format } from 'date-fns'
import type { SHEarningsLedger, EarningsStatus, RecipientType } from '@/types/solutions'

interface EarningsTableProps {
  earnings: SHEarningsLedger[]
  isLoading?: boolean
  error?: Error | null
  onBulkApprove?: (ids: string[]) => Promise<number>
  onBulkPay?: (ids: string[]) => Promise<number>
}

function formatCurrency(amount: number | null): string {
  if (!amount) return '-'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

const statusColors: Record<EarningsStatus, string> = {
  calculated: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-blue-100 text-blue-800',
  paid: 'bg-green-100 text-green-800',
}

const recipientTypeLabels: Record<RecipientType, string> = {
  builder: 'Builder',
  cohort_member: 'Cohort Member',
  production_learner: 'Production Learner',
  department: 'Department',
  jicate: 'JICATE',
  institution: 'Institution',
  council: 'Council',
  infrastructure: 'Infrastructure',
  referral_bonus: 'Referral Bonus',
}

export function EarningsTable({ earnings, isLoading, error, onBulkApprove, onBulkPay }: EarningsTableProps) {
  const [statusFilter, setStatusFilter] = useState<EarningsStatus | 'all'>('all')
  const [recipientFilter, setRecipientFilter] = useState<RecipientType | 'all'>('all')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [isProcessing, setIsProcessing] = useState(false)

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(filteredEarnings?.map((e) => e.id) || [])
    } else {
      setSelectedIds([])
    }
  }

  const handleSelect = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedIds([...selectedIds, id])
    } else {
      setSelectedIds(selectedIds.filter((i) => i !== id))
    }
  }

  const handleBulkApprove = async () => {
    if (selectedIds.length === 0 || !onBulkApprove) return
    setIsProcessing(true)
    try {
      await onBulkApprove(selectedIds)
      setSelectedIds([])
    } finally {
      setIsProcessing(false)
    }
  }

  const handleBulkPay = async () => {
    if (selectedIds.length === 0 || !onBulkPay) return
    setIsProcessing(true)
    try {
      await onBulkPay(selectedIds)
      setSelectedIds([])
    } finally {
      setIsProcessing(false)
    }
  }

  if (error) {
    return (
      <div className="text-center py-10 text-destructive">
        Error loading earnings: {error.message}
      </div>
    )
  }

  // Filter earnings
  const filteredEarnings = earnings?.filter((earning) => {
    if (statusFilter !== 'all' && earning.status !== statusFilter) return false
    if (recipientFilter !== 'all' && earning.recipient_type !== recipientFilter) return false
    return true
  })

  const selectedEarnings = filteredEarnings?.filter((e) => selectedIds.includes(e.id)) || []
  const canApprove = selectedEarnings.some((e) => e.status === 'calculated')
  const canPay = selectedEarnings.some((e) => e.status === 'approved')

  return (
    <div className="space-y-4">
      {/* Filters and Actions */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="flex gap-4">
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as EarningsStatus | 'all')}
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="calculated">Calculated</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={recipientFilter}
            onValueChange={(v) => setRecipientFilter(v as RecipientType | 'all')}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Recipient Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Recipients</SelectItem>
              <SelectItem value="builder">Builder</SelectItem>
              <SelectItem value="cohort_member">Cohort Member</SelectItem>
              <SelectItem value="production_learner">Production Learner</SelectItem>
              <SelectItem value="department">Department</SelectItem>
              <SelectItem value="jicate">JICATE</SelectItem>
              <SelectItem value="institution">Institution</SelectItem>
              <SelectItem value="council">Council</SelectItem>
              <SelectItem value="infrastructure">Infrastructure</SelectItem>
              <SelectItem value="referral_bonus">Referral Bonus</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {selectedIds.length > 0 && (
          <div className="flex gap-2">
            <span className="text-sm text-muted-foreground self-center">
              {selectedIds.length} selected
            </span>
            {canApprove && onBulkApprove && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleBulkApprove}
                disabled={isProcessing}
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Approve
              </Button>
            )}
            {canPay && onBulkPay && (
              <Button
                size="sm"
                onClick={handleBulkPay}
                disabled={isProcessing}
              >
                <DollarSign className="h-4 w-4 mr-2" />
                Mark Paid
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]">
                <Checkbox
                  checked={
                    filteredEarnings &&
                    filteredEarnings.length > 0 &&
                    selectedIds.length === filteredEarnings.length
                  }
                  onCheckedChange={handleSelectAll}
                />
              </TableHead>
              <TableHead>Recipient</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Solution</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">%</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-[150px]" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-[100px]" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-[150px]" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-[80px]" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-[50px]" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-[80px]" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-[80px]" /></TableCell>
                </TableRow>
              ))
            ) : filteredEarnings && filteredEarnings.length > 0 ? (
              filteredEarnings.map((earning) => {
                const solution =
                  earning.payment?.phase?.solution ||
                  earning.payment?.program?.solution ||
                  earning.payment?.order?.solution

                return (
                  <TableRow key={earning.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.includes(earning.id)}
                        onCheckedChange={(checked) =>
                          handleSelect(earning.id, checked as boolean)
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">
                        {earning.recipient_name || '-'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {earning.recipient_type
                          ? recipientTypeLabels[earning.recipient_type as RecipientType]
                          : '-'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{solution?.title || '-'}</div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {solution?.solution_code || '-'}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(earning.amount)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {earning.percentage ? `${earning.percentage}%` : '-'}
                    </TableCell>
                    <TableCell>
                      <Badge className={statusColors[earning.status as EarningsStatus]}>
                        {earning.status.charAt(0).toUpperCase() +
                          earning.status.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {earning.created_at
                        ? format(new Date(earning.created_at), 'dd MMM yyyy')
                        : '-'}
                    </TableCell>
                  </TableRow>
                )
              })
            ) : (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                  No earnings found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
