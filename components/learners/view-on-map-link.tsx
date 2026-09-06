'use client';

// "View on Map" — resolves the learner's address to coordinates and opens
// Google Maps in a new tab (plain URL, no SDK/key — same pattern as the
// parent-portal contact page). Resolution order:
//   1. picked post office (post_office_id) → exact lat/long
//   2. pincode → first post office of that pin that has coordinates
// Renders nothing when neither resolves, so legacy rows without a pincode
// match simply show no link.

import { ExternalLink, MapPin } from 'lucide-react';
import { usePincodeLookup, usePostOffice } from '@/hooks/use-postal-codes';

interface ViewOnMapLinkProps {
  postOfficeId?: string | null;
  pincode?: string | null;
  className?: string;
}

export function ViewOnMapLink({ postOfficeId, pincode, className }: ViewOnMapLinkProps) {
  const { data: office } = usePostOffice(postOfficeId);
  // Pincode fallback only fetches when no office coords resolved
  const needFallback = !office?.latitude || !office?.longitude;
  const { data: lookup } = usePincodeLookup(pincode ?? '', needFallback);

  let lat: number | null = null;
  let lng: number | null = null;
  let label = '';
  if (office?.latitude && office?.longitude) {
    lat = office.latitude;
    lng = office.longitude;
    label = office.office_name;
  } else {
    const fallback = lookup?.offices.find((o) => o.latitude && o.longitude);
    if (fallback) {
      lat = fallback.latitude;
      lng = fallback.longitude;
      label = `${fallback.pincode} area`;
    }
  }

  if (lat == null || lng == null) return null;

  return (
    <a
      href={`https://www.google.com/maps?q=${lat},${lng}`}
      target="_blank"
      rel="noopener noreferrer"
      title={`Open ${label} in Google Maps`}
      className={
        className ??
        'inline-flex items-center gap-1 text-xs text-primary hover:underline'
      }
    >
      <MapPin className="h-3.5 w-3.5" />
      View on Map
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}
