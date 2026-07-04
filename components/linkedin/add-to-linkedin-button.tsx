'use client';

import { Linkedin } from 'lucide-react';
import {
  buildAddToProfileUrl,
  type AddToProfileCert,
} from '@/lib/linkedin/add-to-profile';

interface AddToLinkedInButtonProps {
  cert: AddToProfileCert;
  className?: string;
  /** Override the visible label. */
  label?: string;
}

/**
 * "Add to LinkedIn profile" button for a certification.
 *
 * Opens LinkedIn's pre-filled "add a certification" dialog in a new tab.
 * Renders nothing if there is no certification name to add.
 */
export function AddToLinkedInButton({
  cert,
  className = '',
  label = 'Add to LinkedIn profile',
}: AddToLinkedInButtonProps) {
  if (!cert?.name) return null;

  const url = buildAddToProfileUrl(cert);

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className={`inline-flex items-center justify-center gap-2 rounded-lg bg-[#0A66C2] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#004182] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0A66C2] ${className}`}
    >
      <Linkedin className="h-4 w-4" aria-hidden="true" />
      {label}
    </a>
  );
}
