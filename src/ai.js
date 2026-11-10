import { TANK, GRID, TERRAIN } from './config.js';

// Enemy AI. Speed and cadence vary per type; armour tanks additionally run a cheap
// BFS (limit 1 recon every 45 ticks) toward the base for goal-oriented behaviour.

const PASSABLE = (t) => t === TERRAIN.EMPTY || t === TERRAIN.BRICK || t === TERRAIN.GRASS || t === TERRAIN.ICE;

/**
 * Decide a heading for an enemy tank.
 * world: { map, players, baseRect, rng }
 * enemy: the enemy asking for a decision.
 */
export function decideDirection(enemy, world) {
  const { map, players, baseRect, rng } = world;
  const ex = enemy.x + TANK / 2;
  const ey = enemy.y + TANK / 2;

  // goal selection depends on type personality
  const roll = rng.next();
  let target = null;
  if (enemy.type === 'armor' && enemy.pathDir) {
    return enemy.pathDir; // BFS recon has the final say for armour tanks
  }
  if (enemy.type === 'power') {
    target = players.length && roll < 0.5 ? players[0] : baseRect ? baseRect() : null;
  } else if (enemy.type === 'basic') {
    target = players.length && roll < 0.4 ? players[0] : baseRect ? baseRect() : null;
  } else if (enemy.type === 'fast') {
    target = players.length && roll < 0.22 ? players[0] : baseRect && rng.chance(0.35) ? baseRect() : null;
  } else if (enemy.type === 'armor' && rng.chance(0.8)) {
    target = baseRect ? baseRect() : null;
  }
  if (target == null) {
    return rng.pick(['up', 'down', 'left', 'right']);
  }
  const tx = target.x + 16;
  const ty = target.y + 16;
  const dx = tx - ex;
  const dy = ty - ey;
  const pref = [];
  if (Math.abs(dx) > Math.abs(dy)) {
    pref.push(dx > 0 ? 'right' : 'left');
    pref.push(dy > 0 ? 'down' : 'up');
  } else {
    pref.push(dy > 0 ? 'down' : 'up');
    pref.push(dx > 0 ? 'right' : 'left');
  }
  // prefer goal headings, fall back to a random one
  const dirs = [...pref, 'up', 'down', 'left', 'right'].filter(d => !pref.includes(d));
  return rng.chance(0.85) ? rng.pick(pref) : rng.pick([...pref, ...dirs]);
}

/**
 * One BFS recon: return the first step ('up'|'down'|'left'|'right') along a
 * passable route from the enemy's centre cell to a cell beside the base.
 * Runs on the tile grid (26x26) so the cost stays tiny.
 */
export function bfsToBase(enemyCell, baseCell, map) {
  const seen = new Uint8Array(GRID * GRID);
  const prev = new Int16Array(GRID * GRID).fill(-1);
  const start = enemyCell.cy * GRID + enemyCell.cx;
  const goal = baseCell.cy * GRID + baseCell.cx;
  if (!PASSABLE(map.terrain[goal])) return null;
  const queue = [start];
  seen[start] = 1;
  const DIRS = [[0, -1, 'up'], [0, 1, 'down'], [-1, 0, 'left'], [1, 0, 'right']];
  let qi = 0;
  while (qi < queue.length) {
    const i = queue[qi++];
    if (i === goal) break;
    const x = i % GRID;
    const y = (i / GRID) | 0;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue;
      const j = ny * GRID + nx;
      if (seen[j] || !PASSABLE(map.terrain[j])) continue;
      seen[j] = 1;
      prev[j] = i;
      queue.push(j);
    }
  }
  if (!seen[goal]) {
    return null; // sealed off; fall back to reactive behaviour
  }
  // walk back to the first step after the start
  let cur = goal;
  while (prev[cur] !== -1 && prev[cur] !== start) cur = prev[cur];
  if (prev[cur] !== start) return null; // start === goal
  const x = cur % GRID;
  const y = (cur / GRID) | 0;
  const dx = x - enemyCell.cx;
  const dy = y - enemyCell.cy;
  if (dx === 1) return 'right';
  if (dx === -1) return 'left';
  if (dy === 1) return 'down';
  if (dy === -1) return 'up';
  return null;
}

/** Firing decision: much higher probability when lined up with a player or the base. */
export function enemyFireDecision(enemy, world) {
  const { players, baseRect, rng } = world;
  if (enemy.cooldown > 0) return false;
  const ex = enemy.x + TANK / 2;
  const ey = enemy.y + TANK / 2;
  let aligned = false;
  for (const p of players) {
    const px = p.x + 16, py = p.y + 16;
    if (Math.abs(px - ex) < TANK * 0.7 && ((enemy.dir === 'down' && py > ey) || (enemy.dir === 'up' && py < ey)) && Math.abs(py - ey) < 180) aligned = true;
    if (Math.abs(py - ey) < TANK * 0.7 && ((enemy.dir === 'right' && px > ex) || (enemy.dir === 'left' && px < ex)) && Math.abs(px - ex) < 180) aligned = true;
  }
  const b = baseRect();
  if (b) {
    const bx = b.x + 16, by = b.y + 16;
    if (Math.abs(bx - ex) < TANK && enemy.dir === 'down' && by > ey) aligned = true;
    if (Math.abs(by - ey) < TANK && enemy.dir === 'right' && bx > ex) aligned = true;
  }
  const baseChance = enemy.type === 'power' ? 0.02 : enemy.type === 'armor' ? 0.012 : 0.008;
  return aligned ? rng.chance(0.10) : rng.chance(baseChance);
}
// ---------------------------------------------------------------------------
// DEMO mode: the same AI drives the (single) player tank so the attract screen
// plays itself. Simple pursuit: walk the dominant axis toward the closest
// active enemy, fire when roughly lined up — and never fire toward our own
// base. Movement/facing come from a single held direction key, so facing
// equals movement direction by construction.

export function demoInput(tank, world) {
  const { enemies, baseRect, rng } = world;
  const input = { up: false, down: false, left: false, right: false, fire: false };

  if (rng && rng.chance(0.01)) {
    input[rng.pick(['up', 'down', 'left', 'right'])] = true; // occasional wander
    return input;
  }

  let target = null;
  let best = Infinity;
  for (const e of enemies) {
    if (!e.alive || e.spawning) continue;
    const d = Math.abs(e.x - tank.x) + Math.abs(e.y - tank.y);
    if (d < best) { best = d; target = e; }
  }

  if (!target) {
    // no enemies: park near the base and hold position
    const b = baseRect ? baseRect() : null;
    if (b && Math.abs((b.x + 16) - (tank.x + 16)) > 8) {
      input[(b.x + 16) > (tank.x + 16) ? 'right' : 'left'] = true;
    } else {
      input['up'] = true;
    }
    return input;
  }

  const dx = target.x - tank.x;
  const dy = target.y - tank.y;
  let dir;
  if (Math.abs(dx) < 24) dir = dy > 0 ? 'down' : 'up';
  else if (Math.abs(dy) < 24) dir = dx > 0 ? 'right' : 'left';
  else dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
  input[dir] = true;

  // fire when the chosen heading lines up with the enemy and won't hit the base
  const alignedX = Math.abs(target.x - tank.x) < 40;
  const alignedY = Math.abs(target.y - tank.y) < 40;
  const willHit = (dir === 'up' && alignedX && dy < 0) ||
    (dir === 'down' && alignedX && dy > 0) ||
    (dir === 'left' && alignedY && dx < 0) ||
    (dir === 'right' && alignedY && dx > 0);
  if (willHit) {
    const b = baseRect ? baseRect() : null;
    let safe = true;
    if (b) {
      if (dir === 'down' && alignedX && b.y > tank.y && Math.abs(b.x - tank.x) < 40) safe = false;
      if (dir === 'up' && alignedX && b.y < tank.y && Math.abs(b.x - tank.x) < 40) safe = false;
      if (dir === 'right' && alignedY && b.x > tank.x && Math.abs(b.y - tank.y) < 40) safe = false;
      if (dir === 'left' && alignedY && b.x < tank.x && Math.abs(b.y - tank.y) < 40) safe = false;
    }
    if (safe) input.fire = true;
  }
  return input;
}
