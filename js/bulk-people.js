export function prepareBulkPeople(text, shoes, existingPeople, createId) {
  if (shoes == null) return { error: { type: 'shoes' } };
  const names = text.split(/\r?\n/).map((name) => name.trim().replace(/\s+/g, ' ')).filter(Boolean);
  if (!names.length) return { error: { type: 'empty' } };

  const seen = new Set();
  const repeated = new Set();
  for (const name of names) {
    const key = name.toLowerCase();
    if (seen.has(key)) repeated.add(name);
    seen.add(key);
  }
  if (repeated.size) return { error: { type: 'repeated', names: [...repeated] } };

  const existing = new Set(existingPeople.map((person) => person.name.toLowerCase()));
  const alreadyAdded = names.filter((name) => existing.has(name.toLowerCase()));
  if (alreadyAdded.length) return { error: { type: 'existing', names: alreadyAdded } };

  return {
    people: names.map((name) => ({ id: createId(), name, here: true, newcomer: false, knows: [], shoes })),
  };
}

export function resetBulkEntry(ui) {
  ui.bulkNames = '';
  ui.bulkShoes = null;
  ui.bulkAdd = false;
}
