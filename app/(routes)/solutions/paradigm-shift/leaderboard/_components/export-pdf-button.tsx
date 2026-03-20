'use client';

import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';

export function ExportPDFButton() {
  const handleExport = () => {
    const style = document.createElement('style');
    style.id = 'print-styles';
    style.textContent = `
      @media print {
        nav, header, [data-sidebar], .no-print, button { display: none !important; }
        main { margin: 0 !important; padding: 1rem !important; max-width: 100% !important; }
        * { overflow: visible !important; }
        @page { margin: 1cm; size: A4 landscape; }
      }
    `;
    document.head.appendChild(style);
    window.print();
    setTimeout(() => {
      document.getElementById('print-styles')?.remove();
    }, 1000);
  };

  return (
    <Button variant="outline" size="sm" onClick={handleExport} className="no-print">
      <Download className="h-4 w-4 mr-2" />
      Export PDF
    </Button>
  );
}
