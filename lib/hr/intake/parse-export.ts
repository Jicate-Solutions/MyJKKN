/**
 * HR intake helper — reading a CVViZ candidate export (.csv, .tsv or .xlsx).
 * Pure: bytes in, cleaned candidates out. Columns are found by HEADER NAME, never
 * by position, so a re-ordered or trimmed export still reads.
 */

import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import type { IntakeCandidate } from '@/types/hr-intake';
import {
  cleanText,
  looksLikeDate,
  normaliseCities,
  normaliseEmail,
  normaliseName,
  normalisePhone,
  normaliseUrl,
  parseExportDate,
} from './normalise';

/** A problem with the file itself, said in plain English for the uploader. */
export class IntakeParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IntakeParseError';
  }
}

export interface ParsedRow {
  /** 1-based data row number (the header is not counted). */
  row_index: number;
  candidate: IntakeCandidate;
  /** The export's "File Name" cell, cleaned; null when blank. */
  file_name: string | null;
}

/** Most rows one batch may carry. Bounds the database write and the review screen. */
export const MAX_EXPORT_ROWS = 1000;

type Field =
  | 'file_name' | 'first_name' | 'last_name' | 'email' | 'phone' | 'cities' | 'qualification'
  | 'applied_at' | 'current_job_title' | 'current_company' | 'job' | 'job_code' | 'linkedin'
  | 'profile';

/** Header names (letters and digits only, lower case) each field answers to. */
const HEADER_ALIASES: Record<Field, string[]> = {
  file_name: ['filename', 'resumefilename', 'resume'],
  first_name: ['firstname', 'givenname'],
  last_name: ['lastname', 'surname', 'familyname'],
  email: ['emailaddress', 'email', 'emailid'],
  phone: ['phonenumber', 'phone', 'mobile', 'mobilenumber', 'contactnumber'],
  cities: ['cities', 'city', 'location', 'locations'],
  qualification: ['qualification', 'qualifications', 'education'],
  applied_at: ['resumeuploaddate', 'applieddate', 'appliedon', 'uploaddate'],
  current_job_title: ['currentjobtitle', 'currentdesignation', 'designation'],
  current_company: ['currentcompany', 'currentemployer', 'company'],
  job: ['job', 'jobtitle', 'appliedfor', 'jobname'],
  job_code: ['jobcode'],
  linkedin: ['linkedinlink', 'linkedin', 'linkedinurl'],
  profile: ['candidateprofilelink', 'profilelink', 'cvvizprofile', 'candidatelink'],
};

const headerKey = (h: unknown) => String(h ?? '').replace(/^﻿/, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Column index for each field the header row names. */
export function mapHeaders(header: unknown[]): Partial<Record<Field, number>> {
  const keys = header.map(headerKey);
  const out: Partial<Record<Field, number>> = {};
  for (const field of Object.keys(HEADER_ALIASES) as Field[]) {
    for (const alias of HEADER_ALIASES[field]) {
      const idx = keys.indexOf(alias);
      if (idx >= 0) {
        out[field] = idx;
        break;
      }
    }
  }
  return out;
}

/** Turn a grid (header row first) into cleaned candidates. */
export function rowsFromGrid(grid: unknown[][]): ParsedRow[] {
  const headerAt = grid.findIndex((r) => Array.isArray(r) && r.some((c) => cleanText(c)));
  if (headerAt < 0) throw new IntakeParseError('The file is empty.');
  const cols = mapHeaders(grid[headerAt]);
  if (cols.first_name === undefined && cols.email === undefined) {
    throw new IntakeParseError(
      'This does not look like a CVViZ export: no "First Name" or "Email Address" column was found.',
    );
  }

  const cell = (row: unknown[], f: Field): unknown => (cols[f] === undefined ? '' : row[cols[f] as number]);
  const out: ParsedRow[] = [];
  let dataIndex = 0;
  for (const row of grid.slice(headerAt + 1)) {
    if (!Array.isArray(row) || !row.some((c) => cleanText(c))) continue;
    dataIndex += 1;
    if (dataIndex > MAX_EXPORT_ROWS) {
      throw new IntakeParseError(`The export has more than ${MAX_EXPORT_ROWS} candidates. Split it into smaller files.`);
    }
    const { first_name, last_name } = normaliseName(cell(row, 'first_name'), cell(row, 'last_name'));
    const { phone, phone_issue } = normalisePhone(cell(row, 'phone'));
    const jobCode = cleanText(cell(row, 'job_code'));
    out.push({
      row_index: dataIndex,
      file_name: cleanText(cell(row, 'file_name')),
      candidate: {
        first_name,
        last_name,
        email: normaliseEmail(cell(row, 'email')),
        phone,
        phone_issue,
        qualification: cleanText(cell(row, 'qualification')),
        current_job_title: cleanText(cell(row, 'current_job_title')),
        current_company: cleanText(cell(row, 'current_company')),
        cities: normaliseCities(cell(row, 'cities')),
        linkedin_url: normaliseUrl(cell(row, 'linkedin')),
        cvviz_profile_url: normaliseUrl(cell(row, 'profile')),
        cvviz_job_title: cleanText(cell(row, 'job')),
        // Real exports put the upload timestamp in "Job Code"; a date is not a code.
        cvviz_job_code: jobCode && !looksLikeDate(jobCode) ? jobCode : null,
        applied_at: parseExportDate(cell(row, 'applied_at')),
      },
    });
  }
  if (out.length === 0) throw new IntakeParseError('The export has a header row but no candidates.');
  return out;
}

/** Parse delimited text. The delimiter (tab, comma or semicolon) is detected. */
export function parseExportText(text: string): ParsedRow[] {
  const result = Papa.parse<string[]>(text.replace(/^﻿/, ''), {
    delimiter: '',
    delimitersToGuess: ['\t', ',', ';'],
    skipEmptyLines: 'greedy',
  });
  return rowsFromGrid(result.data as unknown[][]);
}

/** Parse the first sheet of an .xlsx/.xls workbook. */
export function parseExportWorkbook(bytes: Uint8Array): ParsedRow[] {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(bytes, { type: 'array', cellDates: false });
  } catch {
    throw new IntakeParseError('The spreadsheet could not be opened. Save it again as .xlsx or .csv.');
  }
  const first = wb.SheetNames[0];
  if (!first) throw new IntakeParseError('The spreadsheet has no sheets.');
  const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[first], { header: 1, raw: true, defval: '' });
  return rowsFromGrid(grid);
}

/** Parse an export by its file name's extension. */
export function parseExport(fileName: string, bytes: Uint8Array): ParsedRow[] {
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  if (ext === 'xlsx' || ext === 'xls') return parseExportWorkbook(bytes);
  if (ext === 'csv' || ext === 'tsv' || ext === 'txt') return parseExportText(new TextDecoder('utf-8').decode(bytes));
  throw new IntakeParseError('The export must be a .csv, .tsv or .xlsx file.');
}
