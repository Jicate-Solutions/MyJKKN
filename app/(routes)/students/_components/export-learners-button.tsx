'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Loader2 } from 'lucide-react';
import { StudentFilters } from '@/types/student';
import toast from 'react-hot-toast';

interface ExportLearnersButtonProps {
  filters?: StudentFilters;
}

export function ExportLearnersButton({ filters }: ExportLearnersButtonProps) {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      // Build query parameters from filters
      const params = new URLSearchParams();
      if (filters?.institution) params.append('institution', filters.institution);
      if (filters?.department) params.append('department', filters.department);
      if (filters?.program) params.append('program', filters.program);
      if (filters?.semester) params.append('semester', filters.semester);
      if (filters?.section) params.append('section', filters.section);
      if (filters?.status) params.append('status', filters.status);
      if (filters?.is_profile_complete !== undefined) {
        params.append('is_profile_complete', String(filters.is_profile_complete));
      }

      const response = await fetch(
        `/api/students/export-learners?${params.toString()}`
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Export failed');
      }

      // Download file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `learners_for_editing_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success('Learners exported successfully!');
    } catch (error) {
      console.error('Export error:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to export learners'
      );
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Button
      onClick={handleExport}
      disabled={isExporting}
      variant='outline'
      size='sm'
    >
      {isExporting ? (
        <>
          <Loader2 className='mr-2 h-4 w-4 animate-spin' />
          Exporting...
        </>
      ) : (
        <>
          <Download className='mr-2 h-4 w-4' />
          Export for Editing
        </>
      )}
    </Button>
  );
}
