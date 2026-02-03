'use client'

import Link from 'next/link'
import { Building2, Phone, Mail, MapPin, Users, ExternalLink } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PartnerBadge } from './partner-badge'
import type { SHClient } from '@/types/solutions'

interface ClientCardProps {
  client: SHClient
  showActions?: boolean
}

export function ClientCard({ client, showActions = true }: ClientCardProps) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold leading-none">{client.name}</h3>
              <p className="text-sm text-muted-foreground">{client.industry}</p>
            </div>
          </div>
          <PartnerBadge status={client.partner_status} showDiscount />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Contact Person */}
        <div className="flex items-center gap-2 text-sm">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span>{client.contact_person}</span>
        </div>

        {/* Phone */}
        <div className="flex items-center gap-2 text-sm">
          <Phone className="h-4 w-4 text-muted-foreground" />
          <a
            href={`tel:${client.contact_phone}`}
            className="hover:text-primary hover:underline"
          >
            {client.contact_phone}
          </a>
        </div>

        {/* Email */}
        {client.contact_email && (
          <div className="flex items-center gap-2 text-sm">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <a
              href={`mailto:${client.contact_email}`}
              className="hover:text-primary hover:underline truncate"
            >
              {client.contact_email}
            </a>
          </div>
        )}

        {/* Location */}
        {client.city && (
          <div className="flex items-center gap-2 text-sm">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <span>{client.city}</span>
          </div>
        )}

        {/* Referral Count */}
        {client.referral_count > 0 && (
          <div className="pt-2 border-t">
            <span className="text-sm text-muted-foreground">
              {client.referral_count} referral{client.referral_count !== 1 ? 's' : ''} made
            </span>
          </div>
        )}

        {/* Actions */}
        {showActions && (
          <div className="pt-3 border-t flex gap-2">
            <Button asChild variant="outline" size="sm" className="flex-1">
              <Link href={`/solutions/clients/${client.id}`}>
                View Details
                <ExternalLink className="ml-2 h-3 w-3" />
              </Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
