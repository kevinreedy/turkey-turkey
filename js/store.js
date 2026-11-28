// Turkey Turkey — state lives in this phone's localStorage. Nothing leaves the device
// unless you export a backup file yourself.

const KEY = 'turkey-turkey:v1';

export function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID().slice(0, 8);
  return Math.random().toString(36).slice(2, 10);
}

export function defaultState() {
  const year = new Date().getFullYear();
  return {
    v: 1,
    night: { name: `Thanksgiving ${year}`, startedAt: Date.now() },
    people: [], // {id, name, here, newcomer, knows: [id], shoes: true|false|null, paid: dollars|null}
    never: [], // [idA, idB]
    lanes: ['1', '2', '3', '4'].map((num) => ({ id: newId(), num, on: true })),
    rules: { avoidRepeatLane: true, buddyGames: 2 },
    matches: [], // {id, n, format, startedAt, lanes: [{laneId, num, people, groups?}]}
    preview: null, // {format, lanes}
    nextFormat: 'regular',
    costs: { shoePrice: '4', lanes: '', tip: '', round: 0 }, // money as typed; round: 0 (exact), 0.5 or 1 dollars
    savedAt: null,
  };
}

/** Rounding step in dollars: 0 (exact), 0.5 or 1. Older saves stored true/false for whole dollars. */
export function roundStep(v) {
  if (v === true) return 1;
  const n = Number(v);
  return n === 0.5 || n === 1 ? n : 0;
}

/** Fill in anything missing (older saves, hand-edited backups). */
function normalize(s) {
  const d = defaultState();
  const out = { ...d, ...s };
  out.night = { ...d.night, ...(s.night || {}) };
  out.rules = { ...d.rules, ...(s.rules || {}) };
  out.costs = { ...d.costs, ...(s.costs || {}) };
  if (s.bill && !s.costs) out.costs.lanes = s.bill; // saves from before shoes/tip existed
  out.costs.round = roundStep(out.costs.round);
  delete out.bill;
  out.people = (s.people || []).map((p) => ({ here: false, newcomer: false, knows: [], shoes: null, paid: null, ...p }));
  out.never = Array.isArray(s.never) ? s.never.filter((x) => Array.isArray(x) && x.length === 2) : [];
  out.lanes = Array.isArray(s.lanes) && s.lanes.length ? s.lanes : d.lanes;
  out.matches = Array.isArray(s.matches) ? s.matches : [];
  return out;
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch (e) {
    console.warn('Could not read saved state', e);
  }
  return defaultState();
}

let saveFailed = false;
export function save(state) {
  try {
    state.savedAt = Date.now();
    localStorage.setItem(KEY, JSON.stringify(state));
    saveFailed = false;
  } catch (e) {
    console.warn('Could not save', e);
    saveFailed = true;
  }
  return !saveFailed;
}
export const lastSaveFailed = () => saveFailed;

/** Ask Safari not to evict our storage. Best effort; resolves to true/false. */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* not supported */
  }
  return false;
}

export function backupBlob(state) {
  const body = JSON.stringify({ app: 'turkey-turkey', exportedAt: new Date().toISOString(), state }, null, 2);
  return new Blob([body], { type: 'application/json' });
}

export function backupFilename(state) {
  const slug = (state.night?.name || 'night').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  return `turkey-turkey-${slug}-${stamp}.json`;
}

export function parseBackup(text) {
  const data = JSON.parse(text);
  const s = data?.app === 'turkey-turkey' ? data.state : data;
  if (!s || !Array.isArray(s.people) || !Array.isArray(s.lanes)) throw new Error('That file is not a Turkey Turkey backup.');
  return normalize(s);
}

/** Same people, lanes and rules; fresh night (no games, nobody checked in, shoes unasked). */
export function freshNight(state) {
  const d = defaultState();
  return {
    ...d,
    people: state.people.map((p) => ({ ...p, here: false, shoes: null, paid: null })),
    never: state.never,
    lanes: state.lanes.map((l) => ({ ...l, on: true })),
    rules: state.rules,
    costs: { ...d.costs, shoePrice: state.costs?.shoePrice ?? d.costs.shoePrice, round: roundStep(state.costs?.round) },
  };
}
