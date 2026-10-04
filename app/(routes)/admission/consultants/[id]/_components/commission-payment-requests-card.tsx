'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { ExternalLink, Send, Settings } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { usePermissions } from '@/hooks/use-permissions'
import { formatCurrency } from '@/lib/utils'
import {
  useCommissionPaymentCapabilities,
  useCommissionPaymentRequests,
} from '@/hooks/admission/use-commission-payments'
import type { CommissionPaymentRequest } from '@/types/consultant-commission-payment'
import type { ConsultantFirstYearFeeCollection } from '@/types/education-consultants'
import { CommissionPaymentInitiateDialog } from './commission-payment-initiate-dialog'

function rupees(value: number): string {
  return formatCurrency(value, { showDecimals: false, minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function StatusBadge({ status }: { status: CommissionPaymentRequest['status'] }) {
  switch (status) {
    case 'disbursed':
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Paid</Badge>
    case 'declined':
      return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Declined</Badge>
    case 'pending_disbursement':
      return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Pending Disbursement</Badge>
    default:
      return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Pending Review</Badge>
  }
}

function currentStep(r: CommissionPaymentRequest): string {
  if (r.status === 'pending_review') return r.flow_snapshot.stages[r.current_stage_index]?.name ?? '—'
  if (r.status === 'pending_disbursement') return 'Disbursement'
  return '—'
}

interface CommissionPaymentRequestsCardProps {
  consultantId: string
  consultantName: string
  year: number
  yearLabel: string
  feeCollection: ConsultantFirstYearFeeCollection[]
}

/**
 * Commission payment requests for one consultant and admission year, and the
 * button that starts one. Sits under the 1st Year Fee Collection table so the
 * person raising a payment sees how much of the learners' fees has come in.
 */
export function CommissionPaymentRequestsCard({
  consultantId,
  consultantName,
  year,
  yearLabel,
  feeCollection,
}: CommissionPaymentRequestsCardProps) {
  const router = useRouter()
  const { can } = usePermissions()
  const canConfigure = can('admission.consultants.commissions.configure')
  const { data: caps } = useCommissionPaymentCapabilities()
  const { data: result, isLoading } = useCommissionPaymentRequests({
    consultant_id: consultantId,
    academic_year: year,
    limit: 50,
  })
  const [open, setOpen] = useState(false)
  const [dialogKey, setDialogKey] = useState(0)

  const requests = result?.data ?? []

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle className="text-base">Commission Payment Requests</CardTitle>
          <CardDescription>
            Payments for {yearLabel} raised for approval. Each is added to Payment History once disbursed.
          </CardDescription>
        </div>
        {caps?.can_initiate && (
          <Button
            size="sm"
            onClick={() => {
              setDialogKey(k => k + 1)
              setOpen(true)
            }}
          >
            <Send className="h-4 w-4 mr-2" />
            Initiate Payment
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {caps && !caps.configured && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
            <span>No commission approval flow is set up yet, so payments cannot be initiated.</span>
            {canConfigure && (
              <Button variant="outline" size="sm" asChild>
                <Link href="/admission/consultants/commission-approvals">
                  <Settings className="h-4 w-4 mr-2" />
                  Set up approvals
                </Link>
              </Button>
            )}
          </div>
        )}

        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : !requests.length ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No payment requests for {yearLabel}.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Request #</th>
                  <th className="px-3 py-2 text-left font-medium">Institutions</th>
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-left font-medium">Current Step</th>
                  <th className="px-3 py-2 text-left font-medium">Initiated</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {requests.map(r => (
                  <tr key={r.id} className="border-t">
                    <td className="px-3 py-2 font-medium whitespace-nowrap">{r.request_number}</td>
                    <td className="px-3 py-2">
                      <span className="line-clamp-1 max-w-[240px]">
                        {(r.lines ?? []).map(l => l.group?.name ?? '—').join(', ')}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{rupees(r.total_amount)}</td>
                    <td className="px-3 py-2">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-3 py-2">{currentStep(r)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {format(new Date(r.initiated_at), 'dd MMM yyyy')}
                      {r.initiator?.full_name && (
                        <span className="block text-xs text-muted-foreground">{r.initiator.full_name}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/admission/consultants/commission-payments/${r.id}`}>
                          View
                          <ExternalLink className="h-3.5 w-3.5 ml-1" />
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      {open && (
        <CommissionPaymentInitiateDialog
          key={dialogKey}
          open={open}
          onOpenChange={setOpen}
          consultantId={consultantId}
          consultantName={consultantName}
          year={year}
          yearLabel={yearLabel}
          feeCollection={feeCollection}
          onInitiated={id => router.push(`/admission/consultants/commission-payments/${id}`)}
        />
      )}
    </Card>
  )
}
