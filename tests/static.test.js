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
