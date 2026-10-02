/* Shift Tools – EPOS/PDF reconciliation and handover emails. */
(function () {
  'use strict';

  const C = window.ShiftCalc;
  const SETTINGS_KEY = 'shifttools.settings.v1';
  const RECON_KEY = 'shifttools.recon.v1';
  const HANDOVER_KEY = 'shifttools.handover.v1';

  const todayISO = () => {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  };

  const uid = () => Math.random().toString(36).slice(2, 10);

  const DEFAULT_SETTINGS = () => ({
    name: '',
    currency: '£',
    rooms: [
      {
        id: uid(),
        name: 'Bar',
        to: '',
        cc: '',
        subject: '{room} handover – {day} {date} ({shift})',
        starters: [
          'Tills were cashed up and',
          'Stock running low on',
          'Kegs changed:',
          'Glass washer is',
          'Customer issues tonight:',
          'Breakages / wastage:',
          'Please could the next shift',
        ],
      },
      {
        id: uid(),
        name: 'Restaurant',
        to: '',
        cc: '',
        subject: '{room} handover – {day} {date} ({shift})',
        starters: [
          'Covers tonight were',
          'Bookings for tomorrow:',
          'Complaints / compliments:',
          '86’d items:',
          'Staffing:',
          'Maintenance needed on',
          'Please could the next shift',
        ],
      },
    ],
    greetings: [
      { id: uid(), label: 'Hi all', text: 'Hi all,\n\nPlease see the {room} handover for {shift} on {day} {date} below.' },
      { id: uid(), label: 'Morning team', text: 'Good morning team,' },
      { id: uid(), label: 'Evening team', text: 'Good evening team,' },
    ],
    signoffs: [
      { id: uid(), label: 'Many thanks', text: 'Many thanks,\n{name}' },
      { id: uid(), label: 'Kind regards', text: 'Kind regards,\n\n{name}\n{room} Team' },
      { id: uid(), label: 'Cheers', text: 'Cheers,\n{name}' },
    ],
  });

  // ---------- storage ----------
  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }
  function save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable – keep working in memory */
    }
  }

  function normaliseSettings(s) {
    const d = DEFAULT_SETTINGS();
    if (!s || typeof s !== 'object') return d;
    const list = (v, fb) => (Array.isArray(v) ? v : fb);
    return {
      name: typeof s.name === 'string' ? s.name : '',
      currency: typeof s.currency === 'string' && s.currency ? s.currency : '£',
      rooms: list(s.rooms, d.rooms).map((r) => ({
        id: r.id || uid(),
        name: String(r.name || 'Room'),
        to: String(r.to || ''),
        cc: String(r.cc || ''),
        subject: String(r.subject ?? ''),
        starters: list(r.starters, []).map(String),
      })),
      greetings: list(s.greetings, d.greetings).map((g) => ({ id: g.id || uid(), label: String(g.label || ''), text: String(g.text || '') })),
      signoffs: list(s.signoffs, d.signoffs).map((g) => ({ id: g.id || uid(), label: String(g.label || ''), text: String(g.text || '') })),
    };
  }

  let settings = normaliseSettings(load(SETTINGS_KEY, null));
  const saveSettings = () => save(SETTINGS_KEY, settings);

  const emptyRecon = () =>
    Object.fromEntries(C.PAYMENT_TYPES.map((t) => [t.id, { epos: [''], pdf: [''] }]));
  let recon = load(RECON_KEY, null) || emptyRecon();
  C.PAYMENT_TYPES.forEach((t) => {
    recon[t.id] = recon[t.id] || { epos: [''], pdf: [''] };
    ['epos', 'pdf'].forEach((side) => {
      if (!Array.isArray(recon[t.id][side]) || !recon[t.id][side].length) recon[t.id][side] = [''];
    });
  });
  const saveRecon = () => save(RECON_KEY, recon);

  let handover = Object.assign(
    { roomId: '', shift: '', date: '', notes: '', to: '', cc: '', subject: '', greetingId: '', signoffId: '', includeRecon: false },
    load(HANDOVER_KEY, {})
  );
  handover.date = todayISO(); // always start on today's date
  const saveHandover = () => save(HANDOVER_KEY, handover);

  // ---------- helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const money = (p) => C.formatMoney(p, settings.currency);
  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v === true ? '' : v);
    }
    children.flat().forEach((c) => c != null && node.append(c));
    return node;
  }

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 2200);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = el('textarea', { style: 'position:fixed;opacity:0' });
      ta.value = text;
      document.body.append(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
  }

  // ---------- tabs ----------
  function showTab(name) {
    document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
    document.querySelectorAll('.tab-panel').forEach((p) => (p.hidden = p.id !== 'tab-' + name));
    if (name === 'handover') renderHandover();
    if (name === 'settings') renderSettings();
    if (name === 'reconcile') renderRecon();
    try { localStorage.setItem('shifttools.tab', name); } catch { /* ignore */ }
  }
  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

  // ============ RECONCILE ============
  function statusBadge(r) {
    if (r.epos === 0 && r.pdf === 0) return el('span', { class: 'badge empty', text: '—' });
    return r.match ? el('span', { class: 'badge ok', text: '✓ Match' }) : el('span', { class: 'badge bad', text: '✗ Out' });
  }

  function renderRecon(focus) {
    const container = $('#recon-cards');
    container.replaceChildren();
    const result = C.reconcile(recon);

    result.rows.forEach((row) => {
      const state = row.epos === 0 && row.pdf === 0 ? '' : row.match ? 'match' : 'mismatch';
      const card = el('div', { class: `card recon-card ${state}`, 'data-type': row.id },
        el('header', {}, el('h3', { text: row.label }), statusBadge(row)),
        el('div', { class: 'recon-cols' }, ['epos', 'pdf'].map((side) => reconColumn(row.id, side, row[side]))),
        el('div', { class: 'diff-line' },
          row.match
            ? el('span', { class: 'muted', text: 'Difference: ' + money(0) })
            : el('span', { class: 'badge bad', text: `Difference (PDF − EPOS): ${money(row.diff)}` })
        )
      );
      container.append(card);
    });

    renderSummary(result);
    if (focus) {
      const input = container.querySelector(`[data-type="${focus.type}"] [data-side="${focus.side}"][data-index="${focus.index}"]`);
      if (input) {
        input.focus();
        const len = input.value.length;
        input.setSelectionRange(len, len);
      }
    }
  }

  function reconColumn(type, side, total) {
    const values = recon[type][side];
    const col = el('div', { class: 'recon-col' }, el('h4', { text: side === 'epos' ? 'EPOS' : 'PDF' }));
    values.forEach((v, i) => {
      const input = el('input', {
        inputmode: 'decimal',
        autocomplete: 'off',
        placeholder: '0.00',
        'aria-label': `${type} ${side} line ${i + 1}`,
        'data-type': type,
        'data-side': side,
        'data-index': i,
        value: v,
      });
      if (v && C.parseAmount(v) === null) input.classList.add('invalid');
      input.addEventListener('input', () => {
        recon[type][side][i] = input.value;
        input.classList.toggle('invalid', !!input.value && C.parseAmount(input.value) === null);
        saveRecon();
        refreshReconTotals();
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (i === values.length - 1) values.push('');
          saveRecon();
          renderRecon({ type, side, index: i + 1 });
        }
      });
      const remove = el('button', {
        class: 'icon-btn',
        title: 'Remove line',
        'aria-label': 'Remove line',
        text: '×',
        onclick: () => {
          values.splice(i, 1);
          if (!values.length) values.push('');
          saveRecon();
          renderRecon();
        },
      });
      col.append(el('div', { class: 'entry' }, input, values.length > 1 ? remove : null));
    });
    col.append(
      el('button', {
        class: 'add-line',
        text: '+ Add line',
        onclick: () => {
          values.push('');
          saveRecon();
          renderRecon({ type, side, index: values.length - 1 });
        },
      }),
      el('div', { class: 'col-total' }, el('span', { text: 'Total' }), el('span', { class: 'js-total', 'data-type': type, 'data-side': side, text: money(total) }))
    );
    return col;
  }

  // Updates totals/status without rebuilding inputs (keeps focus while typing).
  function refreshReconTotals() {
    const result = C.reconcile(recon);
    result.rows.forEach((row) => {
      const card = $(`.recon-card[data-type="${row.id}"]`);
      if (!card) return;
      card.querySelectorAll('.js-total').forEach((t) => (t.textContent = money(row[t.dataset.side])));
      card.classList.remove('match', 'mismatch');
      if (!(row.epos === 0 && row.pdf === 0)) card.classList.add(row.match ? 'match' : 'mismatch');
      card.querySelector('header .badge').replaceWith(statusBadge(row));
      const diff = card.querySelector('.diff-line');
      diff.replaceChildren(
        row.match
          ? el('span', { class: 'muted', text: 'Difference: ' + money(0) })
          : el('span', { class: 'badge bad', text: `Difference (PDF − EPOS): ${money(row.diff)}` })
      );
    });
    renderSummary(result);
  }

  function renderSummary(result) {
    const tbody = $('#recon-summary');
    const tr = (label, r, cls = '') =>
      el('tr', { class: cls },
        el('td', { text: label }),
        el('td', { text: money(r.epos) }),
        el('td', { text: money(r.pdf) }),
        el('td', { class: r.diff ? 'bad' : '', text: money(r.diff) }),
        el('td', {}, statusBadge(r))
      );
    tbody.replaceChildren(
      ...result.rows.map((r) => tr(r.label, r)),
      tr('Cards (Visa + MC + Amex)', result.cards, 'subtotal'),
      tr('Grand total', result.total, 'total')
    );
    const overall = $('#recon-overall');
    const anything = result.total.epos !== 0 || result.total.pdf !== 0;
    const outCount = result.rows.filter((r) => !r.match).length;
    overall.className = 'overall ' + (!anything ? 'empty' : result.total.match ? 'ok' : 'bad');
    overall.textContent = !anything
      ? 'Enter figures to start reconciling'
      : result.total.match
        ? '✓ Everything balances – EPOS and PDFs agree'
        : `✗ ${outCount} payment type${outCount === 1 ? '' : 's'} not balancing`;
  }

  $('#recon-clear').addEventListener('click', () => {
    if (!confirm('Clear all EPOS and PDF figures?')) return;
    recon = emptyRecon();
    saveRecon();
    renderRecon();
  });
  $('#recon-copy').addEventListener('click', async () => {
    await copyText(C.reconciliationText(C.reconcile(recon), settings.currency));
    toast('Summary copied');
  });
  $('#recon-to-handover').addEventListener('click', () => {
    handover.includeRecon = true;
    saveHandover();
    showTab('handover');
  });

  // ============ HANDOVER ============
  const currentRoom = () => settings.rooms.find((r) => r.id === handover.roomId) || settings.rooms[0] || null;

  function templateVars() {
    const room = currentRoom();
    const d = handover.date ? new Date(handover.date + 'T12:00:00') : new Date();
    return {
      name: $('#ho-name').value.trim() || settings.name,
      room: room ? room.name : '',
      shift: handover.shift,
      date: d.toLocaleDateString('en-GB'),
      day: d.toLocaleDateString('en-GB', { weekday: 'long' }),
    };
  }

  function applyRoomDefaults(room) {
    handover.to = room ? room.to : '';
    handover.cc = room ? room.cc : '';
    handover.subject = room ? room.subject : '';
  }

  function fillSelect(select, items, selectedId, labelOf) {
    select.replaceChildren(...items.map((it) => el('option', { value: it.id, text: labelOf(it), selected: it.id === selectedId })));
    if (!items.some((it) => it.id === selectedId) && items[0]) select.value = items[0].id;
  }

  function renderHandover() {
    if (!settings.rooms.some((r) => r.id === handover.roomId)) {
      handover.roomId = settings.rooms[0] ? settings.rooms[0].id : '';
      applyRoomDefaults(currentRoom());
    }
    if (!handover.date) handover.date = todayISO();
    if (!settings.greetings.some((g) => g.id === handover.greetingId)) handover.greetingId = settings.greetings[0]?.id || '';
    if (!settings.signoffs.some((g) => g.id === handover.signoffId)) handover.signoffId = settings.signoffs[0]?.id || '';

    fillSelect($('#ho-room'), settings.rooms, handover.roomId, (r) => r.name);
    fillSelect($('#ho-greeting'), [{ id: '', label: '(none)' }, ...settings.greetings], handover.greetingId, (g) => g.label || '(untitled)');
    fillSelect($('#ho-signoff'), [{ id: '', label: '(none)' }, ...settings.signoffs], handover.signoffId, (g) => g.label || '(untitled)');

    $('#ho-shift').value = handover.shift;
    $('#ho-date').value = handover.date;
    if (!$('#ho-name').value) $('#ho-name').value = settings.name;
    $('#ho-to').value = handover.to;
    $('#ho-cc').value = handover.cc;
    $('#ho-subject').value = handover.subject;
    $('#ho-notes').value = handover.notes;
    $('#ho-include-recon').checked = handover.includeRecon;

    renderStarters();
    renderPreview();
  }

  function renderStarters() {
    const room = currentRoom();
    $('#ho-starters-room').textContent = room ? `– ${room.name}` : '';
    const box = $('#ho-starters');
    const starters = room ? room.starters.filter((s) => s.trim()) : [];
    box.replaceChildren(
      ...(starters.length
        ? starters.map((s) => el('button', { class: 'chip', type: 'button', text: s, onclick: () => insertStarter(s) }))
        : [el('span', { class: 'muted small', text: 'No starters for this room yet – add some in Settings.' })])
    );
  }

  function insertStarter(text) {
    const ta = $('#ho-notes');
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? ta.value.length;
    const before = ta.value.slice(0, start);
    const after = ta.value.slice(end);
    const prefix = before && !before.endsWith('\n') ? '\n' : '';
    const insert = prefix + text.trimEnd() + ' ';
    ta.value = before + insert + after;
    const pos = before.length + insert.length;
    ta.focus();
    ta.setSelectionRange(pos, pos);
    handover.notes = ta.value;
    saveHandover();
    renderPreview();
  }

  function currentEmail() {
    const greeting = settings.greetings.find((g) => g.id === handover.greetingId);
    const signoff = settings.signoffs.find((g) => g.id === handover.signoffId);
    return C.buildEmail({
      greeting: greeting ? greeting.text : '',
      notes: handover.notes,
      reconciliation: handover.includeRecon ? C.reconciliationText(C.reconcile(recon), settings.currency) : '',
      signOff: signoff ? signoff.text : '',
      subject: handover.subject,
      vars: templateVars(),
    });
  }

  function renderPreview() {
    const { subject, body } = currentEmail();
    $('#pv-subject').textContent = subject || '(no subject)';
    $('#pv-body').textContent = body || '';
  }

  const bindHandover = (sel, key, evt = 'input') =>
    $(sel).addEventListener(evt, (e) => {
      handover[key] = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
      saveHandover();
      renderPreview();
    });
  bindHandover('#ho-shift', 'shift');
  bindHandover('#ho-date', 'date');
  bindHandover('#ho-to', 'to');
  bindHandover('#ho-cc', 'cc');
  bindHandover('#ho-subject', 'subject');
  bindHandover('#ho-notes', 'notes');
  bindHandover('#ho-greeting', 'greetingId', 'change');
  bindHandover('#ho-signoff', 'signoffId', 'change');
  bindHandover('#ho-include-recon', 'includeRecon', 'change');
  $('#ho-name').addEventListener('input', renderPreview);
  $('#ho-room').addEventListener('change', (e) => {
    handover.roomId = e.target.value;
    applyRoomDefaults(currentRoom());
    saveHandover();
    renderHandover();
  });

  $('#ho-send').addEventListener('click', () => {
    const { subject, body } = currentEmail();
    if (!handover.to.trim()) {
      $('#ho-msg').textContent = 'Tip: add a recipient in “To” (or set a default for this room in Settings).';
    }
    const url = C.mailtoUrl({ to: handover.to, cc: handover.cc, subject, body });
    if (url.length > 1900) {
      copyText(body);
      $('#ho-msg').textContent = 'The email is long, so the body has also been copied – paste it in if your email app cuts it short.';
    }
    window.location.href = url;
  });
  $('#ho-copy').addEventListener('click', async () => {
    const { subject, body } = currentEmail();
    await copyText(`Subject: ${subject}\n\n${body}`);
    toast('Email copied');
  });
  $('#ho-clear').addEventListener('click', () => {
    if (handover.notes && !confirm('Clear your handover notes?')) return;
    handover.notes = '';
    saveHandover();
    $('#ho-notes').value = '';
    renderPreview();
  });

  // ============ SETTINGS ============
  function field(label, value, onInput, { multiline = false, rows = 3, placeholder = '' } = {}) {
    const input = multiline ? el('textarea', { rows, placeholder }) : el('input', { placeholder });
    input.value = value;
    input.addEventListener('input', () => {
      onInput(input.value);
      saveSettings();
    });
    return el('label', {}, label, input);
  }

  function removeButton(onRemove, what) {
    return el('button', {
      class: 'btn danger small',
      type: 'button',
      text: 'Delete',
      onclick: () => {
        if (!confirm(`Delete this ${what}?`)) return;
        onRemove();
        saveSettings();
        renderSettings();
      },
    });
  }

  function renderSettings() {
    const name = $('#set-name');
    const cur = $('#set-currency');
    name.value = settings.name;
    cur.value = settings.currency;

    $('#rooms-list').replaceChildren(
      ...settings.rooms.map((room) =>
        el('div', { class: 'item' },
          el('div', { class: 'item-head' },
            field('Room name', room.name, (v) => (room.name = v), { placeholder: 'e.g. Bar' }),
            removeButton(() => (settings.rooms = settings.rooms.filter((r) => r !== room)), 'room')
          ),
          el('div', { class: 'form-grid' },
            field('Default To', room.to, (v) => (room.to = v), { placeholder: 'a@example.com; b@example.com' }),
            field('Default CC', room.cc, (v) => (room.cc = v))
          ),
          field('Subject template', room.subject, (v) => (room.subject = v)),
          field('Sentence starters (one per line)', room.starters.join('\n'), (v) => (room.starters = v.split('\n')), { multiline: true, rows: 6 })
        )
      ),
      ...(settings.rooms.length ? [] : [el('p', { class: 'muted', text: 'No rooms yet.' })])
    );

    const textList = (key, what) =>
      settings[key].map((item) =>
        el('div', { class: 'item' },
          el('div', { class: 'item-head' },
            field('Name', item.label, (v) => (item.label = v)),
            removeButton(() => (settings[key] = settings[key].filter((x) => x !== item)), what)
          ),
          field('Text', item.text, (v) => (item.text = v), { multiline: true, rows: 4 })
        )
      );
    $('#greetings-list').replaceChildren(...textList('greetings', 'sign-in'));
    $('#signoffs-list').replaceChildren(...textList('signoffs', 'sign-off'));
  }

  $('#set-name').addEventListener('input', (e) => {
    settings.name = e.target.value;
    saveSettings();
  });
  $('#set-currency').addEventListener('input', (e) => {
    settings.currency = e.target.value || '£';
    saveSettings();
  });
  $('#add-room').addEventListener('click', () => {
    settings.rooms.push({ id: uid(), name: 'New room', to: '', cc: '', subject: '{room} handover – {day} {date} ({shift})', starters: [] });
    saveSettings();
    renderSettings();
  });
  $('#add-greeting').addEventListener('click', () => {
    settings.greetings.push({ id: uid(), label: 'New sign-in', text: 'Hi all,' });
    saveSettings();
    renderSettings();
  });
  $('#add-signoff').addEventListener('click', () => {
    settings.signoffs.push({ id: uid(), label: 'New sign-off', text: 'Thanks,\n{name}' });
    saveSettings();
    renderSettings();
  });
  $('#export-settings').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: 'shifttools-settings.json' });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('#import-settings').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      settings = normaliseSettings(JSON.parse(await file.text()));
      saveSettings();
      renderSettings();
      toast('Settings imported');
    } catch {
      alert('That file could not be read as Shift Tools settings.');
    }
  });
  $('#reset-settings').addEventListener('click', () => {
    if (!confirm('Reset all rooms, starters and signatures to the defaults?')) return;
    settings = DEFAULT_SETTINGS();
    saveSettings();
    renderSettings();
    toast('Settings reset');
  });

  // ---------- start ----------
  let startTab = 'reconcile';
  try { startTab = localStorage.getItem('shifttools.tab') || 'reconcile'; } catch { /* ignore */ }
  showTab(['reconcile', 'handover', 'settings'].includes(startTab) ? startTab : 'reconcile');
})();
