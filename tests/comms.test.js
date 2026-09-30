const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/comms.js');

const SESSION = {
  ga: 104, gaStart: '2025-01-08', gaEnd: '2027-01-12',
  phases: [
    { name: 'Spring session', ranges: [{ start: '2026-01-13', end: '2026-05-31' }] },
    { name: 'Veto session', ranges: [{ start: '2026-10-14', end: '2026-10-16' }, { start: '2026-10-28', end: '2026-10-30' }] },
  ],
};
// NOTE: test fixture dates only — real dates live in data/session.json.

test('esc escapes all five HTML-significant characters', () => {
  assert.equal(C.esc(`Tenants & <Landlords> "q" 'a'`), 'Tenants &amp; &lt;Landlords&gt; &quot;q&quot; &#39;a&#39;');
  assert.equal(C.esc(null), '');
});

test('normBill strips padding, spaces, case', () => {
  assert.equal(C.normBill('SB0062'), 'SB62');
  assert.equal(C.normBill(' sb 62 '), 'SB62');
  assert.equal(C.normBill('HB5234'), 'HB5234');
  assert.equal(C.normBill('HB0'), 'HB0');
  assert.equal(C.normBill('nonsense'), null);
  assert.equal(C.normBill(''), null);
});

test('parseHash accepts GA-prefixed, bare, padded, lower-case; rejects junk', () => {
  assert.deepEqual(C.parseHash('#104-HB5234', 104), { ga: 104, billNumber: 'HB5234' });
  assert.deepEqual(C.parseHash('#104-sb0062', 104), { ga: 104, billNumber: 'SB62' });
  assert.deepEqual(C.parseHash('#HB5234', 104), { ga: 104, billNumber: 'HB5234' });
  assert.deepEqual(C.parseHash('#103-HB5234', 104), { ga: 103, billNumber: 'HB5234' });
  assert.equal(C.parseHash('#all-bills', 104), null);
  assert.equal(C.parseHash('', 104), null);
  assert.equal(C.parseHash('#104-', 104), null);
});

test('hashFor normalizes', () => {
  assert.equal(C.hashFor(104, 'SB0062'), '#104-SB62');
});

test('mdyToIso / localIso / addDaysIso', () => {
  assert.equal(C.mdyToIso('6/26/2026'), '2026-06-26');
  assert.equal(C.mdyToIso(''), null);
  assert.equal(C.mdyToIso(null), null);
  // 11pm local on Sep 30 is still Sep 30 locally, whatever UTC says
  assert.equal(C.localIso(new Date(2026, 8, 30, 23, 30)), '2026-09-30');
  assert.equal(C.addDaysIso('2026-09-30', 14), '2026-10-14');
  assert.equal(C.addDaysIso('2026-12-25', 10), '2027-01-04');
});

const bill = (lastAction, lastActionDate = '5/22/2026', extra = {}) =>
  ({ billNumber: 'HB1', lastAction, lastActionDate, ...extra });

test('billOutcome: law, including PA text and pre-PA steps', () => {
  assert.equal(C.billOutcome(bill('Public Act . . . . . . . . . 104-0514', '6/26/2026'), SESSION, '2026-09-30'), 'law');
  assert.equal(C.billOutcome(bill('Governor Approved'), SESSION, '2026-09-30'), 'law');
  assert.equal(C.billOutcome(bill('Effective Date January 1, 2027'), SESSION, '2026-09-30'), 'law');
});

test('billOutcome: governor, vetoed, veto stands', () => {
  assert.equal(C.billOutcome(bill('Sent to the Governor'), SESSION, '2026-06-10'), 'governor');
  assert.equal(C.billOutcome(bill('Passed Both Houses'), SESSION, '2026-05-30'), 'governor');
  assert.equal(C.billOutcome(bill('Total Veto'), SESSION, '2026-09-30'), 'vetoed');
  assert.equal(C.billOutcome(bill('Motion to Override Total Veto - Filed'), SESSION, '2026-10-14'), 'vetoed');
  assert.equal(C.billOutcome(bill('Total Veto Stands - No Positive Action Taken'), SESSION, '2026-11-15'), 'died');
});

test('billOutcome: deadline re-referrals are stalled even mid-session', () => {
  for (const la of ['Rule 19(a) / Re-referred to Rules Committee', 'Rule 19(b) / Re-referred to Rules Committee',
                    'Rule 3-9(a) / Re-referred to Assignments', 'Pursuant to Senate Rule 3-9(b) / Referred to Assignments']) {
    assert.equal(C.billOutcome(bill(la, '3/27/2026'), SESSION, '2026-04-01'), 'stalled', la);
  }
});

test('billOutcome: plain referral is moving during spring, stalled after it ends with no activity', () => {
  const b = bill('Referred to Assignments', '2/5/2026');
  assert.equal(C.billOutcome(b, SESSION, '2026-03-01'), 'moving');
  assert.equal(C.billOutcome(b, SESSION, '2026-09-30'), 'stalled');
});

test('billOutcome: after spring, activity or a future hearing keeps it moving', () => {
  assert.equal(C.billOutcome(bill('Assigned to Executive', '10/1/2026'), SESSION, '2026-10-05'), 'moving');
  const scheduled = bill('Referred to Assignments', '2/5/2026', { nextActionDate: '10/14/2026' });
  assert.equal(C.billOutcome(scheduled, SESSION, '2026-10-05'), 'moving');
  const past = bill('Referred to Assignments', '2/5/2026', { nextActionDate: '3/1/2026' });
  assert.equal(C.billOutcome(past, SESSION, '2026-10-05'), 'stalled');
});

test('billOutcome: anything not law dies after the GA ends', () => {
  assert.equal(C.billOutcome(bill('Referred to Assignments'), SESSION, '2027-01-13'), 'died');
  assert.equal(C.billOutcome(bill('Public Act . . . 104-0514'), SESSION, '2027-01-13'), 'law');
});

test('billOutcome: no session data still works (no date-based rules)', () => {
  assert.equal(C.billOutcome(bill('Referred to Assignments'), null, '2026-09-30'), 'moving');
  assert.equal(C.billOutcome(bill('Rule 19(a) / Re-referred to Rules Committee'), null, '2026-09-30'), 'stalled');
  assert.equal(C.billOutcome({ billNumber: 'HB1' }, null, '2026-09-30'), 'moving');
});

test('paNumber and awaitingFloorVote', () => {
  assert.equal(C.paNumber(bill('Public Act . . . . . . . . . 104-0514')), '104-0514');
  assert.equal(C.paNumber(bill('Governor Approved')), null);
  assert.equal(C.awaitingFloorVote(bill('Placed on Calendar Order of 3rd Reading May 20, 2026')), true);
  assert.equal(C.awaitingFloorVote(bill('Referred to Assignments')), false);
});

test('labels switch wording when spring ends', () => {
  assert.equal(C.outcomeLabel('stalled', { springEnded: false, ga: 104 }), 'Stalled');
  assert.equal(C.outcomeLabel('stalled', { springEnded: true, ga: 104 }), "Didn't advance this session");
  assert.equal(C.outcomeLabel('law', {}, '104-0514'), 'Law · PA 104-0514');
  assert.equal(C.outcomeLabel('law', {}, null), 'Law');
  assert.equal(C.outcomeLabel('died', { ga: 104 }), 'Died with the 104th GA');
  assert.equal(C.groupHeading('stalled', { springEnded: true }), "Didn't advance this session");
  assert.equal(C.groupHeading('law', {}), 'Became law');
  assert.equal(C.ordinal(104), '104th');
  assert.equal(C.ordinal(101), '101st');
  assert.equal(C.ordinal(112), '112th');
});
