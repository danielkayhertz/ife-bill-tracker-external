"""
One-off migration: convert category strings → arrays in bills.json and FALLBACK_DATA.
Run once, then delete (or gitignore alongside update_bills_from_csv.py).
"""
import json, re, os

BASE          = r'C:\Users\bpi\Documents\Claude Code\ife-bill-tracker-external'
BILLS_JSON    = os.path.join(BASE, 'data', 'bills.json')
INDEX_HTML    = os.path.join(BASE, 'index.html')

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

# --- Transform bills.json ---
with open(BILLS_JSON, encoding='utf-8') as f:
    bills = json.load(f)

for bill in bills:
    cat = bill.get('category', '')
    if isinstance(cat, str):
        bill['category'] = split_categories(cat)
    # if already a list (shouldn't happen), leave it

with open(BILLS_JSON, 'w', encoding='utf-8') as f:
    json.dump(bills, f, indent=2, ensure_ascii=False)
print(f'bills.json updated ({len(bills)} bills)')

# --- Transform FALLBACK_DATA in index.html ---
# Strategy: locate each "category":"..." in the FALLBACK_DATA block and replace
# with "category":[...]. Use the same start/end anchors the migration script uses.
with open(INDEX_HTML, encoding='utf-8') as f:
    html = f.read()

start_marker = '    const FALLBACK_DATA = ['
end_anchor   = '\n    // ── Stage / status styling'

start_pos = html.find(start_marker)
end_pos   = html.find(end_anchor, start_pos)
if start_pos == -1 or end_pos == -1:
    raise ValueError('FALLBACK_DATA anchors not found in index.html')

block = html[start_pos:end_pos]

def replace_category(m):
    raw = m.group(1)
    arr = split_categories(raw)
    return '"category":' + json.dumps(arr, ensure_ascii=False, separators=(',', ':'))

block = re.sub(r'"category":"([^"]*)"', replace_category, block)
html = html[:start_pos] + block + html[end_pos:]

with open(INDEX_HTML, 'w', encoding='utf-8') as f:
    f.write(html)
print('FALLBACK_DATA in index.html updated')
print('Done.')
