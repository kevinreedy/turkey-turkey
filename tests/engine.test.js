import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dealMatch, laneSizes, pairsStructure, gameTotals, settle, reviewMatch, pairKey, mulberry32 } from '../js/engine.js';

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
  const s = settle(matches, 40);
  assert.equal(s.totalUnits, 4);
  assert.equal(s.perGame, 10);
  assert.equal(s.rows.find((r) => r.id === 'a').owes, 25);
});

test('shares always add up to the exact bill', () => {
  const lanes = [{ num: '1', people: ['a', 'b', 'c'] }, { num: '2', people: ['d', 'e', 'f', 'g'] }];
  const matches = [{ format: 'regular', lanes }, { format: 'pairs', lanes }, { format: 'regular', lanes: [lanes[0]] }];
  for (const bill of [250, 99.99, 412.8, 0.07]) {
    const total = settle(matches, bill).rows.reduce((a, r) => a + Math.round(r.owes * 100), 0);
    assert.equal(total, Math.round(bill * 100), `bill ${bill}`);
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
