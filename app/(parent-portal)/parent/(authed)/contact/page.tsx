'use client';

import { Card } from '@/components/ui/card';
import { Phone, Mail, MapPin } from 'lucide-react';
import { useParentSession } from '@/hooks/parent/use-parent-session';

export default function ContactPage() {
  const { activeChild } = useParentSession();
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Contact Us</h1>
      <Card className="divide-y divide-black/5 dark:divide-white/10">
        <div className="p-4">
          <p className="font-semibold">{activeChild?.institutionName ?? 'JKKN Institutions'}</p>
        </div>
        <a href="tel:+914286000000" className="flex items-center gap-3 p-4 text-sm">
          <Phone className="h-5 w-5 text-[#0b6d41]" />
          <span className="flex-1">Call the office</span>
        </a>
        <a href="mailto:info@jkkn.ac.in" className="flex items-center gap-3 p-4 text-sm">
          <Mail className="h-5 w-5 text-[#0b6d41]" />
          <span className="flex-1">info@jkkn.ac.in</span>
        </a>
        <a
          href="https://maps.google.com/?q=JKKN+Educational+Institutions"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 p-4 text-sm"
        >
          <MapPin className="h-5 w-5 text-[#0b6d41]" />
          <span className="flex-1">View on map</span>
        </a>
      </Card>
    </div>
  );
}
