"""
Diff-aware update of bills.json and FALLBACK_DATA from CSVs.
Only modifies CSV-sourced fields that actually changed.
Preserves all ILGA-fetched fields and bill IDs for unchanged bills.
"""

import csv
import json
import re
import os

BASE = r'C:\Users\bpi\Documents\Claude Code\ife-bill-tracker-external'

HOUSING_CSV    = os.path.join(BASE, 'IL Bill Tracker 2026(Housing Bill Tracker).csv')
CLS_CSV        = os.path.join(BASE, 'IL Bill Tracker 2026(CLS State Bill Tracker).csv')
BILLS_JSON     = os.path.join(BASE, 'data', 'bills.json')
USER_BILLS_JSON= os.path.join(BASE, 'data', 'user-bills.json')
INDEX_HTML     = os.path.join(BASE, 'index.html')

STATUS_MAP = {
    'endorse':                    'Endorsed',
    'endorsed house amend. 001':  'Endorsed',
    'support':                    'Endorsed',
    'sponsor / author':           'Sponsored',
    'sponsor(?)':                 'Sponsored',
    'oppose?':                    'Opposed',
    'oppose':                     'Opposed',
    'tentative':                  'Watching',
    'watching':                   'Watching',
    '?':                          'Watching',
    '':                           'Watching',
}

NORMALIZATIONS = {
    'potentially affordable housing': 'Affordable Housing',
}

def split_categories(raw):
    if not raw or not raw.strip():
        return []
    parts = [p.strip().rstrip('?').strip() for p in raw.split('/')]
    result = []
    for p in parts:
        normalized = NORMALIZATIONS.get(p.lower(), p)
        if normalized:
            result.append(normalized)
    return result or []

def normalize_bn(bn):
    return re.sub(r'\s+', '', bn.strip().upper())

def build_url(bn):
    m = re.match(r'^([A-Z]+)(\d+)$', bn)
    if not m:
        return None
    doc_type, doc_num = m.groups()
    return (f'https://www.ilga.gov/Legislation/BillStatus'
            f'?DocNum={doc_num}&GAID=18&DocTypeID={doc_type}&SessionID=114')

def map_status(ife_status_raw):
    key = ife_status_raw.strip().lower()
    return STATUS_MAP.get(key, 'Watching')

def parse_csv(path):
    with open(path, encoding='utf-8-sig', errors='replace') as f:
        reader = csv.reader(f)
        rows = list(reader)

    header_idx = None
    for i, row in enumerate(rows):
        if row and row[0].replace(' (public)', '').strip() == 'Bill #':
            header_idx = i
            break

    if header_idx is None:
        raise ValueError(f'Header row not found in {path}')

    headers = [col.replace(' (public)', '').strip() for col in rows[header_idx]]

    def col(name):
        try:
            return headers.index(name)
        except ValueError:
            return None

    i_bn       = col('Bill #')
    i_title    = col('Short Description')
    i_summary  = col('Summary')
    i_sponsor  = col('Sponsor(s)')
    i_ife      = col('IFE Status')
    i_prog     = col('Housing or CLS')
    i_issue    = col('General Issue Area')

    def get(row, idx):
        if idx is None or idx >= len(row):
            return ''
        return row[idx].strip()

    bills = []
    for row in rows[header_idx + 1:]:
        if not row:
            continue
        bn_raw = get(row, i_bn)
        if not bn_raw:
            continue
        bn = normalize_bn(bn_raw)
        if not re.match(r'^[A-Z]+\d+$', bn):
            continue

        bills.append({
            'billNumber':    bn,
            'title':         get(row, i_title),
            'description':   get(row, i_summary),
            'primarySponsor':get(row, i_sponsor),
            'type':          map_status(get(row, i_ife)),
            'programArea':   get(row, i_prog) or 'Housing',
            'category':      split_categories(get(row, i_issue)),
        })

    return bills

# CSV-sourced fields that we compare for diffs
CSV_FIELDS = ['title', 'description', 'primarySponsor', 'type', 'programArea', 'category']

# ── Load current tracker ──────────────────────────────────────────────────────

with open(BILLS_JSON, encoding='utf-8') as f:
    existing_bills = json.load(f)

# Also load user-bills for ILGA data on bills not yet in bills.json
try:
    with open(USER_BILLS_JSON, encoding='utf-8') as f:
        user_bills = json.load(f)
except (FileNotFoundError, json.JSONDecodeError):
    user_bills = []

# Index existing bills by billNumber
existing_by_bn = {b['billNumber']: b for b in existing_bills}
user_by_bn = {b['billNumber']: b for b in user_bills}

# ── Parse CSVs (Housing first, CLS second → CLS overwrites collisions) ───────

housing_bills = parse_csv(HOUSING_CSV)
cls_bills     = parse_csv(CLS_CSV)

csv_bills_dict = {}
housing_order  = []

for b in housing_bills:
    csv_bills_dict[b['billNumber']] = b
    housing_order.append(b['billNumber'])

cls_order = []
for b in cls_bills:
    csv_bills_dict[b['billNumber']] = b  # CLS overwrites Housing
    if b['billNumber'] not in set(housing_order):
        cls_order.append(b['billNumber'])

all_csv_bns = housing_order + cls_order

print(f'CSV bills: {len(all_csv_bns)} (Housing: {len(housing_bills)}, CLS-only: {len(cls_order)})')
print(f'Current tracker bills: {len(existing_bills)}')
print()

# ── Diff: compare CSV fields against tracker ─────────────────────────────────

changed_bills = []
unchanged_bills = []
new_bills_list = []
dropped_bns = []

for bn in all_csv_bns:
    csv_data = csv_bills_dict[bn]
    existing = existing_by_bn.get(bn)

    if existing is None:
        new_bills_list.append(bn)
        continue

    # Compare CSV-sourced fields
    diffs = {}
    for field in CSV_FIELDS:
        old_val = existing.get(field)
        new_val = csv_data[field]
        if old_val != new_val:
            diffs[field] = (old_val, new_val)

    if diffs:
        changed_bills.append((bn, diffs))
    else:
        unchanged_bills.append(bn)

# Bills in tracker but not in CSVs
for bn in existing_by_bn:
    if bn not in csv_bills_dict:
        dropped_bns.append(bn)

# ── Report ───────────────────────────────────────────────────────────────────

print(f'Unchanged: {len(unchanged_bills)}')
print(f'Changed:   {len(changed_bills)}')
print(f'New:       {len(new_bills_list)}')
print(f'Dropped:   {len(dropped_bns)}')
print()

if changed_bills:
    print('=== CHANGED BILLS ===')
    for bn, diffs in changed_bills:
        print(f'\n  {bn}:')
        for field, (old, new) in diffs.items():
            old_str = repr(old) if len(repr(old)) < 80 else repr(old)[:77] + '...'
            new_str = repr(new) if len(repr(new)) < 80 else repr(new)[:77] + '...'
            print(f'    {field}: {old_str} -> {new_str}')

if new_bills_list:
    print(f'\n=== NEW BILLS ({len(new_bills_list)}) ===')
    for bn in new_bills_list:
        csv_data = csv_bills_dict[bn]
        print(f'  {bn}: {csv_data["title"]} [{csv_data["programArea"]}] ({csv_data["type"]})')

if dropped_bns:
    print(f'\n=== DROPPED BILLS ({len(dropped_bns)}) ===')
    for bn in sorted(dropped_bns):
        old = existing_by_bn[bn]
        print(f'  {bn}: {old["title"]} [{old.get("programArea","")}]')

# ── Apply changes ────────────────────────────────────────────────────────────

# 1. Update changed bills in-place (preserve ID, ILGA fields, everything else)
for bn, diffs in changed_bills:
    bill = existing_by_bn[bn]
    csv_data = csv_bills_dict[bn]
    for field in CSV_FIELDS:
        bill[field] = csv_data[field]

# 2. Add new bills
next_id = max(b['id'] for b in existing_bills) + 1 if existing_bills else 1

for bn in new_bills_list:
    csv_data = csv_bills_dict[bn]
    # Check user-bills for any ILGA data
    src = user_by_bn.get(bn)

    bill = {
        'id':             next_id,
        'billNumber':     bn,
        'title':          csv_data['title'],
        'description':    csv_data['description'],
        'type':           csv_data['type'],
        'category':       csv_data['category'],
        'primarySponsor': csv_data['primarySponsor'],
        'programArea':    csv_data['programArea'],
        'year':           src.get('year', [2026]) if src else [2026],
        'status':         src.get('status', 'Not passed into law') if src else 'Not passed into law',
        'url':            (src.get('url') if src else None) or build_url(bn),
        'stage':          src.get('stage') if src else None,
        'lastAction':     src.get('lastAction') if src else None,
        'lastActionDate': src.get('lastActionDate') if src else None,
        'ilgaFetchedAt':  src.get('ilgaFetchedAt') if src else None,
        'stageChangedAt': src.get('stageChangedAt') if src else None,
        'nextActionDate': src.get('nextActionDate') if src else None,
        'nextActionType': src.get('nextActionType') if src else None,
        'lastAmendmentName': src.get('lastAmendmentName') if src else None,
        'lastAmendmentDate': src.get('lastAmendmentDate') if src else None,
        'isShellBill':    src.get('isShellBill') if src else None,
    }
    existing_bills.append(bill)
    existing_by_bn[bn] = bill
    next_id += 1

# 3. Remove dropped bills
if dropped_bns:
    existing_bills = [b for b in existing_bills if b['billNumber'] not in set(dropped_bns)]

# ── Reorder: Housing-with-ILGA, CLS-with-ILGA, Housing-new, CLS-new ─────────
# Use same ordering logic as update_bills_from_csv.py

def has_ilga(bn):
    b = existing_by_bn.get(bn)
    return bool(b and b.get('ilgaFetchedAt'))

with_ilga_housing, with_ilga_cls, new_housing, new_cls = [], [], [], []

for bn in all_csv_bns:
    b = existing_by_bn.get(bn)
    if not b:
        continue
    is_cls = (b['programArea'].strip().upper() == 'CLS')
    if has_ilga(bn):
        (with_ilga_cls if is_cls else with_ilga_housing).append(bn)
    else:
        (new_cls if is_cls else new_housing).append(bn)

sorted_bns = with_ilga_housing + with_ilga_cls + new_housing + new_cls

# Reassign IDs in sort order
final_bills = []
for seq_id, bn in enumerate(sorted_bns, start=1):
    bill = existing_by_bn[bn]
    bill['id'] = seq_id
    final_bills.append(bill)

# ── Write bills.json ─────────────────────────────────────────────────────────

with open(BILLS_JSON, 'w', encoding='utf-8') as f:
    json.dump(final_bills, f, indent=2, ensure_ascii=False)
print(f'\nWrote {BILLS_JSON} ({len(final_bills)} bills)')

# ── Clear user-bills.json ────────────────────────────────────────────────────

with open(USER_BILLS_JSON, 'w', encoding='utf-8') as f:
    json.dump([], f)
print(f'Wrote {USER_BILLS_JSON} (cleared)')

# ── Update FALLBACK_DATA in index.html ───────────────────────────────────────

fallback_lines = ['    const FALLBACK_DATA = [']
for i, bill in enumerate(final_bills):
    fb = {
        'id':          bill['id'],
        'billNumber':  bill['billNumber'],
        'title':       bill['title'],
        'description': bill['description'],
        'year':        bill['year'],
        'status':      bill['status'],
        'type':        bill['type'],
        'category':    bill['category'],
        'url':         bill['url'],
        'programArea': bill['programArea'],
    }
    line = '      ' + json.dumps(fb, ensure_ascii=False, separators=(',', ':'))
    if i < len(final_bills) - 1:
        line += ','
    fallback_lines.append(line)
fallback_lines.append('    ];')
fallback_block = '\n'.join(fallback_lines)

with open(INDEX_HTML, encoding='utf-8') as f:
    html = f.read()

start_marker = '    const FALLBACK_DATA = ['
end_anchor   = '\n    // ── Stage / status styling'

start_pos = html.find(start_marker)
if start_pos == -1:
    raise ValueError('FALLBACK_DATA start not found in index.html')

end_pos = html.find(end_anchor, start_pos)
if end_pos == -1:
    raise ValueError('Stage/status anchor not found in index.html')

html = html[:start_pos] + fallback_block + html[end_pos:]

with open(INDEX_HTML, 'w', encoding='utf-8') as f:
    f.write(html)
print(f'Wrote {INDEX_HTML}')

# ── Final summary ────────────────────────────────────────────────────────────

housing_count = sum(1 for b in final_bills if b['programArea'].strip().upper() != 'CLS')
cls_count = sum(1 for b in final_bills if b['programArea'].strip().upper() == 'CLS')
print(f'\nFinal: {len(final_bills)} bills (Housing: {housing_count}, CLS: {cls_count})')

# Spot-check HB4782 collision
hb4782 = next((b for b in final_bills if b['billNumber'] == 'HB4782'), None)
if hb4782:
    print(f'HB4782: programArea={hb4782["programArea"]}, type={hb4782["type"]}')

print('\nDone!')
