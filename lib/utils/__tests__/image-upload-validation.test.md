# Unit Tests for Image Upload Validation Utilities

**Status**: Test documentation only (no testing framework configured yet)

**To implement**: Set up Jest/Vitest and convert these test cases to actual unit tests

---

## Test Suite: `extractRollNumberFromFilename()`

### Valid Cases

```typescript
// Test 1: Standard format with uppercase
expect(extractRollNumberFromFilename('DB22092.jpg')).toBe('DB22092');

// Test 2: Standard format with lowercase (should uppercase)
expect(extractRollNumberFromFilename('cs21001.png')).toBe('CS21001');

// Test 3: Mixed case
expect(extractRollNumberFromFilename('MeCh2023.gif')).toBe('MECH2023');

// Test 4: 2 letters + 2 digits (minimum)
expect(extractRollNumberFromFilename('AB12.jpg')).toBe('AB12');

// Test 5: 4 letters + 6 digits (maximum)
expect(extractRollNumberFromFilename('ABCD123456.webp')).toBe('ABCD123456');

// Test 6: Filename with prefix
expect(extractRollNumberFromFilename('Student_DB22092.jpg')).toBe('DB22092');

// Test 7: Filename with suffix
expect(extractRollNumberFromFilename('DB22092_photo.png')).toBe('DB22092');

// Test 8: Filename with spaces
expect(extractRollNumberFromFilename('Student DB22092 (1).jpg')).toBe('DB22092');

// Test 9: Multiple extensions
expect(extractRollNumberFromFilename('DB22092.backup.jpg')).toBe('DB22092');
```

### Invalid Cases

```typescript
// Test 10: No roll number
expect(extractRollNumberFromFilename('photo.jpg')).toBeNull();

// Test 11: Only letters
expect(extractRollNumberFromFilename('ABCD.jpg')).toBeNull();

// Test 12: Only numbers
expect(extractRollNumberFromFilename('123456.jpg')).toBeNull();

// Test 13: Too few letters (1 letter)
expect(extractRollNumberFromFilename('A22092.jpg')).toBeNull();

// Test 14: Too many letters (5 letters)
expect(extractRollNumberFromFilename('ABCDE22092.jpg')).toBeNull();

// Test 15: Too few digits (1 digit)
expect(extractRollNumberFromFilename('AB1.jpg')).toBeNull();

// Test 16: Too many digits (7 digits)
expect(extractRollNumberFromFilename('AB1234567.jpg')).toBeNull();

// Test 17: Special characters
expect(extractRollNumberFromFilename('DB-22092.jpg')).toBeNull();

// Test 18: Empty filename
expect(extractRollNumberFromFilename('')).toBeNull();
```

---

## Test Suite: `validateImageFile()`

### Valid Cases

```typescript
// Test 1: Valid JPEG file
const jpegFile = new File([''], 'test.jpg', { type: 'image/jpeg', size: 1024 * 1024 });
expect(validateImageFile(jpegFile)).toEqual({ isValid: true });

// Test 2: Valid PNG file
const pngFile = new File([''], 'test.png', { type: 'image/png', size: 2 * 1024 * 1024 });
expect(validateImageFile(pngFile)).toEqual({ isValid: true });

// Test 3: Valid GIF file
const gifFile = new File([''], 'test.gif', { type: 'image/gif', size: 500 * 1024 });
expect(validateImageFile(gifFile)).toEqual({ isValid: true });

// Test 4: Valid WebP file
const webpFile = new File([''], 'test.webp', { type: 'image/webp', size: 1024 * 1024 });
expect(validateImageFile(webpFile)).toEqual({ isValid: true });

// Test 5: File at max size (5MB)
const maxSizeFile = new File([''], 'test.jpg', { type: 'image/jpeg', size: 5 * 1024 * 1024 });
expect(validateImageFile(maxSizeFile)).toEqual({ isValid: true });
```

### Invalid Cases - File Type

```typescript
// Test 6: Invalid file type - PDF
const pdfFile = new File([''], 'test.pdf', { type: 'application/pdf', size: 1024 });
const result = validateImageFile(pdfFile);
expect(result.isValid).toBe(false);
expect(result.errorCode).toBe(ValidationErrorCode.INVALID_FILE_TYPE);
expect(result.error).toContain('Invalid file type');

// Test 7: Invalid file type - Video
const videoFile = new File([''], 'test.mp4', { type: 'video/mp4', size: 1024 });
expect(validateImageFile(videoFile).isValid).toBe(false);

// Test 8: Invalid file type - Text
const textFile = new File([''], 'test.txt', { type: 'text/plain', size: 1024 });
expect(validateImageFile(textFile).isValid).toBe(false);
```

### Invalid Cases - File Size

```typescript
// Test 9: File too large (6MB)
const largefile = new File([''], 'test.jpg', { type: 'image/jpeg', size: 6 * 1024 * 1024 });
const result = validateImageFile(largefile);
expect(result.isValid).toBe(false);
expect(result.errorCode).toBe(ValidationErrorCode.FILE_TOO_LARGE);
expect(result.error).toContain('exceeds 5MB limit');
expect(result.error).toContain('6.0MB');

// Test 10: File extremely large (50MB)
const hugeFile = new File([''], 'test.jpg', { type: 'image/jpeg', size: 50 * 1024 * 1024 });
const result2 = validateImageFile(hugeFile);
expect(result2.isValid).toBe(false);
expect(result2.error).toContain('50.0MB');
```

### Custom Max Size

```typescript
// Test 11: Custom max size - 2MB
const file = new File([''], 'test.jpg', { type: 'image/jpeg', size: 3 * 1024 * 1024 });
const result = validateImageFile(file, 2 * 1024 * 1024);
expect(result.isValid).toBe(false);
```

---

## Test Suite: `createValidationSummary()`

### Test Cases

```typescript
// Test 1: Empty array
const summary1 = createValidationSummary([]);
expect(summary1).toEqual({
  totalFiles: 0,
  validFiles: 0,
  warningFiles: 0,
  errorFiles: 0,
  selectedFiles: 0,
  duplicateGroups: 0,
  photosToReplace: 0,
});

// Test 2: All valid files
const files2 = [
  { validationStatus: 'valid', selected: true, isDuplicate: false, existingPhotoUrl: null },
  { validationStatus: 'valid', selected: true, isDuplicate: false, existingPhotoUrl: null },
] as ImageFilePreview[];

const summary2 = createValidationSummary(files2);
expect(summary2).toEqual({
  totalFiles: 2,
  validFiles: 2,
  warningFiles: 0,
  errorFiles: 0,
  selectedFiles: 2,
  duplicateGroups: 0,
  photosToReplace: 0,
});

// Test 3: Mixed validation statuses
const files3 = [
  { validationStatus: 'valid', selected: true, isDuplicate: false, existingPhotoUrl: null },
  { validationStatus: 'warning', selected: true, isDuplicate: false, existingPhotoUrl: 'url1' },
  { validationStatus: 'error', selected: false, isDuplicate: false, existingPhotoUrl: null },
] as ImageFilePreview[];

const summary3 = createValidationSummary(files3);
expect(summary3).toEqual({
  totalFiles: 3,
  validFiles: 1,
  warningFiles: 1,
  errorFiles: 1,
  selectedFiles: 2,
  duplicateGroups: 0,
  photosToReplace: 1,
});

// Test 4: With duplicates
const files4 = [
  { validationStatus: 'warning', selected: true, isDuplicate: true, duplicateGroupId: 'DB22092', existingPhotoUrl: null },
  { validationStatus: 'warning', selected: false, isDuplicate: true, duplicateGroupId: 'DB22092', existingPhotoUrl: null },
  { validationStatus: 'warning', selected: true, isDuplicate: true, duplicateGroupId: 'CS21001', existingPhotoUrl: null },
] as ImageFilePreview[];

const summary4 = createValidationSummary(files4);
expect(summary4.duplicateGroups).toBe(2); // DB22092 and CS21001
expect(summary4.selectedFiles).toBe(2);

// Test 5: Photos to replace
const files5 = [
  { validationStatus: 'valid', selected: true, isDuplicate: false, existingPhotoUrl: 'url1' },
  { validationStatus: 'valid', selected: true, isDuplicate: false, existingPhotoUrl: 'url2' },
  { validationStatus: 'valid', selected: false, isDuplicate: false, existingPhotoUrl: 'url3' },
] as ImageFilePreview[];

const summary5 = createValidationSummary(files5);
expect(summary5.photosToReplace).toBe(2); // Only selected files count
```

---

## Test Suite: `detectDuplicates()`

### Test Cases

```typescript
// Test 1: No duplicates
const files1 = [
  { filename: 'DB22092.jpg', rollNumber: 'DB22092', validationStatus: 'valid', selected: true },
  { filename: 'CS21001.jpg', rollNumber: 'CS21001', validationStatus: 'valid', selected: true },
] as ImageFilePreview[];

const result1 = detectDuplicates(files1);
expect(result1[0].isDuplicate).toBe(false);
expect(result1[1].isDuplicate).toBe(false);

// Test 2: Duplicate roll numbers (2 files)
const files2 = [
  { filename: 'DB22092_1.jpg', rollNumber: 'DB22092', validationStatus: 'valid', selected: true },
  { filename: 'DB22092_2.jpg', rollNumber: 'DB22092', validationStatus: 'valid', selected: true },
] as ImageFilePreview[];

const result2 = detectDuplicates(files2);
expect(result2[0].isDuplicate).toBe(true);
expect(result2[0].isSelectedDuplicate).toBe(true); // First is selected
expect(result2[0].duplicateGroupId).toBe('DB22092');
expect(result2[0].selected).toBe(true);
expect(result2[0].validationStatus).toBe('warning');

expect(result2[1].isDuplicate).toBe(true);
expect(result2[1].isSelectedDuplicate).toBe(false); // Second is not selected
expect(result2[1].selected).toBe(false);
expect(result2[1].validationStatus).toBe('warning');

// Test 3: Multiple duplicate groups
const files3 = [
  { filename: 'DB22092_1.jpg', rollNumber: 'DB22092', validationStatus: 'valid', selected: true },
  { filename: 'DB22092_2.jpg', rollNumber: 'DB22092', validationStatus: 'valid', selected: true },
  { filename: 'CS21001_1.jpg', rollNumber: 'CS21001', validationStatus: 'valid', selected: true },
  { filename: 'CS21001_2.jpg', rollNumber: 'CS21001', validationStatus: 'valid', selected: true },
] as ImageFilePreview[];

const result3 = detectDuplicates(files3);
// DB22092 group
expect(result3[0].duplicateGroupId).toBe('DB22092');
expect(result3[1].duplicateGroupId).toBe('DB22092');
// CS21001 group
expect(result3[2].duplicateGroupId).toBe('CS21001');
expect(result3[3].duplicateGroupId).toBe('CS21001');

// Test 4: Files without roll numbers (should not be marked as duplicates)
const files4 = [
  { filename: 'photo1.jpg', rollNumber: null, validationStatus: 'error', selected: false },
  { filename: 'photo2.jpg', rollNumber: null, validationStatus: 'error', selected: false },
] as ImageFilePreview[];

const result4 = detectDuplicates(files4);
expect(result4[0].isDuplicate).toBe(false);
expect(result4[1].isDuplicate).toBe(false);

// Test 5: Triple duplicates
const files5 = [
  { filename: 'DB22092_1.jpg', rollNumber: 'DB22092', validationStatus: 'valid', selected: true },
  { filename: 'DB22092_2.jpg', rollNumber: 'DB22092', validationStatus: 'valid', selected: true },
  { filename: 'DB22092_3.jpg', rollNumber: 'DB22092', validationStatus: 'valid', selected: true },
] as ImageFilePreview[];

const result5 = detectDuplicates(files5);
expect(result5[0].isSelectedDuplicate).toBe(true);
expect(result5[0].selected).toBe(true);
expect(result5[1].isSelectedDuplicate).toBe(false);
expect(result5[1].selected).toBe(false);
expect(result5[2].isSelectedDuplicate).toBe(false);
expect(result5[2].selected).toBe(false);
```

---

## Test Suite: `filterFilesByStatus()`

### Test Cases

```typescript
const files = [
  { validationStatus: 'valid' },
  { validationStatus: 'valid' },
  { validationStatus: 'warning' },
  { validationStatus: 'error' },
] as ImageFilePreview[];

// Test 1: Filter 'all'
expect(filterFilesByStatus(files, 'all')).toHaveLength(4);

// Test 2: Filter 'valid'
expect(filterFilesByStatus(files, 'valid')).toHaveLength(2);

// Test 3: Filter 'warning'
expect(filterFilesByStatus(files, 'warning')).toHaveLength(1);

// Test 4: Filter 'error'
expect(filterFilesByStatus(files, 'error')).toHaveLength(1);

// Test 5: Empty array
expect(filterFilesByStatus([], 'valid')).toHaveLength(0);
```

---

## Test Suite: `getFileErrorMessage()`

### Test Cases

```typescript
// Test 1: File validation error
const file1 = {
  fileValidationError: 'Invalid file type',
  extractionError: 'Could not extract roll number',
  validationStatus: 'error',
} as ImageFilePreview;
expect(getFileErrorMessage(file1)).toBe('Invalid file type');

// Test 2: Extraction error (no file validation error)
const file2 = {
  extractionError: 'Could not extract roll number',
  validationStatus: 'error',
} as ImageFilePreview;
expect(getFileErrorMessage(file2)).toBe('Could not extract roll number');

// Test 3: Generic error (no specific errors)
const file3 = {
  validationStatus: 'error',
} as ImageFilePreview;
expect(getFileErrorMessage(file3)).toBe('Validation failed');

// Test 4: No error
const file4 = {
  validationStatus: 'valid',
} as ImageFilePreview;
expect(getFileErrorMessage(file4)).toBeUndefined();
```

---

## Test Suite: `getFileWarningMessage()`

### Test Cases

```typescript
// Test 1: Duplicate not selected
const file1 = {
  isDuplicate: true,
  isSelectedDuplicate: false,
} as ImageFilePreview;
expect(getFileWarningMessage(file1)).toBe('Duplicate roll number (not selected)');

// Test 2: Duplicate selected
const file2 = {
  isDuplicate: true,
  isSelectedDuplicate: true,
} as ImageFilePreview;
expect(getFileWarningMessage(file2)).toBe('Duplicate roll number (selected for upload)');

// Test 3: Existing photo
const file3 = {
  isDuplicate: false,
  existingPhotoUrl: 'https://example.com/photo.jpg',
} as ImageFilePreview;
expect(getFileWarningMessage(file3)).toBe('Will replace existing photo');

// Test 4: No warning
const file4 = {
  isDuplicate: false,
  existingPhotoUrl: null,
} as ImageFilePreview;
expect(getFileWarningMessage(file4)).toBeUndefined();
```

---

## Test Suite: `isBulkUploadReady()`

### Test Cases

```typescript
// Test 1: Ready - valid files selected
const files1 = [
  { selected: true, validationStatus: 'valid', learnerId: '123' },
  { selected: true, validationStatus: 'valid', learnerId: '456' },
] as ImageFilePreview[];
expect(isBulkUploadReady(files1)).toBe(true);

// Test 2: Not ready - no files selected
const files2 = [
  { selected: false, validationStatus: 'valid', learnerId: '123' },
] as ImageFilePreview[];
expect(isBulkUploadReady(files2)).toBe(false);

// Test 3: Not ready - selected files have errors
const files3 = [
  { selected: true, validationStatus: 'error', learnerId: null },
] as ImageFilePreview[];
expect(isBulkUploadReady(files3)).toBe(false);

// Test 4: Not ready - selected files missing learner IDs
const files4 = [
  { selected: true, validationStatus: 'valid', learnerId: null },
] as ImageFilePreview[];
expect(isBulkUploadReady(files4)).toBe(false);

// Test 5: Ready - warnings are allowed
const files5 = [
  { selected: true, validationStatus: 'warning', learnerId: '123' },
] as ImageFilePreview[];
expect(isBulkUploadReady(files5)).toBe(true);

// Test 6: Empty array
expect(isBulkUploadReady([])).toBe(false);
```

---

## Test Suite: `generateFailedUploadsCSV()`

### Test Cases

```typescript
// Test 1: Basic CSV generation
const failed1 = [
  { filename: 'DB22092.jpg', rollNumber: 'DB22092', error: 'Upload failed' },
  { filename: 'CS21001.png', rollNumber: 'CS21001', error: 'Network error' },
];
const csv1 = generateFailedUploadsCSV(failed1);
expect(csv1).toContain('Filename,Roll Number,Error');
expect(csv1).toContain('DB22092.jpg,DB22092,"Upload failed"');
expect(csv1).toContain('CS21001.png,CS21001,"Network error"');

// Test 2: Missing roll number
const failed2 = [
  { filename: 'photo.jpg', rollNumber: undefined, error: 'No roll number' },
];
const csv2 = generateFailedUploadsCSV(failed2);
expect(csv2).toContain('photo.jpg,N/A,"No roll number"');

// Test 3: Error message with quotes (escaping)
const failed3 = [
  { filename: 'test.jpg', rollNumber: 'DB22092', error: 'Error: "File not found"' },
];
const csv3 = generateFailedUploadsCSV(failed3);
expect(csv3).toContain('"Error: ""File not found"""'); // Quotes should be escaped

// Test 4: Empty array
const csv4 = generateFailedUploadsCSV([]);
expect(csv4).toBe('Filename,Roll Number,Error');
```

---

## Test Suite: `downloadCSV()`

**Note**: This function requires browser DOM APIs and is difficult to unit test.
Should be tested manually or with integration tests using a browser environment.

### Manual Test Checklist

- [ ] Downloads file with correct filename
- [ ] Downloaded file contains correct CSV data
- [ ] File opens correctly in Excel/CSV viewers
- [ ] Temporary blob URL is cleaned up
- [ ] Temporary anchor element is removed from DOM

---

## Setup Instructions

When ready to implement these tests:

1. **Install testing framework**:
   ```bash
   npm install --save-dev vitest @testing-library/react @testing-library/jest-dom happy-dom
   ```

2. **Create vitest.config.ts**:
   ```typescript
   import { defineConfig } from 'vitest/config';
   import react from '@vitejs/plugin-react';
   import path from 'path';

   export default defineConfig({
     plugins: [react()],
     test: {
       environment: 'happy-dom',
       globals: true,
       setupFiles: ['./tests/setup.ts'],
     },
     resolve: {
       alias: {
         '@': path.resolve(__dirname, './'),
       },
     },
   });
   ```

3. **Create actual test file**:
   ```bash
   lib/utils/__tests__/image-upload-validation.test.ts
   ```

4. **Add test script to package.json**:
   ```json
   "test": "vitest",
   "test:ui": "vitest --ui",
   "test:coverage": "vitest --coverage"
   ```

5. **Run tests**:
   ```bash
   npm test
   ```
