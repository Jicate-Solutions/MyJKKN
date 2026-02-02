# School Data Classification Guide

## Overview

The School Data Classification Script automatically populates `school_type` and `school_district` fields in the `learners_profiles` table based on intelligent pattern recognition from school names.

---

## Quick Start

### 1. Preview Classifications (Recommended First Step)
```bash
npx tsx scripts/classify-school-data.ts --dry-run
```

This shows you what will be classified **without making any changes**.

### 2. Apply Classifications
```bash
npx tsx scripts/classify-school-data.ts
```

This applies the classifications to your database.

### 3. Get Help
```bash
npx tsx scripts/classify-school-data.ts --help
```

---

## How It Works

### School Type Classification

The script uses pattern matching to classify schools:

| School Type | Patterns Recognized | Examples |
|------------|-------------------|----------|
| **Government** | GHSS, GBHSS, GGHSS, G(B)HSS, GOVT, MODEL S | "GHSS", "G(B)HSS", "GOVT MODEL" |
| **Private** | MATRIC, INTERNATIONAL, PUBLIC SCHOOL, VIDYALAYA | "Sri Vidyalaya", "ABC Matric" |
| **CBSE** | CBSE, KENDRIYA VIDYALAYA, KV | "XYZ CBSE School" |
| **ICSE** | ICSE, ANGLO | "ABC ICSE School" |
| **Aided** | AIDED, ST., MUNICIPAL | "St. Mary's Aided" |
| **State Board** | STATE BOARD | "XYZ State Board School" |

### District Extraction

The script attempts to extract district names from school names by:
1. Matching keywords (e.g., "NAMAKKAL", "SALEM")
2. Looking for full district names (e.g., "Coimbatore", "Erode")

**Supported Districts:** All 37 Tamil Nadu districts

### Confidence Levels

Each classification has a confidence level:

- 🟢 **High**: Direct pattern match (e.g., "GHSS" → Government)
- 🟡 **Medium**: Indirect inference (e.g., "HSS" → likely Government)
- 🔴 **Low**: Generic keyword match (e.g., "School" → might be Private)

---

## Sample Output

```
📊 Found 387 unique schools

📈 Classification Statistics:

Total Schools:        387
Classified:           301 (77.8%)
With District:        156 (40.3%)
Unknown:              86 (22.2%)

📊 By School Type:
  government      198 schools
  private          89 schools
  cbse             12 schools
  aided             2 schools

🎯 By Confidence Level:
  High:   245 schools
  Medium:  56 schools
  Low:      0 schools

📋 Sample Classifications (Top 20 schools by student count):

School Name                              Students           Type            District  Conf.
────────────────────────────────────────────────────────────────────────────────────────────
UNKNOWN SCHOOL                               2136        unknown                 N/A    L
                                              554        unknown                 N/A    L
GHSS                                          463     government                 N/A    H
GBHSS                                         164     government                 N/A    H
GGHSS                                         108     government                 N/A    H
G(B)HSS                                        86     government                 N/A    H
JKK RANGAMMAL (G)HSS                          56     government            Namakkal    H
KRISHNAVENI GGHSS                             36     government                 N/A    H
```

---

## Classification Rules

### Government Schools

**High Confidence Patterns:**
- `GHSS` - Government Higher Secondary School
- `GBHSS` - Government Boys Higher Secondary School
- `GGHSS` - Government Girls Higher Secondary School
- `G(B)HSS` - Government (Boys) Higher Secondary School
- `G(G)HSS` - Government (Girls) Higher Secondary School
- `GOVT` or `GOVERNMENT`
- `G MODEL` - Government Model School
- `PUMS` - Panchayat Union Middle School

**Medium Confidence:**
- Generic `HSS` - Most are government-run
- `MODEL S` - Usually government

### Private Schools

**High Confidence:**
- Contains `MATRIC` or `MATRICULATION`
- Contains `INTERNATIONAL`
- Contains `PUBLIC SCHOOL`
- Contains `VIDYALAYA`
- Contains `CONVENT`
- Contains `ACADEMY`
- Starts with `SRI` or `SHRI`

### CBSE/ICSE

**High Confidence:**
- Contains `CBSE` or `ICSE`
- `KENDRIYA VIDYALAYA` (KV)
- `CENTRAL SCHOOL`

---

## Expected Results

Based on your data (4,522 learners):

### Estimated Classification Rate
- **70-80%** of schools will be classified (with varying confidence)
- **30-40%** may have district information extracted
- **Unknown schools** and blank entries will remain unclassified

### Known Limitations

1. **"UNKNOWN SCHOOL"** (2,136 students) - Cannot be classified
2. **Empty school names** (554 students) - Cannot be classified
3. **Abbreviated names** (GHSS, GBHSS) - Classified but no district
4. **Schools without location keywords** - Type classified, but district will be N/A

---

## After Running the Script

### 1. Verify Results
Check the database to see populated data:
```sql
SELECT
  school_type,
  COUNT(*) as count
FROM learners_profiles
WHERE school_type IS NOT NULL
GROUP BY school_type;
```

### 2. View Analytics Dashboard
Go to: `/learners/analytics` → **School Feeders** tab

You should now see:
- ✅ Type column showing color-coded badges
- ✅ District column showing locations (where extracted)
- ⚠️ Some "N/A" for districts that couldn't be extracted

### 3. Manual Cleanup (Optional)

For schools that couldn't be auto-classified, you can manually update:

```sql
-- Update specific schools
UPDATE learners_profiles
SET school_type = 'government',
    school_district = 'Namakkal'
WHERE last_school = 'GHSS';

-- Update schools with specific patterns
UPDATE learners_profiles
SET school_type = 'government'
WHERE last_school LIKE '%HSS%'
  AND school_type IS NULL;
```

---

## Troubleshooting

### Issue: "Missing environment variables"
**Solution:** Ensure `.env` or `.env.local` has:
```env
NEXT_PUBLIC_SUPABASE_URL=your_url
SUPABASE_SERVICE_ROLE_KEY=your_key
```

### Issue: "Permission denied"
**Solution:** The service role key needs database write access.

### Issue: Low classification rate
**Solution:**
1. Check the sample output to see why schools aren't matching
2. Add custom patterns to `SCHOOL_TYPE_PATTERNS` in the script
3. Add district keywords to `SCHOOL_DISTRICT_KEYWORDS`

---

## Customization

### Add Custom Patterns

Edit `scripts/classify-school-data.ts`:

```typescript
const SCHOOL_TYPE_PATTERNS = {
  government: [
    /^G\s*\(/i,
    // Add your custom patterns here
    /YOUR_PATTERN/i,
  ],
  // ...
};
```

### Add District Mappings

```typescript
const SCHOOL_DISTRICT_KEYWORDS: Record<string, string> = {
  'NAMAKKAL': 'Namakkal',
  // Add your custom mappings
  'YOUR_KEYWORD': 'Your District',
};
```

---

## Best Practices

1. **Always run `--dry-run` first** to preview changes
2. **Backup your database** before applying (optional but recommended)
3. **Review the sample output** to check accuracy
4. **Manually update critical schools** after automated classification
5. **Re-run periodically** as new students are added

---

## Next Steps

After classification:

1. ✅ Check the dashboard: `/learners/analytics` → School Feeders
2. ✅ Verify data accuracy in the "All Feeder Schools" table
3. ✅ Optionally improve classification by adding custom patterns
4. ✅ Document any manual corrections for future reference

---

## Support

If you encounter issues:
1. Check the console output for error messages
2. Verify database connection and permissions
3. Review the classification patterns for your specific school names
4. Manually update edge cases via SQL or create custom patterns

---

**Happy Classifying! 🎓**
