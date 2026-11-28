import { dealMatch, reviewMatch, previousLanes, gameTotals, settle, collection } from './engine.js';
import { load, save, newId, backupBlob, backupFilename, parseBackup, freshNight, requestPersistence, lastSaveFailed } from './store.js';
import { prepareBulkPeople, resetBulkEntry } from './bulk-people.js';
import { removeFromLanes, placeOnLane, swapInLanes, convertFormat, renumber, historySignature } from './lineup.js';

let state = load();
const ui = { tab: 'match', personId: null, sheet: null, editId: null, bulkAdd: false, bulkNames: '', bulkShoes: null };

const $view = document.getElementById('view');
const $sheet = document.getElementById('sheet');
const $toast = document.getElementById('toast');
const $restore = document.getElementById('restore-file');

/* ---------- helpers ---------- */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
const byNum = (a, b) => String(a.num).localeCompare(String(b.num), undefined, { numeric: true });
const person = (id) => state.people.find((p) => p.id === id);
const nameOf = (id) => person(id)?.name ?? 'Someone removed';
const here = () => state.people.filter((p) => p.here);
const activeLanes = () => state.lanes.filter((l) => l.on && String(l.num).trim() !== '');
const laneColor = (laneId) => {
  const i = state.lanes.findIndex((l) => l.id === laneId);
  return `var(--lane-${(i < 0 ? 0 : i) % 6})`;
};
const initials = (name) => {
  const parts = name.trim().split(/\s+/);
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : name.slice(0, 2)).toUpperCase();
};
const games = (u) => {
  const whole = Math.floor(u);
  const half = u % 1 ? '½' : '';
  return whole === 0 && half ? '½' : `${whole}${half}`;
};
const money = (x) => `$${x.toFixed(2)}`;
const parseMoney = (s) => {
  const n = parseFloat(String(s).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const list = (names) => (names.length <= 2 ? names.join(' & ') : `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`);
const neverFor = (id) => state.never.filter((pair) => pair.includes(id)).map((pair) => (pair[0] === id ? pair[1] : pair[0]));

const ICON = {
  shuffle: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h3.5c2 0 3.3 1 4.5 2.7l2 3c1.2 1.7 2.5 2.6 4.5 2.6H21"/><path d="M3 16.5h3.5c1.4 0 2.5-.5 3.4-1.4"/><path d="M14.1 8.4c.9-.9 2-1.4 3.4-1.4H21"/><path d="M18.5 4.5 21 7l-2.5 2.5"/><path d="M18.5 13.8 21 16.3l-2.5 2.5"/></svg>',
  info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
  warn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.8"/></svg>',
  circle: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/></svg>',
  tick: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  swap: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4 3 8l4 4"/><path d="M3 8h14"/><path d="m17 20 4-4-4-4"/><path d="M21 16H7"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  out: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 12H4M8 8l-4 4 4 4"/><path d="M14 4h5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-5"/></svg>',
  user: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/></svg>',
  down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5"/><path d="M5 19h14"/></svg>',
  up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5"/><path d="M5 19h14"/></svg>',
  copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  never: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></svg>',
};

let toastTimer;
function toast(msg) {
  $toast.textContent = msg;
  $toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $toast.classList.remove('show'), 2600);
}

/** Apply a change, save it, redraw. */
function commit(fn, { rerender = true } = {}) {
  fn(state);
  save(state);
  if (lastSaveFailed()) toast('Could not save on this phone — export a backup');
  if (rerender) render();
}

/* ---------- match actions ---------- */

function deal(format = state.nextFormat) {
  const people = here();
  const lanes = activeLanes();
  if (!people.length) return toast('Check people in on the People tab first');
  if (!lanes.length) return toast('Turn on at least one lane in Setup');
  const res = dealMatch({ people, lanes, matches: state.matches, format, never: state.never, rules: state.rules });
  commit((s) => {
    s.nextFormat = format;
    s.preview = { format, lanes: res.lanes, dealtFor: people.map((p) => p.id).sort(), historySig: historySignature(s.matches) };
  });
}

function startMatch() {
  if (!state.preview) return;
  commit((s) => {
    s.matches.push({ id: newId(), n: s.matches.length + 1, format: s.preview.format, startedAt: Date.now(), lanes: s.preview.lanes.filter((l) => l.people.length) });
    s.preview = null;
    s.nextFormat = 'regular';
  });
  window.scrollTo({ top: 0 });
}

function undoStart() {
  const m = state.matches[state.matches.length - 1];
  if (!m || !confirm(`Undo match ${m.n}? Its games come off everyone's tally and it goes back to "up next".`)) return;
  commit((s) => {
    s.matches.pop();
    s.preview = { format: m.format, lanes: m.lanes, dealtFor: m.lanes.flatMap((l) => l.people).sort(), historySig: historySignature(s.matches) };
  });
}

/**
 * The lineup that taps on a name change: the match open in the editor, else the
 * preview, else the match being bowled now.
 */
function editTarget(s = state) {
  if (ui.editId) {
    const m = s.matches.find((x) => x.id === ui.editId);
    if (m) return { kind: 'edit', obj: m };
  }
  if (s.preview) return { kind: 'preview', obj: s.preview };
  const last = s.matches[s.matches.length - 1];
  return last ? { kind: 'current', obj: last } : null;
}

function editableLanes() {
  return editTarget()?.obj.lanes ?? null;
}

/** Lanes a match can use in the editor: every lane that's on, plus any it already uses. */
function editorLanes(m) {
  const out = activeLanes().map((l) => ({ laneId: l.id, num: String(l.num) }));
  for (const l of m.lanes) if (!out.some((x) => x.laneId === l.laneId)) out.push({ laneId: l.laneId, num: String(l.num) });
  return out.sort(byNum);
}

/** Lanes someone can be moved to in the lineup being edited. */
function laneSlots(t = editTarget()) {
  if (t?.kind === 'edit') return editorLanes(t.obj);
  return activeLanes().map((l) => ({ laneId: l.id, num: String(l.num) }));
}

function mapLanes(fn) {
  commit((s) => {
    const t = editTarget(s);
    if (t) t.obj.lanes = fn(t.obj.lanes, t.obj).filter((l) => l.people.length);
  });
}

function swapPeople(a, b) {
  mapLanes((lanes) => swapInLanes(lanes, a, b));
}

function moveTo(id, laneId) {
  const slot = laneSlots().find((l) => l.laneId === laneId);
  if (!slot) return;
  mapLanes((lanes, m) => placeOnLane(lanes, id, slot, m.format === 'pairs'));
}

function sitOut(id) {
  mapLanes((lanes) => removeFromLanes(lanes, id));
}

/* ---------- fixing a match by hand ---------- */

function openEdit(id) {
  ui.editId = id;
  ui.sheet = null;
  ui.tab = 'match';
  render();
  window.scrollTo({ top: 0 });
}

/** A match that happened without the app (e.g. it started before you got there). */
function recordMatch() {
  const id = newId();
  const format = state.preview ? 'regular' : state.nextFormat;
  ui.editId = id;
  ui.sheet = null;
  commit((s) => s.matches.push({ id, n: s.matches.length + 1, format, startedAt: Date.now(), manual: true, lanes: [] }));
  window.scrollTo({ top: 0 });
}

/** Leave the editor. A match nobody was put on is dropped rather than left empty. */
function closeEdit() {
  const m = state.matches.find((x) => x.id === ui.editId);
  ui.editId = null;
  ui.sheet = null;
  if (m && !m.lanes.length) {
    commit((s) => (s.matches = renumber(s.matches.filter((x) => x.id !== m.id))));
    toast(`Nobody was on match ${m.n}, so it wasn't kept`);
  } else render();
}

function deleteMatch() {
  const m = state.matches.find((x) => x.id === ui.editId);
  if (!m || !confirm(`Delete match ${m.n}? Its games come off everyone's tally.`)) return;
  ui.editId = null;
  ui.sheet = null;
  commit((s) => (s.matches = renumber(s.matches.filter((x) => x.id !== m.id))));
  toast(`Match ${m.n} deleted`);
}

/* ---------- views ---------- */

function render() {
  for (const t of document.querySelectorAll('.tab')) {
    if (t.dataset.tab === ui.tab) t.setAttribute('aria-current', 'page');
    else t.removeAttribute('aria-current');
  }
  const focused = document.activeElement?.dataset?.key;
  const sel = focused ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null;

  if (ui.personId && !person(ui.personId)) ui.personId = null;
  $view.innerHTML = ui.tab === 'match' ? viewMatch() : ui.tab === 'people' ? (ui.personId ? viewPerson() : viewPeople()) : ui.tab === 'settle' ? viewSettle() : viewSetup();
  $sheet.innerHTML = ui.sheet ? viewSheet() : '';

  if (focused) {
    const el = document.querySelector(`[data-key="${focused}"]`);
    if (el) {
      el.focus({ preventScroll: true });
      try {
        el.setSelectionRange(sel[0], sel[1]);
      } catch {
        /* not a text field */
      }
    }
  }
}

function laneCards(lanes, { format, meta = {}, buddies = {}, addable = false }) {
  const pairs = format === 'pairs';
  const who = (id) => {
    const p = person(id);
    const isNew = buddies[id];
    const m = isNew ? `w/ ${esc(nameOf(buddies[id]))}` : meta[id] ? esc(meta[id]) : '';
    return `<button type="button" class="who" data-action="pick-person" data-id="${esc(id)}">
      <span class="nm">${esc(p?.name ?? 'Someone removed')}${p?.newcomer && isNew ? '<span class="tag">NEW</span>' : ''}</span>
      ${!pairs && m ? `<span class="meta${isNew ? ' buddy' : ''}">${m}</span>` : ''}
    </button>`;
  };
  const cls = pairs ? 'lanes pairs' : lanes.length === 1 ? 'lanes single' : 'lanes';
  return `<div class="${cls}">${lanes
    .map((l) => {
      const rows = pairs
        ? (l.groups || [l.people])
            .map((g) => `<li class="pair-row">${g.map(who).join('<span class="plus" aria-hidden="true">+</span>')}${g.length === 3 ? '<span class="pair-label">trio</span>' : g.length === 1 ? '<span class="pair-label">solo</span>' : ''}</li>`)
            .join('')
        : l.people.map((id) => `<li>${who(id)}</li>`).join('');
      return `<section class="lane" style="--c:${laneColor(l.laneId)}">
        <div class="lane-head"><h2><span class="swatch" aria-hidden="true"></span>Lane ${esc(l.num)}</h2><span class="count">${l.people.length}</span></div>
        ${rows ? `<ul>${rows}</ul>` : '<p class="empty-lane">Nobody yet</p>'}
        ${addable ? `<button type="button" class="lane-add" data-action="sheet-lane" data-lane="${esc(l.laneId)}">${ICON.plus}Who bowled here</button>` : ''}
      </section>`;
    })
    .join('')}</div>`;
}

function formatToggle(format, action = 'format') {
  return `<div class="seg" role="group" aria-label="Game format">
    <button type="button" data-action="${action}" data-format="regular" aria-pressed="${format === 'regular'}">Regular</button>
    <button type="button" data-action="${action}" data-format="pairs" aria-pressed="${format === 'pairs'}">Pairs <small>½ game</small></button>
  </div>`;
}

function issueNotices(issues) {
  return issues
    .map((i) => {
      if (i.type === 'never') return `${esc(list(i.people.map(nameOf)))} are both on lane ${esc(i.lane)}.`;
      if (i.type === 'buddy') return `${esc(nameOf(i.people[0]))} isn't with anyone they know.`;
      if (i.type === 'familiar') return `${esc(nameOf(i.people[0]))} isn't with anyone they've bowled with yet.`;
      if (i.type === 'noBuddyHere') return `Nobody ${esc(nameOf(i.people[0]))} knows is checked in.`;
      return '';
    })
    .filter(Boolean)
    .map((t) => `<div class="notice warn">${ICON.warn}<span>${t}</span></div>`)
    .join('');
}

function matchList() {
  const rows = state.matches.map((m) => {
    const count = m.lanes.reduce((a, l) => a + l.people.length, 0);
    const nums = m.lanes.map((l) => l.num).join(', ');
    return `<li><button type="button" class="match-row" data-action="edit-match" data-id="${esc(m.id)}">
      <span><b>Match ${m.n}</b>${m.format === 'pairs' ? ' · Pairs' : ''}<span class="dim"> · ${count} bowling${nums ? ` · lane${m.lanes.length === 1 ? '' : 's'} ${esc(nums)}` : ''}</span></span>
      <span class="right">Edit</span>
    </button></li>`;
  });
  return `${rows.length ? `<h2 class="section-label">Matches so far<span>tap one to fix it</span></h2><ul class="list">${rows.join('')}</ul>` : ''}
    <button type="button" class="link-btn" data-action="record">Record a match by hand</button>`;
}

function viewEditMatch(m) {
  const idx = state.matches.indexOf(m);
  const latest = idx === state.matches.length - 1;
  const pairs = m.format === 'pairs';
  const r = reviewMatch({ lanes: m.lanes, people: state.people, matches: state.matches.slice(0, idx), never: state.never, rules: state.rules });
  const count = m.lanes.reduce((a, l) => a + l.people.length, 0);
  const lanes = editorLanes(m).map((slot) => m.lanes.find((l) => l.laneId === slot.laneId) || { ...slot, people: [], ...(pairs ? { groups: [] } : {}) });
  const inMatch = new Set(m.lanes.flatMap((l) => l.people));
  const missing = latest ? here().filter((x) => !inMatch.has(x.id)) : [];
  return `
    <button type="button" class="back" data-action="close-edit">${ICON.back}Match</button>
    <header class="head">
      <div class="head-row"><span class="eyebrow">Turkey Turkey</span><span class="pill">Editing</span></div>
      <h1>Match ${m.n}${pairs ? ' · Pairs' : ''}</h1>
      <p class="sub">${count} bowling · ${m.lanes.length} lane${m.lanes.length === 1 ? '' : 's'}${pairs ? ' · ½ game each' : ''}</p>
    </header>
    <div class="notice">${ICON.info}<span>Set this to what actually happened. Game tallies, the bill and the next shuffles all go by it.${pairs ? ' Partners pair up in the order you tick them; tap a name to swap partners.' : ''}</span></div>
    ${formatToggle(m.format, 'edit-format')}
    ${missing.length ? `<div class="notice">${ICON.info}<span>${esc(list(missing.map((x) => x.name)))} ${missing.length === 1 ? 'is' : 'are'} checked in but not on a lane.</span></div>` : ''}
    ${laneCards(lanes, { format: m.format, buddies: r.buddyFor, addable: true })}
    ${activeLanes().length ? '' : `<div class="notice warn">${ICON.warn}<span>Turn on the lanes you used in Setup.</span></div>`}
    <button type="button" class="btn primary" data-action="close-edit">Done</button>
    <button type="button" class="link-btn danger" data-action="delete-match">Delete match ${m.n}</button>`;
}

function viewMatch() {
  if (ui.editId) {
    const m = state.matches.find((x) => x.id === ui.editId);
    if (m) return viewEditMatch(m);
    ui.editId = null;
  }
  const n = state.matches.length;
  const current = state.matches[n - 1];
  const p = state.preview;
  const headerPill = (label, live) => `<div class="head-row"><span class="eyebrow">Turkey Turkey</span><span class="pill${live ? ' live' : ''}">${label}</span></div>`;

  if (p) {
    const people = here();
    const r = reviewMatch({ lanes: p.lanes, people: state.people.filter((x) => p.lanes.some((l) => l.people.includes(x.id))), matches: state.matches, never: state.never, rules: state.rules });
    const prev = previousLanes(state.matches);
    const meta = {};
    for (const [id, num] of prev) meta[id] = `was ${num}`;
    const count = p.lanes.reduce((a, l) => a + l.people.length, 0);
    const sizes = p.lanes.map((l) => l.people.length).join(' · ');
    const stale = people.map((x) => x.id).sort().join() !== (p.dealtFor || []).join();
    const edited = p.historySig != null && p.historySig !== historySignature(state.matches);
    return `
      <header class="head">
        ${headerPill('Up next')}
        <h1>Match ${n + 1}${p.format === 'pairs' ? ' · Pairs' : ''}</h1>
        <p class="sub">${count} bowling · ${p.lanes.length} lane${p.lanes.length === 1 ? '' : 's'} · ${sizes}</p>
        <p class="sub">${r.firstTime} first-time matchup${r.firstTime === 1 ? '' : 's'} · ${r.repeatLanes ? `${r.repeatLanes} on the same lane again` : 'nobody repeats a lane'}</p>
      </header>
      ${formatToggle(p.format)}
      ${stale || edited ? `<div class="notice">${ICON.info}<span>${stale && edited ? 'Check-ins and earlier matches' : stale ? 'Check-ins' : 'Earlier matches'} changed since this was dealt.</span><button type="button" data-action="deal">Reshuffle</button></div>` : ''}
      ${p.format === 'pairs' ? `<div class="notice">${ICON.info}<span>First name throws ball one, partner throws ball two. Strike? Partner leads the next frame. Counts as ½ game.</span></div>` : ''}
      ${issueNotices(r.issues)}
      ${laneCards(p.lanes, { format: p.format, meta, buddies: r.buddyFor })}
      <div class="btn-row">
        <button type="button" class="btn" data-action="deal">${ICON.shuffle}Reshuffle</button>
        <button type="button" class="btn primary" data-action="start">Start match ${n + 1}</button>
      </div>
      <p class="note" style="text-align:center">Tap a name to swap, move or sit someone out.</p>
      ${matchList()}`;
  }

  if (current) {
    const r = reviewMatch({ lanes: current.lanes, people: state.people, matches: state.matches.slice(0, -1), never: state.never, rules: state.rules });
    const inMatch = new Set(current.lanes.flatMap((l) => l.people));
    const late = here().filter((x) => !inMatch.has(x.id));
    return `
      <header class="head">
        ${headerPill('Bowling now', true)}
        <h1>Match ${current.n}${current.format === 'pairs' ? ' · Pairs' : ''}</h1>
        <p class="sub">${inMatch.size} bowling · ${current.lanes.length} lane${current.lanes.length === 1 ? '' : 's'}${current.format === 'pairs' ? ' · ½ game each' : ''}</p>
      </header>
      ${late.length ? `<div class="notice">${ICON.info}<span>${esc(list(late.map((x) => x.name)))} ${late.length === 1 ? 'is' : 'are'} here but not in this match.</span><button type="button" data-action="sheet-late">Add</button></div>` : ''}
      ${laneCards(current.lanes, { format: current.format, buddies: r.buddyFor })}
      ${formatToggle(state.nextFormat)}
      <button type="button" class="btn primary" data-action="deal">${ICON.shuffle}Deal match ${current.n + 1}</button>
      <button type="button" class="link-btn" data-action="undo-start">Undo starting match ${current.n}</button>
      ${matchList()}`;
  }

  const people = here();
  return `
    <header class="head">
      <span class="eyebrow">Turkey Turkey</span>
      <h1>${esc(state.night.name)}</h1>
      <p class="sub">${people.length} checked in · ${activeLanes().length} lane${activeLanes().length === 1 ? '' : 's'} on</p>
    </header>
    <div class="empty">
      <p>${people.length ? 'Ready when you are. Deal the first match and everyone gets a lane.' : 'Add people and check them in on the People tab, then set your lane numbers in Setup.'}</p>
      ${people.length ? '' : '<button type="button" class="btn small" data-action="tab" data-tab="people">Go to People</button>'}
    </div>
    ${formatToggle(state.nextFormat)}
    <button type="button" class="btn primary" data-action="deal" ${people.length ? '' : 'disabled'}>${ICON.shuffle}Deal match 1</button>
    <button type="button" class="link-btn" data-action="record">Match 1 started without the app? Record it</button>`;
}

function viewPeople() {
  const totals = gameTotals(state.matches);
  const sorted = [...state.people].sort(byName);
  const hereList = sorted.filter((p) => p.here);
  const away = sorted.filter((p) => !p.here);
  const row = (p) => {
    const t = totals.get(p.id);
    const nev = neverFor(p.id).map(nameOf);
    let hint = '';
    if (p.newcomer) hint = `<span class="hint new">Newcomer · ${p.knows.length ? `knows ${esc(list(p.knows.map(nameOf)))}` : 'pick who they know'}</span>`;
    else if (nev.length) hint = `<span class="hint never">Never with ${esc(list(nev))}</span>`;
    else if (!p.here && t) hint = '<span class="hint">Gone home</span>';
    else if (p.here && p.shoes == null) hint = '<span class="hint">Shoes not set</span>';
    else if (p.shoes === true) hint = '<span class="hint">Rented shoes</span>';
    return `<li><div class="row${p.here ? '' : ' away'}">
      <button type="button" class="row-main" data-action="open-person" data-id="${esc(p.id)}">
        <span class="avatar" aria-hidden="true">${esc(initials(p.name))}</span>
        <span class="row-text"><span class="nm">${esc(p.name)}</span>${hint}</span>
      </button>
      <span class="games"><b>${games(t?.units ?? 0)}</b><span>games</span></span>
      <button type="button" class="check" data-action="toggle-here" data-id="${esc(p.id)}" aria-pressed="${p.here}" aria-label="${esc(p.name)} is here">${p.here ? ICON.check : ICON.circle}</button>
    </div></li>`;
  };
  return `
    <header class="head">
      <h1>People</h1>
      <p class="sub">${hereList.length} here${away.length ? ` · ${away.length} not here` : ''}</p>
    </header>
    <form class="add-form" data-form="add-person" autocomplete="off">
      <label for="add-name" class="sr-only">Add a bowler</label>
      <input id="add-name" data-key="add-name" class="field" name="name" type="text" placeholder="Add a bowler" enterkeyhint="done" autocapitalize="words">
      <button type="submit" class="btn primary" aria-label="Add bowler">${ICON.plus.replace('<svg', '<svg style="width:22px;height:22px;stroke-width:2.4"')}</button>
    </form>
    <button type="button" class="link-btn" data-action="toggle-bulk-add" aria-expanded="${ui.bulkAdd}" aria-controls="bulk-people-form">${ui.bulkAdd ? 'Hide multiple entry' : 'Add multiple people'}</button>
    ${ui.bulkAdd ? `<form id="bulk-people-form" class="bulk-form" data-form="add-people" autocomplete="off">
      <label for="bulk-names">One name per line</label>
      <textarea id="bulk-names" data-key="bulk-names" class="field multi-names" name="names" rows="5" placeholder="Alex&#10;Jordan&#10;Sam" autocapitalize="words">${esc(ui.bulkNames)}</textarea>
      <span class="form-label" id="bulk-shoes-label">Shoes for everyone</span>
      <div class="seg" role="group" aria-labelledby="bulk-shoes-label">
        <button type="button" data-action="bulk-shoes" data-val="yes" aria-pressed="${ui.bulkShoes === true}">Rented shoes</button>
        <button type="button" data-action="bulk-shoes" data-val="no" aria-pressed="${ui.bulkShoes === false}">Own pair</button>
      </div>
      <button type="submit" class="btn primary">Add people</button>
    </form>` : ''}
    ${hereList.length ? `<h2 class="section-label">Here · ${hereList.length}</h2><ul class="list">${hereList.map(row).join('')}</ul>` : ''}
    ${away.length ? `<h2 class="section-label">Not here · ${away.length}<span>tap the circle to check in</span></h2><ul class="list">${away.map(row).join('')}</ul>` : ''}
    ${state.people.length ? '' : '<div class="empty"><p>Nobody yet. Add everyone coming tonight — new names are checked in automatically.</p></div>'}`;
}

function viewPerson() {
  const p = person(ui.personId);
  const t = gameTotals(state.matches).get(p.id) || { regular: 0, pairs: 0, units: 0 };
  const played = t.regular + t.pairs;
  const bg = state.rules.buddyGames;
  const nev = neverFor(p.id);
  const history = state.matches
    .map((m) => {
      const lane = m.lanes.find((l) => l.people.includes(p.id));
      if (!lane) return null;
      const group = lane.groups?.find((g) => g.includes(p.id));
      const right = group ? `with ${list(group.filter((x) => x !== p.id).map(nameOf))} · ½` : '';
      return `<li><span>Match ${m.n} · <span class="dim">Lane ${esc(lane.num)}</span></span><span class="right">${esc(right)}</span></li>`;
    })
    .filter(Boolean);
  const pv = state.preview?.lanes.find((l) => l.people.includes(p.id));
  if (pv) history.push(`<li><span>Match ${state.matches.length + 1} · <span class="dim">Lane ${esc(pv.num)}</span></span><span class="right">up next</span></li>`);

  return `
    <button type="button" class="back" data-action="close-person">${ICON.back}People</button>
    <header class="head-row" style="align-items:flex-end">
      <div style="flex:1;min-width:0">
        <label for="person-name" class="sr-only">Name</label>
        <input id="person-name" data-key="person-name" class="name-field" value="${esc(p.name)}" data-action="rename" autocomplete="off" autocapitalize="words">
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        <span id="here-lbl" style="font-size:14px;color:var(--text-2)">Here</span>
        <button type="button" class="switch good" role="switch" aria-checked="${p.here}" aria-labelledby="here-lbl" data-action="toggle-here" data-id="${esc(p.id)}"></button>
      </div>
    </header>
    <dl class="stats">
      <div><dt>Games</dt><dd>${t.regular}</dd></div>
      <div><dt>Pairs games</dt><dd>${t.pairs}</dd></div>
      <div><dt>Pays for</dt><dd>${games(t.units)}</dd></div>
    </dl>
    <section class="card">
      <div class="card-head"><div><h2 id="shoes-lbl">Shoes</h2><p>${p.shoes === true ? `Pays ${money(parseMoney(state.costs.shoePrice))} for rental` : p.shoes === false ? 'Brought their own' : 'Not set yet'}</p></div></div>
      <div class="seg" role="group" aria-labelledby="shoes-lbl">
        <button type="button" data-action="set-shoes" data-val="yes" aria-pressed="${p.shoes === true}">Rented</button>
        <button type="button" data-action="set-shoes" data-val="no" aria-pressed="${p.shoes === false}">Own pair</button>
      </div>
    </section>
    <section class="card">
      <div class="card-head">
        <div><h2 id="nc-lbl">Newcomer</h2><p>Bowls with someone they know for their first ${bg} game${bg === 1 ? '' : 's'}</p></div>
        <button type="button" class="switch" role="switch" aria-checked="${p.newcomer}" aria-labelledby="nc-lbl" data-action="toggle-newcomer"></button>
      </div>
      ${
        p.newcomer
          ? `${bg ? `<div class="progress"><div class="bars" aria-hidden="true">${Array.from({ length: bg }, (_, i) => `<span class="${i < played ? 'on' : ''}"></span>`).join('')}</div><span>${Math.min(played, bg)} of ${bg} buddy games</span></div>` : ''}
        <h3 class="section-label" style="margin:0">Knows</h3>
        <div class="chips">
          ${p.knows.map((k) => `<span class="chip">${esc(nameOf(k))}<button type="button" aria-label="Remove ${esc(nameOf(k))}" data-action="unknow" data-id="${esc(k)}">${ICON.x}</button></span>`).join('')}
          <button type="button" class="chip-add" data-action="sheet-knows">${ICON.plus}${p.knows.length ? 'Edit' : 'Pick people'}</button>
        </div>`
          : ''
      }
    </section>
    <section class="card">
      <div class="card-head"><div><h2>Never on the same lane as</h2><p>Always kept apart, in every format</p></div></div>
      <div class="chips">
        ${nev.map((k) => `<span class="chip never">${ICON.never}${esc(nameOf(k))}<button type="button" aria-label="Remove ${esc(nameOf(k))}" data-action="unnever" data-id="${esc(k)}">${ICON.x}</button></span>`).join('')}
        <button type="button" class="chip-add" data-action="sheet-never">${ICON.plus}${nev.length ? 'Edit' : 'Add'}</button>
      </div>
    </section>
    ${history.length ? `<h2 class="section-label">Tonight</h2><ol class="list history">${history.join('')}</ol>` : ''}
    <button type="button" class="link-btn" data-action="delete-person" style="color:var(--bad-ink)">Remove ${esc(p.name)} from the list</button>`;
}

/** The night's split, from what was typed on the Settle tab. */
function costSplit() {
  const c = state.costs;
  return settle(state.matches, {
    roundTo: c.round || 1,
    lanes: parseMoney(c.lanes),
    tip: parseMoney(c.tip),
    shoePrice: parseMoney(c.shoePrice),
    renters: state.people.filter((p) => p.shoes === true).map((p) => p.id),
  });
}

/** Who has paid against the shares as currently shown (rounded or exact). */
function payments(s = costSplit()) {
  return collection(s.rows, Object.fromEntries(state.people.map((p) => [p.id, p.paid])), state.costs.round);
}

const dollars = (x) => `$${Math.round(x)}`;
/** How a share is shown with the current rounding: $8 for whole dollars, $8.50 for 50¢. */
const shown = (x, round) => (round === 1 ? dollars(x) : money(x));
const ROUND_LABEL = { 0.5: 'rounded to the nearest 50¢', 1: 'rounded to the dollar' };

function viewSettle() {
  const s = costSplit();
  const round = state.costs.round;
  const rows = s.rows.map((r) => ({ ...r, p: person(r.id) })).sort((a, b) => (a.p?.name ?? '').localeCompare(b.p?.name ?? ''));
  const pairsMatches = state.matches.filter((m) => m.format === 'pairs').length;
  const anyMoney = s.total > 0;
  const unknownShoes = rows.filter((r) => r.p && r.p.shoes == null).map((r) => r.p.name);
  const collected = round ? s.roundedTotal : s.exactTotal;
  const diff = Math.round((collected - s.total) * 100) / 100;
  const pay = payments(s);
  const anyPaid = rows.some((r) => r.p?.paid != null);
  const stillOwe = rows.filter((r) => pay.byId[r.id].left > 0 && r.p).map((r) => r.p.name);
  const giveBack = rows.filter((r) => pay.byId[r.id].left < 0 && r.p).map((r) => `${r.p.name} ${money(-pay.byId[r.id].left)}`);
  const oweCell = (r) => {
    const st = pay.byId[r.id];
    const amount = round ? shown(st.due, round) : money(st.due);
    if (!r.p) return amount;
    const note = st.status === 'paid' ? 'Paid' : st.status === 'short' ? `${money(st.left)} left` : st.status === 'over' ? `${money(-st.left)} back` : '';
    const label = st.status === 'unpaid' ? 'not paid yet' : st.status === 'paid' ? 'paid' : note;
    return `<button type="button" class="owe-btn ${st.status}" data-action="sheet-paid" data-id="${esc(r.id)}" aria-label="${esc(r.p.name)} owes ${amount}, ${label}. Tap to change">
      <span class="amt">${amount}</span>${st.status === 'unpaid' ? ICON.circle : ICON.check}${note ? `<span class="st">${note}</span>` : ''}</button>`;
  };
  const moneyField = (field, label, placeholder) => `<li><div class="money-row">
      <label for="cost-${field}">${label}</label>
      <span class="money-input"><span aria-hidden="true">$</span><input id="cost-${field}" data-key="cost-${field}" data-action="cost" data-field="${field}" type="text" inputmode="decimal" placeholder="${placeholder}" value="${esc(state.costs[field])}" autocomplete="off"></span>
    </div></li>`;
  const shoeCell = (r) => {
    const v = r.p?.shoes;
    const label = v === true ? 'Rented' : v === false ? 'Own' : 'Ask';
    return `<button type="button" class="shoe-btn${v === true ? ' on' : v == null ? ' unknown' : ''}" data-action="shoe-toggle" data-id="${esc(r.id)}" aria-label="${esc(r.p?.name ?? '')} shoes: ${label}. Tap to change">${label}</button>`;
  };

  return `
    <header class="head">
      <h1>Settle up</h1>
      <p class="sub">${state.matches.length} match${state.matches.length === 1 ? '' : 'es'}${pairsMatches ? ` · ${pairsMatches} pairs game${pairsMatches === 1 ? ' counts' : 's count'} as ½` : ''}</p>
    </header>
    <ul class="list">
      ${moneyField('shoePrice', 'Shoe rental, per person', '4.00')}
      ${moneyField('lanes', 'Paid for lanes', '0.00')}
      ${moneyField('tip', 'Tip', '0.00')}
    </ul>
    <section class="receipt" aria-label="Total paid">
      <div><span>Shoes <small>${s.shoeCount} × ${money(s.shoePrice)}</small></span><span>${money(s.shoesTotal)}</span></div>
      <div><span>Lanes</span><span>${money(s.lanes)}</span></div>
      <div><span>Tip</span><span>${money(s.tip)}</span></div>
      <div class="total"><span>Total paid</span><span>${money(s.total)}</span></div>
    </section>
    <p class="note">${s.perGame ? `${money(s.perGame)} per game (lanes + tip ÷ ${games(s.totalUnits)} games). ` : ''}The tip is split across games only. Shoes go to the people who rented.</p>
    ${unknownShoes.length ? `<div class="notice">${ICON.info}<span>Shoes not set for ${esc(list(unknownShoes))}. Tap their Shoes cell below. Until then they don't pay for shoes.</span></div>` : ''}
    ${s.unsplit ? `<div class="notice warn">${ICON.warn}<span>Lanes and tip get split once someone has bowled a game.</span></div>` : ''}
    ${
      rows.length
        ? `<ul class="list"><li><div class="setting">
      <span class="label"><span id="round-lbl">Round each total</span><span>${anyMoney ? (round ? `Collects ${money(collected)}${diff ? ` · ${money(Math.abs(diff))} ${diff > 0 ? 'more' : 'less'} than paid` : ' · exactly what was paid'}` : `Collects exactly ${money(collected)}`) : 'For each person’s total'}</span></span>
    </div>
    <div class="seg three round-seg" role="group" aria-labelledby="round-lbl">
      ${[[0, 'Exact'], [0.5, 'To 50¢'], [1, 'To $1']].map(([v, label]) => `<button type="button" data-action="round" data-val="${v}" aria-pressed="${round === v}">${label}</button>`).join('')}
    </div></li></ul>
    ${
      anyMoney
        ? `<section class="collect" aria-label="Collected so far">
      <div class="collect-head"><span>Collected <b>${money(pay.collected)}</b> of ${money(pay.due)}</span><span>${pay.paidCount} of ${pay.count} paid</span></div>
      <div class="bar" aria-hidden="true"><span style="width:${pay.due ? Math.min(100, (pay.collected / pay.due) * 100) : 0}%"></span></div>
      <p>${anyPaid ? (stillOwe.length ? `Still to pay: ${esc(list(stillOwe))}.` : 'Everyone has paid.') : 'Tap what someone owes to mark them as paid.'}</p>
    </section>
    ${giveBack.length ? `<div class="notice warn">${ICON.warn}<span>Shares went down after paying. Give back: ${esc(list(giveBack))}.</span></div>` : ''}`
        : ''
    }
    <div class="table-wrap"><table>
      <thead><tr><th scope="col">Bowler</th><th scope="col">Games</th><th scope="col">Shoes</th><th scope="col">Owes</th></tr></thead>
      <tbody>${rows
        .map(
          (r) => `<tr><th scope="row">${esc(r.p?.name ?? 'Someone removed')}${r.p && !r.p.here ? ' <span class="left-tag">· left</span>' : ''}</th>
        <td>${games(r.units)}</td><td>${r.p ? shoeCell(r) : '—'}</td><td>${anyMoney ? oweCell(r) : '—'}</td></tr>`
        )
        .join('')}</tbody>
      ${anyMoney ? `<tfoot><tr><th scope="row">Total</th><td>${games(s.totalUnits)}</td><td>${s.shoeCount}</td><td>${round ? shown(collected, round) : money(collected)}</td></tr></tfoot>` : ''}
    </table></div>
    <button type="button" class="btn primary" data-action="share-summary">${ICON.copy}Share summary</button>`
        : '<div class="empty"><p>No games bowled yet. Tallies show up here as soon as the first match starts.</p></div>'
    }`;
}

function viewSetup() {
  const saved = state.savedAt ? new Date(state.savedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null;
  return `
    <header class="head">
      <h1>Setup</h1>
      <p class="sub">Lanes, rules and backups</p>
    </header>
    <section class="bill" style="grid-template-columns:1fr">
      <div><label for="night-name">Night</label><input id="night-name" data-key="night-name" data-action="night-name" type="text" value="${esc(state.night.name)}" style="font-size:22px" autocomplete="off"></div>
    </section>
    <h2 class="section-label">Lanes<span>${activeLanes().length} on</span></h2>
    <ul class="list">
      ${state.lanes
        .map(
          (l, i) => `<li><div class="lane-row${l.on ? '' : ' off'}" style="--c:var(--lane-${i % 6})">
        <span class="swatch" aria-hidden="true"></span>
        <label for="lane-${esc(l.id)}" style="font-size:15px;color:var(--text-2)">Lane</label>
        <input id="lane-${esc(l.id)}" data-key="lane-${esc(l.id)}" class="lane-num" data-action="lane-num" data-id="${esc(l.id)}" type="text" inputmode="numeric" value="${esc(l.num)}" autocomplete="off">
        <span class="spacer"></span>
        <button type="button" class="switch" role="switch" aria-checked="${l.on}" aria-label="Use lane ${esc(l.num)}" data-action="lane-toggle" data-id="${esc(l.id)}"></button>
        <button type="button" class="icon-btn" aria-label="Delete lane ${esc(l.num)}" data-action="lane-delete" data-id="${esc(l.id)}">${ICON.trash}</button>
      </div></li>`
        )
        .join('')}
      <li><button type="button" class="add-row" data-action="lane-add">${ICON.plus}Add a lane</button></li>
    </ul>
    <h2 class="section-label">Shuffle rules</h2>
    <ul class="list">
      <li><div class="setting">
        <span class="label"><span id="rule-repeat">Avoid repeating a lane</span><span>Nobody bowls the same lane twice in a row, when possible</span></span>
        <button type="button" class="switch" role="switch" aria-checked="${state.rules.avoidRepeatLane}" aria-labelledby="rule-repeat" data-action="rule-repeat"></button>
      </div></li>
      <li><div class="setting">
        <span class="label"><span id="rule-buddy">Newcomer buddy games</span><span>Kept with someone they know</span></span>
        <span class="stepper" role="group" aria-labelledby="rule-buddy">
          <button type="button" aria-label="Fewer buddy games" data-action="buddy" data-delta="-1">−</button>
          <output aria-live="polite">${state.rules.buddyGames}</output>
          <button type="button" aria-label="More buddy games" data-action="buddy" data-delta="1">+</button>
        </span>
      </div></li>
    </ul>
    <h2 class="section-label">Saved on this phone${saved ? `<span style="color:var(--good)">Saved ${esc(saved)}</span>` : ''}</h2>
    <div class="btn-grid">
      <button type="button" class="btn small" data-action="backup">${ICON.down}Back up</button>
      <button type="button" class="btn small" data-action="restore">${ICON.up}Restore</button>
    </div>
    <p class="note">Everything stays in this browser. Add the app to your Home Screen so Safari keeps it, and back up before clearing Safari data or switching phones.</p>
    <button type="button" class="btn small danger" data-action="new-night">Start a new night</button>
    <p class="note">Keeps your people, who-knows-who and never-together pairs. Clears games, check-ins, shoe rentals, who’s paid and the amounts paid.</p>`;
}

/* ---------- sheets ---------- */

function viewSheet() {
  const s = ui.sheet;
  let body = '';
  if (s.type === 'person') {
    const t = editTarget();
    const lanes = t?.obj.lanes || [];
    const lane = lanes.find((l) => l.people.includes(s.id));
    const isPreview = t?.kind === 'preview';
    const where = t?.kind === 'edit' ? `match ${t.obj.n}` : isPreview ? 'up next' : 'bowling now';
    const others = laneSlots(t).filter((l) => l.laneId !== lane?.laneId);
    body = `
      <h2>${esc(nameOf(s.id))}</h2>
      <p class="sub">${lane ? `Lane ${esc(lane.num)} · ${where}` : ''}</p>
      <button type="button" class="opt" data-action="sheet-swap" data-id="${esc(s.id)}">${ICON.swap}Swap with someone…</button>
      ${t?.obj.format !== 'pairs' ? others.map((l) => `<button type="button" class="opt" data-action="move" data-id="${esc(s.id)}" data-lane="${esc(l.laneId)}">${ICON.arrow}Move to lane ${esc(l.num)}<span class="right">${lanes.find((x) => x.laneId === l.laneId)?.people.length ?? 0} there</span></button>`).join('') : ''}
      <button type="button" class="opt" data-action="open-person" data-id="${esc(s.id)}">${ICON.user}Open profile</button>
      <button type="button" class="opt danger" data-action="sit-out" data-id="${esc(s.id)}">${ICON.out}${isPreview ? 'Sit out this match' : 'Remove from this match'}</button>`;
  } else if (s.type === 'swap') {
    const lanes = editableLanes() || [];
    body = `<h2>Swap ${esc(nameOf(s.id))} with…</h2>
      ${lanes
        .map(
          (l) => `<h3 class="group-label"><span class="swatch" style="--c:${laneColor(l.laneId)}"></span>Lane ${esc(l.num)}</h3>
        <div class="pick-list">${l.people
          .filter((x) => x !== s.id)
          .map((x) => `<button type="button" class="pick" data-action="swap" data-a="${esc(s.id)}" data-b="${esc(x)}">${esc(nameOf(x))}</button>`)
          .join('')}</div>`
        )
        .join('')}`;
  } else if (s.type === 'knows' || s.type === 'never') {
    const p = person(ui.personId);
    const chosen = new Set(s.type === 'knows' ? p.knows : neverFor(p.id));
    const others = state.people.filter((x) => x.id !== p.id).sort(byName);
    body = `<h2>${s.type === 'knows' ? `Who does ${esc(p.name)} know?` : `Keep ${esc(p.name)} away from…`}</h2>
      <p class="sub">${s.type === 'knows' ? 'They’ll bowl with one of these people for their first games.' : 'These people will never share a lane with them.'}</p>
      <div class="pick-list">${others
        .map(
          (x) => `<button type="button" class="pick${s.type === 'never' ? ' never' : ''}" aria-pressed="${chosen.has(x.id)}" data-action="${s.type === 'knows' ? 'toggle-know' : 'toggle-never'}" data-id="${esc(x.id)}">
          <span>${esc(x.name)}${x.here ? '' : ' <small>not here</small>'}</span>${ICON.tick}</button>`
        )
        .join('')}</div>
      ${others.length ? '' : '<p class="sub">Add more people first.</p>'}
      <button type="button" class="btn primary" data-action="close-sheet">Done</button>`;
  } else if (s.type === 'shoes') {
    const p = person(s.id);
    body = `<h2>Did ${esc(p?.name ?? 'they')} rent shoes?</h2>
      <p class="sub">${s.justAdded ? 'Added and checked in. ' : ''}You can change this later on their profile or the Settle tab.</p>
      <button type="button" class="btn primary" data-action="set-shoes" data-id="${esc(s.id)}" data-val="yes">Rented shoes</button>
      <button type="button" class="btn" data-action="set-shoes" data-id="${esc(s.id)}" data-val="no">Brought their own</button>
      <button type="button" class="link-btn" data-action="set-shoes" data-id="${esc(s.id)}" data-val="">Not sure yet</button>`;
  } else if (s.type === 'paid') {
    const p = person(s.id);
    const st = payments().byId[s.id];
    if (!p || !st) return '';
    const amt = (x) => (state.costs.round ? shown(x, state.costs.round) : money(x));
    const sub =
      st.status === 'unpaid' ? 'Not paid yet.'
      : st.status === 'paid' ? 'Paid in full.'
      : st.status === 'short' ? `Paid ${money(st.paid)}, but their share has gone up since. ${money(st.left)} left to pay.`
      : `Paid ${money(st.paid)}, but their share has gone down since. Give them ${money(-st.left)} back.`;
    const primary = st.status === 'unpaid' ? `Paid ${amt(st.due)}` : st.status === 'short' ? `Paid the other ${money(st.left)}` : st.status === 'over' ? `Gave back ${money(-st.left)}` : '';
    body = `<h2>${esc(p.name)} owes ${amt(st.due)}</h2>
      <p class="sub">${sub}</p>
      ${primary ? `<button type="button" class="btn primary" data-action="set-paid" data-id="${esc(p.id)}" data-val="${st.due}">${primary}</button>` : ''}
      ${st.status !== 'unpaid' ? `<button type="button" class="btn" data-action="set-paid" data-id="${esc(p.id)}" data-val="">Not paid yet</button>` : ''}
      <button type="button" class="link-btn" data-action="close-sheet">Cancel</button>`;
  } else if (s.type === 'lane') {
    const m = editTarget()?.obj;
    const slot = m && editorLanes(m).find((l) => l.laneId === s.laneId);
    if (!slot) return '';
    const latest = m === state.matches[state.matches.length - 1];
    const laneOf = (id) => m.lanes.find((l) => l.people.includes(id));
    const pick = (x) => {
      const l = laneOf(x.id);
      const on = l?.laneId === s.laneId;
      return `<button type="button" class="pick" aria-pressed="${on}" data-action="lane-pick" data-id="${esc(x.id)}"><span>${esc(x.name)}${l && !on ? ` <small>lane ${esc(l.num)}</small>` : ''}</span>${ICON.tick}</button>`;
    };
    const sorted = [...state.people].sort(byName);
    const hereList = sorted.filter((x) => x.here);
    const away = sorted.filter((x) => !x.here);
    body = `<h2>Who bowled lane ${esc(slot.num)}?</h2>
      <p class="sub">Match ${m.n}. Tap to add or take off; anyone on another lane moves here.</p>
      ${away.length && hereList.length ? '<h3 class="group-label">Checked in</h3>' : ''}
      ${hereList.length ? `<div class="pick-list">${hereList.map(pick).join('')}</div>` : ''}
      ${away.length ? `<h3 class="group-label">Not checked in${latest ? ' · adding checks them in' : ''}</h3><div class="pick-list">${away.map(pick).join('')}</div>` : ''}
      ${state.people.length ? '' : '<p class="sub">Add people on the People tab first.</p>'}
      <button type="button" class="btn primary" data-action="close-sheet">Done</button>`;
  } else if (s.type === 'late') {
    const current = state.matches[state.matches.length - 1];
    const inMatch = new Set(current.lanes.flatMap((l) => l.people));
    const late = here().filter((x) => !inMatch.has(x.id)).sort(byName);
    body = `<h2>Add to match ${current.n}</h2>
      ${late
        .map(
          (x) => `<h3 class="group-label">${esc(x.name)}</h3>
        <div class="pick-list">${activeLanes()
          .map((l) => `<button type="button" class="pick" data-action="move" data-id="${esc(x.id)}" data-lane="${esc(l.id)}">Lane ${esc(l.num)} <small>${current.lanes.find((c) => c.laneId === l.id)?.people.length ?? 0}</small></button>`)
          .join('')}</div>`
        )
        .join('')}`;
  }
  return `<div class="sheet-backdrop" data-action="close-sheet"><div class="sheet" role="dialog" aria-modal="true" data-stop>${'<div class="grabber" aria-hidden="true"></div>'}${body}</div></div>`;
}

/* ---------- events ---------- */

const actions = {
  'toggle-bulk-add'() {
    ui.bulkAdd = !ui.bulkAdd;
    render();
  },
  'bulk-shoes'(el) {
    ui.bulkShoes = el.dataset.val === 'yes';
    render();
  },
  tab(el) {
    if (ui.editId && el.dataset.tab !== 'match') closeEdit();
    ui.tab = el.dataset.tab;
    ui.sheet = null;
    if (ui.tab !== 'people') ui.personId = null;
    render();
    window.scrollTo({ top: 0 });
  },
  deal: () => deal(state.preview?.format ?? state.nextFormat),
  start: startMatch,
  'undo-start': undoStart,
  record: recordMatch,
  'edit-match': (el) => openEdit(el.dataset.id),
  'close-edit': closeEdit,
  'delete-match': deleteMatch,
  'edit-format'(el) {
    const f = el.dataset.format;
    commit((s) => {
      const m = s.matches.find((x) => x.id === ui.editId);
      if (!m || m.format === f) return;
      m.format = f;
      m.lanes = convertFormat(m.lanes, f);
    });
  },
  'sheet-lane'(el) {
    ui.sheet = { type: 'lane', laneId: el.dataset.lane };
    render();
  },
  'lane-pick'(el) {
    const id = el.dataset.id;
    const laneId = ui.sheet?.laneId;
    commit((s) => {
      const t = editTarget(s);
      if (!t || t.kind !== 'edit') return;
      const m = t.obj;
      const slot = editorLanes(m).find((l) => l.laneId === laneId);
      if (!slot) return;
      const on = m.lanes.some((l) => l.laneId === laneId && l.people.includes(id));
      m.lanes = (on ? removeFromLanes(m.lanes, id) : placeOnLane(m.lanes, id, slot, m.format === 'pairs')).filter((l) => l.people.length);
      // Someone on the latest match is clearly here tonight.
      const p = s.people.find((x) => x.id === id);
      if (!on && p && m === s.matches[s.matches.length - 1]) p.here = true;
    });
  },
  format(el) {
    const f = el.dataset.format;
    if (state.preview) deal(f);
    else commit((s) => (s.nextFormat = f));
  },
  'pick-person'(el) {
    ui.sheet = { type: 'person', id: el.dataset.id };
    render();
  },
  'sheet-swap'(el) {
    ui.sheet = { type: 'swap', id: el.dataset.id };
    render();
  },
  swap(el) {
    ui.sheet = null;
    swapPeople(el.dataset.a, el.dataset.b);
  },
  move(el) {
    ui.sheet = null;
    moveTo(el.dataset.id, el.dataset.lane);
  },
  'sit-out'(el) {
    ui.sheet = null;
    sitOut(el.dataset.id);
  },
  'sheet-late'() {
    ui.sheet = { type: 'late' };
    render();
  },
  'close-sheet'() {
    ui.sheet = null;
    render();
  },
  'open-person'(el) {
    ui.tab = 'people';
    ui.personId = el.dataset.id;
    ui.sheet = null;
    render();
    window.scrollTo({ top: 0 });
  },
  'close-person'() {
    ui.personId = null;
    render();
  },
  'toggle-here'(el) {
    commit((s) => {
      const p = s.people.find((x) => x.id === el.dataset.id);
      p.here = !p.here;
    });
  },
  'toggle-newcomer'() {
    commit((s) => {
      const p = s.people.find((x) => x.id === ui.personId);
      p.newcomer = !p.newcomer;
    });
    const p = person(ui.personId);
    if (p.newcomer && !p.knows.length) {
      ui.sheet = { type: 'knows' };
      render();
    }
  },
  'sheet-knows'() {
    ui.sheet = { type: 'knows' };
    render();
  },
  'sheet-never'() {
    ui.sheet = { type: 'never' };
    render();
  },
  'toggle-know'(el) {
    commit((s) => {
      const p = s.people.find((x) => x.id === ui.personId);
      const id = el.dataset.id;
      p.knows = p.knows.includes(id) ? p.knows.filter((x) => x !== id) : [...p.knows, id];
    });
  },
  unknow(el) {
    commit((s) => {
      const p = s.people.find((x) => x.id === ui.personId);
      p.knows = p.knows.filter((x) => x !== el.dataset.id);
    });
  },
  'toggle-never'(el) {
    const a = ui.personId;
    const b = el.dataset.id;
    commit((s) => {
      const has = s.never.some((pr) => pr.includes(a) && pr.includes(b));
      s.never = has ? s.never.filter((pr) => !(pr.includes(a) && pr.includes(b))) : [...s.never, [a, b]];
    });
  },
  unnever(el) {
    const a = ui.personId;
    const b = el.dataset.id;
    commit((s) => (s.never = s.never.filter((pr) => !(pr.includes(a) && pr.includes(b)))));
  },
  'delete-person'() {
    const p = person(ui.personId);
    const t = gameTotals(state.matches).get(p.id);
    if (t) return toast(`${p.name} has games on the bill — mark them as not here instead`);
    if (!confirm(`Remove ${p.name} from the list?`)) return;
    ui.personId = null;
    commit((s) => {
      s.people = s.people.filter((x) => x.id !== p.id);
      for (const x of s.people) x.knows = x.knows.filter((k) => k !== p.id);
      s.never = s.never.filter((pr) => !pr.includes(p.id));
      if (s.preview) s.preview.lanes = removeFromLanes(s.preview.lanes, p.id).filter((l) => l.people.length);
    });
  },
  'lane-toggle'(el) {
    commit((s) => {
      const l = s.lanes.find((x) => x.id === el.dataset.id);
      l.on = !l.on;
    });
  },
  'lane-add'() {
    commit((s) => {
      const nums = s.lanes.map((l) => parseInt(l.num, 10)).filter(Number.isFinite);
      s.lanes.push({ id: newId(), num: String(nums.length ? Math.max(...nums) + 1 : 1), on: true });
    });
  },
  'lane-delete'(el) {
    if (state.lanes.length === 1) return toast('Keep at least one lane');
    commit((s) => (s.lanes = s.lanes.filter((l) => l.id !== el.dataset.id)));
  },
  'set-shoes'(el) {
    const id = el.dataset.id || ui.personId;
    const v = el.dataset.val === 'yes' ? true : el.dataset.val === 'no' ? false : null;
    const wasNew = ui.sheet?.justAdded;
    ui.sheet = null;
    commit((s) => (s.people.find((p) => p.id === id).shoes = v));
    if (wasNew) toast(`${nameOf(id)} added and checked in`);
  },
  'sheet-paid'(el) {
    ui.sheet = { type: 'paid', id: el.dataset.id };
    render();
  },
  'set-paid'(el) {
    const v = el.dataset.val === '' ? null : Number(el.dataset.val);
    ui.sheet = null;
    commit((s) => (s.people.find((p) => p.id === el.dataset.id).paid = v));
  },
  'shoe-toggle'(el) {
    commit((s) => {
      const p = s.people.find((x) => x.id === el.dataset.id);
      p.shoes = p.shoes === true ? false : true;
    });
  },
  round(el) {
    commit((s) => (s.costs.round = Number(el.dataset.val)));
  },
  'rule-repeat'() {
    commit((s) => (s.rules.avoidRepeatLane = !s.rules.avoidRepeatLane));
  },
  buddy(el) {
    commit((s) => (s.rules.buddyGames = Math.max(0, Math.min(6, s.rules.buddyGames + Number(el.dataset.delta)))));
  },
  async backup() {
    const blob = backupBlob(state);
    const name = backupFilename(state);
    const file = new File([blob], name, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Turkey Turkey backup' });
        return;
      } catch (e) {
        if (e.name === 'AbortError') return;
      }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  restore() {
    $restore.value = '';
    $restore.click();
  },
  'new-night'() {
    if (!confirm('Start a new night? Games, check-ins, shoe rentals, who’s paid and the amounts paid are cleared. People, who-knows-who and never-together pairs stay. Back up first if you want a record.')) return;
    state = freshNight(state);
    save(state);
    ui.tab = 'people';
    ui.personId = null;
    render();
    toast('New night started');
  },
  async 'share-summary'() {
    const text = summaryText();
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch (e) {
        if (e.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      toast('Summary copied');
    } catch {
      toast('Could not copy on this browser');
    }
  },
};

function summaryText() {
  const s = costSplit();
  const round = state.costs.round;
  const fmt = (r) => (round ? shown(r.rounded, round) : money(r.owes));
  const pay = payments(s);
  const anyPaid = s.rows.some((r) => person(r.id)?.paid != null);
  const paidNote = (r) => {
    const st = pay.byId[r.id];
    if (!anyPaid || st.status === 'unpaid') return '';
    if (st.status === 'paid') return ' ✓ paid';
    return st.status === 'short' ? ` · paid ${money(st.paid)}, ${money(st.left)} left` : ` · paid ${money(st.paid)}, ${money(-st.left)} back`;
  };
  const lines = [`${state.night.name} bowling`];
  if (s.total > 0) {
    lines.push(`Lanes ${money(s.lanes)} + tip ${money(s.tip)} = ${money(s.lanes + s.tip)} over ${games(s.totalUnits)} games (${money(s.perGame)}/game)`);
    if (s.shoeCount) lines.push(`Shoes ${money(s.shoePrice)} each for ${s.shoeCount} ${s.shoeCount === 1 ? 'person' : 'people'}`);
    lines.push(`Total paid ${money(s.total)}`);
  }
  lines.push('');
  const rows = s.rows.map((r) => ({ ...r, name: nameOf(r.id) })).sort((a, b) => a.name.localeCompare(b.name));
  for (const r of rows) {
    const detail = `${games(r.units)} game${r.units === 1 ? '' : 's'}${r.rentedShoes ? ' + shoes' : ''}`;
    lines.push(s.total > 0 ? `${r.name}: ${fmt(r)} (${detail})${paidNote(r)}` : `${r.name}: ${detail}`);
  }
  if (anyPaid && s.total > 0) lines.push('', `Collected ${money(pay.collected)} of ${money(pay.due)} · ${pay.paidCount} of ${pay.count} paid`);
  const notes = [];
  if (state.matches.some((m) => m.format === 'pairs')) notes.push('pairs games count as ½');
  if (round && s.total > 0) notes.push(ROUND_LABEL[round]);
  if (notes.length) lines.push('', `(${notes.join('; ')})`);
  return lines.join('\n');
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  // Clicks inside a sheet shouldn't fall through to the backdrop's close action.
  if (el.dataset.action === 'close-sheet' && el.classList.contains('sheet-backdrop') && e.target.closest('[data-stop]')) return;
  if (el.matches('input')) return;
  const fn = actions[el.dataset.action];
  if (fn) {
    e.preventDefault();
    fn(el);
  }
});

document.addEventListener('submit', (e) => {
  const form = e.target.closest('[data-form="add-person"]');
  if (form) {
    e.preventDefault();
    const input = form.querySelector('input');
    const name = input.value.trim().replace(/\s+/g, ' ');
    if (!name) return;
    if (state.people.some((p) => p.name.toLowerCase() === name.toLowerCase())) return toast(`${name} is already on the list`);
    const id = newId();
    commit((s) => s.people.push({ id, name, here: true, newcomer: false, knows: [], shoes: null }));
    input.value = '';
    input.blur();
    ui.sheet = { type: 'shoes', id, justAdded: true };
    render();
    return;
  }

  const bulkForm = e.target.closest('[data-form="add-people"]');
  if (!bulkForm) return;
  e.preventDefault();
  const result = prepareBulkPeople(ui.bulkNames, ui.bulkShoes, state.people, newId);
  if (result.error) {
    const { type, names } = result.error;
    if (type === 'shoes') return toast('Choose shoes for everyone');
    if (type === 'empty') return toast('Enter at least one name');
    if (type === 'repeated') return toast(`${list(names)} ${names.length === 1 ? 'appears' : 'appear'} more than once`);
    if (type === 'existing') return toast(`${list(names)} ${names.length === 1 ? 'is' : 'are'} already on the list`);
  }
  const { people } = result;
  resetBulkEntry(ui);
  commit((s) => s.people.push(...people));
  toast(`Added ${people.length} ${people.length === 1 ? 'person' : 'people'}`);
});

document.addEventListener('input', (e) => {
  const el = e.target;
  const a = el.dataset?.action;
  if (el.dataset?.key === 'bulk-names') ui.bulkNames = el.value;
  else if (a === 'cost') commit((s) => (s.costs[el.dataset.field] = el.value));
  else if (a === 'night-name') commit((s) => (s.night.name = el.value), { rerender: false });
  else if (a === 'lane-num') commit((s) => (s.lanes.find((l) => l.id === el.dataset.id).num = el.value.trim()), { rerender: false });
  else if (a === 'rename') {
    const v = el.value.trim();
    if (v) commit((s) => (s.people.find((p) => p.id === ui.personId).name = v), { rerender: false });
  }
});

document.addEventListener('change', (e) => {
  const a = e.target.dataset?.action;
  if (a === 'lane-num' || a === 'rename' || a === 'night-name') render();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && ui.sheet) {
    ui.sheet = null;
    render();
  }
  if (e.key === 'Enter' && e.target.matches?.('.name-field, .lane-num, #night-name')) e.target.blur();
});

$restore.addEventListener('change', async () => {
  const file = $restore.files?.[0];
  if (!file) return;
  try {
    const next = parseBackup(await file.text());
    if (!confirm(`Replace everything on this phone with "${next.night.name}" (${next.people.length} people, ${next.matches.length} matches)?`)) return;
    state = next;
    save(state);
    ui.personId = null;
    render();
    toast('Backup restored');
  } catch (err) {
    toast(err.message || 'Could not read that file');
  }
});

render();
requestPersistence();
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
