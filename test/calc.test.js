const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../calc.js');

test('parseAmount handles common formats', () => {
  assert.equal(C.parseAmount('12.50'), 1250);
  assert.equal(C.parseAmount('£1,234.5'), 123450);
  assert.equal(C.parseAmount('-3'), -300);
  assert.equal(C.parseAmount('(4.20)'), -420);
  assert.equal(C.parseAmount('.99'), 99);
  assert.equal(C.parseAmount(''), null);
  assert.equal(C.parseAmount('abc'), null);
  assert.equal(C.parseAmount('1.234'), null);
});

test('sums avoid floating point drift', () => {
  assert.equal(C.sumPence(['0.1', '0.2']), 30);
  assert.equal(C.formatMoney(C.sumPence(['0.10', '0.20'])), '£0.30');
});

test('formatMoney', () => {
  assert.equal(C.formatMoney(123456), '£1,234.56');
  assert.equal(C.formatMoney(-5), '-£0.05');
  assert.equal(C.formatMoney(100, '€'), '€1.00');
});

test('reconcile matches and flags differences', () => {
  const r = C.reconcile({
    visa: { epos: ['100.00', '50.25'], pdf: ['150.25'] },
    mastercard: { epos: ['80'], pdf: ['79.50'] },
    amex: { epos: [''], pdf: [''] },
    cash: { epos: ['200'], pdf: ['200.00'] },
  });
  const by = Object.fromEntries(r.rows.map((x) => [x.id, x]));
  assert.equal(by.visa.match, true);
  assert.equal(by.mastercard.match, false);
  assert.equal(by.mastercard.diff, -50);
  assert.equal(r.cards.epos, 23025);
  assert.equal(r.cards.pdf, 22975);
  assert.equal(r.total.match, false);
  assert.match(C.reconciliationText(r), /Mastercard: EPOS £80.00 \/ PDF £79.50 - DIFFERENCE -£0.50/);
});

test('templates and email building', () => {
  const vars = { name: 'Sam', room: 'Bar', shift: 'PM', date: '02/10/2026', day: 'Friday' };
  assert.equal(C.fillTemplate('{room} handover {date} {unknown}', vars), 'Bar handover 02/10/2026 {unknown}');
  const e = C.buildEmail({ greeting: 'Hi all,', notes: 'All good.', reconciliation: '', signOff: 'Thanks,\n{name}', subject: '{room} – {shift}', vars });
  assert.equal(e.subject, 'Bar – PM');
  assert.equal(e.body, 'Hi all,\n\nAll good.\n\nThanks,\nSam');
});

test('mailtoUrl encodes recipients and body', () => {
  const url = C.mailtoUrl({ to: 'a@x.com; b@y.com', cc: 'c@z.com', subject: 'Hi & bye', body: 'l1\nl2' });
  assert.equal(url, 'mailto:a@x.com,b@y.com?cc=c%40z.com&subject=Hi%20%26%20bye&body=l1%0D%0Al2');
});
