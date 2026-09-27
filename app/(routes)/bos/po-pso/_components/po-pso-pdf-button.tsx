'use client';

import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PoPsoScopeKey } from '@/hooks/bos/use-bos-po-pso';

interface PoPsoPdfDownloadButtonProps {
  scopeKey: PoPsoScopeKey;
  /** File name without extension, e.g. "ECE-R-2026-PO-PSO". */
  fileStem: string;
}

/**
 * Downloads the PO & PSO document (letterhead, POs, PSOs, Course – PO/PSO
 * matrix) for the selected programme + regulation from /api/bos/po-pso/pdf.
 * Read-only: anyone who can see the tabs can download them.
 */
export function PoPsoPdfDownloadButton({ scopeKey, fileStem }: PoPsoPdfDownloadButtonProps) {
  const [loading, setLoading] = useState(false);
  const ready = !!scopeKey.institutionsId && !!scopeKey.regulationId && !!scopeKey.programmeCode;

  const handleClick = async () => {
    if (!ready || loading) return;
    setLoading(true);
    const tid = toast.loading('Generating PO & PSO PDF…');
    try {
      const params = new URLSearchParams({
        institutionsId: scopeKey.institutionsId ?? '',
        regulationId: scopeKey.regulationId ?? '',
        programmeCode: scopeKey.programmeCode ?? '',
      });
      const res = await fetch(`/api/bos/po-pso/pdf?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Failed to generate PDF');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fileStem}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('PO & PSO PDF downloaded', { id: tid });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate PDF', { id: tid });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant='outline' size='sm' onClick={handleClick} disabled={!ready || loading}>
      {loading ? <Loader2 className='h-4 w-4 mr-1.5 animate-spin' /> : <Download className='h-4 w-4 mr-1.5' />}
      Download PDF
    </Button>
  );
}
