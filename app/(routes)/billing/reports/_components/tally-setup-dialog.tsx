'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BeatLoader } from 'react-spinners';
import { Download, Upload } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { daywiseModeLabel } from '@/lib/services/billing/reports/collection-daywise';
import {
  TALLY_BOOK_LABELS,
  TALLY_MODES,
  type TallyBook,
  type TallyModeLedgers
} from '@/lib/services/billing/reports/collection-tally';
import { TallySetupService } from '@/lib/services/billing/reports/tally-setup-service';

interface TallySetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  institutionId: string;
  institutionName: string;
}

const errorText = (err: unknown, fallback: string) =>
  (err as { message?: string })?.message || fallback;

/**
 * Ledger names the Tally XML download needs for one institution: which
 * cash/bank ledger each payment mode posts to, and each learner's ledger name
 * by MyJKKN ID. Kept per book because Transport Maintenance Fee is accounted
 * in a separate Tally company.
 */
export function TallySetupDialog({
  open,
  onOpenChange,
  institutionId,
  institutionName
}: TallySetupDialogProps) {
  const [book, setBook] = useState<TallyBook>('fees');
  const [modeLedgers, setModeLedgers] = useState<TallyModeLedgers>({});
  const [mappedCount, setMappedCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || !institutionId) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      TallySetupService.getModeLedgers(institutionId, book),
      TallySetupService.getLedgerMap(institutionId, book)
    ])
      .then(([ledgers, map]) => {
        if (cancelled) return;
        setModeLedgers(ledgers);
        setMappedCount(map.size);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Tally setup load failed:', err);
        toast.error(errorText(err, 'Could not load the Tally setup'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, institutionId, book]);

  const handleSave = async () => {
    try {
      setSaving(true);
      await TallySetupService.saveModeLedgers(institutionId, book, modeLedgers);
      toast.success('Tally ledgers saved');
    } catch (err) {
      console.error('Tally ledgers save failed:', err);
      toast.error(errorText(err, 'Could not save the Tally ledgers'));
    } finally {
      setSaving(false);
    }
  };

  const handleTemplate = async () => {
    try {
      const { downloadTallyMappingTemplate } = await import(
        '@/lib/services/billing/reports/collection-tally-files'
      );
      await downloadTallyMappingTemplate('tally-learner-ledger-mapping.xlsx');
    } catch (err) {
      console.error('Tally mapping template failed:', err);
      toast.error('Could not create the template');
    }
  };

  const handleUpload = async (file: File | undefined) => {
    if (!file) return;
    try {
      setUploading(true);
      const { readTallyMappingFile } = await import(
        '@/lib/services/billing/reports/collection-tally-files'
      );
      const parsed = await readTallyMappingFile(file);
      if (!parsed) {
        toast.error('No sheet has both a "MyJKKN ID" and a "Tally Ledger Name" column.');
        return;
      }
      if (parsed.entries.length === 0) {
        toast.error('No row has a Tally ledger name filled in.');
        return;
      }
      await TallySetupService.upsertLedgers(institutionId, book, parsed.entries);
      const map = await TallySetupService.getLedgerMap(institutionId, book);
      setMappedCount(map.size);
      toast.success(
        `${parsed.entries.length} learner ledger${parsed.entries.length === 1 ? '' : 's'} saved` +
          (parsed.blank > 0 ? ` · ${parsed.blank} blank row${parsed.blank === 1 ? '' : 's'} ignored` : '')
      );
    } catch (err) {
      console.error('Tally mapping upload failed:', err);
      toast.error(errorText(err, 'Could not save the learner ledgers'));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-xl'>
        <DialogHeader>
          <DialogTitle>Tally Setup</DialogTitle>
          <DialogDescription>
            {institutionName} — ledger names exactly as they are spelled in Tally.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={book} onValueChange={(v) => setBook(v as TallyBook)}>
          <TabsList className='grid w-full grid-cols-2'>
            <TabsTrigger value='fees'>{TALLY_BOOK_LABELS.fees}</TabsTrigger>
            <TabsTrigger value='transport'>{TALLY_BOOK_LABELS.transport}</TabsTrigger>
          </TabsList>
        </Tabs>

        {loading ? (
          <div className='flex justify-center py-10'>
            <BeatLoader color='#00e902' />
          </div>
        ) : (
          <div className='space-y-6'>
            <div className='space-y-3'>
              <div>
                <h4 className='text-sm font-semibold'>Cash / bank ledgers</h4>
                <p className='text-xs text-muted-foreground'>
                  The Tally ledger each payment mode is received into, copied from Tally&apos;s
                  ledger list — for example <span className='font-medium'>Cash</span> or{' '}
                  <span className='font-medium'>HDFC A/C 50100843279416</span>. Leave a mode blank
                  to keep its receipts out of the file. Combined payments are never exported.
                </p>
              </div>
              {TALLY_MODES.map((m) => (
                <div key={m} className='grid grid-cols-1 items-center gap-1.5 sm:grid-cols-[140px_1fr]'>
                  <Label htmlFor={`tally-ledger-${m}`} className='text-sm'>
                    {daywiseModeLabel(m)}
                  </Label>
                  <Input
                    id={`tally-ledger-${m}`}
                    placeholder={m === 'cash' ? 'e.g. Cash' : 'e.g. HDFC A/C 50100843279416'}
                    value={modeLedgers[m] ?? ''}
                    onChange={(e) => setModeLedgers((prev) => ({ ...prev, [m]: e.target.value }))}
                  />
                </div>
              ))}
              <div className='flex justify-end'>
                <Button size='sm' onClick={handleSave} disabled={saving} className='min-w-[120px]'>
                  {saving ? <BeatLoader size={8} color='currentColor' /> : 'Save Ledgers'}
                </Button>
              </div>
            </div>

            <div className='space-y-3 border-t pt-4'>
              <div>
                <h4 className='text-sm font-semibold'>Learner ledgers</h4>
                <p className='text-xs text-muted-foreground'>
                  {`${mappedCount.toLocaleString('en-IN')} ${mappedCount === 1 ? 'learner' : 'learners'} mapped. `}
                  Upload a sheet with a MyJKKN ID and a Tally Ledger Name column — the
                  &quot;not exported&quot; file from a Tally download is already in that layout.
                  Uploading again replaces the name of a learner already mapped.
                </p>
              </div>
              <div className='flex flex-wrap gap-2'>
                <Button variant='outline' size='sm' onClick={handleTemplate}>
                  <Download className='h-4 w-4 mr-2' />
                  Blank Template
                </Button>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className='min-w-[150px]'
                >
                  {uploading ? (
                    <BeatLoader size={8} color='currentColor' />
                  ) : (
                    <>
                      <Upload className='h-4 w-4 mr-2' />
                      Upload Mapping
                    </>
                  )}
                </Button>
                <input
                  ref={fileRef}
                  type='file'
                  accept='.xlsx,.xls'
                  className='hidden'
                  onChange={(e) => handleUpload(e.target.files?.[0])}
                />
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
