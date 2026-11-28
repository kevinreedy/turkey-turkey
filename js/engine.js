// Turkey Turkey — pure logic: dealing lanes, counting games, splitting the bill.
// No DOM access here, so it runs the same in the browser and in `node --test`.

export const WEIGHTS = {
  never: 1_000_000, // a "never together" pair on one lane
  buddy: 10_000, // a newcomer (still in their buddy games) without someone they know
  familiar: 3_000, // a newcomer's first game after their buddy games, with nobody they've shared a lane with
  familiarSecond: 300, // …with only one such person, when a second one is here
  repeatLane: 120, // same lane number as the person's previous match
  together: 10, // × c² where c = matches this pair already shared a lane
  lastMatchTogether: 6, // extra nudge apart if they shared a lane in the very last match
  partnerRepeat: 40, // × times these two were already partners (pairs games)
};

export const TUNING = { itersPerPerson: 300, T0: 150, T1: 0.5, restarts: 10 };

export const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Split n bowlers over up to laneCount lanes as evenly as possible (largest first). */
export function laneSizes(n, laneCount) {
  const used = Math.max(1, Math.min(laneCount, n));
  const base = Math.floor(n / used);
  const extra = n % used;
  return Array.from({ length: used }, (_, i) => base + (i < extra ? 1 : 0));
}

/**
 * Group structure for a pairs game: every lane gets an even number of bowlers
 * (pairs), spread as evenly as possible. With an odd head count one pair
 * becomes a trio, on the lane with the fewest bowlers.
 * Returns an array (one per lane) of group-size arrays, e.g. [[2,2,2],[2,2,3]].
 */
export function pairsStructure(n, laneCount) {
  if (n <= 0) return [];
  const pairCount = Math.floor(n / 2);
  if (pairCount === 0) return [[1]];
  const used = Math.max(1, Math.min(laneCount, pairCount));
  const base = Math.floor(pairCount / used);
  const extra = pairCount % used;
  const lanes = Array.from({ length: used }, (_, i) => Array(base + (i < extra ? 1 : 0)).fill(2));
  if (n % 2 === 1) lanes[lanes.length - 1][lanes[lanes.length - 1].length - 1] = 3;
  return lanes;
}

/** Everything the dealer needs to know about the night so far. */
export function buildHistory(matches) {
  const together = new Map();
  const partners = new Map();
  const lastLane = new Map(); // person -> lane number of the last match they bowled
  const played = new Map(); // person -> matches bowled (any format)
  const lastMates = new Set(); // pair keys that shared a lane in the latest match
  matches.forEach((m, idx) => {
    const latest = idx === matches.length - 1;
    for (const lane of m.lanes) {
      const ppl = lane.people;
      for (const p of ppl) {
        lastLane.set(p, String(lane.num));
        played.set(p, (played.get(p) || 0) + 1);
      }
      for (let i = 0; i < ppl.length; i++) {
        for (let j = i + 1; j < ppl.length; j++) {
          const k = pairKey(ppl[i], ppl[j]);
          together.set(k, (together.get(k) || 0) + 1);
          if (latest) lastMates.add(k);
        }
      }
      for (const g of lane.groups || []) {
        for (let i = 0; i < g.length; i++) {
          for (let j = i + 1; j < g.length; j++) {
            const k = pairKey(g[i], g[j]);
            partners.set(k, (partners.get(k) || 0) + 1);
          }
        }
      }
    }
  });
  return { together, partners, lastLane, played, lastMates };
}

function shuffleInPlace(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Build the per-deal context: who knows whom, who still needs a buddy, etc. */
function makeContext({ people, matches, never, rules }) {
  const hist = buildHistory(matches);
  const present = new Set(people.map((p) => p.id));
  const knows = new Map(people.map((p) => [p.id, new Set()]));
  const allKnows = new Map(); // includes people who aren't here, for symmetric lookups
  for (const p of people) {
    for (const q of p.knows || []) {
      if (!allKnows.has(p.id)) allKnows.set(p.id, new Set());
      allKnows.get(p.id).add(q);
      if (present.has(q)) {
        knows.get(p.id).add(q);
        knows.get(q).add(p.id);
      }
    }
  }
  const buddyGames = rules.buddyGames ?? 2;
  const needy = new Set();
  const noBuddyHere = [];
  for (const p of people) {
    if (!p.newcomer || (hist.played.get(p.id) || 0) >= buddyGames) continue;
    if (knows.get(p.id).size > 0) needy.add(p.id);
    else noBuddyHere.push(p.id);
  }
  // A newcomer's first game after their buddy games: newcomer id -> present people
  // they've already shared a lane with, so they're not dropped among strangers.
  const easing = new Map();
  for (const p of people) {
    if (!p.newcomer || buddyGames < 1 || (hist.played.get(p.id) || 0) !== buddyGames) continue;
    const mates = new Set(people.filter((q) => q.id !== p.id && hist.together.get(pairKey(p.id, q.id))).map((q) => q.id));
    if (mates.size) easing.set(p.id, mates);
  }
  const neverSet = new Set();
  for (const [a, b] of never || []) neverSet.add(pairKey(a, b));
  return {
    ...hist,
    knows,
    needy,
    noBuddyHere,
    easing,
    neverSet,
    avoidRepeat: rules.avoidRepeatLane !== false,
  };
}

function familiarCount(p, members, mates) {
  let n = 0;
  for (const q of members) if (q !== p && mates.has(q)) n++;
  return n;
}

/** Cost of one lane. `groups` is an array of group sizes (pairs format) or null. */
function laneCost(members, num, groups, ctx) {
  let c = 0;
  const n = members.length;
  for (let i = 0; i < n; i++) {
    const p = members[i];
    if (ctx.avoidRepeat && ctx.lastLane.get(p) === num) c += WEIGHTS.repeatLane;
    for (let j = i + 1; j < n; j++) {
      const k = pairKey(p, members[j]);
      if (ctx.neverSet.has(k)) c += WEIGHTS.never;
      const t = ctx.together.get(k) || 0;
      c += WEIGHTS.together * t * t;
      if (ctx.lastMates.has(k)) c += WEIGHTS.lastMatchTogether;
    }
  }
  // Familiar faces count by lane, in pairs games too.
  for (const p of members) {
    const mates = ctx.easing.get(p);
    if (!mates) continue;
    const seen = familiarCount(p, members, mates);
    if (seen === 0) c += WEIGHTS.familiar;
    else if (seen === 1 && mates.size >= 2) c += WEIGHTS.familiarSecond;
  }
  if (!groups) {
    for (const p of members) {
      if (!ctx.needy.has(p)) continue;
      const kn = ctx.knows.get(p);
      if (!members.some((q) => q !== p && kn.has(q))) c += WEIGHTS.buddy;
    }
  } else {
    let off = 0;
    for (const size of groups) {
      const g = members.slice(off, off + size);
      off += size;
      for (let i = 0; i < g.length; i++) {
        for (let j = i + 1; j < g.length; j++) {
          c += WEIGHTS.partnerRepeat * (ctx.partners.get(pairKey(g[i], g[j])) || 0);
        }
        if (ctx.needy.has(g[i])) {
          const kn = ctx.knows.get(g[i]);
          if (!g.some((q) => q !== g[i] && kn.has(q))) c += WEIGHTS.buddy;
        }
      }
    }
  }
  return c;
}

/** One simulated-annealing run from a random start. */
function anneal(ids, lanes, ctx, rng, pairs, tuning) {
  // lanes: [{laneId, num, size, groups|null, start}]
  const assign = shuffleInPlace(ids.slice(), rng);
  const laneOfSlot = [];
  const groupOfSlot = [];
  lanes.forEach((l, li) => {
    let g = 0;
    let left = l.groups ? l.groups[0] : Infinity;
    for (let s = 0; s < l.size; s++) {
      laneOfSlot.push(li);
      if (l.groups) {
        if (left === 0) {
          g++;
          left = l.groups[g];
        }
        left--;
      }
      groupOfSlot.push(g);
    }
  });
  const members = (li) => assign.slice(lanes[li].start, lanes[li].start + lanes[li].size);
  const costs = lanes.map((l, li) => laneCost(members(li), l.num, l.groups, ctx));
  let total = costs.reduce((a, b) => a + b, 0);
  let best = total;
  let bestAssign = assign.slice();
  const n = assign.length;
  if (n < 2) return { cost: total, assign: bestAssign };

  const iters = tuning.itersPerPerson * n + 2000;
  const T0 = tuning.T0;
  const T1 = tuning.T1;
  for (let it = 0; it < iters && best > 0; it++) {
    const T = T0 * Math.pow(T1 / T0, it / iters);
    const s1 = Math.floor(rng() * n);
    const s2 = Math.floor(rng() * n);
    const l1 = laneOfSlot[s1];
    const l2 = laneOfSlot[s2];
    if (s1 === s2) continue;
    if (l1 === l2 && (!pairs || groupOfSlot[s1] === groupOfSlot[s2])) continue;
    [assign[s1], assign[s2]] = [assign[s2], assign[s1]];
    const c1 = laneCost(members(l1), lanes[l1].num, lanes[l1].groups, ctx);
    const c2 = l1 === l2 ? 0 : laneCost(members(l2), lanes[l2].num, lanes[l2].groups, ctx);
    const delta = l1 === l2 ? c1 - costs[l1] : c1 + c2 - costs[l1] - costs[l2];
    if (delta <= 0 || rng() < Math.exp(-delta / T)) {
      costs[l1] = c1;
      if (l1 !== l2) costs[l2] = c2;
      total += delta;
      if (total < best) {
        best = total;
        bestAssign = assign.slice();
      }
    } else {
      [assign[s1], assign[s2]] = [assign[s2], assign[s1]];
    }
  }
  return { cost: best, assign: bestAssign };
}

/**
 * Deal the next match.
 * @param {object} o
 * @param {{id:string, newcomer?:boolean, knows?:string[]}[]} o.people  bowlers who are here
 * @param {{id:string, num:string|number}[]} o.lanes  active lanes
 * @param {object[]} o.matches  matches already bowled tonight
 * @param {'regular'|'pairs'} o.format
 * @param {[string,string][]} o.never  pairs that must never share a lane
 * @param {{avoidRepeatLane?:boolean, buddyGames?:number}} o.rules
 * @param {() => number} [o.rng]
 * @returns {{lanes:{laneId:string, num:string, people:string[], groups?:string[][]}[], cost:number}}
 */
export function dealMatch({ people, lanes, matches = [], format = 'regular', never = [], rules = {}, rng = Math.random, restarts = TUNING.restarts, tuning = TUNING }) {
  const n = people.length;
  if (n === 0 || lanes.length === 0) return { lanes: [], cost: 0 };
  const ctx = makeContext({ people, matches, never, rules });
  const pairs = format === 'pairs';
  const ids = people.map((p) => p.id);

  let best = null;
  let ties = [];
  for (let r = 0; r < restarts; r++) {
    // Which physical lanes get used, and which get the bigger groups, varies per restart.
    const struct = pairs ? pairsStructure(n, lanes.length) : laneSizes(n, lanes.length).map(() => null);
    const sizes = pairs ? struct.map((g) => g.reduce((a, b) => a + b, 0)) : laneSizes(n, lanes.length);
    const chosen = shuffleInPlace(lanes.slice(), rng).slice(0, sizes.length);
    const order = shuffleInPlace(sizes.map((_, i) => i), rng);
    let start = 0;
    const laneSpecs = chosen.map((l, i) => {
      const k = order[i];
      const spec = { laneId: l.id, num: String(l.num), size: sizes[k], groups: struct[k], start };
      start += sizes[k];
      return spec;
    });
    const res = anneal(ids, laneSpecs, ctx, rng, pairs, tuning);
    const result = { cost: res.cost, specs: laneSpecs, assign: res.assign };
    if (!best || res.cost < best.cost - 1e-9) {
      best = result;
      ties = [result];
    } else if (Math.abs(res.cost - best.cost) < 1e-9) {
      ties.push(result);
    }
  }
  const pick = ties[Math.floor(rng() * ties.length)];
  const out = pick.specs
    .map((s) => {
      const ppl = pick.assign.slice(s.start, s.start + s.size);
      const lane = { laneId: s.laneId, num: s.num, people: ppl };
      if (s.groups) {
        lane.groups = [];
        let off = 0;
        for (const size of s.groups) {
          lane.groups.push(ppl.slice(off, off + size));
          off += size;
        }
      }
      return lane;
    })
    .sort((a, b) => a.num.localeCompare(b.num, undefined, { numeric: true }));
  return { lanes: out, cost: pick.cost };
}

/** Score an existing lineup (e.g. after a manual swap) and list anything worth flagging. */
export function reviewMatch({ lanes, people, matches = [], never = [], rules = {} }) {
  const ctx = makeContext({ people, matches, never, rules });
  const issues = [];
  let firstTime = 0;
  let repeatLanes = 0;
  for (const lane of lanes) {
    const ppl = lane.people;
    for (let i = 0; i < ppl.length; i++) {
      if (ctx.avoidRepeat && ctx.lastLane.get(ppl[i]) === String(lane.num)) repeatLanes++;
      for (let j = i + 1; j < ppl.length; j++) {
        const k = pairKey(ppl[i], ppl[j]);
        if (ctx.neverSet.has(k)) issues.push({ type: 'never', people: [ppl[i], ppl[j]], lane: lane.num });
        if (!ctx.together.get(k)) firstTime++;
      }
    }
    for (const p of ppl) {
      const mates = ctx.easing.get(p);
      if (mates && familiarCount(p, ppl, mates) === 0) issues.push({ type: 'familiar', people: [p], lane: lane.num });
    }
    const groups = lane.groups || [ppl];
    for (const g of groups) {
      for (const p of g) {
        if (!ctx.needy.has(p)) continue;
        const kn = ctx.knows.get(p);
        if (!g.some((q) => q !== p && kn.has(q))) issues.push({ type: 'buddy', people: [p], lane: lane.num });
      }
    }
  }
  const inMatch = new Set(lanes.flatMap((l) => l.people));
  for (const p of ctx.noBuddyHere) if (inMatch.has(p)) issues.push({ type: 'noBuddyHere', people: [p] });
  return { issues, firstTime, repeatLanes, buddyFor: buddyMap(lanes, ctx) };
}

/** newcomer id -> the person they know on their lane (or partner, in pairs). */
function buddyMap(lanes, ctx) {
  const map = {};
  for (const lane of lanes) {
    for (const g of lane.groups || [lane.people]) {
      for (const p of g) {
        if (!ctx.needy.has(p)) continue;
        const kn = ctx.knows.get(p);
        const b = g.find((q) => q !== p && kn.has(q));
        if (b) map[p] = b;
      }
    }
  }
  return map;
}

/** Previous lane number for each person (for "was 19" hints). */
export function previousLanes(matches) {
  return buildHistory(matches).lastLane;
}

/** Per-person tallies. Pairs games count as half. */
export function gameTotals(matches) {
  const totals = new Map();
  for (const m of matches) {
    const half = m.format === 'pairs';
    for (const lane of m.lanes) {
      for (const p of lane.people) {
        const t = totals.get(p) || { regular: 0, pairs: 0, units: 0 };
        if (half) t.pairs++;
        else t.regular++;
        t.units = t.regular + t.pairs / 2;
        totals.set(p, t);
      }
    }
  }
  return totals;
}

/**
 * Split the night's costs.
 * - Lanes + tip are split by game units (a pairs game is half a unit). The tip rides
 *   on the games, never on shoes.
 * - Each person who rented shoes pays the shoe price on top.
 * Everything is worked in cents; leftover cents from the games split go to the
 * largest remainders so the shares add up to exactly what was paid.
 * `rounded` is each person's total rounded to the nearest `roundTo` dollars
 * (1 for whole dollars, 0.5 for 50¢); halfway rounds up.
 *
 * @param {object[]} matches
 * @param {{lanes?:number, tip?:number, shoePrice?:number, renters?:Iterable<string>, roundTo?:number}} costs
 */
export function settle(matches, { lanes = 0, tip = 0, shoePrice = 0, renters = [], roundTo = 1 } = {}) {
  const totals = gameTotals(matches);
  const rented = new Set(renters);
  for (const id of rented) if (!totals.has(id)) totals.set(id, { regular: 0, pairs: 0, units: 0 });
  let totalUnits = 0;
  for (const t of totals.values()) totalUnits += t.units;

  const gamesCents = Math.round((lanes + tip) * 100);
  const shoeCents = Math.round(shoePrice * 100);
  const stepCents = Math.max(1, Math.round(roundTo * 100));
  const canSplit = gamesCents > 0 && totalUnits > 0;
  const rows = [...totals.entries()].map(([id, t]) => {
    const exact = canSplit ? (t.units / totalUnits) * gamesCents : 0;
    return { id, ...t, cents: Math.floor(exact), frac: exact - Math.floor(exact) };
  });
  let left = canSplit ? gamesCents - rows.reduce((a, r) => a + r.cents, 0) : 0;
  for (const r of [...rows].sort((a, b) => b.frac - a.frac || a.id.localeCompare(b.id))) {
    if (left <= 0) break;
    r.cents++;
    left--;
  }

  const out = rows.map(({ cents, frac, ...r }) => {
    const shoes = rented.has(r.id) ? shoeCents : 0;
    const owes = (cents + shoes) / 100;
    const rounded = (Math.round((cents + shoes) / stepCents) * stepCents) / 100;
    return { ...r, rentedShoes: rented.has(r.id), games: cents / 100, shoes: shoes / 100, owes, rounded };
  });
  const shoeCount = out.filter((r) => r.rentedShoes).length;
  const shoesTotal = (shoeCount * shoeCents) / 100;
  return {
    totalUnits,
    perGame: canSplit ? (lanes + tip) / totalUnits : 0,
    lanes,
    tip,
    shoePrice,
    shoeCount,
    shoesTotal,
    total: Math.round((lanes + tip + shoesTotal) * 100) / 100,
    exactTotal: out.reduce((a, r) => a + Math.round(r.owes * 100), 0) / 100,
    roundedTotal: out.reduce((a, r) => a + Math.round(r.rounded * 100), 0) / 100,
    roundTo,
    unsplit: !canSplit && gamesCents > 0, // lanes/tip entered but no games bowled yet
    rows: out,
  };
}

/**
 * Who has paid against their current share. A share can change after someone
 * pays (another game, a corrected bill, different rounding), so what they paid
 * is kept as an amount and compared with what they owe now.
 *
 * @param {object[]} rows  `settle(...).rows`
 * @param {Record<string, number|null>} paid  person id -> dollars paid (missing/null = not yet)
 * @param {number} roundTo  0 for exact shares, else the rounding step in use
 * @returns {{byId: Record<string, {due:number, paid:number|null, left:number, status:'unpaid'|'paid'|'short'|'over'}>,
 *   due:number, collected:number, outstanding:number, refunds:number, paidCount:number, count:number}}
 *   `left` > 0 still owes that much more; < 0 is owed that much back.
 */
export function collection(rows, paid = {}, roundTo = 0) {
  const byId = {};
  let due = 0;
  let collected = 0;
  let outstanding = 0;
  let refunds = 0;
  let paidCount = 0;
  for (const r of rows) {
    const dueCents = Math.round((roundTo ? r.rounded : r.owes) * 100);
    const p = paid[r.id];
    const paidCents = p == null ? null : Math.round(p * 100);
    const leftCents = dueCents - (paidCents ?? 0);
    const status = paidCents == null ? 'unpaid' : leftCents === 0 ? 'paid' : leftCents > 0 ? 'short' : 'over';
    byId[r.id] = { due: dueCents / 100, paid: paidCents == null ? null : paidCents / 100, left: leftCents / 100, status };
    due += dueCents;
    collected += paidCents ?? 0;
    if (leftCents > 0) outstanding += leftCents;
    else refunds -= leftCents;
    if (status === 'paid') paidCount++;
  }
  return { byId, due: due / 100, collected: collected / 100, outstanding: outstanding / 100, refunds: refunds / 100, paidCount, count: rows.length };
}

/** Small seeded RNG for tests and reproducible deals. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
