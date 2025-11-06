'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { StudentFilters } from '@/types/student';

interface ExportForUpdateButtonProps {
  filters?: StudentFilters;
}

export function ExportForUpdateButton({
  filters
}: ExportForUpdateButtonProps) {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      // Build query params from filters
      const params = new URLSearchParams();

      if (filters?.institution) {
        params.append('institution', filters.institution);
      }
      if (filters?.department) {
        params.append('department', filters.department);
      }
      if (filters?.program) {
        params.append('program', filters.program);
      }
      if (filters?.semester) {
        params.append('semester', filters.semester);
      }
      if (filters?.section) {
        params.append('section', filters.section);
      }
      if (filters?.status) {
        params.append('status', filters.status);
      }

      // Call export API
      const response = await fetch(
        `/api/students/export-for-update?${params.toString()}`
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Export failed');
      }

      // Download the file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `students_for_update_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success('Students exported successfully for update!');
    } catch (error) {
      console.error('Error exporting students:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to export students'
      );
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Button
      variant='outline'
      onClick={handleExport}
      disabled={isExporting}
      className='w-full sm:w-auto'
    >
      {isExporting ? (
        <>
          <Loader2 className='mr-2 h-4 w-4 animate-spin' />
          Exporting...
        </>
      ) : (
        <>
          <Download className='mr-2 h-4 w-4' />
          Export for Update
        </>
      )}
    </Button>
  );
}
