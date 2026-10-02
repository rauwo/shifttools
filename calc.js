/*
 * Pure helpers shared by the browser app and the Node tests.
 * All money is handled as integer pence to avoid floating point drift.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ShiftCalc = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const PAYMENT_TYPES = [
    { id: 'visa', label: 'Visa' },
    { id: 'mastercard', label: 'Mastercard' },
    { id: 'amex', label: 'Amex' },
    { id: 'cash', label: 'Cash' },
  ];

  // "£1,234.50", "12.5", "-3", "(4.20)" -> pence. Returns null for blank/invalid.
  function parseAmount(input) {
    if (input === null || input === undefined) return null;
    let s = String(input).trim();
    if (!s) return null;
    let negative = false;
    if (/^\(.*\)$/.test(s)) {
      negative = true;
      s = s.slice(1, -1).trim();
    }
    s = s.replace(/[£$€,\s]/g, '');
    if (s.startsWith('-')) {
      negative = !negative;
      s = s.slice(1);
    }
    if (!/^\d*(\.\d{0,2})?$/.test(s) || s === '' || s === '.') return null;
    const [whole, frac = ''] = s.split('.');
    const pence = Number(whole || '0') * 100 + Number((frac + '00').slice(0, 2));
    return negative ? -pence : pence;
  }

  function sumPence(values) {
    return values.reduce((total, v) => {
      const p = typeof v === 'number' ? v : parseAmount(v);
      return p === null ? total : total + p;
    }, 0);
  }

  function formatMoney(pence, symbol = '£') {
    const sign = pence < 0 ? '-' : '';
    const abs = Math.abs(pence);
    const pounds = Math.floor(abs / 100).toLocaleString('en-GB');
    const pp = String(abs % 100).padStart(2, '0');
    return `${sign}${symbol}${pounds}.${pp}`;
  }

  // entries: { visa: { epos: [..], pdf: [..] }, ... }
  function reconcile(entries) {
    const rows = PAYMENT_TYPES.map(({ id, label }) => {
      const e = (entries && entries[id]) || {};
      const epos = sumPence(e.epos || []);
      const pdf = sumPence(e.pdf || []);
      return { id, label, epos, pdf, diff: pdf - epos, match: epos === pdf };
    });
    const cardRows = rows.filter((r) => r.id !== 'cash');
    const cards = {
      epos: sumPence(cardRows.map((r) => r.epos)),
      pdf: sumPence(cardRows.map((r) => r.pdf)),
    };
    cards.diff = cards.pdf - cards.epos;
    cards.match = cards.diff === 0;
    const total = {
      epos: sumPence(rows.map((r) => r.epos)),
      pdf: sumPence(rows.map((r) => r.pdf)),
    };
    total.diff = total.pdf - total.epos;
    total.match = rows.every((r) => r.match);
    return { rows, cards, total };
  }

  // Replaces {placeholders}; unknown placeholders are left untouched.
  function fillTemplate(template, vars) {
    return String(template || '').replace(/\{(\w+)\}/g, (m, key) =>
      Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : m
    );
  }

  function reconciliationText(result, symbol = '£') {
    const fmt = (p) => formatMoney(p, symbol);
    const line = (label, r) =>
      `${label}: EPOS ${fmt(r.epos)} / PDF ${fmt(r.pdf)} - ` +
      (r.match ? 'MATCH' : `DIFFERENCE ${fmt(r.diff)}`);
    return [
      'Takings reconciliation',
      ...result.rows.map((r) => line(r.label, r)),
      line('Cards total', result.cards),
      line('Grand total', result.total),
    ].join('\n');
  }

  function buildEmail({ greeting, notes, reconciliation, signOff, subject, vars }) {
    const parts = [
      fillTemplate(greeting, vars).trim(),
      String(notes || '').trim(),
      String(reconciliation || '').trim(),
      fillTemplate(signOff, vars).trim(),
    ].filter(Boolean);
    return { subject: fillTemplate(subject, vars).trim(), body: parts.join('\n\n') };
  }

  function mailtoUrl({ to, cc, subject, body }) {
    const params = [];
    if (cc) params.push('cc=' + encodeURIComponent(cc));
    if (subject) params.push('subject=' + encodeURIComponent(subject));
    if (body) params.push('body=' + encodeURIComponent(body.replace(/\r?\n/g, '\r\n')));
    const addr = String(to || '')
      .split(/[;,]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((a) => encodeURIComponent(a).replace(/%40/g, '@'))
      .join(',');
    return `mailto:${addr}${params.length ? '?' + params.join('&') : ''}`;
  }

  return {
    PAYMENT_TYPES,
    parseAmount,
    sumPence,
    formatMoney,
    reconcile,
    fillTemplate,
    reconciliationText,
    buildEmail,
    mailtoUrl,
  };
});
