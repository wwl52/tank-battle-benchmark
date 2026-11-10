// 35 original, deterministic levels. Generated from per-level fixed seeds so the
// same version always produces identical layouts (no runtime randomness drift).
import { GRID } from './config.js';
import { Rng, hashSeed } from './rng.js';

export const LEVEL_SIZE = GRID;

// procedural terrain mix per level (1-indexed level number)
export function levelComposition(n) {
  const armor = Math.min(8, Math.floor((n - 1) / 5));
  const power = Math.min(6, Math.floor(n / 4));
  const fast = Math.min(6, 2 + Math.floor(n / 6));
  const basic = 20 - armor - power - fast;
  return { basic, fast, power, armor };
}

function buildEnemyQueue(n, rng) {
  const comp = levelComposition(n);
  const list = [];
  for (let i = 0; i < comp.basic; i++) list.push('basic');
  for (let i = 0; i < comp.fast; i++) list.push('fast');
  for (let i = 0; i < comp.power; i++) list.push('power');
  for (let i = 0; i < comp.armor; i++) list.push('armor');
  // deterministic shuffle keeps all 20 present but varies spawn order per level
  for (let i = list.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function pickCarriers(queue, rng) {
  const idx = [];
  const count = 4;
  let guard = 0;
  while (idx.length < count && guard++ < 200) {
    const cand = 2 + rng.int(16); // avoid the very first spawns
    if (!idx.includes(cand)) idx.push(cand);
  }
  while (idx.length < count) idx.push(idx.length * 5 + 4);
  return idx.sort((a, b) => a - b);
}

const LAYOUT_MODES = ['islands', 'mazes', 'stripes', 'rings', 'scatter'];

function inProtected(x, y) {
  // base block + wall ring, player spawns, enemy spawn areas must stay clear
  if (x >= 10 && x <= 15 && y >= 23) return true;           // base + ring + player spawn zone
  if (y <= 1 && (x <= 1 || x >= 24 || (x >= 12 && x <= 13))) return true; // enemy spawns
  if (y >= 23 && ((x >= 8 && x <= 9) || (x >= 16 && x <= 17))) return true; // player spawns
  return false;
}

function addBlob(rows, x0, y0, w, h, ch, rng, sprinkle) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      if (x < 0 || y < 0 || x >= GRID || y >= GRID) continue;
      if (inProtected(x, y)) continue;
      if (sprinkle && !rng.chance(0.85)) continue;
      rows[y][x] = ch;
    }
  }
}

function generateRows(n, rng) {
  const rows = Array.from({ length: GRID }, () => Array(GRID).fill('.'));
  const mode = LAYOUT_MODES[(n - 1) % LAYOUT_MODES.length];
  const steelRatio = n < 4 ? 0.02 : n < 10 ? 0.06 : n < 18 ? 0.10 : 0.15;
  const useWater = n >= 4;
  const useGrass = n >= 6;
  const useIce = n >= 8;

  const wallChar = () => (rng.chance(steelRatio) ? 'S' : '#');
  const sideChar = () => {
    if (useWater && rng.chance(0.12)) return '~';
    if (useIce && rng.chance(0.14)) return 'I';
    if (useGrass && rng.chance(0.2)) return 'G';
    return wallChar();
  };

  if (mode === 'stripes') {
    for (let y = 2; y < 22; y++) {
      for (let x = 2; x < 13; x++) {
        if (inProtected(x, y)) continue;
        if ((x % 3 === 0 && (y % 5 !== 0 || rng.chance(0.25))) || rng.chance(0.06)) {
          const c = sideChar();
          rows[y][x] = c;
          rows[y][25 - x] = c;
        }
      }
    }
  } else if (mode === 'mazes') {
    for (let y = 3; y < 22; y += 3) {
      const gx = 2 + rng.int(11);
      for (let x = 2; x < 24; x++) {
        if (inProtected(x, y) || (Math.abs(x - gx) < 2)) continue;
        const c = sideChar();
        rows[y][x] = c;
      }
      // sparse verticals to break long lanes
      const vx = 3 + rng.int(10);
      for (let y2 = y + 1; y2 <= y + 2 && y2 < 22; y2++) {
        if (!inProtected(vx, y2)) { rows[y2][vx] = wallChar(); rows[y2][25 - vx] = wallChar(); }
      }
    }
  } else if (mode === 'rings') {
    for (let r = 2; r <= 10; r += 3) {
      for (let x = r; x < GRID - r; x++) {
        for (const y of [r, GRID - 1 - r]) {
          if (!inProtected(x, y) && rng.chance(0.7)) rows[y][x] = wallChar();
        }
      }
      for (let y = r; y < GRID - r; y++) {
        for (const x of [r, GRID - 1 - r]) {
          if (!inProtected(x, y) && rng.chance(0.7)) rows[y][x] = wallChar();
        }
      }
    }
  } else if (mode === 'islands') {
    for (let k = 0; k < 9 + Math.min(6, Math.floor(n / 5)); k++) {
      const x0 = 1 + rng.int(11);
      const y0 = 2 + rng.int(19);
      const w = 1 + rng.int(3);
      const h = 1 + rng.int(3);
      addBlob(rows, x0, y0, w, h, sideChar(), rng, true);
      // mirror blob
      addBlob(rows, 25 - x0 - w + 1, y0, w, h, sideChar(), rng, false);
    }
  } else { // scatter
    for (let k = 0; k < 70; k++) {
      const x = 1 + rng.int(24);
      const y = 2 + rng.int(20);
      if (inProtected(x, y)) continue;
      const c = sideChar();
      rows[y][x] = c;
      rows[y][25 - x] = c;
    }
  }

  // extra grass cover near mid rows for late levels
  if (useGrass && n % 3 === 0) {
    for (let k = 0; k < 6; k++) {
      addBlob(rows, 2 + rng.int(10), 8 + rng.int(14), 2, 2, 'G', rng, true);
    }
  }

  // carve a clearance near the base so defence walls are reachable but zones stay free
  for (let x = 10; x <= 15; x++) {
    for (let y = 20; y <= 21; y++) {
      if (rows[y][x] === 'I') rows[y][x] = '.'; // no ice right above the base
    }
  }

  // base and defence wall ring
  for (let x = 11; x <= 14; x++) {
    for (let y = 23; y <= 25; y++) rows[y][x] = '.';
  }
  rows[25][12] = 'X'; rows[25][13] = 'X';
  rows[24][12] = 'X'; rows[24][13] = 'X';
  // thin brick ring; every other tile on the open face so it feels original
  for (let x = 11; x <= 14; x++) { rows[23][x] = '#'; }
  for (let y = 23; y <= 25; y++) { rows[y][11] = '#'; rows[y][14] = '#'; }

  // player spawn markers
  rows[25][8] = '1'; rows[25][9] = '1'; rows[24][8] = '1'; rows[24][9] = '1';
  rows[25][16] = '2'; rows[25][17] = '2'; rows[24][16] = '2'; rows[24][17] = '2';

  // enemy spawn markers: one per 2x2 spawn area (top-left cell holds the marker)
  const marks = [[0, 0], [12, 0], [24, 0]];
  for (const [mx, my] of marks) {
    rows[my][mx] = '3';
  }
  return rows.map(r => r.join(''));
}

const cache = new Map();

export function getLevel(n) {
  if (cache.has(n)) return cache.get(n);
  if (n < 1 || n > 35) throw new Error(`invalid level number: ${n}`);
  const rng = new Rng(hashSeed(`tank-battle level ${n} v1`));
  const rows = generateRows(n, rng);
  const queue = buildEnemyQueue(n, rng);
  const carriers = pickCarriers(queue, rng);
  const level = {
    id: n,
    rows,
    enemies: queue,
    carriers,
  };
  cache.set(n, level);
  return level;
}

export const LEVELS = Array.from({ length: 35 }, (_, i) => getLevel(i + 1));
