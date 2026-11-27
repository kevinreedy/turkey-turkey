// Turkey Turkey — pure helpers for editing a lineup by hand (moving, swapping,
// switching format). No DOM access, so they're testable with `node --test`.

const byNum = (a, b) => String(a.num).localeCompare(String(b.num), undefined, { numeric: true });

/** Take someone off every lane (and out of their pair). Empty lanes are dropped. */
export function removeFromLanes(lanes, id) {
  return lanes
    .map((l) => ({
      ...l,
      people: l.people.filter((x) => x !== id),
      ...(l.groups ? { groups: l.groups.map((g) => g.filter((x) => x !== id)).filter((g) => g.length) } : {}),
    }))
    .filter((l) => l.people.length);
}

/**
 * Put someone on a lane, taking them off wherever they were. In pairs they join
 * the lane's solo bowler if there is one, otherwise they start a new pair.
 */
export function placeOnLane(lanes, id, lane, pairs) {
  const out = removeFromLanes(lanes, id);
  let target = out.find((l) => l.laneId === lane.laneId);
  if (!target) {
    target = { laneId: lane.laneId, num: String(lane.num), people: [], ...(pairs ? { groups: [] } : {}) };
    out.push(target);
  }
  if (pairs) {
    const groups = (target.groups || []).map((g) => g.slice());
    const solo = groups.find((g) => g.length === 1);
    if (solo) solo.push(id);
    else groups.push([id]);
    target.groups = groups;
    target.people = groups.flat();
  } else {
    target.people = [...target.people, id];
  }
  return out.sort(byNum);
}

/** Trade two people's spots (lane and partner). */
export function swapInLanes(lanes, a, b) {
  const sw = (x) => (x === a ? b : x === b ? a : x);
  return lanes.map((l) => ({ ...l, people: l.people.map(sw), ...(l.groups ? { groups: l.groups.map((g) => g.map(sw)) } : {}) }));
}

/**
 * Switch a lineup between regular and pairs, keeping everyone on their lane.
 * Pairs are formed in lane order; an odd one out joins the last pair as a trio.
 */
export function convertFormat(lanes, format) {
  if (format !== 'pairs') return lanes.map(({ groups, ...l }) => ({ ...l }));
  return lanes.map((l) => {
    const groups = [];
    for (let i = 0; i < l.people.length; i += 2) groups.push(l.people.slice(i, i + 2));
    if (groups.length > 1 && groups[groups.length - 1].length === 1) groups[groups.length - 2].push(groups.pop()[0]);
    return { ...l, people: groups.flat(), groups };
  });
}

/** Match numbers follow their order (after one is deleted, say). */
export function renumber(matches) {
  matches.forEach((m, i) => (m.n = i + 1));
  return matches;
}

/** A fingerprint of who bowled where, to notice when the night's history was edited. */
export function historySignature(matches) {
  return JSON.stringify(matches.map((m) => [m.format, m.lanes.map((l) => [l.num, l.people, l.groups || null])]));
}
