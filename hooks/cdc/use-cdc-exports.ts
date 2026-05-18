// CDC Export hooks — agent ζ Sprint 7b
'use client';

import { useState } from 'react';
import type { ExportFormat, FlexExportRequest } from '@/types/cdc/exports';

interface UseExportState {
  loading: boolean;
  error: string | null;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function useNaacExport() {
  const [state, setState] = useState<UseExportState>({
    loading: false,
    error: null,
  });

  async function exportNaac(cycle: string, format: ExportFormat) {
    setState({ loading: true, error: null });
    try {
      const res = await fetch('/api/cdc/exports/naac', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cycle, format }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Export failed' }));
        throw new Error(err.error ?? 'Export failed');
      }

      const filename =
        res.headers.get('x-filename') ?? `naac_${cycle}.${format}`;
      const blob = await res.blob();
      downloadBlob(blob, filename);
      setState({ loading: false, error: null });
    } catch (e) {
      setState({ loading: false, error: (e as Error).message });
    }
  }

  return { exportNaac, ...state };
}

export function useAicteExport() {
  const [state, setState] = useState<UseExportState>({
    loading: false,
    error: null,
  });

  async function exportAicte(year: number, format: ExportFormat) {
    setState({ loading: true, error: null });
    try {
      const res = await fetch('/api/cdc/exports/aicte', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, format }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Export failed' }));
        throw new Error(err.error ?? 'Export failed');
      }

      const filename =
        res.headers.get('x-filename') ?? `aicte_${year}.${format}`;
      const blob = await res.blob();
      downloadBlob(blob, filename);
      setState({ loading: false, error: null });
    } catch (e) {
      setState({ loading: false, error: (e as Error).message });
    }
  }

  return { exportAicte, ...state };
}

export function useFlexExport() {
  const [state, setState] = useState<UseExportState>({
    loading: false,
    error: null,
  });

  async function exportFlex(req: FlexExportRequest) {
    setState({ loading: true, error: null });
    try {
      const res = await fetch('/api/cdc/exports/flex', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Export failed' }));
        throw new Error(err.error ?? 'Export failed');
      }

      const filename =
        res.headers.get('x-filename') ??
        `flex_${req.table}.${req.format}`;
      const blob = await res.blob();
      downloadBlob(blob, filename);
      setState({ loading: false, error: null });
    } catch (e) {
      setState({ loading: false, error: (e as Error).message });
    }
  }

  return { exportFlex, ...state };
}
