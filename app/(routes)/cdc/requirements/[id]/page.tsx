'use client';

// CDC staff — Employer Requirement detail. Review/approve public submissions,
// then publish each role to the Bulletin or open the Drive creator. Per-role
// "Matching students" runs the skills-match RPC (empty until IDP data exists).

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { BeatLoader } from 'react-spinners';
import {
  Building2, Mail, Phone, Globe, MapPin, CheckCircle2, XCircle, Send, Users,
  ExternalLink, Loader2, Sparkles, Briefcase,
} from 'lucide-react';
import type {
  EmployerRequirementWithRoles, EmployerRequirementRole, EmployerRequirementStatus, RoleMatchLearner,
} from '@/types/cdc/employer-requirements';

const STATUS_META: Record<EmployerRequirementStatus, { label: string; cls: string }> = {
  pending_review: { label: 'Pending review', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  approved:       { label: 'Approved',       cls: 'bg-blue-100 text-blue-800 border-blue-200' },
  published:      { label: 'Published',      cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  rejected:       { label: 'Rejected',       cls: 'bg-red-100 text-red-700 border-red-200' },
  closed:         { label: 'Closed',         cls: 'bg-slate-100 text-slate-600 border-slate-200' },
};

function RoleCard({ role, canPublish, onPublished }: {
  role: EmployerRequirementRole; canPublish: boolean; onPublished: () => void;
}) {
  const [publishing, setPublishing] = useState(false);
  const [matchOpen, setMatchOpen] = useState(false);
  const [matches, setMatches] = useState<RoleMatchLearner[] | null>(null);
  const [matchLoading, setMatchLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const publish = async () => {
    setPublishing(true); setErr(null);
    try {
      const res = await fetch(`/api/cdc/requirements/${role.requirement_id}/roles/${role.id}/publish`, { method: 'POST' });
      const j = await res.json();
      if (!res.ok) { setErr(j.error || 'Publish failed'); return; }
      onPublished();
    } finally { setPublishing(false); }
  };

  const loadMatches = async () => {
    setMatchOpen((o) => !o);
    if (matches !== null) return;
    setMatchLoading(true);
    try {
      const res = await fetch(`/api/cdc/requirements/${role.requirement_id}/roles/${role.id}/matches`, { cache: 'no-store' });
      const j = await res.json();
      setMatches(res.ok ? (j.data ?? []) : []);
    } finally { setMatchLoading(false); }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-slate-400" /> {role.role_title}
            </CardTitle>
            <div className="mt-1 text-xs text-slate-500 flex flex-wrap gap-x-3 gap-y-0.5">
              {role.experience_level !== 'any' && <span className="capitalize">{role.experience_level}</span>}
              {role.experience_min_years != null && <span>{role.experience_min_years}+ yrs</span>}
              {role.openings_count > 1 && <span>{role.openings_count} openings</span>}
              {role.work_mode && <span className="capitalize">{role.work_mode.replace('_', ' ')}</span>}
              {role.location && <span>{role.location}</span>}
              {role.package_lpa != null && <span>{role.package_lpa} LPA</span>}
            </div>
          </div>
          {role.status === 'published_bulletin' ? (
            <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-200">On Bulletin</Badge>
          ) : role.status === 'converted_drive' ? (
            <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-200">Drive created</Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {role.skills.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {role.skills.map((s) => <Badge key={s} variant="secondary">{s}</Badge>)}
          </div>
        )}
        {role.description && <p className="text-sm text-slate-600 whitespace-pre-wrap">{role.description}</p>}
        {role.education_text && <p className="text-xs text-slate-500">Education: {role.education_text}</p>}
        {role.benefits && <p className="text-xs text-slate-500">Benefits: {role.benefits}</p>}

        {err && <p className="text-sm text-red-600">{err}</p>}

        <div className="flex flex-wrap gap-2 pt-1">
          {canPublish && role.status === 'open' && (
            <Button size="sm" onClick={publish} disabled={publishing}>
              {publishing ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
              Publish to Bulletin
            </Button>
          )}
          {role.status === 'published_bulletin' && role.published_opportunity_id && (
            <Link href="/cdc/bulletin"><Button size="sm" variant="outline"><ExternalLink className="h-4 w-4 mr-1.5" /> View on Bulletin</Button></Link>
          )}
          <Link href="/cdc/drives/new"><Button size="sm" variant="outline"><Briefcase className="h-4 w-4 mr-1.5" /> Open Drive creator</Button></Link>
          <Button size="sm" variant="ghost" onClick={loadMatches}>
            <Users className="h-4 w-4 mr-1.5" /> Matching students
          </Button>
        </div>

        {matchOpen && (
          <div className="rounded-lg border bg-slate-50 p-3 mt-1">
            {matchLoading ? (
              <div className="flex justify-center py-4"><BeatLoader color="#4f46e5" size={8} /></div>
            ) : (matches && matches.length > 0) ? (
              <ul className="space-y-1.5">
                {matches.map((m) => (
                  <li key={m.learner_id} className="flex items-center justify-between text-sm">
                    <span className="text-slate-700">
                      {m.learner_name}{m.register_number ? ` · ${m.register_number}` : ''}
                      {m.institution_name ? <span className="text-slate-400"> · {m.institution_name}</span> : null}
                    </span>
                    <span className="text-xs text-indigo-600">{m.match_count} skill{m.match_count === 1 ? '' : 's'} · {m.matched_skills.join(', ')}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex items-start gap-2 text-sm text-slate-500">
                <Sparkles className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                <span>No skill matches yet. This activates as students record skills in their Individual Development Plan (IDP).</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Content() {
  const { id } = useParams<{ id: string }>();
  const [req, setReq] = useState<EmployerRequirementWithRoles | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [notes, setNotes] = useState('');
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/cdc/requirements/${id}`, { cache: 'no-store' });
    if (res.status === 404 || res.status === 403) { setNotFound(true); setLoading(false); return; }
    const j = await res.json();
    if (res.ok) { setReq(j.data); setNotes(j.data?.review_notes ?? ''); }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const moderate = async (status: 'approved' | 'rejected') => {
    setActing(true);
    try {
      const res = await fetch(`/api/cdc/requirements/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, review_notes: notes || null }),
      });
      if (res.ok) await load();
    } finally { setActing(false); }
  };

  if (loading) return <ContentLayout title="Employer Requirement"><div className="flex justify-center py-16"><BeatLoader color="#4f46e5" size={12} /></div></ContentLayout>;
  if (notFound || !req) return (
    <ContentLayout title="Employer Requirement">
      <Card><CardContent className="py-16 text-center text-slate-500">
        This requirement doesn’t exist or you don’t have access to it.{' '}
        <Link href="/cdc/requirements" className="text-indigo-600 underline">Back to list</Link>
      </CardContent></Card>
    </ContentLayout>
  );

  const isPending = req.status === 'pending_review';
  const canPublish = req.status === 'approved' || req.status === 'published';

  return (
    <ContentLayout title={req.company_name}>
      <PageBreadcrumb items={[{ label: 'CDC', href: '/cdc' }, { label: 'Employer Requirements', href: '/cdc/requirements' }, { label: req.company_name }]} />

      <Card className="mb-4">
        <CardContent className="py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="rounded-lg bg-slate-100 p-2.5"><Building2 className="h-6 w-6 text-slate-500" /></div>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-slate-900">{req.company_name}</h2>
                <div className="mt-1.5 text-sm text-slate-500 flex flex-col gap-1 min-w-0 break-words">
                  {req.company_website && <span className="flex items-center gap-1.5"><Globe className="h-3.5 w-3.5" />{req.company_website}</span>}
                  {(req.hq_city || req.hq_state) && <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{[req.hq_city, req.hq_state].filter(Boolean).join(', ')}</span>}
                  {req.primary_contact_name && <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />{req.primary_contact_name}</span>}
                  {req.primary_contact_email && <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{req.primary_contact_email}</span>}
                  {req.primary_contact_phone && <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{req.primary_contact_phone}</span>}
                  {req.secondary_contact_name && <span className="flex items-center gap-1.5 text-slate-400"><Phone className="h-3.5 w-3.5" />{req.secondary_contact_name} {req.secondary_contact_phone}</span>}
                </div>
              </div>
            </div>
            <Badge variant="outline" className={`shrink-0 ${STATUS_META[req.status]?.cls ?? ''}`}>{STATUS_META[req.status]?.label}</Badge>
          </div>

          {isPending && (
            <div className="mt-4 border-t pt-4">
              <p className="text-sm font-medium text-slate-700 mb-2">Review this public submission</p>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                placeholder="Review notes (optional)" className="mb-2" />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => moderate('approved')} disabled={acting}>
                  <CheckCircle2 className="h-4 w-4 mr-1.5" /> Approve
                </Button>
                <Button size="sm" variant="outline" className="text-red-600" onClick={() => moderate('rejected')} disabled={acting}>
                  <XCircle className="h-4 w-4 mr-1.5" /> Reject
                </Button>
              </div>
            </div>
          )}
          {req.review_notes && !isPending && <p className="mt-3 text-xs text-slate-400">Review note: {req.review_notes}</p>}
        </CardContent>
      </Card>

      <h3 className="text-sm font-semibold text-slate-700 mb-2">Roles ({req.roles?.length ?? 0})</h3>
      {isPending && <p className="text-xs text-amber-600 mb-3">Approve the submission to publish its roles.</p>}
      <div className="space-y-3">
        {(req.roles ?? []).map((role) => (
          <RoleCard key={role.id} role={role} canPublish={canPublish} onPublished={load} />
        ))}
      </div>
    </ContentLayout>
  );
}

export default function CdcRequirementDetailPage() {
  return (
    <PermissionGuard module="cdc.requirements" action="view">
      <Content />
    </PermissionGuard>
  );
}
