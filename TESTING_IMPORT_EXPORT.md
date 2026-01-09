# Testing Import/Export Workflow

## Prerequisites
✅ Dev server is running on http://localhost:3000
✅ TypeScript errors fixed
✅ All files created successfully

## Test Plan

### Test 1: Download Template (Blank Excel with Dropdowns)

**Steps:**
1. Navigate to: http://localhost:3000/organizations/institutions
2. Click the **"Export"** dropdown button (should see a download icon)
3. Select **"Download Template"**
4. File should download: `institutions-template-2025-01-09.xlsx`

**Expected Results:**
- ✅ File downloads successfully
- ✅ Opens in Excel without errors
- ✅ Has 3 sheets: "Institutions", "Lists", "Instructions"
- ✅ Sample data in row 2 (italic, gray color)
- ✅ Instructions sheet is readable

**Test the Dropdowns in Excel:**
1. Open the downloaded template
2. Go to "Institutions" sheet
3. Click on cell **D2** (Institution Type column)
   - Should see a dropdown arrow appear
   - Click the arrow → Should show: Self, Autonomous, Aided
4. Click on cell **E2** (Category column)
   - Should see dropdown with: UG, PG, UG & PG
5. Click on cell **F2** (Timetable Type column)
   - Should see dropdown with: Day Order, Week Order
6. Try typing "invalid" in cell D3
   - Should show error message: "Invalid Institution Type"
   - Excel should not allow the invalid value

---

### Test 2: Export Existing Institutions

**Steps:**
1. Click the **"Export"** dropdown button
2. Select **"Export as Excel (.xlsx)"**
3. File should download: `institutions-export-2025-01-09.xlsx`

**Expected Results:**
- ✅ File downloads successfully
- ✅ Opens in Excel without errors
- ✅ Contains existing institution data
- ✅ Has "Institutions" and "Lists" sheets
- ✅ Dropdowns work in columns D, E, F
- ✅ Values show as display labels (e.g., "Self" not "self")

**Verify Data:**
- Check that Institution Type shows "Self", "Autonomous", or "Aided" (not database values)
- Check that Category shows "UG", "PG", or "UG & PG" (not "ug_pg")
- Check that Timetable Type shows "Day Order" or "Week Order" (not "day_order")

---

### Test 3: Import with Valid Data (Happy Path)

**Steps:**
1. Use the template or exported file
2. Delete the sample row (row 2) if using template
3. Add test data in rows 2-4:

   **Row 2:**
   - Name: Test Institution 1
   - Code: TEST001
   - Counselling Code: COUNS001
   - Institution Type: Self (use dropdown!)
   - Category: UG & PG (use dropdown!)
   - Timetable Type: Day Order (use dropdown!)
   - Accredited By: NAAC A+
   - Address Line 1: 123 Test Street
   - City: Test City
   - State: Test State
   - Country: India
   - Pincode: 600001
   - Phone: +91 9876543210
   - Email: test1@example.com
   - Website: https://test1.example.com
   - Is Active: true

   **Row 3:**
   - Name: Test Institution 2
   - Code: TEST002
   - Counselling Code: COUNS002
   - Institution Type: Autonomous (dropdown)
   - Category: UG (dropdown)
   - Timetable Type: Week Order (dropdown)
   - [Fill other required fields similarly]

   **Row 4:**
   - Name: Test Institution 3
   - Code: TEST003
   - Counselling Code: COUNS003
   - Institution Type: Aided (dropdown)
   - Category: PG (dropdown)
   - Timetable Type: Day Order (dropdown)
   - [Fill other required fields similarly]

4. Save the Excel file
5. Go back to browser: http://localhost:3000/organizations/institutions
6. Click **"Import"** button
7. Drag & drop the file or click "Browse Files"
8. Click **"Import"** button in the dialog

**Expected Results:**
- ✅ File uploads successfully
- ✅ Import dialog shows progress indicator
- ✅ Success toast appears: "Successfully imported 3 institutions"
- ✅ Results summary shows:
  - Total rows: 3
  - Success badge (green): 3
  - Error count: 0
- ✅ Click "Done" → Dialog closes
- ✅ Page refreshes automatically
- ✅ New institutions appear in the table

---

### Test 4: Import with Validation Errors

**Steps:**
1. Use template or exported file
2. Add test data with INTENTIONAL ERRORS:

   **Row 2 (Invalid Email):**
   - Name: Error Test 1
   - Code: ERR001
   - Counselling Code: ERRCOUN001
   - Institution Type: Self (dropdown)
   - Category: UG (dropdown)
   - Timetable Type: Day Order (dropdown)
   - Email: **invalid-email** (no @ symbol)
   - [Fill other fields correctly]

   **Row 3 (Invalid Pincode):**
   - Name: Error Test 2
   - Code: ERR002
   - Counselling Code: ERRCOUN002
   - Institution Type: Autonomous (dropdown)
   - Category: PG (dropdown)
   - Timetable Type: Week Order (dropdown)
   - Pincode: **12345** (only 5 digits, should be 6)
   - [Fill other fields correctly]

   **Row 4 (Missing Required Field):**
   - Name: Error Test 3
   - Code: ERR003
   - Counselling Code: ERRCOUN003
   - Institution Type: (leave empty!)
   - Category: UG & PG (dropdown)
   - Timetable Type: Day Order (dropdown)
   - [Fill other fields correctly]

   **Row 5 (Duplicate Code):**
   - Name: Error Test 4
   - Code: **TEST001** (if you imported this earlier, it's a duplicate!)
   - Counselling Code: ERRCOUN004
   - [Fill other fields correctly]

3. Save file and import

**Expected Results:**
- ✅ Error toast appears: "Import failed: X error(s) found"
- ✅ Results summary shows:
  - Total rows: 4
  - Success: 0 (or some valid rows if any)
  - Errors badge (red): 4 (or count of invalid rows)
- ✅ Error table displays:

  | Row | Field | Error Message |
  |-----|-------|---------------|
  | 2 | email | Row 2: email - Invalid email format |
  | 3 | pin_code | Row 3: PIN code must be exactly 6 digits |
  | 4 | institution_type | Row 4: Invalid Institution Type "" ... |
  | 5 | code | Row 5: Code "TEST001" already exists in database |

- ✅ Error table is scrollable (if many errors)
- ✅ Can click "Import Another File" to try again
- ✅ No institutions are created (all or nothing for failed import)

---

### Test 5: Case-Insensitive Import

**Purpose:** Verify that the system accepts dropdown values in any case

**Steps:**
1. Export an existing institution (or use template)
2. Manually edit the Excel file:
   - In cell D2 (Institution Type), type: **SELF** (all caps)
   - In cell E2 (Category), type: **ug & pg** (lowercase)
   - In cell F2 (Timetable Type), type: **Day order** (mixed case)

   **Note:** This bypasses Excel validation to test the import mapping

3. Save and import

**Expected Results:**
- ✅ Import succeeds (case doesn't matter)
- ✅ Values are correctly mapped:
  - "SELF" → stored as 'self'
  - "ug & pg" → stored as 'ug_pg'
  - "Day order" → stored as 'day_order'

---

### Test 6: Export Formats (CSV and JSON)

**Steps:**
1. Click "Export" dropdown
2. Test each format:
   - Export as CSV
   - Export as JSON

**Expected Results:**

**CSV:**
- ✅ Downloads as `.csv` file
- ✅ Opens in Excel or text editor
- ✅ Contains all institution data
- ✅ Proper CSV formatting (comma-separated)
- ✅ Includes timetable_type column

**JSON:**
- ✅ Downloads as `.json` file
- ✅ Valid JSON format (can parse in browser console)
- ✅ Array of institution objects
- ✅ All fields present

---

### Test 7: Dropdown Validation in Excel

**Purpose:** Verify that Excel enforces dropdown selection

**Steps:**
1. Download template
2. Open in Excel
3. Click on cell D2 (Institution Type)
4. Try to type "Invalid" manually
5. Press Enter

**Expected Results:**
- ✅ Excel shows error dialog: "Invalid Institution Type"
- ✅ Error message lists valid options: "Self, Autonomous, Aided"
- ✅ Cell value is NOT saved
- ✅ Cell is highlighted with error indicator

**Repeat for:**
- Column E (Category) → Should only accept: UG, PG, UG & PG
- Column F (Timetable Type) → Should only accept: Day Order, Week Order

---

### Test 8: Large Import (Performance Test)

**Purpose:** Test with many rows

**Steps:**
1. Download template
2. Copy row 2 and paste it 50 times (or use Excel fill-down)
3. Modify Code and Counselling Code for each row (must be unique!)
   - Row 2: BULK001, COUN001
   - Row 3: BULK002, COUN002
   - ... and so on
4. Use dropdowns for Institution Type, Category, Timetable Type
5. Save and import

**Expected Results:**
- ✅ Import completes in < 10 seconds for 50 rows
- ✅ All 50 institutions created successfully
- ✅ Success toast shows correct count
- ✅ No memory issues or crashes

---

## Common Issues & Solutions

### Issue 1: "No file provided" error
**Solution:** Make sure you selected a file and it uploaded completely before clicking Import

### Issue 2: "Invalid file type" error
**Solution:** File must be `.xlsx` or `.xls` format. If you saved as `.csv`, re-save as Excel format.

### Issue 3: Dropdowns don't appear in Excel
**Solution:**
- Make sure you're clicking on cells D, E, or F (columns with validation)
- Make sure you downloaded from the correct endpoint (Template or Export)
- Try closing and reopening Excel

### Issue 4: "Code already exists" error
**Solution:**
- Each Code must be unique across ALL institutions
- Each Counselling Code must be unique
- If testing, use unique codes like TEST001, TEST002, etc.

### Issue 5: Import button doesn't appear
**Solution:**
- You need 'create' permission for institutions
- Check with your admin if you don't see the Import button

### Issue 6: TypeScript errors in console
**Solution:**
- Restart dev server: `npm run dev`
- Clear Next.js cache: Delete `.next` folder and restart

---

## Browser Console Testing

Open browser console (F12) and check for:

**During Export:**
```javascript
// Should see successful fetch
GET /api/organizations/institutions/export?format=xlsx
Status: 200 OK
```

**During Import:**
```javascript
// Should see multipart upload
POST /api/organizations/institutions/import
Status: 200 OK
Content-Type: multipart/form-data
```

**Check for errors:**
- No red errors in console
- No 500 Internal Server Error
- No CORS errors

---

## Database Verification

After successful import, verify in Supabase:

```sql
-- Check imported institutions
SELECT
  name,
  code,
  institution_type,
  category,
  timetable_type,
  created_at
FROM institutions
WHERE code LIKE 'TEST%' OR code LIKE 'BULK%'
ORDER BY created_at DESC;
```

**Verify:**
- ✅ institution_type stored as 'self', 'autonomous', or 'aided' (lowercase)
- ✅ category stored as 'ug', 'pg', or 'ug_pg' (lowercase with underscore)
- ✅ timetable_type stored as 'day_order' or 'week_order' (lowercase with underscore)
- ✅ All other fields match the imported data

---

## Test Summary Checklist

- [ ] Template downloads successfully
- [ ] Template has dropdowns in Excel
- [ ] Dropdowns show correct values
- [ ] Excel prevents invalid entries
- [ ] Export works (XLSX, CSV, JSON)
- [ ] Export shows display labels (not database values)
- [ ] Import dialog opens and closes
- [ ] Valid data imports successfully
- [ ] Invalid data shows clear error messages
- [ ] Case-insensitive mapping works
- [ ] Duplicate detection works
- [ ] Error table displays correctly
- [ ] Success/error counts are accurate
- [ ] Page refreshes after import
- [ ] New institutions appear in table
- [ ] Performance is acceptable (50+ rows)
- [ ] No console errors
- [ ] Database values are correct

---

## Next Steps After Testing

1. **If all tests pass:**
   - ✅ Feature is ready for production
   - Document any issues found and fixed
   - Train users on the import/export workflow

2. **If tests fail:**
   - Note the specific test that failed
   - Check browser console for errors
   - Check Next.js terminal for API errors
   - Share error details for troubleshooting

3. **Optional Enhancements:**
   - Hide the Lists sheet: Uncomment `listsSheet.state = 'hidden'` in export/template routes
   - Adjust row count: Change `lastRow = 100` to desired number
   - Customize styling: Update header colors, fonts

---

**Ready to start testing!** 🚀

Begin with Test 1 (Download Template) and work through each test sequentially.
