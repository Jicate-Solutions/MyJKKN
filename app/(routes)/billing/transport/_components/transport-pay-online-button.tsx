'use client';

import { useEffect, useMemo, useState } from 'react';
import { CreditCard, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PaymentSelectionModal } from '@/components/billing/payment-selection-modal';
import { useStudentBillsByStudent } from '@/hooks/billing/use-student-bills';

interface TransportPayOnlineButtonProps {
  studentId: string;
  /** This row's payable (unpaid / partially-paid) transport bill ids. */
  billIds: string[];
  size?: 'sm' | 'default';
}

/**
 * Transport "Pay Online" entry point.
 *
 * The transport collectables row only knows the *ids* of the payable bills, so
 * we lazily fetch the student's full bills (rich shape: category, academic year,
 * balance) once the user clicks, then narrow to this row's term-wise bills and
 * hand them to the shared {@link PaymentSelectionModal}. That modal lets the
 * operator tick which terms to pay and pay only those — instead of the old
 * behaviour that charged the whole outstanding total in one shot.
 */
export function TransportPayOnlineButton({
  studentId,
  billIds,
  size = 'sm',
}: TransportPayOnlineButtonProps) {
  // `armed` = user clicked and we want the bills; the query is disabled until then.
  const [armed, setArmed] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const { data: allBills = [], isFetching } = useStudentBillsByStudent(
    armed ? studentId : '',
  );

  const billIdSet = useMemo(() => new Set(billIds ?? []), [billIds]);
  const bills = useMemo(
    () => allBills.filter((b) => billIdSet.has(b.id)),
    [allBills, billIdSet],
  );

  // Open the modal only once the bills have loaded, so it never flashes its
  // empty-state ("No unpaid bills") while the fetch is still in flight.
  useEffect(() => {
    if (armed && !isFetching && !modalOpen) setModalOpen(true);
  }, [armed, isFetching, modalOpen]);

  function handleOpenChange(next: boolean) {
    setModalOpen(next);
    if (!next) setArmed(false); // reset so a later click refetches
  }

  const loading = armed && isFetching && !modalOpen;

  return (
    <>
      <Button
        onClick={() => setArmed(true)}
        disabled={loading}
        size={size}
        className="h-8 gap-1 px-2 text-xs"
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <CreditCard className="h-3.5 w-3.5" />
        )}
        Pay Online
      </Button>

      <PaymentSelectionModal
        open={modalOpen}
        onOpenChange={handleOpenChange}
        bills={bills}
        studentId={studentId}
      />
    </>
  );
}
