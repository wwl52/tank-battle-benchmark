import { CELL, GRID, MAP_PX, TERRAIN, BULLET } from './config.js';
import { cellIndex, inBounds } from './map.js';
import { Q_TL, Q_TR, Q_BL, Q_BR } from './map.js';

export function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function rectCenter(r) {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

function cellRectsOverlapped(rect) {
  const out = [];
  const x0 = Math.max(0, Math.floor(rect.x / CELL));
  const x1 = Math.min(GRID - 1, Math.floor((rect.x + rect.w - 0.001) / CELL));
  const y0 = Math.max(0, Math.floor(rect.y / CELL));
  const y1 = Math.min(GRID - 1, Math.floor((rect.y + rect.h - 0.001) / CELL));
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) out.push(cellIndex(cx, cy));
  }
  return out;
}

/**
 * Axis-aligned tank movement with world-edge and map collision.
 * dist must be small (< CELL) so per-tick clamping is exact (no tunneling).
 * Returns { x, y, hitMap } where x/y are the settled top-left coordinates.
 */
export function moveTankRect(map, rect, dx, dy) {
  let x = rect.x;
  let y = rect.y;
  let hitMap = false;
  if (dx !== 0) {
    const sign = Math.sign(dx);
    let target = x + dx;
    target = Math.max(0, Math.min(MAP_PX - rect.w, target));
    if (target === x + dx && target !== x) {
      const probe = { x: target, y, w: rect.w, h: rect.h };
      for (const ci of cellRectsOverlapped(probe)) {
        if (map.blockedForTank(ci)) {
          const cx = ci % GRID;
          target = sign > 0 ? cx * CELL - rect.w : (cx + 1) * CELL;
          hitMap = true;
          break;
        }
      }
      // resolve against the first blocking cell column between old and new position
      if (!hitMap && target !== x + dx) {
        // crossing edge near bounds already clamped
      }
    }
    target = Math.max(0, Math.min(MAP_PX - rect.w, target));
    x = target;
  }
  if (dy !== 0) {
    const sign = Math.sign(dy);
    let target = y + dy;
    target = Math.max(0, Math.min(MAP_PX - rect.h, target));
    if (target === y + dy && target !== y) {
      const probe = { x, y: target, w: rect.w, h: rect.h };
      for (const ci of cellRectsOverlapped(probe)) {
        if (map.blockedForTank(ci)) {
          const cy = (ci / GRID) | 0;
          target = sign > 0 ? cy * CELL - rect.h : (cy + 1) * CELL;
          hitMap = true;
          break;
        }
      }
    }
    target = Math.max(0, Math.min(MAP_PX - rect.h, target));
    y = target;
  }
  return { x, y, hitMap };
}

/**
 * Bullet movement with swept sub-steps. Calls `visit` after each sub-step with the
 * bullet rect so the game can also test bullets vs tanks/base. Returns impact info
 * once a map obstacle stops the bullet.
 */
export function sweepBullet(map, bullet, dist, onSubstep) {
  let remaining = dist;
  const dir = bullet.dirVec(); // {x, y}
  while (remaining > 0) {
    const step = Math.min(BULLET.step, remaining);
    remaining -= step;
    bullet.x += dir.x * step;
    bullet.y += dir.y * step;

    // world bounds
    const half = bullet.half;
    if (bullet.x < half || bullet.x > MAP_PX - half || bullet.y < half || bullet.y > MAP_PX - half) {
      bullet.x = Math.max(half, Math.min(MAP_PX - half, bullet.x));
      bullet.y = Math.max(half, Math.min(MAP_PX - half, bullet.y));
      return { hit: 'wall', x: bullet.x, y: bullet.y };
    }
    const rect = bullet.rect();
    const cells = cellRectsOverlapped(rect);
    // optional callback lets the game test tanks per sub-step (keeps sweeps exact)
    if (onSubstep) {
      const early = onSubstep(rect, bullet);
      if (early) return early;
    }
    for (const ci of cells) {
      const t = map.blockedForBulletCell(ci) ? map.terrain[ci] : null;
      if (t === null) continue;
      if (t === TERRAIN.BASE || t === TERRAIN.BASE_WRECK) {
        return { hit: 'base', x: bullet.x, y: bullet.y, cell: ci };
      }
      if (t === TERRAIN.STEEL) {
        if (bullet.power >= BULLET.powerPlayerL3) {
          map.terrain[ci] = TERRAIN.EMPTY;
          return { hit: 'steel-broken', x: bullet.x, y: bullet.y, cell: ci };
        }
        return { hit: 'steel', x: bullet.x, y: bullet.y };
      }
      if (t === TERRAIN.BRICK) {
        const quads = map.brickQuads[ci];
        // destroy the quadrants the bullet actually overlaps (partial brick damage)
        const cx = ci % GRID, cy = (ci / GRID) | 0;
        const bx = cx * CELL, by = cy * CELL;
        const quadsRect = [
          [Q_TL, bx, by], [Q_TR, bx + CELL / 2, by],
          [Q_BL, bx, by + CELL / 2], [Q_BR, bx + CELL / 2, by + CELL / 2],
        ];
        let destroyed = 0;
        for (const [flag, qx, qy] of quadsRect) {
          if (!(quads & flag)) continue;
          const qr = { x: qx, y: qy, w: CELL / 2, h: CELL / 2 };
          if (rectsOverlap(rect, qr)) {
            map.brickQuads[ci] = quads & ~flag;
            destroyed++;
          }
        }
        if ((map.brickQuads[ci] & (Q_TL | Q_TR | Q_BL | Q_BR)) === 0) {
          map.terrain[ci] = TERRAIN.EMPTY;
        }
        return { hit: 'brick', x: bullet.x, y: bullet.y, destroyed, cell: ci };
      }
    }
  }
  return null;
}

export { TERRAIN, inBounds };
