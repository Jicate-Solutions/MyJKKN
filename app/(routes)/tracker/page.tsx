'use client';

// Unlisted compliance tracker — NOT in the sidebar/nav (open by direct link only).
// Any logged-in MyJKKN user can view; staff & faculty (non-students) can write.
// Reads live data on load; the two built-in sections use read-only aggregate RPCs.

import { useCallback, useEffect, useState } from 'react';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CurriculumSection } from './_components/curriculum-section';
import { AuditSection } from './_components/audit-section';
import { CustomSection } from './_components/custom-section';

interface Section {
  id: string;
  section_key: string;
  title: string;
  description: string | null;
  kind: string;
}

export default function TrackerPage() {
  const supabase = createClientSupabaseClient();
  const [sections, setSections] = useState<Section[] | null>(null);
  const [canWrite, setCanWrite] = useState(false);
  const [addingSection, setAddingSection] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  const loadSections = useCallback(async () => {
    const { data } = await (supabase as any)
      .from('tracker_sections')
      .select('id,section_key,title,description,kind')
      .eq('is_active', true)
      .order('sort_order');
    setSections((data as Section[]) ?? []);
  }, [supabase]);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await (supabase as any)
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .maybeSingle();
        const role = (profile as { role?: string } | null)?.role ?? '';
        setCanWrite(role !== 'student' && role !== 'learner' && role !== '');
      }
      loadSections();
    })();
  }, [supabase, loadSections]);

  async function addSection() {
    const title = newTitle.trim();
    if (!title) return;
    const key = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || `section_${Date.now()}`;
    await (supabase as any).rpc('fn_tracker_add_section', { p_section_key: key, p_title: title });
    setNewTitle('');
    setAddingSection(false);
    loadSections();
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <header className="mb-8 border-b pb-5">
        <h1 className="text-2xl font-semibold tracking-tight" style={{ color: '#0b6d41' }}>
          Compliance &amp; Tracking Board
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
          A live view of institutional tracking and compliance matters. Everyone at MyJKKN can follow along;
          team members and Senior Learners can add items, post updates, change status, and assign owners.
        </p>
        {!canWrite && (
          <p className="mt-2 text-xs text-muted-foreground">
            You&apos;re viewing in read-only mode. Team members and Senior Learners can post updates here.
          </p>
        )}
      </header>

      {sections === null ? (
        <div className="space-y-6">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {sections.map((s) => (
            <Card key={s.id}>
              <CardHeader>
                <CardTitle className="text-lg">{s.title}</CardTitle>
                {s.description && <p className="text-sm text-muted-foreground">{s.description}</p>}
              </CardHeader>
              <CardContent>
                {s.kind === 'builtin_curriculum' ? (
                  <CurriculumSection />
                ) : s.kind === 'builtin_audit' ? (
                  <AuditSection />
                ) : (
                  <CustomSection sectionId={s.id} canWrite={canWrite} />
                )}
              </CardContent>
            </Card>
          ))}

          {canWrite &&
            (addingSection ? (
              <div className="flex gap-2">
                <input
                  autoFocus
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addSection()}
                  placeholder="New tracking section name…"
                  className="flex-1 rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600/40"
                />
                <Button onClick={addSection}>Create</Button>
                <Button variant="ghost" onClick={() => setAddingSection(false)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <Button variant="outline" onClick={() => setAddingSection(true)}>
                + New section
              </Button>
            ))}
        </div>
      )}
    </div>
  );
}
