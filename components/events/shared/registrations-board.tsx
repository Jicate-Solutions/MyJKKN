'use client';

// components/events/shared/registrations-board.tsx
// Shared REGISTRATION LIST board for the Event Logistics "Registrations" tab.
// Read-only: shows who registered, their contact and payment state, and — via the
// row dialog — their answers to the event's custom registration questions.
//
// Division / Entry columns render only for sports_tournament events, where that
// data exists (tournament_entries). Export is gated on canManage: reading one
// registrant's row and downloading everyone's phone number are different acts.

import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  ClipboardList,
  CreditCard,
  Download,
  Eye,
  IndianRupee,
  Loader2,
  UserCheck,
  Users,
  XCircle,
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DataTable, type PermissionColumnDef } from '@/components/ui/data-table';
import { useEventRegistrations } from '@/hooks/events/shared/use-event-registrations';
import {
  useGeneratePaymentLink,
  useMarkEntryPaid,
  useWithdrawEntry,
} from '@/hooks/events/use-tournament-registrations';
import { EventRazorpayHostedRedirect } from '@/components/events/event-razorpay-hosted-redirect';
import { DivisionFeeBadge } from '@/components/events/shared/division-fee-badge';
import { useTournament } from '@/hooks/events/use-tournaments';
import { ExportService } from '@/lib/services/export-service';
import type { EventRegistrationRow } from '@/lib/services/events/shared/event-registrations-service';

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-3">
        <div className="rounded-md bg-muted p-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div>
          <div className="text-xl font-semibold leading-none">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function fmtDate(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : format(d, 'dd MMM yyyy');
}

function PaymentCell({ row }: { row: EventRegistrationRow }) {
  const status = row.payment_status ?? 'not_required';
  if (status === 'not_required') {
    return <span className="text-xs text-muted-foreground">Free</span>;
  }
  const paid = status === 'paid';
  return (
    <div className="flex items-center gap-1.5">
      <Badge variant={paid ? 'secondary' : 'outline'} className="text-[10px] capitalize">
        {status}
      </Badge>
      {row.payment_amount != null && row.payment_amount > 0 && (
        <span className="text-xs tabular-nums text-muted-foreground">
          ₹{row.payment_amount.toLocaleString('en-IN')}
        </span>
      )}
    </div>
  );
}

export function RegistrationsBoard({
  eventId,
  eventType,
  canManage = true,
}: {
  eventId: string;
  eventType: string;
  canManage?: boolean;
}) {
  const { data, isLoading, isError, refetch } = useEventRegistrations(eventId, eventType);
  const [detail, setDetail] = useState<EventRegistrationRow | null>(null);

  const rows = useMemo(() => data ?? [], [data]);
  const isTournament = eventType === 'sports_tournament';

  // Organizer actions. These moved here from the tournament detail page's
  // division cards, which listed the same people purely to hang these three
  // buttons off. They act on tournament_entries.id, so they only appear when the
  // registration resolved to an entry row.
  const markPaid = useMarkEntryPaid(eventId);
  const withdraw = useWithdrawEntry(eventId);
  const payLink = useGeneratePaymentLink(eventId);
  const [rzp, setRzp] = useState<{
    orderId: string;
    keyId: string;
    amountPaise: number;
    customer: { name?: string; email?: string; phone?: string };
  } | null>(null);

  const canAct = canManage && isTournament;

  // Divisions carry the entry fee (config.entry_fee), so pricing lives here now
  // rather than on the division cards. Passing '' for non-tournaments keeps the
  // query disabled; on a tournament this hits the SAME cache key the detail page
  // already populated, so it costs no extra request.
  const { data: tournament } = useTournament(isTournament ? eventId : '');
  const divisions = useMemo(() => tournament?.divisions ?? [], [tournament?.divisions]);

  const runPaymentLink = async (entryId: string) => {
    const res = await payLink.mutateAsync(entryId);
    if (res.razorpay_order_id && res.razorpay_key_id) {
      setRzp({
        orderId: res.razorpay_order_id,
        keyId: res.razorpay_key_id,
        amountPaise: res.amount_paise ?? 0,
        customer: res.customer ?? {},
      });
    } else {
      toast.error('No payment link returned');
    }
  };

  // Computed from rows already in hand — deliberately no second round trip.
  const stats = useMemo(
    () => ({
      total: rows.length,
      paid: rows.filter((r) => r.payment_status === 'paid').length,
      unpaid: rows.filter((r) => r.payment_status === 'pending' || r.payment_status === 'failed')
        .length,
      external: rows.filter((r) => r.participant_type === 'external').length,
    }),
    [rows]
  );

  const columns = useMemo<PermissionColumnDef<EventRegistrationRow>[]>(() => {
    const base: PermissionColumnDef<EventRegistrationRow>[] = [
      {
        accessorKey: 'participant_name',
        header: 'Participant',
        cell: ({ row }) => (
          <div>
            <div className="text-xs font-medium">{row.original.participant_name ?? '—'}</div>
            {row.original.participant_phone && (
              <div className="text-[10px] text-muted-foreground">
                {row.original.participant_phone}
              </div>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'institution_name',
        header: 'Institution',
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {row.original.institution_name ?? '—'}
          </span>
        ),
      },
      {
        accessorKey: 'participant_type',
        header: 'Type',
        cell: ({ row }) => (
          <Badge variant="outline" className="text-[10px] capitalize">
            {row.original.participant_type ?? '—'}
          </Badge>
        ),
      },
    ];

    if (isTournament) {
      base.push(
        {
          accessorKey: 'division_label',
          header: 'Division',
          cell: ({ row }) => (
            <span className="text-xs">{row.original.division_label ?? '—'}</span>
          ),
        },
        {
          accessorKey: 'entry_type',
          header: 'Entry',
          cell: ({ row }) => (
            <span className="text-xs capitalize text-muted-foreground">
              {row.original.entry_type ?? '—'}
            </span>
          ),
        }
      );
    }

    base.push(
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <Badge variant="outline" className="text-[10px] capitalize">
            {row.original.status ?? '—'}
          </Badge>
        ),
      },
      {
        accessorKey: 'payment_status',
        header: 'Payment',
        cell: ({ row }) => <PaymentCell row={row.original} />,
      },
      {
        accessorKey: 'created_at',
        header: 'Registered',
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{fmtDate(row.original.created_at)}</span>
        ),
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row }) => {
          const r = row.original;
          const showEntryActions = canAct && !!r.entry_id;
          const unpaid = r.payment_status === 'pending' || r.payment_status === 'failed';
          return (
            <div className="flex items-center justify-end gap-1">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => setDetail(r)}
              >
                <Eye className="mr-1 h-3.5 w-3.5" />
                View
              </Button>
              {showEntryActions && unpaid && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 w-7 p-0"
                    title="Generate online payment link"
                    disabled={payLink.isPending}
                    onClick={() => runPaymentLink(r.entry_id!)}
                  >
                    <CreditCard className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 w-7 p-0"
                    title="Mark paid (offline)"
                    disabled={markPaid.isPending}
                    onClick={() =>
                      markPaid.mutateAsync({ entryId: r.entry_id! }).then(() => refetch())
                    }
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
              {showEntryActions && r.entry_status !== 'withdrawn' && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  title="Withdraw entry"
                  disabled={withdraw.isPending}
                  onClick={() => withdraw.mutateAsync(r.entry_id!).then(() => refetch())}
                >
                  <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              )}
            </div>
          );
        },
      }
    );

    return base;
    // runPaymentLink is recreated each render but only closes over stable
    // mutation objects; the pending flags below are what must retrigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTournament, canAct, markPaid.isPending, withdraw.isPending, payLink.isPending]);

  const globalFilterFn = (row: any, _columnId: string, filterValue: string) => {
    const q = filterValue.toLowerCase();
    const r = row.original as EventRegistrationRow;
    return [r.participant_name, r.participant_phone, r.participant_email, r.institution_name]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q));
  };

  /**
   * Export flattens the custom answers into COLUMNS even though the table shows
   * them in a dialog — a spreadsheet wants one row per registrant with every
   * answer visible. Headers are built from the labels actually present.
   */
  const buildExport = () => {
    const answerLabels: string[] = [];
    for (const r of rows) {
      for (const a of r.custom_answers) {
        if (!answerLabels.includes(a.label)) answerLabels.push(a.label);
      }
    }

    const headers: Record<string, string> = {
      participant_name: 'Participant',
      participant_phone: 'Phone',
      participant_email: 'Email',
      institution_name: 'Institution',
      participant_type: 'Type',
      ...(isTournament ? { division_label: 'Division', entry_type: 'Entry Type' } : {}),
      status: 'Status',
      payment_status: 'Payment Status',
      payment_amount: 'Amount',
      source: 'Source',
      registered_at: 'Registered',
    };
    for (const label of answerLabels) headers[label] = label;

    const data = rows.map((r) => {
      const answers: Record<string, string> = {};
      for (const label of answerLabels) {
        answers[label] = r.custom_answers.find((a) => a.label === label)?.value ?? '';
      }
      return {
        participant_name: r.participant_name ?? '',
        participant_phone: r.participant_phone ?? '',
        participant_email: r.participant_email ?? '',
        institution_name: r.institution_name ?? '',
        participant_type: r.participant_type ?? '',
        ...(isTournament
          ? { division_label: r.division_label ?? '', entry_type: r.entry_type ?? '' }
          : {}),
        status: r.status ?? '',
        payment_status: r.payment_status ?? '',
        payment_amount: r.payment_amount ?? '',
        source: r.source ?? '',
        registered_at: fmtDate(r.created_at),
        ...answers,
      };
    });

    return { headers, data };
  };

  const exportAs = (kind: 'excel' | 'csv') => {
    const { headers, data } = buildExport();
    if (data.length === 0) return;
    const filename = `Registrations_${new Date().toISOString().slice(0, 10)}`;
    if (kind === 'excel') {
      ExportService.exportToExcel(data, headers as any, filename, 'Registrations');
    } else {
      ExportService.exportToCSV(data, headers as any, filename);
    }
  };

  const tableTools = canManage ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 text-xs" disabled={rows.length === 0}>
          <Download className="mr-1 h-3.5 w-3.5" />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => exportAs('excel')}>Excel (.xlsx)</DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportAs('csv')}>CSV</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ) : undefined;

  // Hosted checkout takes over the view, exactly as it did on the tournament
  // detail page before these actions moved here — the gateway needs a full
  // handover, not a panel inside a tab.
  if (rzp) {
    return (
      <EventRazorpayHostedRedirect
        eventId={eventId}
        razorpayKeyId={rzp.keyId}
        razorpayOrderId={rzp.orderId}
        amountPaise={rzp.amountPaise}
        currency="INR"
        customer={rzp.customer}
        description="Tournament entry fee"
        cancelPath={`/events/tournament/${eventId}`}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <ClipboardList className="h-4 w-4 text-muted-foreground" />
          Registrations
        </h3>
        <p className="text-sm text-muted-foreground">
          Everyone who has registered for this event, with their form answers.
        </p>
      </div>

      {isTournament && divisions.length > 0 && (
        <div className="rounded-lg border p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Entry fees
          </p>
          <div className="space-y-2">
            {divisions.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm">
                  {[d.sport, d.age_band, d.gender && d.gender !== 'open' ? d.gender : null]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                <DivisionFeeBadge division={d} eventId={eventId} canManage={canManage} />
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Each division prices independently. Above ₹0, the public registration form
            collects it online automatically.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={Users} label="Total" value={stats.total} />
        <StatCard icon={IndianRupee} label="Paid" value={stats.paid} />
        <StatCard icon={IndianRupee} label="Unpaid" value={stats.unpaid} />
        <StatCard icon={UserCheck} label="External" value={stats.external} />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : isError ? (
        <p className="py-8 text-center text-sm text-destructive">
          Could not load registrations.{' '}
          <button type="button" className="underline" onClick={() => refetch()}>
            Retry
          </button>
        </p>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No registrations yet.</p>
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          searchPlaceholder="Search name, phone, email, institution…"
          globalFilterFn={globalFilterFn}
          getRowId={(r) => r.id}
          onRefresh={() => refetch()}
          tableTools={tableTools}
        />
      )}

      <Dialog open={!!detail} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{detail?.participant_name ?? 'Registration'}</DialogTitle>
            <DialogDescription>
              Registered {fmtDate(detail?.created_at ?? null)}
              {detail?.source ? ` · ${detail.source}` : ''}
            </DialogDescription>
          </DialogHeader>

          {detail && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Contact
                </p>
                <dl className="space-y-1 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Phone</dt>
                    <dd className="text-right">{detail.participant_phone || '—'}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Email</dt>
                    <dd className="break-all text-right">{detail.participant_email || '—'}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Institution</dt>
                    <dd className="text-right">{detail.institution_name || '—'}</dd>
                  </div>
                  {isTournament && (
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">Division</dt>
                      <dd className="text-right">{detail.division_label || '—'}</dd>
                    </div>
                  )}
                </dl>
              </div>

              {detail.custom_answers.length > 0 && (
                <div className="space-y-1.5 border-t pt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Form answers
                  </p>
                  <dl className="space-y-2 text-sm">
                    {detail.custom_answers.map((a) => (
                      <div key={a.label}>
                        <dt className="text-xs text-muted-foreground">{a.label}</dt>
                        <dd className="font-medium">{a.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
