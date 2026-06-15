// lib/utils/strip-xlsx-comments.ts
//
// ExcelJS's `workbook.xlsx.load()` throws
//   TypeError: Cannot read properties of undefined (reading 'comments')
// when an uploaded .xlsx carries cell comments/notes authored or mangled by a
// non-Microsoft tool (WPS Office, Google Sheets, LibreOffice).
//
// Two crash sites, identical message (exceljs 4.4 worksheet-xform.js):
//   :453  options.comments[rel.Target].comments
//   :456  options.vmlDrawings[rel.Target].comments
// The loader INDEXES comment parts under hardcoded relative keys
// (`../commentsN.xml`, `../drawings/vmlDrawingN.vml`) but LOOKS THEM UP with the
// raw relationship `Target`. Any mismatch -> undefined -> throw. Known vectors:
// absolute targets (`/xl/comments1.xml`), sheet-adjacent targets, parts at
// non-standard paths (`xl/comments/comment1.xml`), threaded comments, and
// dangling rels (part already deleted but relationship kept).
//
// Cell notes are irrelevant to data import, so we drop them. FIELD-TESTED RULES
// (a previous version that gated on part filenames failed in production):
//   1. ALWAYS strip comment/vml/threadedComment relationships BY TYPE from every
//      `*.rels` — never gate this on whether a matching part file exists (that is
//      what handles the dangling-rel vector). Removing the relationship is what
//      actually prevents the crash, because reconcile() then never enters the
//      `Type === Comments` / `Type === VmlDrawing` branches.
//   2. Match BOTH `<Relationship .../>` and `<Relationship ...></Relationship>`.
//   3. Then delete the orphaned comment parts wherever they live.
//   4. Only re-zip if something actually changed (zero-overhead on clean files).

import JSZip from 'jszip';

// Comment-bearing parts, matched by basename so non-standard folders are caught.
const COMMENT_PART =
  /(?:^|\/)(?:comments?\d*\.xml|threadedComment\w*\.xml|vmlDrawing\d*\.vml)$/i;

// A <Relationship> is comment-related if any attribute carries one of these
// tokens — the Type URI always does (…/relationships/comments|vmlDrawing|…).
const COMMENT_REL_SELF_CLOSING =
  /<Relationship\b[^>]*(?:comments|vmlDrawing|threadedComment)[^>]*\/>/gi;
const COMMENT_REL_PAIRED =
  /<Relationship\b[^>]*(?:comments|vmlDrawing|threadedComment)[^>]*>[\s\S]*?<\/Relationship>/gi;

export async function stripXlsxComments(
  input: ArrayBuffer | Buffer
): Promise<ArrayBuffer | Buffer> {
  const zip = await JSZip.loadAsync(input);
  let changed = false;

  // 1. Strip comment relationships from EVERY .rels, by type, unconditionally.
  const relsFiles = Object.keys(zip.files).filter((name) => /_rels\/.+\.rels$/i.test(name));
  for (const relName of relsFiles) {
    const xml = await zip.file(relName)!.async('string');
    const cleaned = xml
      .replace(COMMENT_REL_SELF_CLOSING, '')
      .replace(COMMENT_REL_PAIRED, '');
    if (cleaned !== xml) {
      zip.file(relName, cleaned);
      changed = true;
    }
  }

  // 2. Delete the orphaned comment parts wherever they live.
  for (const name of Object.keys(zip.files).filter((n) => COMMENT_PART.test(n))) {
    zip.remove(name);
    changed = true;
  }

  // 3. Drop `<legacyDrawing r:id="…"/>` nodes — they anchor comment shapes via
  //    the vml rels we just removed, so the rId would otherwise dangle.
  const sheetFiles = Object.keys(zip.files).filter((name) =>
    /^xl\/worksheets\/sheet\d+\.xml$/i.test(name)
  );
  for (const sheetName of sheetFiles) {
    const xml = await zip.file(sheetName)!.async('string');
    const cleaned = xml.replace(/<legacyDrawing\b[^>]*\/>/gi, '');
    if (cleaned !== xml) {
      zip.file(sheetName, cleaned);
      changed = true;
    }
  }

  // 4. Untouched genuine Excel file -> return original, skip the re-zip cost.
  if (!changed) return input;
  return zip.generateAsync({ type: 'nodebuffer' });
}
