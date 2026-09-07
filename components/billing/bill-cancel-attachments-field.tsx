'use client';

import { useRef, useState } from 'react';
import { Paperclip, X, Loader2, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'react-hot-toast';
import type { BillCancellationAttachment } from '@/types/billing-bill-cancellation';

interface Props {
  value: BillCancellationAttachment[];
  onChange: (attachments: BillCancellationAttachment[]) => void;
  institutionName: string;
  billRef: string;
  disabled?: boolean;
}

export function BillCancelAttachmentsField({
  value,
  onChange,
  institutionName,
  billRef,
  disabled,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    // Accumulate successes as we go and commit them even if a later file fails,
    // so an already-uploaded Drive object is never orphaned/lost from the form.
    const uploaded: BillCancellationAttachment[] = [];
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append('file', file);
        form.append('institutionName', institutionName);
        form.append('billRef', billRef);
        const res = await fetch('/api/billing/bills/cancellations/attachments', {
          method: 'POST',
          body: form,
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || `Upload failed: ${file.name}`);
        uploaded.push(json);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      if (uploaded.length > 0) onChange([...value, ...uploaded]);
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className='space-y-2'>
      <input
        ref={inputRef}
        type='file'
        multiple
        className='hidden'
        onChange={(e) => handleFiles(e.target.files)}
      />
      <Button
        type='button'
        variant='outline'
        size='sm'
        disabled={uploading || disabled}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? (
          <Loader2 className='h-4 w-4 mr-2 animate-spin' />
        ) : (
          <Paperclip className='h-4 w-4 mr-2' />
        )}
        {uploading ? 'Uploading…' : 'Attach files'}
      </Button>
      {value.length > 0 && (
        <ul className='space-y-1'>
          {value.map((a, i) => (
            <li key={a.drive_file_id} className='flex items-center gap-2 text-sm'>
              <FileText className='h-3.5 w-3.5 text-muted-foreground shrink-0' />
              <a
                href={a.drive_url}
                target='_blank'
                rel='noreferrer'
                className='underline truncate max-w-[260px]'
              >
                {a.name}
              </a>
              <button
                type='button'
                disabled={disabled}
                onClick={() => onChange(value.filter((_, j) => j !== i))}
              >
                <X className='h-3.5 w-3.5 text-muted-foreground hover:text-destructive' />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
