import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dealMatch, laneSizes, pairsStructure, gameTotals, settle, collection, reviewMatch, pairKey, mulberry32 } from '../js/engine.js';

const LANES4 = [17, 18, 19, 20].map((n) => ({ id: `l${n}`, num: String(n) }));
const LANES2 = LANES4.slice(0, 2);
const crowd = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i}` }));
const sizes = (m) => m.lanes.map((l) => l.people.length).sort((a, b) => b - a);

/** Bowl `count` matches in a row, feeding each one back into history. */
function night({ people, lanes, count, format = 'regular', never = [], rules = {}, seed = 1 }) {
  const rng = mulberry32(seed);
  const matches = [];
  for (let i = 0; i < count; i++) {
    const f = typeof format === 'function' ? format(i) : format;
    const m = dealMatch({ people, lanes, matches, format: f, never, rules, rng });
    matches.push({ format: f, lanes: m.lanes });
  }
  return matches;
}

test('lane sizes are as even as possible', () => {
  assert.deepEqual(laneSizes(22, 4), [6, 6, 5, 5]);
  assert.deepEqual(laneSizes(8, 2), [4, 4]);
  assert.deepEqual(laneSizes(3, 4), [1, 1, 1]);
  assert.deepEqual(laneSizes(1, 1), [1]);
});

test('pairs structure keeps every lane even, trio only for odd head counts', () => {
  const s22 = pairsStructure(22, 4).map((g) => g.reduce((a, b) => a + b, 0)).sort((a, b) => b - a);
  assert.deepEqual(s22, [6, 6, 6, 4]);
  const s23 = pairsStructure(23, 4);
  assert.equal(s23.flat().filter((x) => x === 3).length, 1);
  assert.equal(s23.flat().reduce((a, b) => a + b, 0), 23);
  assert.deepEqual(pairsStructure(1, 4), [[1]]);
  assert.deepEqual(pairsStructure(3, 4), [[3]]);
});

test('every present bowler is dealt exactly once, with even lane sizes', () => {
  const people = crowd(22);
  const m = dealMatch({ people, lanes: LANES4, rng: mulberry32(7) });
  assert.deepEqual(sizes(m), [6, 6, 5, 5]);
  const all = m.lanes.flatMap((l) => l.people).sort();
  assert.deepEqual(all, people.map((p) => p.id).sort());
});

test('pairs deal gives everyone a partner and even lanes', () => {
  const m = dealMatch({ people: crowd(22), lanes: LANES4, format: 'pairs', rng: mulberry32(3) });
  assert.deepEqual(sizes(m), [6, 6, 6, 4]);
  for (const lane of m.lanes) {
    assert.ok(lane.groups.every((g) => g.length === 2));
    assert.deepEqual(lane.groups.flat(), lane.people);
  }
});

test('never-together pairs are kept apart all night', () => {
  const people = crowd(16);
  const never = [['p0', 'p1'], ['p2', 'p3'], ['p0', 'p4'], ['p5', 'p6']];
  for (const lanes of [LANES4, LANES2]) {
    const matches = night({ people, lanes, count: 10, never, format: (i) => (i === 4 ? 'pairs' : 'regular') });
    for (const m of matches) {
      for (const lane of m.lanes) {
        for (const [a, b] of never) assert.ok(!(lane.people.includes(a) && lane.people.includes(b)), `${a}+${b} on lane ${lane.num}`);
      }
    }
  }
});

test('newcomers get someone they know for their first two games', () => {
  const people = crowd(20);
  people[0] = { id: 'p0', newcomer: true, knows: ['p9'] };
  people[1] = { id: 'p1', newcomer: true, knows: ['p12', 'p15'] };
  for (let seed = 1; seed <= 5; seed++) {
    const matches = night({ people, lanes: LANES4, count: 4, seed, format: (i) => (i === 1 ? 'pairs' : 'regular') });
    for (const m of matches.slice(0, 2)) {
      const groupOf = (p) => m.lanes.flatMap((l) => l.groups || [l.people]).find((g) => g.includes(p));
      assert.ok(groupOf('p0').includes('p9'), 'p0 with p9');
      assert.ok(groupOf('p1').some((q) => q === 'p12' || q === 'p15'), 'p1 with a friend');
    }
  }
});

test('after their buddy games, a newcomer bowls with people they already shared a lane with', () => {
  const lanes = [15, 16, 17, 18, 19, 20].map((n) => ({ id: `l${n}`, num: String(n) }));
  const people = crowd(20);
  people[0] = { id: 'p0', newcomer: true, knows: ['p9'] };
  for (let seed = 1; seed <= 8; seed++) {
    const matches = night({ people, lanes, count: 4, seed, format: (i) => (i === 2 && seed % 2 ? 'pairs' : 'regular') });
    const before = new Set(matches.slice(0, 2).flatMap((m) => m.lanes.find((l) => l.people.includes('p0')).people));
    const lane = matches[2].lanes.find((l) => l.people.includes('p0'));
    const familiar = lane.people.filter((q) => q !== 'p0' && before.has(q));
    assert.ok(familiar.length >= 2, `seed ${seed}: only ${familiar.length} familiar on lane ${lane.num}`);
  }
});

test('review flags a newcomer stranded among strangers after their buddy games', () => {
  const people = [{ id: 'a', newcomer: true, knows: ['b'] }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
  const matches = [{ format: 'regular', lanes: [{ num: '1', people: ['a', 'b'] }, { num: '2', people: ['c', 'd'] }] }];
  const rules = { buddyGames: 1 };
  const lonely = reviewMatch({ lanes: [{ num: '1', people: ['a', 'c'] }, { num: '2', people: ['b', 'd'] }], people, matches, rules });
  assert.ok(lonely.issues.some((i) => i.type === 'familiar' && i.people[0] === 'a'));
  const eased = reviewMatch({ lanes: [{ num: '1', people: ['a', 'b'] }, { num: '2', people: ['c', 'd'] }], people, matches, rules });
  assert.ok(!eased.issues.some((i) => i.type === 'familiar'));
  // Only the first game after the buddy games is eased.
  const later = reviewMatch({ lanes: [{ num: '1', people: ['a', 'c'] }, { num: '2', people: ['b', 'd'] }], people, matches: [...matches, ...matches], rules });
  assert.ok(!later.issues.some((i) => i.type === 'familiar'));
});

test('with 4 lanes nobody repeats their previous lane', () => {
  const matches = night({ people: crowd(22), lanes: LANES4, count: 8 });
  for (let i = 1; i < matches.length; i++) {
    const prev = new Map(matches[i - 1].lanes.flatMap((l) => l.people.map((p) => [p, l.num])));
    for (const lane of matches[i].lanes) for (const p of lane.people) assert.notEqual(prev.get(p), lane.num);
  }
});

test('spreads matchups far better than a blind shuffle', () => {
  const people = crowd(22);
  const met = (matches) => {
    const seen = new Set();
    for (const m of matches) for (const l of m.lanes) for (const a of l.people) for (const b of l.people) if (a !== b) seen.add(pairKey(a, b));
    return seen.size;
  };
  const avg = (f) => [1, 2, 3, 4].map(f).reduce((a, b) => a + b, 0) / 4;
  // Baseline: ignore history entirely (each match dealt with no knowledge of the last).
  const blind = avg((seed) => {
    const rng = mulberry32(seed + 100);
    return met(Array.from({ length: 6 }, () => dealMatch({ people, lanes: LANES4, rng, rules: { avoidRepeatLane: false } })));
  });
  // Pure mixing (lane-repeat rule off): 231 possible pairs, should cover ~90%.
  const mixing = avg((seed) => met(night({ people, lanes: LANES4, count: 6, seed, rules: { avoidRepeatLane: false } })));
  assert.ok(mixing >= blind + 20, `mixing ${mixing} vs blind ${blind}`);
  // Default (no repeat lanes) trades a little mixing away but still beats chance.
  const withLaneRule = avg((seed) => met(night({ people, lanes: LANES4, count: 6, seed })));
  assert.ok(withLaneRule > blind, `with lane rule ${withLaneRule} vs blind ${blind}`);
});

test('people coming and going mid-night still deal cleanly', () => {
  const rng = mulberry32(5);
  const matches = [];
  let people = crowd(10);
  for (let i = 0; i < 6; i++) {
    if (i === 2) people = people.concat(crowd(16).slice(10)); // six arrive
    if (i === 4) people = people.filter((p) => !['p1', 'p2', 'p3'].includes(p.id)); // three leave
    const lanes = i < 2 ? LANES2 : LANES4;
    const m = dealMatch({ people, lanes, matches, rng });
    assert.equal(m.lanes.flatMap((l) => l.people).length, people.length);
    matches.push({ format: 'regular', lanes: m.lanes });
  }
});

test('tiny turnouts work', () => {
  assert.equal(dealMatch({ people: crowd(1), lanes: LANES4 }).lanes.length, 1);
  assert.deepEqual(sizes(dealMatch({ people: crowd(3), lanes: LANES4, format: 'pairs' })), [3]);
  assert.deepEqual(dealMatch({ people: [], lanes: LANES4 }).lanes, []);
});

test('pairs games count as half for the bill', () => {
  const matches = [
    { format: 'regular', lanes: [{ num: '17', people: ['a', 'b'] }] },
    { format: 'pairs', lanes: [{ num: '18', people: ['a', 'b'], groups: [['a', 'b']] }] },
    { format: 'regular', lanes: [{ num: '17', people: ['a'] }] },
  ];
  const t = gameTotals(matches);
  assert.deepEqual(t.get('a'), { regular: 2, pairs: 1, units: 2.5 });
  assert.deepEqual(t.get('b'), { regular: 1, pairs: 1, units: 1.5 });
  const s = settle(matches, { lanes: 40 });
  assert.equal(s.totalUnits, 4);
  assert.equal(s.perGame, 10);
  assert.equal(s.rows.find((r) => r.id === 'a').owes, 25);
});

test('tip rides on games, shoes only on renters', () => {
  const matches = [
    { format: 'regular', lanes: [{ num: '1', people: ['a', 'b'] }] },
    { format: 'pairs', lanes: [{ num: '2', people: ['a', 'b'], groups: [['a', 'b']] }] },
    { format: 'regular', lanes: [{ num: '1', people: ['a'] }] },
  ];
  // 4 game units: a = 2.5, b = 1.5. Lanes $30 + tip $10 = $10/game. b rented shoes at $4.
  const s = settle(matches, { lanes: 30, tip: 10, shoePrice: 4, renters: ['b'] });
  const a = s.rows.find((r) => r.id === 'a');
  const b = s.rows.find((r) => r.id === 'b');
  assert.equal(s.perGame, 10);
  assert.deepEqual([a.games, a.shoes, a.owes], [25, 0, 25]);
  assert.deepEqual([b.games, b.shoes, b.owes], [15, 4, 19]);
  assert.equal(s.shoesTotal, 4);
  assert.equal(s.total, 44);
  assert.equal(s.exactTotal, 44);
});

test('someone who rented shoes but has no games yet still pays for shoes', () => {
  const matches = [{ format: 'regular', lanes: [{ num: '1', people: ['a'] }] }];
  const s = settle(matches, { lanes: 10, shoePrice: 4, renters: ['z'] });
  assert.equal(s.rows.find((r) => r.id === 'z').owes, 4);
  assert.equal(s.exactTotal, 14);
});

test('rounding to the dollar', () => {
  const lanes = [{ num: '1', people: ['a', 'b', 'c'] }];
  const s = settle([{ format: 'regular', lanes }], { lanes: 20, tip: 5, shoePrice: 4.5, renters: ['a'] });
  // $25 over 3 games = 8.33/8.33/8.34 (a gets +4.50 shoes)
  assert.deepEqual(s.rows.map((r) => r.rounded).sort((x, y) => x - y), [8, 8, 13]);
  assert.equal(s.roundedTotal, 29);
  assert.equal(s.total, 29.5);
});

test('collection tracks who has paid against their current share', () => {
  const lanes = [{ num: '1', people: ['a', 'b', 'c', 'd'] }];
  // $40 over 4 games = $10 each.
  const s = settle([{ format: 'regular', lanes }], { lanes: 40 });
  const c = collection(s.rows, { a: 10, b: 6, c: 12, d: null }, 0);
  assert.deepEqual(c.byId.a, { due: 10, paid: 10, left: 0, status: 'paid' });
  assert.deepEqual(c.byId.b, { due: 10, paid: 6, left: 4, status: 'short' });
  assert.deepEqual(c.byId.c, { due: 10, paid: 12, left: -2, status: 'over' });
  assert.deepEqual(c.byId.d, { due: 10, paid: null, left: 10, status: 'unpaid' });
  assert.equal(c.due, 40);
  assert.equal(c.collected, 28);
  assert.equal(c.outstanding, 14);
  assert.equal(c.refunds, 2);
  assert.equal(c.paidCount, 1);
  assert.equal(c.count, 4);
});

test('paid in full depends on the rounding in use', () => {
  const lanes = [{ num: '1', people: ['a', 'b', 'c'] }];
  // $25 over 3 = 8.33 / 8.33 / 8.34; rounded to 50¢ that's 8.50 each.
  const s = settle([{ format: 'regular', lanes }], { lanes: 25, roundTo: 0.5 });
  const paid = { a: 8.5, b: 8.5, c: 8.5 };
  const rounded = collection(s.rows, paid, 0.5);
  assert.equal(rounded.paidCount, 3);
  assert.equal(rounded.collected, 25.5);
  const exact = collection(s.rows, paid, 0);
  assert.equal(exact.paidCount, 0);
  assert.ok(Object.values(exact.byId).every((x) => x.status === 'over'));
});

test('rounding to the nearest 50¢', () => {
  const lanes = [{ num: '1', people: ['a', 'b', 'c'] }];
  const s = settle([{ format: 'regular', lanes }], { lanes: 20, tip: 5, shoePrice: 4.5, renters: ['a'], roundTo: 0.5 });
  // 8.33 → 8.50, 8.34 → 8.50, a: 8.33 + 4.50 = 12.83 → 13.00
  assert.deepEqual(s.rows.map((r) => r.rounded).sort((x, y) => x - y), [8.5, 8.5, 13]);
  assert.equal(s.roundedTotal, 30);
  // Halfway rounds up, and quarters land on the right side.
  const one = (amount) => settle([{ format: 'regular', lanes: [{ num: '1', people: ['a'] }] }], { lanes: amount, roundTo: 0.5 }).rows[0].rounded;
  assert.deepEqual([10.24, 10.25, 10.74, 10.75, 10.5, 10].map(one), [10, 10.5, 10.5, 11, 10.5, 10]);
});

test('shares always add up to exactly what was paid', () => {
  const lanes = [{ num: '1', people: ['a', 'b', 'c'] }, { num: '2', people: ['d', 'e', 'f', 'g'] }];
  const matches = [{ format: 'regular', lanes }, { format: 'pairs', lanes }, { format: 'regular', lanes: [lanes[0]] }];
  for (const [l, tip] of [[250, 0], [99.99, 12.5], [412.8, 61.92], [0.07, 0]]) {
    const s = settle(matches, { lanes: l, tip, shoePrice: 4, renters: ['a', 'd', 'g'] });
    const total = s.rows.reduce((a, r) => a + Math.round(r.owes * 100), 0);
    assert.equal(total, Math.round((l + tip + 12) * 100), `lanes ${l} tip ${tip}`);
  }
});

test('review flags a manual swap that breaks a rule', () => {
  const people = [{ id: 'a', newcomer: true, knows: ['b'] }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
  const lanes = [
    { num: '1', people: ['a', 'c'] },
    { num: '2', people: ['b', 'd'] },
  ];
  const r = reviewMatch({ lanes, people, never: [['b', 'd']] });
  assert.ok(r.issues.some((i) => i.type === 'never'));
  assert.ok(r.issues.some((i) => i.type === 'buddy' && i.people[0] === 'a'));
});
