// Pharmacy (COP) syllabus HTML sections for PDF/XLSX export.
//
// Pharmacy models (pci_pharm B.Pharm, mgr_pharmd Pharm.D) have NO CO / PO / PSO
// / Bloom's — so the Anna "official" PDF layout (CLO table, PO mappings,
// pedagogy) doesn't apply. This renders the PCI / Dr. MGR layout instead:
//   Scope (B.Pharm) → Objectives → Content (Unit I–V or flat practical/lecture
//   topics) → Textbooks & References → Exam Scheme → Internship (Pharm.D).
import type {
  BosCourseSyllabus,
  BosCourseObjectivesContent,
  BosCourseContentData,
  BosBooksData,
  BosWebResourcesData,
  BosExamScheme,
  BosInternshipPostings,
} from '@/types/bos';

const esc = (s: unknown): string =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function generatePharmacyFormat(
  syllabus: BosCourseSyllabus,
  options?: { includeReferences?: boolean },
): string {
  const includeReferences = options?.includeReferences !== false;
  const isBPharm = syllabus.academic_model === 'pci_pharm';
  let html = '';

  // Scope (B.Pharm)
  if (isBPharm && syllabus.scope) {
    html += `<div class="section"><h2>Scope</h2><p>${esc(syllabus.scope)}</p></div>`;
  }

  // Objectives (course_objectives.objectives[])
  const objData = syllabus.course_objectives as BosCourseObjectivesContent | undefined;
  const objectives = (objData?.objectives ?? []) as Array<{ description?: string }>;
  if (objectives.length > 0) {
    html += `<div class="section"><h2>Objectives</h2><ol>`;
    objectives.forEach((o) => { html += `<li>${esc(o.description)}</li>`; });
    html += `</ol></div>`;
  }

  // Content — supports Unit I–V (B.Pharm theory), flat practical/lecture topics,
  // and the AHS-shaped year→subject tree.
  const content = syllabus.course_content as BosCourseContentData | undefined;
  html += `<div class="section"><h2>${isBPharm ? 'Course Content' : 'Lecture-wise Program'}</h2>`;
  if (content?.is_practical && content.topics?.length) {
    html += '<ol>';
    content.topics.forEach((t) => {
      html += `<li>${esc(t.title)}`;
      if (t.subtopics?.length) {
        html += '<ul>';
        t.subtopics.forEach((st) => { html += `<li>${esc(st.title)}</li>`; });
        html += '</ul>';
      }
      html += '</li>';
    });
    html += '</ol>';
  } else if (content?.units?.length) {
    content.units.forEach((u) => {
      const hrs = u.hours ? ` <em>(${esc(u.hours)} hours)</em>` : '';
      html += `<h3>Unit ${esc(u.unit_id)}: ${esc(u.unit_title)}${hrs}</h3>`;
      (u.chapters ?? []).forEach((c) => {
        html += `<p><strong>${esc(c.title)}</strong></p>`;
        if (c.sections) html += `<p>${esc(c.sections)}</p>`;
        if (c.subtopics?.length) {
          html += '<ul>';
          c.subtopics.forEach((st) => { html += `<li>${esc(st.title)}</li>`; });
          html += '</ul>';
        }
      });
    });
  }
  // Pharm.D year→subject tree (ahs_content), when present.
  const ahs = syllabus.ahs_content;
  if (ahs?.subjects?.length) {
    if (ahs.intro) html += `<p>${esc(ahs.intro)}</p>`;
    ahs.subjects.forEach((s) => {
      html += `<h3>${esc(s.subject_no ? `${s.subject_no} ` : '')}${esc(s.title)}</h3>`;
      if (s.mode === 'units' && s.units?.length) {
        s.units.forEach((u) => {
          html += `<p><strong>${esc(u.unit_no)}</strong></p><ul>`;
          (u.topics ?? []).forEach((t) => { html += `<li>${esc(t)}</li>`; });
          html += '</ul>';
        });
      } else if (s.topics?.length) {
        html += '<ol>';
        s.topics.forEach((t) => { html += `<li>${esc(t)}</li>`; });
        html += '</ol>';
      }
    });
  }
  html += '</div>';

  // Textbooks & References
  if (includeReferences) {
    const books = syllabus.textbooks as BosBooksData | undefined;
    if (books && ((books.primary?.length ?? 0) > 0 || (books.references?.length ?? 0) > 0)) {
      html += `<div class="section"><h2>Books</h2>`;
      if (books.primary?.length) {
        html += '<h3>Recommended Books</h3><ol>';
        books.primary.forEach((b) => {
          html += `<li>${esc(b.title)}${b.author ? ` by ${esc(b.author)}` : ''}${b.publisher ? `, ${esc(b.publisher)}` : ''}</li>`;
        });
        html += '</ol>';
      }
      if (books.references?.length) {
        html += '<h3>Reference Books</h3><ol>';
        books.references.forEach((b) => {
          html += `<li>${esc(b.title)}${b.author ? ` by ${esc(b.author)}` : ''}</li>`;
        });
        html += '</ol>';
      }
      html += '</div>';
    }
    const web = syllabus.web_resources as BosWebResourcesData | undefined;
    if (web?.resources?.length) {
      html += `<div class="section"><h2>Web Resources</h2><ul>`;
      web.resources.forEach((r) => { html += `<li><a href="${esc(r.url)}">${esc(r.title)}</a></li>`; });
      html += `</ul></div>`;
    }
  }

  // Exam scheme
  html += renderExamScheme(syllabus.exam_scheme);

  // Internship (Pharm.D)
  html += renderInternship(syllabus.internship_postings);

  return html;
}

function renderExamScheme(scheme?: BosExamScheme): string {
  if (!scheme || (!scheme.components?.length && !scheme.question_pattern)) return '';
  let html = `<div class="section"><h2>Exam Scheme</h2>`;
  if (scheme.components?.length) {
    html += '<table><thead><tr><th>Component</th><th>Max</th><th>Min</th><th>Duration (h)</th></tr></thead><tbody>';
    scheme.components.forEach((c) => {
      const sub = c.sub?.length
        ? `<br><small>${c.sub.map((s) => `${esc(s.name)}: ${s.max ?? ''}`).join(' · ')}</small>`
        : '';
      html += `<tr><td>${esc(c.name)}${sub}</td><td>${c.max ?? ''}</td><td>${c.min ?? ''}</td><td>${c.duration_hours ?? ''}</td></tr>`;
    });
    html += '</tbody></table>';
  }
  const parts: string[] = [];
  if (scheme.total_marks != null) parts.push(`Total: ${scheme.total_marks}`);
  if (scheme.pass_pct != null) parts.push(`Pass: ${scheme.pass_pct}%`);
  if (scheme.distinction_pct != null) parts.push(`Distinction: ${scheme.distinction_pct}%`);
  if (parts.length) html += `<p>${parts.map(esc).join(' · ')}</p>`;

  const qp = scheme.question_pattern;
  if (qp?.sections?.length) {
    html += `<h3>Question-paper pattern${qp.variant ? ` (${esc(qp.variant)} marks)` : ''}</h3>`;
    html += '<table><thead><tr><th>Section</th><th>Marks</th></tr></thead><tbody>';
    qp.sections.forEach((s) => { html += `<tr><td>${esc(s.name)}</td><td>${s.marks ?? ''}</td></tr>`; });
    html += '</tbody></table>';
  }
  if (scheme.notes) html += `<p>${esc(scheme.notes)}</p>`;
  html += '</div>';
  return html;
}

function renderInternship(data?: BosInternshipPostings): string {
  if (!data || (!data.postings?.length && !data.total_duration)) return '';
  let html = `<div class="section"><h2>Internship / Residency</h2>`;
  if (data.total_duration) html += `<p><strong>Total duration:</strong> ${esc(data.total_duration)}</p>`;
  if (data.postings?.length) {
    html += '<table><thead><tr><th>Area / Department</th><th>Duration</th><th>×</th></tr></thead><tbody>';
    data.postings.forEach((p) => {
      html += `<tr><td>${esc(p.area)}</td><td>${esc(p.duration ?? '')}</td><td>${p.repeat ?? ''}</td></tr>`;
    });
    html += '</tbody></table>';
  }
  if (data.notes) html += `<p>${esc(data.notes)}</p>`;
  html += '</div>';
  return html;
}
