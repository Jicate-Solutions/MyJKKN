'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CopyIcon, CheckIcon } from 'lucide-react';

interface Props {
  token: string;
  size?: 'sm' | 'default';
}

export function CopyShareUrlButton({ token, size = 'sm' }: Props) {
  const [copied, setCopied] = useState(false);
  const url =
    typeof window !== 'undefined'
      ? `${window.location.origin}/c/${token}`
      : `/c/${token}`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.error('Clipboard copy failed', e);
    }
  }

  return (
    <Button variant="outline" size={size} onClick={handleCopy}>
      {copied ? (
        <CheckIcon className="mr-2 size-4" />
      ) : (
        <CopyIcon className="mr-2 size-4" />
      )}
      {copied ? 'Copied!' : 'Copy share URL'}
    </Button>
  );
}
