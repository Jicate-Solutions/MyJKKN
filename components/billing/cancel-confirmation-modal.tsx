'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  AlertTriangle,
  Ban,
  ReceiptIndianRupee,
  X
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { StudentBill } from '@/types/billing-schedule';

const CANCELLABLE_STATUSES = ['unpaid', 'partially_paid', 'overdue'];

interface CancelConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason?: string) => Promise<void> | void;
  bills: StudentBill[];
  isLoading?: boolean;
}

export function CancelConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  bills,
  isLoading = false
}: CancelConfirmationModalProps) {
  const [reason, setReason] = useState('');

  const cancellable = bills.filter((b) =>
    CANCELLABLE_STATUSES.includes(b.status)
  );
  const skipped = bills.filter(
    (b) => !CANCELLABLE_STATUSES.includes(b.status)
  );

  const totalAmount = cancellable.reduce(
    (sum, bill) => sum + (bill.final_amount || 0),
    0
  );
  const totalBalance = cancellable.reduce(
    (sum, bill) => sum + (bill.balance_amount || 0),
    0
  );

  const handleConfirm = async () => {
    try {
      await onConfirm(reason.trim() || undefined);
      setReason('');
    } catch (error) {
      console.error('Error during cancellation:', error);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      setReason('');
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-full bg-amber-100">
              <Ban className="h-6 w-6 text-amber-600" />
            </div>
            <div className="flex-1">
              <DialogTitle className="text-xl font-semibold text-gray-900">
                Cancel {cancellable.length} Bill{cancellable.length !== 1 ? 's' : ''}?
              </DialogTitle>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClose}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <DialogDescription className="text-gray-600">
            Cancelled bills will have their balance set to zero. The bill
            record and any existing payments or receipts will be preserved
            for audit purposes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Summary */}
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ReceiptIndianRupee className="h-5 w-5" />
                <span className="font-medium">
                  {cancellable.length} bill{cancellable.length !== 1 ? 's' : ''} to cancel
                </span>
              </div>
              <div className="text-right">
                <span className="text-sm text-gray-500">Outstanding balance</span>
                <div className="font-semibold text-lg">
                  {formatCurrency(totalBalance)}
                </div>
              </div>
            </div>
          </div>

          {/* Skipped bills warning */}
          {skipped.length > 0 && (
            <div className="p-3 bg-gray-100 border border-gray-200 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="h-4 w-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">
                  {skipped.length} bill{skipped.length !== 1 ? 's' : ''} will be skipped
                </span>
              </div>
              <p className="text-sm text-gray-600">
                Bills with status {skipped.map((b) => b.status).filter((v, i, a) => a.indexOf(v) === i).join(', ')} cannot be cancelled.
              </p>
            </div>
          )}

          {/* Items List */}
          {cancellable.length > 0 && (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {cancellable.slice(0, 5).map((bill) => (
                <div
                  key={bill.id}
                  className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">
                      {`${bill.student?.first_name || ''} ${bill.student?.last_name || ''}`.trim()} - {bill.bill_description}
                    </p>
                    <p className="text-sm text-gray-500 truncate">
                      Balance: {formatCurrency(bill.balance_amount)} of {formatCurrency(bill.final_amount)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 ml-3">
                    <Badge
                      variant={
                        bill.status === 'overdue'
                          ? 'destructive'
                          : 'secondary'
                      }
                      className="text-xs"
                    >
                      {bill.status}
                    </Badge>
                  </div>
                </div>
              ))}

              {cancellable.length > 5 && (
                <div className="text-center py-2">
                  <span className="text-sm text-gray-500">
                    and {cancellable.length - 5} more bill{cancellable.length - 5 !== 1 ? 's' : ''}...
                  </span>
                </div>
              )}
            </div>
          )}

          <Separator />

          {/* Reason */}
          <div className="space-y-2">
            <Label htmlFor="cancel-reason" className="text-sm font-medium">
              Reason for cancellation (optional)
            </Label>
            <Textarea
              id="cancel-reason"
              placeholder="e.g., Duplicate bill, Student withdrawn, Fee waiver approved..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              disabled={isLoading}
              className="resize-none"
            />
          </div>

          {/* Info */}
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <span className="text-sm font-medium text-amber-800">
                Balance will be written off
              </span>
            </div>
            <p className="text-sm text-amber-700 mt-1">
              {formatCurrency(totalBalance)} in outstanding balance will be
              set to zero. Existing payment records will not be affected.
            </p>
          </div>
        </div>

        <DialogFooter className="flex gap-3 pt-4">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isLoading}
            className="flex-1"
          >
            Keep Bills
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isLoading || cancellable.length === 0}
            className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
          >
            {isLoading && (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
            )}
            <Ban className="h-4 w-4 mr-2" />
            {isLoading
              ? 'Cancelling...'
              : `Cancel ${cancellable.length} Bill${cancellable.length !== 1 ? 's' : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
