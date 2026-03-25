# Bulk Learner Image Upload - User Guide

## Quick Start Guide for Staff and Administrators

---

## 📋 Overview

The Bulk Learner Image Upload feature allows you to upload multiple student photos at once by matching image filenames to student roll numbers. This eliminates the need to upload photos one by one.

**Key Benefits**:
- ✅ Upload 500+ photos in one batch
- ✅ Automatic roll number matching
- ✅ Visual preview before upload
- ✅ Duplicate detection and resolution
- ✅ Detailed success/failure reports

---

## 🎯 Who Can Use This Feature?

- ✅ **Administrators**: Full access
- ✅ **Staff**: Full access
- ❌ **Students**: No access (feature hidden)

---

## 📸 Preparing Your Photos

### File Naming Convention

**CRITICAL**: Filenames MUST contain the student's roll number.

**Pattern**: `{LETTERS}{DIGITS}.{extension}`
- **Letters**: 2-4 characters (e.g., DB, CS, MECH)
- **Digits**: 2-6 numbers (e.g., 22092, 21001)
- **Extension**: .jpg, .png, .gif, or .webp

**✅ Valid Examples**:
```
DB22092.jpg
CS21001.png
MECH2023.webp
ECE22156.jpg
Student_DB22092.jpg  (roll number extracted: DB22092)
photo_CS21001_final.png  (roll number extracted: CS21001)
```

**❌ Invalid Examples**:
```
photo.jpg  ← No roll number
student1.png  ← No letters before digits
john_doe.jpg  ← No roll number pattern
test.gif  ← No roll number
```

### File Requirements

| Requirement | Details |
|-------------|---------|
| **File Types** | JPEG, PNG, GIF, WebP only |
| **File Size** | Maximum 5MB per file |
| **Image Quality** | Minimum 200x200px recommended |
| **Quantity** | 1-1000+ files per batch |

---

## 🚀 How to Use (Step-by-Step)

### Step 1: Access the Feature

1. Navigate to **Learners Management** page
2. Look for the **"Bulk Upload Images"** button in the top-right toolbar
3. Click the button to open the upload wizard

![Toolbar Location]
```
[Create Missing Profiles] [Bulk Upload Profiles] [Bulk Upload Images] ← YOU ARE HERE
```

---

### Step 2: Select Files

**Option A: Drag & Drop** (Recommended)
1. Prepare a folder with all student photos
2. Select all files (Ctrl+A or Cmd+A)
3. Drag files into the drop zone
4. Wait for "X files selected" confirmation

**Option B: Click to Browse**
1. Click the drop zone
2. Navigate to your photos folder
3. Select multiple files (hold Ctrl/Cmd for multiple selection)
4. Click "Open"

**What Happens Next**:
- Files are processed immediately
- Roll numbers extracted from filenames
- You're auto-advanced to the Preview step

---

### Step 3: Preview & Validate

**What You'll See**:

1. **Validation Summary Card** (top):
   - Total files uploaded
   - Valid files (green) - ready to upload
   - Warnings (yellow) - can upload with caution
   - Errors (red) - cannot upload

2. **Photo Grid** (main area):
   - Each card shows:
     - Student photo preview
     - Filename
     - Roll number badge
     - Status badge (Valid/Warning/Error)
     - Student name (if matched)
     - Semester and section
     - Checkbox for selection

**Filter Options**:
- **All**: View all uploaded files
- **Valid**: Only files ready to upload
- **Warning**: Files with warnings (duplicates, existing photos)
- **Error**: Files with problems (invalid format, not found)

**Actions You Can Take**:

1. **Review Files**:
   - Scroll through the grid
   - Check each photo matches the correct student
   - Verify roll numbers are correct

2. **Handle Duplicates**:
   - If you uploaded multiple photos for one student
   - Radio buttons will appear on duplicate cards
   - Select which version to upload
   - Others will be excluded automatically

3. **Handle Existing Photos**:
   - Yellow warning: "Will replace existing photo"
   - Means student already has a photo
   - Uploading will DELETE the old photo and replace it
   - Make sure you want to proceed

4. **Remove Unwanted Files**:
   - Click the X button on any card
   - Confirm removal in the popup
   - File will be excluded from upload

5. **Bulk Selection**:
   - **Select All Valid**: Automatically selects all valid/warning files
   - **Deselect All**: Unchecks everything

**Common Issues & Solutions**:

| Issue | What It Means | Solution |
|-------|---------------|----------|
| ❌ "Could not extract roll number" | Filename doesn't match pattern | Rename file to include roll number |
| ❌ "No learner found with roll number" | Roll number not in database | Check spelling, verify student exists |
| ❌ "File size exceeds 5MB" | Image file too large | Compress image or use different file |
| ❌ "Invalid file type" | Not an image file | Use JPG, PNG, GIF, or WebP only |
| ⚠️ "Will replace existing photo" | Student already has photo | Proceed if you want to update it |
| ⚠️ "Duplicate roll number" | Multiple files for same student | Choose which version to upload |

---

### Step 4: Confirm Upload

**Review Summary**:
- Number of photos to upload
- Number of students affected
- Number of existing photos to replace
- Institution name

**Important Warnings**:
- ⚠️ If replacing existing photos, you'll see a warning alert
- ⚠️ This action cannot be undone
- ⚠️ Old photos will be permanently deleted

**Final Check**:
1. Verify the numbers are correct
2. Make sure you're ready to replace existing photos (if any)
3. Click **"Upload X Photos"** to proceed
4. Or click **"Back"** to make changes

---

### Step 5: Upload in Progress

**What Happens**:
1. Progress bar shows upload percentage (0-100%)
2. Current filename being uploaded is displayed
3. Count shows "X of Y uploaded"
4. Alert reminds you not to close the window

**Important**:
- ⚠️ **DO NOT close the dialog** during upload
- ⚠️ **DO NOT refresh the page**
- ⚠️ **DO NOT navigate away**
- Dialog X button is disabled to prevent accidental closure

**Estimated Time**:
- 10 files: ~30 seconds
- 50 files: ~2 minutes
- 100 files: ~4 minutes
- 500 files: ~20 minutes

*Times vary based on file sizes and internet speed*

---

### Step 6: View Results

**Success Table**:
- ✅ Green checkmark badge
- Roll number
- Student name
- "Uploaded" status

**Failed Table** (if any failures):
- ❌ Red X badge
- Filename
- Roll number (if extracted)
- Error message explaining why it failed

**Actions Available**:

1. **Download Failed List** (if failures):
   - Downloads CSV file
   - Contains: Filename, Roll Number, Error
   - Use this to fix issues and re-upload

2. **Upload More Photos**:
   - Resets the wizard to Step 1
   - Start a new batch upload

3. **Close**:
   - Closes the dialog
   - Returns to Learners Management page

**Success Notification**:
- ✅ Green toast: "X photos uploaded successfully"
- ❌ Red toast: "X photos failed" (if any failures)

---

## 💡 Tips & Best Practices

### Before Upload

1. **Organize Your Files**:
   - Keep all photos in one folder
   - Name files clearly with roll numbers
   - Use consistent naming pattern

2. **Check File Sizes**:
   - Compress large images before upload
   - Aim for 500KB-2MB per file
   - Use tools like TinyPNG or Squoosh

3. **Verify Roll Numbers**:
   - Export student list from database
   - Match filenames to list
   - Check for typos

4. **Test with Small Batch**:
   - Upload 5-10 files first
   - Verify everything works
   - Then upload remaining files

### During Upload

1. **Stay on the Page**:
   - Don't close the browser
   - Don't navigate away
   - Don't refresh the page

2. **Monitor Progress**:
   - Watch for errors
   - Note which files fail
   - Check network connection

### After Upload

1. **Review Results**:
   - Check success count matches expectations
   - Review failed uploads carefully
   - Download failed list for reference

2. **Fix Failed Uploads**:
   - Rename files correctly
   - Resize large files
   - Verify students exist in database
   - Re-upload corrected files

3. **Verify on Profile Pages**:
   - Spot-check student profiles
   - Confirm photos display correctly
   - Check a few random students

---

## 🔧 Troubleshooting

### "No files selected" error
**Cause**: No files were chosen
**Solution**: Select files before clicking upload

### All files show as errors
**Cause**: Filenames don't match pattern
**Solution**: Rename files to include roll numbers in correct format

### Upload stuck at 0%
**Cause**: Network issue or storage problem
**Solution**:
1. Check internet connection
2. Refresh page and try again
3. Contact IT support if persists

### "Permission denied" error
**Cause**: Insufficient permissions or storage not configured
**Solution**: Contact system administrator

### Photos not showing after upload
**Cause**: Cache issue or database delay
**Solution**:
1. Refresh the page (Ctrl+F5 / Cmd+Shift+R)
2. Clear browser cache
3. Wait 30 seconds and try again

---

## ❓ Frequently Asked Questions

**Q: Can I upload photos for students from different institutions?**
A: Yes, the system will match roll numbers across all institutions you have access to.

**Q: What happens to old photos when I replace them?**
A: They are permanently deleted from storage. Make sure you have backups if needed.

**Q: Can I undo an upload?**
A: No, uploads cannot be undone. You can only upload new photos to replace them.

**Q: How many files can I upload at once?**
A: Technically unlimited, but we recommend batches of 500 or fewer for best performance.

**Q: Can students upload their own photos?**
A: No, this feature is for administrators and staff only. Students cannot access bulk upload.

**Q: What if a roll number appears in multiple filenames?**
A: You'll see all duplicates and choose which version to upload using radio buttons.

**Q: Can I upload photos for students who haven't been created yet?**
A: No, students must exist in the database first. Use "Create Missing Profiles" if needed.

**Q: Will this update student records in any way?**
A: No, it only updates the photo. All other student information remains unchanged.

---

## 📞 Support

**For Technical Issues**:
- Contact: IT Support
- Email: support@jkkn.edu.in
- Phone: (Extension needed)

**For Training**:
- Request: Administrator Training Session
- Duration: 15-30 minutes
- Includes: Live demonstration and Q&A

---

## 🎓 Training Videos

*(To be added after implementation)*

1. Quick Start (5 minutes)
2. Handling Duplicates (3 minutes)
3. Troubleshooting Common Issues (7 minutes)
4. Best Practices (10 minutes)

---

## 📝 Version History

- **v1.0** (2025-01-23): Initial release
  - Basic bulk upload functionality
  - Roll number matching
  - Duplicate detection
  - Success/failure reporting
  - CSV export of failures

---

**Need Help?** Contact your system administrator or IT support team.
