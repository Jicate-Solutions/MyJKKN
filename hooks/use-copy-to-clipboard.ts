import { useState } from 'react';
import { toast } from 'sonner';

export function useCopyToClipboard() {
  const [copied, setCopied] = useState(false);

  const copy = async (text: string, label?: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(`${label || 'Code'} copied to clipboard`);

      // Reset copied state after 2 seconds
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      toast.error('Failed to copy to clipboard');
    }
  };

  return { copied, copy };
}
