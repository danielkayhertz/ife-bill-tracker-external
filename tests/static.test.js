const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const html = fs.readFileSync(require('node:path').join(__dirname, '..', 'index.html'), 'utf8');

test('no public write paths or Worker dependency remain', () => {
  for (const s of ['writeGitHubFile', 'readGitHubFile', 'WORKER_URL', 'workers.dev', 'refreshAllFromILGA',
                   'refreshBillILGA', 'deleteBill', 'addBill', 'lookupBillILGA', 'fetchBillFromILGA',
                   'refresh-overlay', 'bill-modal-delete-btn']) {
    assert.ok(!html.includes(s), `index.html still contains ${s}`);
  }
});

test('reads data from raw.githubusercontent.com (or local data/ in dev)', () => {
  assert.ok(html.includes('https://raw.githubusercontent.com/'));
  assert.ok(html.includes('function readDataFile('));
});

test('page title is not "Internal"', () => {
  assert.ok(!/<title>[^<]*Internal/i.test(html));
});

test('comms layer is wired in', () => {
  assert.ok(html.includes('<script src="js/comms.js"></script>'));
  for (const id of ['comms', 'session-summary', 'coming-up', 'agenda-groups', 'all-bills', 'jump-all-bills', 'print-agenda']) {
    assert.ok(html.includes(`id="${id}"`), `missing #${id}`);
  }
  assert.ok(!html.includes('id="highlights-'), 'old highlights bar still present');
  assert.ok(html.includes('@media print'));
});

test('ILGA/staff bill fields are escaped before HTML interpolation', () => {
  // A direct `${bill.xxx}` template interpolation (no Comms.esc/escapeHtml wrapper) would inject
  // unescaped ILGA/staff text straight into the DOM. After the fix every such field is wrapped.
  const unescaped = html.match(/\$\{bill\.[A-Za-z]+(?:\.[A-Za-z]+)*\}/g) || [];
  assert.deepEqual(unescaped, [], 'bill.* field interpolated without Comms.esc/escapeHtml: ' + unescaped.join(', '));
});

test('bill.url only reaches an href/.href sink through Comms.safeUrl', () => {
  const sinks = html.match(/(?:href\s*=\s*"[^"]*bill\.url[^"]*"|\.href\s*=\s*[^;]*bill\.url[^;]*;)/g) || [];
  assert.ok(sinks.length > 0, 'expected to find at least one bill.url sink to check');
  for (const sink of sinks) {
    assert.ok(/safeUrl/.test(sink), `bill.url sink missing Comms.safeUrl: ${sink}`);
  }
});

test('"today" is computed via Comms.localIso, never toISOString', () => {
  assert.ok(!/new Date\(\)\.toISOString\(\)\.split\('T'\)\[0\]/.test(html),
    'toISOString() used for "today" instead of todayIso()/Comms.localIso()');
});

test('bills, user-bills, and notes reads fail independently (no shared Promise.all)', () => {
  assert.ok(!/Promise\.all\(\[\s*readDataFile\('bills\.json'/.test(html),
    'bills.json read must not share a Promise.all with user-bills.json/notes.json reads');
});

test('print date is filled on beforeprint, not only the Print agenda button', () => {
  assert.ok(html.includes("addEventListener('beforeprint'"), 'missing a beforeprint listener to fill #print-date for Ctrl+P');
});

test('campaign window and link handling exist', () => {
  for (const id of ['campaign-modal-overlay', 'campaign-copy-link', 'campaign-copy-blurb', 'bill-modal-copy-link']) {
    assert.ok(html.includes(`id="${id}"`), `missing #${id}`);
  }
  for (const s of ['function openFromHash(', "'bill-tracker-hash'", "'bill-tracker-parent'", "'hashchange'"]) {
    assert.ok(html.includes(s), `missing ${s}`);
  }
  assert.ok(!html.includes('// Replaced in Task 7.'), 'openCampaign stub still present');
});
