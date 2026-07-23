'use client';

// ============================================================
// /cdc/admin/recruiters — Recruiter directory CRUD
// ============================================================
// Recruiters have more fields than simple master tables
// (contact info, package bands, blacklist). Uses the generic
// MasterTablePage for the list + toggle, but extends the modal
// fields via extraFields.
// ============================================================

import { MasterTablePage } from '../_components/master-table-page';
import { Badge } from '@/components/ui/badge';

export default function RecruitersPage() {
  return (
    <MasterTablePage
      tableName="cdc_recruiters"
      title="Recruiter Directory"
      description="Company and recruiter master. Manage contact details, package bands, and blacklist status. Paginated — 50 per page."
      breadcrumbs={[
        { label: 'CDC', href: '/cdc' },
        { label: 'Admin', href: '/cdc/admin' },
        { label: 'Recruiters', href: '/cdc/admin/recruiters' },
      ]}
      extraFields={[
        { key: 'legal_name', label: 'Legal name', type: 'text', placeholder: 'e.g. Infosys Limited' },
        { key: 'website', label: 'Website', type: 'text', placeholder: 'https://...' },
        { key: 'hq_city', label: 'HQ city', type: 'text', placeholder: 'Chennai' },
        { key: 'hq_state', label: 'HQ state', type: 'text', placeholder: 'Tamil Nadu' },
        { key: 'hq_country', label: 'HQ country', type: 'text', placeholder: 'India' },
        { key: 'primary_contact_name', label: 'Contact name', type: 'text' },
        { key: 'primary_contact_email', label: 'Contact email', type: 'text' },
        { key: 'primary_contact_phone', label: 'Contact phone', type: 'text' },
        { key: 'package_band_min_lpa', label: 'Package min (LPA)', type: 'number', placeholder: '3.5' },
        { key: 'package_band_max_lpa', label: 'Package max (LPA)', type: 'number', placeholder: '12' },
        { key: 'operates_weekends', label: 'Operates weekends', type: 'boolean' },
        { key: 'is_internal', label: 'JKKN-internal recruiter', type: 'boolean' },
        { key: 'is_blacklisted', label: 'Blacklisted', type: 'boolean' },
        { key: 'blacklist_reason', label: 'Blacklist reason', type: 'textarea', placeholder: 'Required if blacklisted' },
        { key: 'notes', label: 'Notes', type: 'textarea' },
      ]}
      extraListColumns={[
        {
          key: 'hq_city',
          label: 'Location',
          render: (row) => (
            <span className="text-muted-foreground text-xs">
              {[row.hq_city, row.hq_state].filter(Boolean).join(', ') || '—'}
            </span>
          ),
        },
        {
          key: 'package_band_min_lpa',
          label: 'Package (LPA)',
          render: (row) =>
            row.package_band_min_lpa != null ? (
              <span className="text-sm">
                {row.package_band_min_lpa}–{row.package_band_max_lpa ?? '?'}
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            ),
        },
        {
          key: 'is_blacklisted',
          label: 'Blacklist',
          render: (row) =>
            row.is_blacklisted ? (
              <Badge variant="destructive" className="text-xs">Blacklisted</Badge>
            ) : (
              <span className="text-muted-foreground text-xs">—</span>
            ),
        },
      ]}
    />
  );
}
