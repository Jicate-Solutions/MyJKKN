'use client';

// app/(routes)/cdc/internships/new/page.tsx
// CDC Sprint 4 — Create a new corporate internship assignment

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCdcInternshipCreate } from '@/hooks/cdc/use-cdc-internships';
import { CdcInternshipService } from '@/lib/services/cdc/internship-service';
import { useAuth } from '@/hooks/use-auth';

interface Cycle { id: string; cycle_name: string; start_date: string; end_date: string; }
interface Site  { id: string; site_name: string; city: string | null; state: string | null; }

export default function NewCdcInternshipPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { createInternship, loading } = useCdcInternshipCreate();

  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [formData, setFormData] = useState({
    learner_id: '',
    site_id: '',
    facilitator_id: '',
    cycle_id: '',
    rotation_start_date: '',
    rotation_end_date: '',
    required_attendance_pct: 75,
    department_rotation: '',
  });
  const [institutionId, setInstitutionId] = useState<string>('');

  useEffect(() => {
    // Load institution from user profile and fetch cycles/sites
    const init = async () => {
      try {
        // For now, fetch user profile to get institution_id
        const res = await fetch('/api/users/profile');
        const json = await res.json();
        const iid = json?.data?.institution_id ?? json?.institution_id ?? '';
        setInstitutionId(iid);

        if (iid) {
          const [c, s] = await Promise.all([
            CdcInternshipService.getInternshipCycles(iid),
            CdcInternshipService.getCorporateSites(iid),
          ]);
          setCycles(c);
          setSites(s);
        }
      } catch {
        // silent — user can still type values
      }
    };
    init();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.learner_id || !formData.site_id || !formData.facilitator_id || !formData.cycle_id) {
      return;
    }
    const created = await createInternship(
      {
        learner_id: formData.learner_id,
        site_id: formData.site_id,
        facilitator_id: formData.facilitator_id,
        cycle_id: formData.cycle_id,
        rotation_start_date: formData.rotation_start_date,
        rotation_end_date: formData.rotation_end_date,
        required_attendance_pct: formData.required_attendance_pct,
        department_rotation: formData.department_rotation || undefined,
      },
      institutionId
    );
    if (created) {
      router.push(`/cdc/internships/${created.id}`);
    }
  };

  const set = (key: string) => (val: string) =>
    setFormData(prev => ({ ...prev, [key]: val }));

  return (
    <ContentLayout title="New Corporate Internship">
      <div className="max-w-2xl space-y-6">
        {/* Breadcrumb */}
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem><BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbLink href="/cdc/internships">Internships</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage>New</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex items-center gap-3">
          <Link href="/cdc/internships">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back
            </Button>
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">New Corporate Internship</h1>
        </div>

        <form onSubmit={handleSubmit}>
          <Card>
            <CardHeader><CardTitle className="text-base">Assignment Details</CardTitle></CardHeader>
            <CardContent className="grid gap-5">
              {/* Internship type — display only */}
              <div className="grid gap-1">
                <Label>Internship type</Label>
                <div className="px-3 py-2 rounded-md border bg-gray-50 text-sm text-gray-700">
                  Corporate Internship
                </div>
              </div>

              {/* Cycle */}
              <div className="grid gap-1">
                <Label htmlFor="cycle_id">Posting cycle <span className="text-red-500">*</span></Label>
                {cycles.length > 0 ? (
                  <Select value={formData.cycle_id} onValueChange={set('cycle_id')}>
                    <SelectTrigger id="cycle_id">
                      <SelectValue placeholder="Select a cycle" />
                    </SelectTrigger>
                    <SelectContent>
                      {cycles.map(c => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.cycle_name} ({c.start_date} – {c.end_date})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id="cycle_id"
                    placeholder="Cycle UUID"
                    value={formData.cycle_id}
                    onChange={e => set('cycle_id')(e.target.value)}
                    required
                  />
                )}
              </div>

              {/* Site */}
              <div className="grid gap-1">
                <Label htmlFor="site_id">Corporate site / company <span className="text-red-500">*</span></Label>
                {sites.length > 0 ? (
                  <Select value={formData.site_id} onValueChange={set('site_id')}>
                    <SelectTrigger id="site_id">
                      <SelectValue placeholder="Select a company site" />
                    </SelectTrigger>
                    <SelectContent>
                      {sites.map(s => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.site_name}{s.city ? ` — ${s.city}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id="site_id"
                    placeholder="Site UUID"
                    value={formData.site_id}
                    onChange={e => set('site_id')(e.target.value)}
                    required
                  />
                )}
                {sites.length === 0 && (
                  <p className="text-xs text-gray-400">
                    No corporate sites found for this institution.{' '}
                    Add one in the internship sites setup before assigning.
                  </p>
                )}
              </div>

              {/* Learner ID */}
              <div className="grid gap-1">
                <Label htmlFor="learner_id">Learner ID <span className="text-red-500">*</span></Label>
                <Input
                  id="learner_id"
                  placeholder="Learner UUID"
                  value={formData.learner_id}
                  onChange={e => set('learner_id')(e.target.value)}
                  required
                />
              </div>

              {/* Facilitator ID */}
              <div className="grid gap-1">
                <Label htmlFor="facilitator_id">Facilitator / coordinator ID <span className="text-red-500">*</span></Label>
                <Input
                  id="facilitator_id"
                  placeholder="Staff UUID"
                  value={formData.facilitator_id}
                  onChange={e => set('facilitator_id')(e.target.value)}
                  required
                />
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-1">
                  <Label htmlFor="start_date">Start date <span className="text-red-500">*</span></Label>
                  <Input
                    id="start_date"
                    type="date"
                    value={formData.rotation_start_date}
                    onChange={e => set('rotation_start_date')(e.target.value)}
                    required
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="end_date">End date <span className="text-red-500">*</span></Label>
                  <Input
                    id="end_date"
                    type="date"
                    value={formData.rotation_end_date}
                    onChange={e => set('rotation_end_date')(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Required attendance */}
              <div className="grid gap-1">
                <Label htmlFor="req_att">Required attendance (%)</Label>
                <Input
                  id="req_att"
                  type="number"
                  min={0}
                  max={100}
                  value={formData.required_attendance_pct}
                  onChange={e =>
                    setFormData(p => ({ ...p, required_attendance_pct: parseInt(e.target.value) || 75 }))
                  }
                />
              </div>

              {/* Department / rotation */}
              <div className="grid gap-1">
                <Label htmlFor="dept">Department / rotation (optional)</Label>
                <Input
                  id="dept"
                  placeholder="e.g. Software Engineering"
                  value={formData.department_rotation}
                  onChange={e => set('department_rotation')(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3 mt-6">
            <Link href="/cdc/internships">
              <Button variant="outline" type="button">Cancel</Button>
            </Link>
            <Button type="submit" disabled={loading}>
              <Save className="w-4 h-4 mr-2" />
              {loading ? 'Saving…' : 'Create Internship'}
            </Button>
          </div>
        </form>
      </div>
    </ContentLayout>
  );
}
