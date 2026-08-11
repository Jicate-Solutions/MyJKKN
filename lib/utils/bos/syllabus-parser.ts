/**
 * Syllabus document parser. Converts plain text from PDF (pdf-parse), DOCX
 * (mammoth) or XLSX (sheetjs) into the structured shape the BOS syllabus form
 * expects. Plus a multi-sheet XLSX dispatch path for the Excel template.
 */

export interface ParsedSyllabus {
  course_objectives: { objectives: Array<{ number: number; description: string }> };
  course_learning_outcomes: {
    clos: Array<{ clo_number: number; description: string; k_values: string[] }>;
  };
  course_content: {
    units: Array<{
      unit_id: string;
      unit_title: string;
      chapters: Array<{
        chapter_number: number;
        title: string;
        sections: string;
        subtopics?: Array<{ number: number; title: string }>;
      }>;
      remarks: string;
      /**
       * Per-unit period marker, free text — either an Anna-University
       * "theory + tutorial" split ("9 + 3") or a plain count ("9"). Only the
       * CET/Engineering PDF renderer prints it (see course-syllabus-cet-pdf.ts),
       * but it must survive the XLSX round-trip or an export→edit→re-import
       * silently wipes every unit's hours.
       */
      hours?: string;
    }>;
    // Practical/lab papers store experiments as topics[] instead of units[]
    // (see types/bos.ts course_content dual shape). is_practical is only set
    // when the document clearly has topics and no units — the form's course
    // category (Theory / Practical / …) remains the authority on which
    // content mode the user can actually work in.
    is_practical?: boolean;
    topics?: Array<{ number: number; title: string }>;
  };
  textbooks: {
    primary: Array<{ title: string; author: string }>;
    references: Array<{ title: string; author: string }>;
  };
  web_resources: { resources: Array<{ title: string; url: string }> };
  pedagogy: { methods: string[] };
  po_mappings: {
    mappings: Array<{
      co_id: string;
      pos: Record<string, string>;
      psos: Record<string, string>;
    }>;
  };
}

export interface ParseSummary {
  objectives: number;
  clos: number;
  units: number;
  practical_topics: number;
  textbooks: number;
  references: number;
  web_resources: number;
  pedagogy: number;
  po_mapping_rows: number;
}

export interface ParseWarning {
  section: string;
  row?: number;
  message: string;
}

const KNOWN_PEDAGOGY = [
  'Chalk and talk', 'PowerPoint presentation', 'E-content / Digital learning',
  'Group discussion', 'Case study', 'Problem-based learning (PBL)',
  'Project-based learning', 'Simulation', 'Seminar presentation',
  'Tutorial method', 'Brainstorming sessions', 'Role play',
  'Experiential learning', 'Collaborative learning', 'Peer learning / Peer teaching',
  'Flipped classroom', 'Inquiry-based learning', 'Activity-based learning',
  'Demonstration method', 'Workshop method', 'Field visit / Industrial visit',
  'Laboratory experiments', 'Quiz and gamification', 'Team-based learning',
  'Concept mapping', 'Think–Pair–Share', 'Debate method', 'Blended learning',
  'Self-directed learning', 'MOOC / Online learning integration',
  'Interactive whiteboard teaching', 'Storytelling method', 'Reflective learning',
  'Design thinking approach', 'Hands-on training', 'Competency-based learning',
  'Microlearning', 'Mentoring and coaching sessions',
];

function lineize(text: string): string[] {
  return text.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ')
    .split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
}

function fuzzyMatchPedagogy(raw: string): string[] {
  const tokens = raw.replace(/\bLecture by\b/i, '')
    .split(/[,;]|\band\b|\b&\b/i)
    .map((s) => s.trim()).filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of tokens) {
    const tl = token.toLowerCase();
    let matched: string | null = null;
    for (const known of KNOWN_PEDAGOGY) {
      const kl = known.toLowerCase();
      const firstWord = kl.split(/[\s/]/)[0];
      if (kl.includes(tl) || tl.includes(firstWord) || tl.startsWith(firstWord)) {
        matched = known;
        break;
      }
    }
    const final = matched ?? token;
    if (final.length >= 2 && !seen.has(final.toLowerCase())) {
      seen.add(final.toLowerCase());
      out.push(final);
    }
  }
  return out;
}

// ── Text-based parsing (PDF / DOCX) ──────────────────────────────────────────

function parseObjectives(lines: string[]) {
  const out: ParsedSyllabus['course_objectives']['objectives'] = [];
  let inSection = false;
  for (const line of lines) {
    if (/^\s*course\s+objectives?\s*:?\s*$/i.test(line)) { inSection = true; continue; }
    if (!inSection) continue;
    if (/^(clo|expected\s+course|course\s+(content|learning|outcome)|unit\b)/i.test(line)) break;
    if (/^the\s+main\s+objectives/i.test(line)) continue;
    const m = line.match(/^(\d+)[.\)]?\s+(.+)/);
    if (m) {
      out.push({ number: parseInt(m[1], 10), description: m[2].trim() });
    } else if (out.length > 0) {
      out[out.length - 1].description += ' ' + line;
    }
  }
  return out;
}

function parseClos(lines: string[]) {
  const out: ParsedSyllabus['course_learning_outcomes']['clos'] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const inline = line.match(/^CLO\s*(\d+)\s+(.+?)\s+(K\s*\d(?:\s*[,&]\s*K\s*\d)*)\s*$/i);
    if (inline) {
      const kVals = inline[3].replace(/\s/g, '').match(/K\d/gi) ?? [];
      out.push({
        clo_number: parseInt(inline[1], 10),
        description: inline[2].trim(),
        k_values: kVals.map((k) => k.toUpperCase()),
      });
      continue;
    }
    const start = line.match(/^CLO\s*(\d+)\s+(.+)/i);
    if (start) {
      let desc = start[2].trim();
      let kVals: string[] = [];
      for (let j = 1; j <= 3 && i + j < lines.length; j++) {
        const next = lines[i + j];
        if (/^CLO\s*\d+/i.test(next) || /^(course\s+content|unit\b|text\s*books?)/i.test(next)) break;
        const kOnly = next.match(/^(K\s*\d(?:\s*[,&]\s*K\s*\d)*)\s*$/i);
        if (kOnly) {
          kVals = (kOnly[1].replace(/\s/g, '').match(/K\d/gi) ?? []).map((k) => k.toUpperCase());
          i += j;
          break;
        }
        desc += ' ' + next;
        i += 1;
      }
      out.push({ clo_number: parseInt(start[1], 10), description: desc.trim(), k_values: kVals });
    }
  }
  return out;
}

function parseUnits(lines: string[]) {
  const out: ParsedSyllabus['course_content']['units'] = [];
  let inSection = false;
  let current: ParsedSyllabus['course_content']['units'][number] | null = null;
  const flush = () => {
    if (current) {
      if (current.chapters.length === 0) {
        current.chapters.push({ chapter_number: 1, title: '', sections: '' });
      }
      out.push(current);
      current = null;
    }
  };
  for (const line of lines) {
    if (/^course\s+content/i.test(line)) { inSection = true; continue; }
    if (!inSection) continue;
    if (/^(text\s*books?|reference\s*books?|web\s*resources?|pedagogy|mapping\s+with)/i.test(line)) {
      flush(); break;
    }
    const unitHead = line.match(/^Unit[-\s]*(I{1,3}|IV|V|VI{0,3}|IX|X)\b\s*[:\-]?\s*(.*)/i);
    if (unitHead) {
      flush();
      current = { unit_id: unitHead[1].toUpperCase(), unit_title: '', chapters: [], remarks: '' };
      const rest = unitHead[2].trim();
      if (rest) appendUnitContent(current, rest);
      continue;
    }
    if (current) appendUnitContent(current, line);
  }
  flush();
  return out;
}

function appendUnitContent(unit: ParsedSyllabus['course_content']['units'][number], text: string) {
  const bookHits = text.match(/\(Book[^()]*\)/gi);
  if (bookHits) {
    unit.remarks = (unit.remarks ? unit.remarks + ' ' : '') + bookHits.join(' ');
    text = text.replace(/\(Book[^()]*\)/gi, '').trim();
  }
  if (!text) return;
  if (unit.chapters.length === 0) {
    unit.chapters.push({ chapter_number: 1, title: text, sections: '' });
  } else {
    unit.chapters[unit.chapters.length - 1].title += ' ' + text;
  }
}

function parseTextbooks(lines: string[]): ParsedSyllabus['textbooks'] {
  const primary: Array<{ title: string; author: string }> = [];
  const references: Array<{ title: string; author: string }> = [];
  let bucket: 'none' | 'primary' | 'references' = 'none';
  for (const line of lines) {
    if (/^text\s*books?\s*:?\s*$/i.test(line) || /^text\s*books?\b/i.test(line)) {
      bucket = 'primary';
      const after = line.replace(/^text\s*books?\s*:?\s*/i, '').trim();
      if (after) ingest(after, primary);
      continue;
    }
    if (/^reference\s*books?\s*:?\s*$/i.test(line) || /^reference\s*books?\b/i.test(line)) {
      bucket = 'references';
      const after = line.replace(/^reference\s*books?\s*:?\s*/i, '').trim();
      if (after) ingest(after, references);
      continue;
    }
    if (/^(web\s*resources?|pedagogy|mapping\s+with|course\s+designer)/i.test(line)) {
      bucket = 'none'; continue;
    }
    if (bucket === 'primary') ingest(line, primary);
    else if (bucket === 'references') ingest(line, references);
  }
  return { primary, references };
}

function ingest(line: string, target: Array<{ title: string; author: string }>) {
  const cleaned = line.replace(/^[••\-\*]\s*/, '').trim();
  if (cleaned.length < 4) return;
  const parts = cleaned.split(/\s+[-–]\s+/);
  if (parts.length >= 2) {
    target.push({ author: parts[0].trim(), title: parts.slice(1).join(' - ').trim() });
  } else {
    target.push({ title: cleaned, author: '' });
  }
}

function parseWebResources(lines: string[]) {
  const out: ParsedSyllabus['web_resources']['resources'] = [];
  let inSection = false;
  for (const line of lines) {
    if (/^web\s*resources?/i.test(line)) {
      inSection = true;
      const after = line.replace(/^web\s*resources?\s*:?\s*/i, '').trim();
      if (after) extractUrls(after, out);
      continue;
    }
    if (!inSection) continue;
    if (/^(pedagogy|course\s+designer|mapping\s+with)/i.test(line)) break;
    extractUrls(line, out);
  }
  return out;
}

function extractUrls(line: string, out: Array<{ title: string; url: string }>) {
  const urls = line.match(/https?:\/\/[^\s,;]+/g);
  if (!urls) return;
  for (const url of urls) {
    let title = url;
    try { title = new URL(url).hostname.replace(/^www\./, ''); } catch {}
    out.push({ title, url });
  }
}

function parsePedagogy(lines: string[]): string[] {
  for (let i = 0; i < lines.length; i++) {
    if (!/^pedagogy/i.test(lines[i])) continue;
    let raw = lines[i].replace(/^pedagogy\s*:?\s*/i, '').trim();
    let j = i + 1;
    while ((!raw || raw.length < 10) && j < lines.length &&
      !/^(course\s+designer|mapping\s+with|verified\s+by)/i.test(lines[j])) {
      raw += ' ' + lines[j]; j++;
    }
    return fuzzyMatchPedagogy(raw);
  }
  return [];
}

const R2025_UNIT_IDS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

function numericCorrelationToHml(n: string): string | null {
  if (n === '3') return 'H';
  if (n === '2') return 'M';
  if (n === '1') return 'L';
  return null;
}

function isBulletLine(line: string): boolean {
  return /^[\u2022\u25CF\uF0B7●•*\u00B7\-]\s/.test(line) || line.includes('•');
}

function isR2025SyllabusFormat(text: string): boolean {
  const hasWeightage = /Weightage\s*:/i.test(text) || /Assessment\s+Weightage/i.test(text);
  const hasCoTable = /Description\s+of\s+CO/i.test(text) || /\bCO\d\b[\s\S]{0,400}\bPO\d/i.test(text);
  const hasR2025Header = /^[A-Z]{2}25[A-Z]\d{2}\b/m.test(text) && /Course\s+Objectives/i.test(text);
  const hasMbaHeader = /^MB25\d{3}\b/m.test(text) && /Course\s+Objectives/i.test(text);

  if (hasWeightage && hasCoTable) return true;
  if (hasR2025Header && (hasCoTable || /Practical[s]?:/i.test(text) || /Activity:/i.test(text))) {
    return true;
  }
  if ((hasMbaHeader || hasR2025Header) && /\bCO1\b/i.test(text) && /\bPO\d\s*\(\s*\d/.test(text)) {
    return true;
  }
  return false;
}

function parseR2025Objectives(lines: string[]) {
  const out: ParsedSyllabus['course_objectives']['objectives'] = [];
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^course\s+objectives?\s*:?\s*$/i.test(lines[i])) { start = i + 1; break; }
    const inline = lines[i].match(/^course\s+objectives?\s*:\s*(.+)/i);
    if (inline) {
      const body = inline[1].trim();
      if (body.includes('•')) {
        body.split(/•/).map((s) => s.trim()).filter(Boolean)
          .forEach((desc, idx) => out.push({ number: idx + 1, description: desc }));
      } else if (body.length > 10) {
        out.push({ number: 1, description: body });
      }
      start = i + 1;
      break;
    }
  }
  if (start === -1) return out;

  const inline = lines[start - 1]?.match(/^course\s+objectives?\s*:\s*(.+)/i);
  if (!inline?.[1]?.trim()) {
    let para = '';
    for (let j = start; j < lines.length; j++) {
      const l = lines[j];
      if (isR2025ModuleHeader(l) || isR2025StandaloneModuleHeader(l, lines[j + 1])) break;
      if (isBulletLine(l)) break;
      if (/^(weightage|assessment|references)/i.test(l)) break;
      para += (para ? ' ' : '') + l;
      start = j + 1;
    }
    if (para.trim().length > 20) {
      out.push({ number: 1, description: para.trim() });
    }
  }

  let num = out.length + 1;
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    if (/^(weightage|assessment\s+weightage|mandated\s+activities|references|e-?\s*resources?)/i.test(line)) {
      break;
    }
    if (isR2025ModuleHeader(line)) break;
    if (isR2025StandaloneModuleHeader(line, lines[i + 1])) break;

    const bullet = line.match(/^[\u2022\u25CF\uF0B7●•*\u00B7\-]\s*(.+)/);
    if (bullet) {
      out.push({ number: num++, description: bullet[1].trim() });
      continue;
    }
    if (line.includes('•')) {
      line.split(/•/).map((s) => s.trim()).filter(Boolean)
        .forEach((desc) => out.push({ number: num++, description: desc }));
      continue;
    }
    const numbered = line.match(/^(\d+)[.)]\s+(.+)/);
    if (numbered) {
      out.push({ number: parseInt(numbered[1], 10), description: numbered[2].trim() });
      continue;
    }
    if (out.length > 0 && line.length > 5 && !/^--\s*\d+\s+of\s+\d+/i.test(line)) {
      out[out.length - 1].description += ' ' + line;
    }
  }
  return out;
}

function isR2025ModuleHeader(line: string): boolean {
  const colon = line.match(/^([A-Z][A-Za-z0-9\s&,'()/-]{2,70}?):\s*(.+)/);
  if (!colon) return false;
  if (/^(Practical|Activity|Assessment|Course|Weightage)/i.test(colon[1])) return false;
  return colon[2].trim().length > 0;
}

function isR2025StandaloneModuleHeader(line: string, nextLine?: string): boolean {
  if (!/^[A-Z][A-Za-z0-9\s&,'()/-]{5,70}$/.test(line)) return false;
  if (/^(Course|Weightage|Assessment|References|CO\d)/i.test(line)) return false;
  if (!nextLine) return false;
  if (isBulletLine(nextLine)) return true;
  if (nextLine.length >= 15 && !/^Practicals?/i.test(nextLine)) return true;
  return false;
}

function findR2025ContentBounds(lines: string[]) {
  let start = 0;
  let end = lines.length;

  for (let i = 0; i < lines.length; i++) {
    if (!/^course\s+objectives?/i.test(lines[i])) continue;

    const inline = lines[i].match(/^course\s+objectives?\s*:\s*(.+)/i);
    start = i + 1;
    if (!inline?.[1]?.trim()) {
      while (start < lines.length) {
        if (isR2025ModuleHeader(lines[start])) break;
        if (isR2025StandaloneModuleHeader(lines[start], lines[start + 1])) break;
        start++;
      }
    } else {
      while (start < lines.length) {
        if (isR2025ModuleHeader(lines[start])) break;
        if (isR2025StandaloneModuleHeader(lines[start], lines[start + 1])) break;
        start++;
      }
    }
    break;
  }

  for (let i = start; i < lines.length; i++) {
    if (/^(weightage|assessment\s+weightage|mandated\s+activities|references|e-?\s*resources?|CO\s+description|description\s+of\s+CO)/i.test(lines[i])) {
      end = i;
      break;
    }
    if (/^--\s*\d+\s+of\s+\d+\s*--$/i.test(lines[i])) { end = i; break; }
  }
  return { start, end };
}

type R2025Module = { title: string; lines: string[] };

function splitR2025Modules(lines: string[], start: number, end: number): R2025Module[] {
  const modules: R2025Module[] = [];
  let current: R2025Module | null = null;
  const flush = () => {
    if (current) {
      modules.push(current);
      current = null;
    }
  };

  for (let i = start; i < end; i++) {
    const line = lines[i];
    if (/^--\s*\d+\s+of\s+\d+/i.test(line)) continue;
    if (/^board\s+of\s+chairman/i.test(line)) continue;

    const headColon = line.match(/^([A-Z][A-Za-z0-9\s&,'()/-]{2,70}?):\s*(.*)$/);
    if (headColon && isR2025ModuleHeader(line)) {
      flush();
      current = { title: headColon[1].trim(), lines: [] };
      if (headColon[2].trim()) current.lines.push(headColon[2].trim());
      continue;
    }

    const standalone = line.match(/^([A-Z][A-Za-z0-9\s&,'()/-]{2,50})$/);
    if (standalone && isR2025StandaloneModuleHeader(line, lines[i + 1])) {
      flush();
      current = { title: standalone[1].trim(), lines: [] };
      continue;
    }

    if (/^Practicals?\s*:?\s*$/i.test(line)) {
      if (current) current.lines.push('__PRACTICAL_SECTION__');
      continue;
    }

    const practical = line.match(/^Practical[s]?:\s*(.*)/i);
    if (practical) {
      if (current) {
        const body = practical[1].trim();
        current.lines.push(body ? `Practical: ${body}` : '__PRACTICAL_SECTION__');
      }
      continue;
    }

    const activity = line.match(/^Activity:\s*(.*)/i);
    if (activity && current) {
      current.lines.push(`Activity: ${activity[1].trim()}`);
      continue;
    }

    const bullet = line.match(/^[\u2022\u25CF\uF0B7●•*\u00B7\-]\s*(.+)/);
    if (bullet && current) {
      current.lines.push(bullet[1].trim());
      continue;
    }

    if (current) current.lines.push(line);
    else current = { title: 'Course Content', lines: [line] };
  }
  flush();
  return modules;
}

function moduleLinesToSubtopics(lines: string[]): Array<{ number: number; title: string }> {
  const subtopics: Array<{ number: number; title: string }> = [];
  let n = 1;
  let inPractical = false;

  for (const raw of lines) {
    if (raw === '__PRACTICAL_SECTION__') { inPractical = true; continue; }
    if (raw.startsWith('Practical:') || raw.startsWith('Activity:')) {
      subtopics.push({ number: n++, title: raw });
      inPractical = false;
      continue;
    }
    if (subtopics.length === 0 && raw.includes(' - ') && raw.length > 60) {
      raw.split(/\s+-\s+/).map((s) => s.trim()).filter((s) => s.length > 2)
        .forEach((part) => subtopics.push({ number: n++, title: part }));
      continue;
    }
    subtopics.push({ number: n++, title: inPractical ? `Practical: ${raw}` : raw });
  }
  return subtopics;
}

function parseR2025Units(lines: string[]) {
  const { start, end } = findR2025ContentBounds(lines);
  const modules = splitR2025Modules(lines, start, end);
  return modules.map((mod, idx) => {
    const subtopics = moduleLinesToSubtopics(mod.lines);
    return {
      unit_id: R2025_UNIT_IDS[idx] ?? String(idx + 1),
      unit_title: mod.title,
      chapters: [{
        chapter_number: 1,
        title: '',
        sections: '',
        subtopics: subtopics.length > 0 ? subtopics : undefined,
      }],
      remarks: '',
    };
  });
}

function parseR2025CoTable(lines: string[]) {
  const clos: ParsedSyllabus['course_learning_outcomes']['clos'] = [];
  const mappings: ParsedSyllabus['po_mappings']['mappings'] = [];

  let tableStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/CO\s+Description\s+of\s+CO/i.test(lines[i]) || /^Description\s+of\s+CO/i.test(lines[i])) {
      tableStart = i + 1;
      break;
    }
  }
  if (tableStart === -1) {
    for (let i = 0; i < lines.length; i++) {
      if (/^CO1\b/i.test(lines[i])) { tableStart = i; break; }
    }
  }
  if (tableStart === -1) return { clos, mappings };

  const tail = lines.slice(tableStart).join('\n')
    .replace(/PSO\s*(\d+)\s*\(\s*(\d)\s*\n\s*\)/gi, 'PSO$1($2)')
    .replace(/PO\s*(\d+)\s*\(\s*(\d)\s*\n\s*\)/gi, 'PO$1($2)')
    .replace(/PO\s*(\d+)\s*\n\s*\(\s*(\d)\s*\)/gi, 'PO$1($2)');

  const blocks = tail.split(/(?=\bCO\d\b)/i).filter((b) => /^\s*CO\d/i.test(b));
  for (const block of blocks) {
    const coMatch = block.match(/^CO(\d+)\s+([\s\S]+)/i);
    if (!coMatch) continue;
    const coNum = parseInt(coMatch[1], 10);
    const rest = coMatch[2];
    const poStart = rest.search(/\b(PO\s*\d|PSO\s*\d|---|BOARD\s+OF)/i);
    let desc = (poStart >= 0 ? rest.slice(0, poStart) : rest).replace(/\s*---+\s*/g, ' ').trim();
    if (!desc || /^BOARD\s+OF/i.test(desc)) continue;

    clos.push({ clo_number: coNum, description: desc, k_values: [] });

    const poPart = poStart >= 0 ? rest.slice(poStart) : '';
    const pos: Record<string, string> = {};
    const psos: Record<string, string> = {};
    for (const m of poPart.matchAll(/PO\s*(\d+)\s*\(\s*(\d)\s*\)/gi)) {
      const level = numericCorrelationToHml(m[2]);
      if (level) pos[`PO${m[1]}`] = level;
    }
    for (const m of poPart.matchAll(/PSO\s*(\d+)\s*\(\s*(\d)\s*\)/gi)) {
      const level = numericCorrelationToHml(m[2]);
      if (level) psos[`PSO${m[1]}`] = level;
    }
    mappings.push({
      co_id: `CO${coNum}`,
      pos,
      psos,
    });
  }
  return { clos, mappings };
}

function parseR2025References(lines: string[]) {
  const references: Array<{ title: string; author: string }> = [];
  let inSection = false;
  for (const line of lines) {
    if (/^references\s*:?\s*$/i.test(line) || /^references$/i.test(line)) {
      inSection = true;
      continue;
    }
    if (!inSection) continue;
    if (/^(e-?\s*resources?|CO\s|description\s+of\s+CO|BOARD)/i.test(line)) break;
    const numbered = line.match(/^(\d+)[.)]\s+(.+)/);
    if (!numbered) continue;
    const cleaned = numbered[2].trim();
    const parts = cleaned.split(/\s+[-–]\s+/);
    if (parts.length >= 2 && parts[0].length < 80) {
      references.push({ author: parts[0].trim(), title: parts.slice(1).join(' - ').trim() });
    } else {
      references.push({ title: cleaned, author: '' });
    }
  }
  return references;
}

function parseR2025WebResources(lines: string[]) {
  const out: ParsedSyllabus['web_resources']['resources'] = [];
  let inSection = false;
  for (const line of lines) {
    if (/^e-?\s*resources?\s*:?\s*$/i.test(line)) {
      inSection = true;
      const after = line.replace(/^e-?\s*resources?\s*:?\s*/i, '').trim();
      if (after) extractUrls(after, out);
      continue;
    }
    if (!inSection) continue;
    if (/^(CO\s|description\s+of\s+CO|BOARD)/i.test(line)) break;
    if (/^[●•*\-]\s*/.test(line)) {
      extractUrls(line.replace(/^[●•*\-]\s*/, ''), out);
      continue;
    }
    extractUrls(line, out);
    const numbered = line.match(/^\d+[.)]\s+(.+)/);
    if (numbered) extractUrls(numbered[1], out);
  }
  return out;
}

function parseR2025Pedagogy(lines: string[]): string[] {
  for (const line of lines) {
    if (!/^assessment\s+methodology/i.test(line)) continue;
    const raw = line.replace(/^assessment\s+methodology\s*:?\s*/i, '').trim();
    return fuzzyMatchPedagogy(raw);
  }
  const mandated = lines.find((l) => /^mandated\s+activities/i.test(l));
  if (mandated) return fuzzyMatchPedagogy(mandated);
  return [];
}

function parseR2025Syllabus(lines: string[]): ParsedSyllabus {
  const { clos, mappings } = parseR2025CoTable(lines);
  const references = parseR2025References(lines);
  return {
    course_objectives: { objectives: parseR2025Objectives(lines) },
    course_learning_outcomes: { clos },
    course_content: { units: parseR2025Units(lines) },
    textbooks: { primary: [], references },
    web_resources: { resources: parseR2025WebResources(lines) },
    pedagogy: { methods: parseR2025Pedagogy(lines) },
    po_mappings: { mappings },
  };
}

function parsePoMappings(lines: string[]) {
  const out: ParsedSyllabus['po_mappings']['mappings'] = [];
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/mapping\s+with\s+programme\s+outcomes?/i.test(lines[i])) { startIdx = i; break; }
  }
  if (startIdx === -1) return out;

  let psoCount = 0, poCount = 0;
  for (let i = startIdx; i < Math.min(startIdx + 6, lines.length); i++) {
    const l = lines[i];
    if (/PSOs?/.test(l) && /\bPOs?\b/.test(l)) {
      const numLine = lines[i + 1] || '';
      const nums = numLine.match(/\d+/g) ?? [];
      let pivot = -1;
      for (let k = 1; k < nums.length; k++) {
        if (nums[k] === '1' && nums[k - 1] !== '1') { pivot = k; break; }
      }
      if (pivot > 0) { psoCount = pivot; poCount = nums.length - pivot; }
      break;
    }
  }

  for (let i = startIdx; i < lines.length; i++) {
    const m = lines[i].match(/^CO\s*(\d+)\s+((?:[HML\-]\s+)*[HML\-])\s*$/i);
    if (!m) continue;
    const values = m[2].split(/\s+/).map((v) => v.toUpperCase());
    if (psoCount === 0 && poCount === 0) {
      psoCount = Math.ceil(values.length / 2);
      poCount = values.length - psoCount;
    }
    const psoVals = values.slice(0, psoCount);
    const poVals = values.slice(psoCount);
    const psos: Record<string, string> = {};
    const pos: Record<string, string> = {};
    psoVals.forEach((v, idx) => { if (v === 'H' || v === 'M' || v === 'L') psos[`PSO${idx + 1}`] = v; });
    poVals.forEach((v, idx) => { if (v === 'H' || v === 'M' || v === 'L') pos[`PO${idx + 1}`] = v; });
    out.push({ co_id: `CO${m[1]}`, pos, psos });
  }
  return out;
}

export function parseSyllabusText(text: string): ParsedSyllabus {
  const lines = lineize(text);
  if (isR2025SyllabusFormat(text)) {
    return parseR2025Syllabus(lines);
  }
  return {
    course_objectives: { objectives: parseObjectives(lines) },
    course_learning_outcomes: { clos: parseClos(lines) },
    course_content: { units: parseUnits(lines) },
    textbooks: parseTextbooks(lines),
    web_resources: { resources: parseWebResources(lines) },
    pedagogy: { methods: parsePedagogy(lines) },
    po_mappings: { mappings: parsePoMappings(lines) },
  };
}

export function summarise(parsed: ParsedSyllabus): ParseSummary {
  return {
    objectives: parsed.course_objectives.objectives.length,
    clos: parsed.course_learning_outcomes.clos.length,
    units: parsed.course_content.units.length,
    practical_topics: parsed.course_content.topics?.length ?? 0,
    textbooks: parsed.textbooks.primary.length,
    references: parsed.textbooks.references.length,
    web_resources: parsed.web_resources.resources.length,
    pedagogy: parsed.pedagogy.methods.length,
    po_mapping_rows: parsed.po_mappings.mappings.length,
  };
}

// ── Multi-sheet XLSX parsing ─────────────────────────────────────────────────

type SheetRows = string[][];

function normaliseSheetName(name: string): string {
  return name.toLowerCase().replace(/[_\s\-]/g, '');
}

function findCol(headers: string[], ...keywords: string[]): number {
  const lowered = headers.map((h) => (h ?? '').toLowerCase());
  for (let i = 0; i < lowered.length; i++) {
    for (const kw of keywords) {
      if (lowered[i].includes(kw.toLowerCase())) return i;
    }
  }
  return -1;
}

function parseObjectivesSheet(rows: SheetRows) {
  if (rows.length < 2) return [];
  const headers = rows[0];
  const numCol = findCol(headers, 'number', 'no.', '#');
  const descCol = findCol(headers, 'description', 'objective', 'text');
  const out: ParsedSyllabus['course_objectives']['objectives'] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const desc = (descCol >= 0 ? row[descCol] : row[row.length - 1] ?? '').trim();
    if (!desc) continue;
    const numRaw = numCol >= 0 ? row[numCol] : String(i);
    const numMatch = numRaw?.match(/\d+/);
    const num = numMatch ? parseInt(numMatch[0], 10) : i;
    out.push({ number: num, description: desc });
  }
  return out;
}

function parseCloSheet(rows: SheetRows) {
  if (rows.length < 2) return [];
  const headers = rows[0];
  const cloCol = findCol(headers, 'clo', 'co');
  const descCol = findCol(headers, 'description', 'outcome', 'statement');

  const kSingleCol = findCol(headers, 'k-value', 'k values', 'k_value', 'kvalue');
  const kColIndices: Array<{ idx: number; code: string }> = [];
  for (let i = 0; i < headers.length; i++) {
    const m = (headers[i] ?? '').trim().toUpperCase().match(/^K(\d)$/);
    if (m) kColIndices.push({ idx: i, code: `K${m[1]}` });
  }

  const out: ParsedSyllabus['course_learning_outcomes']['clos'] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const cloRaw = cloCol >= 0 ? row[cloCol] : String(i);
    const desc = (descCol >= 0 ? row[descCol] : row[1] ?? '').trim();
    if (!desc) continue;
    const numMatch = (cloRaw ?? '').match(/\d+/);
    const cloNum = numMatch ? parseInt(numMatch[0], 10) : i;

    let kValues: string[] = [];
    if (kColIndices.length > 0) {
      kValues = kColIndices
        .filter(({ idx }) => (row[idx] ?? '').trim().length > 0)
        .map(({ code }) => code);
    } else if (kSingleCol >= 0) {
      const kRaw = row[kSingleCol] ?? '';
      kValues = (kRaw.match(/K\d/gi) ?? []).map((k) => k.toUpperCase());
    }
    out.push({ clo_number: cloNum, description: desc, k_values: kValues });
  }
  return out;
}

function parseUnitsSheet(rows: SheetRows) {
  if (rows.length < 2) return [];
  const headers = rows[0];
  const unitCol = findCol(headers, 'unit');
  const titleCol = findCol(headers, 'unit title', 'title');
  const chapterCol = findCol(headers, 'chapter', 'topic', 'content');
  const subtopicCol = findCol(headers, 'sub-topic', 'subtopic', 'sub topic');
  const sectionsCol = findCol(headers, 'sections', 'section');
  const remarksCol = findCol(headers, 'remarks', 'book reference', 'reference');
  // Optional column — sheets authored before Hours shipped simply lack it,
  // and findCol returns -1, leaving `hours` undefined (not an empty string).
  const hoursCol = findCol(headers, 'hours', 'periods');

  const unitMap = new Map<string, ParsedSyllabus['course_content']['units'][number]>();
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const unitRaw = (unitCol >= 0 ? row[unitCol] : row[0] ?? '').trim();
    if (!unitRaw) continue;
    const unitId = unitRaw.replace(/^Unit[-\s]*/i, '').toUpperCase();
    if (!unitId) continue;
    let unit = unitMap.get(unitId);
    if (!unit) {
      // Only the FIRST row of a unit carries title + remarks. Ignore those
      // cells on later rows so users can leave them blank without re-typing.
      unit = {
        unit_id: unitId,
        unit_title: titleCol >= 0 ? (row[titleCol] ?? '').trim() : '',
        chapters: [],
        remarks: remarksCol >= 0 ? (row[remarksCol] ?? '').trim() : '',
      };
      // Omit the key entirely when the column is absent or blank, so a sheet
      // without Hours leaves an existing unit's hours untouched rather than
      // overwriting it with ''.
      const hoursRaw = hoursCol >= 0 ? String(row[hoursCol] ?? '').trim() : '';
      if (hoursRaw) unit.hours = hoursRaw;
      unitMap.set(unitId, unit);
    }
    const chapterTitle = chapterCol >= 0 ? (row[chapterCol] ?? '').trim() : '';
    const subtopicTitle = subtopicCol >= 0 ? (row[subtopicCol] ?? '').trim() : '';
    if (chapterTitle) {
      const newChapter: ParsedSyllabus['course_content']['units'][number]['chapters'][number] = {
        chapter_number: unit.chapters.length + 1,
        title: chapterTitle,
        sections: sectionsCol >= 0 ? (row[sectionsCol] ?? '').trim() : '',
      };
      // Same row can carry both a chapter and its first sub-topic.
      if (subtopicTitle) {
        newChapter.subtopics = [{ number: 1, title: subtopicTitle }];
      }
      unit.chapters.push(newChapter);
    } else if (subtopicTitle && unit.chapters.length > 0) {
      // Chapter blank + sub-topic filled → attach to the most-recent chapter.
      const last = unit.chapters[unit.chapters.length - 1];
      const subs = last.subtopics ?? [];
      subs.push({ number: subs.length + 1, title: subtopicTitle });
      last.subtopics = subs;
    }
  }
  for (const u of Array.from(unitMap.values())) {
    if (u.chapters.length === 0) {
      u.chapters.push({ chapter_number: 1, title: '', sections: '' });
    }
  }
  return Array.from(unitMap.values());
}

// Dedicated "Practical Topics" sheet (S.No | Experiment / Topic) — written by
// the exporter for is_practical papers; previously the importer had no branch
// for it, so practical content never round-tripped.
function parsePracticalTopicsSheet(rows: SheetRows) {
  if (rows.length < 2) return [];
  const headers = rows[0];
  const titleCol = findCol(headers, 'experiment', 'topic', 'title', 'description');
  const out: Array<{ number: number; title: string }> = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const title = (titleCol >= 0 ? row[titleCol] : row[row.length - 1] ?? '').trim();
    if (!title) continue;
    out.push({ number: out.length + 1, title });
  }
  return out;
}

// Lab templates in the wild often list experiments on the Units sheet with the
// Unit column left blank (a practical paper has no units) and the experiment
// text in the Sub-topic (or Chapter) column. parseUnitsSheet skips unit-less
// rows entirely, so when it yields no units we salvage those rows as
// practical topics instead of importing nothing.
function collectPracticalTopicsFromUnitsSheet(rows: SheetRows) {
  if (rows.length < 2) return [];
  const headers = rows[0];
  const unitCol = findCol(headers, 'unit');
  const chapterCol = findCol(headers, 'chapter', 'topic', 'content');
  const subtopicCol = findCol(headers, 'sub-topic', 'subtopic', 'sub topic');
  const out: Array<{ number: number; title: string }> = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const unitRaw = ((unitCol >= 0 ? row[unitCol] : row[0]) ?? '').trim();
    if (unitRaw) continue; // belongs to a unit — not an orphan experiment row
    const title =
      (subtopicCol >= 0 ? (row[subtopicCol] ?? '').trim() : '') ||
      (chapterCol >= 0 ? (row[chapterCol] ?? '').trim() : '');
    if (!title) continue;
    out.push({ number: out.length + 1, title });
  }
  return out;
}

function parseBooksSheet(rows: SheetRows) {
  if (rows.length < 2) return [];
  const headers = rows[0];
  const titleCol = findCol(headers, 'title', 'book');
  const authorCol = findCol(headers, 'author', 'writer');
  const out: Array<{ title: string; author: string }> = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const title = (titleCol >= 0 ? row[titleCol] : row[0] ?? '').trim();
    const author = (authorCol >= 0 ? row[authorCol] : row[1] ?? '').trim();
    if (!title) continue;
    out.push({ title, author });
  }
  return out;
}

function parseWebResourcesSheet(rows: SheetRows) {
  if (rows.length < 2) return [];
  const headers = rows[0];
  const titleCol = findCol(headers, 'title', 'name', 'label');
  const urlCol = findCol(headers, 'url', 'link', 'href');
  const out: ParsedSyllabus['web_resources']['resources'] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const url = (urlCol >= 0 ? row[urlCol] : row[row.length - 1] ?? '').trim();
    if (!url || !/^https?:\/\//i.test(url)) continue;
    let title = (titleCol >= 0 ? row[titleCol] : '').trim();
    if (!title) {
      try { title = new URL(url).hostname.replace(/^www\./, ''); }
      catch { title = url; }
    }
    out.push({ title, url });
  }
  return out;
}

function parsePedagogySheet(rows: SheetRows): string[] {
  if (rows.length < 2) return [];
  const headers = rows[0];
  const methodCol = findCol(headers, 'method', 'pedagogy', 'technique', 'approach');
  const collected: string[] = [];
  for (let i = 1; i < rows.length; i++) {
    const m = (methodCol >= 0 ? rows[i][methodCol] : rows[i][0] ?? '').trim();
    if (m.length >= 2) collected.push(m);
  }
  return fuzzyMatchPedagogy(collected.join(', '));
}

function parsePoMappingSheet(rows: SheetRows) {
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => (h ?? '').toUpperCase().trim());
  const psoIndices: Array<{ idx: number; code: string }> = [];
  const poIndices: Array<{ idx: number; code: string }> = [];
  for (let i = 0; i < headers.length; i++) {
    const psoMatch = headers[i].match(/^PSO\s*(\d+)/);
    const poMatch = headers[i].match(/^PO\s*(\d+)/);
    if (psoMatch) psoIndices.push({ idx: i, code: `PSO${psoMatch[1]}` });
    else if (poMatch) poIndices.push({ idx: i, code: `PO${poMatch[1]}` });
  }
  if (psoIndices.length === 0 && poIndices.length === 0) return [];
  const coCol = findCol(rows[0], 'co', 'clo', 'outcome');
  const out: ParsedSyllabus['po_mappings']['mappings'] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const coRaw = (coCol >= 0 ? row[coCol] : row[0] ?? '').trim();
    const numMatch = coRaw.match(/(\d+)/);
    if (!numMatch) continue;
    const coId = `CO${numMatch[1]}`;
    const pos: Record<string, string> = {};
    const psos: Record<string, string> = {};
    // Both correlation encodings are valid and stored verbatim: CAS letters
    // H/M/L and the engineering numeric scale 1/2/3 (Anna University). All
    // consumers (editor, PDFs) already tolerate both — rejecting numerics
    // here silently emptied every engineering PO mapping on import.
    const validLevel = (v: string) => v === 'H' || v === 'M' || v === 'L' || /^[123]$/.test(v);
    psoIndices.forEach(({ idx, code }) => {
      const v = (row[idx] ?? '').toUpperCase().trim();
      if (validLevel(v)) psos[code] = v;
    });
    poIndices.forEach(({ idx, code }) => {
      const v = (row[idx] ?? '').toUpperCase().trim();
      if (validLevel(v)) pos[code] = v;
    });
    out.push({ co_id: coId, pos, psos });
  }
  return out;
}

export function parseSyllabusSheets(sheets: Record<string, SheetRows>): ParsedSyllabus {
  const result: ParsedSyllabus = {
    course_objectives: { objectives: [] },
    course_learning_outcomes: { clos: [] },
    course_content: { units: [] },
    textbooks: { primary: [], references: [] },
    web_resources: { resources: [] },
    pedagogy: { methods: [] },
    po_mappings: { mappings: [] },
  };

  let practicalTopics: Array<{ number: number; title: string }> = [];
  let unitsSheetRows: SheetRows | null = null;

  for (const [sheetName, rows] of Object.entries(sheets)) {
    const key = normaliseSheetName(sheetName);
    if (/objective/.test(key)) {
      result.course_objectives.objectives = parseObjectivesSheet(rows);
    } else if (/^references?$/.test(key) || /^referencebooks?$/.test(key)) {
      // Match only "References" / "Reference" / "Reference Books".
      // Do NOT match "Reference Codes" (a glossary sheet — not bibliography data).
      result.textbooks.references = parseBooksSheet(rows);
    } else if (/(textbook|^book)/.test(key)) {
      result.textbooks.primary = parseBooksSheet(rows);
    } else if (/(pomap|^mapping|^po$|copo|programmeoutcome)/.test(key)) {
      result.po_mappings.mappings = parsePoMappingSheet(rows);
    } else if (/(clos?|^cos?$|outcome)/.test(key)) {
      result.course_learning_outcomes.clos = parseCloSheet(rows);
    } else if (/(practical|experiment)/.test(key)) {
      practicalTopics = parsePracticalTopicsSheet(rows);
    } else if (/(unit|content|syllabus)/.test(key)) {
      result.course_content.units = parseUnitsSheet(rows);
      unitsSheetRows = rows;
    } else if (/(web|online|url|resource)/.test(key)) {
      result.web_resources.resources = parseWebResourcesSheet(rows);
    } else if (/(pedagogy|method|teaching)/.test(key)) {
      result.pedagogy.methods = parsePedagogySheet(rows);
    }
  }

  // Practical papers: no dedicated sheet → salvage unit-less experiment rows
  // from the Units sheet. is_practical is only asserted when the document has
  // topics and no units at all — for mixed/ambiguous documents the course
  // category chosen on the form decides the content mode.
  if (result.course_content.units.length === 0 && practicalTopics.length === 0 && unitsSheetRows) {
    practicalTopics = collectPracticalTopicsFromUnitsSheet(unitsSheetRows);
  }
  if (practicalTopics.length > 0) {
    result.course_content.topics = practicalTopics;
    if (result.course_content.units.length === 0) {
      result.course_content.is_practical = true;
    }
  }

  const found =
    result.course_objectives.objectives.length +
    result.course_learning_outcomes.clos.length +
    result.course_content.units.length +
    (result.course_content.topics?.length ?? 0) +
    result.textbooks.primary.length +
    result.textbooks.references.length +
    result.web_resources.resources.length +
    result.pedagogy.methods.length +
    result.po_mappings.mappings.length;

  if (found === 0) {
    const text = Object.values(sheets)
      .map((rows) => rows.map((r) => r.join('\t')).join('\n'))
      .join('\n');
    return parseSyllabusText(text);
  }
  return result;
}

export function parseSyllabusSheetsWithWarnings(
  sheets: Record<string, SheetRows>,
): { data: ParsedSyllabus; warnings: ParseWarning[] } {
  const data = parseSyllabusSheets(sheets);
  const warnings: ParseWarning[] = [];

  const knownPatterns = [
    /objective/, /reference/, /textbook|^book/, /clos?|^cos?$|outcome/,
    /practical|experiment/,
    /unit|content|syllabus/, /web|online|url|resource/,
    /pedagogy|method|teaching/, /pomap|^mapping|^po$|copo|programmeoutcome/,
    /referencecodes|lists|_validcodes|courseinfo/,
  ];
  for (const name of Object.keys(sheets)) {
    const key = normaliseSheetName(name);
    if (!knownPatterns.some((p) => p.test(key))) {
      warnings.push({
        section: name,
        message: `Sheet "${name}" was not recognised and was skipped.`,
      });
    }
  }

  const checks: Array<[string, RegExp, number]> = [
    ['Objectives', /objective/, data.course_objectives.objectives.length],
    ['COs', /clos?|^cos?$|outcome/, data.course_learning_outcomes.clos.length],
    // A Units sheet that yielded practical topics (lab paper, unit-less rows)
    // still counts as content — don't warn "no valid rows" for it.
    ['Units', /unit|content|syllabus/,
      data.course_content.units.length + (data.course_content.topics?.length ?? 0)],
    ['Pedagogy', /pedagogy|method|teaching/, data.pedagogy.methods.length],
    ['PO_Mapping', /pomap|^mapping|^po$|copo|programmeoutcome/, data.po_mappings.mappings.length],
  ];
  for (const [label, pattern, count] of checks) {
    const sheetPresent = Object.keys(sheets).some((n) => pattern.test(normaliseSheetName(n)));
    if (sheetPresent && count === 0) {
      warnings.push({
        section: label,
        message: `${label} sheet was present but contained no valid rows.`,
      });
    }
  }

  for (const [name, rows] of Object.entries(sheets)) {
    const key = normaliseSheetName(name);
    if (rows.length < 2) continue;
    const headers = rows[0];

    if (/objective/.test(key)) {
      const descCol = findCol(headers, 'description', 'objective', 'text');
      const effective = descCol >= 0 ? descCol : rows[0].length - 1;
      rows.slice(1).forEach((row, idx) => {
        const desc = (row[effective] ?? '').trim();
        if (!desc && row.some((c) => (c ?? '').trim())) {
          warnings.push({ section: name, row: idx + 2, message: 'Row skipped — Description is empty.' });
        }
      });
    } else if (/clos?|^cos?$|outcome/.test(key)) {
      const descCol = findCol(headers, 'description', 'outcome', 'statement');
      const effective = descCol >= 0 ? descCol : 1;
      rows.slice(1).forEach((row, idx) => {
        const desc = (row[effective] ?? '').trim();
        if (!desc && row.some((c) => (c ?? '').trim())) {
          warnings.push({ section: name, row: idx + 2, message: 'Row skipped — Description is empty.' });
        }
      });
    } else if (/unit|content|syllabus/.test(key)) {
      // Practical papers: unit-less rows were salvaged as topics, not skipped —
      // warning about them would contradict the successful import.
      const salvagedAsPractical =
        data.course_content.units.length === 0 &&
        (data.course_content.topics?.length ?? 0) > 0;
      if (!salvagedAsPractical) {
        const unitCol = findCol(headers, 'unit');
        const effective = unitCol >= 0 ? unitCol : 0;
        rows.slice(1).forEach((row, idx) => {
          const unitVal = (row[effective] ?? '').trim();
          if (!unitVal && row.some((c) => (c ?? '').trim())) {
            warnings.push({ section: name, row: idx + 2, message: 'Row skipped — Unit column is empty.' });
          }
        });
      }
    } else if (/pomap|^mapping|^po$|copo|programmeoutcome/.test(key)) {
      const coCol = findCol(headers, 'co', 'clo', 'outcome');
      const effective = coCol >= 0 ? coCol : 0;
      rows.slice(1).forEach((row, idx) => {
        const coVal = (row[effective] ?? '').trim();
        if (coVal && !/\d/.test(coVal)) {
          warnings.push({ section: name, row: idx + 2, message: `Row skipped — CO column "${coVal}" has no number.` });
        }
      });
    }
  }

  return { data, warnings };
}