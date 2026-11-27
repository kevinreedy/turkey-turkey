import { test } from 'node:test';
import assert from 'node:assert/strict';
import { removeFromLanes, placeOnLane, swapInLanes, convertFormat, renumber, historySignature } from '../js/lineup.js';
import { dealMatch, gameTotals, reviewMatch, mulberry32 } from '../js/engine.js';

const L17 = { laneId: 'l17', num: '17' };
const L18 = { laneId: 'l18', num: '18' };

test('recording a match from nothing, lane by lane', () => {
  let lanes = [];
  for (const id of ['a', 'b', 'c']) lanes = placeOnLane(lanes, id, L18, false);
  for (const id of ['d', 'e']) lanes = placeOnLane(lanes, id, L17, false);
  assert.deepEqual(lanes, [
    { laneId: 'l17', num: '17', people: ['d', 'e'] },
    { laneId: 'l18', num: '18', people: ['a', 'b', 'c'] },
  ]);
  // Ticking someone on another lane moves them; an emptied lane disappears.
  lanes = placeOnLane(lanes, 'd', L18, false);
  lanes = placeOnLane(lanes, 'e', L18, false);
  assert.deepEqual(lanes, [{ laneId: 'l18', num: '18', people: ['a', 'b', 'c', 'd', 'e'] }]);
  assert.deepEqual(removeFromLanes(lanes, 'c')[0].people, ['a', 'b', 'd', 'e']);
});

test('pairs fill in the order people are ticked, and swaps change partners', () => {
  let lanes = [];
  for (const id of ['a', 'b', 'c', 'd', 'e']) lanes = placeOnLane(lanes, id, L17, true);
  assert.deepEqual(lanes[0].groups, [['a', 'b'], ['c', 'd'], ['e']]);
  lanes = placeOnLane(lanes, 'f', L17, true);
  assert.deepEqual(lanes[0].groups, [['a', 'b'], ['c', 'd'], ['e', 'f']]);
  lanes = swapInLanes(lanes, 'b', 'c');
  assert.deepEqual(lanes[0].groups, [['a', 'c'], ['b', 'd'], ['e', 'f']]);
  assert.deepEqual(lanes[0].people, ['a', 'c', 'b', 'd', 'e', 'f']);
  lanes = removeFromLanes(lanes, 'a');
  assert.deepEqual(lanes[0].groups, [['c'], ['b', 'd'], ['e', 'f']]);
});

test('switching format keeps everyone on their lane', () => {
  const regular = [{ laneId: 'l17', num: '17', people: ['a', 'b', 'c', 'd', 'e'] }, { laneId: 'l18', num: '18', people: ['f'] }];
  const pairs = convertFormat(regular, 'pairs');
  assert.deepEqual(pairs[0].groups, [['a', 'b'], ['c', 'd', 'e']]);
  assert.deepEqual(pairs[1].groups, [['f']]);
  assert.deepEqual(convertFormat(pairs, 'regular'), [
    { laneId: 'l17', num: '17', people: ['a', 'b', 'c', 'd', 'e'] },
    { laneId: 'l18', num: '18', people: ['f'] },
  ]);
});

test('renumbering and noticing edited history', () => {
  const ms = renumber([{ n: 1, format: 'regular', lanes: [] }, { n: 3, format: 'regular', lanes: [] }]);
  assert.deepEqual(ms.map((m) => m.n), [1, 2]);
  const a = [{ format: 'regular', lanes: [{ num: '17', people: ['a', 'b'] }] }];
  const b = [{ format: 'regular', lanes: [{ num: '17', people: ['a', 'c'] }] }];
  assert.equal(historySignature(a), historySignature(structuredClone(a)));
  assert.notEqual(historySignature(a), historySignature(b));
});

test('a hand-recorded first match feeds tallies, buddy games and the next deal', () => {
  // Match 1 happened without the app; "me" arrived late and wasn't in it.
  const people = ['me', 'a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => ({ id }));
  people[1] = { id: 'a', newcomer: true, knows: ['b'] };
  let lanes = [];
  for (const id of ['a', 'b', 'c', 'd']) lanes = placeOnLane(lanes, id, L17, false);
  for (const id of ['e', 'f', 'g']) lanes = placeOnLane(lanes, id, L18, false);
  const matches = [{ id: 'm1', n: 1, format: 'regular', manual: true, lanes }];

  const t = gameTotals(matches);
  assert.equal(t.get('me'), undefined);
  assert.equal(t.get('a').units, 1);
  // The newcomer's buddy game counts: they're on lane 17 with b.
  assert.deepEqual(reviewMatch({ lanes, people, matches: [], rules: { buddyGames: 1 } }).buddyFor, { a: 'b' });

  const m2 = dealMatch({ people, lanes: [L17, L18].map((l) => ({ id: l.laneId, num: l.num })), matches, rules: { buddyGames: 1 }, rng: mulberry32(4) });
  const prev = new Map(lanes.flatMap((l) => l.people.map((p) => [p, l.num])));
  for (const lane of m2.lanes) for (const p of lane.people) assert.notEqual(prev.get(p), lane.num, `${p} repeated lane ${lane.num}`);
  assert.equal(m2.lanes.flatMap((l) => l.people).length, 8);
});
