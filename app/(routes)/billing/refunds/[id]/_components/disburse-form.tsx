'use client';

import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { useDisburseRefund } from '@/hooks/billing/use-refund-workflow';
import type { RefundAttachment } from '@/types/billing-refund-workflow';

interface Props {
  requestId: string;
  requestNumber: string;
  institutionName: string;
}

const PAYMENT_MODES = [
  { value: 'cash', label: 'Cash' },
  { value: 'online', label: 'Online' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'dd', label: 'Demand Draft' },
  { value: 'cheque', label: 'Cheque' }
];

export function DisburseForm({ requestId, requestNumber, institutionName }: Props) {
  const [paymentMode, setPaymentMode] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [chequeDdNumber, setChequeDdNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [attachments, setAttachments] = useState<RefundAttachment[]>([]);

  const disburse = useDisburseRefund();

  const handleSubmit = () => {
    if (!paymentMode) return toast.error('Select a payment mode');
    if (!notes.trim()) return toast.error('Notes are required');
    if (paymentMode === 'bank_transfer' && (!bankName.trim() || !accountNumber.trim())) {
      return toast.error('Bank name and account number are required');
    }
    if ((paymentMode === 'cheque' || paymentMode === 'dd') && !chequeDdNumber.trim()) {
      return toast.error('Cheque/DD number is required');
    }

    const paymentDetails: Record<string, unknown> = {};
    if (referenceNumber.trim()) paymentDetails.reference_number = referenceNumber.trim();
    if (paymentMode === 'bank_transfer') {
      paymentDetails.bank_name = bankName.trim();
      paymentDetails.account_number = accountNumber.trim();
    }
    if (paymentMode === 'cheque' || paymentMode === 'dd') {
      paymentDetails.cheque_dd_number = chequeDdNumber.trim();
    }

    disburse.mutate({ requestId, paymentMode, paymentDetails, notes, attachments });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Disburse Refund</CardTitle>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='space-y-2'>
          <Label>Payment Mode *</Label>
          <Select value={paymentMode} onValueChange={setPaymentMode}>
            <SelectTrigger>
              <SelectValue placeholder='Select payment mode' />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_MODES.map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className='space-y-2'>
          <Label>Reference Number</Label>
          <Input value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)}
            placeholder='Transaction / UTR reference number' />
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

        {(paymentMode === 'cheque' || paymentMode === 'dd') && (
          <div className='space-y-2'>
            <Label>{paymentMode === 'cheque' ? 'Cheque' : 'DD'} Number *</Label>
            <Input value={chequeDdNumber} onChange={(e) => setChequeDdNumber(e.target.value)}
              placeholder={`${paymentMode === 'cheque' ? 'Cheque' : 'DD'} number`} />
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
            institutionName={institutionName} requestRef={requestNumber} />
        </div>

        <div className='flex justify-end pt-2 border-t'>
          <Button onClick={handleSubmit} disabled={disburse.isPending}>
            {disburse.isPending ? 'Disbursing…' : 'Disburse Refund'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
