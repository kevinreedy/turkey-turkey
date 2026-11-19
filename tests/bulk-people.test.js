import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareBulkPeople, resetBulkEntry } from '../js/bulk-people.js';

const ids = () => {
  let next = 0;
  return () => `person-${++next}`;
};

test('bulk names are trimmed, normalized, and split across lines', () => {
  const result = prepareBulkPeople('  Alex   Reed \r\n\n Jordan Lee  \n', false, [], ids());
  assert.deepEqual(result.people.map((person) => person.name), ['Alex Reed', 'Jordan Lee']);
  assert.equal(result.people.every((person) => person.here && person.shoes === false), true);
});

test('bulk entries apply either shoe choice to every person', () => {
  for (const shoes of [true, false]) {
    const result = prepareBulkPeople('Alex\nJordan', shoes, [], ids());
    assert.deepEqual(result.people.map((person) => person.shoes), [shoes, shoes]);
  }
});

test('bulk entries reject repeated names and names already on the roster', () => {
  const repeated = prepareBulkPeople('Alex\nalex', true, [], ids());
  assert.deepEqual(repeated.error, { type: 'repeated', names: ['alex'] });

  const existing = prepareBulkPeople('Jordan\nAlex', true, [{ name: 'alex' }], ids());
  assert.deepEqual(existing.error, { type: 'existing', names: ['Alex'] });
});

test('bulk entries require a shoe choice and at least one name', () => {
  assert.deepEqual(prepareBulkPeople('Alex', null, [], ids()).error, { type: 'shoes' });
  assert.deepEqual(prepareBulkPeople(' \n ', true, [], ids()).error, { type: 'empty' });
});

test('successful bulk entry resets the form before rerender', () => {
  const ui = { bulkNames: 'Alex\nJordan', bulkShoes: true, bulkAdd: true };
  const result = prepareBulkPeople(ui.bulkNames, ui.bulkShoes, [], ids());
  assert.equal(result.people.length, 2);

  resetBulkEntry(ui);
  assert.deepEqual(ui, { bulkNames: '', bulkShoes: null, bulkAdd: false });
});
