'use client';

/**
 * Record or replace one person's bank account.
 *
 * THE ACCOUNT NUMBER IS TYPED TWICE. A format check cannot catch a transposed
 * digit — 123456789021 is every bit as valid a number as 123456789012 — and the
 * failure mode is money arriving in a stranger's account with no error anywhere.
 * Two independent entries is the only control that catches it, so the confirm
 * field is required whenever the number changes.
 *
 * Paste is blocked on the confirm field alone. Pasting the same wrong value
 * twice confirms nothing, which is exactly what the field exists to prevent.
 *
 * SAVING DOES NOT VERIFY. Replacing an account clears the verification tick in
 * the database, and re-ticking it is a separate, deliberate act from the row
 * menu — otherwise "verified" would only ever mean "somebody typed this".
 */

import { useCallback, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, Loader2 } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getErrorMessage } from '@/lib/utils';
import { useSetStaffBankAccount } from '@/hooks/hr/use-staff-bank-accounts';
import {
  errorsByField,
  normaliseAccountNumber,
  normaliseIfsc,
  validateBankAccount,
} from '@/lib/hr/payroll/bank-account-validation';
import type { StaffBankDirectoryRow } from '@/lib/services/hr/payroll/staff-bank-account-service';

interface Props {
  row: StaffBankDirectoryRow | null;
  onOpenChange: (open: boolean) => void;
}

export function EditBankAccountDialog({ row, onOpenChange }: Props) {
  const setAccount = useSetStaffBankAccount();

  const [holder, setHolder] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [confirmNumber, setConfirmNumber] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [bankName, setBankName] = useState('');
  const [branch, setBranch] = useState('');
  const [accountType, setAccountType] = useState('savings');
  const [notes, setNotes] = useState('');
  const [touched, setTouched] = useState(false);

  /**
   * Seeded DURING RENDER, not in an effect — React's "adjusting state when a
   * prop changes" pattern. An effect would paint the previous employee's
   * account number first and correct it afterwards, and the React Compiler lint
   * rejects it outright.
   *
   * The account number itself is NOT seeded. The existing value is shown as a
   * masked hint instead, so a re-save is always a deliberate re-entry rather
   * than an accidental commit of whatever was already on screen.
   */
  const [seededFor, setSeededFor] = useState<string | null>(null);
  if (!row && seededFor !== null) {
    setSeededFor(null);
  } else if (row && seededFor !== row.staff_uuid) {
    setSeededFor(row.staff_uuid);
    setHolder(row.account_holder_name ?? row.person_name);
    setAccountNumber('');
    setConfirmNumber('');
    setIfsc(row.ifsc_code ?? '');
    setBankName(row.bank_name ?? '');
    setBranch(row.branch_name ?? '');
    setAccountType(row.account_type ?? 'savings');
    setNotes('');
    setTouched(false);
  }

  const errors = useMemo(
    () =>
      errorsByField(
        validateBankAccount({
          accountHolderName: holder,
          accountNumber,
          confirmAccountNumber: confirmNumber,
          ifscCode: ifsc,
          bankName,
          branchName: branch,
          accountType,
        })
      ),
    [accountNumber, accountType, bankName, branch, confirmNumber, holder, ifsc]
  );

  const isReplacement = Boolean(row?.account_id);
  const canSave = Object.keys(errors).length === 0 && !setAccount.isPending;
  /**
   * Saving without an IFSC is allowed but leaves the record unpayable, so it is
   * said out loud at the moment of saving rather than discovered at a payout run.
   */
  const willBeUnpayable =
    normaliseAccountNumber(accountNumber).length > 0 && !normaliseIfsc(ifsc);
  const show = (field: keyof typeof errors) => (touched ? errors[field] : undefined);

  const handleSave = useCallback(async () => {
    setTouched(true);
    if (!row || Object.keys(errors).length > 0) return;
    try {
      await setAccount.mutateAsync({
        staffId: row.staff_uuid,
        accountHolderName: holder.trim(),
        accountNumber: normaliseAccountNumber(accountNumber),
        ifscCode: ifsc,
        bankName: bankName.trim(),
        branchName: branch.trim() || null,
        accountType,
        notes: notes.trim() || null,
      });
      toast.success(
        isReplacement
          ? `Bank account replaced for ${row.person_name}. It now needs verifying.`
          : `Bank account recorded for ${row.person_name}.`
      );
      onOpenChange(false);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  }, [
    accountNumber, accountType, bankName, branch, errors, holder, ifsc,
    isReplacement, notes, onOpenChange, row, setAccount,
  ]);

  return (
    <Dialog open={Boolean(row)} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-lg'>
        <DialogHeader>
          <DialogTitle>{isReplacement ? 'Replace bank account' : 'Record bank account'}</DialogTitle>
          <DialogDescription>
            {row?.person_name}
            {row?.staff_code ? ` · ${row.staff_code}` : ''}
          </DialogDescription>
        </DialogHeader>

        {isReplacement && (
          <Alert>
            <AlertTriangle className='h-4 w-4' />
            <AlertDescription className='text-xs'>
              This replaces the account ending{' '}
              <span className='font-mono'>{(row?.account_number ?? '').slice(-4)}</span>. The old
              one is kept in the history, and the new one starts unverified.
            </AlertDescription>
          </Alert>
        )}

        <div className='space-y-4'>
          <div className='space-y-2'>
            <Label htmlFor='bank-holder'>Account holder name</Label>
            <Input
              id='bank-holder'
              value={holder}
              onChange={(e) => setHolder(e.target.value)}
              placeholder='As printed by the bank'
            />
            {show('accountHolderName') && (
              <p className='text-xs text-destructive'>{errors.accountHolderName}</p>
            )}
            <p className='text-xs text-muted-foreground'>
              Exactly as the bank holds it — a transfer is rejected on a name mismatch.
            </p>
          </div>

          <div className='grid grid-cols-2 gap-3'>
            <div className='space-y-2'>
              <Label htmlFor='bank-acct'>Account number</Label>
              <Input
                id='bank-acct'
                inputMode='numeric'
                autoComplete='off'
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                onBlur={() => setTouched(true)}
              />
              {show('accountNumber') && (
                <p className='text-xs text-destructive'>{errors.accountNumber}</p>
              )}
            </div>
            <div className='space-y-2'>
              <Label htmlFor='bank-acct-confirm'>Confirm account number</Label>
              <Input
                id='bank-acct-confirm'
                inputMode='numeric'
                autoComplete='off'
                value={confirmNumber}
                onChange={(e) => setConfirmNumber(e.target.value)}
                onBlur={() => setTouched(true)}
                // Pasting the same wrong value twice confirms nothing.
                onPaste={(e) => e.preventDefault()}
              />
              {show('confirmAccountNumber') && (
                <p className='text-xs text-destructive'>{errors.confirmAccountNumber}</p>
              )}
            </div>
          </div>

          <div className='grid grid-cols-2 gap-3'>
            <div className='space-y-2'>
              <Label htmlFor='bank-ifsc'>IFSC (optional)</Label>
              <Input
                id='bank-ifsc'
                autoComplete='off'
                className='font-mono uppercase'
                value={ifsc}
                onChange={(e) => setIfsc(e.target.value.toUpperCase())}
                onBlur={() => setTouched(true)}
                placeholder='SBIN0001234'
              />
              {show('ifscCode') && <p className='text-xs text-destructive'>{errors.ifscCode}</p>}
            </div>
            <div className='space-y-2'>
              <Label>Account type</Label>
              <Select value={accountType} onValueChange={setAccountType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value='savings'>Savings</SelectItem>
                  <SelectItem value='current'>Current</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className='grid grid-cols-2 gap-3'>
            <div className='space-y-2'>
              <Label htmlFor='bank-name'>Bank (optional)</Label>
              <Input
                id='bank-name'
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                onBlur={() => setTouched(true)}
              />
              {show('bankName') && <p className='text-xs text-destructive'>{errors.bankName}</p>}
            </div>
            <div className='space-y-2'>
              <Label htmlFor='bank-branch'>Branch (optional)</Label>
              <Input
                id='bank-branch'
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
              />
            </div>
          </div>

          {willBeUnpayable && (
            <Alert>
              <AlertTriangle className='h-4 w-4' />
              <AlertDescription className='text-xs'>
                Saved without an IFSC, this account is recorded but{' '}
                <span className='font-medium'>not payable</span> — a transfer needs the
                IFSC to route. It will show as <span className='font-medium'>Incomplete</span>{' '}
                until one is added.
              </AlertDescription>
            </Alert>
          )}

          <div className='space-y-2'>
            <Label htmlFor='bank-notes'>Notes (optional)</Label>
            <Textarea
              id='bank-notes'
              rows={2}
              placeholder='Why this account changed'
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {setAccount.isPending && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
            {isReplacement ? 'Replace account' : 'Record account'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
