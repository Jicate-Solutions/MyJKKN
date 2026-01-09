# Organization Import/Export Implementation Progress

**Date**: 2025-01-09
**Status**: In Progress
**Modules Completed**: 3 of 7 (Institutions, Degrees, Courses)

## Overview

Implementing standardized Excel import/export functionality across all organization modules with dropdown validation for enum fields.

---

## ✅ Completed Modules

### 1. Institutions Module (Fixed + Enhanced)
**Status**: ✅ Complete

#### Issues Fixed:
- **Column Mismatch Error**: Fixed PostgreSQL error `column institutions.code does not exist`
- **Backward Compatibility**: Added automatic template format detection (old 18-column vs new 17-column)
- **Hydration Error**: Fixed invalid HTML nesting (`<div>` inside `<p>` tags)

#### Features:
- Template API: `/api/organizations/institutions/template`
- Import API: `/api/organizations/institutions/import`
- Import Dialog: Full error display with row-level details
- Excel Dropdowns: Institution Type, Category, Timetable Type
- Format Detection: Supports both old and new template formats

#### Files Modified:
- `app/api/organizations/institutions/import/route.ts` - Added format detection
- `app/api/organizations/institutions/template/route.ts` - Removed Code column
- `app/(routes)/organizations/institutions/_components/import-dialog.tsx` - Fixed hydration error

---

### 2. Degrees Module
**Status**: ✅ Complete

#### Features:
- Template API: `/api/organizations/degrees/template`
- Import API: `/api/organizations/degrees/import`
- Import Dialog: `import-dialog.tsx`
- Excel Dropdowns: Counselling Code (from institutions), Degree Type (UG, PG)
- Export Formats: Excel, CSV, JSON
- Download Template button
- Dynamic institution dropdown fetches active institutions from database

#### Files Created:
- `lib/utils/degree-excel-mappings.ts` - Mapping utilities
- `app/api/organizations/degrees/template/route.ts` - Template generation
- `app/api/organizations/degrees/import/route.ts` - Import handler
- `app/(routes)/organizations/degrees/_components/import-dialog.tsx` - UI component

#### Files Modified:
- `app/(routes)/organizations/degrees/_components/degrees-data-table.tsx` - Added Import/Export UI

---

### 3. Courses Module
**Status**: ✅ Complete

#### Features:
- Template API: `/api/organizations/courses/template`
- Import API: `/api/organizations/courses/import`
- Import Dialog: `import-dialog.tsx`
- Excel Dropdown: Counselling Code (FK validation, fetches from institutions)
- Export Formats: Excel, CSV, JSON
- Download Template button
- No enum dropdowns (simple module)
- Dynamic institution dropdown with database validation

#### Files Created:
- `lib/utils/course-excel-mappings.ts` - Basic helper functions
- `app/api/organizations/courses/template/route.ts` - Template generation
- `app/api/organizations/courses/import/route.ts` - Import handler with FK validation
- `app/(routes)/organizations/courses/_components/import-dialog.tsx` - UI component

#### Files Modified:
- `app/(routes)/organizations/courses/_components/courses-data-table.tsx` - Added Import/Export UI
- `app/(routes)/organizations/courses/_components/course-filters.tsx` - Removed old buttons

#### Files Deleted:
- `bulk-upload-courses.tsx` ❌
- `download-course-template.tsx` ❌
- `export-courses.tsx` ❌

---

## 🔄 In Progress

None - ready to start next module.

---

## 📋 Pending Modules

### 4. Departments Module
**Complexity**: 🟢 Simple | **Depends on**: Degrees
**Dropdown Fields**: None
**Hierarchy**: Institution → Degree → Department

### 5. Programs Module
**Complexity**: 🟡 Medium | **Depends on**: Departments
**Dropdown Fields**: 3 (program_type, pattern_type, is_part_time)
**Hierarchy**: Institution → Degree → Department → Program

### 6. Semesters Module
**Complexity**: 🟡 Medium | **Depends on**: Programs
**Dropdown Fields**: 1 (semester_type: even/odd)
**Hierarchy**: Institution → Degree → Department → Program → Semester

### 7. Sections Module
**Complexity**: 🔴 Complex | **Depends on**: Semesters
**Dropdown Fields**: None
**Hierarchy**: Institution → Degree → Department → Program → Semester → Section
**Note**: Deepest hierarchy (5 levels of FK validation)

---

## 🔑 Key Patterns Established

### Template Generation Pattern
```typescript
// 1. Fetch reference data (institutions, enums, etc.)
// 2. Create main sheet with column definitions
// 3. Add sample row with yellow background
// 4. Add dropdown validation (inline lists < 255 chars)
// 5. Create Lists sheet (hidden)
// 6. Create Instructions sheet
// 7. Generate Excel file
```

### Import Handler Pattern
```typescript
// 1. Authenticate user
// 2. Parse Excel file (ExcelJS)
// 3. Validate each row (Zod schema)
// 4. Map dropdown labels to database values
// 5. Validate FK relationships
// 6. Check for duplicates (file + database)
// 7. Batch insert valid rows
// 8. Return detailed error report
```

### Import Dialog Pattern
```typescript
// - File upload with drag & drop
// - File type validation
// - Progress indicator during import
// - Success/error summary with counts
// - Detailed error table (row, field, message)
// - Download template button
// - Instructions section
```

### Data Table Integration Pattern
```typescript
// 1. Add import state: const [importOpen, setImportOpen] = useState(false)
// 2. Add handler functions (download template, export Excel/CSV/JSON)
// 3. Update toolbar with Import button + Export dropdown
// 4. Add ImportDialog component at end of JSX
// 5. Pass onImportComplete callback to refresh data
```

---

## 📊 Implementation Statistics

| Module | Dropdown Fields | Files Created | Files Modified | Files Deleted | Status |
|--------|-----------------|---------------|----------------|---------------|--------|
| Institutions | 3 | 0 | 3 | 0 | ✅ Fixed |
| Degrees | 2 (Counselling Code + Degree Type) | 4 | 1 | 0 | ✅ Complete |
| Courses | 1 (Counselling Code) | 4 | 2 | 3 | ✅ Complete |
| Departments | 0 | 0 | 0 | 0 | 📅 Pending |
| Programs | 3 | 0 | 0 | 0 | 📅 Pending |
| Semesters | 1 | 0 | 0 | 0 | 📅 Pending |
| Sections | 0 | 0 | 0 | 0 | 📅 Pending |
| **Total** | **10** | **8** | **6** | **3** | **43% Complete** |

---

## 🐛 Issues Encountered & Resolved

### Issue 1: Institutions Column Mismatch
**Error**: `PostgreSQL error 42703: column institutions.code does not exist`
**Cause**: Template and import logic referenced non-existent `code` column
**Solution**:
- Removed `code` from Zod schema
- Updated column mapping (shifted all columns left by 1)
- Changed dropdown validation columns (C, D, E instead of D, E, F)
- Updated database queries to only check `counselling_code`

### Issue 2: Backward Compatibility
**Problem**: Users with old templates (18 columns with Code) couldn't import
**Solution**: Added automatic format detection
```typescript
function detectTemplateFormat(row: any): 'old' | 'new' {
  // Check column 3 for institution type (new format)
  // Check column 4 for institution type (old format)
  // Parse accordingly
}
```

### Issue 3: React Hydration Error
**Error**: `<div> cannot be a descendant of <p>`
**Cause**: Badge components (render as `<div>`) nested inside `<p>` tags
**Solution**: Changed `<p>` to `<div>` and wrapped text in `<span>`

### Issue 4: Degrees & Courses Institution Column Name (Template + Import)
**Error**: `PostgreSQL error 42703: column institutions.institution_code does not exist`
**Cause**: Both template and import APIs used `institution_code` instead of actual column name `counselling_code`
**Solution**:

**Template APIs Fixed:**
- Changed Supabase query from `.select('institution_code')` to `.select('counselling_code, name')`
- Updated column headers from "Institution Code" to "Counselling Code"
- Updated all variable references, sample data, and dropdown validation
- Applied fix to both Degrees and Courses templates

**Import APIs Fixed:**
- Updated Zod schemas: `institution_code` → `counselling_code`
- Updated institution lookup query: `.select('counselling_code, id')` instead of `.select('institution_code, id')`
- Created mapping: `counsellingCodeToIdMap` to convert text code to UUID
- Updated validation logic to check `counselling_code` existence
- Updated duplicate checking to use `counselling_code`
- Fixed insert to map `counselling_code` → `institution_id` (UUID FK)
- Applied fixes to both Degrees and Courses import routes

**Files Modified:**
- `app/api/organizations/degrees/template/route.ts` - Fixed template generation
- `app/api/organizations/degrees/import/route.ts` - Fixed import handler
- `app/api/organizations/courses/template/route.ts` - Fixed template generation
- `app/api/organizations/courses/import/route.ts` - Fixed import handler

**Result**: Templates and imports now correctly use `counselling_code` (text) from institutions table and map to `institution_id` (UUID) for database insertion.

---

## 🎯 Next Steps

1. **Implement Departments Module** (depends on Degrees)
   - Simple module, no dropdowns
   - FK validation: institution_code, degree_id
   - Est. time: 2-3 hours

2. **Implement Programs Module** (depends on Departments)
   - 3 dropdown fields (program_type, pattern_type, is_part_time)
   - Complex FK validation
   - Est. time: 3-4 hours

3. **Implement Semesters Module** (depends on Programs)
   - 1 dropdown field (semester_type)
   - Est. time: 3-4 hours

4. **Implement Sections Module** (depends on Semesters)
   - Deepest hierarchy (5 FK levels)
   - Est. time: 3-4 hours

---

## 📝 Notes

- All modules use consistent error response format (ImportResult interface)
- ExcelJS inline list validation works reliably (no XML corruption)
- Backward compatibility pattern can be reused for other modules if needed
- Import/Export UI is now standardized across all modules
- Old bulk upload components are being systematically removed

---

## 🔗 Related Documents

- Implementation Plan: `C:\Users\Admin\.claude\plans\vectorized-juggling-teacup.md`
- Mapping Utilities: `lib/utils/*-excel-mappings.ts`
- Excel Import/Export Skill: `.claude/skills/excel-import-export/`
