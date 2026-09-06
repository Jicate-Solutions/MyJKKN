'use client';

/**
 * HR Employee Detail — read-only, name-resolved view of one staff member from
 * the HR perspective, with cross-links into the staff record and HR modules.
 *
 * REDESIGNED 2026-08-28. This was one card holding a twelve-row two-column
 * <dl>, capped at max-w-3xl: every field carried identical visual weight, so
 * the name, the blood group and the cadre all read the same, and the page
 * showed a fraction of what the staff record holds — gender, date of birth,
 * address, employment category, roles, biometric enrolment and login state
 * were all stored and none of them displayed.
 *
 * The shape now follows how someone actually reads a person: a header that
 * answers "who is this" at a glance, then sections grouped by the question
 * they belong to. Empty fields still render, showing an em dash — on an HR
 * record "we don't hold a blood group" is information, and hiding the row
 * would make the profile look complete when it isn't.
 */

import Link from 'next/link';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { BeatLoader } from 'react-spinners';
import {
  AlertCircle, Briefcase, Building2, Fingerprint, MapPin, ShieldCheck, User,
} from 'lucide-react';
import { useHREmployee } from '@/hooks/hr/use-employees';
import { getErrorMessage } from '@/lib/utils';
import type { HRPersonDetailView } from '@/types/hr';

/** dd MMM yyyy, or the raw value if it is not a date this can parse. */
function fmtDate(v: string | null): string {
  if (!v) return '';
  const d = new Date(`${v}T00:00:00`);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

/** Whole years between then and now — for age and tenure. */
function yearsSince(v: string | null): number | null {
  if (!v) return null;
  const d = new Date(`${v}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let y = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) y -= 1;
  return y >= 0 ? y : null;
}

const titleCase = (v: string | null) =>
  v ? v.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : null;

function Field({
  label,
  children,
  mono,
}: {
  label: string;
  children?: React.ReactNode;
  mono?: boolean;
}) {
  const empty =
    children === null || children === undefined || children === '' || children === false;
  return (
    <div className="min-w-0 space-y-0.5">
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={`text-sm ${mono ? 'font-mono' : ''} ${empty ? 'text-muted-foreground' : ''}`}>
        {empty ? '—' : children}
      </dd>
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Icon className="h-4 w-4 text-muted-foreground" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">{children}</dl>
      </CardContent>
    </Card>
  );
}

function Header({ p }: { p: HRPersonDetailView }) {
  const name = `${p.first_name} ${p.last_name ?? ''}`.trim();
  const initials = name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const tenure = yearsSince(p.date_of_joining);

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-start">
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full border bg-muted">
          {p.profile_picture ? (
            // Unoptimised: staff photos come from Supabase storage / Drive on
            // hosts the image config does not whitelist, and a broken
            // next/image domain would blank the avatar entirely.
            <Image
              src={p.profile_picture}
              alt={name}
              fill
              unoptimized
              className="object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-lg font-semibold text-muted-foreground">
              {initials || '—'}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold">{name || 'Unnamed'}</h1>
            {p.is_active ? (
              <Badge variant="outline" className="border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400">
                Active
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-muted text-muted-foreground">Inactive</Badge>
            )}
            {p.record_status && p.record_status !== 'published' && (
              <Badge variant="outline" className="border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-400">
                {titleCase(p.record_status)}
              </Badge>
            )}
          </div>

          <p className="text-sm text-muted-foreground">
            {[p.staff_designation ?? p.designation_name, p.employment_category]
              .filter(Boolean)
              .join(' · ') || 'No designation recorded'}
          </p>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="font-mono">{p.staff_code ?? 'no staff code'}</span>
            {p.institution_name && <span>{p.institution_name}</span>}
            {p.department_name && <span>{p.department_name}</span>}
            {tenure !== null && (
              <span>{tenure} year{tenure === 1 ? '' : 's'} at JKKN</span>
            )}
          </div>

          {p.role_names && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {p.role_names.split(',').map((r) => (
                <Badge key={r} variant="secondary" className="font-normal">
                  {r.trim()}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function HREmployeeDetailPage() {
  const params = useParams();
  const id =
    typeof params.id === 'string'
      ? params.id
      : Array.isArray(params.id)
        ? params.id[0]
        : undefined;
  const { data, isLoading, error } = useHREmployee(id);

  const age = yearsSince(data?.date_of_birth ?? null);

  return (
    <ContentLayout title="HR Directory — Employee">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild><Link href="/hr">HR</Link></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild><Link href="/hr/employees">Employees</Link></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>Detail</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="mt-6 space-y-4">
        {isLoading && <div className="flex justify-center py-16"><BeatLoader color="#3b82f6" /></div>}

        {error && (
          <div className="flex items-center gap-2 text-red-600">
            <AlertCircle className="h-4 w-4" />
            <span>Failed to load: {getErrorMessage(error)}</span>
          </div>
        )}

        {data && (
          <>
            <Header p={data} />

            <div className="grid gap-4 lg:grid-cols-2">
              <Section title="Personal" icon={User}>
                <Field label="Gender">{titleCase(data.gender)}</Field>
                <Field label="Date of Birth">
                  {data.date_of_birth
                    ? `${fmtDate(data.date_of_birth)}${age !== null ? ` (${age})` : ''}`
                    : null}
                </Field>
                <Field label="Marital Status">{titleCase(data.marital_status)}</Field>
                <Field label="Blood Group">{data.blood_group}</Field>
              </Section>

              <Section title="Contact" icon={MapPin}>
                <Field label="Institution Email">{data.email}</Field>
                <Field label="Personal Email">
                  {/* The two are frequently the same address; showing both is
                      still worth it, because "no personal address on file" is
                      a gap HR chases. */}
                  {data.personal_email}
                </Field>
                <Field label="Phone" mono>{data.phone}</Field>
                <Field label="Address">{data.address}</Field>
                <Field label="District">{data.district}</Field>
                <Field label="State">{data.state}</Field>
                <Field label="Pincode" mono>{data.pincode}</Field>
              </Section>

              <Section title="Employment" icon={Briefcase}>
                <Field label="Staff Code" mono>{data.staff_code}</Field>
                {/* Only rendered when one exists — unlike the other fields, an
                    absent legacy code means "joined after the renumbering",
                    which is unremarkable and not worth a row. */}
                {data.legacy_staff_code && (
                  <Field label="Previous Staff ID" mono>{data.legacy_staff_code}</Field>
                )}
                <Field label="Designation">{data.staff_designation}</Field>
                <Field label="Employment Category">{data.employment_category}</Field>
                <Field label="Employment Type">{titleCase(data.employment_type)}</Field>
                <Field label="Date of Joining">{fmtDate(data.date_of_joining)}</Field>
                <Field label="Experience">
                  {data.experience_years ? `${data.experience_years} years` : null}
                </Field>
                <Field label="Work Institution">{data.institution_name}</Field>
                <Field label="Department">{data.department_name}</Field>
              </Section>

              <Section title="HR Record" icon={Building2}>
                <Field label="HR Employee Code" mono>{data.hr_employee_code}</Field>
                <Field label="HR Organization">{data.organization_name}</Field>
                <Field label="HR Designation">{data.designation_name}</Field>
                <Field label="Cadre">{data.cadre_name}</Field>
                <Field label="Reports To">{data.reports_to_name}</Field>
              </Section>

              <Section title="Attendance & Access" icon={Fingerprint}>
                <Field label="Biometric Code" mono>{data.biometric_code}</Field>
                <Field label="Biometric Machine">{data.biometric_machine_name}</Field>
                <Field label="Login">
                  {data.login_enabled === null
                    ? null
                    : data.login_enabled
                      ? 'Enabled'
                      : 'View only (no login)'}
                </Field>
                <Field label="Bus Required">
                  {data.bus_required === null ? null : data.bus_required ? 'Yes' : 'No'}
                </Field>
              </Section>

              <Section title="Roles" icon={ShieldCheck}>
                <div className="col-span-2">
                  <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Role Management
                  </dt>
                  <dd className="mt-1 flex flex-wrap gap-1.5">
                    {data.role_names ? (
                      data.role_names.split(',').map((r) => (
                        <Badge key={r} variant="outline" className="font-normal">
                          {r.trim()}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        No role assigned — this person cannot sign in to anything.
                      </span>
                    )}
                  </dd>
                </div>
              </Section>
            </div>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Related</CardTitle>
              </CardHeader>
              <CardContent>
                <Separator className="mb-3" />
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/staff/list/${data.id}`}>Full staff record</Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link href="/hr/leave">Leave workflow</Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link href="/hr/documents/verify">Documents</Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link href="/hr/admin/payroll/periods">Payroll</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </ContentLayout>
  );
}
