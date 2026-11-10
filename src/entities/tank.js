import { TANK, DIRS } from '../config.js';
import { moveTankRect } from '../collision.js';

export function dirFromVec(dx, dy) {
  if (dx > 0) return 'right';
  if (dx < 0) return 'left';
  if (dy > 0) return 'down';
  if (dy < 0) return 'up';
  return 'up';
}

export function dirVec(dir) {
  return DIRS[dir];
}

export function tankRect(tank) {
  return { x: tank.x, y: tank.y, w: TANK, h: TANK };
}

// Firing point: muzzle centre based on facing direction.
export function bulletSpawnPoint(tank) {
  const cx = tank.x + TANK / 2;
  const cy = tank.y + TANK / 2;
  switch (tank.dir) {
    case 'up': return { x: cx, y: cy - TANK / 2 };
    case 'down': return { x: cx, y: cy + TANK / 2 };
    case 'left': return { x: cx - TANK / 2, y: cy };
    case 'right': return { x: cx + TANK / 2, y: cy };
    default: return { x: cx, y: cy };
  }
}
