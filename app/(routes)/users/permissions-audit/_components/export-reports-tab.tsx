'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Grid3X3,
  AlertCircle,
  Shield,
  Database,
  Package,
  Download,
  FileSpreadsheet,
  FileJson,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReportType {
  id: string;
  icon: React.ElementType;
  title: string;
  description: string;
}

type ExportFormat = 'excel' | 'json';

// ─── Report Types ─────────────────────────────────────────────────────────────

const REPORT_TYPES: ReportType[] = [
  {
    id: 'full_matrix',
    icon: Grid3X3,
    title: 'Full Access Matrix',
    description: 'Complete roles x permissions matrix with RLS and summary'
  },
  {
    id: 'conflicts',
    icon: AlertCircle,
    title: 'Conflicts Report',
    description: 'Cross-layer mismatches where code and database disagree'
  },
  {
    id: 'role_summary',
    icon: Shield,
    title: 'Role Summary',
    description: 'Detailed access for a specific role across all modules'
  },
  {
    id: 'rls_coverage',
    icon: Database,
    title: 'RLS Coverage',
    description: 'Tables with/without policies and missing operations'
  },
  {
    id: 'module_summary',
    icon: Package,
    title: 'Module Summary',
    description: 'All roles access levels for a specific module'
  }
];

// ─── Component ────────────────────────────────────────────────────────────────

export function ExportReportsTab() {
  const [selectedReport, setSelectedReport] = useState<string>('full_matrix');
  const [format, setFormat] = useState<ExportFormat>('excel');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        type: selectedReport,
        format
      });

      const res = await fetch(`/api/users/permissions-audit/export?${params}`);

      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.error || `Export failed (HTTP ${res.status})`);
      }

      if (format === 'excel') {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `permissions-audit-${new Date().toISOString().split('T')[0]}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        const json = await res.json();
        const blob = new Blob([JSON.stringify(json, null, 2)], {
          type: 'application/json'
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `permissions-audit-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }

      toast.success('Report downloaded successfully');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate report';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className='space-y-4'>
      {/* ── Report Type Cards ─────────────────────────────────────────────── */}
      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3'>
        {REPORT_TYPES.map((report) => {
          const Icon = report.icon;
          const isSelected = selectedReport === report.id;

          return (
            <Card
              key={report.id}
              className={cn(
                'cursor-pointer transition-all hover:shadow-sm',
                isSelected
                  ? 'border-primary ring-2 ring-primary/20'
                  : 'border-border hover:border-muted-foreground/30'
              )}
              onClick={() => setSelectedReport(report.id)}
            >
              <CardContent className='pt-4 pb-3 px-4'>
                <div className='flex items-start gap-3'>
                  <div
                    className={cn(
                      'p-2 rounded-md shrink-0',
                      isSelected
                        ? 'bg-primary/10 text-primary'
                        : 'bg-muted text-muted-foreground'
                    )}
                  >
                    <Icon className='h-4 w-4' />
                  </div>
                  <div className='min-w-0'>
                    <p
                      className={cn(
                        'text-sm font-semibold leading-snug',
                        isSelected ? 'text-primary' : 'text-foreground'
                      )}
                    >
                      {report.title}
                    </p>
                    <p className='text-xs text-muted-foreground mt-0.5 leading-relaxed'>
                      {report.description}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ── Controls ──────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className='pb-3'>
          <CardTitle className='text-base font-semibold flex items-center gap-2'>
            <Download className='h-4 w-4 text-indigo-500' />
            Export Settings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className='flex flex-col sm:flex-row items-start sm:items-end gap-4'>
            {/* Format selector */}
            <div className='flex flex-col gap-1.5'>
              <label className='text-xs text-muted-foreground font-medium'>
                Format
              </label>
              <div className='flex gap-2'>
                <Button
                  variant={format === 'excel' ? 'default' : 'outline'}
                  size='sm'
                  className='h-9 px-4'
                  onClick={() => setFormat('excel')}
                >
                  <FileSpreadsheet className='h-4 w-4 mr-2' />
                  Excel
                </Button>
                <Button
                  variant={format === 'json' ? 'default' : 'outline'}
                  size='sm'
                  className='h-9 px-4'
                  onClick={() => setFormat('json')}
                >
                  <FileJson className='h-4 w-4 mr-2' />
                  JSON
                </Button>
              </div>
            </div>

            {/* Generate button */}
            <Button
              onClick={handleDownload}
              disabled={loading}
              className='h-9 px-5 shrink-0'
            >
              {loading ? (
                <Loader2 className='h-4 w-4 mr-2 animate-spin' />
              ) : (
                <Download className='h-4 w-4 mr-2' />
              )}
              {loading ? 'Generating...' : 'Generate Report'}
            </Button>
          </div>

          {/* Error alert */}
          {error && (
            <Alert variant='destructive' className='mt-4'>
              <AlertCircle className='h-4 w-4' />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
