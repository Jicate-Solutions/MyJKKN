# Bug Reporter Manual Image Upload - Test Plan

**Date:** 2025-01-27
**Feature:** Manual image upload for bug reporter
**Status:** Ready for Testing

## Test Environment Setup

1. **Start Development Server:**
   ```bash
   cd D:/Projects/MyJKKN
   npm run dev
   ```

2. **Open Application:**
   - Navigate to `http://localhost:3000`
   - Log in with test account
   - Navigate to any page in the application

## Test Cases

### TC1: Auto-Screenshot Capture (Original Functionality)

**Steps:**
1. Click the red bug reporter button (bottom-right)
2. Observe modal opening

**Expected Results:**
- ✅ Modal opens immediately
- ✅ Screenshot is automatically captured
- ✅ Screenshot preview shown at bottom
- ✅ Toast message: "Screenshot captured! Bug report ready."

**Pass/Fail:** ___________

---

### TC2: Remove Screenshot

**Steps:**
1. Open bug reporter modal (screenshot auto-captured)
2. Click "Remove" button under screenshot preview

**Expected Results:**
- ✅ Screenshot preview disappears
- ✅ "No screenshot captured" section appears
- ✅ Two buttons shown: "Browse Image File" and "Paste from Clipboard"

**Pass/Fail:** ___________

---

### TC3: Manual Image Upload - Valid PNG

**Steps:**
1. Remove screenshot (if present)
2. Click "Browse Image File" button
3. Select a PNG image file (<5MB)

**Expected Results:**
- ✅ Native file picker opens
- ✅ File selection processes
- ✅ Screenshot preview appears
- ✅ Toast message: "Image uploaded successfully!"
- ✅ Image is compressed and displayed

**Pass/Fail:** ___________

---

### TC4: Manual Image Upload - Valid JPG

**Steps:**
1. Remove screenshot (if present)
2. Click "Browse Image File" button
3. Select a JPG/JPEG image file (<5MB)

**Expected Results:**
- ✅ Native file picker opens
- ✅ File selection processes
- ✅ Screenshot preview appears
- ✅ Toast message: "Image uploaded successfully!"
- ✅ Image is compressed and displayed

**Pass/Fail:** ___________

---

### TC5: Invalid File Type (PDF)

**Steps:**
1. Remove screenshot (if present)
2. Click "Browse Image File" button
3. Select a PDF file

**Expected Results:**
- ✅ File picker opens
- ✅ Error toast: "Please select an image file (PNG, JPG, etc.)"
- ✅ No screenshot preview shown
- ✅ Can retry with valid image

**Pass/Fail:** ___________

---

### TC6: Invalid File Type (Text File)

**Steps:**
1. Remove screenshot (if present)
2. Click "Browse Image File" button
3. Select a .txt or .docx file

**Expected Results:**
- ✅ File picker opens
- ✅ Error toast: "Please select an image file (PNG, JPG, etc.)"
- ✅ No screenshot preview shown

**Pass/Fail:** ___________

---

### TC7: File Size Validation (>5MB)

**Steps:**
1. Remove screenshot (if present)
2. Click "Browse Image File" button
3. Select an image file >5MB

**Expected Results:**
- ✅ File picker opens
- ✅ Error toast: "Image file is too large (max 5MB). Please select a smaller file."
- ✅ No screenshot preview shown

**Pass/Fail:** ___________

---

### TC8: Clipboard Paste (Desktop)

**Prerequisite:** Desktop browser (Chrome/Edge/Firefox)

**Steps:**
1. Remove screenshot (if present)
2. Take a screenshot using Windows + Shift + S
3. Click "Paste from Clipboard" button
4. Click "OK" on instructions dialog

**Expected Results:**
- ✅ Button is visible and clickable
- ✅ Instructions dialog appears
- ✅ Clipboard is read
- ✅ Screenshot preview appears
- ✅ Toast: "Screenshot from clipboard added!"

**Pass/Fail:** ___________

---

### TC9: Clipboard Paste - No Image in Clipboard

**Steps:**
1. Remove screenshot (if present)
2. Ensure clipboard is empty or contains text
3. Click "Paste from Clipboard" button
4. Click "OK" on instructions dialog

**Expected Results:**
- ✅ Instructions dialog appears
- ✅ Error toast: "No screenshot found in clipboard"
- ✅ No screenshot preview shown

**Pass/Fail:** ___________

---

### TC10: Replace Screenshot with Browse

**Steps:**
1. Ensure screenshot is captured (auto or manual)
2. Click "Browse Image File" button
3. Select a different image file

**Expected Results:**
- ✅ File picker opens
- ✅ New image replaces old screenshot
- ✅ Toast: "Image uploaded successfully!"
- ✅ New image preview shown

**Pass/Fail:** ___________

---

### TC11: Replace Screenshot with Clipboard

**Steps:**
1. Ensure screenshot is captured (auto or manual)
2. Take a new screenshot with OS tool
3. Click "Paste from Clipboard" button
4. Confirm instructions dialog

**Expected Results:**
- ✅ Clipboard paste dialog appears
- ✅ New image replaces old screenshot
- ✅ Toast: "Screenshot from clipboard added!"
- ✅ New image preview shown

**Pass/Fail:** ___________

---

### TC12: Retake Auto-Screenshot

**Steps:**
1. Ensure screenshot is captured
2. Click "Retake Auto-Screenshot" button
3. Wait for modal to close and reopen

**Expected Results:**
- ✅ Modal closes temporarily
- ✅ Page is recaptured
- ✅ Modal reopens with new screenshot
- ✅ Toast: "Screenshot retaken successfully!"

**Pass/Fail:** ___________

---

### TC13: Submit Bug Report with Manual Image

**Steps:**
1. Remove auto-screenshot
2. Upload image via "Browse Image File"
3. Fill in description (min 10 characters)
4. Select category
5. Click "Submit Report"

**Expected Results:**
- ✅ Loading state shows
- ✅ Bug report creates successfully
- ✅ Toast: "Thank you for reporting this issue!"
- ✅ Redirects to /my-bug-reports
- ✅ Bug report shows in list with screenshot

**Pass/Fail:** ___________

---

### TC14: Submit Bug Report without Screenshot

**Steps:**
1. Remove screenshot (if present)
2. Fill in description (min 10 characters)
3. Select category
4. Click "Submit Report"

**Expected Results:**
- ✅ Submission works
- ✅ Bug report creates without screenshot
- ✅ Redirects to bug reports page

**Pass/Fail:** ___________

---

### TC15: Cancel File Selection

**Steps:**
1. Remove screenshot
2. Click "Browse Image File"
3. Click "Cancel" in file picker

**Expected Results:**
- ✅ File picker closes
- ✅ No error shown
- ✅ "No screenshot captured" section remains
- ✅ Can click browse again

**Pass/Fail:** ___________

---

### TC16: Multiple File Selections

**Steps:**
1. Remove screenshot
2. Click "Browse Image File" and select image A
3. Click "Browse Image File" again and select image B

**Expected Results:**
- ✅ Image A shows first
- ✅ Image B replaces image A
- ✅ Only latest image is kept

**Pass/Fail:** ___________

---

### TC17: Mobile Responsive (Optional)

**Steps:**
1. Open in mobile browser or DevTools mobile view
2. Click bug reporter button
3. Test image upload buttons

**Expected Results:**
- ✅ All buttons are visible and clickable
- ✅ File picker works on mobile
- ✅ Buttons wrap properly on small screens

**Pass/Fail:** ___________

---

## Browser Compatibility Testing

| Browser | Version | TC1-17 Pass | Notes |
|---------|---------|-------------|-------|
| Chrome  |         |             |       |
| Edge    |         |             |       |
| Firefox |         |             |       |
| Safari  |         |             |       |

## Performance Testing

**Image Compression:**
- Upload 5MB image
- Verify compressed to <2MB
- Check quality is acceptable

**Upload Speed:**
- Measure time from file selection to preview
- Should be <2 seconds for most images

## Regression Testing

Ensure original functionality still works:
- ✅ Auto-screenshot on modal open
- ✅ Bug report submission
- ✅ Supabase storage upload
- ✅ Console logs capture
- ✅ Bug report list display

## Known Limitations

1. Single image per bug report (not multiple)
2. No drag-and-drop support (future enhancement)
3. No image editing (crop/annotate)
4. Clipboard API requires user permission

## Test Sign-Off

**Tester Name:** ___________________________
**Date:** _____/_____/_____
**Overall Result:** PASS ☐ FAIL ☐
**Comments:**

---

**Issues Found:**
1. _________________________________________________
2. _________________________________________________
3. _________________________________________________

**Blockers:**
- None ☐
- See comments ☐
