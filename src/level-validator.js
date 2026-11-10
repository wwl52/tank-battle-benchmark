// Static validation for all 35 generated levels.
import { GRID, TERRAIN } from './config.js';
import { GameMap } from './map.js';
import { ENEMY } from './config.js';

function isPassableForPath(t) {
  // destructible brick counts as passable for pathing (it can be shot through)
  return t === TERRAIN.EMPTY || t === TERRAIN.BRICK || t === TERRAIN.GRASS || t === TERRAIN.ICE;
}

export function bfsReachable(map, startCells, targetCells) {
  const seen = new Uint8Array(GRID * GRID);
  const targets = new Uint8Array(GRID * GRID);
  for (const c of targetCells) targets[c.cy * GRID + c.cx] = 1;
  const queue = [];
  for (const c of startCells) {
    const i = c.cy * GRID + c.cx;
    if (isPassableForPath(map.terrain[i]) && !seen[i]) {
      seen[i] = 1;
      queue.push(i);
    }
  }
  while (queue.length) {
    const i = queue.pop();
    if (targets[i]) return true;
    const x = i % GRID;
    const y = (i / GRID) | 0;
    const nb = [];
    if (y > 0) nb.push(i - GRID);
    if (y < GRID - 1) nb.push(i + GRID);
    if (x > 0) nb.push(i - 1);
    if (x < GRID - 1) nb.push(i + 1);
    for (const j of nb) {
      if (!seen[j] && isPassableForPath(map.terrain[j])) {
        seen[j] = 1;
        queue.push(j);
      }
    }
  }
  return false;
}

export function validateLevel(level, map) {
  let m = map;
  let parseError = null;
  if (!m) {
    try {
      m = GameMap.fromAscii(level.rows);
    } catch (err) {
      parseError = err;
      m = null;
    }
  }
  if (!m) {
    return { ok: false, errors: [parseError ? `map parse failed: ${parseError.message}` : 'map parse failed'] };
  }
  const errors = [];

  if (m.baseCells.length !== 4) errors.push(`base must be cells x4, got ${m.baseCells.length}`);
  if (m.spawnPoints.length !== 3) errors.push(`enemy spawn points: ${m.spawnPoints.length}, expected 3`);
  const spawnAreaClear = m.spawnPoints.every(s =>
    [[0, 0], [1, 0], [0, 1], [1, 1]].every(([dx, dy]) => {
      const i = (s.cy + dy) * GRID + (s.cx + dx);
      return m.terrain[i] === TERRAIN.EMPTY;
    }));
  if (!spawnAreaClear) errors.push('an enemy spawn area is blocked');
  if (!m.playerSpawns[0] || !m.playerSpawns[1]) errors.push('player spawn markers missing');
  else {
    for (let s = 0; s < 2; s++) {
      const p = m.playerSpawns[s];
      const clear = [[0, 0], [1, 0], [0, 1], [1, 1]].every(([dx, dy]) => {
        const i = (p.cy + dy) * GRID + (p.cx + dx);
        return m.terrain[i] === TERRAIN.EMPTY;
      });
      if (!clear) errors.push(`player spawn ${s + 1} area is blocked`);
    }
  }

  if (level.enemies?.length !== ENEMY.countPerLevel) {
    errors.push(`enemy queue length ${level.enemies?.length}, expected ${ENEMY.countPerLevel}`);
  } else {
    const valid = ['basic', 'fast', 'power', 'armor'];
    if (level.enemies.some(t => !valid.includes(t))) errors.push('enemy queue has an unknown type');
  }

  // path: from each enemy spawn area to any cell surrounding the base ring
  const targetCells = [];
  const bx0 = Math.min(...m.baseCells.map(c => c.cx));
  const by0 = Math.min(...m.baseCells.map(c => c.cy));
  for (const t of [
    { cx: bx0, cy: by0 - 1 }, { cx: bx0 + 1, cy: by0 - 1 },
    { cx: bx0 - 1, cy: by0 }, { cx: bx0 - 1, cy: by0 + 1 },
    { cx: bx0 + 2, cy: by0 }, { cx: bx0 + 2, cy: by0 + 1 },
  ]) {
    if (t.cx >= 0 && t.cx < GRID && t.cy >= 0 && t.cy < GRID) targetCells.push(t);
  }
  const starts = m.spawnPoints.map(p => ({ cx: p.cx + 1, cy: p.cy + 1 }));
  for (const s of starts) {
    if (!bfsReachable(m, [s], targetCells)) {
      errors.push(`no route from enemy spawn (${s.cx},${s.cy}) to the base`);
      break;
    }
  }
  // player spawn must reach open field
  for (const s of m.playerSpawns) {
    if (s && !bfsReachable(m, [{ cx: s.cx, cy: s.cy }], [{ cx: 0, cy: 6 }, { cx: 25, cy: 6 }, { cx: 12, cy: 6 }])) {
      errors.push('player spawn is sealed off');
      break;
    }
  }
  // rough terrain budget: at most 42% intractable (steel+water) cells
  let hard = 0;
  for (let i = 0; i < m.terrain.length; i++) {
    if (m.terrain[i] === TERRAIN.STEEL || m.terrain[i] === TERRAIN.WATER) hard++;
  }
  if (hard > m.terrain.length * 0.42) errors.push(`too many impassable cells: ${hard}`);
  return { ok: errors.length === 0, errors };
}

export function validateAllLevels(levels) {
  const results = [];
  const seenHashes = new Map();
  levels.forEach((level, idx) => {
    const errors = [];
    if (level.id !== idx + 1) errors.push(`level id mismatch: ${level.id} at index ${idx}`);
    const hash = level.rows.join('|');
    if (seenHashes.has(hash)) errors.push(`layout duplicates level ${seenHashes.get(hash)}`);
    else seenHashes.set(hash, idx + 1);
    const v = validateLevel(level);
    errors.push(...v.errors);
    results.push({ level: level.id, ok: errors.length === 0, errors });
  });
  return { ok: results.every(r => r.ok), results };
}
