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

test('safeUrl allows only http(s) URLs, else #', () => {
  assert.equal(C.safeUrl('https://www.ilga.gov/Legislation/BillStatus?DocNum=5234'),
    'https://www.ilga.gov/Legislation/BillStatus?DocNum=5234');
  assert.equal(C.safeUrl('http://example.com/x'), 'http://example.com/x');
  assert.equal(C.safeUrl('javascript:alert(1)'), '#');
  assert.equal(C.safeUrl('  javascript:alert(1)'), '#');
  assert.equal(C.safeUrl('JAVASCRIPT:alert(1)'), '#');
  assert.equal(C.safeUrl('data:text/html,<script>1</script>'), '#');
  assert.equal(C.safeUrl('//evil.example.com'), '#');
  assert.equal(C.safeUrl(''), '#');
  assert.equal(C.safeUrl(null), '#');
  assert.equal(C.safeUrl(undefined), '#');
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

test('billOutcome: missing lastActionDate after spring end is moving, not stalled', () => {
  // FALLBACK_DATA bills have no lastAction/lastActionDate. A failed bills.json read must not make
  // every bill look stalled.
  const noDate = { billNumber: 'HB1', lastAction: '', lastActionDate: '' };
  assert.equal(C.billOutcome(noDate, SESSION, '2026-09-30'), 'moving');
  const undef = { billNumber: 'HB1' };
  assert.equal(C.billOutcome(undef, SESSION, '2026-09-30'), 'moving');
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

const B = (n, type, lastAction, lastActionDate, extra = {}) => ({
  billNumber: n, type, lastAction, lastActionDate, programArea: 'Housing', title: `Title ${n}`,
  category: ['Affordable Housing'], ...extra,
});
const BILLS = [
  B('HB5234', 'Endorsed', 'Public Act . . . . . . . . . 104-0514', '6/26/2026'),
  B('SB3763', 'Endorsed', 'Referred to Assignments', '2/5/2026', { category: ['Building Conditions'] }),
  B('SB0062', 'Endorsed', 'Rule 3-9(a) / Re-referred to Assignments', '5/22/2026'),
  B('HB5198', 'Sponsored', 'Rule 3-9(a) / Re-referred to Assignments', '5/22/2026'),
  B('HB9999', 'Watching', 'Referred to Rules Committee', '2/1/2026'),
  B('HB4782', 'Endorsed', 'Referred to Rules Committee', '2/1/2026', { programArea: 'CLS' }),
];
const DEFS = [{ id: 'junk-fees', ga: 104, programArea: 'Housing', name: 'Ban landlord junk fees',
                why: 'Caps fees.', bills: ['HB5234', 'SB3763'] }];

test('buildCampaigns: pairs take the best outcome and union categories', () => {
  const { campaigns, warnings } = C.buildCampaigns(BILLS, DEFS, SESSION, '2026-09-30');
  assert.deepEqual(warnings, []);
  const c = campaigns.find(x => x.id === 'junk-fees');
  assert.equal(c.outcome, 'law');
  assert.equal(c.pa, '104-0514');
  assert.equal(C.normBill(c.best.billNumber), 'HB5234');
  assert.deepEqual(c.categories.sort(), ['Affordable Housing', 'Building Conditions']);
  assert.equal(c.bills.length, 2);
});

test('buildCampaigns: endorsed/sponsored bills without a def get a fallback; watching bills do not', () => {
  const { campaigns } = C.buildCampaigns(BILLS, DEFS, SESSION, '2026-09-30');
  const ids = campaigns.map(c => c.id).sort();
  assert.deepEqual(ids, ['bill-HB4782', 'bill-HB5198', 'bill-SB62', 'junk-fees']);
  const fb = campaigns.find(c => c.id === 'bill-SB62');
  assert.equal(fb.name, 'Title SB0062');
  assert.equal(fb.why, null);
  assert.equal(fb.fallback, true);
  assert.equal(campaigns.find(c => c.id === 'bill-HB5198').type, 'Sponsored');
  assert.equal(campaigns.find(c => c.id === 'bill-HB4782').programArea, 'CLS');
});

test('buildCampaigns: missing file, unknown bills and duplicates warn instead of crashing', () => {
  assert.equal(C.buildCampaigns(BILLS, null, null, '2026-09-30').campaigns.length, 5);
  const defs = [...DEFS, { id: 'dup', bills: ['hb5234', 'HB0000123'] }];
  const { campaigns, warnings } = C.buildCampaigns(BILLS, defs, SESSION, '2026-09-30');
  assert.equal(warnings.length, 2);
  assert.ok(!campaigns.some(c => c.id === 'dup'));  // no bills left → no campaign
});

test('buildCampaigns: staff override wins; leadBill respected', () => {
  const defs = [{ ...DEFS[0], leadBill: 'SB3763', outcomeOverride: 'moving', overrideNote: 'x' }];
  const c = C.buildCampaigns(BILLS, defs, SESSION, '2026-09-30').campaigns.find(x => x.id === 'junk-fees');
  assert.equal(c.outcome, 'moving');
  assert.equal(c.pa, null);
  assert.equal(C.normBill(c.lead.billNumber), 'SB3763');
  const bad = [{ ...DEFS[0], outcomeOverride: 'won' }];
  assert.equal(C.buildCampaigns(BILLS, bad, SESSION, '2026-09-30').campaigns.find(x => x.id === 'junk-fees').outcome, 'law');
});

test('groupCampaigns orders groups by rank and sponsored first', () => {
  const { campaigns } = C.buildCampaigns(BILLS, DEFS, SESSION, '2026-09-30');
  const groups = C.groupCampaigns(campaigns.filter(c => c.programArea === 'Housing'));
  assert.deepEqual(groups.map(g => g.outcome), ['law', 'stalled']);
  assert.equal(groups[1].items[0].type, 'Sponsored');
  assert.deepEqual(C.outcomeCounts(campaigns), { law: 1, stalled: 3 });
});

test('comingUp: today and day 14 included, past and day 15 excluded, sorted', () => {
  const bills = [
    B('HB1', 'Endorsed', 'Assigned', '9/1/2026', { nextActionDate: '9/30/2026', nextActionType: 'Hearing Housing' }),
    B('HB2', 'Endorsed', 'Assigned', '9/1/2026', { nextActionDate: '10/14/2026' }),
    B('HB3', 'Endorsed', 'Assigned', '9/1/2026', { nextActionDate: '10/15/2026' }),
    B('HB4', 'Endorsed', 'Assigned', '9/1/2026', { nextActionDate: '9/29/2026' }),
  ];
  const { campaigns } = C.buildCampaigns(bills, [], SESSION, '2026-09-30');
  const rows = C.comingUp(campaigns, '2026-09-30');
  assert.deepEqual(rows.map(r => r.bill.billNumber), ['HB1', 'HB2']);
  assert.equal(rows[0].action, 'Hearing Housing');
  assert.equal(rows[1].action, 'Scheduled action');
});

test('floorVotes picks moving campaigns on 3rd Reading', () => {
  const bills = [B('HB1', 'Endorsed', 'Placed on Calendar Order of 3rd Reading', '3/1/2026')];
  const { campaigns } = C.buildCampaigns(bills, [], SESSION, '2026-03-02');
  assert.equal(C.floorVotes(campaigns).length, 1);
});

test('sessionStatus headlines', () => {
  assert.equal(C.sessionStatus(SESSION, '2026-09-30').headline,
    'Spring session is over. Veto session: Oct 14–16 and Oct 28–30.');
  assert.equal(C.sessionStatus(SESSION, '2026-10-15').headline, 'Veto session is underway: Oct 14–16 and Oct 28–30.');
  assert.equal(C.sessionStatus(SESSION, '2026-11-15').headline, 'Veto session is over.');
  assert.equal(C.sessionStatus(SESSION, '2025-12-01').headline, 'Spring session begins Jan 13.');
  assert.equal(C.sessionStatus(SESSION, '2027-01-20').headline, 'The 104th General Assembly has ended.');
  const st = C.sessionStatus(SESSION, '2026-09-30');
  assert.equal(st.springEnded, true);
  assert.equal(st.next.name, 'Veto session');
  assert.equal(C.sessionStatus(SESSION, '2026-04-01').springEnded, false);
});

test('sessionStatus tolerates missing or broken session data', () => {
  const st = C.sessionStatus(null, '2026-09-30');
  assert.equal(st.headline, '');
  assert.equal(st.springEnded, false);
  assert.equal(C.sessionStatus({ ga: 104, phases: 'oops' }, '2026-09-30').headline, '');
});

test('formatRange(s)', () => {
  assert.equal(C.formatRange({ start: '2026-10-14', end: '2026-10-14' }), 'Oct 14');
  assert.equal(C.formatRange({ start: '2026-10-30', end: '2026-11-01' }), 'Oct 30–Nov 1');
  assert.equal(C.formatRanges([{ start: '2026-10-14', end: '2026-10-16' }]), 'Oct 14–16');
  assert.equal(C.formatRanges([{ start: '2026-01-01', end: '2026-01-01' }, { start: '2026-01-02', end: '2026-01-02' },
                              { start: '2026-01-03', end: '2026-01-03' }]), 'Jan 1, Jan 2, and Jan 3');
});

test('comingUpEmptyText depends on phase', () => {
  assert.equal(C.comingUpEmptyText(C.sessionStatus(SESSION, '2026-09-30')),
    'No hearings scheduled. Bills can move again during veto session, Oct 14–16 and Oct 28–30.');
  assert.equal(C.comingUpEmptyText(C.sessionStatus(SESSION, '2026-10-15')),
    "No hearings scheduled for IFE's bills in the next two weeks.");
  assert.equal(C.comingUpEmptyText(C.sessionStatus(null, '2026-09-30')), 'No hearings scheduled.');
});

test('staffUpdate shows a dated label and hides after the GA', () => {
  const s = { ...SESSION, updates: { Housing: { text: 'We won.', date: '2026-06-15' }, CLS: null } };
  assert.deepEqual(C.staffUpdate(s, 'Housing', C.sessionStatus(s, '2026-09-30')),
    { text: 'We won.', label: 'IFE update, June 2026' });
  assert.equal(C.staffUpdate(s, 'CLS', C.sessionStatus(s, '2026-09-30')), null);
  assert.equal(C.staffUpdate(s, 'Housing', C.sessionStatus(s, '2027-02-01')), null);
  assert.equal(C.staffUpdate(null, 'Housing', C.sessionStatus(null, '2026-09-30')), null);
});

test('blurb per outcome', () => {
  const { campaigns } = C.buildCampaigns(BILLS, DEFS, SESSION, '2026-09-30');
  const st = C.sessionStatus(SESSION, '2026-09-30');
  assert.equal(C.blurb(campaigns.find(c => c.id === 'junk-fees'), st, 'https://x/#104-HB5234'),
    'IFE-endorsed: Ban landlord junk fees (HB5234) was signed into law as Public Act 104-0514. https://x/#104-HB5234');
  assert.equal(C.blurb(campaigns.find(c => c.id === 'bill-HB5198'), st, 'u'),
    "IFE-sponsored: Title HB5198 (HB5198) didn't advance this session. u");
});

test('isStale / latestFetch', () => {
  const bills = [{ ilgaFetchedAt: '2026-09-07T18:11:33Z' }, { ilgaFetchedAt: '2026-09-06T00:00:00Z' }, {}];
  assert.equal(C.latestFetch(bills), '2026-09-07T18:11:33Z');
  assert.equal(C.isStale(bills, new Date('2026-09-30T12:00:00Z')), true);
  assert.equal(C.isStale(bills, new Date('2026-09-08T12:00:00Z')), false);
  assert.equal(C.isStale([{}], new Date()), false);
});

test('sessionStatus drops malformed phase entries instead of crashing', () => {
  const session = {
    ga: 104,
    phases: [null, { name: 'Veto session', ranges: [{ start: 'bad', end: 'bad' }] }, ...SESSION.phases],
  };
  assert.equal(C.sessionStatus(session, '2026-09-30').headline,
    'Spring session is over. Veto session: Oct 14–16 and Oct 28–30.');
});

test('buildCampaigns: non-array bills is treated as empty instead of crashing', () => {
  const { campaigns, warnings } = C.buildCampaigns(null, DEFS, SESSION, '2026-09-30');
  assert.deepEqual(campaigns, []);
  assert.equal(warnings.length, 2);
});

test('buildCampaigns: malformed campaign entries warn and skip instead of crashing', () => {
  const { campaigns, warnings } = C.buildCampaigns(BILLS, [null, { bills: ['SB62'] }, ...DEFS], SESSION, '2026-09-30');
  assert.equal(warnings.length, 2);
  assert.ok(campaigns.some(c => c.id === 'junk-fees'));
  assert.ok(campaigns.some(c => c.id === 'bill-SB62'));
});
