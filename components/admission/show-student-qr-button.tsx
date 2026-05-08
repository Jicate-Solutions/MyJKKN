'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScanLine } from 'lucide-react';
import { StudentFormQRDialog } from './student-form-qr-dialog';

interface Props {
  learnerProfileId: string;
  alreadySubmitted?: boolean;
  size?: 'sm' | 'default';
}

export function ShowStudentQRButton({ learnerProfileId, alreadySubmitted, size = 'sm' }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        size={size}
        onClick={(e) => {
          // Prevent native form submission when this button is rendered
          // inside a <form> (e.g. /learners/enquiries/[id]/edit). Without
          // explicit type='button' AND stopPropagation, react-hook-form
          // sees the click as a submit and fires onInvalid, producing the
          // 'Validation Failed: Please check Basic Details' toast.
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        disabled={alreadySubmitted}
        title={alreadySubmitted ? 'Student form already submitted' : 'Show QR for student to scan'}
        className="gap-1"
      >
        <ScanLine className="h-4 w-4" />
        Show Student QR
      </Button>
      <StudentFormQRDialog
        open={open}
        onOpenChange={setOpen}
        learnerProfileId={learnerProfileId}
      />
    </>
  );
}
