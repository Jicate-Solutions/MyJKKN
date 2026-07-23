// v3.5 branded HTML renderer for the BoS course syllabus.
//
// Produces a self-contained, print-ready HTML document in the JKKN v3.5
// template style (green branding, capstone cards, LLC panel) — the same look
// as the source documents the Fink's/Capstone content was authored in. The
// @media print rules make it a direct print-to-PDF artefact, complementing
// the formal jsPDF/DOCX exports.
//
// Inline **bold** markers in the paragraph fields (capstone intro, concept
// intro, LLC description) render as <strong>, mirroring the source <strong>
// spans. All data is HTML-escaped before interpolation.

import type {
	BosCourseSyllabus,
	BosCourseObjectivesContent,
	BosCourseLearnOutcomesContent,
} from '@/types/bos'

function esc(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
}

// **bold** markers → <strong>; everything else escaped.
function rich(s: string): string {
	return s
		.split('**')
		.map((part, i) => (i % 2 === 1 ? `<strong>${esc(part)}</strong>` : esc(part)))
		.join('')
}

const CSS = `
  :root {
    --jkkn-green: #0B6D41; --jkkn-green-light: #E6F2EC; --jkkn-green-dark: #084F30;
    --text: #1A1A1A; --text-muted: #555; --border-light: #E0E0E0;
    --neutral-bg: #FAFAFA; --new-bg: #FFFBEB; --new-border: #F59E0B;
  }
  * { box-sizing: border-box; }
  body { font-family: "Times New Roman", Times, serif; color: var(--text); line-height: 1.45; margin: 0; background: #FFF; font-size: 12pt; }
  .container { max-width: 980px; margin: 0 auto; padding: 24px 32px 60px; }
  header.cover { border-bottom: 4px solid var(--jkkn-green); padding-bottom: 14px; margin-bottom: 22px; font-family: Arial, Helvetica, sans-serif; }
  header.cover .eyebrow { color: var(--jkkn-green); font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; font-weight: bold; margin-bottom: 6px; }
  header.cover h1 { color: var(--jkkn-green-dark); font-size: 20px; margin: 0 0 6px; line-height: 1.25; }
  header.cover .meta-line { color: var(--text-muted); font-size: 12px; margin-bottom: 10px; }
  header.cover .version-pill { display: inline-block; background: var(--jkkn-green); color: white; padding: 3px 10px; border-radius: 10px; font-size: 10px; font-weight: bold; letter-spacing: 0.05em; }
  .callout { background: var(--jkkn-green-light); border-left: 4px solid var(--jkkn-green); padding: 10px 14px; margin: 14px 0 22px; border-radius: 0 4px 4px 0; font-family: Arial, Helvetica, sans-serif; font-size: 11.5px; }
  .callout strong { color: var(--jkkn-green-dark); }
  .syllabus { border: 1.5px solid var(--text); padding: 22px 28px; margin: 30px 0; background: white; }
  .syllabus-title { text-align: center; font-weight: bold; text-transform: uppercase; font-size: 13pt; margin: 0 0 4px; }
  .syllabus-course-name { text-align: center; font-size: 14pt; font-weight: bold; margin: 0 0 16px; text-decoration: underline; }
  table.header-table { width: 100%; border-collapse: collapse; margin: 0 0 18px; font-size: 11pt; }
  table.header-table th, table.header-table td { border: 1px solid var(--text); padding: 6px 10px; text-align: center; }
  table.header-table th { background: #F0F0F0; font-weight: bold; }
  h3.section-head { font-size: 12.5pt; font-weight: bold; margin: 22px 0 6px; padding-bottom: 2px; border-bottom: 1.5px solid var(--text); }
  h4.subsection-head { font-size: 11.5pt; font-weight: bold; margin: 14px 0 6px; }
  table.s-table { width: 100%; border-collapse: collapse; margin: 6px 0 14px; font-size: 10.5pt; }
  table.s-table th, table.s-table td { border: 1px solid var(--text); padding: 5px 8px; text-align: left; vertical-align: top; }
  table.s-table th { background: #F0F0F0; font-weight: bold; text-align: center; font-size: 10pt; }
  table.s-table .center { text-align: center; }
  table.s-table .bold { font-weight: bold; }
  .unit-block { margin: 10px 0; }
  .unit-head { font-weight: bold; font-size: 11.5pt; margin: 0 0 4px; background: #F4F4F4; padding: 4px 8px; border-left: 3px solid var(--text); }
  .unit-content-text { margin: 0 0 6px 16px; font-size: 11pt; }
  ol.biblio { margin: 0 0 10px 28px; padding: 0; font-size: 10.5pt; }
  ol.biblio li { margin-bottom: 3px; }
  table.signature-block { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 10pt; }
  table.signature-block td { border: 1px solid var(--text); padding: 8px 10px; width: 50%; vertical-align: top; }
  table.signature-block .signature-label { text-align: center; font-weight: bold; background: #F4F4F4; padding: 4px; }
  table.mapping-table { width: 100%; border-collapse: collapse; margin: 6px 0 14px; font-size: 10pt; text-align: center; }
  table.mapping-table th, table.mapping-table td { border: 1px solid var(--text); padding: 4px 6px; }
  table.mapping-table th { background: #F0F0F0; font-weight: bold; }
  table.mapping-table .co-cell { font-weight: bold; text-align: left; padding-left: 8px; }
  .assessment-section { background: var(--neutral-bg); border: 1px solid var(--border-light); padding: 12px 16px; margin: 10px 0; border-radius: 4px; }
  .capstone-section { background: var(--new-bg); border: 2px dashed var(--new-border); padding: 12px 16px; margin: 14px 0; border-radius: 4px; }
  .capstone-section .new-tag { display: inline-block; background: var(--new-border); color: white; padding: 1px 7px; border-radius: 3px; font-size: 9.5px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; font-family: Arial, sans-serif; vertical-align: middle; }
  .capstone-section h4 { margin: 0 0 4px; font-size: 11.5pt; display: inline; margin-left: 4px; }
  .capstone-section .capstone-meta { color: var(--text-muted); font-size: 10pt; font-style: italic; }
  .option-card { background: white; border: 1px solid var(--border-light); border-left: 3px solid var(--new-border); padding: 10px 14px; margin: 8px 0; border-radius: 0 3px 3px 0; }
  .option-card .option-tag { display: inline-block; background: var(--new-border); color: white; padding: 1px 8px; border-radius: 3px; font-size: 9.5px; font-weight: bold; letter-spacing: 0.05em; text-transform: uppercase; font-family: Arial, sans-serif; margin-bottom: 4px; }
  .option-card .option-title { font-style: italic; font-weight: bold; font-size: 11pt; color: var(--jkkn-green-dark); margin: 4px 0; }
  .option-card p.option-body { font-size: 10.5pt; margin: 4px 0; }
  .llc-section { background: var(--jkkn-green-light); border: 2px solid var(--jkkn-green); padding: 12px 16px; margin: 14px 0; border-radius: 4px; }
  .llc-section .new-tag { background: var(--jkkn-green); }
  footer { border-top: 2px solid var(--jkkn-green); padding-top: 12px; margin-top: 28px; font-family: Arial, sans-serif; font-size: 10px; color: var(--text-muted); }
  @media print {
    .container { padding: 12px; }
    table { page-break-inside: avoid; }
    .unit-block, .option-card { page-break-inside: avoid; }
  }
`

export interface V35HtmlOptions {
	institutionName?: string
	institutionAddress?: string
}

export function generateV35SyllabusHtml(
	syllabus: BosCourseSyllabus,
	opts: V35HtmlOptions = {},
): string {
	const objectives = (syllabus.course_objectives as BosCourseObjectivesContent | undefined)?.objectives ?? []
	const clos = (syllabus.course_learning_outcomes as BosCourseLearnOutcomesContent | undefined)?.clos ?? []
	const content = syllabus.course_content
	const textbooks = syllabus.textbooks?.primary ?? []
	const references = syllabus.textbooks?.references ?? []
	const webResources = syllabus.web_resources?.resources ?? []
	const pedagogy = syllabus.pedagogy?.methods ?? []
	const mappings = syllabus.po_mappings?.mappings ?? []
	const ca = syllabus.concept_applications
	const ap = syllabus.assessment_pattern
	const cp = syllabus.capstone_project
	const cr = syllabus.capstone_rubric
	const llc = syllabus.llc_conference

	const institution = opts.institutionName ?? 'JKKN College of Arts and Science'
	const code = syllabus.course_code
	const name = syllabus.course_name

	const parts: string[] = []

	// ── Cover header + stance callout ────────────────────────────────────────
	parts.push(`
<header class="cover">
  <div class="eyebrow">${esc(institution)}${syllabus.stream ? ` &middot; ${esc(syllabus.stream)}` : ''}</div>
  <h1>${esc(name)}</h1>
  <div class="meta-line">Course code <strong>${esc(code)}</strong>. Original BoS-approved content preserved verbatim; CLOs Fink's-tagged; one Concept Application per Unit; <strong>5 Capstone Options</strong> as the 10-mark internal assessment, presented at the Learners Led Conference.</div>
  <span class="version-pill">v3.5 &middot; 5 Capstone Options</span>
</header>
<div class="callout">
  <strong>Foundational stance — Humans are Principals, AI are Agents.</strong> Concept Applications and Capstone Options are written so a generative AI cannot produce a plausible deliverable without the Learner having done the real act.
</div>`)

	parts.push(`<div class="syllabus">
  <p class="syllabus-title">Course</p>
  <p class="syllabus-course-name">${esc(name)}</p>
  <table class="header-table">
    <thead><tr><th>Course Code</th><th>Total Hours</th><th>Contact Hours / Week</th><th>Credits</th></tr></thead>
    <tbody><tr><td>${esc(code)}</td><td>${syllabus.total_hours ?? '–'}</td><td>${syllabus.contact_hours ?? '–'}</td><td>${syllabus.course_credits ?? '–'}</td></tr></tbody>
  </table>`)

	// ── Objectives ────────────────────────────────────────────────────────────
	if (objectives.length > 0) {
		parts.push(`<h3 class="section-head">Course Objectives</h3>
  <table class="s-table">
    <thead><tr><th style="width:8%">S.No.</th><th>Objective</th></tr></thead>
    <tbody>${objectives.map((o, i) => `
      <tr><td class="center bold">${o.number ?? i + 1}</td><td>${esc(o.description || '')}</td></tr>`).join('')}
    </tbody>
  </table>`)
	}

	// ── CLOs ─────────────────────────────────────────────────────────────────
	if (clos.length > 0) {
		parts.push(`<h3 class="section-head">Expected Course Learning Outcomes</h3>
  <table class="s-table">
    <thead><tr><th style="width:9%">CO No.</th><th>On completion, Learners will be able to:</th><th style="width:20%">K / Fink Codes</th></tr></thead>
    <tbody>${clos.map(c => `
      <tr><td class="center bold">CO ${c.clo_number}</td><td>${esc(c.description || '')}</td><td class="center">${esc((c.k_values ?? []).join(', '))}</td></tr>`).join('')}
    </tbody>
  </table>`)
	}

	// ── Course content (units or practical topics) ───────────────────────────
	if (content?.is_practical && (content.topics?.length ?? 0) > 0) {
		parts.push(`<h3 class="section-head">Course Content</h3>
  <div class="unit-block"><p class="unit-head">List of Experiments</p><ol class="biblio">${(content.topics ?? []).map(t => `
    <li>${esc(t.title || '')}${(t.subtopics?.length ?? 0) > 0 ? `<ol>${(t.subtopics ?? []).map(s => `<li>${esc(s.title || '')}</li>`).join('')}</ol>` : ''}</li>`).join('')}
  </ol></div>`)
	} else if ((content?.units?.length ?? 0) > 0) {
		parts.push(`<h3 class="section-head">Course Content</h3>${(content?.units ?? []).map(u => `
  <div class="unit-block"><p class="unit-head">UNIT ${esc(u.unit_id)}${u.unit_title ? ` &nbsp;&middot;&nbsp; ${esc(u.unit_title)}` : ''}</p>
    <p class="unit-content-text">${(u.chapters ?? []).map(ch => `<strong>${esc(ch.title || '')}</strong>${ch.sections ? ` ${esc(ch.sections)}` : ''}${(ch.subtopics?.length ?? 0) > 0 ? ` &middot; ${(ch.subtopics ?? []).map(s => esc(s.title || '')).join(' &middot; ')}` : ''}`).join(' ')}</p>
  </div>`).join('')}`)
	}

	// ── Books / web / pedagogy ────────────────────────────────────────────────
	if (textbooks.length > 0) {
		parts.push(`<h3 class="section-head">Text Books</h3>
  <ol class="biblio">${textbooks.map(b => `<li>${esc([b.title, b.publisher, b.publication_year ? String(b.publication_year) : ''].filter(Boolean).join(', '))}${b.author ? ` — ${esc(b.author)}` : ''}</li>`).join('')}</ol>`)
	}
	if (references.length > 0) {
		parts.push(`<h3 class="section-head">Reference Books</h3>
  <ol class="biblio">${references.map(b => `<li>${esc([b.title, b.publisher, b.publication_year ? String(b.publication_year) : ''].filter(Boolean).join(', '))}${b.author ? ` — ${esc(b.author)}` : ''}</li>`).join('')}</ol>`)
	}
	if (webResources.length > 0) {
		parts.push(`<h3 class="section-head">Web Resources</h3>
  <ol class="biblio">${webResources.map(r => `<li>${esc(r.title || r.url || '')}${r.url ? ` — <span style="font-size:9.5pt;">${esc(r.url)}</span>` : ''}</li>`).join('')}</ol>`)
	}
	if (pedagogy.length > 0) {
		parts.push(`<h3 class="section-head">Pedagogy</h3>
  <p style="font-size:10.5pt;">${esc(pedagogy.join('; '))}.</p>`)
	}

	// ── PO / PSO mapping ─────────────────────────────────────────────────────
	if (mappings.length > 0) {
		const poKeys = [...new Set(mappings.flatMap(m => Object.keys(m.pos ?? {})))].sort()
		const psoKeys = [...new Set(mappings.flatMap(m => Object.keys(m.psos ?? {})))].sort()
		parts.push(`<h3 class="section-head">Mapping with Programme Outcomes</h3>
  <table class="mapping-table">
    <thead><tr><th>CO</th>${poKeys.map(k => `<th>${esc(k)}</th>`).join('')}${psoKeys.map(k => `<th>${esc(k)}</th>`).join('')}</tr></thead>
    <tbody>${mappings.map(m => `
      <tr><td class="co-cell">${esc(m.co_id.toUpperCase())}</td>${poKeys.map(k => `<td>${esc(m.pos?.[k] ?? '–')}</td>`).join('')}${psoKeys.map(k => `<td>${esc(m.psos?.[k] ?? '–')}</td>`).join('')}</tr>`).join('')}
    </tbody>
  </table>
  <p style="font-size:9.5pt; margin:4px 0 14px;">H – High &nbsp;|&nbsp; M – Medium &nbsp;|&nbsp; L – Low</p>`)
	}

	// ── v3.5: Concept Applications ────────────────────────────────────────────
	if (ca && ((ca.activities?.length ?? 0) > 0 || ca.intro_note?.trim())) {
		parts.push(`<h3 class="section-head">Concept Applications (Formative Learning Activities)</h3>
  ${ca.intro_note?.trim() ? `<p style="font-size:10.5pt; margin:4px 0 6px;">${rich(ca.intro_note.trim())}</p>` : ''}
  ${(ca.activities?.length ?? 0) > 0 ? `<table class="s-table">
    <thead><tr><th style="width:8%">Unit</th><th style="width:16%">Fink's Dim.</th><th style="width:38%">Task</th><th>Deliverable &amp; Notes</th></tr></thead>
    <tbody>${(ca.activities ?? []).map((a, i) => `
      <tr><td class="center bold">${esc(a.unit || String(a.sno ?? i + 1))}</td><td class="center">${esc(a.finks_dimension || '')}</td><td>${esc(a.task || '')}</td><td>${esc(a.deliverable_notes || '')}</td></tr>`).join('')}
    </tbody>
  </table>` : ''}`)
	}

	// ── v3.5: Assessment Pattern ─────────────────────────────────────────────
	if (ap && ((ap.components?.length ?? 0) > 0 || ap.internal_marks != null)) {
		const comps = ap.components ?? []
		const total = comps.reduce((s, c) => s + (Number(c.marks) || 0), 0)
		parts.push(`<h3 class="section-head">Assessment Pattern</h3>
  <div class="assessment-section">
    <p style="font-size:10.5pt; margin:0 0 8px;"><strong>Internal = ${ap.internal_marks ?? '–'} Marks &nbsp;|&nbsp; External = ${ap.external_marks ?? '–'} Marks</strong></p>
    ${comps.length > 0 ? `<table class="s-table">
      <thead><tr><th style="width:8%">S.No</th><th>Component</th><th style="width:14%">Marks</th></tr></thead>
      <tbody>${comps.map((c, i) => `
        <tr><td class="center">${c.sno ?? i + 1}</td><td>${esc(c.component || '')}</td><td class="center bold">${c.marks ?? '–'}</td></tr>`).join('')}
        <tr style="font-weight:bold;"><td colspan="2" style="text-align:right;">Total Internal</td><td class="center">${total}</td></tr>
      </tbody>
    </table>` : ''}
    ${ap.activities_note?.trim() ? `<p style="font-size:9.5pt; margin:4px 0 0;">${rich(ap.activities_note.trim())}</p>` : ''}
    ${ap.note?.trim() ? `<p style="font-size:9.5pt; margin:8px 0 0; color:var(--text-muted); font-style:italic;">Note: ${rich(ap.note.trim())}</p>` : ''}
  </div>`)
	}

	// ── v3.5: Capstone Project + Rubric ──────────────────────────────────────
	if (cp && ((cp.options?.length ?? 0) > 0 || cp.intro_note?.trim())) {
		parts.push(`<div class="capstone-section">
    <span class="new-tag">v3.5</span>
    <h4>Capstone Project — choose ONE of FIVE</h4>
    ${cp.intro_note?.trim() ? `<p style="font-size:10.5pt; margin:6px 0 10px;">${rich(cp.intro_note.trim())}</p>` : ''}
    ${(cp.options ?? []).map((o, i) => `
    <div class="option-card">
      <div class="option-tag">Option ${o.option_no ?? i + 1}</div>
      <p class="option-title">${esc(o.title || '')}</p>
      <p class="option-body">${o.primary?.trim() ? `<strong>Primary (AI-proof):</strong> ${esc(o.primary.trim())} ` : ''}${o.support?.trim() ? `<strong>Support:</strong> ${esc(o.support.trim())} ` : ''}${o.llc?.trim() ? `<strong>LLC:</strong> ${esc(o.llc.trim())}` : ''}</p>
    </div>`).join('')}
    ${cr && (cr.criteria?.length ?? 0) > 0 ? `<h4 class="subsection-head">Capstone Rubric (${cr.total_marks ?? 10} marks${cr.note?.trim() ? ` &middot; ${esc(cr.note.trim())}` : ''})</h4>
    <table class="s-table">
      <thead><tr><th>Criterion</th><th style="width:10%">Marks</th></tr></thead>
      <tbody>${(cr.criteria ?? []).map(c => `
        <tr><td>${esc(c.criterion || '')}</td><td class="center">${c.marks ?? '–'}</td></tr>`).join('')}
        <tr style="font-weight:bold;"><td style="text-align:right;">TOTAL</td><td class="center">${(cr.criteria ?? []).reduce((s, c) => s + (Number(c.marks) || 0), 0)}</td></tr>
      </tbody>
    </table>` : ''}
  </div>`)
	}

	// ── v3.5: LLC panel ──────────────────────────────────────────────────────
	if (llc && (llc.title?.trim() || llc.description?.trim())) {
		parts.push(`<div class="capstone-section llc-section">
    <span class="new-tag">LLC</span>
    <h4>${esc(llc.title?.trim() || 'End-of-Course Learners Led Conference')}</h4>
    ${llc.subtitle?.trim() ? `<span class="capstone-meta">— ${esc(llc.subtitle.trim())}</span>` : ''}
    ${llc.description?.trim() ? `<p style="font-size:10.5pt; margin:6px 0 6px;">${rich(llc.description.trim())}</p>` : ''}
  </div>`)
	}

	// ── Signature + footer ───────────────────────────────────────────────────
	parts.push(`<table class="signature-block">
    <tr><td class="signature-label">Course Designer</td><td class="signature-label">Verified by BoS Chairman</td></tr>
    <tr><td>Name: _______________ Signature: _______________ Date: _________</td><td>Name: _______________ Signature: _______________ Date: _________</td></tr>
  </table>
  <footer>
    <p><strong>Document Control.</strong> ${esc(code)} — ${esc(name)} &middot; Structured to v3.5 &middot; Rendered from MyJKKN <code>bos_course_syllabi</code> (version ${syllabus.version_number ?? 1}).</p>
    <p><strong>Foundational stance:</strong> Humans are Principals, AI are Agents.</p>
  </footer>
</div>`)

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${esc(institution)} — ${esc(code)} — ${esc(name)} — v3.5</title>
<style>${CSS}</style>
</head>
<body>
<div class="container">
${parts.join('\n')}
</div>
</body>
</html>`
}
