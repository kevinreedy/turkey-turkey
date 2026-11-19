import { dealMatch, reviewMatch, previousLanes, gameTotals, settle } from './engine.js';
import { load, save, newId, backupBlob, backupFilename, parseBackup, freshNight, requestPersistence, lastSaveFailed } from './store.js';

let state = load();
const ui = { tab: 'match', personId: null, sheet: null };

const $view = document.getElementById('view');
const $sheet = document.getElementById('sheet');
const $toast = document.getElementById('toast');
const $restore = document.getElementById('restore-file');

/* ---------- helpers ---------- */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
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
    s.preview = { format, lanes: res.lanes, dealtFor: people.map((p) => p.id).sort() };
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
    s.preview = { format: m.format, lanes: m.lanes, dealtFor: m.lanes.flatMap((l) => l.people).sort() };
  });
}

/** The lineup being edited: the preview if there is one, else the match being bowled now. */
function editableLanes() {
  if (state.preview) return state.preview.lanes;
  return state.matches[state.matches.length - 1]?.lanes ?? null;
}

function mapLanes(fn) {
  commit((s) => {
    const target = s.preview ? s.preview : s.matches[s.matches.length - 1];
    target.lanes = fn(target.lanes).filter((l) => l.people.length);
  });
}

function swapPeople(a, b) {
  const sw = (x) => (x === a ? b : x === b ? a : x);
  mapLanes((lanes) => lanes.map((l) => ({ ...l, people: l.people.map(sw), ...(l.groups ? { groups: l.groups.map((g) => g.map(sw)) } : {}) })));
}

function removeFromLanes(lanes, id) {
  return lanes.map((l) => ({
    ...l,
    people: l.people.filter((x) => x !== id),
    ...(l.groups ? { groups: l.groups.map((g) => g.filter((x) => x !== id)).filter((g) => g.length) } : {}),
  }));
}

function moveTo(id, laneId) {
  const lane = state.lanes.find((l) => l.id === laneId);
  mapLanes((lanes) => {
    const out = removeFromLanes(lanes, id);
    let target = out.find((l) => l.laneId === laneId);
    if (!target) {
      target = { laneId, num: String(lane.num), people: [], ...(lanes[0]?.groups ? { groups: [] } : {}) };
      out.push(target);
    }
    target.people.push(id);
    if (target.groups) {
      const solo = target.groups.find((g) => g.length === 1);
      if (solo) solo.push(id);
      else target.groups.push([id]);
      target.people = target.groups.flat();
    }
    return out.sort((a, b) => a.num.localeCompare(b.num, undefined, { numeric: true }));
  });
}

function sitOut(id) {
  mapLanes((lanes) => removeFromLanes(lanes, id));
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

function laneCards(lanes, { format, meta = {}, buddies = {} }) {
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
        <ul>${rows}</ul>
      </section>`;
    })
    .join('')}</div>`;
}

function formatToggle(format) {
  return `<div class="seg" role="group" aria-label="Game format">
    <button type="button" data-action="format" data-format="regular" aria-pressed="${format === 'regular'}">Regular</button>
    <button type="button" data-action="format" data-format="pairs" aria-pressed="${format === 'pairs'}">Pairs <small>½ game</small></button>
  </div>`;
}

function issueNotices(issues) {
  return issues
    .map((i) => {
      if (i.type === 'never') return `${esc(list(i.people.map(nameOf)))} are both on lane ${esc(i.lane)}.`;
      if (i.type === 'buddy') return `${esc(nameOf(i.people[0]))} isn't with anyone they know.`;
      if (i.type === 'noBuddyHere') return `Nobody ${esc(nameOf(i.people[0]))} knows is checked in.`;
      return '';
    })
    .filter(Boolean)
    .map((t) => `<div class="notice warn">${ICON.warn}<span>${t}</span></div>`)
    .join('');
}

function viewMatch() {
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
    return `
      <header class="head">
        ${headerPill('Up next')}
        <h1>Match ${n + 1}${p.format === 'pairs' ? ' · Pairs' : ''}</h1>
        <p class="sub">${count} bowling · ${p.lanes.length} lane${p.lanes.length === 1 ? '' : 's'} · ${sizes}</p>
        <p class="sub">${r.firstTime} first-time matchup${r.firstTime === 1 ? '' : 's'} · ${r.repeatLanes ? `${r.repeatLanes} on the same lane again` : 'nobody repeats a lane'}</p>
      </header>
      ${formatToggle(p.format)}
      ${stale ? `<div class="notice">${ICON.info}<span>Check-ins changed since this was dealt.</span><button type="button" data-action="deal">Reshuffle</button></div>` : ''}
      ${p.format === 'pairs' ? `<div class="notice">${ICON.info}<span>First name throws ball one, partner throws ball two. Strike? Partner leads the next frame. Counts as ½ game.</span></div>` : ''}
      ${issueNotices(r.issues)}
      ${laneCards(p.lanes, { format: p.format, meta, buddies: r.buddyFor })}
      <div class="btn-row">
        <button type="button" class="btn" data-action="deal">${ICON.shuffle}Reshuffle</button>
        <button type="button" class="btn primary" data-action="start">Start match ${n + 1}</button>
      </div>
      <p class="note" style="text-align:center">Tap a name to swap, move or sit someone out.</p>`;
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
      <button type="button" class="link-btn" data-action="undo-start">Undo starting match ${current.n}</button>`;
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
    <button type="button" class="btn primary" data-action="deal" ${people.length ? '' : 'disabled'}>${ICON.shuffle}Deal match 1</button>`;
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

function viewSettle() {
  const bill = parseMoney(state.bill);
  const s = settle(state.matches, bill);
  const rows = s.rows.map((r) => ({ ...r, p: person(r.id) })).sort((a, b) => (a.p?.name ?? '').localeCompare(b.p?.name ?? ''));
  const pairsMatches = state.matches.filter((m) => m.format === 'pairs').length;
  const sum = rows.reduce((a, r) => a + r.owes, 0);
  return `
    <header class="head">
      <h1>Settle up</h1>
      <p class="sub">${state.matches.length} match${state.matches.length === 1 ? '' : 'es'}${pairsMatches ? ` · ${pairsMatches} pairs game${pairsMatches === 1 ? ' counts' : 's count'} as ½` : ''}</p>
    </header>
    <section class="bill">
      <div>
        <label for="bill">Bill total</label>
        <input id="bill" data-key="bill" data-action="bill" type="text" inputmode="decimal" placeholder="$0.00" value="${esc(state.bill)}" autocomplete="off">
      </div>
      <div class="per"><span class="lbl">Per game</span><b>${s.perGame ? money(s.perGame) : '—'}</b></div>
    </section>
    <p class="note">${games(s.totalUnits)} games across ${rows.length} bowler${rows.length === 1 ? '' : 's'}. Each person pays for the games they bowled.</p>
    ${
      rows.length
        ? `<div class="table-wrap"><table>
      <thead><tr><th scope="col">Bowler</th><th scope="col">Games</th><th scope="col">Pairs</th><th scope="col">Owes</th></tr></thead>
      <tbody>${rows
        .map(
          (r) => `<tr><th scope="row">${esc(r.p?.name ?? 'Someone removed')}${r.p && !r.p.here ? ' <span class="left-tag">· left</span>' : ''}</th>
        <td>${r.regular}</td><td>${r.pairs ? `${r.pairs} × ½` : '—'}</td><td>${bill ? money(r.owes) : games(r.units)}</td></tr>`
        )
        .join('')}</tbody>
      ${bill ? `<tfoot><tr><th scope="row">Total</th><td></td><td></td><td>${money(sum)}</td></tr></tfoot>` : ''}
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
    <p class="note">Keeps your people, who-knows-who and never-together pairs. Clears games, check-ins and the bill.</p>`;
}

/* ---------- sheets ---------- */

function viewSheet() {
  const s = ui.sheet;
  let body = '';
  if (s.type === 'person') {
    const lanes = editableLanes() || [];
    const lane = lanes.find((l) => l.people.includes(s.id));
    const isPreview = !!state.preview;
    const format = isPreview ? state.preview.format : state.matches[state.matches.length - 1]?.format;
    const others = activeLanes().filter((l) => l.id !== lane?.laneId);
    body = `
      <h2>${esc(nameOf(s.id))}</h2>
      <p class="sub">${lane ? `Lane ${esc(lane.num)} · ${isPreview ? 'up next' : 'bowling now'}` : ''}</p>
      <button type="button" class="opt" data-action="sheet-swap" data-id="${esc(s.id)}">${ICON.swap}Swap with someone…</button>
      ${format !== 'pairs' ? others.map((l) => `<button type="button" class="opt" data-action="move" data-id="${esc(s.id)}" data-lane="${esc(l.id)}">${ICON.arrow}Move to lane ${esc(l.num)}<span class="right">${lanes.find((x) => x.laneId === l.id)?.people.length ?? 0} there</span></button>`).join('') : ''}
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
  tab(el) {
    ui.tab = el.dataset.tab;
    ui.sheet = null;
    if (ui.tab !== 'people') ui.personId = null;
    render();
    window.scrollTo({ top: 0 });
  },
  deal: () => deal(state.preview?.format ?? state.nextFormat),
  start: startMatch,
  'undo-start': undoStart,
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
    if (!confirm('Start a new night? Games, check-ins and the bill are cleared. People, who-knows-who and never-together pairs stay. Back up first if you want a record.')) return;
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
  const bill = parseMoney(state.bill);
  const s = settle(state.matches, bill);
  const lines = [`${state.night.name} bowling`];
  if (bill) lines.push(`Bill ${money(bill)} · ${games(s.totalUnits)} games · ${money(s.perGame)} per game`);
  lines.push('');
  const rows = s.rows.map((r) => ({ ...r, name: nameOf(r.id) })).sort((a, b) => a.name.localeCompare(b.name));
  for (const r of rows) lines.push(`${r.name}: ${games(r.units)} game${r.units === 1 ? '' : 's'}${bill ? ` — ${money(r.owes)}` : ''}`);
  if (state.matches.some((m) => m.format === 'pairs')) lines.push('', '(Pairs games count as ½)');
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
  if (!form) return;
  e.preventDefault();
  const input = form.querySelector('input');
  const name = input.value.trim().replace(/\s+/g, ' ');
  if (!name) return;
  if (state.people.some((p) => p.name.toLowerCase() === name.toLowerCase())) return toast(`${name} is already on the list`);
  commit((s) => s.people.push({ id: newId(), name, here: true, newcomer: false, knows: [] }));
  toast(`${name} added and checked in`);
});

document.addEventListener('input', (e) => {
  const el = e.target;
  const a = el.dataset?.action;
  if (a === 'bill') commit((s) => (s.bill = el.value));
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
