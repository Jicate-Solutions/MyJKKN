'use client';

// ════════════════════════════════════════════════════════════════════════════
// Details Tab
// All read-only profile cards: Personal Info, Sources Captured, Academic,
// Address, Parent / Guardian, Source & Timeline, Assignment, Notes. Extracted
// from page.tsx as part of the monolith reduction (PR-D / phase 1).
// Pure refactor — zero behavior change.
// ════════════════════════════════════════════════════════════════════════════

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Edit, User } from 'lucide-react';
import { SourcesCapturedCard } from '../sources-captured-card';
import { formatDateDMY, formatDateShort, formatDateTimeDMY } from '@/lib/utils/date-format';

interface DetailsTabProps {
  lead: any;
  institutionName: string;
  primaryProgramName: string | null;
  alternativeProgramNames: string[];
  programsLoading: boolean;
  gateEntryByName: string | null;
  leadAttributions: any[];
  openEditDialog: () => void;
  setShowAssignCounselorDialog: (open: boolean) => void;
}

export function DetailsTab({
  lead,
  institutionName,
  primaryProgramName,
  alternativeProgramNames,
  programsLoading,
  gateEntryByName,
  leadAttributions,
  openEditDialog,
  setShowAssignCounselorDialog,
}: DetailsTabProps) {
  return (
    <>
      {/* Personal Information */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Personal Information</CardTitle>
            <Button variant="outline" size="sm" onClick={openEditDialog}>
              <Edit className="h-3.5 w-3.5 mr-1.5" />
              Edit
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-sm text-muted-foreground">Full Name</dt>
              <dd className="font-medium">{lead.full_name || '-'}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Email</dt>
              <dd className="font-medium">{lead.email || '-'}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Phone</dt>
              <dd className="font-medium">{lead.phone || '-'}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Alternate Phone</dt>
              <dd className="font-medium">{lead.alternate_phone || '-'}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Date of Birth</dt>
              <dd className="font-medium">
                {formatDateDMY(lead.date_of_birth)}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Gender</dt>
              <dd className="font-medium capitalize">{lead.gender || '-'}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Sources Captured — full multi-source touch timeline */}
      <SourcesCapturedCard leadId={lead.id} />

      {/* Academic Details */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Academic Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-sm text-muted-foreground">Institution</dt>
              <dd className="font-medium">{institutionName || '-'}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Entry Date</dt>
              <dd className="font-medium">
                {formatDateDMY(lead.entry_date ?? lead.created_at)}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Admission Year</dt>
              <dd className="font-medium">
                {lead.admission_year?.admission_year_name
                  ? `${lead.admission_year.admission_year_name} (${lead.admission_year.program_start_year}–${lead.admission_year.program_end_year})`
                  : lead.academic_year /* legacy fallback for historical rows */
                    || '-'}
              </dd>
            </div>

            <div>
              <dt className="text-sm text-muted-foreground">Student Interest Level</dt>
              <dd className="font-medium capitalize">{(lead.student_interest_level || '-').replace(/_/g, ' ')}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Parent Decision Status</dt>
              <dd className="font-medium capitalize">{(lead.parent_decision_status || '-').replace(/_/g, ' ')}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Interested Program</dt>
              <dd className="font-medium">
                {programsLoading ? (
                  <span className="text-muted-foreground text-sm">Loading...</span>
                ) : primaryProgramName ? (
                  <Badge variant="default">{primaryProgramName}</Badge>
                ) : '-'}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-sm text-muted-foreground">Alternative Programs</dt>
              <dd className="font-medium">
                {programsLoading ? (
                  <span className="text-muted-foreground text-sm">Loading...</span>
                ) : alternativeProgramNames.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {alternativeProgramNames.map((name: string, i: number) => (
                      <Badge key={i} variant="secondary">{name}</Badge>
                    ))}
                  </div>
                ) : '-'}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Address */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Address</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <dt className="text-sm text-muted-foreground">Address Line</dt>
              <dd className="font-medium">{lead.address_line1 || '-'}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">State</dt>
              <dd className="font-medium">{lead.state || '-'}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">District</dt>
              <dd className="font-medium">{lead.district || '-'}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">City / Town</dt>
              <dd className="font-medium">{lead.city || '-'}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Pincode</dt>
              <dd className="font-medium">{lead.pincode || '-'}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Parent / Guardian */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Parent / Guardian</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-sm text-muted-foreground">Parent Name</dt>
              <dd className="font-medium">{lead.parent_name || '-'}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Parent Phone</dt>
              <dd className="font-medium">{lead.parent_phone || '-'}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Parent Email</dt>
              <dd className="font-medium">{lead.parent_email || '-'}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Source & Timestamps */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Source & Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-sm text-muted-foreground">Lead Source</dt>
              <dd className="font-medium capitalize">
                {/* Display the lead's underlying channel category
                 *  verbatim — gate-entry leads stay 'walk_in' here
                 *  by design (per operator request 2026-05-07);
                 *  gate-specific context lives in the dedicated
                 *  Gate Entry block below. */}
                {(lead.source || '-').replace(/_/g, ' ')}
              </dd>
            </div>
            {/* Referral details render whenever the lead carries a
             *  referral_type — independent of lead.source. The
             *  prior gate `lead.source === 'referral'` silently
             *  hid these for gate-entry leads (whose source stays
             *  'walk_in' even when the visitor was referred). */}
            {lead.referral_type && (
              <>
                <div>
                  <dt className="text-sm text-muted-foreground">Referral Type</dt>
                  <dd className="font-medium capitalize">{lead.referral_type}</dd>
                </div>
                {lead.referred_by_name && (
                  <div>
                    <dt className="text-sm text-muted-foreground">Referred By</dt>
                    <dd className="font-medium">{lead.referred_by_name}</dd>
                  </div>
                )}
              </>
            )}
            {/* Gate Entry metadata block — visible only when this
             *  lead was first captured at the institution gate.
             *  Shows when, who entered them, and the visit count. */}
            {lead.first_gate_entry_at && (
              <>
                <div>
                  <dt className="text-sm text-muted-foreground">Gate Entry Time</dt>
                  <dd className="font-medium">
                    {formatDateTimeDMY(lead.first_gate_entry_at)}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">Logged By</dt>
                  <dd className="font-medium">
                    {gateEntryByName ?? '—'}
                  </dd>
                </div>
                {(lead.gate_entry_count ?? 0) > 0 && (
                  <div>
                    <dt className="text-sm text-muted-foreground">Total Visits</dt>
                    <dd className="font-medium tabular-nums">
                      {lead.gate_entry_count}
                    </dd>
                  </div>
                )}
              </>
            )}
            <div>
              <dt className="text-sm text-muted-foreground">Preferred Channel</dt>
              <dd className="font-medium capitalize">{(lead.preferred_channel || '-').replace(/_/g, ' ')}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Created</dt>
              <dd className="font-medium">
                {formatDateTimeDMY(lead.created_at)}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Last Activity</dt>
              <dd className="font-medium">
                {formatDateTimeDMY(lead.last_contact_at)}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Assignment Details — source-based: referral → consultant, others → counselor */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-4 w-4" />
            {lead.source === 'referral' ? 'Consultant Details' : 'Assigned Counselor'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {lead.source === 'referral' ? (
            /* Consultant section for referral leads */
            leadAttributions.length > 0 ? (
              <div className="space-y-2">
                {leadAttributions.map((attr: any) => (
                  <div key={attr.id} className="rounded-md border p-3">
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{attr.consultant?.name || 'Unknown'}</p>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-xs capitalize">
                          {attr.attribution_type}
                        </Badge>
                        {attr.is_verified ? (
                          <Badge className="text-xs bg-green-100 text-green-800">Verified</Badge>
                        ) : (
                          <Badge className="text-xs bg-yellow-100 text-yellow-800">Pending</Badge>
                        )}
                      </div>
                    </div>
                    {(attr.consultant?.email || attr.consultant?.phone || attr.attribution_percentage != null) && (
                      <dl className="grid grid-cols-2 gap-2 text-sm mt-2">
                        {attr.consultant?.email && (
                          <div>
                            <dt className="text-muted-foreground">Email</dt>
                            <dd>{attr.consultant.email}</dd>
                          </div>
                        )}
                        {attr.consultant?.phone && (
                          <div>
                            <dt className="text-muted-foreground">Phone</dt>
                            <dd>{attr.consultant.phone}</dd>
                          </div>
                        )}
                        {attr.attribution_percentage != null && (
                          <div>
                            <dt className="text-muted-foreground">Commission</dt>
                            <dd>{attr.attribution_percentage}%</dd>
                          </div>
                        )}
                      </dl>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-md border border-dashed p-3 text-center">
                <p className="text-sm text-muted-foreground">No consultant linked</p>
              </div>
            )
          ) : (
            /* Counselor section for non-referral leads */
            lead.counselor_id && lead.counselor ? (
              <div className="rounded-md border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{lead.counselor.name}</p>
                  <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                    Active
                  </Badge>
                </div>
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  {lead.counselor.email && (
                    <div>
                      <dt className="text-muted-foreground">Email</dt>
                      <dd>{lead.counselor.email}</dd>
                    </div>
                  )}
                  {lead.counselor.phone && (
                    <div>
                      <dt className="text-muted-foreground">Phone</dt>
                      <dd>{lead.counselor.phone}</dd>
                    </div>
                  )}
                  {lead.counselor.designation && (
                    <div>
                      <dt className="text-muted-foreground">Designation</dt>
                      <dd className="capitalize">{lead.counselor.designation}</dd>
                    </div>
                  )}
                  {lead.assigned_at && (
                    <div>
                      <dt className="text-muted-foreground">Assigned On</dt>
                      <dd>{formatDateShort(lead.assigned_at)}</dd>
                    </div>
                  )}
                </dl>
              </div>
            ) : (
              <div className="rounded-md border border-dashed p-3 text-center">
                <p className="text-sm text-muted-foreground">No counselor assigned</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => setShowAssignCounselorDialog(true)}
                >
                  Assign Counselor
                </Button>
              </div>
            )
          )}
        </CardContent>
      </Card>

      {/* Notes */}
      {lead.notes && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{lead.notes}</p>
          </CardContent>
        </Card>
      )}
    </>
  );
}
