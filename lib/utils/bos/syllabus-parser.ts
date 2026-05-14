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
      chapters: Array<{ chapter_number: number; title: string; sections: string }>;
      remarks: string;
    }>;
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
  const sectionsCol = findCol(headers, 'sections', 'section');
  const remarksCol = findCol(headers, 'remarks', 'book reference', 'reference');

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
      unitMap.set(unitId, unit);
    }
    const chapterTitle = chapterCol >= 0 ? (row[chapterCol] ?? '').trim() : '';
    if (chapterTitle) {
      unit.chapters.push({
        chapter_number: unit.chapters.length + 1,
        title: chapterTitle,
        sections: sectionsCol >= 0 ? (row[sectionsCol] ?? '').trim() : '',
      });
    }
  }
  for (const u of Array.from(unitMap.values())) {
    if (u.chapters.length === 0) {
      u.chapters.push({ chapter_number: 1, title: '', sections: '' });
    }
  }
  return Array.from(unitMap.values());
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
    psoIndices.forEach(({ idx, code }) => {
      const v = (row[idx] ?? '').toUpperCase().trim();
      if (v === 'H' || v === 'M' || v === 'L') psos[code] = v;
    });
    poIndices.forEach(({ idx, code }) => {
      const v = (row[idx] ?? '').toUpperCase().trim();
      if (v === 'H' || v === 'M' || v === 'L') pos[code] = v;
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

  for (const [sheetName, rows] of Object.entries(sheets)) {
    const key = normaliseSheetName(sheetName);
    if (/objective/.test(key)) {
      result.course_objectives.objectives = parseObjectivesSheet(rows);
    } else if (/reference/.test(key)) {
      result.textbooks.references = parseBooksSheet(rows);
    } else if (/(textbook|^book)/.test(key)) {
      result.textbooks.primary = parseBooksSheet(rows);
    } else if (/(pomap|^mapping|^po$|copo|programmeoutcome)/.test(key)) {
      result.po_mappings.mappings = parsePoMappingSheet(rows);
    } else if (/(clos?|^cos?$|outcome)/.test(key)) {
      result.course_learning_outcomes.clos = parseCloSheet(rows);
    } else if (/(unit|content|syllabus)/.test(key)) {
      result.course_content.units = parseUnitsSheet(rows);
    } else if (/(web|online|url|resource)/.test(key)) {
      result.web_resources.resources = parseWebResourcesSheet(rows);
    } else if (/(pedagogy|method|teaching)/.test(key)) {
      result.pedagogy.methods = parsePedagogySheet(rows);
    }
  }

  const found =
    result.course_objectives.objectives.length +
    result.course_learning_outcomes.clos.length +
    result.course_content.units.length +
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
    ['Units', /unit|content|syllabus/, data.course_content.units.length],
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
      const unitCol = findCol(headers, 'unit');
      const effective = unitCol >= 0 ? unitCol : 0;
      rows.slice(1).forEach((row, idx) => {
        const unitVal = (row[effective] ?? '').trim();
        if (!unitVal && row.some((c) => (c ?? '').trim())) {
          warnings.push({ section: name, row: idx + 2, message: 'Row skipped — Unit column is empty.' });
        }
      });
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
