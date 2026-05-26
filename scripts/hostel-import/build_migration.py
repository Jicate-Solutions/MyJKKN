"""
Build the SQL migration from parsed.json + matches.json + learner_to_profile.json.

Writes: supabase/migrations/<timestamp>_hostel_dental_inventory_import.sql
"""
import json
import re
import uuid
from collections import defaultdict
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).parent
REPO = ROOT.parent.parent  # MyJKKN root

DENTAL_ID = 'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5'

# Deterministic UUIDs for hostel blocks (use UUIDv5 against institution_id)
NS = uuid.UUID('00000000-0000-0000-0000-000000000000')


def gen_block_id(code):
    return str(uuid.uuid5(NS, f'jkkn-dental-hostel-block-{code}'))


def gen_room_id(block_code, room_number, floor):
    return str(uuid.uuid5(NS, f'jkkn-dental-room-{block_code}-{room_number}-f{floor}'))


def sql_str(s):
    if s is None:
        return 'NULL'
    return "'" + str(s).replace("'", "''") + "'"


def sql_bool(b):
    return 'TRUE' if b else 'FALSE'


def status_for_room(raw_status, capacity):
    """Map Excel ROOM STATUS to room_status_enum + intent flag.

    Returns (room_status_enum, is_special_use_bool).
    """
    s = (raw_status or '').upper().strip()
    if not s:
        return ('available', False)
    if s.startswith('OCCUPIED'):
        return ('full', False)
    if s.startswith('AVAILABLE'):
        # AVAILABLE / AVAILABLE 1 / AVAILABLE 3 etc.
        # If "AVAILABLE N" → N beds free; partially_occupied if some occupancy
        m = re.match(r'AVAILABLE\s*(\d+)', s)
        if m:
            free = int(m.group(1))
            if free < capacity:
                return ('partially_occupied', False)
        return ('available', False)
    if s in ('WARDEN', 'MESS WARDEN', 'MESS STAFF', 'NURSING STAFF', 'ACCOUNTS',
            'OFFICE ROOM', 'THINKS', 'DENTAL STAFF', 'TV ROOM', 'SICK ROOM'):
        # Reserved for non-resident use
        return ('reserved', True)
    return ('available', False)


def room_type_for_capacity(capacity):
    if capacity <= 1:
        return 'single'
    if capacity == 2:
        return 'double'
    if capacity == 3:
        return 'triple'
    if capacity == 4:
        return 'quad'
    return 'dormitory'


def ac_status_for(ac_flag):
    return 'ac' if ac_flag else 'non_ac'


def main():
    parsed = json.loads((ROOT / 'parsed.json').read_text())
    matches = json.loads((ROOT / 'matches.json').read_text())
    profile_rows = json.loads((ROOT / 'learner_to_profile.json').read_text())
    learner_to_profile = {r['learner_id']: r['profile_id'] for r in profile_rows}

    blocks = parsed['blocks']
    rooms = parsed['rooms']

    # Build block id map
    block_ids = {b['code']: gen_block_id(b['code']) for b in blocks}

    lines = []
    lines.append('-- Hostel inventory import for JKKN Dental College and Hospital')
    lines.append('-- Source: A/B/C BLOCK Excel sheet (Director-provided, 2026-05-26).')
    lines.append('-- A BLOCK = 54 rooms, B BLOCK = 38 rooms, C BLOCK = 53 rooms.')
    lines.append('-- C BLOCK residents: 130 matched girl learners (BDS + PharmD).')
    lines.append('-- All operations are idempotent via ON CONFLICT DO NOTHING.')
    lines.append('--')
    lines.append("SET LOCAL statement_timeout = '120s';")
    lines.append('')
    lines.append('BEGIN;')
    lines.append('')

    # 1. Blocks
    lines.append('-- ===== 1. Hostel blocks =====')
    lines.append('INSERT INTO hostel_blocks (id, institution_id, name, code, hostel_type, total_floors, status, metadata)')
    lines.append('VALUES')
    block_values = []
    for b in blocks:
        bid = block_ids[b['code']]
        meta = json.dumps({'source': 'excel_import_2026_05_26', 'imported_by': 'feat/hostel-rooms-import'})
        block_values.append(
            f"  ({sql_str(bid)}, {sql_str(DENTAL_ID)}, {sql_str(b['name'])}, {sql_str(b['code'])}, "
            f"{sql_str(b['hostel_type'])}::hostel_type_enum, {b['total_floors']}, "
            f"'active'::block_status_enum, {sql_str(meta)}::jsonb)"
        )
    lines.append(',\n'.join(block_values))
    lines.append('ON CONFLICT (id) DO NOTHING;')
    lines.append('')

    # 2. Rooms — generate in batches by block
    lines.append('-- ===== 2. Hostel rooms (145 total: 54 A + 38 B + 53 C) =====')
    # Group rooms by block to make readable
    by_block = defaultdict(list)
    for r in rooms:
        by_block[r['block_code']].append(r)

    for block_code in ['A', 'B', 'C']:
        bid = block_ids[block_code]
        block_rooms = by_block[block_code]
        lines.append(f'-- {block_code} BLOCK: {len(block_rooms)} rooms')
        lines.append('INSERT INTO hostel_rooms (id, block_id, institution_id, room_number, floor, room_type, ac_status, capacity, status, tier_access, metadata)')
        lines.append('VALUES')
        room_values = []
        for r in block_rooms:
            rid = gen_room_id(block_code, r['room_number'], r['floor'])
            status, is_special = status_for_room(r.get('raw_status'), r['capacity'])
            rtype = room_type_for_capacity(r['capacity'])
            acs = ac_status_for(r.get('ac', False))
            meta = {
                'raw_excel_status': r.get('raw_status'),
                'tier_key': r['tier_key'],
                'tiles': r.get('tiles', False),
                'source': 'excel_import_2026_05_26',
            }
            if is_special:
                meta['special_use'] = r.get('raw_status')
            room_values.append(
                f"  ({sql_str(rid)}, {sql_str(bid)}, {sql_str(DENTAL_ID)}, "
                f"{sql_str(r['room_number'])}, {r['floor']}, {sql_str(rtype)}::room_type_enum, "
                f"{sql_str(acs)}::ac_status_enum, {r['capacity']}, {sql_str(status)}::room_status_enum, "
                f"{sql_str('premium_only' if r['tier_key']=='premium' else 'either')}, "
                f"{sql_str(json.dumps(meta))}::jsonb)"
            )
        lines.append(',\n'.join(room_values))
        lines.append('ON CONFLICT (id) DO NOTHING;')
        lines.append('')

    # 3. Residents — for MATCHED rows only
    matched = [m for m in matches['matches'] if m['status'] == 'MATCHED']
    lines.append(f'-- ===== 3. Hostel residents ({len(matched)} matched girls, deduplicated by profile) =====')
    seen_profiles = set()
    resident_values = []
    skipped_no_profile = 0
    for m in matched:
        learner_id = m['chosen_id']
        profile_id = learner_to_profile.get(learner_id)
        if not profile_id:
            skipped_no_profile += 1
            continue
        if profile_id in seen_profiles:
            continue
        seen_profiles.add(profile_id)
        # Find the room they belong to
        room_id = gen_room_id(m['block_code'], m['room_number'], m['floor'])
        meta = {
            'imported_room_id': room_id,
            'imported_room_number': m['room_number'],
            'imported_block_code': m['block_code'],
            'imported_floor': m['floor'],
            'excel_raw_name': m['raw_name'],
            'excel_program': m['program'],
            'excel_year': m['year'],
            'matched_learner_id': learner_id,
            'match_score': m['best_score'],
            'source': 'excel_import_2026_05_26',
        }
        resident_values.append(
            f"  ({sql_str(DENTAL_ID)}, {sql_str(profile_id)}, "
            f"'learner'::hostel_resident_type_enum, TRUE, "
            f"{sql_str(json.dumps(meta))}::jsonb)"
        )

    if resident_values:
        lines.append('INSERT INTO hostel_residents (institution_id, profile_id, resident_type, is_active, metadata)')
        lines.append('VALUES')
        lines.append(',\n'.join(resident_values))
        lines.append('ON CONFLICT DO NOTHING;')
    lines.append('')
    lines.append('COMMIT;')
    lines.append('')

    # Add a verification SELECT block as comments
    lines.append('-- ===== Verification probes =====')
    lines.append("-- SELECT COUNT(*) AS blocks FROM hostel_blocks WHERE institution_id = 'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5'; -- expect >= 3")
    lines.append("-- SELECT COUNT(*) AS rooms FROM hostel_rooms WHERE institution_id = 'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5'; -- expect 145")
    lines.append("-- SELECT COUNT(*) AS residents FROM hostel_residents WHERE institution_id = 'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5'; -- expect 126")
    lines.append('')

    ts = datetime.now().strftime('%Y%m%d%H%M%S')
    out = REPO / 'supabase' / 'migrations' / f'{ts}_hostel_dental_inventory_import.sql'
    out.write_text('\n'.join(lines))
    print(f'Wrote migration: {out}')
    print(f'  Blocks: {len(blocks)}')
    print(f'  Rooms:  {len(rooms)}')
    print(f'  Residents: {len(resident_values)} (skipped no_profile: {skipped_no_profile})')


if __name__ == '__main__':
    main()
