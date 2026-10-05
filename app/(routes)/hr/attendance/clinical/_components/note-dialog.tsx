'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  label: string;
  confirmLabel: string;
  pending: boolean;
  onConfirm: (text: string) => void;
}

/** A required free-text note: the DB rejects a reject without a note and a revoke without a reason. */
export function NoteDialog({
  open, onOpenChange, title, description, label, confirmLabel, pending, onConfirm,
}: Props) {
  const [text, setText] = useState('');

  useEffect(() => {
    if (open) setText('');
  }, [open]);

  const trimmed = text.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="clinical-note">
            {label} <span className="text-red-500">*</span>
          </Label>
          <Textarea
            id="clinical-note"
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={500}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!trimmed || pending}
            onClick={() => onConfirm(trimmed)}
          >
            {pending ? 'Saving…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
