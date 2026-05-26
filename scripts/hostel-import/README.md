# JKKN Dental hostel inventory import

One-off scripts that ingest the Director's hostel-rooms Excel and emit a
SQL migration for `hostel_blocks`, `hostel_rooms`, `hostel_residents`.

## Source

`/Users/omm/Downloads/vnd.openxmlformats-officedocument.spreadsheetml.sheet&rendition=1.xlsx`

Three sheets: A BLOCK (54 rooms), B BLOCK (38 rooms), C BLOCK (53 rooms +
185 named girl residents across BDS 1-4 and PharmD 1-6).

## Pipeline

```bash
# 1. Parse Excel → parsed.json (3 blocks, 145 rooms, 185 named residents)
python3 scripts/hostel-import/parse_excel.py

# 2. Match Excel names against learners_profiles → matches.json
#    (Reads ~/.supabase/access-token; queries dental + pharmacy institutions.)
python3 scripts/hostel-import/match_names.py

# 3. Generate the SQL migration
python3 scripts/hostel-import/build_migration.py
```

## Match classification

- **MATCHED**: high confidence; auto-inserted as a `hostel_residents` row.
- **NEAR_MATCH**: ambiguous (ties, low-confidence). Surfaced in PR body for
  Director review; **not** auto-inserted.
- **UNMATCHED**: no candidate. Surfaced in PR body.

## Scoring

Token-overlap with several South-Indian-name-aware bumps:
- Token-jaccard with adjacent-token concatenation (handles `ADHI LAKSHMI`
  vs `ADHILAKSHMI`).
- All-of-smaller-in-larger boost (handles `PAVITHRA R` vs `R PAVITHRA R`).
- 2-char initial expansion (`VI` → `{V,I}`) so `VI AYESHA` matches
  `AYESHA V.I`.
- Penalty when both sides expose initials but the initial-letter sets
  don't intersect (catches "same first name, different student" trap).

## Files

| File | Purpose |
|------|---------|
| `parse_excel.py` | Excel → normalized JSON |
| `match_names.py` | Name match against learners_profiles |
| `build_migration.py` | JSON → SQL migration |
| `.gitignore` | Excludes generated artifacts |

Generated artifacts (`parsed.json`, `matches.json`,
`learner_to_profile.json`, `matched_learner_ids.txt`) are intentionally
gitignored — they're regenerable and large.
