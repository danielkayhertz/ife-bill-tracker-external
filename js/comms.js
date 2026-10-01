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

  // Comms.esc() escapes HTML metacharacters but doesn't vet URL schemes, so an ILGA/staff
  // bill.url of 'javascript:...' would still execute when used as an href. Only http(s) links
  // are allowed through; anything else (javascript:, data:, vbscript:, protocol-relative, etc.)
  // becomes '#'.
  function safeUrl(u) {
    const s = String(u ?? '').trim();
    return /^https?:\/\//i.test(s) ? s : '#';
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

  const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  // Keeps only phases that are objects with a string name and at least one well-formed range;
  // drops individual malformed ranges first, then drops the phase if none survive. Shared by
  // springEnd and sessionStatus so malformed session.json data can't desync the two.
  function cleanPhases(phases) {
    return (Array.isArray(phases) ? phases : [])
      .filter(p => p && typeof p === 'object' && typeof p.name === 'string' && Array.isArray(p.ranges) && p.ranges.length)
      .map(p => ({ ...p, ranges: p.ranges.filter(r => r && ISO_DATE_RE.test(r.start) && ISO_DATE_RE.test(r.end)) }))
      .filter(p => p.ranges.length);
  }

  function springEnd(session) {
    const p = cleanPhases(session?.phases).find(x => /spring/i.test(x.name));
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
      // A missing lastActionDate (e.g. FALLBACK_DATA, used when bills.json can't be read) must
      // not be treated as "no activity since spring" — that would mark every such bill stalled.
      if (last && last <= se && !hasUpcoming(bill, todayIso)) return 'stalled';
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

  const rank = o => OUTCOME_RANK.indexOf(o);

  function makeCampaign(def, members, session, todayIso) {
    const bills = members.map(b => ({ bill: b, outcome: billOutcome(b, session, todayIso) }));
    const bestEntry = bills.reduce((a, c) => (rank(c.outcome) < rank(a.outcome) ? c : a));
    const lead = members.find(b => normBill(b.billNumber) === normBill(def.leadBill)) || bestEntry.bill;
    const outcome = OUTCOME_RANK.includes(def.outcomeOverride) ? def.outcomeOverride : bestEntry.outcome;
    return {
      id: def.id,
      ga: def.ga || session?.ga || null,
      programArea: def.programArea || lead.programArea || 'Housing',
      name: def.name || lead.title || normBill(lead.billNumber),
      why: def.why || null,
      winNote: def.winNote || null,
      overrideNote: def.overrideNote || null,
      fallback: !!def.fallback,
      type: members.some(b => b.type === 'Sponsored') ? 'Sponsored' : 'Endorsed',
      categories: [...new Set(members.flatMap(b => (Array.isArray(b.category) ? b.category : [])))],
      lead,
      best: bestEntry.bill,
      bills,
      outcome,
      pa: outcome === 'law' && bestEntry.outcome === 'law' ? paNumber(bestEntry.bill) : null,
      lastActionIso: members.map(b => mdyToIso(b.lastActionDate)).filter(Boolean).sort().pop() || '',
    };
  }

  function buildCampaigns(bills, defs, session, todayIso) {
    const billList = Array.isArray(bills) ? bills : [];
    const byNum = new Map(billList.map(b => [normBill(b.billNumber), b]));
    const used = new Set();
    const campaigns = [];
    const warnings = [];
    (Array.isArray(defs) ? defs : []).forEach((def, i) => {
      if (!def || typeof def !== 'object') { warnings.push(`campaign entry ${i} is not an object`); return; }
      if (typeof def.id !== 'string' || !def.id) { warnings.push(`campaign entry ${i} has no id`); return; }
      const members = [];
      for (const n of Array.isArray(def.bills) ? def.bills : []) {
        const k = normBill(n);
        const b = byNum.get(k);
        if (!b) { warnings.push(`${def.id}: bill ${n} not found`); continue; }
        if (used.has(k)) { warnings.push(`${def.id}: ${n} is already in another campaign`); continue; }
        used.add(k);
        members.push(b);
      }
      if (members.length) campaigns.push(makeCampaign(def, members, session, todayIso));
    });
    for (const b of billList) {
      const k = normBill(b.billNumber);
      if ((b.type === 'Endorsed' || b.type === 'Sponsored') && !used.has(k)) {
        used.add(k);
        campaigns.push(makeCampaign({ id: 'bill-' + k, fallback: true }, [b], session, todayIso));
      }
    }
    return { campaigns, warnings };
  }

  function groupCampaigns(campaigns) {
    return OUTCOME_RANK
      .map(outcome => ({
        outcome,
        items: campaigns.filter(c => c.outcome === outcome).sort((a, b) =>
          (a.type === 'Sponsored' ? 0 : 1) - (b.type === 'Sponsored' ? 0 : 1)
          || b.lastActionIso.localeCompare(a.lastActionIso)),
      }))
      .filter(g => g.items.length);
  }

  function outcomeCounts(campaigns) {
    const c = {};
    for (const x of campaigns) c[x.outcome] = (c[x.outcome] || 0) + 1;
    return c;
  }

  function comingUp(campaigns, todayIso, days = 14) {
    const end = addDaysIso(todayIso, days);
    const rows = [];
    for (const campaign of campaigns) {
      for (const { bill } of campaign.bills) {
        const date = mdyToIso(bill.nextActionDate);
        if (date && date >= todayIso && date <= end) {
          rows.push({ date, campaign, bill, action: bill.nextActionType || 'Scheduled action' });
        }
      }
    }
    return rows.sort((a, b) => a.date.localeCompare(b.date) || a.bill.billNumber.localeCompare(b.bill.billNumber));
  }

  function floorVotes(campaigns) {
    return campaigns.filter(c => c.outcome === 'moving'
      && c.bills.some(x => x.outcome === 'moving' && awaitingFloorVote(x.bill)));
  }

  function formatDate(iso) {
    const [, m, d] = iso.split('-').map(Number);
    return `${MONTHS[m - 1]} ${d}`;
  }

  function formatRange(r) {
    const [, sm, sd] = r.start.split('-').map(Number);
    const [, em, ed] = r.end.split('-').map(Number);
    if (r.start === r.end) return `${MONTHS[sm - 1]} ${sd}`;
    if (sm === em) return `${MONTHS[sm - 1]} ${sd}–${ed}`;
    return `${MONTHS[sm - 1]} ${sd}–${MONTHS[em - 1]} ${ed}`;
  }

  function formatRanges(ranges) {
    const parts = ranges.map(formatRange);
    return parts.length <= 2 ? parts.join(' and ') : parts.slice(0, -1).join(', ') + ', and ' + parts[parts.length - 1];
  }

  function sessionStatus(session, todayIso) {
    const empty = { ga: session?.ga || null, headline: '', springEnded: false, gaEnded: false, current: null, next: null };
    if (!session || !Array.isArray(session.phases)) return empty;
    const phases = cleanPhases(session.phases)
      .map(p => ({ ...p, start: p.ranges[0].start, end: p.ranges[p.ranges.length - 1].end }));
    const current = phases.find(p => todayIso >= p.start && todayIso <= p.end) || null;
    const next = phases.filter(p => p.start > todayIso).sort((a, b) => a.start.localeCompare(b.start))[0] || null;
    const past = phases.filter(p => p.end < todayIso).sort((a, b) => a.end.localeCompare(b.end)).pop() || null;
    const se = springEnd(session);
    const gaEnded = !!session.gaEnd && todayIso > session.gaEnd;
    let headline = '';
    if (gaEnded) headline = `The ${ordinal(session.ga)} General Assembly has ended.`;
    else if (current) headline = `${current.name} is underway: ${formatRanges(current.ranges)}.`;
    else if (past && next) headline = `${past.name} is over. ${next.name}: ${formatRanges(next.ranges)}.`;
    else if (past) headline = `${past.name} is over.`;
    else if (next) headline = `${next.name} begins ${formatDate(next.start)}.`;
    return { ga: session.ga || null, headline, springEnded: !!se && todayIso > se, gaEnded, current, next };
  }

  function comingUpEmptyText(status) {
    if (status.gaEnded) return 'No hearings scheduled.';
    if (status.current) return "No hearings scheduled for IFE's bills in the next two weeks.";
    if (status.next) {
      const name = status.next.name.charAt(0).toLowerCase() + status.next.name.slice(1);
      return `No hearings scheduled. Bills can move again during ${name}, ${formatRanges(status.next.ranges)}.`;
    }
    return 'No hearings scheduled.';
  }

  function staffUpdate(session, programArea, status) {
    const u = session?.updates?.[programArea];
    if (!u || !u.text || status.gaEnded) return null;
    const [y, m] = String(u.date || '').split('-').map(Number);
    return { text: u.text, label: y && m ? `IFE update, ${FULL_MONTHS[m - 1]} ${y}` : 'IFE update' };
  }

  function blurb(c, status, url) {
    const who = c.type === 'Sponsored' ? 'IFE-sponsored' : 'IFE-endorsed';
    const ref = `${c.name} (${normBill((c.outcome === 'law' ? c.best : c.lead).billNumber)})`;
    const body = {
      law: c.pa ? `was signed into law as Public Act ${c.pa}.` : 'was signed into law.',
      governor: "passed both chambers and is on the governor's desk.",
      vetoed: 'was vetoed. The General Assembly can still override the veto.',
      moving: 'is moving in the Illinois General Assembly.',
      stalled: status?.springEnded ? "didn't advance this session." : 'is stalled in the Illinois General Assembly.',
      died: `did not pass in the ${ordinal(c.ga)} General Assembly.`,
    }[c.outcome];
    return `${who}: ${ref} ${body} ${url}`.trim();
  }

  function latestFetch(bills) {
    return bills.map(b => b.ilgaFetchedAt).filter(Boolean).sort().pop() || null;
  }

  function isStale(bills, now, days = 3) {
    const f = latestFetch(bills);
    return !!f && (now - new Date(f)) > days * 86400000;
  }

  const api = {
    OUTCOME_RANK, MONTHS, FULL_MONTHS, esc, safeUrl, normBill, parseHash, hashFor, mdyToIso, localIso, addDaysIso,
    springEnd, hasUpcoming, billOutcome, paNumber, awaitingFloorVote, ordinal, outcomeLabel, groupHeading,
    buildCampaigns, groupCampaigns, outcomeCounts, comingUp, floorVotes, sessionStatus, formatRange,
    formatRanges, comingUpEmptyText, staffUpdate, blurb, latestFetch, isStale,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Comms = api;
})(typeof window !== 'undefined' ? window : globalThis);
