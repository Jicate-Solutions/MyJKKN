'use client'

import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { format } from 'date-fns'
import { ConsultantService } from '@/lib/services/admission/consultant-service'
import { usePermissions } from '@/hooks/use-permissions'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { DataTable } from '@/components/ui/data-table'
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  AlertTriangle,
  Download,
  Edit,
  FileText,
  HandCoins,
  IndianRupee,
  MoreHorizontal,
  SlidersHorizontal,
  Plus,
  Trash2,
  Undo2,
  Users,
  Wallet,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils'
import { downloadCsv } from '@/lib/utils/csv-export'
import type {
  ConsultantRateCardEarning,
  RateCardPayment,
  RateCardPaymentEntryType,
} from '@/types/education-consultants'
import { RateCardPaymentDialog, type PaymentDialogState } from './rate-card-payment-dialog'
import { RateCardLadderDialog, type LadderDialogState } from './rate-card-ladder-dialog'
import { RateCardAdvanceDialog } from './rate-card-advance-dialog'

function rupees(value: number | null | undefined): string {
  return formatCurrency(value, { showDecimals: false, minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

/** Share of `whole` as "42.5%"; a dash when nothing is billed yet. */
function percent(part: number, whole: number): string {
  return whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : '—'
}

/** 2026 → "2026-2027", the way admission years are named everywhere else. */
function yearLabel(year: number): string {
  return `${year}-${year + 1}`
}

/** Right-aligned money cell; zero renders as a muted dash so real amounts stand out. */
function MoneyCell({ value, className = '' }: { value: number | null | undefined; className?: string }) {
  return value ? (
    <div className={`text-right tabular-nums ${className}`}>{rupees(value)}</div>
  ) : (
    <div className="text-right text-muted-foreground">—</div>
  )
}

type StatusFilter = 'all' | 'earned' | 'balance' | 'excess' | 'settled'

/** One label per row, in the order that matters most: money owed back first. */
function rowStatus(r: ConsultantRateCardEarning): Exclude<StatusFilter, 'all'> | 'none' {
  if (r.excess_amount > 0) return 'excess'
  if (r.balance_amount > 0) return 'balance'
  if ((r.total_amount ?? 0) > 0) return 'settled'
  return 'none'
}

interface RateCardPanelProps {
  consultantId: string
}

export function RateCardPanel({ consultantId }: RateCardPanelProps) {
  const queryClient = useQueryClient()
  const { can, isSuperAdmin, userProfile } = usePermissions()
  // RLS is the real gate; this only hides buttons that would be refused.
  const canManage = can('admission.consultants.commissions.manage')
  // Recording a payment is 'manage'. CHANGING A RATE is admin-only at the
  // database (the slabs table's write policy), so the UI gates it the same way —
  // otherwise the menu offers an action the save will reject.
  const canSetRates =
    isSuperAdmin || ['admin', 'super_admin', 'administrator'].includes(String(userProfile?.role ?? ''))

  const { data: years, isLoading: yearsLoading } = useQuery({
    queryKey: ['commission-rate-card-years'],
    queryFn: () => ConsultantService.getRateCardYears(),
  })

  // Default to the newest year that has a card. Held as an override so the
  // default follows the data once it loads instead of being frozen at undefined.
  const [pickedYear, setPickedYear] = useState<number | null>(null)
  const year = pickedYear ?? years?.[0]?.academic_year ?? null
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const { data: earnings, isLoading: earningsLoading } = useQuery({
    queryKey: ['commission-rate-card-earnings', consultantId, year],
    queryFn: () => ConsultantService.getConsultantRateCardEarnings(consultantId, year!),
    enabled: !!consultantId && year != null,
  })

  const { data: payments, isLoading: paymentsLoading } = useQuery({
    queryKey: ['commission-rate-card-payments', consultantId, year],
    queryFn: () => ConsultantService.getRateCardPayments(consultantId, year!),
    enabled: !!consultantId && year != null,
  })

  const { data: feeCollection, isLoading: feeLoading } = useQuery({
    queryKey: ['commission-first-year-fees', consultantId, year],
    queryFn: () => ConsultantService.getConsultantFirstYearFeeCollection(consultantId, year!),
    enabled: !!consultantId && year != null,
  })

  // Payment dialog. `dialogKey` remounts it per open so its form re-initialises
  // from the row that opened it instead of keeping the previous entry's values.
  // The standard card, so the ladder editor can show what a tweak departs from.
  const { data: card } = useQuery({
    queryKey: ['rate-card', year],
    queryFn: () => ConsultantService.getRateCard(year ?? undefined),
    enabled: year != null && canSetRates,
  })

  const { data: ladders } = useQuery({
    queryKey: ['consultant-ladders', consultantId],
    queryFn: () => ConsultantService.getConsultantLadders(consultantId),
    enabled: canSetRates,
  })

  const { data: advances } = useQuery({
    queryKey: ['rate-card-advances', consultantId, year],
    queryFn: () => ConsultantService.getRateCardAdvances(consultantId, year as number),
    enabled: year != null,
  })

  const [advanceOpen, setAdvanceOpen] = useState(false)

  const [ladderOpen, setLadderOpen] = useState(false)
  const [ladderState, setLadderState] = useState<LadderDialogState | null>(null)

  const openLadder = (groupId: string, groupName: string) => {
    const bands = (ladders || []).filter(b => b.group_id === groupId)
    const standard =
      (card?.groups || [])
        .find((g: any) => g.id === groupId)
        ?.slabs?.map((sl: any) => ({
          min_count: Number(sl.min_count),
          max_count: sl.max_count == null ? null : Number(sl.max_count),
          amount: Number(sl.amount),
        })) ?? []
    setLadderState({ groupId, groupName, bands, standard, note: bands[0]?.note ?? null })
    setLadderOpen(true)
  }

  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogKey, setDialogKey] = useState(0)
  const [dialogState, setDialogState] = useState<PaymentDialogState>({
    editing: null,
    groupId: null,
    entryType: 'payment',
  })
  const [deleting, setDeleting] = useState<RateCardPayment | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  const openDialog = (next: PaymentDialogState) => {
    setDialogState(next)
    setDialogKey(k => k + 1)
    setDialogOpen(true)
  }

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['consultant-ladders', consultantId] })
    queryClient.invalidateQueries({ queryKey: ['rate-card-advances', consultantId, year] })
    queryClient.invalidateQueries({ queryKey: ['commission-rate-card-earnings', consultantId] })
    queryClient.invalidateQueries({ queryKey: ['commission-rate-card-payments', consultantId] })
  }

  const handleDelete = async () => {
    if (!deleting) return
    setDeleteBusy(true)
    try {
      await ConsultantService.deleteRateCardPayment(deleting.id)
      toast.success('Entry deleted')
      refresh()
      setDeleting(null)
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete')
    } finally {
      setDeleteBusy(false)
    }
  }

  const rows = useMemo(() => earnings || [], [earnings])

  const filteredRows = useMemo(() => {
    if (statusFilter === 'all') return rows
    if (statusFilter === 'earned') return rows.filter(r => r.qualifying_count > 0)
    return rows.filter(r => rowStatus(r) === statusFilter)
  }, [rows, statusFilter])

  // Totals are over ALL institutions for the year, not the filtered/searched
  // view — the cards answer "what does this consultant earn and owe", which a
  // table filter must never shrink.
  //
  // Balance and excess are netted across institutions: excess in one
  // institution (a paid-for learner went Rejected) is first taken off the
  // balance still owed in the others, and only what is left over shows as
  // Excess. Rows keep their own per-institution figures.
  const totals = useMemo(() => {
    const t = rows.reduce(
      (t, r) => ({
        students: t.students + r.qualifying_count,
        earned: t.earned + (r.total_amount ?? 0),
        paid: t.paid + r.paid_amount,
        rowBalance: t.rowBalance + r.balance_amount,
        rowExcess: t.rowExcess + r.excess_amount,
        advanceUsed: t.advanceUsed + (r.advance_applied ?? 0),
      }),
      { students: 0, earned: 0, paid: 0, rowBalance: 0, rowExcess: 0, advanceUsed: 0 }
    )
    // An advance is money already with the agency, so it reduces what is still
    // owed exactly as a line payment does. Leaving it out would overstate Balance.
    const net = t.earned - t.paid - t.advanceUsed
    return {
      ...t,
      balance: Math.max(net, 0),
      excess: Math.max(-net, 0),
      // Excess absorbed by balance owed elsewhere.
      adjusted: Math.min(t.rowBalance, t.rowExcess),
    }
  }, [rows])

  const advanceGiven = useMemo(
    () => (advances || []).reduce((sum, a) => sum + a.amount, 0),
    [advances]
  )

  const feeTotals = useMemo(
    () =>
      (feeCollection || []).reduce(
        (t, r) => ({
          learners: t.learners + r.learner_count,
          fee: t.fee + r.fee_amount,
          paid: t.paid + r.paid_amount,
          balance: t.balance + r.balance_amount,
        }),
        { learners: 0, fee: 0, paid: 0, balance: 0 }
      ),
    [feeCollection]
  )

  const earningColumns = useMemo<ColumnDef<ConsultantRateCardEarning>[]>(() => {
    const cols: ColumnDef<ConsultantRateCardEarning>[] = [
      {
        id: 'institution',
        accessorFn: row => row.group_name,
        header: 'Institution',
        cell: ({ row }) => <span className="font-medium">{row.original.group_name}</span>,
      },
      {
        id: 'students',
        accessorFn: row => row.qualifying_count,
        header: 'Students',
        cell: ({ row }) =>
          row.original.qualifying_count > 0 ? (
            <div className="text-right tabular-nums font-medium">{row.original.qualifying_count}</div>
          ) : (
            <div className="text-right tabular-nums text-muted-foreground">0</div>
          ),
      },
      {
        id: 'per_student',
        accessorFn: row => row.rate_amount ?? 0,
        header: 'Per Learner',
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5">
            <MoneyCell value={row.original.rate_amount} />
            {row.original.is_override && (
              <Badge
                variant="outline"
                className="border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-300"
                title="This agency is on its own ladder for this line, not the standard card."
              >
                Agency rate
              </Badge>
            )}
          </div>
        ),
      },
      {
        id: 'commission',
        accessorFn: row => row.total_amount ?? 0,
        header: 'Commission',
        cell: ({ row }) => <MoneyCell value={row.original.total_amount} className="font-semibold" />,
      },
      {
        id: 'paid',
        accessorFn: row => row.paid_amount,
        header: 'Paid',
        cell: ({ row }) => <MoneyCell value={row.original.paid_amount} className="text-green-700 dark:text-green-400" />,
      },
      {
        id: 'advance',
        accessorFn: row => row.advance_applied ?? 0,
        header: 'Advance Used',
        cell: ({ row }) => <MoneyCell value={row.original.advance_applied} className="text-blue-700 dark:text-blue-400" />,
      },
      {
        id: 'balance',
        accessorFn: row => row.balance_amount,
        header: 'Balance',
        cell: ({ row }) => <MoneyCell value={row.original.balance_amount} className="font-medium text-amber-700 dark:text-amber-400" />,
      },
      {
        id: 'excess',
        accessorFn: row => row.excess_amount,
        header: 'Excess',
        cell: ({ row }) => <MoneyCell value={row.original.excess_amount} className="font-medium text-red-600 dark:text-red-400" />,
      },
      {
        id: 'status',
        accessorFn: row => rowStatus(row),
        header: 'Status',
        cell: ({ row }) => {
          switch (rowStatus(row.original)) {
            case 'excess':
              // Fully absorbed by balance owed in other institutions: nothing to recover.
              return totals.excess > 0 ? (
                <Badge className="bg-red-100 text-red-800 hover:bg-red-100">To recover</Badge>
              ) : (
                <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Adjusted in balance</Badge>
              )
            case 'balance':
              return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Balance due</Badge>
            case 'settled':
              return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Settled</Badge>
            default:
              return (
                <Badge variant="outline" className="text-muted-foreground">
                  Not earned
                </Badge>
              )
          }
        },
      },
    ]

    // An Administrator may change rates but may not hold commissions.manage, so the
    // column appears for either capability and each item is gated on its own.
    if (canManage || canSetRates) {
      cols.push({
        id: 'actions',
        header: () => null,
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canManage && (
                <>
                  <DropdownMenuItem
                    onSelect={() =>
                      openDialog({ editing: null, groupId: row.original.group_id, entryType: 'payment' })
                    }
                  >
                    <HandCoins className="h-4 w-4 mr-2" />
                    Record Payment
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() =>
                      openDialog({ editing: null, groupId: row.original.group_id, entryType: 'recovery' })
                    }
                  >
                    <Undo2 className="h-4 w-4 mr-2" />
                    Record Recovery
                  </DropdownMenuItem>
                </>
              )}
              {canSetRates && (
                <DropdownMenuItem onSelect={() => openLadder(row.original.group_id, row.original.group_name)}>
                  <SlidersHorizontal className="h-4 w-4 mr-2" />
                  {row.original.is_override ? 'Edit agency rate' : 'Set agency rate'}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      })
    }
    return cols
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage, canSetRates, totals.excess, ladders, card])

  const paymentColumns = useMemo<ColumnDef<RateCardPayment>[]>(() => {
    const cols: ColumnDef<RateCardPayment>[] = [
      {
        id: 'paid_on',
        accessorFn: row => row.paid_on,
        header: 'Date',
        cell: ({ row }) => (
          <span className="whitespace-nowrap">{format(new Date(row.original.paid_on), 'dd MMM yyyy')}</span>
        ),
      },
      {
        id: 'institution',
        accessorFn: row => row.group?.name ?? '',
        header: 'Institution',
        cell: ({ row }) => row.original.group?.name ?? '—',
      },
      {
        id: 'type',
        accessorFn: row => row.entry_type,
        header: 'Type',
        cell: ({ row }) =>
          row.original.entry_type === 'recovery' ? (
            <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Recovery</Badge>
          ) : (
            <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Payment</Badge>
          ),
      },
      {
        id: 'amount',
        accessorFn: row => (row.entry_type === 'recovery' ? -row.amount : row.amount),
        header: 'Amount',
        cell: ({ row }) => (
          <div
            className={`text-right tabular-nums font-medium ${
              row.original.entry_type === 'recovery' ? 'text-red-600 dark:text-red-400' : ''
            }`}
          >
            {row.original.entry_type === 'recovery' ? '− ' : ''}
            {rupees(row.original.amount)}
          </div>
        ),
      },
      {
        id: 'mode',
        accessorFn: row => row.payment_mode ?? '',
        header: 'Mode',
        cell: ({ row }) => row.original.payment_mode || '—',
      },
      {
        id: 'reference',
        accessorFn: row => row.reference ?? '',
        header: 'Reference',
        cell: ({ row }) => row.original.reference || '—',
      },
      {
        id: 'notes',
        accessorFn: row => row.notes ?? '',
        header: 'Notes',
        cell: ({ row }) => (
          <span className="line-clamp-1 max-w-[220px] text-muted-foreground">{row.original.notes || '—'}</span>
        ),
      },
    ]

    if (canManage) {
      cols.push({
        id: 'actions',
        header: () => null,
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() =>
                  openDialog({
                    editing: row.original,
                    groupId: row.original.group_id,
                    entryType: row.original.entry_type as RateCardPaymentEntryType,
                  })
                }
              >
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem className="text-red-600" onSelect={() => setDeleting(row.original)}>
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      })
    }
    return cols
  }, [canManage])

  const handleExport = () => {
    if (year == null) return
    const sum = (pick: (r: ConsultantRateCardEarning) => number) => filteredRows.reduce((s, r) => s + pick(r), 0)
    // Netted like the page totals: excess is taken off balance before either is shown.
    const net = sum(r => r.total_amount ?? 0) - sum(r => r.paid_amount)
    const exportRows = [
      ...filteredRows,
      // Total line, so the downloaded sheet carries the same bottom line as the page.
      {
        group_name: 'Total',
        qualifying_count: sum(r => r.qualifying_count),
        rate_amount: null,
        total_amount: sum(r => r.total_amount ?? 0),
        paid_amount: sum(r => r.paid_amount),
        balance_amount: Math.max(net, 0),
        excess_amount: Math.max(-net, 0),
      } as ConsultantRateCardEarning,
    ]
    downloadCsv(
      exportRows,
      [
        { header: 'Institution', accessor: r => r.group_name },
        { header: 'Students', accessor: r => r.qualifying_count },
        { header: 'Per Learner', accessor: r => r.rate_amount ?? '' },
        { header: 'Commission', accessor: r => r.total_amount ?? 0 },
        { header: 'Paid', accessor: r => r.paid_amount },
        { header: 'Balance', accessor: r => r.balance_amount },
        { header: 'Excess', accessor: r => r.excess_amount },
      ],
      `commission-earned-${yearLabel(year)}`
    )
  }

  if (yearsLoading) {
    return <Skeleton className="h-64 w-full" />
  }

  if (!years?.length) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium mb-1">No commission structure published</p>
          <p className="text-sm text-muted-foreground">
            Commission is calculated once a structure exists for an admission year.
          </p>
        </CardContent>
      </Card>
    )
  }

  const summary = [
    { title: 'Total Commission', value: rupees(totals.earned), hint: year != null ? `for ${yearLabel(year)}` : '', icon: IndianRupee, tone: '' },
    { title: 'Paid', value: rupees(totals.paid), hint: 'net of recoveries', icon: Wallet, tone: 'text-green-700 dark:text-green-400' },
    { title: 'Balance', value: rupees(totals.balance), hint: totals.adjusted > 0 ? `still to pay, after ${rupees(totals.adjusted)} excess adjusted` : 'still to pay', icon: HandCoins, tone: 'text-amber-700 dark:text-amber-400' },
    { title: 'Excess', value: rupees(totals.excess), hint: 'left after adjusting balance, to recover', icon: AlertTriangle, tone: totals.excess > 0 ? 'text-red-600 dark:text-red-400' : '' },
    { title: 'Learners Counted', value: String(totals.students), hint: 'Account, Admitted or Active', icon: Users, tone: '' },
  ]

  return (
    <div className="space-y-4">
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
        {summary.map(s => (
          <Card key={s.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{s.title}</CardTitle>
              <s.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {earningsLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className={`text-2xl font-bold tabular-nums ${s.tone}`}>{s.value}</div>
              )}
              <p className="text-xs text-muted-foreground">{s.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {totals.excess > 0 && (
        <div className="flex items-start gap-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <p>
            {rupees(totals.excess)} has been paid over what is earned now — usually a paid-for student
            left Account, Admitted or Active (e.g. Rejected), and there is no balance left to adjust it
            against. Recover it and record a Recovery to clear it.
          </p>
        </div>
      )}

      {totals.adjusted > 0 && (
        <div className="flex items-start gap-3 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
          <Undo2 className="h-4 w-4 mt-0.5 shrink-0" />
          <p>
            {rupees(totals.adjusted)} paid for learners who later left Account, Admitted or Active has
            been taken off the balance owed for other institutions.
          </p>
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Commission Earned</CardTitle>
            <CardDescription>
              Learners counted are those in Account, Admitted or Active status for the selected
              admission year.
            </CardDescription>
          </div>
          {canManage && (
            <Button
              size="sm"
              onClick={() => openDialog({ editing: null, groupId: null, entryType: 'payment' })}
            >
              <Plus className="h-4 w-4 mr-2" />
              Record Payment
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {earningsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map(i => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <DataTable
              columns={earningColumns}
              data={filteredRows}
              searchPlaceholder="Search institution..."
              getRowId={row => row.group_id}
              showRefresh={false}
              globalFilterFn={(row, _columnId, filterValue) =>
                (row.original as ConsultantRateCardEarning).group_name
                  .toLowerCase()
                  .includes(String(filterValue).toLowerCase())
              }
              tableTools={
                <>
                  <Select
                    value={year != null ? String(year) : undefined}
                    onValueChange={v => setPickedYear(Number(v))}
                  >
                    <SelectTrigger className="w-[160px]">
                      <SelectValue placeholder="Admission year" />
                    </SelectTrigger>
                    <SelectContent>
                      {years.map(y => (
                        <SelectItem key={y.academic_year} value={String(y.academic_year)}>
                          {yearLabel(y.academic_year)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={statusFilter} onValueChange={v => setStatusFilter(v as StatusFilter)}>
                    <SelectTrigger className="w-[160px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Institutions</SelectItem>
                      <SelectItem value="earned">Earned</SelectItem>
                      <SelectItem value="balance">Balance due</SelectItem>
                      <SelectItem value="excess">To recover</SelectItem>
                      <SelectItem value="settled">Settled</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" onClick={handleExport}>
                    <Download className="h-4 w-4 mr-2" />
                    Export
                  </Button>
                </>
              }
            />
          )}

          {!earningsLoading && (
            <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 rounded-md border bg-muted/40 px-4 py-3 text-sm sm:grid-cols-5">
              <div>
                <p className="text-xs text-muted-foreground">Learners</p>
                <p className="font-semibold tabular-nums">{totals.students}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Commission</p>
                <p className="font-bold tabular-nums">{rupees(totals.earned)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Paid</p>
                <p className="font-semibold tabular-nums text-green-700 dark:text-green-400">{rupees(totals.paid)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Balance</p>
                <p className="font-semibold tabular-nums text-amber-700 dark:text-amber-400">{rupees(totals.balance)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Excess</p>
                <p className="font-semibold tabular-nums text-red-600 dark:text-red-400">{rupees(totals.excess)}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1st Year Fee Collection</CardTitle>
          <CardDescription>
            How much of the counted learners&apos; 1st-year academic fees ({year != null ? yearLabel(year) : 'this year'})
            has been paid. Transport and hostel fees are not included.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {feeLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : !feeCollection?.length ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No counted learners for this year.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Institution</th>
                    <th className="px-3 py-2 text-right font-medium">Learners</th>
                    <th className="px-3 py-2 text-right font-medium">1st Year Fees</th>
                    <th className="px-3 py-2 text-right font-medium">Paid</th>
                    <th className="px-3 py-2 text-right font-medium">Paid %</th>
                    <th className="px-3 py-2 text-right font-medium">Balance</th>
                    <th className="px-3 py-2 text-right font-medium">Balance %</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ...feeCollection.map(r => ({
                      key: r.institution_id,
                      name: r.institution_name ?? '—',
                      learners: r.learner_count,
                      fee: r.fee_amount,
                      paid: r.paid_amount,
                      balance: r.balance_amount,
                      total: false,
                    })),
                    { key: 'total', name: 'Total', ...feeTotals, total: true },
                  ].map(r => (
                    <tr key={r.key} className={r.total ? 'border-t bg-muted/40 font-semibold' : 'border-t'}>
                      <td className="px-3 py-2">{r.name}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.learners}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{rupees(r.fee)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-green-700 dark:text-green-400">{rupees(r.paid)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-green-700 dark:text-green-400">{percent(r.paid, r.fee)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-amber-700 dark:text-amber-400">{rupees(r.balance)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-amber-700 dark:text-amber-400">{percent(r.balance, r.fee)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">Advances</CardTitle>
            <CardDescription>
              Money given to this agency against the {year != null ? yearLabel(year) : 'current'}{' '}
              intake as a whole, with no college named. It is used up automatically as that year&apos;s admissions
              come in, starting at the top of the card and working down.
            </CardDescription>
          </div>
          {canManage && year != null && (
            <Button size="sm" onClick={() => setAdvanceOpen(true)}>
              <HandCoins className="h-4 w-4 mr-2" />
              Record Advance
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {!advances?.length ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No advance given for this year.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-md border bg-muted/40 px-4 py-3 text-sm sm:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">Advance given</p>
                  <p className="font-medium tabular-nums">{rupees(advanceGiven)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Used by admissions so far</p>
                  <p className="font-medium tabular-nums text-blue-700 dark:text-blue-400">
                    {rupees(totals.advanceUsed)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Not yet used</p>
                  <p className="font-medium tabular-nums">{rupees(Math.max(advanceGiven - totals.advanceUsed, 0))}</p>
                </div>
              </div>
              <div className="mt-3 space-y-2">
                {advances.map(a => (
                  <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium tabular-nums">{rupees(a.amount)}</span>
                      <span className="text-muted-foreground">{format(new Date(a.paid_on), 'd MMM yyyy')}</span>
                      {a.reference && <span className="text-muted-foreground">{a.reference}</span>}
                    </div>
                    <Badge variant="outline">
                      {a.advance_disposition === 'carry_forward'
                        ? 'Unused part carries forward'
                        : 'Unused part is recoverable'}
                    </Badge>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payment History</CardTitle>
          <CardDescription>
            Payments made and recoveries received for {year != null ? yearLabel(year) : 'this year'}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {paymentsLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : !payments?.length ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No payments recorded yet.</p>
          ) : (
            <DataTable
              columns={paymentColumns}
              data={payments}
              searchPlaceholder="Search institution, reference..."
              getRowId={row => row.id}
              showRefresh={false}
              globalFilterFn={(row, _columnId, filterValue) => {
                const p = row.original as RateCardPayment
                const q = String(filterValue).toLowerCase()
                return [p.group?.name, p.reference, p.payment_mode, p.notes].some(v =>
                  v?.toLowerCase().includes(q)
                )
              }}
            />
          )}
        </CardContent>
      </Card>

      {dialogOpen && (
        <RateCardPaymentDialog
          key={dialogKey}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          consultantId={consultantId}
          groups={rows}
          state={dialogState}
          onSaved={refresh}
        />
      )}

      <AlertDialog open={!!deleting} onOpenChange={open => !open && !deleteBusy && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting &&
                `${deleting.entry_type === 'recovery' ? 'Recovery' : 'Payment'} of ${rupees(deleting.amount)} for ${
                  deleting.group?.name ?? 'this institution'
                } will be removed, and Paid, Balance and Excess recalculated.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={e => {
                e.preventDefault()
                handleDelete()
              }}
              disabled={deleteBusy}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteBusy ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {year != null && (
        <RateCardAdvanceDialog
          open={advanceOpen}
          onOpenChange={setAdvanceOpen}
          consultantId={consultantId}
          year={year}
          outstanding={totals.balance}
          userId={userProfile?.id ?? null}
          onSaved={refresh}
        />
      )}

      <RateCardLadderDialog
        open={ladderOpen}
        onOpenChange={setLadderOpen}
        consultantId={consultantId}
        state={ladderState}
        userId={userProfile?.id ?? null}
        onSaved={refresh}
      />
    </div>
  )
}
