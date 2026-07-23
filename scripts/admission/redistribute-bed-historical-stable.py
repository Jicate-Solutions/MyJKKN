#!/usr/bin/env python3
"""
Redistribute B.Ed historical admissions across 4 active pedagogies using
stable-sampling so the totals are preserved exactly (no integer-rounding loss).

Why this exists:
    The 2024-25 + 2025-26 Google Sheets recorded B.Ed admissions as a single
    row (no per-pedagogy breakdown). When MyJKKN's 2026-27 organic admissions
    started landing on pedagogy-specific programs (Physical Science / Economics /
    Computer Science / Biological Science), the common-courses filter excluded
    B.Ed entirely because the aggregate program_id and pedagogy program_ids
    don't match.

    Director-locked 2026-06-02: redistribute the historical admissions across
    the 4 active pedagogies using 2026 ratios (Physical Science 40%,
    Economics 20%, Computer Science 20%, Biological Science 20%). The 7 other
    pedagogies receive 0 (no organic 2026 signal to allocate from).

Why stable-sampling (vs naive ROUND):
    Naive ROUND(cell × ratio) loses ~40% of admissions when source cells have
    small counts (most B.Ed cells have admitted_count=1; ROUND(1*0.2)=0).
    Stable-sampling carries fractional accumulators across cells, emitting an
    integer admission only when the accumulator crosses an integer boundary.
    Totals are preserved exactly (within ±1 from end-of-year carry-over).

How it works (per pedagogy):
    1. Walk B.Ed cells in chronological order
    2. For each cell with count N, add N × ratio to accumulator
    3. Emit FLOOR(accumulator) admissions on this date, then subtract that
       integer from accumulator (keep the fraction for next cell)
    4. At end of year, if accumulator >= 0.5, emit 1 final admission on last date

Run:
    python3 scripts/admission/redistribute-bed-historical-stable.py

Pre-conditions:
    - admission_historical_pivot table exists
    - 4 pedagogy programs exist in JKKN College of Education
    - admission_years rows for (pedagogy, 2024) and (pedagogy, 2025) exist
    - ~/.supabase/access-token has a Management API token

Side effects:
    - Deletes any existing 'b_ed_pedagogy_redistribute*' rows from
      admission_historical_pivot
    - Inserts new rows with source = 'b_ed_pedagogy_redistribute_v2:sheet:YYYY-YYYY+1'

Reproducible: re-running the script produces identical INSERTs because the
sheet data is the source of truth and the stable-sampling algorithm is
deterministic.
"""

import csv
import json
import os
import re
import urllib.parse
import urllib.request
from pathlib import Path

PROJECT_REF = "kvizhngldtiuufknvehv"
TOKEN_PATH = os.path.expanduser("~/.supabase/access-token")

# Pedagogy program UUIDs + ratios (matching 2026 organic distribution)
PEDAGOGY = [
    ("c3ac44db-6cfd-4a7d-948e-95977ca2234d", "Physical Science",   0.40),
    ("149ac1a4-c6f0-415f-b343-96e9a1d87023", "Economics",          0.20),
    ("ce4d19b0-afad-4ac9-acfa-638ed68305cb", "Computer Science",   0.20),
    ("fe43f2c7-0d3d-4c19-ac2e-ad85d1c4a9a9", "Biological Science", 0.20),
]

SHEETS = [
    (2024, "1cn_sH9fFU8T7veyMqU_d-CklVzYv9VfpVis93tG9Ad0"),
    (2025, "1GG5ErsOaj3hsMcyPOMb1jOa5i2dtlWYQDe3TUrOcER4"),
]
SUB_SHEET = "CET,CNR,DCH,COP,AHS & EDN"

DATE_PAT = re.compile(r"^(\d{1,2})/(\d{1,2})/(\d{2,4})$")


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
            "User-Agent": "redistribute-bed-stable/1.0",
        },
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def parse_iso_date(cell):
    m = DATE_PAT.match(cell.strip())
    if not m:
        return None
    y = int(m.group(3))
    if y < 100:
        y = 2000 + y
    if y > 2030:
        return "2025-05-15"  # the '5025' typo in the source sheet
    return f"{y:04d}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"


def download_csv(sheet_id, sub_sheet):
    url = (
        f"https://docs.google.com/spreadsheets/d/{sheet_id}/gviz/tq"
        f"?tqx=out:csv&sheet={urllib.parse.quote(sub_sheet)}"
    )
    req = urllib.request.Request(url, headers={"User-Agent": "redistribute-bed-stable/1.0"})
    with urllib.request.urlopen(req) as r:
        return r.read().decode()


def main():
    # Lookup admission_years.id for each pedagogy × year
    ay_rows = supabase_sql(
        "SELECT ay.id, ay.program_id, ay.program_start_year FROM admission_years ay "
        "JOIN institutions i ON i.id = ay.institution_id "
        "WHERE i.name = 'JKKN College of Education' AND ay.program_start_year IN (2024, 2025)"
    )
    ay_lookup = {(r["program_id"], r["program_start_year"]): r["id"] for r in ay_rows}

    # Step 1: clear any prior redistribution rows
    cleared = supabase_sql(
        "DELETE FROM admission_historical_pivot "
        "WHERE source LIKE 'b_ed_pedagogy_redistribute%' RETURNING 1"
    )
    print(f"Cleared {len(cleared)} prior redistribution rows")

    # Step 2: walk sheets, apply stable-sampling per pedagogy per year
    total_inserted = 0
    for year, sheet_id in SHEETS:
        rows = list(csv.reader(download_csv(sheet_id, SUB_SHEET).splitlines()))
        header = rows[0]
        date_cols = [(i, parse_iso_date(c)) for i, c in enumerate(header) if parse_iso_date(c)]

        bed_row = next((r for r in rows[1:] if len(r) > 1 and r[1].strip() == "B.Ed"), None)
        if not bed_row:
            print(f"WARN: no B.Ed row in {year}-{year + 1} sheet")
            continue

        accumulators = {pid: 0.0 for pid, _, _ in PEDAGOGY}
        per_pedagogy_total = {pid: 0 for pid, _, _ in PEDAGOGY}
        insert_rows = []

        for col_idx, iso_date in date_cols:
            cell = bed_row[col_idx].strip() if col_idx < len(bed_row) else ""
            try:
                n = int(cell)
            except ValueError:
                try:
                    n = int(float(cell))
                except (ValueError, TypeError):
                    n = 0
            if n == 0:
                continue

            for pid, _name, ratio in PEDAGOGY:
                accumulators[pid] += n * ratio
                emit = int(accumulators[pid])  # floor for positive; correct for negative cells
                accumulators[pid] -= emit
                if emit != 0:
                    ay_id = ay_lookup.get((pid, year))
                    if ay_id:
                        insert_rows.append((ay_id, iso_date, emit))
                        per_pedagogy_total[pid] += emit

        # Flush accumulator remnants
        if date_cols:
            last_date = date_cols[-1][1]
            for pid, _name, _ratio in PEDAGOGY:
                if accumulators[pid] >= 0.5:
                    ay_id = ay_lookup.get((pid, year))
                    if ay_id:
                        insert_rows.append((ay_id, last_date, 1))
                        per_pedagogy_total[pid] += 1

        print(
            f"{year}-{year + 1}: {sum(per_pedagogy_total.values())} total redistributed; "
            f"breakdown: {[(name, per_pedagogy_total[pid]) for pid, name, _ in PEDAGOGY]}"
        )

        for batch_start in range(0, len(insert_rows), 500):
            batch = insert_rows[batch_start : batch_start + 500]
            values = ",".join(
                f"('{ay_id}', '{iso_date}'::date, {count}, "
                f"'b_ed_pedagogy_redistribute_v2:sheet:{year}-{year + 1}', 'redistribute-bed-stable.py')"
                for ay_id, iso_date, count in batch
            )
            supabase_sql(
                "INSERT INTO admission_historical_pivot "
                "(admission_year_id, admission_date, admitted_count, source, imported_by) "
                f"VALUES {values} "
                "ON CONFLICT (admission_year_id, admission_date) DO UPDATE SET "
                "admitted_count = EXCLUDED.admitted_count, source = EXCLUDED.source, "
                "imported_at = now() RETURNING 1"
            )
            total_inserted += len(batch)

    print(f"\nTotal rows inserted: {total_inserted}")


if __name__ == "__main__":
    main()
