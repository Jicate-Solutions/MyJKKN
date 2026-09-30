'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { RefundAttachmentsField } from '@/components/billing/refund-attachments-field';
import { useDisburseCommissionPayment } from '@/hooks/admission/use-commission-payments';
import {
  COMMISSION_PAYMENT_MODES,
  type CommissionPaymentAttachment,
  type CommissionPaymentMode
} from '@/types/consultant-commission-payment';
import { COMMISSION_PAYMENT_ATTACHMENTS_ENDPOINT } from './stage-action-panel';

interface Props {
  requestId: string;
  requestNumber: string;
  consultantName: string;
  /** Consultant's bank details on file — prefill the bank transfer fields. */
  defaultBankName?: string | null;
  defaultAccountNumber?: string | null;
}

export function DisburseForm({
  requestId, requestNumber, consultantName, defaultBankName, defaultAccountNumber
}: Props) {
  const [paymentMode, setPaymentMode] = useState<CommissionPaymentMode | ''>('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [bankName, setBankName] = useState(defaultBankName ?? '');
  const [accountNumber, setAccountNumber] = useState(defaultAccountNumber ?? '');
  const [chequeNumber, setChequeNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [attachments, setAttachments] = useState<CommissionPaymentAttachment[]>([]);

  const disburse = useDisburseCommissionPayment();

  const handleSubmit = () => {
    if (!paymentMode) return toast.error('Select a payment mode');
    if (paymentMode === 'bank_transfer' && (!bankName.trim() || !accountNumber.trim())) {
      return toast.error('Bank name and account number are required');
    }
    if (paymentMode === 'cheque' && !chequeNumber.trim()) {
      return toast.error('Cheque number is required');
    }
    if (paymentMode === 'upi' && !referenceNumber.trim()) {
      return toast.error('UPI transaction ID is required');
    }
    if (!notes.trim()) return toast.error('Notes are required');

    const paymentDetails: Record<string, unknown> = {};
    // For UPI the transaction id is captured in this same field.
    if (referenceNumber.trim()) paymentDetails.reference_number = referenceNumber.trim();
    if (paymentMode === 'bank_transfer') {
      paymentDetails.bank_name = bankName.trim();
      paymentDetails.account_number = accountNumber.trim();
    }
    if (paymentMode === 'cheque') {
      paymentDetails.cheque_number = chequeNumber.trim();
    }

    disburse.mutate({ requestId, paymentMode, paymentDetails, notes, attachments });
  };

  const isUpi = paymentMode === 'upi';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Disburse Payment</CardTitle>
        <CardDescription>
          Disbursing records this payment on the consultant&apos;s commission ledger.
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='space-y-2'>
          <Label>Payment Mode *</Label>
          <Select value={paymentMode} onValueChange={(v) => setPaymentMode(v as CommissionPaymentMode)}>
            <SelectTrigger>
              <SelectValue placeholder='Select payment mode' />
            </SelectTrigger>
            <SelectContent>
              {COMMISSION_PAYMENT_MODES.map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className='space-y-2'>
          <Label>{isUpi ? 'UPI Transaction ID *' : 'Reference Number (UTR)'}</Label>
          <Input value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)}
            placeholder={isUpi ? 'UPI transaction ID' : 'Transaction / UTR reference number'} />
        </div>

        {paymentMode === 'bank_transfer' && (
          <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
            <div className='space-y-2'>
              <Label>Bank Name *</Label>
              <Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder='Bank name' />
            </div>
            <div className='space-y-2'>
              <Label>Account Number *</Label>
              <Input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)}
                placeholder='Account number' />
            </div>
          </div>
        )}

        {paymentMode === 'cheque' && (
          <div className='space-y-2'>
            <Label>Cheque Number *</Label>
            <Input value={chequeNumber} onChange={(e) => setChequeNumber(e.target.value)}
              placeholder='Cheque number' />
          </div>
        )}

        <div className='space-y-2'>
          <Label>Notes *</Label>
          <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder='Notes for this disbursement' />
        </div>

        <div className='space-y-2'>
          <Label>Supporting Documents</Label>
          <RefundAttachmentsField value={attachments} onChange={setAttachments}
            institutionName={consultantName} requestRef={requestNumber}
            endpoint={COMMISSION_PAYMENT_ATTACHMENTS_ENDPOINT} />
        </div>

        <div className='flex justify-end pt-2 border-t'>
          <Button onClick={handleSubmit} disabled={disburse.isPending}>
            {disburse.isPending ? 'Disbursing…' : 'Disburse Payment'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
