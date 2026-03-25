'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Plus, Upload } from 'lucide-react';
import BulkUploadEnquiries from './bulk-upload-enquiries';
import { useRouter } from 'next/navigation';

/**
 * Enquiries Page Header (Client Component)
 *
 * Features:
 * - New Enquiry button
 * - Advanced bulk upload with preview and validation
 * - Auto-refresh after import
 */
export function EnquiriesHeader() {
  const router = useRouter();

  // Handle import completion - refresh server component data
  const handleImportComplete = () => {
    router.refresh(); // Refresh server components to show new data
  };

  return (
    <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
      <div>
        <h1 className="text-2xl font-bold py-1">Admission Management</h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Manage admission lifecycle: enquiries, pending applications, rejections, and waitlist
        </p>
      </div>

      <div className="flex gap-2">
        {/* Advanced Bulk Upload with Preview */}
        <BulkUploadEnquiries onSuccess={handleImportComplete} />

        {/* New Enquiry Button */}
        <Button asChild>
          <Link href="/learners/enquiries/new">
            <Plus className="mr-2 h-4 w-4" />
            New Enquiry
          </Link>
        </Button>
      </div>
    </div>
  );
}
