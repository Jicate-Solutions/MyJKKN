import fs from 'node:fs'
import path from 'node:path'

import * as XLSXImport from 'xlsx'

import {
	parseSyllabusText,
	summarise,
	type ParsedSyllabus,
} from '@/lib/utils/bos/syllabus-parser'

const FAILED_XLSX_PATH =
	'c:\\tmp\\CURRICULUM & SYLLABUS\\courses-failed-2026-07-21.xlsx'

const REG_2025_FOLDER = 'c:\\tmp\\CURRICULUM & SYLLABUS\\REG-2025'

const OUTPUT_SQL_PATH =
	'c:\\tmp\\bos_course_syllabi_r2025_from_courses-failed-2026-07-21.sql'

const FAILURE_JSON_PATH =
	'c:\\tmp\\bos_course_syllabi_r2025_failures_from_courses-failed-2026-07-21.json'

const MAX_BYTES = 10 * 1024 * 1024

type FailedRow = {
	institutions_id: string
	regulation_id: string
	board_id: string
	composition_id: string | null
	created_by: string
	course_code: string
	course_name: string
}

function normHeader(s: unknown): string {
	return String(s ?? '')
		.replace(/\u00a0/g, ' ')
		.replace(/[^a-z0-9]+/gi, '')
		.trim()
		.toLowerCase()
}

function sqlEscapeString(s: string): string {
	return s.replace(/'/g, "''")
}

function sqlUuidOrNull(v: string | null | undefined): string {
	if (!v) return 'NULL'
	return `'${sqlEscapeString(v)}'::uuid`
}

function sqlNullableText(v: string | null | undefined): string {
	if (v === null || v === undefined || v === '') return 'NULL'
	return `'${sqlEscapeString(v)}'`
}

function sqlJsonb(obj: unknown, tag: string): string {
	const json = JSON.stringify(obj ?? null)
	return `$${tag}$${json}$${tag}$::jsonb`
}

function collapseWs(s: string): string {
	return s.replace(/\s+/g, ' ').trim()
}

function normCode(s: string): string {
	return s
		.replace(/[\u2013\u2014\u2212]/g, '-')
		.replace(/[^a-z0-9]/gi, '')
		.toUpperCase()
}

function convertPoMappingsForCet(
	po: ParsedSyllabus['po_mappings'],
): ParsedSyllabus['po_mappings'] {
	const mapLevel = (v: string): string => {
		const u = v.toUpperCase()
		if (u === 'H') return '3'
		if (u === 'M') return '2'
		if (u === 'L') return '1'
		return v
	}

	const mapRecord = (rec: Record<string, string>) => {
		const out: Record<string, string> = {}
		for (const [k, v] of Object.entries(rec)) {
			if (!v || v === '-' || v === '0') continue
			out[k] = mapLevel(v)
		}
		return out
	}

	return {
		mappings: po.mappings.map((m) => {
			const pos = mapRecord(m.pos)
			const psos = mapRecord(m.psos ?? {})
			const row: ParsedSyllabus['po_mappings']['mappings'][number] = {
				co_id: m.co_id,
				pos,
			}
			if (Object.keys(psos).length > 0) row.psos = psos
			return row
		}),
	}
}

async function listFilesRecursive(dir: string): Promise<string[]> {
	const out: string[] = []
	const entries = await fs.promises.readdir(dir, { withFileTypes: true })
	for (const e of entries) {
		const full = path.join(dir, e.name)
		if (e.isDirectory()) {
			out.push(...(await listFilesRecursive(full)))
		} else {
			out.push(full)
		}
	}
	return out
}

function titleTokens(courseName: string): string[] {
	return courseName
		.toUpperCase()
		.replace(/[^A-Z0-9\s]/g, ' ')
		.split(/\s+/)
		.filter((w) => w.length > 3 && !['AND', 'THE', 'FOR', 'WITH', 'USING'].includes(w))
}

function pickBestDoc(
	courseCode: string,
	courseName: string,
	candidateFiles: string[],
): string | null {
	const needle = normCode(courseCode)
	const docs = candidateFiles.filter((f) => /\.(pdf|docx)$/i.test(f))

	const byCode = docs
		.map((f) => {
			const base = path.basename(f)
			const normBase = normCode(base)
			let score = 0
			if (!needle) return null
			if (normBase.startsWith(needle)) score += 100
			else if (normBase.includes(needle)) score += 50
			else return null
			if (f.toLowerCase().endsWith('.pdf')) score += 10
			score -= base.length / 100
			return { f, score }
		})
		.filter((x): x is { f: string; score: number } => x !== null)
		.sort((a, b) => b.score - a.score)

	if (byCode[0]) return byCode[0].f

	const tokens = titleTokens(courseName)
	if (tokens.length === 0) return null

	const byTitle = docs
		.map((f) => {
			const normBase = normCode(path.basename(f))
			let hits = 0
			for (const t of tokens) {
				if (normBase.includes(t)) hits++
			}
			if (hits < Math.min(2, tokens.length)) return null
			let score = hits * 20
			if (f.toLowerCase().endsWith('.pdf')) score += 5
			return { f, score }
		})
		.filter((x): x is { f: string; score: number } => x !== null)
		.sort((a, b) => b.score - a.score)

	return byTitle[0]?.f ?? null
}

async function extractText(filePath: string): Promise<string> {
	const stat = await fs.promises.stat(filePath)
	if (stat.size > MAX_BYTES) {
		throw new Error(
			`File too large (${Math.round(stat.size / 1024 / 1024)}MB): ${path.basename(filePath)}`,
		)
	}

	const buffer = await fs.promises.readFile(filePath)
	const lower = filePath.toLowerCase()

	if (lower.endsWith('.pdf')) {
		const { PDFParse } = await import('pdf-parse')
		const parser = new PDFParse({ data: buffer })
		try {
			const result = await parser.getText()
			return result.text ?? ''
		} finally {
			await parser.destroy()
		}
	}

	if (lower.endsWith('.docx')) {
		const mammoth = await import('mammoth')
		const result = await mammoth.extractRawText({ buffer })
		return result.value ?? ''
	}

	throw new Error(`Unsupported file extension: ${path.basename(filePath)}`)
}

function readFailedXlsx(): FailedRow[] {
	const XLSX = XLSXImport as any
	const wb = XLSX.readFile(FAILED_XLSX_PATH)
	const sheetName = wb.SheetNames.includes('Failed Rows')
		? 'Failed Rows'
		: wb.SheetNames[0]
	const ws = wb.Sheets[sheetName]
	const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
	if (!rows.length) return []

	const header = rows[0] ?? []
	const idx = (label: string) => {
		const target = normHeader(label)
		return header.findIndex((h: unknown) => normHeader(h) === target)
	}

	const colInstitutionsId = idx('Institution_id')
	const colRegCode = idx('Regulation Code*')
	const colRegId = idx('Regulation_id')
	const colBoardId = idx('board_id')
	const colCompositionId = idx('composition_id')
	const colCreatedBy = idx('created_by')
	const colCourseCode = idx('Course Code*')
	const colCourseName = idx('Course Name*')

	const missing: string[] = []
	for (const [name, value] of Object.entries({
		institutions_id: colInstitutionsId,
		regulation_id: colRegId,
		board_id: colBoardId,
		composition_id: colCompositionId,
		created_by: colCreatedBy,
		course_code: colCourseCode,
		course_name: colCourseName,
	})) {
		if (value < 0) missing.push(name)
	}
	if (missing.length) {
		throw new Error(`Failed Rows header mapping missing: ${missing.join(', ')}`)
	}
	if (colRegCode < 0) {
		throw new Error('Failed Rows header mapping missing: regulation code')
	}

	const out: FailedRow[] = []
	for (let i = 1; i < rows.length; i++) {
		const r = rows[i] ?? []
		const course_code = collapseWs(String(r[colCourseCode] ?? ''))
		if (!course_code) continue

		const regulation_code = collapseWs(String(r[colRegCode] ?? ''))
		if (regulation_code !== 'R-2025') continue

		out.push({
			institutions_id: String(r[colInstitutionsId] ?? ''),
			regulation_id: String(r[colRegId] ?? ''),
			board_id: String(r[colBoardId] ?? ''),
			composition_id: r[colCompositionId] ? String(r[colCompositionId]) : null,
			created_by: String(r[colCreatedBy] ?? ''),
			course_code,
			course_name: collapseWs(String(r[colCourseName] ?? '')),
		})
	}

	const byKey = new Map<string, FailedRow>()
	for (const fr of out) byKey.set(`${fr.regulation_id}|${fr.course_code}`, fr)
	return Array.from(byKey.values())
}

function buildUpsertSql(row: FailedRow, parsed: ParsedSyllabus, docPath: string, tag: string): string {
	const po_mappings = convertPoMappingsForCet(parsed.po_mappings)
	const note = collapseWs(
		`Source: courses-failed-2026-07-21.xlsx | Doc: ${path.basename(docPath)}`,
	)

	const institutionsIdSql = sqlUuidOrNull(row.institutions_id)
	const boardIdSql = sqlUuidOrNull(row.board_id)
	const regulationIdSql = sqlUuidOrNull(row.regulation_id)
	const compositionIdSql = sqlUuidOrNull(row.composition_id)
	const createdBySql = sqlUuidOrNull(row.created_by)
	const courseCodeSql = `'${sqlEscapeString(row.course_code)}'`
	const courseNameSql = `'${sqlEscapeString(row.course_name)}'`
	const notesSql = sqlNullableText(note)

	const courseIdSubquery = `(
\t\tSELECT c.coe_course_id::text
\t\tFROM public.courses c
\t\tWHERE c.institution_id = ${institutionsIdSql}
\t\t  AND upper(btrim(c.course_code)) = upper(btrim(${courseCodeSql}))
\t\tLIMIT 1
\t)`

	return [
		`-- ${row.course_code} | ${row.course_name}`,
		`INSERT INTO public.bos_course_syllabi (`,
		`\tinstitutions_id, board_id, regulation_id, composition_id, course_id,`,
		`\tcourse_code, course_name,`,
		`\tcourse_objectives, course_learning_outcomes, course_content,`,
		`\ttextbooks, web_resources, pedagogy, po_mappings,`,
		`\tcreated_by, notes,`,
		`\tversion_number, is_latest, is_archived`,
		`) VALUES (`,
		`\t${institutionsIdSql}, ${boardIdSql}, ${regulationIdSql}, ${compositionIdSql}, ${courseIdSubquery},`,
		`\t${courseCodeSql}, ${courseNameSql},`,
		`\t${sqlJsonb(parsed.course_objectives, `${tag}_obj`)},`,
		`\t${sqlJsonb(parsed.course_learning_outcomes, `${tag}_clos`)},`,
		`\t${sqlJsonb(parsed.course_content, `${tag}_content`)},`,
		`\t${sqlJsonb(parsed.textbooks, `${tag}_books`)},`,
		`\t${sqlJsonb(parsed.web_resources, `${tag}_web`)},`,
		`\t${sqlJsonb(parsed.pedagogy, `${tag}_ped`)},`,
		`\t${sqlJsonb(po_mappings, `${tag}_po`)},`,
		`\t${createdBySql}, ${notesSql},`,
		`\t1, true, false`,
		`)`,
		`ON CONFLICT (regulation_id, course_code, version_number)`,
		`DO UPDATE SET`,
		`\tboard_id = EXCLUDED.board_id,`,
		`\tcomposition_id = EXCLUDED.composition_id,`,
		`\tcourse_id = COALESCE(EXCLUDED.course_id, bos_course_syllabi.course_id),`,
		`\tcourse_name = EXCLUDED.course_name,`,
		`\tcourse_objectives = EXCLUDED.course_objectives,`,
		`\tcourse_learning_outcomes = EXCLUDED.course_learning_outcomes,`,
		`\tcourse_content = EXCLUDED.course_content,`,
		`\ttextbooks = EXCLUDED.textbooks,`,
		`\tweb_resources = EXCLUDED.web_resources,`,
		`\tpedagogy = EXCLUDED.pedagogy,`,
		`\tpo_mappings = EXCLUDED.po_mappings,`,
		`\tnotes = EXCLUDED.notes,`,
		`\tlast_modified_at = now(),`,
		`\tlast_modified_by = EXCLUDED.created_by;`,
	].join('\n')
}

async function main() {
	console.log('--- Emitting bos_course_syllabi SQL (R-2025 only) ---')

	const failedRows = readFailedXlsx()
	console.log(`R-2025 unique course codes: ${failedRows.length}`)
	if (failedRows.length === 0) throw new Error('No R-2025 rows found')

	const candidateFiles = await listFilesRecursive(REG_2025_FOLDER)
	console.log(`Source documents: ${candidateFiles.length}`)

	const failures: Array<{ course_code: string; reason: string; doc?: string }> = []
	const statements: string[] = []

	for (let i = 0; i < failedRows.length; i++) {
		const row = failedRows[i]
		const tag = `r2025_${i}`
		if (i % 10 === 0) {
			console.log(`Processing ${i + 1}/${failedRows.length}: ${row.course_code}`)
		}

		try {
			const docPath = pickBestDoc(row.course_code, row.course_name, candidateFiles)
			if (!docPath) {
				failures.push({
					course_code: row.course_code,
					reason: 'No matching PDF/DOCX in REG-2025 folder',
				})
				continue
			}

			const text = await extractText(docPath)
			if (!text.trim()) {
				failures.push({
					course_code: row.course_code,
					reason: 'Extracted text is empty',
					doc: path.basename(docPath),
				})
				continue
			}

			const parsed = parseSyllabusText(text)
			const summary = summarise(parsed)
			if (summary.clos === 0 && summary.units === 0) {
				failures.push({
					course_code: row.course_code,
					reason: 'Parser found no COs and no units',
					doc: path.basename(docPath),
				})
				continue
			}
			if (summary.clos === 0) {
				failures.push({
					course_code: row.course_code,
					reason: 'Parser found units but no CO rows',
					doc: path.basename(docPath),
				})
				continue
			}

			statements.push(buildUpsertSql(row, parsed, docPath, tag))
		} catch (e) {
			failures.push({
				course_code: row.course_code,
				reason: e instanceof Error ? e.message : String(e),
			})
		}
	}

	const sql = [
		'BEGIN;',
		'-- Auto-generated upsert SQL for bos_course_syllabi (R-2025 failed courses)',
		`-- Failed list: ${FAILED_XLSX_PATH}`,
		`-- Source folder: ${REG_2025_FOLDER}`,
		`-- Generated: ${new Date().toISOString()}`,
		`-- Emitted: ${statements.length} | Failed: ${failures.length}`,
		'',
		...statements,
		'',
		'COMMIT;',
	].join('\n')

	await fs.promises.writeFile(OUTPUT_SQL_PATH, sql, 'utf8')
	await fs.promises.writeFile(FAILURE_JSON_PATH, JSON.stringify(failures, null, 2), 'utf8')

	console.log('\n===== RESULT =====')
	console.log(
		JSON.stringify(
			{
				outputSql: OUTPUT_SQL_PATH,
				failureJson: FAILURE_JSON_PATH,
				processed: failedRows.length,
				emitted: statements.length,
				failed: failures.length,
			},
			null,
			2,
		),
	)
}

main().catch((e) => {
	console.error('FATAL:', e instanceof Error ? e.message : e)
	process.exit(1)
})
