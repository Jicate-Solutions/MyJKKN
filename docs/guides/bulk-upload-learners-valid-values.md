# Bulk Upload Learners - Valid Dropdown Values

## 📋 Quick Reference Guide for Excel Template

This document lists all **VALID VALUES** for dropdown fields in the bulk upload template. Use these exact values to avoid validation errors.

---

## ✅ REQUIRED FIELDS - Dropdown Values

### 1. Gender* (Required)
**Valid Values:** (case-insensitive)
- `MALE`
- `FEMALE`
- `OTHER`

**Example:** `MALE`, `male`, `Male` (all accepted)

---

### 2. Religion* (Required)
**Valid Values:** (case-insensitive)
- `HINDU`
- `CHRISTIAN`
- `MUSLIM`
- `SIKH`
- `BUDDHIST`
- `JAIN`
- `OTHERS`

**Example:** `HINDU`, `hindu`, `Hindu` (all accepted)

---

### 3. Community* (Required)
**Valid Values:** (exact match required)
- `OC` - Open Category
- `BC` - Backward Class
- `BCM`
- `MBC` - Most Backward Class
- `DNC`
- `BC-CC`
- `SC` - Scheduled Caste
- `ST` - Scheduled Tribe
- `SBC`
- `SC (A)`

**Example:** `BC`, `MBC`, `SC`

---

### 4. Entry Type* (Required)
**Valid Values:** (case-insensitive)
- `REGULAR` - Regular admission (first year students)
- `LATERAL` - Lateral entry (direct second/third year)
- `TRANSFER` - Transfer from another institution

❌ **INVALID:** `FIRST YEAR`, `Direct Entry`, `Normal`
✅ **USE:** `REGULAR`

**Example:** `REGULAR`, `regular`, `Regular` (all accepted)

---

### 5. Accommodation Type* (Required)
**Valid Values:** (case-insensitive)
- `HOSTEL` - Living in college hostel
- `DAY SCHOLAR` - Commuting daily
- `HOME` - Living at home nearby

**Example:** `HOSTEL`, `hostel`, `Hostel` (all accepted)

---

## 📝 OPTIONAL FIELDS - Dropdown Values

### 6. Blood Group (Optional)
**Valid Values:** (exact match required)
- `A+`, `A-`
- `B+`, `B-`
- `AB+`, `AB-`
- `O+`, `O-`
- `A1+`, `A1B`

**Example:** `O+`, `AB-`, `A1+`

---

### 7. Hostel Type (Optional)
**Valid Values:** (case-insensitive)
- `AC HOSTEL` - Air-conditioned hostel
- `NON-AC HOSTEL` - Non air-conditioned hostel

❌ **INVALID:** `Boys Hostel`, `Girls Hostel A`
✅ **USE:** `AC HOSTEL` or `NON-AC HOSTEL`

**Example:** `AC HOSTEL`, `ac hostel`, `Ac Hostel` (all accepted)

---

### 8. Food Type (Optional)
**Valid Values:** (case-insensitive)
- `VEG` - Vegetarian
- `NON-VEG` - Non-Vegetarian
- `VEGAN` - Vegan

**Example:** `VEG`, `veg`, `Veg` (all accepted)

---

### 9. Quota (Optional)
**Valid Values:** (case-insensitive)
- `GOVERNMENT` - Government quota
- `MANAGEMENT` - Management quota

**Example:** `MANAGEMENT`, `management`, `Management` (all accepted)

---

## 🔄 Boolean Fields (TRUE/FALSE)

These fields accept flexible boolean values:

### First Graduate* (Required)
**Valid Values:**
- `TRUE`, `YES`, `1` → Means YES (first graduate in family)
- `FALSE`, `NO`, `0` → Means NO (not first graduate)

**Example:** `TRUE`, `true`, `YES`, `yes`

---

### Counseling Applied (Optional)
**Valid Values:**
- `TRUE`, `YES`, `1` → Applied for counseling
- `FALSE`, `NO`, `0` → Did not apply

---

### Bus Required (Optional)
**Valid Values:**
- `TRUE`, `YES`, `1` → Bus transport needed
- `FALSE`, `NO`, `0` → No bus transport

---

## 📝 Text Fields (No Validation)

These fields accept any text value:
- Caste
- Category
- Reference Type
- Reference Name
- All name fields
- All address fields
- All ID/number fields

## 📚 Previous Education Fields (All Optional)

**Note:** As of 2025-12-29, all previous education fields are now OPTIONAL.

### Last School (Optional)
**Format:** Any text value
**Example:** `St. Mary's High School`, `Government School`

### Board of Study (Optional)
**Format:** Any text value
**Example:** `CBSE`, `State Board`, `ICSE`, `IB`

### 10th Marks (Optional)
**Format:** JSON string
**Example:** `{"overall": "95", "maths": "98", "science": "96", "english": "92"}`

### 12th Marks (Optional)
**Format:** JSON string
**Example:** `{"overall": "92", "physics": "95", "chemistry": "94", "maths": "98"}`

💡 **Tip:** Leave these fields blank if previous education details are not available.

---

## 💡 Tips for Success

### Case Sensitivity
✅ **All dropdown validations are case-insensitive**
- `MALE` = `male` = `Male`
- `HINDU` = `hindu` = `Hindu`
- `REGULAR` = `regular` = `Regular`

### Exact Spelling Required
❌ **WRONG:** `First Year`, `Male/Female`, `Day Scholar/Hostel`
✅ **CORRECT:** `REGULAR`, `MALE` or `FEMALE`, `DAY SCHOLAR` or `HOSTEL`

### Common Mistakes

| ❌ WRONG | ✅ CORRECT | Field |
|----------|------------|-------|
| `FIRST YEAR` | `REGULAR` | Entry Type |
| `Boys Hostel` | `AC HOSTEL` or `NON-AC HOSTEL` | Hostel Type |
| `Male/Female` | `MALE` or `FEMALE` | Gender |
| `Hindu/Christian` | `HINDU` or `CHRISTIAN` | Religion |
| `Yes/No` | `TRUE` or `FALSE` | Boolean fields |
| `Day Scholar/Hostel` | `DAY SCHOLAR` or `HOSTEL` | Accommodation |

---

## 📊 Template Example with Valid Values

```excel
* Gender: MALE
* Religion: HINDU
* Community: BC
* Entry Type: REGULAR
* Accommodation Type: HOSTEL
* First Graduate: TRUE

Hostel Type: AC HOSTEL (optional)
Food Type: VEG (optional)
Blood Group: O+ (optional)
Quota: MANAGEMENT (optional)
```

---

## 🚨 Validation Error Messages

If you see these errors, check the values against this guide:

### Entry Type Error
```
❌ Invalid Entry Type: "FIRST YEAR". Valid options: REGULAR, LATERAL, TRANSFER
```
**Fix:** Change `FIRST YEAR` to `REGULAR`

### Hostel Type Error
```
❌ Invalid Hostel Type: "Boys Hostel A". Valid options: AC HOSTEL, NON-AC HOSTEL
```
**Fix:** Change `Boys Hostel A` to `AC HOSTEL`

### Gender Error
```
❌ Invalid Gender: "M". Valid options: MALE, FEMALE, OTHER
```
**Fix:** Change `M` to `MALE`

---

## 📞 Need Help?

If you're still getting validation errors after checking this guide:
1. Download a fresh template with correct example data
2. Copy the exact values from the example row
3. Ensure there are no extra spaces before/after values
4. Check for typos in field names

---

**Last Updated:** 2025-12-29
**Version:** 1.0
**Related:** Bulk Upload Learners Template
