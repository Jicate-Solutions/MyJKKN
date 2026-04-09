'use client';

import { Phone, PenLine, MessageCircle, StickyNote } from 'lucide-react';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface MobileActionsProps {
  phone: string;
  onLogCall: () => void;
  onWhatsApp: () => void;
  onNote: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MobileActions({
  phone,
  onLogCall,
  onWhatsApp,
  onNote,
}: MobileActionsProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {/* Call — native tel: link */}
      <a
        href={`tel:${phone}`}
        className="flex items-center justify-center gap-2 h-14 rounded-lg bg-green-600 text-white font-medium text-sm active:scale-[0.97] transition-transform"
      >
        <Phone className="h-5 w-5" />
        <span>Call</span>
      </a>

      {/* Log Call */}
      <button
        type="button"
        onClick={onLogCall}
        className="flex items-center justify-center gap-2 h-14 rounded-lg border-2 border-green-600 text-green-700 font-medium text-sm bg-white active:scale-[0.97] transition-transform"
      >
        <PenLine className="h-5 w-5" />
        <span>Log Call</span>
      </button>

      {/* WhatsApp */}
      <button
        type="button"
        onClick={onWhatsApp}
        className="flex items-center justify-center gap-2 h-14 rounded-lg bg-green-500 text-white font-medium text-sm active:scale-[0.97] transition-transform"
      >
        <MessageCircle className="h-5 w-5" />
        <span>WhatsApp</span>
      </button>

      {/* Note */}
      <button
        type="button"
        onClick={onNote}
        className="flex items-center justify-center gap-2 h-14 rounded-lg bg-gray-100 text-gray-700 font-medium text-sm active:scale-[0.97] transition-transform"
      >
        <StickyNote className="h-5 w-5" />
        <span>Note</span>
      </button>
    </div>
  );
}
