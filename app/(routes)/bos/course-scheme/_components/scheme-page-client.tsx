'use client';

import { useEffect, useMemo, useState } from 'react';
import jsPDF from 'jspdf';
import { toast } from 'sonner';
import { BookOpen, Eye, FileDown, Loader2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { usePermissions } from '@/hooks/use-permissions';
import { useInstitutionContext } from '@/hooks/use-institution-context';
import { useBosCourseScheme, useBosSemesters, type SchemeFilters } from '@/hooks/bos/use-bos-course-scheme';
import { useBosProgramOptions, useBosRegulationOptions } from '@/hooks/bos/use-bos-scheme-options';
import { InstitutionPicker, type InstitutionOption } from '../../_components/institution-picker';
import { SchemeFiltersBar } from './scheme-filters';
import { SemesterTable } from './semester-table';
import { AddCourseDialog } from './add-course-dialog';
import type { BosCourseMappingDetailed } from '@/types/bos-courses';
import type {
  BosCourseSyllabus,
  BosCourseObjectivesContent,
  BosCourseLearnOutcomesContent,
} from '@/types/bos';
import { generateCourseSchemeReportPDF } from '@/lib/utils/internal-marks/internal-marks-pdf';
import { getInstitutionHeader } from '@/lib/utils/internal-marks/institution-header';
import { renderCourseSyllabusPDF, extractPOKeys } from '@/lib/utils/bos/course-syllabus-pdf';

export function SchemePageClient() {
  const { canAccess, isSuperAdmin, userProfile } = usePermissions();
  const { data: institutionCtx } = useInstitutionContext();
  const canEdit = isSuperAdmin || canAccess('academic.bos-scheme', 'edit');
  // Read-all observer tier: ANY holder of the module's view grant may browse
  // every institution read-only (see isBosReadAllObserver server-side). Drives
  // the InstitutionPicker below, which used to render for super-admins only.
  const canBrowseInstitutions = isSuperAdmin || canAccess('academic.bos-scheme', 'view');

  const [institutionId, setInstitutionId] = useState<string | undefined>(undefined);
  const [institutionCode, setInstitutionCode] = useState('');
  const [institutionName, setInstitutionName] = useState('');
  const [myjkknInstitutionIds, setMyjkknInstitutionIds] = useState<string[]>([]);
  const [filters, setFilters] = useState<SchemeFilters | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [addDialogSemester, setAddDialogSemester] = useState('');
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  // Which syllabi download is in flight: 'all' for the header button, or a
  // semester_code for a per-semester button. null when idle. Lets a single
  // handler drive many buttons while only the clicked one shows its spinner.
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);

  // Layer 2 (immediate): set institutionId from userProfile.institution_id so
  // the page renders right away without waiting for /api/institutions/resolve.
  // Matches /bos/syllabus → syllabus-data-table.tsx line 52.
  useEffect(() => {
    if (isSuperAdmin) return;
    if (institutionId) return;
    if (!userProfile?.institution_id) return;
    setInstitutionId(userProfile.institution_id);
    setMyjkknInstitutionIds([userProfile.institution_id]);
  }, [isSuperAdmin, userProfile?.institution_id, institutionId]);

  // Layer 1 (enrichment): once useInstitutionContext resolves, fill in code,
  // display name, and CAS siblings. Replaces the placeholder values from
  // Layer 2 when COE returns rich data; no-op otherwise.
  useEffect(() => {
    if (isSuperAdmin || !institutionCtx) return;
    // Observer picked a DIFFERENT institution via the picker — don't clobber
    // that choice with the user's own-institution context. Only enrich while
    // the selection is (a CAS sibling of) their own institution.
    if (
      institutionId &&
      institutionId !== institutionCtx.myjkkn_id &&
      !institutionCtx.myjkkn_institution_ids.includes(institutionId)
    ) {
      return;
    }
    setInstitutionCode(institutionCtx.institution_code);
    setInstitutionName(institutionCtx.display_name || institutionCtx.name);
    setMyjkknInstitutionIds(institutionCtx.myjkkn_institution_ids);
    if (institutionCtx.myjkkn_id && institutionCtx.myjkkn_id !== institutionId) {
      setInstitutionId(institutionCtx.myjkkn_id);
    }
  }, [isSuperAdmin, institutionCtx, institutionId]);

  const { data, isLoading } = useBosCourseScheme(filters);
  const { data: semestersData } = useBosSemesters(filters, myjkknInstitutionIds);
  // Mirror the dropdown's scoping so PDF program-name lookup uses the same set.
  const programScopeId = isSuperAdmin ? undefined : institutionId;
  const { data: programOptions } = useBosProgramOptions(myjkknInstitutionIds, programScopeId);
  const { data: regulationOptions } = useBosRegulationOptions(myjkknInstitutionIds);

  const programName = useMemo(
    () => programOptions?.data?.find((p) => p.program_code === filters?.program_code)?.program_name ?? '',
    [programOptions, filters?.program_code],
  );

  // Derives "2024 – 2025" from regulation_year for the PDF academic-year header line
  const academicYear = useMemo(() => {
    const reg = regulationOptions?.data?.find((r) => r.regulation_code === filters?.regulation_code);
    if (!reg?.regulation_year) return undefined;
    return `${reg.regulation_year} – ${reg.regulation_year + 1}`;
  }, [regulationOptions, filters?.regulation_code]);

  // semester_code → display label (e.g. "FIRST SEMESTER") for PDF headings
  const semesterNameMap = useMemo(() => {
    const map = new Map<string, string>();
    semestersData?.data?.forEach((s) => map.set(s.semester_code, s.semester_name));
    return map;
  }, [semestersData]);

  // Map semester_code → mappings for quick lookup.
  // Each semester's courses are sorted by course_mapping.course_order (asc),
  // with null orders sent to the end so unsequenced rows don't push real ones down.
  // Ties (equal course_order, or both null) fall back to course_code asc so the
  // order is deterministic across renders and matches the PDF.
  const mappingsBySemester = useMemo(() => {
    const map = new Map<string, BosCourseMappingDetailed[]>();
    (data?.data ?? []).forEach((m) => {
      const key = m.semester_code ?? 'Unassigned';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    });
    for (const list of map.values()) {
      list.sort((a, b) => {
        const ao = a.course_order ?? Number.MAX_SAFE_INTEGER;
        const bo = b.course_order ?? Number.MAX_SAFE_INTEGER;
        if (ao !== bo) return ao - bo;
        return (a.course.course_code ?? '').localeCompare(b.course.course_code ?? '');
      });
    }
    return map;
  }, [data]);

  // Full ordered semester list from MyJKKN semesters table.
  // Falls back to semesters derived from mapping data (for institutions with
  // no semester master data configured).
  const allSemesters = useMemo(() => {
    const fromMaster = semestersData?.data ?? [];
    if (fromMaster.length > 0) return fromMaster.map((s) => s.semester_code);

    // Fallback: derive from mapping data, sorted numerically.
    return Array.from(mappingsBySemester.keys()).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true }),
    );
  }, [semestersData, mappingsBySemester]);

  const handleInstitutionSelect = (opt: InstitutionOption) => {
    setInstitutionCode(opt.institution_code);
    setInstitutionName(opt.name);
    setMyjkknInstitutionIds(opt.myjkkn_institution_ids);
  };

  const handleDownloadReport = async () => {
    if (!filters || allSemesters.length === 0) return;

    const header = getInstitutionHeader(institutionName || institutionCode);

    const toBase64 = (url: string): Promise<string> =>
      fetch(url)
        .then((r) => r.blob())
        .then(
          (blob) =>
            new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            }),
        );

    const [logoImage, rightLogoImage] = await Promise.all([
      toBase64('/logo.png').catch(() => undefined),
      toBase64(header.rightLogoImage).catch(() => undefined),
    ]);

    generateCourseSchemeReportPDF({
      institution_name: header.institution_name,
      institution_address: header.institution_address,
      institution_accreditation: header.institution_accreditation,
      logoImage,
      rightLogoImage,
      program_code: filters.program_code,
      program_name: programName,
      regulation_code: filters.regulation_code,
      academic_year: academicYear,
      semesters: allSemesters.map((semCode) => ({
        semester_code: semCode,
        semester_label: semesterNameMap.get(semCode)?.toUpperCase() ?? `SEMESTER ${semCode}`,
        courses: (mappingsBySemester.get(semCode) ?? []).map((m) => {
          // Match the on-screen semester table: 'COURSE_TYPE_CODE-COURSE_NAME'
          // (uppercase), with a graceful fallback to just the course_name when
          // course_type_code is missing from the joined COE row.
          const displayName = m.course.course_type_code
            ? `${m.course.course_type_code}-${m.course.course_name}`.toUpperCase()
            : (m.course.course_name ?? '').toUpperCase();
          return {
            course_part_master: m.course.course_part_master,
            course_code: m.course.course_code,
            course_name: displayName,
            exam_duration: m.course.exam_duration,
            credit: m.course.credit ?? 0,
            theory_hours: m.course.theory_hours ?? 0,
            practical_hours: m.course.practical_hours ?? 0,
            internal_max_mark: m.course.internal_max_mark ?? 0,
            external_max_mark: m.course.external_max_mark ?? 0,
            total_max_mark: m.course.total_max_mark ?? 0,
            // Drives "count the group once" in the semester totals — without
            // this the PDF would sum every elective option (see the report's
            // totals row) while the on-screen table collapses them.
            group_order: m.group_order,
          };
        }),
      })),
    });
  };

  // Per-course syllabi ZIP — builds one standalone PDF per course (named
  // `course_code_course_name.pdf`) and bundles them into a single .zip that the
  // browser downloads. `targetSemesters` scopes which semesters are included:
  // the header button passes every semester ('all'), while each semester table
  // passes just its own code so the ZIP holds only that semester's courses.
  // `key` drives the per-button spinner (see downloadingKey state).
  //
  // Each course renders into its OWN fresh jsPDF doc (startNewPage: false),
  // unlike the previous single-merged-document approach — that's what lets us
  // emit separate files. Shared per-run setup (syllabi fetch, taxonomy, logos)
  // still happens once. Mirrors the per-row PDF on /bos/syllabus (see
  // SyllabusPdfDownloadButton in row-actions.tsx).
  const handleDownloadSyllabi = async (targetSemesters: string[], key: string) => {
    if (!filters || targetSemesters.length === 0 || downloadingKey) return;

    setDownloadingKey(key);
    const tid = toast.loading('Generating syllabi ZIP…');
    try {
      // Resolve regulation_id (uuid) from the regulation_code that the filter holds.
      // The syllabus + taxonomy APIs key by id, not code.
      const regulation = regulationOptions?.data?.find(
        (r) => r.regulation_code === filters.regulation_code,
      );
      if (!regulation) throw new Error('Regulation not found in options');

      // Fetch every published syllabus for this regulation, PAGE BY PAGE.
      // We over-fetch (any program in this regulation) and filter down to the
      // courses we actually have on screen — cheaper than one request per course.
      //
      // This MUST drain all pages: a single limit=500 call used to be the whole
      // fetch, so once a regulation grew past 500 syllabi (CAS R-2024 has 836)
      // every course sorting after the cutoff silently fell out of the ZIP while
      // the download still reported success. Loop until we've seen metadata.total.
      const PAGE_SIZE = 500;
      const MAX_PAGES = 40; // runaway guard — 20k syllabi
      const syllabi: BosCourseSyllabus[] = [];
      for (let page = 1; page <= MAX_PAGES; page++) {
        const params = new URLSearchParams({
          regulationId: regulation.id,
          isLatest: 'true',
          limit: String(PAGE_SIZE),
          page: String(page),
        });
        if (institutionId) params.set('institutionsId', institutionId);

        const syllabiRes = await fetch(`/api/bos/syllabus?${params}`);
        if (!syllabiRes.ok) throw new Error('Failed to fetch syllabi');
        const syllabiJson = await syllabiRes.json();
        const rows: BosCourseSyllabus[] = syllabiJson.data ?? [];
        syllabi.push(...rows);

        const total = syllabiJson.metadata?.total ?? syllabi.length;
        if (rows.length === 0 || syllabi.length >= total) break;
      }

      const syllabusByCourseCode = new Map<string, BosCourseSyllabus>();
      syllabi.forEach((s) => syllabusByCourseCode.set(s.course_code, s));

      // Taxonomy (k_values, PO/PSO keys) is regulation-scoped, so one fetch
      // covers every course in the report. Failure is non-fatal — the syllabus
      // renderer falls back to Bloom's defaults + mapping-derived PO keys.
      let kValues: Record<string, string> | undefined;
      let poKeys: string[] | undefined;
      let psoKeys: string[] | undefined;
      try {
        const taxRes = await fetch(`/api/bos/taxonomy/${regulation.id}`);
        if (taxRes.ok) {
          const taxonomy = await taxRes.json();
          kValues = taxonomy.k_values;
          poKeys = extractPOKeys(taxonomy.pos);
          psoKeys = taxonomy.psos ? extractPOKeys(taxonomy.psos) : [];
        }
      } catch {
        // intentional: taxonomy lookup is best-effort
      }

      // Institution header / logo prep — same recipe as handleDownloadReport.
      const header = getInstitutionHeader(institutionName || institutionCode);
      const toBase64 = (url: string): Promise<string> =>
        fetch(url)
          .then((r) => r.blob())
          .then(
            (blob) =>
              new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
              }),
          );
      const [logoImage, rightLogoImage] = await Promise.all([
        toBase64('/logo.png').catch(() => undefined),
        toBase64(header.rightLogoImage).catch(() => undefined),
      ]);

      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();

      // Sanitizes a component of the "code_name.pdf" filename: strips characters
      // that are illegal/awkward on Windows & in zip entries, collapses runs of
      // whitespace to single underscores, and caps length so paths stay sane.
      const safe = (s: string) =>
        (s ?? '')
          .replace(/[^\w\s-]/g, '')
          .replace(/\s+/g, '_')
          .replace(/_+/g, '_')
          .replace(/^_|_$/g, '')
          .slice(0, 80);

      // Guards against two courses producing an identical filename inside the
      // zip (jszip would silently overwrite) by suffixing _2, _3, … on collision.
      const usedNames = new Set<string>();
      const uniqueName = (base: string) => {
        let name = `${base}.pdf`;
        let n = 2;
        while (usedNames.has(name)) name = `${base}_${n++}.pdf`;
        usedNames.add(name);
        return name;
      };

      let renderedCount = 0;
      // Scheme courses that have no authored syllabus yet — reported to the user
      // so a missing PDF reads as "not authored" rather than a download bug.
      const skippedCodes: string[] = [];

      for (const semCode of targetSemesters) {
        const courses = mappingsBySemester.get(semCode) ?? [];
        for (const m of courses) {
          const syllabus = syllabusByCourseCode.get(m.course.course_code);
          if (!syllabus) { skippedCodes.push(m.course.course_code); continue; }

          // The on-screen semester table already exposes course_type_code from
          // the COE join, so we don't need an extra courses-master round-trip
          // (unlike the per-row download in row-actions.tsx).
          const coursePartLabel = m.course.course_type_code
            ?? m.course.course_part_master
            ?? undefined;
          const displayCourseName = coursePartLabel
            ? `${coursePartLabel}-${syllabus.course_name}`
            : syllabus.course_name;

          const objectivesContent = syllabus.course_objectives as BosCourseObjectivesContent | undefined;
          const outcomesContent = syllabus.course_learning_outcomes as BosCourseLearnOutcomesContent | undefined;

          // Fresh single-course document — this is the unit we add to the zip.
          const doc = new jsPDF('portrait', 'mm', 'a4');
          renderCourseSyllabusPDF(
            doc,
            {
              institution_name: header.institution_name,
              institution_address: header.institution_address,
              institution_accreditation: header.institution_accreditation,
              logoImage,
              rightLogoImage,
              course_code: syllabus.course_code,
              course_name: displayCourseName,
              course_part: coursePartLabel,
              total_hours: syllabus.total_hours ?? undefined,
              contact_hours: syllabus.contact_hours ?? undefined,
              credits: syllabus.course_credits ?? undefined,
              objectives: objectivesContent?.objectives ?? [],
              clos: outcomesContent?.clos ?? [],
              k_values: kValues,
              units: syllabus.course_content?.units ?? [],
              practical_topics: syllabus.course_content?.is_practical
                ? (syllabus.course_content?.topics ?? [])
                : undefined,
              textbooks: syllabus.textbooks?.primary ?? [],
              references: syllabus.textbooks?.references ?? [],
              web_resources: syllabus.web_resources?.resources ?? [],
              pedagogy_methods: syllabus.pedagogy?.methods ?? [],
              po_mappings: syllabus.po_mappings?.mappings ?? [],
              po_keys: poKeys,
              pso_keys: psoKeys,
            },
            // Single-course doc: draw on the doc's existing first page.
            { startNewPage: false },
          );

          // Filename: `course_code_course_name.pdf` — use the raw syllabus
          // course_name (not the part-prefixed display name) per the request.
          const fileBase = `${safe(syllabus.course_code)}_${safe(syllabus.course_name)}`;
          zip.file(uniqueName(fileBase), doc.output('arraybuffer'));
          renderedCount += 1;
        }
      }

      if (renderedCount === 0) {
        toast.error('No syllabi found for the courses in this scheme', { id: tid });
        return;
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const semTag = key === 'all' ? '' : `_Sem${safe(key)}`;
      const zipName = `Syllabi_${safe(filters.program_code)}_${filters.regulation_code}${semTag}_${new Date().toISOString().split('T')[0]}.zip`;

      // Trigger the download via a transient anchor — no extra dependency needed.
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = zipName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      if (skippedCodes.length > 0) {
        toast.success(
          `Downloaded ${renderedCount} ${renderedCount === 1 ? 'syllabus' : 'syllabi'} as ZIP. ` +
            `No syllabus authored yet for: ${skippedCodes.join(', ')}`,
          { id: tid, duration: 8000 },
        );
      } else {
        toast.success(`Downloaded ${renderedCount} ${renderedCount === 1 ? 'syllabus' : 'syllabi'} as ZIP`, { id: tid });
      }
    } catch (e) {
      toast.error((e as Error).message || 'Failed to generate syllabi ZIP', { id: tid });
    } finally {
      setDownloadingKey(null);
    }
  };

  return (
    <div className='space-y-6'>
      <div className='flex items-end justify-between gap-3 flex-wrap'>
        <div className='flex gap-3 flex-wrap items-end'>
          {canBrowseInstitutions && (
            <InstitutionPicker
              value={institutionId}
              showAllOption={isSuperAdmin}
              // View-grant observers browse all institutions read-only; their
              // own institution stays preselected via the profile seed above.
              allowAllInstitutions={!isSuperAdmin}
              onChange={(id) => {
                setInstitutionId(id);
                setFilters(null);
                if (!id) { setInstitutionCode(''); setMyjkknInstitutionIds([]); }
              }}
              onSelect={handleInstitutionSelect}
            />
          )}
          {institutionId && (
            <SchemeFiltersBar
              institutionId={institutionId}
              myjkknInstitutionIds={myjkknInstitutionIds}
              value={filters}
              onChange={setFilters}
              isSuperAdmin={isSuperAdmin}
            />
          )}
        </div>
        <div className='flex flex-wrap gap-2'>
          {filters && !isLoading && allSemesters.length > 0 && (
            <Button variant='outline' size='sm' onClick={handleDownloadReport}>
              <FileDown className='mr-2 h-4 w-4' />
              Download Report
            </Button>
          )}
          {filters && !isLoading && allSemesters.length > 0 && (
            <Button
              variant='outline'
              size='sm'
              onClick={() => handleDownloadSyllabi(allSemesters, 'all')}
              disabled={downloadingKey !== null}
            >
              {downloadingKey === 'all'
                ? <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                : <BookOpen className='mr-2 h-4 w-4' />}
              Download Syllabi
            </Button>
          )}
          {canEdit && filters && (
            <Button
              variant={editMode ? 'default' : 'outline'}
              size='sm'
              onClick={() => setEditMode((v) => !v)}
            >
              {editMode ? <Pencil className='mr-2 h-4 w-4' /> : <Eye className='mr-2 h-4 w-4' />}
              {editMode ? 'Edit Mode' : 'View Mode'}
            </Button>
          )}
        </div>
      </div>

      {!institutionId && (
        <p className='text-sm text-muted-foreground'>Select an institution to begin.</p>
      )}

      {institutionId && !filters && (
        <p className='text-sm text-muted-foreground'>
          Select a program and regulation to load the scheme.
        </p>
      )}

      {filters && isLoading && <Skeleton className='h-96 w-full' />}

      {filters && !isLoading && allSemesters.length === 0 && (
        <p className='text-sm text-muted-foreground'>No semesters configured for this program.</p>
      )}

      {filters && !isLoading && allSemesters.map((semCode) => (
        <SemesterTable
          key={semCode}
          semester={semCode}
          mappings={mappingsBySemester.get(semCode) ?? []}
          editMode={editMode}
          onAddToSemester={(sem) => { setAddDialogSemester(sem); setAddDialogOpen(true); }}
          onDownloadSyllabi={() => handleDownloadSyllabi([semCode], semCode)}
          downloading={downloadingKey === semCode}
          downloadDisabled={downloadingKey !== null}
        />
      ))}

      {filters && (
        <AddCourseDialog
          open={addDialogOpen}
          onOpenChange={setAddDialogOpen}
          semester={addDialogSemester}
          filters={filters}
          institutionCode={institutionCode}
        />
      )}
    </div>
  );
}
