import { Game } from '../src/game.js';
import { GameMap, cellIndex } from '../src/map.js';
import { TERRAIN, GRID, FLOW, TICK_HZ } from '../src/config.js';

export { cellIndex, TERRAIN, GRID };

export function makeGame(opts = {}) {
  const g = new Game({
    mode: opts.mode || '1P',
    seed: opts.seed ?? 4241,
    ...(opts.level ? { level: opts.level } : {}),
  });
  if (opts.start !== false) g.startGame({ level: opts.level });
  if (opts.start !== false) {
    // fast-forward the stage intro so the world is interactive for tests
    const frames = Math.ceil((FLOW.stageIntroTicks / TICK_HZ) * 60) + 2;
    g.stepFrames(frames);
  }
  return g;
}

export function run(g, frames = 60) {
  for (let i = 0; i < frames; i++) g.update();
}

export function setCell(map, cx, cy, terrain) {
  const i = cellIndex(cx, cy);
  map.terrain[i] = terrain;
  map.brickQuads[i] = terrain === TERRAIN.BRICK ? 15 : 0;
}

export const placePlayer = (g, x, y) => {
  const p = g.players[0];
  p.x = x;
  p.y = y;
  p.shieldTicks = 0;
  p.cooldown = 0;
  return p;
};

/** Carve an obstacle-free rectangle (in cells, inclusive) so tests are deterministic. */
export function wipeRect(g, cx0, cy0, cx1, cy1) {
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      if (cx < 0 || cy < 0 || cx >= GRID || cy >= GRID) continue;
      const i = cellIndex(cx, cy);
      g.map.terrain[i] = TERRAIN.EMPTY;
      g.map.brickQuads[i] = 0;
    }
  }
}

export const cleanup = { note: 'helpers only' };
