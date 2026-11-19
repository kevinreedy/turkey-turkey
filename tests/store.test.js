import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultState, parseBackup, freshNight } from '../js/store.js';

test('backups round-trip and reject other files', async () => {
  const s = defaultState();
  s.people.push({ id: 'a', name: 'Priya', here: true, newcomer: true, knows: ['b'], shoes: true });
  s.matches.push({ id: 'm1', n: 1, format: 'regular', lanes: [{ laneId: 'x', num: '17', people: ['a'] }] });
  const text = JSON.stringify({ app: 'turkey-turkey', exportedAt: 'now', state: s });
  const back = parseBackup(text);
  assert.deepEqual(back.people, s.people);
  assert.equal(back.matches.length, 1);
  assert.throws(() => parseBackup('{"hello":1}'), /not a Turkey Turkey backup/);
});

test('a new night keeps the roster and rules but clears games', () => {
  const s = defaultState();
  s.people.push({ id: 'a', name: 'Priya', here: true, newcomer: true, knows: ['b'], shoes: true });
  s.never.push(['a', 'b']);
  s.rules.buddyGames = 3;
  s.matches.push({ id: 'm1', n: 1, format: 'regular', lanes: [] });
  s.costs = { shoePrice: '5', lanes: '100', tip: '20', round: true };
  const n = freshNight(s);
  assert.equal(n.people[0].here, false);
  assert.equal(n.people[0].shoes, null);
  assert.deepEqual(n.costs, { shoePrice: '5', lanes: '', tip: '', round: true });
  assert.deepEqual(n.people[0].knows, ['b']);
  assert.deepEqual(n.never, [['a', 'b']]);
  assert.equal(n.rules.buddyGames, 3);
  assert.equal(n.matches.length, 0);
});

test('older saves with a single bill become the lanes amount', () => {
  const s = defaultState();
  delete s.costs;
  s.bill = '250';
  s.people.push({ id: 'a', name: 'Priya' });
  const back = parseBackup(JSON.stringify(s));
  assert.equal(back.costs.lanes, '250');
  assert.equal(back.costs.shoePrice, '4');
  assert.equal(back.people[0].shoes, null);
  assert.equal('bill' in back, false);
});
