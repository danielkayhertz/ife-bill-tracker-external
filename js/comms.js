/* IFE comms layer — pure logic, no DOM access.
 * Loaded by index.html as window.Comms; tested in Node via `node --test tests/comms.test.js`. */
(function (root) {
  'use strict';

  const OUTCOME_RANK = ['law', 'governor', 'vetoed', 'moving', 'stalled', 'died'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const FULL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                       'August', 'September', 'October', 'November', 'December'];

  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // 'SB0062' | ' sb 62 ' -> 'SB62'; null if not a bill number
  function normBill(s) {
    const m = String(s || '').toUpperCase().replace(/\s+/g, '').match(/^([A-Z]+)0*(\d+)$/);
    return m ? m[1] + m[2] : null;
  }

  // '#104-HB5234' | '#HB5234' -> { ga, billNumber }; null if not a bill link
  function parseHash(hash, currentGa) {
    const m = String(hash || '').replace(/^#/, '').match(/^(?:(\d+)-)?([A-Za-z]+\s*\d+)$/);
    if (!m) return null;
    const billNumber = normBill(m[2]);
    if (!billNumber) return null;
    return { ga: m[1] ? parseInt(m[1], 10) : currentGa, billNumber };
  }

  function hashFor(ga, billNumber) { return '#' + ga + '-' + normBill(billNumber); }

  // ILGA 'M/D/YYYY' -> 'YYYY-MM-DD'
  function mdyToIso(s) {
    const m = String(s || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : null;
  }

  // Local calendar date, not UTC — an 11pm visitor in Chicago is still "today".
  function localIso(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function addDaysIso(iso, n) {
    const [y, m, d] = iso.split('-').map(Number);
    return localIso(new Date(y, m - 1, d + n));
  }

  function springEnd(session) {
    const p = (session?.phases || []).find(x => /spring/i.test(x.name || ''));
    const r = p?.ranges || [];
    return r.length ? r[r.length - 1].end : null;
  }

  function hasUpcoming(bill, todayIso) {
    const n = mdyToIso(bill.nextActionDate);
    return !!n && n >= todayIso;
  }

  function billOutcome(bill, session, todayIso) {
    const la = bill.lastAction || '';
    if (/Public Act|Governor Approved|Effective Date/i.test(la)) return 'law';
    if (/Veto Stands/i.test(la)) return 'died';
    if (/Total Veto|Amendatory Veto|Vetoed/i.test(la) && !/Overridden|Accepted/i.test(la)) return 'vetoed';
    if (/Sent to the Governor|Passed Both Houses/i.test(la)) return 'governor';
    if (session?.gaEnd && todayIso > session.gaEnd) return 'died';
    if (/Rule 19\([ab]\)|Rule 3-9\([ab]\)/i.test(la)) return 'stalled';
    const se = springEnd(session);
    if (se && todayIso > se) {
      const last = mdyToIso(bill.lastActionDate);
      if ((!last || last <= se) && !hasUpcoming(bill, todayIso)) return 'stalled';
    }
    return 'moving';
  }

  function paNumber(bill) {
    const m = String(bill.lastAction || '').match(/Public Act[^\d]*(\d{3})-(\d{4})/i);
    return m ? `${m[1]}-${m[2]}` : null;
  }

  function awaitingFloorVote(bill) { return /3rd Reading/i.test(bill.lastAction || ''); }

  function ordinal(n) {
    if (!n) return '';
    const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  function outcomeLabel(outcome, status, pa) {
    switch (outcome) {
      case 'law':      return pa ? `Law · PA ${pa}` : 'Law';
      case 'governor': return "On the governor's desk";
      case 'vetoed':   return 'Vetoed · override possible';
      case 'moving':   return 'Moving';
      case 'stalled':  return status?.springEnded ? "Didn't advance this session" : 'Stalled';
      case 'died':     return status?.ga ? `Died with the ${ordinal(status.ga)} GA` : 'Did not pass';
    }
    return '';
  }

  function groupHeading(outcome, status) {
    return {
      law: 'Became law', governor: "On the governor's desk", vetoed: 'Vetoed', moving: 'Moving',
      stalled: status?.springEnded ? "Didn't advance this session" : 'Stalled', died: 'Did not pass',
    }[outcome] || '';
  }

  const api = {
    OUTCOME_RANK, MONTHS, FULL_MONTHS, esc, normBill, parseHash, hashFor, mdyToIso, localIso, addDaysIso,
    springEnd, hasUpcoming, billOutcome, paNumber, awaitingFloorVote, ordinal, outcomeLabel, groupHeading,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Comms = api;
})(typeof window !== 'undefined' ? window : globalThis);
