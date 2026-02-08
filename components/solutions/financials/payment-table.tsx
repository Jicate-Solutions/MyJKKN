'use client'

import { useState } from 'react'
import Link from 'next/link'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Search, Plus, MoreHorizontal, Flag, Check, ExternalLink, AlertTriangle } from 'lucide-react'
import { format } from 'date-fns'
import type { SHPaymentWithDetails, PaymentStatus, PaymentType } from '@/types/solutions'

interface PaymentTableProps {
  payments: SHPaymentWithDetails[]
  isLoading?: boolean
  error?: Error | null
  onFlag?: (id: string, reason: string) => void
  onMarkReceived?: (id: string) => void
}

function formatCurrency(amount: number | null): string {
  if (!amount) return '-'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

const statusColors: Record<PaymentStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  invoiced: 'bg-blue-100 text-blue-800',
  received: 'bg-green-100 text-green-800',
  overdue: 'bg-red-100 text-red-800',
  failed: 'bg-gray-100 text-gray-800',
  processing: 'bg-purple-100 text-purple-800',
  completed: 'bg-green-100 text-green-800',
  refunded: 'bg-orange-100 text-orange-800',
}

const paymentTypeLabels: Record<PaymentType, string> = {
  advance: 'Advance',
  milestone: 'Milestone',
  completion: 'Completion',
  mou_signing: 'MoU Signing',
  deployment: 'Deployment',
  acceptance: 'Acceptance',
  amc: 'AMC',
}

export function PaymentTable({ payments, isLoading, error, onFlag, onMarkReceived }: PaymentTableProps) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<PaymentStatus | 'all'>('all')
  const [typeFilter, setTypeFilter] = useState<PaymentType | 'all'>('all')

  const handleFlag = (id: string) => {
    const reason = prompt('Enter reason for flagging this payment:')
    if (reason && onFlag) {
      onFlag(id, reason)
    }
  }

  if (error) {
    return (
      <div className="text-center py-10 text-destructive">
        Error loading payments: {error.message}
      </div>
    )
  }

  // Filter payments
  const filteredPayments = payments?.filter((payment) => {
    // Status filter
    if (statusFilter !== 'all' && payment.status !== statusFilter) return false

    // Type filter
    if (typeFilter !== 'all' && payment.payment_type !== typeFilter) return false

    // Search filter
    if (!search) return true

    const solution =
      payment.phase?.solution ||
      payment.program?.solution ||
      payment.order?.solution

    const searchLower = search.toLowerCase()
    return (
      solution?.title?.toLowerCase().includes(searchLower) ||
      solution?.solution_code?.toLowerCase().includes(searchLower) ||
      payment.reference_number?.toLowerCase().includes(searchLower)
    )
  })

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search payments..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as PaymentStatus | 'all')}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="invoiced">Invoiced</SelectItem>
            <SelectItem value="received">Received</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={typeFilter}
          onValueChange={(v) => setTypeFilter(v as PaymentType | 'all')}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="advance">Advance</SelectItem>
            <SelectItem value="milestone">Milestone</SelectItem>
            <SelectItem value="completion">Completion</SelectItem>
            <SelectItem value="mou_signing">MoU Signing</SelectItem>
            <SelectItem value="deployment">Deployment</SelectItem>
            <SelectItem value="acceptance">Acceptance</SelectItem>
            <SelectItem value="amc">AMC</SelectItem>
          </SelectContent>
        </Select>

        <Button asChild>
          <Link href="/solutions/payments/new">
            <Plus className="h-4 w-4 mr-2" />
            Record Payment
          </Link>
        </Button>
      </div>

      {/* Table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Solution</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-5 w-[200px]" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-[80px]" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-[100px]" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-[80px]" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-[80px]" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-[100px]" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-[30px]" /></TableCell>
                </TableRow>
              ))
            ) : filteredPayments && filteredPayments.length > 0 ? (
              filteredPayments.map((payment) => {
                const solution =
                  payment.phase?.solution ||
                  payment.program?.solution ||
                  payment.order?.solution

                const isFlagged = payment.notes?.includes('[FLAGGED]')

                return (
                  <TableRow key={payment.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium flex items-center gap-2">
                          {solution?.title || 'Unknown'}
                          {isFlagged && (
                            <AlertTriangle className="h-4 w-4 text-yellow-600" />
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {solution?.solution_code || '-'}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {payment.payment_type
                          ? paymentTypeLabels[payment.payment_type]
                          : '-'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(payment.amount)}
                    </TableCell>
                    <TableCell>
                      <Badge className={statusColors[payment.status]}>
                        {payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {payment.due_date
                        ? format(new Date(payment.due_date), 'dd MMM yyyy')
                        : '-'}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {payment.reference_number || '-'}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/solutions/payments/${payment.id}`}>
                              <ExternalLink className="h-4 w-4 mr-2" />
                              View Details
                            </Link>
                          </DropdownMenuItem>
                          {payment.status === 'pending' && onMarkReceived && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => onMarkReceived(payment.id)}
                              >
                                <Check className="h-4 w-4 mr-2" />
                                Mark as Received
                              </DropdownMenuItem>
                              {onFlag && (
                                <DropdownMenuItem
                                  onClick={() => handleFlag(payment.id)}
                                >
                                  <Flag className="h-4 w-4 mr-2" />
                                  Flag for MD Review
                                </DropdownMenuItem>
                              )}
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                  No payments found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
