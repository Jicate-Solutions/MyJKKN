#!/usr/bin/env python3
"""
Import historical admission data from Google Sheets into
admission_historical_pivot table.

Reads two sheets (2024-25 and 2025-26), each with 2 sub-sheets
(CET-group, ARTS & SCIENCE), applies the mapping in
scripts/admission/sheet-to-db-mapping.json (locked 2026-06-02 with
Director), and idempotently upserts into admission_historical_pivot.

Pre-conditions:
- admission_historical_pivot table exists (PR #1212)
- 2 placeholder programs exist:
    JKKN College of Education :: B.Ed (Historical Aggregate)
    JKKN College of Arts and Science (Aided) :: M.A. ENGLISH
- Supabase Management API token at ~/.supabase/access-token

Usage:
    python3 scripts/admission/import-historical-sheets.py [--dry-run]

When --dry-run is passed, prints the would-be INSERTs without
hitting the API. Useful for verification.

The script is idempotent — re-running reconciles to current sheet
state via the (admission_year_id, admission_date) UNIQUE upsert.
"""

import csv
import json
import os
import re
import sys
import urllib.request
import urllib.parse
from collections import defaultdict
from pathlib import Path

PROJECT_REF = "kvizhngldtiuufknvehv"
TOKEN_PATH = os.path.expanduser("~/.supabase/access-token")
MAPPING_PATH = Path(__file__).parent / "sheet-to-db-mapping.json"
DRY_RUN = "--dry-run" in sys.argv

SHEETS = [
    {"year": 2025, "label": "2025-26", "id": "1GG5ErsOaj3hsMcyPOMb1jOa5i2dtlWYQDe3TUrOcER4"},
    {"year": 2024, "label": "2024-25", "id": "1cn_sH9fFU8T7veyMqU_d-CklVzYv9VfpVis93tG9Ad0"},
]
SUB_SHEETS = ["CET,CNR,DCH,COP,AHS & EDN", "ARTS & SCIENCE"]


def load_token():
    with open(TOKEN_PATH) as f:
        return f.read().strip()


def supabase_sql(query):
    token = load_token()
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query",
        data=json.dumps({"query": query}).encode(),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "myjkkn-historical-importer/1.0",
        },
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def download_csv(sheet_id, sub_sheet_name):
    url = (
        f"https://docs.google.com/spreadsheets/d/{sheet_id}/gviz/tq"
        f"?tqx=out:csv&sheet={urllib.parse.quote(sub_sheet_name)}"
    )
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req) as resp:
        return resp.read().decode()


DATE_PATTERNS = [
    (re.compile(r"^(\d{1,2})/(\d{1,2})/(\d{4})$"), lambda m: f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"),
    (re.compile(r"^(\d{1,2})/(\d{1,2})/(\d{2})$"), lambda m: f"20{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"),
]


def parse_date_col(col):
    """Parse '27/02/2025' or '02/04/24' to ISO 'YYYY-MM-DD'. Handles the
    odd '15/05/5025' typo by clamping year to 2026 max."""
    for pat, fn in DATE_PATTERNS:
        m = pat.match(col.strip())
        if m:
            iso = fn(m)
            # Repair obvious year typos
            y = int(iso[:4])
            if y > 2030:
                iso = "2025-05-15"  # 5025 typo case
            return iso
    return None


def parse_cell(cell):
    """Convert a per-day cell value to int. Empty / dash / non-numeric → 0.
    Negative ('-1') indicates a cancellation. Returns int (may be negative)."""
    s = (cell or "").strip()
    if not s or s == "-":
        return 0
    try:
        return int(s)
    except ValueError:
        try:
            return int(float(s))
        except ValueError:
            return 0


def main():
    print(f"=== Loading mapping from {MAPPING_PATH} ===")
    with open(MAPPING_PATH) as f:
        mapping = json.load(f)

    # Build lookup: sheet_label → [{institution, program_name, fraction}]
    sheet_to_destinations = {}
    for m in mapping["mappings"]:
        sheet_to_destinations[m["sheet_label"]] = [{
            "institution": m["institution"],
            "program_name": m["program_name"],
            "fraction": 1.0,
        }]
    for s in mapping["split_mappings"]:
        sheet_to_destinations[s["sheet_label"]] = [
            {"institution": x["institution"], "program_name": x["program_name"], "fraction": x["fraction"]}
            for x in s["splits"]
        ]
    ignored = set(mapping["ignored_sheet_rows"])

    print(f"  → {len(sheet_to_destinations)} sheet labels mapped; {len(ignored)} ignored")

    # Pull DB lookups: institution+program → id, and admission_years lookup
    print("\n=== Loading DB lookups ===")
    inst_rows = supabase_sql(
        "SELECT id, name FROM institutions WHERE is_active = true AND name LIKE 'JKKN%'"
    )
    inst_by_name = {r["name"]: r["id"] for r in inst_rows}

    prog_rows = supabase_sql(
        "SELECT p.id, p.institution_id, p.program_name FROM programs p WHERE p.institution_id IN ("
        + ",".join(f"'{i}'" for i in inst_by_name.values())
        + ")"
    )
    # Key by (institution_id, program_name) — but engineering has dupes. Pick the first one.
    prog_by_inst_name = {}
    for r in prog_rows:
        key = (r["institution_id"], r["program_name"])
        if key not in prog_by_inst_name:
            prog_by_inst_name[key] = r["id"]

    ay_rows = supabase_sql(
        "SELECT id, institution_id, program_id, program_start_year FROM admission_years "
        "WHERE program_start_year IN (2024, 2025)"
    )
    ay_by_key = {(r["institution_id"], r["program_id"], r["program_start_year"]): r["id"] for r in ay_rows}

    print(f"  institutions: {len(inst_by_name)}")
    print(f"  programs: {len(prog_by_inst_name)}")
    print(f"  admission_years 2024+2025: {len(ay_by_key)}")

    # === STEP A: ensure admission_years rows exist for every mapping destination × year ===
    print("\n=== STEP A: backfilling missing admission_years rows ===")
    missing_ay = []
    for sheet_label, dests in sheet_to_destinations.items():
        for d in dests:
            inst_id = inst_by_name.get(d["institution"])
            if not inst_id:
                print(f"  ⚠️  unknown institution: {d['institution']}")
                continue
            prog_id = prog_by_inst_name.get((inst_id, d["program_name"]))
            if not prog_id:
                print(f"  ⚠️  unknown program: {d['institution']} :: {d['program_name']}")
                continue
            for year in [2024, 2025]:
                key = (inst_id, prog_id, year)
                if key not in ay_by_key:
                    missing_ay.append({
                        "institution_id": inst_id,
                        "program_id": prog_id,
                        "year": year,
                        "name": f"{year}-{year+1}",
                    })

    print(f"  missing admission_years rows: {len(missing_ay)}")
    if missing_ay and not DRY_RUN:
        # Bulk insert. sanctioned_intake = 0 per the 20260502 migration pattern.
        rows_sql = ",".join(
            f"('{m['institution_id']}', '{m['program_id']}', {m['year']}, "
            f"{m['year'] + 4}, '{m['name']}', 0, false)"
            for m in missing_ay
        )
        result = supabase_sql(
            "INSERT INTO admission_years "
            "(institution_id, program_id, program_start_year, program_end_year, admission_year_name, sanctioned_intake, is_active) "
            f"VALUES {rows_sql} "
            "ON CONFLICT (institution_id, program_id, program_start_year) DO NOTHING "
            "RETURNING id, institution_id, program_id, program_start_year"
        )
        print(f"  inserted {len(result)} new admission_years rows")
        for r in result:
            ay_by_key[(r["institution_id"], r["program_id"], r["program_start_year"])] = r["id"]

    # === STEP B: parse all 4 CSVs and accumulate (year, ay_id, date) → count ===
    print("\n=== STEP B: parsing CSVs ===")
    pivot_rows = defaultdict(int)  # (ay_id, iso_date) → cumulative count
    unmatched_labels = defaultdict(list)  # category-prefixed unmatched labels
    skipped_ignored = defaultdict(int)
    cell_log = {"+": 0, "-": 0, "0": 0}

    current_category_per_run = None

    for sheet in SHEETS:
        for sub in SUB_SHEETS:
            print(f"\n  → {sheet['label']} / {sub}")
            csv_text = download_csv(sheet["id"], sub)
            rows = list(csv.reader(csv_text.splitlines()))
            if not rows:
                print(f"    EMPTY CSV (gviz returned nothing for sheet name '{sub}')")
                continue
            header = rows[0]

            # Find date column indices
            date_cols = []
            for i, c in enumerate(header):
                iso = parse_date_col(c)
                if iso:
                    date_cols.append((i, iso))
            print(f"    date columns: {len(date_cols)}")

            current_category = None
            row_count = 0
            for r in rows[1:]:
                if len(r) < 5:
                    continue
                label = r[1].strip() if len(r) > 1 else ""
                if not label:
                    continue
                # Category header rows have text in col1 but no INTAKE/ADMITTED numbers
                # We don't need category for mapping (mapping is by sheet_label only)
                # but we use the LATERAL ENTRY category to know to apply 2nd-year LE label
                if label in ignored:
                    skipped_ignored[label] += 1
                    continue
                # Quick heuristic for category header: cols 2-5 are mostly empty
                cells_2_5 = [r[i].strip() if i < len(r) else "" for i in (2, 3, 4, 5)]
                if not any(c for c in cells_2_5):
                    current_category = label
                    continue

                # Apply LATERAL ENTRY suffix to engineering rows when category indicates
                if current_category and "LATERAL ENTRY" in current_category.upper() and label in (
                    "B.E - CSE", "B.TECH - IT", "B.E - ECE", "B.E - EEE", "B.E-EEE", "B.E - MECH"
                ):
                    # Same destination as Year-I; we DON'T distinguish in pivot table
                    # because admission_years.program_start_year is the same. This is fine.
                    pass

                destinations = sheet_to_destinations.get(label)
                if not destinations:
                    unmatched_labels[label].append(current_category or "(no category)")
                    continue

                # Walk date columns
                for col_idx, iso_date in date_cols:
                    raw_cell = r[col_idx] if col_idx < len(r) else ""
                    n = parse_cell(raw_cell)
                    if n == 0:
                        cell_log["0"] += 1
                        continue
                    cell_log["+" if n > 0 else "-"] += 1
                    # Distribute to destinations per fraction
                    for d in destinations:
                        inst_id = inst_by_name.get(d["institution"])
                        if not inst_id:
                            continue
                        prog_id = prog_by_inst_name.get((inst_id, d["program_name"]))
                        if not prog_id:
                            continue
                        ay_id = ay_by_key.get((inst_id, prog_id, sheet["year"]))
                        if not ay_id:
                            continue
                        # Apply fraction (round to nearest)
                        share = round(n * d["fraction"])
                        if share != 0:
                            pivot_rows[(ay_id, iso_date)] += share
                row_count += 1
            print(f"    courses processed: {row_count}")

    print(f"\n=== Cell stats: {cell_log} ===")
    print(f"=== Skipped ignored rows: {dict(skipped_ignored)} ===")
    if unmatched_labels:
        print(f"\n⚠️  UNMATCHED labels ({len(unmatched_labels)}):")
        for label, cats in unmatched_labels.items():
            uniq_cats = list(set(cats))
            print(f"  '{label}' (categories: {uniq_cats[:3]})")

    print(f"\n=== Pivot rows to upsert: {len(pivot_rows)} ===")

    # === STEP C: bulk upsert into admission_historical_pivot ===
    if not pivot_rows:
        print("  no rows — exiting")
        return
    items = list(pivot_rows.items())
    print(f"  example: {items[:3]}")

    if DRY_RUN:
        print("\n[DRY RUN] skipping actual upsert")
        return

    print("\n=== STEP C: bulk upsert (batches of 500) ===")
    SHEET_ID_TO_SOURCE = {
        "1GG5ErsOaj3hsMcyPOMb1jOa5i2dtlWYQDe3TUrOcER4": "sheet:2025-26:1GG5Ers",
        "1cn_sH9fFU8T7veyMqU_d-CklVzYv9VfpVis93tG9Ad0": "sheet:2024-25:1cn_sH9",
    }
    # Map ay_id to year to derive source
    ay_year = {ay_id: yr for (_, _, yr), ay_id in ay_by_key.items()}
    total = 0
    BATCH = 500
    for start in range(0, len(items), BATCH):
        batch = items[start:start + BATCH]
        values = []
        for (ay_id, iso_date), count in batch:
            yr = ay_year.get(ay_id, 0)
            src = "sheet:2025-26" if yr == 2025 else ("sheet:2024-25" if yr == 2024 else "sheet:unknown")
            values.append(f"('{ay_id}', '{iso_date}'::date, {count}, '{src}', 'import-historical-sheets.py')")
        rows_sql = ",".join(values)
        result = supabase_sql(
            "INSERT INTO admission_historical_pivot "
            "(admission_year_id, admission_date, admitted_count, source, imported_by) "
            f"VALUES {rows_sql} "
            "ON CONFLICT (admission_year_id, admission_date) "
            "DO UPDATE SET admitted_count = EXCLUDED.admitted_count, "
            "source = EXCLUDED.source, imported_at = now(), imported_by = EXCLUDED.imported_by "
            "RETURNING 1"
        )
        total += len(result) if isinstance(result, list) else 0
        print(f"    batch {start // BATCH + 1}: {len(batch)} rows attempted, {len(result) if isinstance(result, list) else '?'} affected")

    print(f"\n✅ DONE. Total rows in admission_historical_pivot now: {total}")


if __name__ == "__main__":
    main()
